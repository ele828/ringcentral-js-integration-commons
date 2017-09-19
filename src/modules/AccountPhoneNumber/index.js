import 'core-js/fn/array/find';
import { Module } from '../../lib/di';
import fetchList from '../../lib/fetchList';
import DataFetcher from '../../lib/DataFetcher';
import removeUri from '../../lib/removeUri';

function simplifyPhoneNumber(number) {
  return removeUri(number);
}

/**
 * @class
 * @description Accound phone number module to get account phone number list
 */
@Module({
  deps: [
    'Client',
    { dep: 'AccountPhoneNumberOptions', optional: true }
  ]
})
export default class AccountPhoneNumber extends DataFetcher {
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
      name: 'accountPhoneNumber',
      client,
      fetchFunction: async () => (await fetchList(params => (
        client.account().phoneNumber().list(params)
      ))).map(simplifyPhoneNumber),
      ...options,
    });

    this.addSelector(
      'numbers',
      () => this.data,
      data => data || [],
    );

    this.addSelector(
      'extensionToPhoneNumberMap',
      () => this.numbers,
      (numbers) => {
        const numberMap = {};
        numbers.forEach((number) => {
          if (number.extension && number.extension.extensionNumber) {
            if (!numberMap[number.extension.extensionNumber]) {
              numberMap[number.extension.extensionNumber] = [];
            }
            numberMap[number.extension.extensionNumber].push(number);
          }
        });
        return numberMap;
      },
    );
  }

  get numbers() {
    return this._selectors.numbers();
  }

  get extensionToPhoneNumberMap() {
    return this._selectors.extensionToPhoneNumberMap();
  }
}
