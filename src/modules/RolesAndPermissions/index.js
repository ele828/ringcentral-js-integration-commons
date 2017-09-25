import { Module } from '../../lib/di';
import DataFetcher from '../../lib/DataFetcher';
import permissionsMessages from './permissionsMessages';
import loginStatus from '../Auth/loginStatus';
import ensureExist from '../../lib/ensureExist';

const DEFAULT_TTL = 24 * 60 * 60 * 1000;

function extractData(permissions) {
  const output = {};
  permissions.permissions.forEach((item) => {
    output[item.permission.id] = true;
  });
  return output;
}

/**
 * @class
 * @description Roles and permission module
 */
@Module({
  deps: [
    'Client', 'Alert', 'ExtensionInfo',
    { dep: 'RolesAndPermissionsOptions', optional: true }
  ]
})
export default class RolesAndPermissions extends DataFetcher {
  /**
   * @constructor
   * @param {Object} params - params object
   * @param {Client} params.client - client module instance
   * @param {Alert} params.alert - alert module instance
   * @param {ExtensionInfo} params.extensionInfo - extensionInfo module instance
   * @param {Bool} params.isCRM - if it is CRM
   * @param {String} params.flag - app flag
   * @param {Number} params.ttl - local cache time
   */
  constructor({
    isCRM,
    flag,
    client,
    alert,
    extensionInfo,
    ttl = DEFAULT_TTL,
    ...options
  }) {
    super({
      ...options,
      name: 'rolesAndPermissions',
      client,
      ttl,
      fetchFunction: async () => extractData(
        await this._client.account().extension().authzProfile().get()
      ),
      readyCheckFn: () => this._extensionInfo.ready,
    });
    this._isCRM = !!isCRM;
    this._flag = flag || 'SalesForce';
    this._alert = alert;
    this._extensionInfo = ensureExist(extensionInfo, 'extensionInfo');
    this.addSelector(
      'permissions',
      () => this.data,
      data => data || {},
    );
  }

  async _onStateChange() {
    await super._onStateChange();
    if (this.ready &&
      this._auth.loginStatus === loginStatus.loggedIn &&
      this._isCRM &&
      this.tierEnabled !== null &&
      !this.tierEnabled
    ) {
      await this._auth.logout();
      this._alert.danger({
        message: permissionsMessages.invalidTier,
        ttl: 0,
      });
    }
  }

  refreshServiceFeatures() {
    if (this._extensionInfo.ready) {
      this._extensionInfo.fetchData();
    }
  }

  get serviceFeatures() {
    return this._extensionInfo.serviceFeatures;
  }

  get permissions() {
    return this._selectors.permissions();
  }

  get ringoutEnabled() {
    return !!(
      this._extensionInfo.serviceFeatures &&
      this._extensionInfo.serviceFeatures.RingOut &&
      this._extensionInfo.serviceFeatures.RingOut.enabled
    );
  }

  get webphoneEnabled() {
    return !!(
      this._extensionInfo.serviceFeatures &&
      this._extensionInfo.serviceFeatures.WebPhone &&
      this._extensionInfo.serviceFeatures.WebPhone.enabled
    );
  }

  get tierEnabled() {
    if (
      !this._extensionInfo.serviceFeatures ||
      !this._extensionInfo.serviceFeatures[this._flag]
    ) {
      return null;
    }
    return this._extensionInfo.serviceFeatures[this._flag].enabled;
  }
}
