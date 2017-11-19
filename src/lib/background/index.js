/**
 * @background is a decorator designed for explicitly making the function
 * to be executed in background instead of client.
 * It can be used for decorating UI-driven function calls so that it will
 * only be called in background.
 */
export default function background(target, name, descriptor) {
  function wrappedFn(...args) {
    // Only clinet has transport
    if (!this._transport) {
      const value = descriptor.value;
      return this::value(...args);
    }
    return null;
  }
  return {
    ...descriptor,
    value: wrappedFn
  };
}

