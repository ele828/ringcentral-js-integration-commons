import { Module } from '../../lib/di';
import Presence from '../Presence';
import moduleStatuses from '../../enums/moduleStatuses';
import { getLastNotDisturbDndStatusReducer } from '../Presence/getPresenceReducer';
import actionTypes from './actionTypes';
import getDetailedPresenceReducer from './getDetailedPresenceReducer';
import subscriptionFilters from '../../enums/subscriptionFilters';
import {
  isEnded,
  removeInboundRingOutLegs,
} from '../../lib/callLogHelpers';

const presenceRegExp = /.*\/presence\?detailedTelephonyState=true&sipData=true/;

/**
 * @class
 * @description Presence detail info managing module
 */
@Module({
  deps: [
    'Auth',
    'Client',
    'Storage',
    'Subscription',
    'RolesAndPermissions',
    'ConnectivityMonitor'
  ]
})
export default class DetailedPresence extends Presence {
  /**
   * @constructor
   * @param {Object} params - params object
   * @param {Auth} params.auth - auth module instance
   * @param {Client} params.client - client module instance
   * @param {Subscription} params.subscription - subscription module instance
   * @param {ConnectivityMonitor} params.connectivityMonitor - connectivityMonitor module instance
   */
  constructor({
    auth,
    client,
    subscription,
    connectivityMonitor,
    rolesAndPermissions,
    storage,
    ...options
  }) {
    super({
      ...options,
      actionTypes,
    });
    this._auth = auth;
    this._client = client;
    this._storage = storage;
    this._subscription = subscription;
    this._connectivityMonitor = connectivityMonitor;
    this._rolesAndPermissions = rolesAndPermissions;
    this._lastNotDisturbDndStatusStorageKey = 'lastNotDisturbDndStatusDetailPresence';
    if (this._storage) {
      this._reducer = getDetailedPresenceReducer(this.actionTypes);
      this._storage.registerReducer({
        key: this._lastNotDisturbDndStatusStorageKey,
        reducer: getLastNotDisturbDndStatusReducer(this.actionTypes)
      });
    } else {
      this._reducer = getDetailedPresenceReducer(this.actionTypes, {
        lastNotDisturbDndStatus: getLastNotDisturbDndStatusReducer(this.actionTypes),
      });
    }
    this._lastMessage = null;
    this.addSelector('sessionIdList',
      () => this.state.calls,
      calls => calls.map(call => call.sessionId),
    );

    this.addSelector('calls',
      () => this.state.data,
      data => (
        removeInboundRingOutLegs(data)
          .filter(call => !isEnded(call))
      ),
    );
    this._lastMessage = null;
    this._lastTelephonyStatus = null;
    this._lastSequence = 0;
  }

  _subscriptionHandler = (message) => {
    if (presenceRegExp.test(message.event) && message.body) {
      if (message.body.sequence) {
        if (message.body.sequence <= this._lastSequence) {
          return;
        }
        this._lastSequence = message.body.sequence;
      }
      const {
        activeCalls,
        dndStatus,
        telephonyStatus,
        presenceStatus,
        userStatus,
      } = message.body;
      this.store.dispatch({
        type: this.actionTypes.notification,
        activeCalls,
        dndStatus,
        telephonyStatus,
        presenceStatus,
        userStatus,
        message: message.body.message,
        lastDndStatus: this.dndStatus,
        timestamp: Date.now(),
      });
    }
  }
  _onStateChange = async () => {
    if (
      this._auth.loggedIn &&
      this._subscription.ready &&
      this._rolesAndPermissions.ready &&
      (!this._connectivityMonitor || this._connectivityMonitor.ready) &&
      this.status === moduleStatuses.pending
    ) {
      this.store.dispatch({
        type: this.actionTypes.init,
      });
      if (this._connectivityMonitor) {
        this._connectivity = this._connectivityMonitor.connectivity;
      }
      if (this._rolesAndPermissions.hasPresencePermission) {
        await this.fetch();
        this._subscription.subscribe(subscriptionFilters.detailedPresenceWithSip);
      }
      this.store.dispatch({
        type: this.actionTypes.initSuccess,
      });
    } else if (
      (
        !this._auth.loggedIn ||
        !this._subscription.ready ||
        (this._connectivityMonitor && !this._connectivityMonitor.ready)
      ) &&
      this.ready
    ) {
      this.store.dispatch({
        type: this.actionTypes.reset,
      });
      this._lastTelephonyStatus = null;
      this._lastSequence = 0;
      this._lastMessage = null;
      this.store.dispatch({
        type: this.actionTypes.resetSuccess,
      });
    } else if (
      this.ready &&
      this._subscription.ready &&
      this._subscription.message &&
      this._subscription.message !== this._lastMessage
    ) {
      this._lastMessage = this._subscription.message;
      this._subscriptionHandler(this._lastMessage);
    } else if (
      this.ready &&
      this._connectivityMonitor &&
      this._connectivityMonitor.ready &&
      this._connectivity !== this._connectivityMonitor.connectivity
    ) {
      this._connectivity = this._connectivityMonitor.connectivity;
      // fetch data on regain connectivity
      if (this._connectivity) {
        if (this._rolesAndPermissions.hasPresencePermission) {
          this._fetch();
        }
      }
    }
  }

  initialize() {
    this.store.subscribe(this._onStateChange);
  }

  get data() {
    return this.state.data;
  }
  get calls() {
    return this._selectors.calls();
  }

  get telephonyStatus() {
    return this.state.telephonyStatus;
  }

  get sessionIdList() {
    return this._selectors.sessionIdList();
  }
  async _fetch() {
    this.store.dispatch({
      type: this.actionTypes.fetch,
    });
    const { ownerId } = this._auth;
    try {
      const {
        activeCalls,
        dndStatus,
        telephonyStatus,
        presenceStatus,
        userStatus,
        message,
      } = (await this._client.service.platform()
        .get(subscriptionFilters.detailedPresenceWithSip)).json();
      if (this._auth.ownerId === ownerId) {
        this.store.dispatch({
          type: this.actionTypes.fetchSuccess,
          activeCalls,
          dndStatus,
          telephonyStatus,
          presenceStatus,
          userStatus,
          message,
          timestamp: Date.now(),
        });
        this._promise = null;
      }
    } catch (error) {
      if (this._auth.ownerId === ownerId) {
        this.store.dispatch({
          type: this.actionTypes.fetchError,
          error,
        });
        this._promise = null;
      }
    }
  }
}
