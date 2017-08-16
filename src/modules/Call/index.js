import RcModule from '../../lib/RcModule';
import callingModes from '../CallingSettings/callingModes';
import moduleStatuses from '../../enums/moduleStatuses';
import proxify from '../../lib/proxy/proxify';
import callActionTypes from './actionTypes';
import getCallReducer, {
  getLastCallNumberReducer,
} from './getCallReducer';

import callStatus from './callStatus';
import callErrors from './callErrors';
import ringoutErrors from '../Ringout/ringoutErrors';


export default class Call extends RcModule {
  constructor({
    alert,
    client,
    storage,
    callingSettings,
    softphone,
    ringout,
    webphone,
    numberValidate,
    regionSettings,
    ...options
  }) {
    super({
      ...options,
      actionTypes: callActionTypes,
    });

    this._alert = alert;
    this._client = client;
    this._storage = storage;
    this._storageKey = 'lastCallNumber';
    this._reducer = getCallReducer(this.actionTypes);
    this._callingSettings = callingSettings;
    this._ringout = ringout;
    this._softphone = softphone;
    this._webphone = webphone;
    this._numberValidate = numberValidate;
    this._regionSettings = regionSettings;
    this._callSettingMode = null;

    this._storage.registerReducer({
      key: this._storageKey,
      reducer: getLastCallNumberReducer(this.actionTypes),
    });
  }

  initialize() {
    this.store.subscribe(() => this._onStateChange());
  }

  async _onStateChange() {
    if (this._shouldInit()) {
      this.store.dispatch({
        type: this.actionTypes.init,
      });
      await this._initCallModule();
      this.store.dispatch({
        type: this.actionTypes.initSuccess,
      });
    } else if (this._shouldReset()) {
      this._resetCallModule();
    } else if (this.ready) {
      await this._processCall();
    }
  }

  _shouldInit() {
    return (
      this._numberValidate.ready &&
      this._callingSettings.ready &&
      this._storage.ready &&
      this._regionSettings.ready &&
      (!this._webphone || this._webphone.ready) &&
      this._ringout.ready &&
      this._softphone.ready &&
      this.pending
    );
  }
  _shouldReset() {
    return (
      (
        !this._numberValidate.ready ||
        !this._callingSettings.ready ||
        !this._regionSettings.ready ||
        (!!this._webphone && !this._webphone.ready) ||
        !this._ringout.ready ||
        !this._softphone.ready ||
        !this._storage.ready
      ) &&
      this.ready
    );
  }

  async _initCallModule() {
    this._callSettingMode = this._callingSettings.callingMode;
    if (this._callSettingMode === callingModes.webphone && this._webphone) {
      await this._webphone.connect();
    }
  }

  _resetCallModule() {
    this.store.dispatch({
      type: this.actionTypes.resetSuccess,
    });
    this._callSettingMode = this._callingSettings.callingMode;
    if (this._callSettingMode === callingModes.webphone && this._webphone) {
      this._webphone.disconnect();
    }
  }
  async _processCall() {
    const oldCallSettingMode = this._callSettingMode;
    if (this._callingSettings.callingMode !== oldCallSettingMode && this._webphone) {
      this._callSettingMode = this._callingSettings.callingMode;
      if (oldCallSettingMode === callingModes.webphone) {
        this._webphone.disconnect();
      } else if (this._callSettingMode === callingModes.webphone) {
        await this._webphone.connect();
      }
    }
  }
  @proxify
  async onToNumberChange(value) {
    this.store.dispatch({
      type: this.actionTypes.toNumberChanged,
      data: value,
    });
  }

  // save the click to dial entity, only when call took place
  onToNumberMatch({ entityId, startTime }) {
    if (this.isIdle) {
      this.store.dispatch({
        type: this.actionTypes.toNumberMatched,
        data: { entityId, startTime },
      });
    }
  }

  cleanToNumberEntities() {
    this.store.dispatch({
      type: this.actionTypes.cleanToNumberEntities,
    });
  }

  @proxify
  async onCall() {
    if (this.isIdle) {
      // last number check
      if (`${this.toNumber}`.trim().length === 0) {
        if (this.lastCallNumber) {
          this.onToNumberChange(this.lastCallNumber);
        } else {
          this._alert.warning({
            message: callErrors.noToNumber,
          });
        }
      } else {
        this.store.dispatch({
          type: this.actionTypes.connect,
          number: this.toNumber,
          callSettingMode: this._callSettingMode // for Track
        });
        try {
          const validatedNumbers = await this._getValidatedNumbers();
          if (validatedNumbers) {
            await this._makeCall(validatedNumbers);
            this.store.dispatch({
              type: this.actionTypes.connectSuccess
            });
          } else {
            this.store.dispatch({
              type: this.actionTypes.connectError
            });
          }
        } catch (error) {
          if (error.message === ringoutErrors.firstLegConnectFailed) {
            this._alert.warning({
              message: callErrors.connectFailed,
              payload: error
            });
          } else if (error.message === 'Failed to fetch') {
            this._alert.danger({
              message: callErrors.networkError,
              payload: error,
            });
          } else if (error.message !== 'Refresh token has expired') {
            this._alert.danger({
              message: callErrors.internalError,
              payload: error,
            });
          }
          this.store.dispatch({
            type: this.actionTypes.connectError
          });
        }
      }
    }
  }
  @proxify
  async _getValidatedNumbers() {
    let fromNumber;
    const isWebphone = (this._callingSettings.callingMode === callingModes.webphone);
    if (isWebphone) {
      fromNumber = this._callingSettings.fromNumber;
      if (fromNumber === null || fromNumber === '') {
        return null;
      }
    } else {
      fromNumber = this._callingSettings.myLocation;
    }
    const waitingValidateNumbers = [this.toNumber];
    if (
      fromNumber &&
      fromNumber.length > 0 &&
      !(isWebphone && fromNumber === 'anonymous')
    ) {
      waitingValidateNumbers.push(fromNumber);
    }
    const validatedResult
      = await this._numberValidate.validateNumbers(waitingValidateNumbers);
    if (!validatedResult.result) {
      validatedResult.errors.forEach((error) => {
        this._alert.warning({
          message: callErrors[error.type],
          payload: {
            phoneNumber: error.phoneNumber
          }
        });
      });
      return null;
    }
    const parsedNumbers = validatedResult.numbers;
    // using e164 in response to call
    let parsedFromNumber =
      parsedNumbers[1] ? parsedNumbers[1].e164 : '';
    // add ext back if any
    if (parsedFromNumber !== '') {
      parsedFromNumber = (parsedNumbers[1].subAddress) ?
        [parsedNumbers[1].e164, parsedNumbers[1].subAddress].join('*') :
        parsedNumbers[1].e164;
    }
    if (isWebphone && fromNumber === 'anonymous') {
      parsedFromNumber = 'anonymous';
    }
    return {
      toNumber: parsedNumbers[0].e164,
      fromNumber: parsedFromNumber,
    };
  }
  @proxify
  async _makeCall({ toNumber, fromNumber }) {
    const callingMode = this._callingSettings.callingMode;
    const countryCode = this._regionSettings.countryCode;
    const homeCountry = this._regionSettings.availableCountries.find(
      country => country.isoCode === countryCode
    );
    const homeCountryId = (homeCountry && homeCountry.callingCode) || '1';
    switch (callingMode) {
      case callingModes.softphone:
        this._softphone.makeCall(toNumber);
        break;
      case callingModes.ringout:
        await this._ringout.makeCall({
          fromNumber,
          toNumber,
          prompt: this._callingSettings.ringoutPrompt,
        });
        break;
      case callingModes.webphone:
        if (this._webphone) {
          await this._webphone.makeCall({
            fromNumber,
            toNumber,
            homeCountryId,
          });
        }
        break;
      default:
        break;
    }
  }


  get status() {
    return this.state.status;
  }

  get ready() {
    return this.state.status === moduleStatuses.ready;
  }

  get pending() {
    return this.state.status === moduleStatuses.pending;
  }

  get callStatus() {
    return this.state.callStatus;
  }

  get isIdle() {
    return this.state.callStatus === callStatus.idle;
  }

  get lastCallNumber() {
    return this._storage.getItem(this._storageKey) || '';
  }

  get toNumber() {
    return this.state.toNumber;
  }

  get toNumberEntities() {
    return this.state.toNumberEntities;
  }
}
