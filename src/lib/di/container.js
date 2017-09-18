export default class Container {
  constructor() {
    this._map = new Map();
  }

  get(token) {
    if (!this._map.has(token)) {
      throw new Error(`Can not find token {${token}} in Container`);
    }
    return this._map.get(token);
  }

  set(token, metadata) {
    if (this._map.has(token)) {
      throw new Error(`Can not save duplicated token {${token}} to Container`);
    }
    return this._map.set(token, metadata);
  }

  has(token) {
    return this._map.has(token);
  }

  entries() {
    return this._map.entries();
  }
}
