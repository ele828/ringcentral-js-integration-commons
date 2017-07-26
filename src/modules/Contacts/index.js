import RcModule from '../../lib/RcModule';
import isBlank from '../../lib/isBlank';
import normalizeNumber from '../../lib/normalizeNumber';
import ensureExist from '../../lib/ensureExist';
import actionTypes from './actionTypes';
import getContactsReducer from './getContactsReducer';

function addPhoneToContact(contact, phone, type) {
  const phoneNumber = normalizeNumber({ phoneNumber: phone });
  if (isBlank(phoneNumber)) {
    return;
  }
  const existedPhone = contact.phoneNumbers.find(
    number => number && number.phoneNumber === phone
  );
  if (existedPhone) {
    existedPhone.phoneType = type;
  } else {
    contact.phoneNumbers.push({
      phoneNumber: phone,
      phoneType: type,
    });
  }
}

const DEFAULT_TTL = 30 * 60 * 1000;
export default class Contacts extends RcModule {
  constructor({
    client,
    addressBook,
    accountExtension,
    accountPhoneNumber,
    ttl = DEFAULT_TTL,
    ...options,
  }) {
    super({
      ...options,
      actionTypes,
    });
    this._addressBook = this::ensureExist(addressBook, 'addressBook');
    this._accountExtension = this::ensureExist(accountExtension, 'accountExtension');
    this._accountPhoneNumber = this::ensureExist(accountPhoneNumber, 'accountPhoneNumber');
    this._client = this::ensureExist(client, 'client');
    this._reducer = getContactsReducer(this.actionTypes);
    this._ttl = ttl;

    this.addSelector(
      'companyContacts',
      () => this._accountExtension.availableExtensions,
      () => this._accountPhoneNumber.extensionToPhoneNumberMap,
      (extensions, extensionToPhoneNumberMap) => {
        const newExtensions = [];
        extensions.forEach((extension) => {
          if (!(extension.status === 'Enabled' &&
            ['DigitalUser', 'User'].indexOf(extension.type) >= 0)) {
            return;
          }
          const contact = {
            type: 'company',
            id: extension.id,
            firstName: extension.contact && extension.contact.firstName,
            lastName: extension.contact && extension.contact.lastName,
            email: extension.contact && extension.contact.email,
            extensionNumber: extension.ext,
            hasProfileImage: extension.hasProfileImage,
            phoneNumbers: [],
          };
          if (isBlank(contact.extensionNumber)) {
            return;
          }
          const phones = extensionToPhoneNumberMap[contact.extensionNumber];
          if (phones && phones.length > 0) {
            phones.forEach((phone) => {
              addPhoneToContact(contact, phone.phoneNumber, 'directPhone');
            });
          }
          newExtensions.push(contact);
        });
        return newExtensions;
      }
    );

    this.addSelector(
      'personalContacts',
      () => this._addressBook.contacts,
      (rawContacts) => {
        const contacts = [];
        rawContacts.forEach((rawContact) => {
          const contact = {
            type: 'personal',
            phoneNumbers: [],
            ...rawContact,
          };
          Object.keys(contact).forEach((key) => {
            if (key.toLowerCase().indexOf('phone') === -1) {
              return;
            }
            if (typeof contact[key] !== 'string') {
              return;
            }
            addPhoneToContact(contact, contact[key], key);
          });
          contacts.push(contact);
        });
        return contacts;
      }
    );
  }

  initialize() {
    this.store.subscribe(() => this._onStateChange());
  }

  _onStateChange() {
    if (this._shouldInit()) {
      this.store.dispatch({
        type: this.actionTypes.initSuccess,
      });
    } else if (this._shouldReset()) {
      this._resetModuleStatus();
    }
  }

  _shouldInit() {
    return (
      this._addressBook.ready &&
      this._accountExtension.ready &&
      this._accountPhoneNumber.ready &&
      this.pending
    );
  }

  _shouldReset() {
    return (
      (
        !this._addressBook.ready ||
        !this._accountExtension.ready ||
        !this._accountPhoneNumber.ready
      ) &&
      this.ready
    );
  }

  _resetModuleStatus() {
    this.store.dispatch({
      type: this.actionTypes.resetSuccess,
    });
  }

  matchPhoneNumber(phone) {
    const result = [];
    const phoneNumber = normalizeNumber({ phoneNumber: phone });
    const matchContact = (contact) => {
      let found = contact.extensionNumber && contact.extensionNumber === phoneNumber;
      if (!found) {
        contact.phoneNumbers.forEach((contactPhoneNumber) => {
          if (!found && contactPhoneNumber.phoneNumber === phoneNumber) {
            found = true;
          }
        });
      }
      if (!found) {
        return;
      }
      const name =
        `${
          contact.firstName ? contact.firstName : ''
        } ${
          contact.lastName ? contact.lastName : ''
        }`;
      const matchedContact = {
        ...contact,
        phoneNumbers: [
          ...contact.phoneNumbers
        ],
        entityType: 'contact',
        name,
      };
      if (contact.extensionNumber) {
        matchedContact.phoneNumbers.push({
          phoneType: 'extension',
          phoneNumber: contact.extensionNumber,
        });
      }
      result.push(matchedContact);
    };
    this.companyContacts.forEach(matchContact);
    this.personalContacts.forEach(matchContact);
    return result;
  }

  matchContacts({ phoneNumbers }) {
    const result = {};
    phoneNumbers.forEach((phoneNumber) => {
      result[phoneNumber] = this.matchPhoneNumber(phoneNumber);
    });
    return result;
  }

  async getImageProfile(contact) {
    if (contact.type === 'company' && contact.id && contact.hasProfileImage) {
      const imageId = `${contact.type}${contact.id}`;
      if (
        this.profileImages[imageId] &&
        (Date.now() - this.profileImages[imageId].timestamp < this._ttl)
      ) {
        return this.profileImages[imageId].url;
      }
      try {
        const response = await this._client.account().extension(contact.id).profileImage().get();
        const imageUrl = URL.createObjectURL(await response._response.blob());
        const image = {
          id: imageId,
          url: imageUrl,
        };
        this.store.dispatch({
          type: this.actionTypes.fetchImageSuccess,
          image,
        });
        return image.url;
      } catch (e) {
        console.error(e);
        return null;
      }
    }
    return null;
  }

  get status() {
    return this.state.status;
  }

  get companyContacts() {
    return this._selectors.companyContacts();
  }

  get personalContacts() {
    return this._selectors.personalContacts();
  }

  get profileImages() {
    return this.state.profileImages;
  }
}
