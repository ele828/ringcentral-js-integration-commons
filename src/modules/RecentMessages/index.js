import RcModule from '../../lib/RcModule';
import actionTypes from './actionTypes';
import getRecentMessagesReducer from './getRecentMessagesReducer';
import getDateFrom from '../../lib/getDateFrom';

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
      name: 'recentMessages',
      actionTypes,
      ...options
    });
    this._client = client;
    this._messageStore = messageStore;
    this._reducer = getRecentMessagesReducer(this.actionTypes);

    this.messages = null;
    this.unreadMessageCounts = 0;
  }

  initialize() {
    this.store.subscribe(() => this._onStateChange());
  }

  async _onStateChange() {
    if (this.pending && this._messageStore.ready) {
      this.store.dispatch({
        type: this.actionTypes.initSuccess,
      });
    }
  }

  async getMessages(currentContact) {
    if (!currentContact) {
      this.messages = [];
      this.unreadMessageCounts = 0;
      this.store.dispatch({
        type: this.actionTypes.messagesLoaded
      });
      return;
    }
    this.messages = await this._getRecentMessages(
      currentContact,
      this._messageStore.messages
    );
    this.unreadMessageCounts = this._countUnreadMessages(this.messages);
    this.store.dispatch({
      type: this.actionTypes.messagesLoaded
    });
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

    // Get all messages related to this contacts
    const phoneNumbers = currentContact.phoneNumbers;
    const recentMessages = messages.filter((message) => {
      const matches = phoneNumbers.find(({ phoneNumber, extensionNumber }) => (
        (
          phoneNumber && (
          phoneNumber === message.from.phoneNumber ||
          !!message.to.find(to => to.phoneNumber === phoneNumber)
        )) ||
        (
          extensionNumber && (
          extensionNumber === message.from.extensionNumber ||
          !!message.to.find(to => to.extensionNumber === extensionNumber)
        ))
      ));

      // Check if message is within certain days
      if (!!matches && new Date(message.lastModifiedTime) > dateFrom) {
        return true;
      }
      return false;
    });

    let localRecentMessages = this._sortMessages(recentMessages);

    // If we could not find enough recent messages,
    // we need to search for messages on server.
    if (recentMessages.length < length) {
      const dateTo = localRecentMessages.length > 0
        ? localRecentMessages[localRecentMessages.length - 1].lastModifiedTime
        : undefined;

      // This will always be sorted
      localRecentMessages = localRecentMessages.concat(
        await this._fetchRecentMessagesFromServer(
          currentContact,
          dateFrom.toISOString(),
          dateTo,
          length
        )
      );
    }

    localRecentMessages = this._dedup(localRecentMessages);
    return localRecentMessages.length > length
      ? localRecentMessages.slice(0, length)
      : localRecentMessages;
  }

  /**
   * Fetch recent messages from server by given current contact.
   * It will iterate through all phoneNumbers of this contact and
   * get specific number of latest messsages.
   * @param {Object} currentContact
   * @param {String} dateFrom
   * @param {String} dateTo
   * @param {Number} length The number of messages
   * @return {Array}
   */
  _fetchRecentMessagesFromServer(
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
    const recentMessagesPromise = phoneNumbers.reduce((acc, { phoneNumber, extensionNumber }) => {
      if (phoneNumber) {
        const promise = this._fetchMessageList(
          Object.assign(params, {
            phoneNumber
          })
        );
        return acc.concat(promise);
      }
      if (extensionNumber) {
        // Show messages of extensions
        let promise = this._fetchMessageList(
          Object.assign(params, {
            messageType: 'Pager'
          })
        );
        // Need to filter by extension numbers
        promise = promise.then(messages => (
          messages.filter(message => (
            extensionNumber === message.from.extensionNumber ||
            !!message.to.find(to => to.extensionNumber === extensionNumber)
          ))
        ));
        return acc.concat(promise);
      }
      return acc;
    }, []);

    // TODO: Because we need to navigate to the message page,
    // So we may need to push new messages to messageStore
    return Promise.all(recentMessagesPromise)
      .then(this._flattenToMessageRecords)
      .then(this._markAsRemoteMessage)
      .then(messages => this._sortMessages(messages));
  }

  _fetchMessageList(params) {
    return this._client.account().extension().messageStore().list(params);
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
