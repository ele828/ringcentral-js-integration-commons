/**
 * Module registry is used to store module metadata.
 */
export default class ModuleRegistry {
  constructor() {
    this._map = new Map();
  }

  get(module) {
    if (!this._map.has(module)) {
      throw new Error(`Cannot find module {${module}} in ModuleRegistry`);
    }
    return this._map.get(module);
  }

  set(module, metadata) {
    if (this._map.has(module)) {
      throw new Error(`Can only register {${module}} once`);
    }
    return this._map.set(module, metadata);
  }
}
