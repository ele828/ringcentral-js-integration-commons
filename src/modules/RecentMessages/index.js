import RcModule from '../../lib/RcModule';

/**
 * Retrieve all recent messages related to a specified contact.jjjj
 */
export default class RecentMessages extends RcModule {
  constructor({
    contacts,
    messages,
    ...options
  }) {
    super(...options);
    this._contacts = contacts;
    this._messages = messages;
   
    this.addSelector('recentMessages',
      () => this._contacts.personalContacts,
      () => this._contacts.companyContacts,
      () => this._messages.allConversations,
      (personalContacts, companyContacts, allConversations) => {
        return [...personalContacts, ...companyContacts];
      }
    );
  }

  initialize() {
    this.store.subscribe(() => this._onStateChange());
  }

  _onStateChange() {
    console.log('recent message get state change');
  }

  getRecentMessages() {
    
  }

  /**
   * Searching for recent messages of specific contact by given phone numbers.
   * @param {String} phoneNumber
   * @param {Number} daySpan Find messages within certain days
   * @param {Number} maxLength Maximum length of recent messages
   * @return {Array}
   */
  _findRecentMessages(phoneNumber, daySpan = 60, maxLength = 5) {
    const allConversations = this._messages.allConversations;
    const contacts = this._contacts.matchPhoneNumber(phoneNumber);
    console.log('Contact found:', contacts);
    // TODO: Too many contacts found, will it happen in this case?
    if (contacts.length !== 1) return [];
    
    // Get all messages related to this contacts
    const phoneNumbers = contacts[0].phoneNumbers;
    console.log('phoneNumbers', phoneNumbers)
    const recentMessages = allConversations.filter(conversation => {
      const matches = phoneNumbers.find(({ phoneNumber }) => (
          phoneNumber === conversation.from.phoneNumber ||
          !!conversation.to.find(to => to.phoneNumber === phoneNumber)
      ));

      // Check if message is within certain days
      if (!!matches) {
        const currentTime = new Date();
        const daySpanTime = currentTime.setDate(currentTime.getDate() - daySpan);
        if (new Date(conversation.lastModifiedTime) > daySpanTime) return true;
      }
      return false;
    }); 

    // Sort by time in descending order
    recentMessages.sort((a, b) => new Date(b.lastModifiedTime) - new Date(a.lastModifiedTime));
    if (recentMessages.length > maxLength) return recentMessages.slice(0, maxLength);
    return recentMessages;
  }
}