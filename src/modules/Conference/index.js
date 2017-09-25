import mask from 'json-mask';
import { Module } from '../../lib/di';
import DataFetcher from '../../lib/DataFetcher';

const DEFAULT_MASK = 'phoneNumber,hostCode,participantCode,phoneNumbers(country,phoneNumber)';

/**
 * @class
 * @description Conference managing module
 */
@Module({
  deps: ['Client', 'RegionSettings', { dep: 'ConferenceOptions', optional: true }]
})
export default class Conference extends DataFetcher {
  /**
   * @constructor
   * @param {Object} params - params object
   * @param {RegionSettings} params.regionSettings - regionSettings module instance
   * @param {Client} params.client - client module instance
   */
  constructor({
    client,
    regionSettings,
    ...options
  }) {
    super({
      name: 'conference',
      client,
      fetchFunction: async () => mask(
        await client.account().extension().conferencing().get(),
        DEFAULT_MASK,
      ),
      ...options,
    });
    this.addSelector(
      'conferenceNumbers',
      () => regionSettings.countryCode,
      () => this.data,
      (isoCode, data) => {
        if (!data) {
          return data;
        }
        const countrys = data.phoneNumbers.find(value => value.country.isoCode === isoCode);
        if (typeof countrys === 'undefined') {
          return data;
        }
        return {
          ...data,
          phoneNumber: countrys.phoneNumber,
          phoneNumbers: data.phoneNumbers.filter(value =>
            value.phoneNumber !== countrys.phoneNumber),
        };
      }
    );
  }

  get conferenceNumbers() {
    return this._selectors.conferenceNumbers();
  }
}
