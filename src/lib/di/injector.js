import { combineReducers } from 'redux';

import RcModule from '../RcModule';
import Container from './container';
import ModuleRegistry from './registry/module_registry';
import ProviderRegistry from './registry/provider_registry';
import * as Errors from './errors';
import { ValueProvider, ClassProvider, FactoryProvider } from './provider';
import { isEmpty, isAnonymousFunction, getParentClass, camelize } from './utils/utils';
import {
  isFunction,
  isObject,
  isArray,
  isValueProvider,
  isStaticClassProvider,
  isExistingProvider,
  isFactoryProvider,
} from './utils/is_type';

export class Injector {
  static container = new Container();
  static moduleRegistry = new ModuleRegistry();
  static providerRegistry = new ProviderRegistry();
  static universalProviders = new Map();

  static resolveModuleProvider(provider, pending = new Set()) {
    const container = this.container;
    if (container.has(provider.token)) return;
    if (provider instanceof ValueProvider) {
      const value = provider.spread
        ? { value: provider.value, spread: provider.spread }
        : provider.value;
      container.set(provider.token, value);
    } else if (provider instanceof FactoryProvider) {
      pending.add(provider.token);
      const dependencies = this.resolveDependencies(provider.deps, pending);
      const factoryProvider = provider.func.call(null, dependencies);
      container.set(provider.token, factoryProvider);
      pending.delete(provider.token);
    } else if (provider instanceof ClassProvider) {
      const moduleMetadata = this.moduleRegistry.get(provider.klass.name);
      const deps = moduleMetadata !== null ? moduleMetadata.deps : [];
      const Klass = provider.klass;
      if (!deps || deps.length === 0) {
        container.set(provider.token, new Klass());
        return;
      }
      pending.add(provider.token);
      const dependencies = this.resolveDependencies(deps, pending);
      const instance = new Klass(dependencies);
      container.set(provider.token, instance);
      pending.delete(provider.token);
    }
  }

  static resolveDependencies(deps, pending) {
    const dependencies = {};
    for (let dep of deps) {
      if (isFunction(dep)) {
        dep = dep.name;
      }
      if (pending.has(dep)) {
        // TODO: Extract to an error function
        const path = Array.from(pending.values()).join(' -> ');
        throw new Error(`Circular dependency detected: ${path} -> ${dep}`);
      }
      if (!this.container.has(dep)) {
        const dependentModuleProvider = this.universalProviders.get(dep);
        if (!dependentModuleProvider) throw new Error(`Module {${dep}} is not registered as a Provider`);
        this.resolveModuleProvider(dependentModuleProvider, pending);
      }
      const dependentModule = this.container.get(dep);
      // Value dependency and use spread, in this case, value object needs to be spreaded
      if (dependentModule.value !== undefined && dependentModule.spread) {
        Object.assign(dependencies, dependentModule.value);
      } else {
        dependencies[camelize(dep)] = dependentModule;
      }
    }
    // Injector instance will be injected into each module
    dependencies[camelize(Injector.name)] = Injector;
    return dependencies;
  }

  // Entrypoint of the framework
  static bootstrap(RootClass) {
    // Combine providers of all ancestors modules
    let providerMetadata = [];
    for (
      let currentClass = RootClass;
      !isEmpty(currentClass.name);
      currentClass = getParentClass(currentClass)
    ) {
      const currentProviderMetadata = this.providerRegistry.get(currentClass.name);
      providerMetadata = [...currentProviderMetadata, ...providerMetadata];
    }

    // Iterate through all provider metadata
    // Discard providers in parent class overwritten by children
    const universalProviders = this.universalProviders;
    for (const provider of providerMetadata) {
      if (isValueProvider(provider)) {
        universalProviders.set(
          provider.provide,
          new ValueProvider(provider.provide, provider.useValue, provider.spread)
        );
      } else if (isStaticClassProvider(provider)) {
        universalProviders.set(
          provider.provide,
          new ClassProvider(provider.provide, provider.useClass, provider.deps)
        );
      } else if (isExistingProvider(provider)) {
        universalProviders.set(
          provider.provide,
          new ClassProvider(provider.provide, provider.useExisting, null)
        );
      } else if (isFactoryProvider(provider)) {
        universalProviders.set(
          provider.provide,
          new FactoryProvider(provider.provide, provider.useFactory, provider.deps)
        );
      } else {
        throw new Error('Invalid provider found');
      }
    }

    // Resolve dependencies and create instances of provides
    const container = this.container;
    const providerQueue = Array.from(universalProviders.values());
    while (providerQueue.length > 0) {
      const provider = providerQueue.shift();
      if (!container.has(provider.token)) {
        this.resolveModuleProvider(provider);
      }
    }

    const moduleProviders = {};
    for (const [name, module] of this.container.entries()) {
      moduleProviders[name] = module;
    }

    // Instantiate root module
    const reducers = {};
    const proxyReducers = {};
    const rootClassInstance = new RootClass(moduleProviders);

    // Register all module providers to root instance
    for (const name of Object.keys(moduleProviders)) {
      const module = moduleProviders[name];
      rootClassInstance.addModule(name, module);

      if (module.reducer) {
        reducers[name] = module.reducer;
      }

      if (module.proxyReducer) {
        proxyReducers[name] = module.proxyReducer;
      }

      // Additional module configurations
      // Do things like reducer registration, getState injection
      if (module instanceof RcModule) {
        if (module._reducer) {
          Object.defineProperty(module, '_getState', {
            value: rootClassInstance.state[name]
          });
        }
        if (module._proxyReducer) {
          Object.defineProperty(module, '_getProxyState', {
            value: rootClassInstance.state[name]
          });
        }
      }
    }

    Object.defineProperty(rootClassInstance, '_reducer', {
      value: combineReducers({
        ...reducers,
        lastAction: (state = null, action) => {
          console.log(action);
          return action;
        }
      })
    });

    Object.defineProperty(rootClassInstance, '_reducer', {
      value: combineReducers({
        ...proxyReducers,
      })
    });

    return rootClassInstance;
  }

  static registerModule(constructor, metadata) {
    if (!constructor || !isFunction(constructor)) {
      throw Errors.InvalidModuleTypeError;
    }
    const moduleName = constructor.name;
    if (isEmpty(moduleName)) {
      throw Errors.InvalidModuleTypeError;
    }
    if (isAnonymousFunction(moduleName)) {
      throw Errors.AnonymousFunctionError;
    }
    if (metadata && !isObject(metadata)) {
      throw Errors.InvalidModuleParameterError;
    }
    if (!metadata) {
      metadata = null;
    }
    this.moduleRegistry.set(moduleName, metadata);
  }

  static registerModuleProvider(constructor, metadata) {
    if (!constructor || !isFunction(constructor)) {
      throw Errors.InvalidModuleFactoryTypeError;
    }
    const moduleFactoryName = constructor.name;
    if (isEmpty(moduleFactoryName)) {
      throw Errors.InvalidModuleFactoryTypeError;
    }
    if (isAnonymousFunction(moduleFactoryName)) {
      throw Errors.AnonymousFunctionError;
    }
    if (metadata && !isObject(metadata)) {
      throw Errors.InvalidModuleFactoryParameterError;
    }
    if (metadata && metadata.providers && !isArray(metadata.providers)) {
      throw Errors.InvalidProviderTypeError;
    }
    if (!metadata.providers) {
      throw Errors.NoProvidersFoundError;
    }
    if (!metadata) {
      metadata = null;
    }
    // TODO: validate module providers
    // useValue should be object or number or string, etc.
    // spread can only be used if useValue is an object.
    this.providerRegistry.set(moduleFactoryName, metadata.providers);
  }

  static get(moduleToken) {
    return this.container.get(moduleToken);
  }

}
