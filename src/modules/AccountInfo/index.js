import mask from 'json-mask';
import { Module } from '../../lib/di';
import DataFetcher from '../../lib/DataFetcher';

const DEFAULT_MASK = [
  'id,mainNumber,status',
  'operator(id,extensionNumber)',
  'serviceInfo(brand(id,homeCountry(isoCode)))',
  `regionalSettings(${[
    'timezone(id,name,bias)',
    'homeCountry(id)',
    'language(localeCode)',
    'formattingLocale(localeCode)',
    'timeFormat',
  ].join(',')})`,
].join(',');

/**
 * @class
 * @description Accound info managing module.
 */
@Module({
  deps: ['Client', { dep: 'AccountInfoOptions', optional: true }]
})
export default class AccountInfo extends DataFetcher {
  /**
   * @constructor
   * @param {Object} params - params object
   * @param {Client} params.client - client module instance
   */
  constructor({
    client,
    ...options
  }) {
    super({
      name: 'accountInfo',
      client,
      fetchFunction: async () => mask(await client.account().get(), DEFAULT_MASK),
      ...options,
    });
    this.addSelector(
      'info',
      () => this.data,
      data => data || {},
    );
  }

  get info() {
    return this._selectors.info();
  }

  get id() {
    return this.info.id;
  }

  get country() {
    return this.info.serviceInfo && this.info.serviceInfo.brand.homeCountry;
  }

  get countryCode() {
    return (this.country && this.country.isoCode) || 'US';
  }

  get mainCompanyNumber() {
    return this.info.mainNumber;
  }
}
