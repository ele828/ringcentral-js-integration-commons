import { Module } from '../../lib/di';
import Pollable from '../../lib/Pollable';
import moduleStatuses from '../../enums/moduleStatuses';

import { batchPutApi } from '../../lib/batchApiHelper';

import * as messageHelper from '../../lib/messageHelper';
import * as messageStoreHelper from './messageStoreHelper';

import actionTypes from './actionTypes';
import getMessageStoreReducer from './getMessageStoreReducer';
import getDataReducer from './getDataReducer';
import sleep from '../../lib/sleep';
import proxify from '../../lib/proxy/proxify';

export function processResponseData(data) {
  const records = data.records.slice();
  return {
    records: records.reverse(),
    syncTimestamp: (new Date(data.syncInfo.syncTime)).getTime(),
    syncToken: data.syncInfo.syncToken,
  };
}
const DEFAULT_TTL = 30 * 60 * 1000;
const DEFAULT_TIME_TO_RETRY = 62 * 1000;
const DEFAULT_DAY_SPAN = 7;

/**
 * @class
 * @description Messages data manageing module
 */
@Module({
  deps: [
    'Alert', 'Client', 'Auth', 'Storage', 'Subscription', 'ConnectivityMonitor',
    { dep: 'MessageStoreOptions', optional: true }
  ]
})
export default class MessageStore extends Pollable {
  /**
   * @constructor
   * @param {Object} params - params object
   * @param {Alert} params.alert - alert module instance
   * @param {Auth} params.auth - auth module instance
   * @param {Client} params.client - client module instance
   * @param {Storage} params.storage - storage module instance
   * @param {subscription} params.subscription - subscription module instance
   * @param {connectivityMonitor} params.connectivityMonitor - connectivityMonitor module instance
   * @param {Number} params.ttl - local cache timestamp
   * @param {Number} params.timeToRetry - waiting time to retry
   * @param {Number} params.daySpan - day span of call log
   * @param {Bool} params.polling - polling flag, default false
   */
  constructor({
    alert,
    client,
    auth,
    ttl = DEFAULT_TTL,
    timeToRetry = DEFAULT_TIME_TO_RETRY,
    daySpan = DEFAULT_DAY_SPAN,
    storage,
    subscription,
    connectivityMonitor,
    polling = false,
    ...options
  }) {
    super({
      ...options,
      actionTypes,
    });
    this._alert = alert;
    this._client = client;
    this._storage = storage;
    this._subscription = subscription;
    this._connectivityMonitor = connectivityMonitor;
    this._reducer = getMessageStoreReducer(this.actionTypes);
    this._ttl = ttl;
    this._timeToRetry = timeToRetry;
    this._daySpan = daySpan;
    this._auth = auth;
    this._promise = null;
    this._lastSubscriptionMessage = null;
    this._storageKey = 'messageStore';
    this._polling = polling;

    this._storage.registerReducer({
      key: this._storageKey,
      reducer: getDataReducer(this.actionTypes),
    });

    this.addSelector(
      'unreadCounts',
      () => this.allConversations,
      (conversations) => {
        let unreadCounts = 0;
        conversations.forEach((conversation) => {
          if (messageHelper.messageIsTextMessage(conversation)) {
            unreadCounts += conversation.unreadCounts;
          }
        });
        return unreadCounts;
      }
    );

    this.addSelector(
      'textConversations',
      () => this.allConversations,
      conversations =>
        conversations.filter(
          conversation => messageHelper.messageIsTextMessage(conversation)
        )
    );

    this.addSelector(
      'faxMessages',
      () => this.allConversations,
      conversations =>
        conversations.filter(
          conversation => messageHelper.messageIsFax(conversation)
        )
    );

    this.addSelector(
      'voicemailMessages',
      () => this.allConversations,
      conversations =>
        conversations.filter(
          conversation => messageHelper.messageIsVoicemail(conversation)
        )
    );
  }

  initialize() {
    this.store.subscribe(() => this._onStateChange());
  }

  _onStateChange() {
    if (this._shouldInit()) {
      this.store.dispatch({
        type: this.actionTypes.init,
      });
      if (this._shouleCleanCache()) {
        this._cleanUpCache();
      }
      if (this._connectivityMonitor) {
        this._connectivity = this._connectivityMonitor.connectivity;
      }
      this._initMessageStore();
    } else if (this._shouldReset()) {
      this._resetModuleStatus();
    } else if (
      this.ready
    ) {
      this._subscriptionHandler();
      this._checkConnectivity();
    }
  }

  _shouldInit() {
    return (
      this._storage.ready &&
      this._subscription.ready &&
      (!this._connectivityMonitor || this._connectivityMonitor.ready) &&
      this.pending
    );
  }

  _shouldReset() {
    return (
      (
        !this._storage.ready ||
        !this._subscription.ready ||
        (!!this._connectivityMonitor && !this._connectivityMonitor.ready)
      ) &&
      this.ready
    );
  }

  _shouleCleanCache() {
    return (
      this._auth.isFreshLogin ||
      (Date.now() - this.updatedTimestamp) > this.ttl
    );
  }

  _resetModuleStatus() {
    this.store.dispatch({
      type: this.actionTypes.resetSuccess,
    });
  }

  _cleanUpCache() {
    this.store.dispatch({
      type: this.actionTypes.cleanUp,
    });
  }

  findConversationById(id) {
    return this.conversationMap[id.toString()];
  }

  async _initMessageStore() {
    try {
      await this._syncMessages();
      this._subscription.subscribe('/account/~/extension/~/message-store');
    } catch (e) {
      console.error(e);
    }
    this.store.dispatch({
      type: this.actionTypes.initSuccess,
    });
  }

  _subscriptionHandler() {
    const accountExtesionEndPoint = /\/message-store$/;
    const message = this._subscription.message;
    if (
      message &&
      message !== this._lastSubscriptionMessage &&
      accountExtesionEndPoint.test(message.event) &&
      message.body &&
      message.body.changes
    ) {
      this._lastSubscriptionMessage = this._subscription.message;
      this._syncMessages();
    }
  }

  _checkConnectivity() {
    if (
      this._connectivityMonitor &&
      this._connectivityMonitor.ready &&
      this._connectivity !== this._connectivityMonitor.connectivity
    ) {
      this._connectivity = this._connectivityMonitor.connectivity;
      if (this._connectivity) {
        this._syncMessages();
      }
    }
  }

  async _messageSyncApi(params) {
    const response = await this._client
      .account()
      .extension()
      .messageSync()
      .list(params);
    return response;
  }
  async _recursiveFSync({
    dateFrom,
    dateTo = null,
    syncToken,
    recordsLength = 0,
  }) {
    const MAX_MSG_LENGTH = 500;
    const params = messageStoreHelper.getMessageSyncParams({
      dateFrom,
      dateTo,
      syncToken,
      daySpan: this._daySpan,
    });
    const response = await this._messageSyncApi(params);
    const records = response.records;
    recordsLength += records.length;
    if (recordsLength > MAX_MSG_LENGTH || !response.syncInfo.olderRecordsExist) {
      return {
        records,
        syncInfo: response.syncInfo
      };
    }
    await sleep(1000);
    const _dateTo = new Date(response.records[response.records.length - 1].creationTime);
    const lastResponse = await this._recursiveFSync({
      dateFrom,
      dateTo: _dateTo,
      syncToken,
      recordsLength,
    });
    return {
      records: records.concat(lastResponse.records),
      syncInfo: response.syncInfo
    };
  }
  async _updateMessagesFromSync() {
    let response;
    this.store.dispatch({
      type: this.actionTypes.sync,
    });
    try {
      const oldSyncToken = this.syncToken;
      const params = messageStoreHelper.getMessageSyncParams({
        syncToken: oldSyncToken,
        daySpan: this._daySpan,
      });
      if (!oldSyncToken) {
        response = await this._recursiveFSync({
          ...params,
        });
      } else {
        response = await this._messageSyncApi(params);
      }
      const {
        records,
        syncTimestamp,
        syncToken,
      } = processResponseData(response);
      this.store.dispatch({
        type: this.actionTypes.syncSuccess,
        records,
        syncTimestamp,
        syncToken,
      });
      if (this._polling) {
        this._startPolling();
      }
    } catch (error) {
      if (this._polling) {
        this._startPolling(this.timeToRetry);
      } else {
        this._retry();
      }
      throw error;
    }
  }

  async _updateConversationFromSync(conversationId) {
    let response;
    const conversation = this.conversationMap[conversationId.toString()];
    if (!conversation) {
      return;
    }
    this.store.dispatch({
      type: this.actionTypes.sync,
    });
    const oldSyncToken = conversation.syncToken;
    const params = messageStoreHelper.getMessageSyncParams({
      syncToken: oldSyncToken,
      conversationId: conversation.id,
      daySpan: this._daySpan,
    });
    if (!oldSyncToken) {
      response = await this._recursiveFSync({
        ...params,
      });
    } else {
      response = await this._messageSyncApi(params);
    }
    const {
      records,
      syncTimestamp,
      syncToken,
    } = processResponseData(response);
    this.store.dispatch({
      type: this.actionTypes.syncConversationSuccess,
      records,
      syncTimestamp,
      syncToken,
      syncConversationId: conversation.id,
    });
  }

  async _syncMessages() {
    await this._sync(async () => {
      await this._updateMessagesFromSync();
    });
  }

  @proxify
  async fetchData() {
    await this._syncMessages();
  }

  @proxify
  async syncConversation(id) {
    await this._sync(async () => {
      await this._updateConversationFromSync(id);
    });
  }

  async _sync(syncFunction) {
    if (!this._promise) {
      this._promise = (async () => {
        try {
          await syncFunction();
          this._promise = null;
        } catch (error) {
          this._onSyncError();
          this._promise = null;
          throw error;
        }
      })();
    }
    await this._promise;
  }

  _onSyncError() {
    this.store.dispatch({
      type: this.actionTypes.syncError,
    });
  }

  async _updateMessageApi(messageId, status) {
    const body = {
      readStatus: status,
    };
    const updateRequest = await this._client.account()
      .extension()
      .messageStore(messageId)
      .put(body);
    return updateRequest;
  }

  async _batchUpdateMessagesApi(messageIds, body) {
    const ids = decodeURIComponent(messageIds.join(','));
    const platform = this._client.service.platform();
    const responses = await batchPutApi({
      platform,
      url: `/account/~/extension/~/message-store/${ids}`,
      body,
    });
    return responses;
  }

  async _updateMessagesApi(messageIds, status) {
    if (messageIds.length === 1) {
      const result = await this._updateMessageApi(messageIds[0], status);
      return [result];
    }
    const UPDATE_MESSAGE_ONCE_COUNT = 20;
    const leftIds = messageIds.slice(0, UPDATE_MESSAGE_ONCE_COUNT);
    const rightIds = messageIds.slice(UPDATE_MESSAGE_ONCE_COUNT);
    const body = leftIds.map(() => (
      { body: { readStatus: status } }
    ));
    const responses = await this._batchUpdateMessagesApi(leftIds, body);
    const results = [];
    responses.forEach((res) => {
      if (res.response().status === 200) {
        results.push(res.json());
      }
    });
    if (rightIds.length > 0) {
      const rightResults = await this._updateMessagesApi(rightIds, status);
      if (rightResults.length > 0) {
        results.concat(rightResults);
      }
    }
    return results;
  }

  @proxify
  async readMessages(conversationId) {
    const conversation = this.conversationMap[conversationId];
    if (!conversation) {
      return null;
    }
    const unreadMessageIds = Object.keys(conversation.unreadMessages);
    if (unreadMessageIds.length === 0) {
      return null;
    }
    try {
      const updatedMessages = await this._updateMessagesApi(unreadMessageIds, 'Read');
      this.store.dispatch({
        type: this.actionTypes.updateMessages,
        records: updatedMessages,
      });
    } catch (error) {
      console.error(error);
    }
    return null;
  }

  searchMessagesText(searchText) {
    return this.messages.filter((message) => {
      if (
        message.subject &&
        message.subject.toLowerCase().indexOf(searchText) >= 0
      ) {
        return true;
      }
      return false;
    });
  }

  @proxify
  async updateConversationRecipientList(conversationId, recipients) {
    this.store.dispatch({
      type: this.actionTypes.updateConversationRecipients,
      conversationId,
      recipients,
    });
  }

  @proxify
  async pushMessages(records) {
    this.store.dispatch({
      type: this.actionTypes.updateMessages,
      records,
    });
  }

  pushMessage(record) {
    this.pushMessages([record]);
  }

  get cache() {
    return this._storage.getItem(this._storageKey);
  }

  get messages() {
    return this.cache.data.messages;
  }

  get allConversations() {
    return (this.cache && this.cache.data.conversations) || [];
  }

  get voicemailMessages() {
    return this._selectors.voicemailMessages();
  }

  get faxMessages() {
    return this._selectors.faxMessages();
  }

  get conversations() {
    return this._selectors.textConversations();
  }

  get conversationMap() {
    return this.cache.data.conversationMap;
  }

  get updatedTimestamp() {
    return this.cache.updatedTimestamp;
  }

  get syncTimestamp() {
    return this.cache.data.syncTimestamp;
  }

  get syncToken() {
    return this.cache.syncToken;
  }

  get status() {
    return this.state.status;
  }

  get unreadCounts() {
    return this._selectors.unreadCounts();
  }

  get messageStoreStatus() {
    return this.state.messageStoreStatus;
  }

  get ready() {
    return this.status === moduleStatuses.ready;
  }

  get pending() {
    return this.status === moduleStatuses.pending;
  }

  get ttl() {
    return this._ttl;
  }

  get timeToRetry() {
    return this._timeToRetry;
  }

  get timestamp() {
    return this.syncTimestamp;
  }
}
