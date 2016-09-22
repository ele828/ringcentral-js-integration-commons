import config from '../config';
import RcModule, { addModule, initializeModule } from '../src/lib/rc-module';
import RingCentral from 'ringcentral';
import { combineReducers, createStore } from 'redux';
import Loganberry from 'loganberry';
import { getProxyClient } from '../src/modules/proxy';
import getProxyServer from '../src/modules/proxy/get-proxy-server';
import Auth from '../src/modules/auth';
import Storage from '../src/modules/storage';
import Subscription from '../src/modules/subscription';

import EventTransport from '../src/lib/event-transport';


const logger = new Loganberry({
  prefix: 'demo',
});

const REDUCER = Symbol();

const transport = new EventTransport({
  prefix: 'test',
  timeout: 90,
});

class Phone extends RcModule {
  constructor(options) {
    super(options);
    const {
      apiSettings,
    } = options;
    this::addModule('sdk', new RingCentral(apiSettings));
    this::addModule('auth', new Auth({
      ...options,
      platform: this.sdk.platform(),
      getState: () => this.state.auth,
    }));
    this::addModule('storage', new Storage({
      auth: this.auth,
      getState: () => this.state.storage,
    }));

    this::addModule('subscription', new Subscription({
      ...options,
      auth: this.auth,
      sdk: this.sdk,
      platform: this.sdk.platform(),
      getState: () => this.state.subscription,
    }));

    this[REDUCER] = combineReducers({
      auth: this.auth.reducer,
      subscription: this.subscription.reducer,
      storage: this.storage.reducer,
    });
  }
  get reducer() {
    return this[REDUCER];
  }
}

const Server = getProxyServer(Phone);


const server = new Server({
  apiSettings: config.sdk,
  transport,
});
window.server = server;
const serverStore = createStore(server.reducer);
// serverStore.subscribe(() => {
//   logger.trace(JSON.stringify(['after dispatch', serverStore.getState()], null, 2));
// });

server::initializeModule(serverStore);
setTimeout(() => {
  const Client = getProxyClient(Phone);
  const proxy = new Client({
    apiSettings: config.sdk,
    transport,
  });
  const store = createStore(proxy.reducer);
  // store.subscribe(() => {
  //   logger.trace(JSON.stringify(store.getState(), null, 2));
  // });
  proxy::initializeModule(store);

  proxy.auth.isLoggedIn().then(loggedIn => {
    console.log(proxy.auth.loginUrl({
      redirectUri: 'localhost:8080/redirect',
    }));

    proxy.subscription.subscribe(
      '/restapi/v1.0/account/~/extension/~/presence?detailedTelephonyState=true'
    );
    proxy.subscription.on(
      proxy.subscription.eventTypes.notification,
      (message) => {
        logger.info(message);
      }
    );
    console.log(proxy.storage.getItem('test'));
    proxy.storage.setItem('test', new Date());
    if (!loggedIn) {
      proxy.auth.login({
        ...config.user,
      });
    }
  }).catch(e => {
    logger.error(e);
  });

  global.proxy = proxy;
}, 5000);