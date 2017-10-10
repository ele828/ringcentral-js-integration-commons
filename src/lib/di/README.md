# Dependency Injection

## Introduction
The integration commons repository consists of multiple modules, each module is responsible for specific functionality and there are dependence relationships across some modules. By leveraging Dependency Injection mechanism, it can be much easier for developers to write modules without concerning about module initialization order and module dependencies. All you need to do is to declare the dependencies of the module and register the module as a provider in the ModuleFactory. Besides, the capability of module combination is also provided, which can be used for phone customization.

## Usage
The dependency injection mechanism uses `decorator` to declare module metadata. There are currently three decorators `@Library`, `@Module` and `@ModuleFactory`.

As its name implies, `@Module` is used for anotating a module and declaring its dependencies. `@Library` is actually the alias for `@Module`, similarly, it can be used for declaring a library and its dependencies. A module or library can be registered as a provider such that it can be used for module injection.

`@ModuleFactory` is intended for declaring module factory. Module factory is a special kind of module, it can be used for providing and combining multiple modules.

### @Module
Before writing a new module, we need to import `Module` decorator from `lib/di` and then decorate the module class with `@Module()` decorator.

After that, you can start defining the dependent module in `deps` array.  Dependency defined in **String literal** is always a non-optional dependency, which means when the instance of the dependent module can not be found, an error will be thrown. Nevertheless, you can also define an optional dependency by using the **Object** definition with **optional** property inside it. Optional dependency is usually used for injecting additional configuration parameters. Note that the dependency name is the name that registered in `@ModuleFactory` instead of the actual module class name.

All the declared dependencies will be injected into the module constructor as an object and afterwards you can pick up the module easily by using destructuring assignment (the module name will be converted to camel case from pascal case).

Note that if you want the module to be always injetable, the `@Module()` decorator is required even if there is no dependent modules.

```js
@Module({
  deps: [
    // Required dependency
    'Client',
    // Optional dependency
    { dep: 'AccountPhoneNumberOptions', optional: true }
  ]
})
export default class ActiveCalls {
  // Dependent module will be innjected into consturctor
  constructor({
    client,
    ...options
  }) {}
}
```

### @Library
`@Library` decorator is almost exactly the same as `@Module` except for the decorator name. But it's usually intended for declaring a library in `/lib` folder.

```js
@Library({
  deps: [
    'Auth',
    { dep: 'DataFetcherOptions', optional: true }
  ]
})
export default class DateFetcher {
  constructor({
    auth,
    ...options
  }) {}
}
```

### @ModuleFactory
`@ModuleFactory` is used for declaring a module factory. Module factory is usually a central place for registering and providing a bunch of modules and also assembling the registered module as a whole.

```js
@ModuleFactory({
  // Register module as module provider
  providers: [
    // Class Provider
    { provide: 'Client', useClass: Client },
    // Value Provider
    { provide: 'Options', useValue: { key: 'value' } },
    // Existing Provider
    { provide: 'LagacyClient', useExisting: 'Client' },
    // Factory Provider
    { provide: 'Factory',
      useFactory: ({ client }) => new Klass(client),
      deps: ['Client']
    }
  ]
})
class Phone {
  constructor({
    client,
    options,
    legacyClient,
    factory,
  }) {}
}
```

After registered as a provider, it can be used for injection in other modules. The `provide` attribute is defining the name of the provider, the `deps` attribute in `@Module` or `@Library` is also using the provider name defined in `provide` to search for dependencies.

#### Private Module Provider
As we can see from the previous code snippet,  all providers will also be injected into module factory class as its own dependencies, however, in real world scenarios, some providers are not designed to be exposed to the module factory. In this case, the `private` property can be used for stating that the provider is only designed for injection which is not necessarily to be exposed to outer scope.

```
providers: [
  { provide: 'Client', useClass: Client, private: true }
]
```

#### Providers
A module is registered as a provider means the module can be injectable inside module factory context. To be specific, all the modules defining in `providers` of the same module factory are in the same context, which means they can be injected into any other modules of the same scope.

All providers will also be regarded as the dependencies of the module factory class, which can be used for assembling modules or performing other operations.

There are four kinds of `Provider`:
##### Class Provider
Provide a class, it's usually used for providing a module class.
##### Value Provider
Provide values, it's usually used for injecting configuration options. There is a `spread` property, which can be used for spreading the value object in injection process.

```
@Module({
  deps: ['Options']
})
class TestModule {
  constructor({
    // Options value has been spread
    appKey
  }) {}
}

@ModuleFactory({
  providers: [
    { provide: 'Options',
      useValue: { appKey: 'key' },
      spread: true,
      private: true }
  ]
})
class Phone {}
```
##### Factory Provider
Provide a anything that returned by the factory function, it's usually used for importing third party instances. The factory function also supports dependency injection which should be declared in `deps` property.

```js
@ModuleFactory({
  providers: [
    { provide: 'Factory',
      useFactory: ({ client })=> new Klass(client),
      deps: ['Client'] }
  ]
})
class Phone {}
```

##### Existing Provider
Provide an existing provider (alias for existing provider). it's usually used for upgrading or replacing legacy providers.


## Inheritance
In order to provide more flexibility, the DI system supports module inheritance. There are two inheritance

## Composition

As we can see from the code snippet above, the **ActiveCalls** module inherits from **DataFetcher** which is a Library in `lib/DataFetcher`. The metadata of **DataFetcher** will actually be **inherited** by its subclasses as well, in this way, all dependencies that Parent class needs can be resolved at the same time.

The only thing that you need to do is to pass the dependencies to its parent class when invoking `super()` statements.

The metadata of parent class can be overwritten by child class, for instance, you can make an optional dependency non-optional and vice verse.

## RcModule

## FAQ
Q: Circular dependency
Q: useExiting can only use the provider in the same scope
Q: class can be used normally without using DI
Q: short hand provider declaration (with uglify.js mangle turned off)
