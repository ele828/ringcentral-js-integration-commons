import RcModule from '../../lib/RcModule';
import { Module } from '../../lib/di';
import moduleStatuses from '../../enums/moduleStatuses';
import actionTypes from './actionTypes';
import getAnalyticsReducer from './getAnalyticsReducer';

import { Segment } from '../../lib/Analytics';
import callingModes from '../CallingSettings/callingModes';

/**
 * @class
 * @description Analytics module.
 */
@Module({
  deps: [
    'Auth',
    'Call',
    'Webphone',
    'Contacts',
    'MessageSender',
    { dep: 'Router', optional: true },
    { dep: 'AnalyticsAdapter', optional: true },
    { dep: 'AnalyticsOptions', optional: true }
  ]
})
export default class Analytics extends RcModule {
  constructor({
    auth,
    call,
    webphone,
    contacts,
    messageSender,
    adapter,
    router,
    analyticsKey,
    appName,
    appVersion,
    brandCode,
    ...options
  }) {
    super({
      ...options,
      actionTypes
    });
    this._auth = auth;
    this._call = call;
    this._webphone = webphone;
    this._contacts = contacts;
    this._messageSender = messageSender;
    this._adapter = adapter;
    this._router = router;
    this._analyticsKey = analyticsKey;
    this._appName = appName;
    this._appVersion = appVersion;
    this._brandCode = brandCode;
    this._reducer = getAnalyticsReducer(this.actionTypes);
    this._segment = Segment();
  }

  initialize() {
    this.store.subscribe(() => this._onStateChange());
    this._segment.load(this._analyticsKey);
  }

  identify({
    userId,
    name,
  }) {
    global.analytics.identify(userId, {
      name
    });
  }

  track(event, {
    ...properties
  }) {
    const trackProps = {
      appName: this._appName,
      appVersion: this._appVersion,
      brand: this._brandCode,
      ...properties,
    };
    global.analytics.track(event, trackProps);
  }

  trackNavigation({ router, eventPostfix }) {
    const trackProps = {
      router,
      appName: this._appName,
      appVersion: this._appVersion,
      brand: this._brandCode,
    };
    this.track(`Navigator Clicked (${eventPostfix})`, trackProps);
  }

  async _onStateChange() {
    if (this.ready) {
      this.lastActions.forEach((action) => {
        [
          '_authentication',
          '_logout',
          '_callAttempt',
          '_callConnected',
          '_webRTCRegistration',
          '_smsAttempt',
          '_smsSent',
          '_logCall',
          '_logSMS',
          '_clickToDial',
          '_clickToSMS',
          '_viewEntity',
          '_createEntity',
          '_editCallLog',
          '_editSMSLog',
          '_navigate',
          '_inboundCall',
          '_coldTransfer',
        ].forEach((key) => {
          this[key](action);
        });
      });
      if (this.lastActions.length !== 0) {
        this.store.dispatch({
          type: this.actionTypes.clear,
        });
      }
    }
  }

  _authentication(action) {
    if (this._auth && this._auth.actionTypes.loginSuccess === action.type) {
      this.identify({
        userId: this._auth.ownerId,
      });
      this.track('Authentication');
    }
  }

  _logout(action) {
    if (this._auth && this._auth.actionTypes.logout === action.type) {
      this.track('Logout');
    }
  }

  _callAttempt(action) {
    if (this._call && this._call.actionTypes.connect === action.type) {
      if (action.callSettingMode === callingModes.webphone) {
        this.track('Call Attempt WebRTC');
      } else {
        this.track('Call Attempt', {
          callSettingMode: action.callSettingMode
        });
      }
    }
  }

  _callConnected(action) {
    if (this._call && this._call.actionTypes.connectSuccess === action.type) {
      if (action.callSettingMode === callingModes.webphone) {
        this.track('Outbound WebRTC Call Connected');
      } else {
        this.track('Outbound Call Connected', {
          callSettingMode: action.callSettingMode
        });
      }
    }
  }

  _webRTCRegistration(action) {
    if (this._webphone && this._webphone.actionTypes.registered === action.type) {
      this.track('WebRTC registration');
    }
  }

  _smsAttempt(action) {
    if (this._messageSender && this._messageSender.actionTypes.send === action.type) {
      this.track('SMS Attempt');
    }
  }

  _smsSent(action) {
    if (this._messageSender && this._messageSender.actionTypes.sendOver === action.type) {
      this.track('SMS Sent');
    }
  }

  _logCall(action) {
    if (this._adapter && this._adapter.actionTypes.createCallLog === action.type) {
      this.track('Log Call');
    }
  }

  _logSMS(action) {
    if (this._adapter && this._adapter.actionTypes.createSMSLog === action.type) {
      this.track('Log SMS');
    }
  }

  _clickToDial(action) {
    if (this._adapter && this._adapter.actionTypes.clickToDial === action.type) {
      this.track('Click To Dial');
    }
  }

  _clickToSMS(action) {
    if (this._adapter && this._adapter.actionTypes.clickToSMS === action.type) {
      this.track('Click To SMS');
    }
  }

  _viewEntity(action) {
    if (this._adapter && this._adapter.actionTypes.viewEntity === action.type) {
      this.track('View Entity Details');
    }
  }

  _createEntity(action) {
    if (this._adapter && this._adapter.actionTypes.createEntity === action.type) {
      this.track('Add Entity');
    }
  }

  _editCallLog(action) {
    if (this._adapter && this._adapter.actionTypes.editCallLog === action.type) {
      this.track('Edit Call Log');
    }
  }

  _editSMSLog(action) {
    if (this._adapter && this._adapter.actionTypes.editSMSLog === action.type) {
      this.track('Edit SMS Log');
    }
  }

  _navigate(action) {
    if (this._router && this._router.actionTypes.locationChange === action.type) {
      const path = action.payload && action.payload.pathname;
      const target = this._getTrackTarget(path);
      if (target) {
        this.trackNavigation({
          ...target
        });
      }
    }
  }

  _inboundCall(action) {
    if (this._webphone && this._webphone.actionTypes.callAnswer === action.type) {
      this.track('Inbound WebRTC Call Connected');
    }
  }

  _coldTransfer(action) {
    if (this._webphone
      && this._webphone.isOnTransfer === true
      && this._webphone.actionTypes.updateSessions === action.type
    ) {
      this.track('Cold Transfer Call');
    }
  }


  _getTrackTarget(path) {
    if (path) {
      const routes = path.split('/');
      const firstRoute = routes.length > 1 ? `/${routes[1]}` : '';

      const targets = [{
        eventPostfix: 'Dialer',
        router: '/',
      }, {
        eventPostfix: 'Compose SMS',
        router: '/composeText',
      }, {
        eventPostfix: 'Messages',
        router: '/messages',
      }, {
        eventPostfix: 'Conversation',
        router: '/conversations',
      }, {
        eventPostfix: 'Call History',
        router: '/history',
      }, {
        eventPostfix: 'Settings',
        router: '/settings',
      }, {
        eventPostfix: 'Conference',
        router: '/conference',
      }, {
        eventPostfix: 'Meeting',
        router: '/meeting',
      }];
      return targets.find(target => firstRoute === target.router);
    }
    return undefined;
  }

  get analytics() {
    return global.analytics;
  }

  get lastActions() {
    return this.state.lastAction;
  }

  get status() {
    return moduleStatuses.ready;
  }

  get ready() {
    return true;
  }

  get pending() {
    return false;
  }
}
