import 'core-js/fn/array/find';
import RcModule from '../../lib/RcModule';
import { Module } from '../../lib/di';
import getRegionSettingsReducer, {
  getCountryCodeReducer,
  getAreaCodeReducer,
} from './getRegionSettingsReducer';
import moduleStatuses from '../../enums/moduleStatuses';
import regionSettingsMessages from '../RegionSettings/regionSettingsMessages';
import actionTypes from './actionTypes';
import validateAreaCode from '../../lib/validateAreaCode';
import proxify from '../../lib/proxy/proxify';

/**
 * @class
 * @description Region settings managing module
 */
@Module({
  deps: ['Storage', 'ExtensionInfo', 'DialingPlan', 'Alert', 'TabManager']
})
export default class RegionSettings extends RcModule {
  /**
   * @constructor
   * @param {Object} params - params object
   * @param {Storage} params.storage - storage module instance
   * @param {ExtensionInfo} params.extensionInfo - extensionInfo module instance
   * @param {DialingPlan} params.dialingPlan - dialingPlan module instance
   * @param {Alert} params.alert - alert module instance
   * @param {TabManager} params.tabManager - tabManager module instance
   */
  constructor({
    storage,
    extensionInfo,
    dialingPlan,
    alert,
    tabManager,
    ...options
  }) {
    super({
      ...options,
      actionTypes,
    });
    this._storage = storage;
    this._alert = alert;
    this._dialingPlan = dialingPlan;
    this._extensionInfo = extensionInfo;
    this._tabManager = tabManager;

    this._countryCodeKey = 'regionSettingsCountryCode';
    this._areaCodeKey = 'regionSettingsAreaCode';
    this._reducer = getRegionSettingsReducer(this.actionTypes);

    this._storage.registerReducer({
      key: this._countryCodeKey,
      reducer: getCountryCodeReducer(this.actionTypes),
    });
    this._storage.registerReducer({
      key: this._areaCodeKey,
      reducer: getAreaCodeReducer(this.actionTypes),
    });
  }
  initialize() {
    let plans;
    this.store.subscribe(async () => {
      if (
        this._storage.ready &&
        this._dialingPlan.ready &&
        this._extensionInfo.ready &&
        this.status === moduleStatuses.pending
      ) {
        this.store.dispatch({
          type: this.actionTypes.init,
        });
        if (!this._tabManager || this._tabManager.active) {
          await this.checkRegionSettings();
        }
        plans = this._dialingPlan.plans;
        this.store.dispatch({
          type: this.actionTypes.initSuccess,
        });
      } else if (
        !this._storage.ready &&
        this.ready
      ) {
        this.store.dispatch({
          type: this.actionTypes.resetSuccess,
        });
      } else if (
        this.ready &&
        plans !== this._dialingPlan.plans
      ) {
        plans = this._dialingPlan.plans;
        if (!this._tabManager || this._tabManager.active) {
          await this.checkRegionSettings();
        }
      }
    });
  }

  get status() {
    return this.state.status;
  }

  get ready() {
    return this.state.status === moduleStatuses.ready;
  }

  get availableCountries() {
    return this._dialingPlan.plans;
  }

  @proxify
  async checkRegionSettings() {
    let countryCode = this._storage.getItem(this._countryCodeKey);
    if (countryCode && !this._dialingPlan.plans.find(plan => (
      plan.isoCode === countryCode
    ))) {
      countryCode = null;
      this._alert.warning({
        message: regionSettingsMessages.dialingPlansChanged,
        ttl: 0
      });
    }
    if (!countryCode) {
      const country = this._dialingPlan.plans.find(plan => (
        plan.isoCode === this._extensionInfo.country.isoCode
      )) || this._dialingPlan.plans[0];
      countryCode = country && country.isoCode;
      this.store.dispatch({
        type: this.actionTypes.setData,
        countryCode,
        areaCode: '',
      });
    }
  }

  @proxify
  async setData({
    areaCode,
    countryCode,
  }) {
    if (!validateAreaCode(areaCode)) {
      this._alert.danger({
        message: regionSettingsMessages.areaCodeInvalid,
      });
      return;
    }
    this.store.dispatch({
      type: this.actionTypes.setData,
      countryCode,
      areaCode: areaCode && areaCode.trim(),
    });
    this._alert.info({
      message: regionSettingsMessages.saveSuccess,
    });
  }

  setCountryCode(countryCode) {
    this.setData({
      countryCode,
    });
  }

  setAreaCode(areaCode) {
    this.setData({
      areaCode,
    });
  }

  get countryCode() {
    return this._storage.getItem(this._countryCodeKey) || 'US';
  }

  get areaCode() {
    return this._storage.getItem(this._areaCodeKey) || '';
  }
}
