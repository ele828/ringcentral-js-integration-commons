import Container from './container';
import ModuleRegistry from './registry/module_registry';
import ProviderRegistry from './registry/provider_registry';
import * as Errors from './errors';
import {
  isEmpty,
  isAnonymousFunction,
  getParentClass,
  camelize
} from './utils/utils';
import {
  isFunction,
  isObject,
  isArray,
  isValueProvider,
  isStaticClassProvider,
  isExistingProvider,
  isFactoryProvider,
  isConstructorProvider,
  isClassProvider
} from './utils/is_type';

export class UniversalProvider {
  constructor(token) {
    this.token = token;
  }
}

export class UniversalClassProvider extends UniversalProvider {
  constructor(token, klass, deps) {
    super(token);
    this.klass = klass;
    this.deps = deps;
  }
}

export class UniversalFactoryProvider extends UniversalProvider {
  constructor(token, func, deps) {
    super(token);
    this.func = func;
    this.deps = deps || [];
  }
} 

export class UniversalValueProvider extends UniversalProvider {
  constructor(token, value, spread) {
    super(token);
    this.value = value;
    this.spread = spread;
  }
}

export class Injector {
  static container = new Container();
  static moduleRegistry = new ModuleRegistry();
  static providerRegistry = new ProviderRegistry();
  static universalProviders = new Map();

  static applyGlobalMetadata = null;

  static config({ applyMetadata }) {
    if (applyMetadata) this.applyGlobalMetadata = applyMetadata;
  }

  /** Switch to use an array as pending data structure */
  static resolveModuleProvider(provider, pending = new Set()) {
    const container = this.container;
    if (container.has(provider.token)) return;
    if (provider instanceof UniversalValueProvider) {
      const value = provider.spread
        ? { value: provider.value, spread: provider.spread }
        : provider.value;
      container.set(provider.token, value);
    } else if (provider instanceof UniversalFactoryProvider) {
      pending.add(provider.token);
      const dependencies = this.resolveDependencies(provider.deps, pending);
      const factoryProvider = provider.func.call(null, dependencies);
      container.set(provider.token, factoryProvider);
      pending.delete(provider.token);
    } else if (provider instanceof UniversalClassProvider) {
      const moduleMetadata = this.moduleRegistry.get(provider.klass.name);
      const deps = moduleMetadata !== null ? moduleMetadata.deps : [];
      const klass = provider.klass;
      if (!deps || deps.length === 0) {
        container.set(provider.token, (new klass));
        return;
      }
      pending.add(provider.token);
      const dependencies = this.resolveDependencies(deps, pending);
      const instance = new klass(dependencies);
      container.set(provider.token, instance);
      pending.delete(provider.token);
    }
  }

  static resolveDependencies(deps, pending) {
    let dependencies = {};
    for (let dep of deps) {
      if (isFunction(dep)) {
        dep = dep.name;
      }
      if (pending.has(dep)) {
        // TODO: Extract to an error function
        const path = Array.from(pending.values()).join(' -> ');
        throw new Error(`Circular dependency detected: ${path} -> ${dep}`)
      }
      if (!this.container.has(dep)) {
        const dependentModuleProvider = this.universalProviders.get(dep);
        if (!dependentModuleProvider) throw new Error(`Module {${dep}} is not registered as a Provider`)
        this.resolveModuleProvider(dependentModuleProvider, pending);
      }
      const dependentModule = this.container.get(dep);
      // Value dependency and use spread, in this case, value object needs to be spreaded
      if (dependentModule.value !== undefined && dependentModule.spread) {
        dependencies = { ...dependencies, ...dependentModule.value }
      } else {
        dependencies[camelize(dep)] = dependentModule;
      }
    }
    return dependencies;
  }

  // Entrypoint of the framework
  static bootstrap(rootClass) {
    const rootClassName = rootClass.name;
    const rootClassMetadata = this.providerRegistry.get(rootClassName);

    // Combine providers of all ancestors modules
    let providerMetadata = [];
    for (
      let currentClass = rootClass;
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
          new UniversalValueProvider(provider.provide, provider.useValue, provider.spread)
        );
      } else if (isStaticClassProvider(provider)) {
        universalProviders.set(
          provider.provide,
          new UniversalClassProvider(provider.provide, provider.useClass, provider.deps)
        );
      } else if (isExistingProvider(provider)) {
        universalProviders.set(
          provider.provide,
          new UniversalClassProvider(provider.provide, provider.useExisting, null)
        );
      } else if (isFactoryProvider(provider)) {
        universalProviders.set(
          provider.provide,
          new UniversalFactoryProvider(provider.provide, provider.useFactory, provider.deps)
        );
      } else if (isConstructorProvider(provider)) {
        universalProviders.set(
          provider.provide.name,
          new UniversalClassProvider(provider.provide.name, provider.provide, provider.deps)
        );
      } else if (isClassProvider(provider)) {
        universalProviders.set(
          provider.name,
          new UniversalClassProvider(provider.name, provider, null)
        );
      } 
      else {
        throw new Error('Invalid provider format');
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

    // Instantiate root module
    const parameters = Array.from(this.container.entries()).reduce((result, entries) => {
      result[camelize(entries[0])] = entries[1];
      return result;
    }, {});

    const rootClassInstance = new rootClass(parameters);

    // Additional module configurations
    // eg. register reducer, inject getState
    const reducers = {};
    
    for (const [name, module] of this.container.entries()) {
      // module._getState = rootClassInstance.state[camelize(name)];
    }

    // rootClassInstance._reducer = combineReducers({
    //   ...reducers,
    //   lastAction: (state = null, action) => {
    //     console.log(action);
    //     return action;
    //   }
    // });

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
 
}
