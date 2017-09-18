import { Injector } from '../injector';

/**
 * @Module() decorator
 * Used for declaring dependencies and metadata when defines a module
 */
export default function Module(metadata) {
  /* eslint-disable */
  return function (constructor) {
    Injector.registerModule(constructor, metadata);
  };
}
