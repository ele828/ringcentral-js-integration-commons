import proxify from '../../lib/proxy/proxify';
import ensureExist from '../../lib/ensureExist';
import RcModule from '../../lib/RcModule';
import actionTypes from './actionTypes';
import messageStatus from './messageStatus';
import getRecentMessagesReducer from './getRecentMessagesReducer';
import getDateFrom from '../../lib/getDateFrom';
import concurrentExecute from '../../lib/concurrentExecute';

/**
 * Retrieve all recent messages related to a specified contact.
 */
export default class RecentMessages extends RcModule {
  constructor({
    client,
    messageStore,
    ...options
  }) {
    super({
      actionTypes,
      ...options
    });
    this._client = this::ensureExist(client, 'client');
    this._messageStore = this::ensureExist(messageStore, 'messageStore');
    this._reducer = getRecentMessagesReducer(this.actionTypes);

    this.addSelector(
      'unreadMessageCounts',
      () => this.messages,
      messages => messages.reduce((acc, cur) => acc + (cur.readStatus !== 'Read' ? 1 : 0), 0)
    );

    this._currentContact = null;
    this._prevMessageStoreTimestamp = null;
  }

  initialize() {
    this.store.subscribe(() => this._onStateChange());
  }

  _onStateChange() {
    if (
      this.pending &&
      this._messageStore.ready
    ) {
      this.store.dispatch({
        type: this.actionTypes.initSuccess,
      });
    } else if (
      this.ready &&
      !this._messageStore.ready
    ) {
      this.store.dispatch({
        type: this.actionTypes.resetSuccess
      });
    } else if (this._currentContact !== null) {
      // Listen to messageStore state changes
      if (this._messageStore.updatedTimestamp !== this._prevMessageStoreTimestamp) {
        this._prevMessageStoreTimestamp = this._messageStore.updatedTimestamp;
        this.getMessages(this._currentContact, true);
      }
    }
  }

  get messages() {
    return this.state.messages;
  }

  get unreadMessageCounts() {
    return this._selectors.unreadMessageCounts();
  }

  get isMessagesLoaded() {
    return this.state.messageStatus === messageStatus.loaded;
  }

  @proxify
  async getMessages(currentContact, forceUpdate = false) {
    // No need to calculate recent messages of the same contact repeatly
    if (
      !forceUpdate &&
      !!currentContact &&
      currentContact === this._currentContact
    ) {
      return;
    }
    this._currentContact = currentContact;
    this._prevMessageStoreTimestamp = this._messageStore.updatedTimestamp;
    this.store.dispatch({
      type: this.actionTypes.initLoad
    });
    if (!currentContact) {
      this.store.dispatch({
        type: this.actionTypes.loadReset
      });
      return;
    }
    const messages = await this._getRecentMessages(
      currentContact,
      this._messageStore.messages
    );
    this.store.dispatch({
      type: this.actionTypes.loadSuccess,
      messages
    });
  }

  cleanUpMessages() {
    this.store.dispatch({
      type: this.actionTypes.loadReset
    });
    this._currentContact = null;
  }

  get status() {
    return this.state.status;
  }

  /**
   * Searching for recent messages of specific contact.
   * @param {Object} currentContact Current contact
   * @param {Array} messages Messages in messageStore
   * @param {Number} daySpan Find messages within certain days
   * @param {Number} length Maximum length of recent messages
   * @return {Array}
   * @private
   */
  async _getRecentMessages(currentContact, messages = [], daySpan = 60, length = 5) {
    const dateFrom = getDateFrom(daySpan);
    let recentMessages = this._getLocalRecentMessages(
      currentContact,
      messages,
      dateFrom,
      length
    );

    // If we could not find enough recent messages,
    // we need to search for messages on server.
    if (recentMessages.length < length) {
      const dateTo = recentMessages.length > 0
        ? recentMessages[recentMessages.length - 1].lastModifiedTime
        : undefined;

      // This will always be sorted
      recentMessages = recentMessages.concat(
        await this._fetchRemoteRecentMessages(
          currentContact,
          dateFrom.toISOString(),
          dateTo,
          length
        )
      );
    }

    recentMessages = this._dedup(recentMessages);
    return recentMessages.length > length
      ? recentMessages.slice(0, length)
      : recentMessages;
  }

  /**
   * Get recent messages from messageStore.
   * @param {Object} currentContact
   * @param {Array} messages
   * @param {Date} dateFrom
   * @param {Number} length
   */
  _getLocalRecentMessages(currentContact, messages, dateFrom, length) {
    // Get all messages related to this contact
    const phoneNumbers = currentContact.phoneNumbers;
    const recentMessages = [];
    let message;
    let matches;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      message = messages[i];
      matches = phoneNumbers.find(this._filterPhoneNumber(message));

      // Check if message is within certain days
      if (!!matches && new Date(message.lastModifiedTime) > dateFrom) {
        recentMessages.push(message);
      }
      if (recentMessages.length >= length) break;
    }
    return recentMessages;
  }

  _filterPhoneNumber(message) {
    return ({ phoneNumber }) => (
      phoneNumber === message.from.phoneNumber ||
      !!message.to.find(to => to.phoneNumber === phoneNumber) ||
      phoneNumber === message.from.extensionNumber ||
      !!message.to.find(to => to.extensionNumber === phoneNumber)
    );
  }

  /**
   * Fetch recent messages from server by given current contact.
   * @param {Object} currentContact
   * @param {String} dateFrom
   * @param {String} dateTo
   * @param {Number} length The number of messages
   * @return {Array}
   */
  _fetchRemoteRecentMessages(
    currentContact,
    dateFrom,
    dateTo = (new Date()).toISOString(),
    length
  ) {
    const params = {
      dateTo,
      dateFrom,
      messageType: ['SMS', 'Text'],
      perPage: length
    };
    const phoneNumbers = currentContact.phoneNumbers;
    const recentMessagesPromise = phoneNumbers.reduce((acc, { phoneNumber }) => {
      // Cannot filter out by extensionNumber
      if (phoneNumber) {
        const promise = this._fetchMessageList(
          Object.assign({}, params, {
            phoneNumber
          })
        );
        return acc.concat(promise);
      }
      return acc;
    }, []);

    // TODO: Because we need to navigate to the message page,
    // So we may need to push new messages to messageStore
    return concurrentExecute(recentMessagesPromise, 5, 500)
      .then(this._flattenToMessageRecords)
      .then(this._markAsRemoteMessage)
      .then(messages => this._sortMessages(messages));
  }

  _fetchMessageList(params) {
    return () => this._client.account().extension().messageStore().list(params);
  }

  _countUnreadMessages(messages) {
    return messages.reduce((acc, cur) => acc + (cur.readStatus !== 'Read' ? 1 : 0), 0);
  }

  _flattenToMessageRecords(allMessages) {
    return allMessages.reduce((acc, { records }) => acc.concat(records), []);
  }

  _sortMessages(recentMessages) {
    // Sort by time in descending order
    return recentMessages.sort((a, b) =>
      new Date(b.lastModifiedTime) - new Date(a.lastModifiedTime)
    );
  }

  _markAsRemoteMessage(messages) {
    return messages.map((message) => {
      message.fromRemote = true;
      return message;
    });
  }

  _dedup(messages) {
    const hash = {};
    return messages.reduce((acc, cur) => {
      if (hash[cur.id]) return acc;
      hash[cur.id] = true;
      return acc.concat(cur);
    }, []);
  }
}
