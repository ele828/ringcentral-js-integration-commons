import RingCentralWebphone from 'ringcentral-web-phone';
import incomingAudio from 'ringcentral-web-phone/audio/incoming.ogg';
import outgoingAudio from 'ringcentral-web-phone/audio/outgoing.ogg';

import { Module } from '../../lib/di';
import RcModule from '../../lib/RcModule';
import sleep from '../../lib/sleep';
import moduleStatuses from '../../enums/moduleStatuses';
import connectionStatus from './connectionStatus';
import sessionStatus from './sessionStatus';
import recordStatus from './recordStatus';
import actionTypes from './actionTypes';
import callDirections from '../../enums/callDirections';
import webphoneErrors from './webphoneErrors';
import callErrors from '../Call/callErrors';
import ensureExist from '../../lib/ensureExist';
import proxify from '../../lib/proxy/proxify';
import {
  isBrowerSupport,
  normalizeSession,
  isRing,
  isOnHold,
  sendReceiveConfirm,
} from './webphoneHelper';
import getWebphoneReducer, { getUserMediaReducer } from './getWebphoneReducer';

const FIRST_THREE_RETRIES_DELAY = 10 * 1000;
const FOURTH_RETRIES_DELAY = 30 * 1000;
const FIFTH_RETRIES_DELAY = 60 * 1000;
const MAX_RETRIES_DELAY = 2 * 60 * 1000;

/**
 * @constructor
 * @description Web phone module to handle phone interaction with WebRTC.
 */
@Module({
  deps: [
    'Auth',
    'Alert',
    'Client',
    'Storage',
    'GlobalStorage',
    'ContactMatcher',
    'ExtensionDevice',
    'NumberValidate',
    'RolesAndPermissions',
    { dep: 'WebphoneOptions', optional: true }
  ]
})
export default class Webphone extends RcModule {
  /**
   * @constructor
   * @param {Object} params - params object
   * @param {String} params.appKey - app key
   * @param {String} params.appName - app name
   * @param {String} params.appVersion - app version
   * @param {Number} params.webphoneLogLevel - log Level
   * @param {Alert} params.alert - alert module instance
   * @param {Auth} params.auth - auth module instance
   * @param {Client} params.client - client module instance
   * @param {RolesAndPermissions} params.rolesAndPermissions - rolesAndPermissions module instance
   * @param {Storage} params.storage - storage module instance
   * @param {GlobalStorage} params.globalStorage - globalStorage module instance
   * @param {ExtensionDevice} params.extensionDevice - extensionDevice module instance
   * @param {NumberValidate} params.numberValidate - numberValidate module instance
   * @param {ContactMatcher} params.contactMatcher - contactMatcher module instance, optional
   * @param {Function} params.onCallEnd - callback on a call end
   * @param {Function} params.onCallRing - callback on a call ring
   * @param {Function} params.onCallStart - callback on a call start
   */
  constructor({
    appKey,
    appName,
    appVersion,
    alert,
    auth,
    client,
    rolesAndPermissions,
    webphoneLogLevel = 3,
    storage,
    globalStorage,
    contactMatcher,
    extensionDevice,
    numberValidate,
    onCallEnd,
    onCallRing,
    onCallStart,
    ...options
  }) {
    super({
      ...options,
      actionTypes,
    });
    this._appKey = appKey;
    this._appName = appName;
    this._appVersion = appVersion;
    this._alert = alert;
    this._webphoneLogLevel = webphoneLogLevel;
    this._auth = this::ensureExist(auth, 'auth');
    this._client = this::ensureExist(client, 'client');
    this._rolesAndPermissions = this::ensureExist(rolesAndPermissions, 'rolesAndPermissions');
    this._extensionDevice = this::ensureExist(extensionDevice, 'extensionDevice');
    this._storage = this::ensureExist(storage, 'storage');
    this._globalStorage = this::ensureExist(globalStorage, 'globalStorage');
    this._numberValidate = this::ensureExist(numberValidate, 'numberValidate');
    this._userMediaStorageKey = 'userMadia';
    this._contactMatcher = contactMatcher;
    this._onCallEndFunc = onCallEnd;
    this._onCallRingFunc = onCallRing;
    this._onCallStartFunc = onCallStart;
    this._webphone = null;
    this._remoteVideo = null;
    this._localVideo = null;

    this._sessions = new Map();

    this._reducer = getWebphoneReducer(this.actionTypes);

    globalStorage.registerReducer({
      key: this._userMediaStorageKey,
      reducer: getUserMediaReducer(this.actionTypes),
    });

    this.addSelector('sessionPhoneNumbers',
      () => this.sessions,
      (sessions) => {
        const outputs = [];
        sessions.forEach((session) => {
          outputs.push(session.to);
          outputs.push(session.from);
        });
        return outputs;
      }
    );

    this.addSelector('ringSession',
      () => this.ringSessionId,
      () => this.sessions,
      (ringSessionId, sessions) => {
        if (!ringSessionId) {
          return null;
        }
        const ringSession = sessions.find(
          session => session.id === ringSessionId
        );
        return ringSession;
      }
    );

    this.addSelector('activeSession',
      () => this.activeSessionId,
      () => this.sessions,
      (activeSessionId, sessions) => {
        if (!activeSessionId) {
          return null;
        }
        const activeSession = sessions.find(
          session => session.id === activeSessionId
        );
        return activeSession;
      }
    );

    this.addSelector('ringSessions',
      () => this.sessions,
      sessions => sessions.filter(session => isRing(session))
    );

    this.addSelector('onHoldSessions',
      () => this.sessions,
      sessions => sessions.filter(session => isOnHold(session))
    );

    if (this._contactMatcher) {
      this._contactMatcher.addQuerySource({
        getQueriesFn: this._selectors.sessionPhoneNumbers,
        readyCheckFn: () => (
          this.ready
        ),
      });
    }

    this._isFirstRegister = true;
  }

  _prepareVideoElement() {
    this._remoteVideo = document.createElement('video');
    this._remoteVideo.setAttribute('hidden', 'hidden');
    this._localVideo = document.createElement('video');
    this._localVideo.setAttribute('hidden', 'hidden');
    this._localVideo.setAttribute('muted', 'muted');
    document.body.appendChild(this._remoteVideo);
    document.body.appendChild(this._localVideo);

    this.store.dispatch({
      type: this.actionTypes.videoElementPrepared,
    });
  }

  initialize() {
    if (
      typeof window !== 'undefined' &&
      typeof document !== 'undefined'
    ) {
      if (document.readyState === 'loading') {
        window.addEventListener('load', () => {
          this._prepareVideoElement();
        });
      } else {
        this._prepareVideoElement();
      }
      window.addEventListener('unload', () => {
        this._disconnect();
      });
    }
    this.store.subscribe(() => this._onStateChange());
  }

  initializeProxy() {
    if (
      !this.userMedia
    ) {
      navigator.getUserMedia = navigator.getUserMedia ||
        navigator.webkitGetUserMedia ||
        navigator.mozGetUserMedia;
      if (navigator.getUserMedia) {
        navigator.getUserMedia({
          audio: true,
        }, (stream) => {
          this._onGetUserMediaSuccess();
          if (typeof stream.stop === 'function') {
            stream.stop();
          } else {
            stream.getTracks().forEach((track) => {
              track.stop();
            });
          }
        }, (error) => {
          this._onGetUserMediaError(error);
        });
      }
    }
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
      this.disconnect();
    }
  }

  _shouldInit() {
    return (
      this._auth.loggedIn &&
      this._rolesAndPermissions.ready &&
      this._extensionDevice.ready &&
      this._storage.ready &&
      this._globalStorage.ready &&
      this._numberValidate.ready &&
      !this.ready
    );
  }

  _shouldReset() {
    return (
      (
        !this._auth.loggedIn ||
        !this._rolesAndPermissions.ready ||
        !this._storage.ready ||
        !this._globalStorage.ready ||
        !this._numberValidate.ready ||
        !this._extensionDevice.ready
      ) &&
      this.ready
    );
  }

  @proxify
  async _sipProvision() {
    const response = await this._client.service.platform()
      .post('/client-info/sip-provision', {
        sipInfo: [{ transport: 'WSS' }]
      });
    return response.json();
  }

  async _fetchDL() {
    const response = await this._client.account().extension().device().list();
    const devices = response.records;
    let phoneLines = [];
    devices.forEach((device) => {
      if (!device.phoneLines || device.phoneLines.length === 0) {
        return;
      }
      phoneLines = phoneLines.concat(device.phoneLines);
    });
    return phoneLines;
  }

  _removeWebphone() {
    if (!this._webphone || !this._webphone.userAgent) {
      return;
    }
    this._webphone.userAgent.stop();
    this._webphone.userAgent.unregister();
    this._webphone.userAgent.removeAllListeners();
    this._webphone = null;
  }

  _createWebphone(provisionData) {
    this._removeWebphone();
    this._webphone = new RingCentralWebphone(provisionData, {
      appKey: this._appKey,
      appName: this._appName,
      appVersion: this._appVersion,
      uuid: this._auth.endpointId,
      logLevel: this._webphoneLogLevel, // error 0, warn 1, log: 2, debug: 3
      audioHelper: {
        enabled: true, // enables audio feedback when web phone is ringing or making a call
        incoming: incomingAudio, // path to audio file for incoming call
        outgoing: outgoingAudio, // path to aduotfile for outgoing call
      }
    });
    this._isFirstRegister = true;
    const onRegistered = () => {
      if (this._isFirstRegister) {
        this.store.dispatch({
          type: this.actionTypes.registered,
        });
        this._alert.info({
          message: webphoneErrors.connected,
        });
      }
      this._isFirstRegister = false;
    };
    const onUnregistered = () => {
      this._isFirstRegister = true;
      this.store.dispatch({
        type: this.actionTypes.unregistered,
      });
    };
    const onRegistrationFailed = (response, cause) => {
      this._isFirstRegister = true;
      let errorCode;
      let needToReconnect = false;
      console.error(response);
      console.error(`webphone register failed: ${cause}`);
      if (response && response.status_code === 503) {
        errorCode = webphoneErrors.webphoneCountOverLimit;
        this._alert.warning({
          message: errorCode,
        });
        needToReconnect = true;
      }
      this.store.dispatch({
        type: this.actionTypes.registrationFailed,
        errorCode,
      });
      if (cause === 'Request Timeout') {
        needToReconnect = true;
      }
      if (needToReconnect) {
        this._removeWebphone();
        this._connect(needToReconnect);
      }
    };
    this._webphone.userAgent.audioHelper.setVolume(0.3);
    this._webphone.userAgent.on('registered', onRegistered);
    this._webphone.userAgent.on('unregistered', onUnregistered);
    this._webphone.userAgent.once('registrationFailed', onRegistrationFailed);
    this._webphone.userAgent.on('invite', (session) => {
      console.debug('UA invite');
      sendReceiveConfirm(session);
      this._onInvite(session);
    });
  }

  @proxify
  async _connect(reconnect = false) {
    try {
      if (reconnect) {
        await this._retrySleep();
      }

      if (!this._auth.loggedIn) {
        return;
      }

      // do not connect if it is connecting
      if (this.connectionStatus === connectionStatus.connecting) {
        return;
      }

      // when reconnect is break by disconnect
      if (reconnect && this.connectionStatus !== connectionStatus.connectFailed) {
        this.store.dispatch({
          type: this.actionTypes.resetRetryCounts,
        });
        return;
      }

      this.store.dispatch({
        type: (
          reconnect ?
            this.actionTypes.reconnect : this.actionTypes.connect
        )
      });

      const sipProvision = await this._sipProvision();

      // do not continue if it is disconnecting
      if (this.disconnecting) {
        return;
      }
      this._createWebphone(sipProvision);
    } catch (error) {
      console.error(error);
      this._alert.warning({
        message: webphoneErrors.connectFailed,
        ttl: 0,
        allowDuplicates: false,
      });
      let needToReconnect = true;
      let errorCode;
      if (
        error && error.message &&
        (error.message.indexOf('Feature [WebPhone] is not available') > -1)
      ) {
        this._rolesAndPermissions.refreshServiceFeatures();
        needToReconnect = false;
        errorCode = webphoneErrors.notWebphonePermission;
        return;
      }
      this.store.dispatch({
        type: this.actionTypes.connectError,
        errorCode,
        error,
      });
      if (needToReconnect) {
        await this._connect(needToReconnect);
      }
    }
  }

  /**
   * connect a web phone.
   */
  @proxify
  async connect() {
    if (
      this._auth.loggedIn &&
      this.enabled &&
      this.connectionStatus === connectionStatus.disconnected
    ) {
      if (!isBrowerSupport()) {
        this.store.dispatch({
          type: this.actionTypes.connectError,
          errorCode: webphoneErrors.browserNotSupported,
        });
        this._alert.warning({
          message: webphoneErrors.browserNotSupported,
          ttl: 0,
        });
        return;
      }
      try {
        const phoneLines = await this._fetchDL();
        if (phoneLines.length === 0) {
          this.store.dispatch({
            type: this.actionTypes.connectError,
            errorCode: webphoneErrors.notOutboundCallWithoutDL,
          });
          this._alert.warning({
            message: webphoneErrors.notOutboundCallWithoutDL,
          });
        }
      } catch (error) {
        console.log(error);
        this.store.dispatch({
          type: this.actionTypes.connectError,
          errorCode: webphoneErrors.checkDLError,
        });
        this._alert.warning({
          message: webphoneErrors.checkDLError,
        });
      }
      await this._connect();
    }
  }

  _disconnect() {
    if (
      this.connectionStatus === connectionStatus.connected ||
      this.connectionStatus === connectionStatus.connecting ||
      this.connectionStatus === connectionStatus.connectFailed
    ) {
      this.store.dispatch({
        type: this.actionTypes.disconnect,
      });
      if (this._webphone) {
        this._sessions.forEach((session) => {
          this.hangup(session);
        });
        this._removeWebphone();
        this._sessions = new Map();
        this._updateSessions();
      }
      this.store.dispatch({
        type: this.actionTypes.unregistered,
      });
    }
  }

  @proxify
  async disconnect() {
    this._disconnect();
  }

  _onAccepted(session) {
    session.on('accepted', () => {
      console.log('accepted');
      session.callStatus = sessionStatus.connected;
      this._onCallStart(session);
    });
    session.on('progress', () => {
      console.log('progress...');
      session.callStatus = sessionStatus.connecting;
      this._updateSessions();
    });
    session.on('rejected', () => {
      console.log('rejected');
      session.callStatus = sessionStatus.finished;
      this._onCallEnd(session);
    });
    session.on('failed', (response, cause) => {
      console.log('Event: Failed');
      console.log(cause);
      session.callStatus = sessionStatus.finished;
      this._onCallEnd(session);
    });
    session.on('terminated', () => {
      console.log('Event: Terminated');
      session.callStatus = sessionStatus.finished;
      this._onCallEnd(session);
    });
    session.on('cancel', () => {
      console.log('Event: Cancel');
      session.callStatus = sessionStatus.finished;
      this._onCallEnd(session);
    });
    session.on('refer', () => {
      console.log('Event: Refer');
    });
    session.on('replaced', (newSession) => {
      session.callStatus = sessionStatus.replaced;
      newSession.callStatus = sessionStatus.connected;
      newSession.direction = callDirections.inbound;
      this._addSession(newSession);
      this._onAccepted(newSession);
    });
    session.on('muted', () => {
      console.log('Event: Muted');
      session.isOnMute = true;
      session.callStatus = sessionStatus.onMute;
      this._updateSessions();
    });
    session.on('unmuted', () => {
      console.log('Event: Unmuted');
      session.isOnMute = false;
      session.callStatus = sessionStatus.connected;
      this._updateSessions();
    });
    session.on('hold', () => {
      console.log('Event: hold');
      session.callStatus = sessionStatus.onHold;
      this._updateSessions();
    });
    session.on('unhold', () => {
      console.log('Event: unhold');
      session.callStatus = sessionStatus.connected;
      this._updateSessions();
    });
  }

  _onInvite(session) {
    session.creationTime = Date.now();
    session.direction = callDirections.inbound;
    session.callStatus = sessionStatus.connecting;
    session.on('rejected', () => {
      console.log('Event: Rejected');
      this._onCallEnd(session);
    });
    session.on('terminated', () => {
      console.log('Event: Terminated');
      this._onCallEnd(session);
    });
    this._onCallRing(session);
  }

  @proxify
  async answer(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      this._holdOtherSession(session.id);
      this._onAccepted(session, 'inbound');
      await session.accept(this.acceptOptions);
      this._onCallStart(session);
      this.store.dispatch({ // for track
        type: this.actionTypes.callAnswer,
      });
    } catch (e) {
      console.log('Accept failed');
      console.error(e);
      this._removeSession(session);
    }
  }

  @proxify
  async reject(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      await session.reject();
    } catch (e) {
      console.error(e);
      this._removeSession(session);
    }
  }

  @proxify
  async resume(sessionId) {
    await this.unhold(sessionId);
  }

  @proxify
  async forward(sessionId, forwardNumber) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return false;
    }
    try {
      const validatedResult
        = await this._numberValidate.validateNumbers([forwardNumber]);
      if (!validatedResult.result) {
        validatedResult.errors.forEach((error) => {
          this._alert.warning({
            message: callErrors[error.type],
            payload: {
              phoneNumber: error.phoneNumber
            }
          });
        });
        return false;
      }
      const validPhoneNumber =
        validatedResult.numbers[0] && validatedResult.numbers[0].e164;
      session.isForwarded = true;
      await session.forward(validPhoneNumber, this.acceptOptions);
      console.log('Forwarded');
      this._onCallEnd(session);
      return true;
    } catch (e) {
      console.error(e);
      this._alert.warning({
        message: webphoneErrors.forwardError
      });
      return false;
    }
  }

  @proxify
  async increaseVolume(sessionId) {
    this._sessionHandleWithId(sessionId, (session) => {
      session.ua.audioHelper.setVolume(
        (session.ua.audioHelper.volume != null ? session.ua.audioHelper.volume : 0.5) + 0.1
      );
    });
  }

  @proxify
  async decreaseVolume(sessionId) {
    this._sessionHandleWithId(sessionId, (session) => {
      session.ua.audioHelper.setVolume(
        (session.ua.audioHelper.volume != null ? session.ua.audioHelper.volume : 0.5) - 0.1
      );
    });
  }

  @proxify
  async mute(sessionId) {
    try {
      this._sessionHandleWithId(sessionId, (session) => {
        session.isOnMute = true;
        session.mute();
        this._updateSessions();
      });
      return true;
    } catch (e) {
      console.error(e);
      this._alert.warning({
        message: webphoneErrors.muteError
      });
      return false;
    }
  }

  @proxify
  async unmute(sessionId) {
    this._sessionHandleWithId(sessionId, (session) => {
      session.isOnMute = false;
      session.unmute();
      this._updateSessions();
    });
  }

  @proxify
  async hold(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return false;
    }
    try {
      await session.hold();
      this._updateSessions();
      return true;
    } catch (e) {
      console.log(e);
      this._alert.warning({
        message: webphoneErrors.holdError
      });
      return false;
    }
  }

  _holdOtherSession(currentSessionId) {
    this._sessions.forEach((session, sessionId) => {
      if (currentSessionId === sessionId) {
        return;
      }
      if (session.isOnHold().local) {
        return;
      }
      session.hold();
    });
  }

  @proxify
  async unhold(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      if (session.isOnHold().local) {
        this._holdOtherSession(session.id);
        await session.unhold();
        this._onCallStart(session);
      }
    } catch (e) {
      console.log(e);
    }
  }

  @proxify
  async startRecord(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    // If the status of current session is not connected,
    // the recording process can not be started.
    if (session.callStatus === sessionStatus.connecting) {
      return;
    }
    try {
      session.recordStatus = recordStatus.pending;
      this._updateSessions();
      await session.startRecord();
      session.recordStatus = recordStatus.recording;
      this._updateSessions();
    } catch (e) {
      console.error(e);
      session.recordStatus = recordStatus.idle;
      this._updateSessions();
      // Recording has been disabled
      if (e && e.code === -5) {
        this._alert.danger({
          message: webphoneErrors.recordDisabled
        });
        // Disabled phone recording
        session.recordStatus = recordStatus.pending;
        this._updateSessions();
        return;
      }
      this._alert.danger({
        message: webphoneErrors.recordError,
        payload: {
          errorCode: e.code
        }
      });
    }
  }

  @proxify
  async stopRecord(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      session.recordStatus = recordStatus.pending;
      this._updateSessions();
      await session.stopRecord();
      session.recordStatus = recordStatus.idle;
      this._updateSessions();
    } catch (e) {
      console.error(e);
      session.recordStatus = recordStatus.recording;
      this._updateSessions();
    }
  }

  @proxify
  async park(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      await session.park();
      console.log('Parked');
    } catch (e) {
      console.error(e);
    }
  }

  @proxify
  async transfer(transferNumber, sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      session.isOnTransfer = true;
      this._updateSessions();
      const validatedResult
        = await this._numberValidate.validateNumbers([transferNumber]);
      if (!validatedResult.result) {
        validatedResult.errors.forEach((error) => {
          this._alert.warning({
            message: callErrors[error.type],
            payload: {
              phoneNumber: error.phoneNumber
            }
          });
        });
        session.isOnTransfer = false;
        this._updateSessions();
        return;
      }
      const validPhoneNumber =
        validatedResult.numbers[0] && validatedResult.numbers[0].e164;
      await session.transfer(validPhoneNumber);
      session.isOnTransfer = false;
      this._updateSessions();
      this._onCallEnd(session);
    } catch (e) {
      console.error(e);
      session.isOnTransfer = false;
      this._updateSessions();
      this._alert.danger({
        message: webphoneErrors.transferError
      });
    }
  }

  @proxify
  async transferWarm(transferNumber, sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      await session.hold();
      const newSession = session.ua.invite(transferNumber, {
        media: this.acceptOptions.media
      });
      newSession.once('accepted', async () => {
        try {
          await session.warmTransfer(newSession);
          console.log('Transferred');
          this._onCallEnd(session);
        } catch (e) {
          console.error(e);
        }
      });
    } catch (e) {
      console.error(e);
    }
  }

  @proxify
  async flip(flipValue, sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      await session.flip(flipValue);
      // this._onCallEnd(session);
      session.isOnFlip = true;
      console.log('Flipped');
    } catch (e) {
      session.isOnFlip = false;
      this._alert.warning({
        message: webphoneErrors.flipError
      });
      console.error(e);
    }
    this._updateSessions();
  }

  @proxify
  async sendDTMF(dtmfValue, sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      await session.dtmf(dtmfValue);
    } catch (e) {
      console.error(e);
    }
  }

  @proxify
  async hangup(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      await session.terminate();
    } catch (e) {
      console.error(e);
      this._onCallEnd(session);
    }
  }

  @proxify
  async toVoiceMail(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      session.isToVoicemail = true;
      await session.toVoicemail();
    } catch (e) {
      console.error(e);
      this._onCallEnd(session);
      this._alert.warning({
        message: webphoneErrors.toVoiceMailError
      });
    }
  }

  @proxify
  async replyWithMessage(sessionId, replyOptions) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      session.isReplied = true;
      await session.replyWithMessage(replyOptions);
    } catch (e) {
      console.error(e);
      this._onCallEnd(session);
    }
  }

  _sessionHandleWithId(sessionId, func) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return null;
    }
    return func(session);
  }

  /**
   * start a outbound call.
   * @param {toNumber} recipient number
   * @param {fromNumber} call Id
   * @param {homeCountryId} homeCountry Id
   */
  @proxify
  async makeCall({ toNumber, fromNumber, homeCountryId }) {
    if (!this._webphone) {
      this._alert.warning({
        message: this.errorCode,
      });
      return null;
    }
    const phoneLines = await this._fetchDL();
    if (phoneLines.length === 0) {
      this._alert.warning({
        message: webphoneErrors.notOutboundCallWithoutDL,
      });
      return null;
    }
    const session = this._webphone.userAgent.invite(toNumber, {
      media: this.acceptOptions.media,
      fromNumber,
      homeCountryId,
    });
    session.direction = callDirections.outbound;
    session.callStatus = sessionStatus.connecting;
    session.creationTime = Date.now();
    this._onAccepted(session);
    this._holdOtherSession(session.id);
    this._onCallStart(session);
    return session;
  }

  @proxify
  async updateSessionMatchedContact(sessionId, contact) {
    this._sessionHandleWithId(sessionId, (session) => {
      session.contactMatch = contact;
      this._updateSessions();
    });
  }

  _updateSessions() {
    this.store.dispatch({
      type: this.actionTypes.updateSessions,
      sessions: [...this._sessions.values()].map(normalizeSession),
    });
  }

  _addSession(session) {
    this._sessions.set(session.id, session);
    this._updateSessions();
  }

  _removeSession(session) {
    this._sessions.delete(session.id);
    this._updateSessions();
  }

  @proxify
  async toggleMinimized(sessionId) {
    this._sessionHandleWithId(sessionId, (session) => {
      session.minimized = !session.minimized;
      this._updateSessions();
    });
  }

  _onCallStart(session) {
    this._addSession(session);
    const normalizedSession = normalizeSession(session);
    this.store.dispatch({
      type: this.actionTypes.callStart,
      session: normalizedSession,
      sessions: this.sessions,
    });
    if (this._contactMatcher) {
      this._contactMatcher.triggerMatch();
    }
    if (typeof this._onCallStartFunc === 'function') {
      this._onCallStartFunc(normalizedSession, this.activeSession);
    }
  }

  _onCallRing(session) {
    this._addSession(session);
    const normalizedSession = normalizeSession(session);
    this.store.dispatch({
      type: this.actionTypes.callRing,
      session: normalizedSession,
      sessions: this.sessions,
    });
    if (this._contactMatcher) {
      this._contactMatcher.triggerMatch();
    }
    if (this.activeSession && !isOnHold(this.activeSession)) {
      this._webphone.userAgent.audioHelper.playIncoming(false);
    }
    if (typeof this._onCallRingFunc === 'function') {
      this._onCallRingFunc(normalizedSession, this.ringSession);
    }
  }

  _onCallEnd(session) {
    this._removeSession(session);
    const normalizedSession = normalizeSession(session);
    this.store.dispatch({
      type: this.actionTypes.callEnd,
      session: normalizedSession,
      sessions: this.sessions,
    });
    if (typeof this._onCallEndFunc === 'function') {
      this._onCallEndFunc(normalizedSession, this.activeSession);
    }
  }

  async _retrySleep() {
    if (this.connectRetryCounts < 3) {
      await sleep(FIRST_THREE_RETRIES_DELAY);
    }
    if (this.connectRetryCounts === 3) {
      await sleep(FOURTH_RETRIES_DELAY);
    }
    if (this.connectRetryCounts === 4) {
      await sleep(FIFTH_RETRIES_DELAY); // sleep 30 seconds
    }
    if (this.connectRetryCounts > 4) {
      await sleep(MAX_RETRIES_DELAY); // sleep 30 seconds
    }
  }

  get status() {
    return this.state.status;
  }

  get originalSessions() {
    return this._sessions;
  }

  get ready() {
    return this.state.status === moduleStatuses.ready;
  }

  get ringSessionId() {
    return this.state.ringSessionId;
  }

  get activeSessionId() {
    return this.state.activeSessionId;
  }

  /**
   * Current active session(Outbound and InBound that answered)
   */
  get activeSession() {
    return this._selectors.activeSession();
  }

  /**
   * Current ring session(inbound)
   */
  get ringSession() {
    return this._selectors.ringSession();
  }

  get sessions() {
    return this.state.sessions;
  }

  get ringSessions() {
    return this._selectors.ringSessions();
  }

  get onHoldSessions() {
    return this._selectors.onHoldSessions();
  }

  get lastEndedSessions() {
    return this.state.lastEndedSessions;
  }

  get videoElementPrepared() {
    return this.state.videoElementPrepared;
  }

  get enabled() {
    return this._rolesAndPermissions.webphoneEnabled;
  }

  get connectionStatus() {
    return this.state.connectionStatus;
  }

  get userMedia() {
    return this._globalStorage.getItem(this._userMediaStorageKey);
  }

  @proxify
  async _onGetUserMediaSuccess() {
    this.store.dispatch({
      type: this.actionTypes.getUserMediaSuccess,
    });
  }

  @proxify
  async _onGetUserMediaError(error) {
    this.store.dispatch({
      type: this.actionTypes.getUserMediaError,
      error,
    });
  }

  get connectRetryCounts() {
    return this.state.connectRetryCounts;
  }

  get acceptOptions() {
    return {
      media: {
        render: {
          remote: this._remoteVideo,
          local: this._localVideo,
        }
      }
    };
  }
  get isOnTransfer() {
    return this.activeSession && this.activeSession.isOnTransfer;
  }

  get errorCode() {
    return this.state.errorCode;
  }

  get disconnecting() {
    return this.connectionStatus === connectionStatus.disconnecting;
  }

  get connecting() {
    return this.connectionStatus === connectionStatus.connecting;
  }

  get connected() {
    return this.connectionStatus === connectionStatus.connected;
  }

  get connectFailed() {
    return this.connectionStatus === connectionStatus.connectFailed;
  }
}
