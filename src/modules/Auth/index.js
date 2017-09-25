import url from 'url';
import qs from 'qs';
import RcModule from '../../lib/RcModule';
import { Module } from '../../lib/di';
import getAuthReducer from './getAuthReducer';
import actionTypes from './actionTypes';
import loginStatus from './loginStatus';
import authMessages from './authMessages';
import moduleStatuses from '../../enums/moduleStatuses';
import parseCallbackUri from '../../lib/parseCallbackUri';
import ensureExist from '../../lib/ensureExist';
import proxify from '../../lib/proxy/proxify';

const DEFAULT_PROXY_RETRY = 5000;

function getDefaultRedirectUri() {
  if (typeof window !== 'undefined') {
    return url.resolve(window.location.href, './redirect.html');
  }
  return null;
}

function getDefaultProxyUri() {
  if (typeof window !== 'undefined') {
    return url.resolve(window.location.href, './proxy.html');
  }
  return null;
}

/**
 * @class
 * @description Authentication module
 */
@Module({
  deps: [
    'Client',
    'Alert',
    'Brand',
    'Locale',
    'TabManager',
    'Environment',
    { dep: 'AuthOptions', optional: true }
  ]
})
export default class Auth extends RcModule {
  /**
   * @constructor
   * @param {Object} params - params object
   * @param {Client} params.client - client module instance
   * @param {Alert} params.alert - alert module instance
   * @param {Brand} params.brand - brand module instance
   * @param {Locale} params.locale - locale module instance
   * @param {TabManager} params.tabManager - tabManager module instance
   * @param {environment} params.Environment - environment module instance
   * @param {String} params.redirectUri - redirect uri
   * @param {String} params.proxyUri - proxyUri module instance
   * @param {Number} params.defaultProxyRetry - default proxy retry time 5000
   */
  constructor({
    client,
    alert,
    redirectUri = getDefaultRedirectUri(),
    proxyUri = getDefaultProxyUri(),
    brand,
    locale,
    tabManager,
    environment,
    defaultProxyRetry = DEFAULT_PROXY_RETRY,
    ...options
  } = {}) {
    super({
      ...options,
      actionTypes,
    });
    this._client = ensureExist(client, 'client');
    this._alert = ensureExist(alert, 'alert');
    this._brand = ensureExist(brand, 'brand');
    this._locale = ensureExist(locale, 'locale');
    this._redirectUri = redirectUri;
    this._proxyUri = proxyUri;
    this._tabManager = tabManager;
    this._environment = environment;
    this._defaultProxyRetry = defaultProxyRetry;
    this._reducer = getAuthReducer(this.actionTypes);
    this._beforeLogoutHandlers = new Set();
    this._proxyFrame = null;
    this._proxyFrameLoaded = false;
    this._unbindEvents = null;
    this._lastEnvironmentCounter = 0;
  }
  _bindEvents() {
    if (this._unbindEvents) this._unbindEvents();

    const platform = this._client.service.platform();
    const onLoginSuccess = () => {
      this.store.dispatch({
        type: this.actionTypes.loginSuccess,
        token: platform.auth().data(),
      });
    };
    const onLoginError = (error) => {
      this.store.dispatch({
        type: this.actionTypes.loginError,
        error,
      });
      if (error) {
        this._alert.danger({
          message: authMessages.loginError,
          payload: error,
        });
      }
    };
    const onLogoutSuccess = () => {
      this.store.dispatch({
        type: this.actionTypes.logoutSuccess,
      });
    };
    const onLogoutError = (error) => {
      platform._cache.clean();
      this.store.dispatch({
        type: this.actionTypes.logoutError,
        error,
      });
      if (error) {
        this._alert.danger({
          message: authMessages.logoutError,
          payload: error,
        });
      }
    };
    const onRefreshSuccess = () => {
      this.store.dispatch({
        type: this.actionTypes.refreshSuccess,
        token: platform.auth().data(),
      });
    };
    const onRefreshError = (error) => {
      // user is still considered logged in if the refreshToken is still valid
      const refreshTokenValid = platform.auth().refreshTokenValid();
      this.store.dispatch({
        type: this.actionTypes.refreshError,
        error,
        refreshTokenValid,
      });
      if (!refreshTokenValid && this._client.service.platform().auth().data().access_token !== '') {
        this._alert.danger({
          message: authMessages.sessionExpired,
          payload: error,
          ttl: 0,
        });
        // clean the cache so the error doesn't show again
        platform._cache.clean();
      }
    };
    platform.addListener(platform.events.loginSuccess, onLoginSuccess);
    platform.addListener(platform.events.loginError, onLoginError);
    platform.addListener(platform.events.logoutSuccess, onLogoutSuccess);
    platform.addListener(platform.events.logoutError, onLogoutError);
    platform.addListener(platform.events.refreshSuccess, onRefreshSuccess);
    platform.addListener(platform.events.refreshError, onRefreshError);
    this._unbindEvents = () => {
      platform.removeListener(platform.events.loginSuccess, onLoginSuccess);
      platform.removeListener(platform.events.loginError, onLoginError);
      platform.removeListener(platform.events.logoutSuccess, onLogoutSuccess);
      platform.removeListener(platform.events.logoutError, onLogoutError);
      platform.removeListener(platform.events.refreshSuccess, onRefreshSuccess);
      platform.removeListener(platform.events.refreshError, onRefreshError);
    };
  }
  initialize() {
    let loggedIn;
    this.store.subscribe(async () => {
      if (
        this.status === moduleStatuses.pending &&
        this._locale.ready &&
        (!this._tabManager || this._tabManager.ready) &&
        (!this._environment || this._environment.ready)
      ) {
        this.store.dispatch({
          type: this.actionTypes.init,
        });
        const platform = this._client.service.platform();
        loggedIn = await platform.loggedIn();
        this._bindEvents();
        this.store.dispatch({
          type: this.actionTypes.initSuccess,
          loggedIn,
          token: loggedIn ? platform.auth().data() : null,
        });
      }
      if (
        (this._tabManager && this._tabManager.ready) &&
        this.ready
      ) {
        if (
          (loggedIn && this.loginStatus === loginStatus.notLoggedIn) ||
          (!loggedIn && this.loginStatus === loginStatus.loggedIn)
        ) {
          loggedIn = !loggedIn;
          this._tabManager.send('loginStatusChange', loggedIn);
        } else if (
          this._tabManager.event &&
          this._tabManager.event.name === 'loginStatusChange' &&
          this._tabManager.event.args[0] !== loggedIn
        ) {
          loggedIn = this._tabManager.event.args[0];
          this.store.dispatch({
            type: this.actionTypes.tabSync,
            loggedIn,
            token: loggedIn ? this._client.service.platform().auth().data() : null,
          });
        }
      }
      if (
        this.ready &&
        this._environment &&
        this._environment.changeCounter !== this._lastEnvironmentCounter
      ) {
        this._lastEnvironmentCounter = this._environment.changeCounter;
        this._bindEvents();
      }
    });
  }

  get redirectUri() {
    return this._redirectUri;
  }

  get proxyUri() {
    return this._proxyUri;
  }

  get ownerId() {
    return this.state.ownerId;
  }

  get endpointId() {
    return this.state.endpointId;
  }

  get status() {
    return this.state.status;
  }

  get ready() {
    return this.state.status === moduleStatuses.ready;
  }

  get loginStatus() {
    return this.state.loginStatus;
  }

  get isFreshLogin() {
    return this.state.freshLogin;
  }

  get proxyLoaded() {
    return this.state.proxyLoaded;
  }

  get proxyRetryCount() {
    return this.state.proxyRetryCount;
  }

  /**
   * @function
   * @param {String} options.username
   * @param {String} options.password
   * @param {String} options.extension
   * @param {Booleal|Number} options.remember
   * @param {String} params.code,
   * @param {String} params.redirectUri,
   * @return {Promise}
   * @description Login either with username/password or with authorization code
   */
  @proxify
  async login({ username, password, extension, remember, code, redirectUri }) {
    this.store.dispatch({
      type: this.actionTypes.login,
    });
    return this._client.service.platform().login({
      username,
      password,
      extension,
      remember,
      code,
      redirectUri,
    });
  }
  /**
   * @function
   * @param {String} options.redirectUri
   * @param {String} options.brandId
   * @param {Boolean} options.force
   * @return {String}
   * @description get OAuth page url
   */
  getLoginUrl({ redirectUri, state, brandId, display, prompt, force }) {
    return `${this._client.service.platform().loginUrl({
      redirectUri,
      state,
      brandId,
      display,
      prompt,
    })}${force ? '&force' : ''}`;
  }

  /**
   * @function
   * @description Triggers the beforeLogoutHandlers to run
   *  and then proceed to logout from ringcentral.
   */
  @proxify
  async logout() {
    this.store.dispatch({
      type: this.actionTypes.beforeLogout,
    });
    const handlers = [...this._beforeLogoutHandlers];
    try {
      for (const handler of handlers) {
        const result = await (async () => handler())();
        if (result) {
          this.store.dispatch({
            type: this.actionTypes.cancelLogout,
          });
          return Promise.reject(result);
        }
      }
    } catch (error) {
      this._alert.danger({
        message: authMessages.beforeLogoutError,
        payload: error,
      });
    }
    this.store.dispatch({
      type: this.actionTypes.logout,
    });
    return this._client.service.platform().logout();
  }

  /**
  * @function
  * @param {Function} handler
  * @returns {Function}
  */
  addBeforeLogoutHandler(handler) {
    this._beforeLogoutHandlers.add(handler);
    return () => {
      this.removeBeforeLogoutHandler(handler);
    };
  }

  /**
  * @function
  * @param {Function} handler
  */
  removeBeforeLogoutHandler(handler) {
    this._beforeLogoutHandlers.remove(handler);
  }

  @proxify
  async checkIsLoggedIn() {
    // SDK would return false when there's temporary network issues,
    // but we should not return use back to welcome string and should
    // still consider the user as being logged in.
    await this._client.service.platform().loggedIn();
    return this.state.loginStatus === loginStatus.loggedIn;
  }

  get loggedIn() {
    return this.state.loginStatus === loginStatus.loggedIn ||
      this.state.loginStatus === loginStatus.beforeLogout;
  }

  get notLoggedIn() {
    return this.state.loginStatus === loginStatus.notLoggedIn;
  }

  _createProxyFrame = (onLogin) => {
    this._proxyFrame = document.createElement('iframe');
    this._proxyFrame.src = this.proxyUri;
    this._proxyFrame.style.display = 'none';

    document.body.appendChild(this._proxyFrame);
    this._callbackHandler = async ({ origin, data }) => {
      // TODO origin check
      if (data) {
        const {
          callbackUri,
          proxyLoaded,
          fromLocalStorage,
        } = data;
        if (
          callbackUri &&
          (
            fromLocalStorage !== true ||
            (!this._tabManager || this._tabManager.active)
          )
        ) {
          try {
            const code = parseCallbackUri(callbackUri);
            if (code) {
              await this.login({
                code,
                redirectUri: this.redirectUri,
              });
              if (typeof onLogin === 'function') {
                onLogin();
              }
            }
          } catch (error) {
            let message;
            switch (error.message) {
              case 'invalid_request':
              case 'unauthorized_client':
              case 'access_denied':
              case 'unsupported_response_type':
              case 'invalid_scope':
                message = authMessages.accessDenied;
                break;
              case 'server_error':
              case 'temporarily_unavailable':
              default:
                message = authMessages.internalError;
                break;
            }

            this._alert.danger({
              message,
              payload: error,
            });
          }
        } else if (proxyLoaded) {
          clearTimeout(this._retryTimeoutId);
          this._retryTimeoutId = null;
          this.store.dispatch({
            type: this.actionTypes.proxyLoaded,
          });
        }
      }
    };
    window.addEventListener('message', this._callbackHandler);
    this._retryTimeoutId = setTimeout(() => {
      this._retrySetupProxyFrame(onLogin);
    }, this._defaultProxyRetry);
  }
  /**
   * @function
   * @description Create the proxy frame and append to document if available.
   * @param {Function} onLogin - Function to be called when user successfully logged in
   *  through oAuth.
   */
  @proxify
  async setupProxyFrame(onLogin) {
    if (
      typeof window !== 'undefined' &&
      typeof document !== 'undefined' &&
      this._proxyUri &&
      this._proxyUri !== '' &&
      !this._proxyFrame
    ) {
      this.store.dispatch({
        type: this.actionTypes.proxySetup,
      });
      this._createProxyFrame(onLogin);
    }
  }
  _retrySetupProxyFrame(onLogin) {
    this._retryTimeoutId = null;
    if (!this.proxyLoaded) {
      this.store.dispatch({
        type: this.actionTypes.proxyRetry,
      });
      this._destroyProxyFrame();
      this._createProxyFrame(onLogin);
    }
  }
  _destroyProxyFrame() {
    document.body.removeChild(this._proxyFrame);
    this._proxyFrame = null;
    window.removeEventListener('message', this._callbackHandler);
    this._callbackHandler = null;
  }

  @proxify
  async clearProxyFrame() {
    if (this._proxyFrame) {
      if (this._retryTimeoutId) {
        clearTimeout(this._retryTimeoutId);
        this._retryTimeoutId = null;
      }
      this._destroyProxyFrame();
      this.store.dispatch({
        type: this.actionTypes.proxyCleared,
      });
    }
  }

  @proxify
  openOAuthPage() {
    if (this.proxyLoaded) {
      const extendedQuery = qs.stringify({
        force: true,
        localeId: this._locale.currentLocale,
        ui_options: 'hide_remember_me hide_tos',
      });
      this._proxyFrame.contentWindow.postMessage({
        oAuthUri: `${this.getLoginUrl({
          redirectUri: this.redirectUri,
          brandId: this._brand.id,
          state: btoa(Date.now()),
          display: 'page',
        })}&${extendedQuery}`,
      }, '*');
    }
  }
}
