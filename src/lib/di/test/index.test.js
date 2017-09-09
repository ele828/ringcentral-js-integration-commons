import { expect } from 'chai';
import { Injector } from '../injector';
import Module from '../decorators/module';
import ModuleFactory from '../decorators/module_factory';

describe('Module Decorator', () => {
  it ('should work', () => {
    @Module({
      deps: ['TestModule']
    })
    class Logger {
      constructor({ testModule }) {
        console.log('-> TestModule:', testModule);
      }
    }

    @Module({
      deps: ['Toy', 'GlobalConfig']
    })
    class TestModule {
      constructor({ logger, appKey }) {
        console.log('-> Logger:', logger);
        console.log('-> appKey:', appKey);
      }
    }

    @Module({
      deps: ['Logger']
    })
    class Toy {}

    @ModuleFactory({
      providers: [
        { provide: Logger }
      ]
    })
    class RootModule {
      constructor({ logger }) {
        console.log('-> Logger:', logger);
      }
      static bootstrap() {
        return Injector.bootstrap(this);
      }
    }

    @ModuleFactory({
      providers: [
        Toy,
        TestModule,
        { provide: 'GlobalConfig', useValue: { appKey: '123' }, spread: true },
        { provide: 'Logger', useFactory: ({appKey}) => {
          return { logger: true, appKey };
        }, deps: [ 'GlobalConfig' ]},
      ]
    })
    class EntryModule extends RootModule {
      constructor(params) {
        super(params);
      }
    }
    const instance = EntryModule.bootstrap();
  });
});
