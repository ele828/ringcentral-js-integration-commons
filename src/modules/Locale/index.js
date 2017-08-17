import formatMessage from 'format-message';
import RcModule from '../../lib/RcModule';
import proxify from '../../lib/proxy/proxify';

import I18n, {
  DEFAULT_LOCALE,
  PSEUDO_LOCALE,
} from '../../lib/I18n';
import actionTypes from './actionTypes';
import getLocaleReducer from './getLocaleReducer';
import getProxyReducer from './getProxyReducer';

/* eslint-disable global-require */


/**
 *  @function
 *  @description Check if the current environement requires the Intl polyfill.
 *  @return {Promise}
 */
function checkIntl() {
  return new Promise((resolve) => {
    if (!global.Intl) {
      if (process.browser) {
        require.ensure([
          'intl',
          'intl/locale-data/jsonp/en',
          'intl/locale-data/jsonp/de',
          'intl/locale-data/jsonp/fr',
        ], (require) => {
          require('intl');
          require('intl/locale-data/jsonp/en');
          require('intl/locale-data/jsonp/de');
          require('intl/locale-data/jsonp/fr');

          resolve();
        }, 'intl');
      } else {
        require('intl');
        resolve();
      }
    } else {
      resolve();
    }
  });
}

export default class Locale extends RcModule {
  constructor({
    defaultLocale = DEFAULT_LOCALE,
    ...options
  } = {}) {
    super({
      ...options,
      actionTypes,
    });
    this._reducer = getLocaleReducer({ defaultLocale, types: this.actionTypes });
    this._proxyReducer = getProxyReducer({ defaultLocale, types: this.actionTypes });
  }
  async initialize() {
    await checkIntl();
    await this.setLocale(this.currentLocale);
    this.store.dispatch({
      type: this.actionTypes.initSuccess,
    });
  }
  async initializeProxy() {
    this.store.dispatch({
      type: this.actionTypes.proxyInit,
    });
    await checkIntl();
    await this._setLocale(this.state.currentLocale);
    this.store.dispatch({
      type: this.actionTypes.syncProxyLocale,
      locale: this.state.currentLocale,
    });
    this.store.dispatch({
      type: this.actionTypes.proxyInitSuccess,
    });
    this.store.subscribe(async () => {
      if (this.state.currentLocale !== this.currentLocale) {
        await this._setLocale(this.state.currentLocale);
        this.store.dispatch({
          type: this.actionTypes.syncProxyLocale,
          locale: this.state.currentLocale,
        });
      }
    });
  }

  /**
   * @property {String} currentLocale
   */
  get currentLocale() {
    return (this.proxyState && this.proxyState.currentLocale) || this.state.currentLocale;
  }

  get status() {
    return (this.proxyState && this.proxyState.status) || this.state.status;
  }

  get proxyStatus() {
    return this.proxyState.status;
  }

  async _setLocale(locale) {
    await I18n.setLocale(locale);
    formatMessage.setup({
      locale: this.currentLocale === PSEUDO_LOCALE ? DEFAULT_LOCALE : this.currentLocale,
    });
  }

  /**
   *  @function
   *  @description Sets the desired locale as the current locale. This will also
   *    set all I18n instances to the same locale, as well as set formatMessage to use
   *    the same locale.
   *  @param {String} locale
   *  @return {Promise}
   */
  @proxify
  async setLocale(locale) {
    this._setLocale(locale);
    this.store.dispatch({
      type: this.actionTypes.setLocale,
      locale,
    });
  }
}
