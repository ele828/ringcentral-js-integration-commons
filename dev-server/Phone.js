import 'isomorphic-fetch';
import SDK from 'ringcentral';
import RingCentralClient from 'ringcentral-client';
import { combineReducers } from 'redux';

import RcModule from '../src/lib/RcModule';

import AccountExtension from '../src/modules/AccountExtension';
import AccountInfo from '../src/modules/AccountInfo';
import AccountPhoneNumber from '../src/modules/AccountPhoneNumber';
import ActivityMatcher from '../src/modules/ActivityMatcher';
import AddressBook from '../src/modules/AddressBook';
import Alert from '../src/modules/Alert';
import Auth from '../src/modules/Auth';
import BlockedNumber from '../src/modules/BlockedNumber';
import Brand from '../src/modules/Brand';
import Call from '../src/modules/Call';
import CallHistory from '../src/modules/CallHistory';
import CallingSettings from '../src/modules/CallingSettings';
import CallLog from '../src/modules/CallLog';
import CallLogger from '../src/modules/CallLogger';
import CallMonitor from '../src/modules/CallMonitor';
import ComposeText from '../src/modules/ComposeText';
import Conference from '../src/modules/Conference';
import ConnectivityMonitor from '../src/modules/ConnectivityMonitor';
import ContactMatcher from '../src/modules/ContactMatcher';
import Contacts from '../src/modules/Contacts';
import ContactSearch from '../src/modules/ContactSearch';
import Conversation from '../src/modules/Conversation';
import ConversationLogger from '../src/modules/ConversationLogger';
import ConversationMatcher from '../src/modules/ConversationMatcher';
import DateTimeFormat from '../src/modules/DateTimeFormat';
import DetailedPresence from '../src/modules/DetailedPresence';
import DialingPlan from '../src/modules/DialingPlan';
import Environment from '../src/modules/Environment';
import ExtensionDevice from '../src/modules/ExtensionDevice';
import ExtensionInfo from '../src/modules/ExtensionInfo';
import ExtensionPhoneNumber from '../src/modules/ExtensionPhoneNumber';
import ForwardingNumber from '../src/modules/ForwardingNumber';
import GlobalStorage from '../src/modules/GlobalStorage';
import Locale from '../src/modules/Locale';
import Messages from '../src/modules/Messages';
import MessageSender from '../src/modules/MessageSender';
import MessageStore from '../src/modules/MessageStore';
import NumberValidate from '../src/modules/NumberValidate';
import RateLimiter from '../src/modules/RateLimiter';
import RegionSettings from '../src/modules/RegionSettings';
import Ringout from '../src/modules/Ringout';
import RolesAndPermissions from '../src/modules/RolesAndPermissions';
import Softphone from '../src/modules/Softphone';
import Storage from '../src/modules/Storage';
import Subscription from '../src/modules/Subscription';
import TabManager from '../src/modules/TabManager';
import Webphone from '../src/modules/Webphone';
import RecentMessages from '../src/modules/RecentMessages';
import RecentCalls from '../src/modules/RecentCalls';
import Analytics from '../src/modules/Analytics';

import config from './config';


export default class Phone extends RcModule {
  constructor({
    useTabManager = true,
    extensionMode,
    ...options,
  } = {}) {
    super({
      ...options,
    });

    const reducers = {};
    const proxyReducers = {};
    this.addModule('client', new RingCentralClient(new SDK({
      ...config,
      clearCacheOnRefreshError: false,
    })));

    this.addModule('alert', new Alert({
      getState: () => this.state.alert,
    }));
    reducers.alert = this.alert.reducer;


    this.addModule('brand', new Brand({
      id: '1210',
      name: 'RingCentral',
      fullName: 'RingCentral',
      getState: () => this.state.brand,
    }));
    reducers.brand = this.brand.reducer;

    this.addModule('locale', new Locale({
      getState: () => this.state.locale,
      getProxyState: () => this.proxyState.locale,
    }));
    reducers.locale = this.locale.reducer;
    proxyReducers.locale = this.locale.proxyReducer;

    if (useTabManager) {
      this.addModule('tabManager', new TabManager({
        getState: () => this.state.tabManager,
      }));
      reducers.tabManager = this.tabManager.reducer;
    }
    this.addModule('globalStorage', new GlobalStorage({
      getState: () => this.state.globalStorage,
    }));
    reducers.globalStorage = this.globalStorage.reducer;
    this.addModule('environment', new Environment({
      client: this.client,
      globalStorage: this.globalStorage,
      sdkConfig: {
        ...config,
      },
      getState: () => this.state.environment,
    }));
    reducers.environment = this.environment.reducer;
    this.addModule('connectivityMonitor', new ConnectivityMonitor({
      alert: this.alert,
      client: this.client,
      environment: this.environment,
      checkConnectionFunc: async () => {
        await fetch('//pubsub.pubnub.com/time/0');
      },
      getState: () => this.state.connectivityMonitor,
    }));
    reducers.connectivityMonitor = this.connectivityMonitor.reducer;
    this.addModule('auth', new Auth({
      alert: this.alert,
      brand: this.brand,
      client: this.client,
      environment: this.environment,
      locale: this.locale,
      tabManager: this.tabManager,
      getState: () => this.state.auth,
    }));
    reducers.auth = this.auth.reducer;
    this.addModule('storage', new Storage({
      auth: this.auth,
      getState: () => this.state.storage,
    }));
    reducers.storage = this.storage.reducer;
    this.addModule('rateLimiter', new RateLimiter({
      alert: this.alert,
      client: this.client,
      environment: this.environment,
      globalStorage: this.globalStorage,
      getState: () => this.state.rateLimiter,
    }));
    reducers.rateLimiter = this.rateLimiter.reducer;
    this.addModule('extensionDevice', new ExtensionDevice({
      auth: this.auth,
      client: this.client,
      storage: this.storage,
      tabManager: this.tabManager,
      getState: () => this.state.extensionDevice,
    }));
    reducers.extensionDevice = this.extensionDevice.reducer;
    this.addModule('softphone', new Softphone({
      brand: this.brand,
      extensionMode,
    }));
    reducers.softphone = this.softphone.reducer;
    this.addModule('ringout', new Ringout({
      auth: this.auth,
      client: this.client,
      getState: () => this.state.ringout,
    }));
    reducers.ringout = this.ringout.reducer;
    this.addModule('accountInfo', new AccountInfo({
      auth: this.auth,
      client: this.client,
      storage: this.storage,
      tabManager: this.tabManager,
      getState: () => this.state.accountInfo,
    }));
    reducers.accountInfo = this.accountInfo.reducer;
    this.addModule('extensionInfo', new ExtensionInfo({
      auth: this.auth,
      client: this.client,
      storage: this.storage,
      tabManager: this.tabManager,
      getState: () => this.state.extensionInfo,
    }));
    reducers.extensionInfo = this.extensionInfo.reducer;
    this.addModule('rolesAndPermissions', new RolesAndPermissions({
      auth: this.auth,
      client: this.client,
      storage: this.storage,
      extensionInfo: this.extensionInfo,
      tabManager: this.tabManager,
      getState: () => this.state.rolesAndPermissions,
    }));
    reducers.rolesAndPermissions = this.rolesAndPermissions.reducer;
    this.addModule('dialingPlan', new DialingPlan({
      auth: this.auth,
      client: this.client,
      storage: this.storage,
      tabManager: this.tabManager,
      getState: () => this.state.dialingPlan,
    }));
    reducers.dialingPlan = this.dialingPlan.reducer;
    this.addModule('extensionPhoneNumber', new ExtensionPhoneNumber({
      auth: this.auth,
      client: this.client,
      storage: this.storage,
      tabManager: this.tabManager,
      getState: () => this.state.extensionPhoneNumber,
    }));
    reducers.extensionPhoneNumber = this.extensionPhoneNumber.reducer;
    this.addModule('forwardingNumber', new ForwardingNumber({
      auth: this.auth,
      client: this.client,
      storage: this.storage,
      tabManager: this.tabManager,
      getState: () => this.state.forwardingNumber,
    }));
    reducers.forwardingNumber = this.forwardingNumber.reducer;
    this.addModule('blockedNumber', new BlockedNumber({
      auth: this.auth,
      client: this.client,
      storage: this.storage,
      tabManager: this.tabManager,
      getState: () => this.state.blockedNumber,
    }));
    reducers.blockedNumber = this.blockedNumber.reducer;
    this.addModule('contactMatcher', new ContactMatcher({
      storage: this.storage,
      getState: () => this.state.contactMatcher,
    }));
    reducers.contactMatcher = this.contactMatcher.reducer;
    this.addModule('subscription', new Subscription({
      auth: this.auth,
      client: this.client,
      storage: this.storage,
      tabManager: this.tabManager,
      connectivityMonitor: this.connectivityMonitor,
      getState: () => this.state.subscription,
    }));
    reducers.subscription = this.subscription.reducer;
    this.addModule('regionSettings', new RegionSettings({
      storage: this.storage,
      extensionInfo: this.extensionInfo,
      dialingPlan: this.dialingPlan,
      alert: this.alert,
      tabManager: this.tabManager,
      getState: () => this.state.regionSettings,
    }));
    reducers.regionSettings = this.regionSettings.reducer;
    this.addModule('accountExtension', new AccountExtension({
      auth: this.auth,
      client: this.client,
      storage: this.storage,
      subscription: this.subscription,
      getState: () => this.state.accountExtension,
    }));
    reducers.accountExtension = this.accountExtension.reducer;
    this.addModule('numberValidate', new NumberValidate({
      brand: this.brand,
      client: this.client,
      accountExtension: this.accountExtension,
      regionSettings: this.regionSettings,
      accountInfo: this.accountInfo,
      getState: () => this.state.numberValidate,
    }));
    reducers.numberValidate = this.numberValidate.reducer;
    this.addModule('webphone', new Webphone({
      appKey: config.appKey,
      appName: 'RingCentral Integration',
      appVersion: '0.1.0',
      alert: this.alert,
      auth: this.auth,
      client: this.client,
      contactMatcher: this.contactMatcher,
      extensionDevice: this.extensionDevice,
      globalStorage: this.globalStorage,
      rolesAndPermissions: this.rolesAndPermissions,
      storage: this.storage,
      numberValidate: this.numberValidate,
      getState: () => this.state.webphone,
    }));
    reducers.webphone = this.webphone.reducer;
    this.addModule('callingSettings', new CallingSettings({
      alert: this.alert,
      brand: this.brand,
      extensionInfo: this.extensionInfo,
      extensionPhoneNumber: this.extensionPhoneNumber,
      forwardingNumber: this.forwardingNumber,
      storage: this.storage,
      rolesAndPermissions: this.rolesAndPermissions,
      tabManager: this.tabManager,
      webphone: this.webphone,
      getState: () => this.state.callingSettings,
    }));
    reducers.callingSettings = this.callingSettings.reducer;
    this.addModule('detailedPresence', new DetailedPresence({
      auth: this.auth,
      client: this.client,
      subscription: this.subscription,
      storage: this.storage,
      connectivityMonitor: this.connectivityMonitor,
      getState: () => this.state.detailedPresence,
    }));
    reducers.detailedPresence = this.detailedPresence.reducer;
    this.addModule('callLog', new CallLog({
      auth: this.auth,
      client: this.client,
      storage: this.storage,
      subscription: this.subscription,
      rolesAndPermissions: this.rolesAndPermissions,
      getState: () => this.state.callLog,
    }));
    reducers.callLog = this.callLog.reducer;
    this.addModule('call', new Call({
      alert: this.alert,
      client: this.client,
      storage: this.storage,
      callingSettings: this.callingSettings,
      regionSettings: this.regionSettings,
      softphone: this.softphone,
      ringout: this.ringout,
      webphone: this.webphone,
      numberValidate: this.numberValidate,
      extensionPhoneNumber: this.extensionPhoneNumber,
      getState: () => this.state.call,
    }));
    reducers.call = this.call.reducer;
    // this.addModule('presence', new Presence({
    //   auth: this.auth,
    //   client: this.client,
    //   subscription: this.subscription,
    //   getState: () => this.state.presence,
    // }));
    // reducers.presence = this.presence.reducer;
    this.addModule('messageSender', new MessageSender({
      alert: this.alert,
      client: this.client,
      getState: () => this.state.messageSender,
      extensionPhoneNumber: this.extensionPhoneNumber,
      extensionInfo: this.extensionInfo,
      numberValidate: this.numberValidate,
    }));
    reducers.messageSender = this.messageSender.reducer;
    this.addModule('composeText', new ComposeText({
      alert: this.alert,
      auth: this.auth,
      storage: this.storage,
      getState: () => this.state.composeText,
      messageSender: this.messageSender,
      numberValidate: this.numberValidate,
      contactSearch: this.contactSearch,
    }));
    reducers.composeText = this.composeText.reducer;
    this.addModule('callMonitor', new CallMonitor({
      call: this.call,
      accountInfo: this.accountInfo,
      detailedPresence: this.detailedPresence,
      webphone: this.webphone,
      storage: this.storage,
      getState: () => this.state.callMonitor,
    }));
    reducers.callMonitor = this.callMonitor.reducer;
    this.addModule('callHistory', new CallHistory({
      accountInfo: this.accountInfo,
      callLog: this.callLog,
      callMonitor: this.callMonitor,
      getState: () => this.state.callHistory,
    }));
    reducers.callHistory = this.callHistory.reducer;
    this.addModule('activityMatcher', new ActivityMatcher({
      storage: this.storage,
      getState: () => this.state.activityMatcher,
    }));
    reducers.activityMatcher = this.activityMatcher.reducer;
    this.addModule('conversationMatcher', new ConversationMatcher({
      storage: this.storage,
      getState: () => this.state.conversationMatcher,
    }));
    reducers.conversationMatcher = this.conversationMatcher.reducer;
    this.addModule('contactSearch', new ContactSearch({
      auth: this.auth,
      storage: this.storage,
      getState: () => this.state.contactSearch,
    }));
    reducers.contactSearch = this.contactSearch.reducer;
    this.contactSearch.addSearchSource({
      sourceName: 'test',
      searchFn: ({ searchString }) => [{
        entityType: 'account',
        name: ({ searchString }),
        phoneNumber: '+1234567890',
        phoneType: 'phone',
      }],
      formatFn: entities => entities,
      readyCheckFn: () => true,
    });
    this.addModule('messageStore', new MessageStore({
      alert: this.alert,
      auth: this.auth,
      client: this.client,
      storage: this.storage,
      subscription: this.subscription,
      connectivityMonitor: this.connectivityMonitor,
      getState: () => this.state.messageStore,
    }));
    reducers.messageStore = this.messageStore.reducer;
    this.addModule('conversation', new Conversation({
      auth: this.auth,
      messageSender: this.messageSender,
      extensionInfo: this.extensionInfo,
      messageStore: this.messageStore,
      getState: () => this.state.conversation,
    }));
    reducers.conversation = this.conversation.reducer;
    this.addModule('dateTimeFormat', new DateTimeFormat({
      locale: this.locale,
      storage: this.storage,
      getState: () => this.state.dateTimeFormat,
      getProxyState: () => this.proxyState.dateTimeFormat,
    }));
    reducers.dateTimeFormat = this.dateTimeFormat.reducer;
    proxyReducers.dateTimeFormat = this.dateTimeFormat.proxyReducer;
    this.addModule('conference', new Conference({
      auth: this.auth,
      client: this.client,
      regionSettings: this.regionSettings,
      getState: () => this.state.conference,
    }));
    reducers.conference = this.conference.reducer;
    this.addModule('callLogger', new CallLogger({
      storage: this.storage,
      callMonitor: this.callMonitor,
      activityMatcher: this.activityMatcher,
      contactMatcher: this.contactMatcher,
      logFunction: async () => { },
      readyCheckFunction: () => true,
      getState: () => this.state.callLogger,
    }));
    reducers.callLogger = this.callLogger.reducer;
    this.addModule('accountPhoneNumber', new AccountPhoneNumber({
      auth: this.auth,
      client: this.client,
      storage: this.storage,
      tabManager: this.tabManager,
      getState: () => this.state.accountPhoneNumber,
    }));
    reducers.accountPhoneNumber = this.accountPhoneNumber.reducer;
    this.addModule('addressBook', new AddressBook({
      client: this.client,
      auth: this.auth,
      storage: this.storage,
      getState: () => this.state.addressBook,
    }));
    reducers.addressBook = this.addressBook.reducer;
    this.addModule('contacts', new Contacts({
      alert: this.alert,
      client: this.client,
      addressBook: this.addressBook,
      accountPhoneNumber: this.accountPhoneNumber,
      accountExtension: this.accountExtension,
      getState: () => this.state.contacts,
    }));
    reducers.contacts = this.contacts.reducer;
    this.contactMatcher.addSearchProvider({
      name: 'contacts',
      searchFn: async ({ queries }) => this.contacts.matchContacts({ phoneNumbers: queries }),
      readyCheckFn: () => this.contacts.ready,
    });
    this.addModule('conversationLogger', new ConversationLogger({
      auth: this.auth,
      contactMatcher: this.contactMatcher,
      conversationMatcher: this.conversationMatcher,
      dateTimeFormat: this.dateTimeFormat,
      extensionInfo: this.extensionInfo,
      messageStore: this.messageStore,
      rolesAndPermissions: this.rolesAndPermissions,
      storage: this.storage,
      tabManager: this.tabManager,
      logFunction: async () => { },
      readyCheckFunction: () => true,
      getState: () => this.state.conversationLogger,
    }));
    reducers.conversationLogger = this.conversationLogger.reducer;
    this.addModule('messages', new Messages({
      contactMatcher: this.contactMatcher,
      messageStore: this.messageStore,
      extensionInfo: this.extensionInfo,
      conversationLogger: this.conversationLogger,
      getState: () => this.state.messages,
    }));
    reducers.messages = this.messages.reducer;
    this.addModule('recentMessages', new RecentMessages({
      client: this.client,
      messageStore: this.messageStore,
      getState: () => this.state.recentMessages
    }));
    reducers.recentMessages = this.recentMessages.reducer;
    this.addModule('recentCalls', new RecentCalls({
      client: this.client,
      callHistory: this.callHistory,
      getState: () => this.state.recentCalls
    }));
    reducers.recentCalls = this.recentCalls.reducer;

    this._reducer = combineReducers({
      ...reducers,
      // lastAction: (state = null, action) => {
      //   console.log(action);
      //   return action;
      // },
    });
    this._proxyReducer = combineReducers({
      ...proxyReducers,
    });
  }
}
