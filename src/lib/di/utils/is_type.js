export function isObject(x) {
  return typeof x === 'object';
}

export function isFunction(x) {
  return typeof x === 'function';
}

export function isArray(x) {
  return Array.isArray
    ? Array.isArray(x)
    : Object.prototype.toString.call(x).slice(8, -1) === 'Array';
}

/**
 * Provider type guard functions
 */
const USE_VALUE = 'useValue';
export function isValueProvider(provider) {
  return USE_VALUE in provider;
}

export function isStaticClassProvider(provider) {
  return provider.useClass !== undefined;
}

export function isExistingProvider(provider) {
  return provider.useExisting !== undefined;
}

export function isFactoryProvider(provider) {
  return provider.useFactory !== undefined;
}

export function isConstructorProvider(provider) {
  return provider.provide !== undefined;
}

export function isClassProvider(provider) {
  return isFunction(provider);
}
