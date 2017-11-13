import RcModule from '../../lib/RcModule';
import { Module } from '../../lib/di';
import actionTypes from './actionTypes';
import getContactDetailsReducer from './getContactDetailsReducer';

@Module({
  deps: [
    'Contacts',
    { dep: 'ContactDetailsOptions', optional: true }
  ]
})
export default class ContactDetails extends RcModule {
  constructor({ contacts, ...options }) {
    super({ ...options, actionTypes });

    this._contacts = contacts;
    this._reducer = getContactDetailsReducer(this.actionTypes);

    this.addSelector(
      'currentContact',
      () => this._contacts,
      () => this.condition,
      () => this._contacts.allContacts,
      (contactsModule, condition) => {
        if (condition) { return contactsModule.find(condition); }
        return null;
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
      this.store.dispatch({
        type: this.actionTypes.resetSuccess,
      });
    }
  }

  _shouldInit() {
    return (
      this._contacts.ready &&
      this.pending
    );
  }

  _shouldReset() {
    return (
      !this._contacts.ready &&
      this.ready
    );
  }

  /**
   * Find contact from all contacts by given conditions.
   * Stores search conditions to reducers.
   */
  find({ id, type }) {
    this.store.dispatch({
      type: this.actionTypes.updateCondition,
      condition: {
        id,
        type
      }
    });
  }

  get contact() {
    return this._selectors.currentContact();
  }

  get condition() {
    return this.state.condition;
  }

  get status() {
    return this.state.status;
  }
}
