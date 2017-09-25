import { DIError } from '../utils/error';

/**
 * Module registry is used to store module metadata.
 */
export default class ModuleRegistry {
  constructor() {
    this._map = new Map();
  }

  get(moduleName) {
    if (!this._map.has(moduleName)) {
      throw DIError(`Cannot find module [${moduleName}] in ModuleRegistry`);
    }
    return this._map.get(moduleName).metadata;
  }

  getClass(moduleName) {
    if (!this._map.has(moduleName)) {
      throw DIError(`Cannot find module [${moduleName}] in ModuleRegistry`);
    }
    return this._map.get(moduleName).klass;
  }

  resolved(moduleName) {
    return !!this._map.get(moduleName).resovled;
  }

  set(moduleName, metadata, klass) {
    if (this._map.has(moduleName)) {
      throw DIError(`Can only register module [${moduleName}] once`);
    }
    return this._map.set(moduleName, { klass, metadata });
  }

  resolve(moduleName, metadata) {
    if (!this._map.has(moduleName)) {
      throw DIError(`Cannot resolve module metadata [${moduleName}]: module is not found`);
    }
    const originalMetadata = this._map.get(moduleName);
    this._map.set(moduleName, {
      metadata,
      klass: originalMetadata.klass,
      resolved: true
    });
  }

  has(moduleName) {
    return this._map.has(moduleName);
  }

  entries() {
    return this._map.entries();
  }

  keys() {
    return this._map.keys();
  }

  reset() {
    this._map.clear();
  }
}
