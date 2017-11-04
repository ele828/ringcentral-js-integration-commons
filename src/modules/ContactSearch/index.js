import RcModule from '../../lib/RcModule';
import { Module } from '../../lib/di';
import loginStatus from '../../modules/Auth/loginStatus';
import proxify from '../../lib/proxy/proxify';

import actionTypes from './actionTypes';
import getContactSearchReducer from './getContactSearchReducer';
import getCacheReducer from './getCacheReducer';

export const AllContactSourceName = 'all';
export const DefaultMinimalSearchLength = 3;
export const DefaultContactListPageSize = 20;

export function uniqueContactItems(result) {
  let items = result || [];
  // remove duplicated referencing
  items = items.filter((value, index, arr) =>
    arr.indexOf(value) === index
  );
  // remove duplicated items by id
  const hash = {};
  const unique = [];
  items.forEach((item) => {
    const itemId = `${item.type}${item.id}`;
    if (!hash[itemId]) {
      hash[itemId] = 1;
      unique.push(item);
    }
  });
  return unique;
}

const NON_ALPHABET_RE = /[^a-z]/i;
export function sortContactItemsByName(result) {
  const items = result || [];
  items.sort((a, b) => {
    const name1 = (a.name || '').toLowerCase().replace(/^\s\s*/, ''); // trim start
    const name2 = (b.name || '').toLowerCase().replace(/^\s\s*/, ''); // trim start
    const isNumber1 = /^[0-9]/.test(name1);
    const isNumber2 = /^[0-9]/.test(name2);
    // Empty string should be put at the end
    if (name1.length <= 0 || name2.length <= 0) {
      return -name1.localeCompare(name2);
    }
    if (isNumber1 && isNumber2) {
      return name1.localeCompare(name2);
    }
    if (isNumber1 || isNumber2) {
      // put number name at last
      return -name1.localeCompare(name2);
    }
    if (NON_ALPHABET_RE.test(name1[0]) && !NON_ALPHABET_RE.test(name2[0])) {
      return 1;
    }
    if (!NON_ALPHABET_RE.test(name1[0]) && NON_ALPHABET_RE.test(name2[0])) {
      return -1;
    }
    return name1.localeCompare(name2);
  });
  return items;
}

const POUND_SIGN = '#';
export function groupByFirstLetterOfName(contactItems) {
  const groups = [];
  if (contactItems && contactItems.length) {
    let group;
    contactItems.forEach((contact) => {
      const name = (contact.name || '').replace(/^\s\s*/, ''); // trim start
      let letter = null;
      if (name.length <= 0 || NON_ALPHABET_RE.test(name[0])) {
        letter = POUND_SIGN;
      } else {
        letter = (name[0] || '').toLocaleUpperCase();
      }
      if (!group || group.caption !== letter) {
        group = {
          contacts: [],
          caption: letter,
          id: letter,
        };
        groups.push(group);
      }
      group.contacts.push(contact);
    });
  }
  return groups;
}

/**
 * @class
 * @description Contact search module
 */
@Module({
  deps: [
    'Auth',
    'Storage',
    { dep: 'ContactSearchOptions', optional: true }
  ]
})
export default class ContactSearch extends RcModule {
  /**
   * @constructor
   * @param {Object} params - params object
   * @param {Auth} params.auth - auth module instance
   * @param {Storage} params.storage - storage module instance
   * @param {String} params.storageKey - storage key for storage module default "contactSearchCache"
   * @param {Number} params.minimalSearchLength - minimal search text length, default 3 characters
   * @param {Number} params.ttl - timestamp of local cache, default 5 mins
   */
  constructor({
    auth,
    storage,
    storageKey = 'contactSearchCache',
    minimalSearchLength = DefaultMinimalSearchLength,
    contactListPageSize = DefaultContactListPageSize,
    ttl = 5 * 60 * 1000, // 5 minutes
    ...options,
  }) {
    super({
      ...options,
      actionTypes,
    });
    this._auth = auth;
    this._storage = storage;
    this._storageKey = storageKey;
    this._minimalSearchLength = minimalSearchLength;
    this._contactListPageSize = contactListPageSize;
    this._ttl = ttl;
    this._searchSources = new Map();
    this._searchSourcesFormat = new Map();
    this._searchSourcesCheck = new Map();
    if (this._storage) {
      this._reducer = getContactSearchReducer(this.actionTypes);
      this._storage.registerReducer({
        key: this._storageKey,
        reducer: getCacheReducer(this.actionTypes)
      });
    } else {
      this._reducer = getContactSearchReducer(this.actionTypes, {
        cache: getCacheReducer(this.actionTypes),
      });
    }

    this.addSelector(
      'contactSourceNames',
      () => this._searchSources.size,
      () => {
        const names = [AllContactSourceName];
        for (const sourceName of this._searchSources.keys()) {
          names.push(sourceName);
        }
        return names;
      }
    );

    this.addSelector(
      'contactGroups',
      () => this.searching && this.searching.result,
      (result) => {
        const pageSize = this._contactListPageSize;
        const pageNumber = this.searchCriteria.pageNumber || 1;
        const count = pageNumber * pageSize;
        let items = uniqueContactItems(result);
        items = sortContactItemsByName(items);
        items = items.slice(0, count);
        const groups = groupByFirstLetterOfName(items);
        return groups;
      }
    );
  }
  initialize() {
    this.store.subscribe(() => this._onStateChange());
  }

  _onStateChange() {
    if (this._shouldInit()) {
      this._initModuleStatus();
    } else if (this._shouldReset()) {
      this._resetModuleStatus();
      this._clearStateCache();
      this._restSearchCriteria();
    }
  }

  _shouldInit() {
    return (
      this._auth.loginStatus === loginStatus.loggedIn &&
      (!this._storage || this._storage.ready) &&
      this._readyCheck() &&
      !this.ready
    );
  }

  _shouldReset() {
    return (
      (
        this._auth.loginStatus !== loginStatus.loggedIn ||
        (this._storage && !this._storage.ready)
      ) &&
      this.ready
    );
  }

  _initModuleStatus() {
    this.store.dispatch({
      type: this.actionTypes.initSuccess,
    });
  }

  _clearStateCache() {
    this.store.dispatch({
      type: this.actionTypes.cleanUp,
    });
  }

  _restSearchCriteria() {
    this.store.dispatch({
      type: this.actionTypes.restSearchCriteria,
    });
  }

  _resetModuleStatus() {
    this.store.dispatch({
      type: this.actionTypes.resetSuccess,
    });
  }

  resetSearchStatus() {
    this.store.dispatch({
      type: this.actionTypes.reset,
    });
  }

  addSearchSource({ sourceName, searchFn, readyCheckFn, formatFn }) {
    if (!sourceName) {
      throw new Error('ContactSearch: "sourceName" is required.');
    }
    if (this._searchSources.has(sourceName)) {
      throw new Error(`ContactSearch: A search source named "${sourceName}" already exists`);
    }
    if (this._searchSourcesCheck.has(sourceName)) {
      throw new Error(`ContactSearch: A search source check named "${sourceName}" already exists`);
    }
    if (this._searchSourcesFormat.has(sourceName)) {
      throw new Error(`ContactSearch: A search source format named "${sourceName}" already exists`);
    }
    if (typeof searchFn !== 'function') {
      throw new Error('ContactSearch: searchFn must be a function');
    }
    if (typeof readyCheckFn !== 'function') {
      throw new Error('ContactSearch: readyCheckFn must be a function');
    }
    if (typeof formatFn !== 'function') {
      throw new Error('ContactSearch: formatFn must be a function');
    }
    this._searchSources.set(sourceName, searchFn);
    this._searchSourcesFormat.set(sourceName, formatFn);
    this._searchSourcesCheck.set(sourceName, readyCheckFn);
  }

  @proxify
  async search({ searchString }) {
    if (!this.ready || (searchString.length < this._minimalSearchLength)) {
      this.store.dispatch({
        type: this.actionTypes.prepareSearch,
      });
      return;
    }
    this._clearTimeout();
    this._timeoutId = setTimeout(async () => {
      const searching = { ...this.state.searching };
      await this.search({ searchString: undefined });
      await this.search(searching);
    }, this._ttl);
    const searchOnSources = Array.from(this._searchSources.keys());
    for (const sourceName of searchOnSources) {
      await this._searchSource({
        searchOnSources,
        sourceName,
        searchString,
      });
    }
  }

  _clearTimeout() {
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
    }
  }

  @proxify
  async searchPlus({ sourceName, searchString, pageNumber }) {
    if (!this.ready) {
      this.store.dispatch({
        type: this.actionTypes.prepareSearch,
      });
      return;
    }
    this._clearTimeout();
    this._timeoutId = setTimeout(async () => {
      const searchCriteria = { ...this.state.searchCriteria };
      await this.searchPlus({ ...this.state.searchCriteria, searchString: undefined });
      await this.searchPlus(searchCriteria);
    }, this._ttl);
    this.store.dispatch({
      type: this.actionTypes.updateSearchCriteria,
      sourceName,
      searchString,
      pageNumber,
    });

    const searchOnSources = (!sourceName || sourceName === AllContactSourceName) ?
      Array.from(this._searchSources.keys()) :
      [sourceName];

    for (const source of searchOnSources) {
      await this._searchSource({
        searchOnSources,
        sourceName: source,
        searchString,
      });
    }
  }
  // TODO Need to refactor, remove cache, and update data in real time.
  @proxify
  async _searchSource({ searchOnSources, sourceName, searchString }) {
    this.store.dispatch({
      type: this.actionTypes.search,
    });
    try {
      let entities = null;
      entities = this._searchFromCache({ sourceName, searchString });
      if (entities) {
        this._loadSearching({ searchOnSources, searchString, entities });
        return;
      }
      entities = await this._searchSources.get(sourceName)({
        searchString,
      });
      entities = this._searchSourcesFormat.get(sourceName)(entities);
      this._loadSearching({ searchOnSources, searchString, entities });
      this._saveSearching({ sourceName, searchString, entities });
    } catch (error) {
      this._onSearchError();
    }
  }

  _quickSort({ result = [], searchString = '' }) {
    const list = [...result];
    if (searchString === '') {
      return list;
    }
    return list.sort((current, next) => {
      const currentName = current.name || '';
      const currentPhoneNumber = current.phoneNumber || '';
      const nextName = next.name || '';
      const nextPhoneNumber = next.phoneNumber || '';
      const isSort = (
        currentName.indexOf(searchString) < nextName.indexOf(searchString) ||
        currentPhoneNumber.indexOf(searchString) < nextPhoneNumber.indexOf(searchString)
      );
      return isSort;
    });
  }

  _searchFromCache({ sourceName, searchString }) {
    const key = `${sourceName}-${searchString}`;
    const searching = this.cache && this.cache.contactSearch && this.cache.contactSearch[key];
    const now = Date.now();
    if (searching && (now - searching.timestamp) < this._ttl) {
      return searching.entities;
    }
    return null;
  }

  _readyCheck() {
    for (const sourceName of this._searchSourcesCheck.keys()) {
      if (!this._searchSourcesCheck.get(sourceName)()) {
        return false;
      }
    }
    return true;
  }

  _onSearchError() {
    this.store.dispatch({
      type: this.actionTypes.searchError,
    });
  }

  _loadSearching({ searchOnSources, searchString, entities }) {
    this.store.dispatch({
      type: this.actionTypes.searchSuccess,
      searchOnSources,
      searchString,
      entities,
    });
  }

  _saveSearching({ sourceName, searchString, entities }) {
    this.store.dispatch({
      type: this.actionTypes.save,
      sourceName,
      searchString,
      entities,
      ttl: this._ttl,
    });
  }

  get cache() {
    return this._storage ?
      this._storage.getItem(this._storageKey) :
      this.state.cache;
  }

  get status() {
    return this.state.status;
  }

  get searchStatus() {
    return this.state.searchStatus;
  }

  get searching() {
    return this.state.searching;
  }

  get searchResult() {
    return this.searching ? this.searching.result : [];
  }

  get searchCriteria() {
    return this.state.searchCriteria;
  }

  get contactSourceNames() {
    return this._selectors.contactSourceNames();
  }

  get contactGroups() {
    return this._selectors.contactGroups();
  }

  get sortedResult() {
    return this._quickSort(this.searching);
  }
}
