import ModuleRegistry from './module_registry';
import ProviderRegistry from './provider_registry';
import { getParentClass } from '../utils/utils';
import { DIError } from '../utils/error';
import { isEmpty, isFunction, isArray, isObject } from '../utils/is_type';

export default class Registry {
  static moduleRegistry = new ModuleRegistry();
  static providerRegistry = new ProviderRegistry();
  static registerModule(klass, metadata) {
    if (!klass || !isFunction(klass)) {
      throw DIError('Expected module to be an Class');
    }
    const moduleName = klass.name;
    if (metadata && !isObject(metadata)) {
      throw DIError('Expected parameter of @Module() to be an Object');
    }
    if (!metadata || Object.keys(metadata).length <= 0) {
      metadata = null;
    }
    if (metadata !== null && !isArray(metadata.deps)) {
      throw DIError(
        `Expected deps to be an Array: [${klass.name}]
        ${JSON.stringify(metadata)}`
      );
    }
    this.moduleRegistry.set(moduleName, metadata, klass);
  }

  static registerModuleProvider(klass, metadata) {
    if (!klass || !isFunction(klass)) {
      throw DIError('Expected moduleFactory to be an Class');
    }
    const moduleFactoryName = klass.name;
    if (metadata && !isObject(metadata)) {
      throw DIError('Expected parameter of @ModuleFactory() to be an Object');
    }
    if (metadata && metadata.providers && !isArray(metadata.providers)) {
      throw DIError('Expected providers in @ModuleFactory() to be an Array');
    }
    if (!metadata) {
      metadata = null;
    }
    // TODO: validate module providers
    // useValue should be object or number or string, etc.
    // spread can only be used if useValue is an object.
    this.providerRegistry.set(moduleFactoryName, metadata);
  }

   /**
   * Process the inheritance relationship of ModuleFactory.
   * Support some inheritance options such as overwrite, merge, etc.
   * ModuleFactory can only inherit from ModuleFactory.
   * @param {Class} currentClass
   */
  static processModuleFactoryInheritance(currentClass) {
    const parentClass = getParentClass(currentClass);
    if (!this.providerRegistry.has(currentClass.name)) return [];
    else if (this.providerRegistry.resolved(currentClass.name)) {
      return this.providerRegistry.get(currentClass.name);
    }
    const moduleProviderMetadata = this.providerRegistry.get(currentClass.name);
    const hasProviders = moduleProviderMetadata && isArray(moduleProviderMetadata.providers);
    if (hasProviders) {
      const providers = moduleProviderMetadata.providers;
      const providerMetadata = this.mergeProviders(
        providers,
        !isEmpty(parentClass.name) ? this.processModuleFactoryInheritance(parentClass) : []
      );
      this.providerRegistry.resolve(currentClass.name, providerMetadata);
      return providerMetadata;
    }
    return [];
  }

  /**
   * Process the inheritance relationship of Module and Library.
   * Module can inherit from Module and Library.
   * @param {String} moduleName
   */
  static processModuleLibraryInheritance(moduleName) {
    const klass = this.moduleRegistry.getClass(moduleName);
    this.resolveDependencyInheritance(klass);
  }

  /**
   * Resolve the inheritance relationship of module dependencies.
   * @param {Class} currentClass
   */
  static resolveDependencyInheritance(currentClass) {
    const parentClass = getParentClass(currentClass);
    if (!this.moduleRegistry.has(currentClass.name)) return [];
    else if (this.moduleRegistry.resolved(currentClass.name)) {
      return this.moduleRegistry.get(currentClass.name);
    }
    const moduleMetadata = this.moduleRegistry.get(currentClass.name);
    const hasDeps = moduleMetadata && isArray(moduleMetadata.deps);
    if (hasDeps) {
      moduleMetadata.deps = this.mergeDependencies(
        moduleMetadata.deps,
        !isEmpty(parentClass.name) ? this.resolveDependencyInheritance(parentClass) : []
      );
      // Update parent class metadata
      this.moduleRegistry.resolve(currentClass.name, moduleMetadata);
      return moduleMetadata.deps;
    }
    return [];
  }

  /**
   * A helper function for formating class provider metadata.
   * @param {Object|Function} providerMetadata
   */
  static _formatClassProvider(providerMetadata) {
    let formatted = {};
    if (isFunction(providerMetadata)) {
      formatted = { provide: providerMetadata.name, useClass: providerMetadata };
    } else if (isFunction(providerMetadata.provide)) {
      formatted = { provide: providerMetadata.provide.name, useClass: providerMetadata.provide };
    }
    return Object.assign({}, providerMetadata, formatted);
  }

  /**
   * A helper function for merging child and parent providers.
   * @param {Object|Function} baseProvider
   * @param {Object|Function} parentProvider
   */
  static mergeProviders(baseProvider, parentProvider) {
    const merged = new Map();
    for (let pp of parentProvider) {
      pp = this._formatClassProvider(pp);
      merged.set(pp.provide, pp);
    }

    // Merge child providers into parent providers
    for (let p of baseProvider) {
      // useValue and don't overwrite parent values
      const pp = merged.get(p.provide);
      if (pp && p.useValue && p.merge) {
        if (!pp.useValue) {
          throw DIError(`Expected parent provider of [${p.provide}] to be a value provider`);
        }
        p.useValue = Object.assign({}, pp.useValue, p.useValue);
        merged.set(p.provide, Object.assign({}, pp, p));
      } else {
        // useClass, useExisting, useFactory will always overwrite parent provider
        p = this._formatClassProvider(p);
        merged.set(p.provide, Object.assign({}, pp, p));
      }
    }
    return Array.from(merged.values());
  }

  /**
   * A helper function for merging child and parent module dependencies.
   * @param {Array} baseDeps
   * @param {Array} parentDeps
   */
  static mergeDependencies(baseDeps, parentDeps) {
    const merged = new Map();
    // Deps preprocess
    for (const parent of parentDeps) {
      if (!isObject(parent)) {
        merged.set(parent, { dep: parent, optional: false });
      } else {
        merged.set(parent.dep, parent);
      }
    }

    for (let base of baseDeps) {
      if (!isObject(base)) {
        base = { dep: base, optional: false };
      }
      if (merged.has(base.dep) && base.dep !== merged.get(base.dep).dep) {
        merged.set(base.dep, { dep: base.dep, optional: false });
      } else {
        merged.set(base.dep, base);
      }
    }

    return Array.from(merged.values());
  }
}
