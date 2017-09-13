export const InvalidModuleTypeError = new Error('[DI] Invalid module type');
export const InvalidModuleParameterError = new Error('[DI] Invalid parameter passed to @Module()');
export const NoProvidersFoundError = new Error('[DI] No providers found in @ModuleFactory()');
export const InvalidModuleFactoryTypeError = new Error('[DI] Invalid module type');
export const InvalidModuleFactoryParameterError = new Error('[DI] Invalid parameter passed to @Module()');
export const InvalidProviderTypeError = new Error('[DI] Invalid Provider Type passed to @ModuleFactory()');
export const AnonymousFunctionError = new Error('[DI] Injection for Anonymous Function is not supported');

export function DIError(message) {
  return new Error(`[DI] ${message}`);
}

export function CircularDependencyError(pending, dep) {
  const path = Array.from(pending.values()).join(' -> ');
  return DIError(`Circular dependency detected: ${path} -> ${dep}`);
}
