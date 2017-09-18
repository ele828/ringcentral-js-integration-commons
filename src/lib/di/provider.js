export class Provider {
  constructor(token) {
    this.token = token;
  }
}

export class ClassProvider extends Provider {
  constructor(token, klass, deps) {
    super(token);
    this.klass = klass;
    this.deps = deps;
  }
}

export class FactoryProvider extends Provider {
  constructor(token, func, deps) {
    super(token);
    this.func = func;
    this.deps = deps || [];
  }
}

export class ValueProvider extends Provider {
  constructor(token, value, spread) {
    super(token);
    this.value = value;
    this.spread = spread;
  }
}
