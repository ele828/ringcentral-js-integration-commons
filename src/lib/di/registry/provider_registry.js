/**
 * ProviderRegistry is a centralized structure for storing provider metadata.
 * It's a map data structure mapping Token to Provider.
 */
export default class ProviderRegistry {
  constructor() {
    this._map = new Map();
  }

  get(token) {
    if (!this._map.has(token)) {
      throw new Error(`Can not find token {${token}} in ProviderRegistry`);
    }
    return this._map.get(token);
  }

  set(token, provider) {
    if (this._map.has(token)) {
      throw new Error(`Can only register {${token}} once`);
    }
    return this._map.set(token, provider);
  }
}
