import { Module } from '../../lib/di';
import DataFetcher from '../../lib/DataFetcher';
import sleep from '../../lib/sleep';
import fetchList from '../../lib/fetchList';
import subscriptionFilters from '../../enums/subscriptionFilters';
import {
  getDataReducer
} from './getActiveCallsReducer';

const presenceRegExp = /\/presence\?detailedTelephonyState=true$/;
const FETCH_DELAY = 1000;
const DEFAULT_TTL = 5 * 60 * 1000;

/**
 * @class
 * @description Active calls list manaing module
 */
@Module({
  deps: [
    'Client',
    'TabManager',
    { dep: 'AccountPhoneNumberOptions', optional: true }
  ]
})
export default class ActiveCalls extends DataFetcher {
  /**
   * @constructor
   * @param {Object} params - params object
   * @param {Client} params.client - client module instance
   * @param {Number} params.ttl - local cache timestamp, default 5 mins.
   */
  constructor({
    client,
    tabManager, // do not pass tabManager to DataFetcher as data is not shared in localStorage
    ttl = DEFAULT_TTL,
    ...options
  }) {
    super({
      ...options,
      name: 'activeCalls',
      client,
      ttl,
      getDataReducer,
      subscriptionFilters: [subscriptionFilters.detailedPresence],
      subscriptionHandler: async (message) => {
        if (presenceRegExp.test(message.event)) {
          const ownerId = this._auth.ownerId;
          await sleep(FETCH_DELAY);
          if (ownerId === this._auth.ownerId) {
            await this.fetchData();
          }
        }
      },
      fetchFunction: async () => fetchList(params => (
        this._client.account().extension().activeCalls().list(params)
      ))
    });
    this.addSelector(
      'calls',
      () => this.data,
      data => data || [],
    );
  }

  get calls() {
    return this._selectors.calls();
  }
}
