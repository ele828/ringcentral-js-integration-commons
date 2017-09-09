import { Injector } from '../injector';

/**
 * @Module() decorator
 * Used for declaring dependencies and metadata when defines a module
 */
export default function Module (metadata) {
  return function (constructor) {
    console.log('@Module', constructor.name, metadata);
    Injector.registerModule(constructor, metadata);
  }
}
