import { Injector } from '../injector';

/**
 * @ModuleFactory() decorator
 * Used for defining a root module of the system and also declare and import dependencies injected into the system.
 */
export default function ModuleFactory (metadata) {
  return function (constructor) {
    console.log('@ModuleFactory', constructor.name, metadata);
    Injector.registerModuleProvider(constructor, metadata);
  }
}
