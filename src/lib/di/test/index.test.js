import { expect } from 'chai';
import {
  Injector,
  Module,
  ModuleFactory
} from '../';

describe('Module Decorator', () => {
  it('should work', () => {
    @Module({
      deps: ['TestModule']
    })
    class Logger {
      constructor({ testModule }) {
        console.log('-> TestModule:', testModule);
      }
    }

    @Module({
      deps: ['GlobalConfig']
    })
    class TestModule {
      constructor({ logger, appKey, injector }) {
        console.log('-> Logger:', logger);
        console.log('-> appKey:', appKey);
        console.log('-> Injector:', injector.get('Logger'));
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
        TestModule,
        { provide: 'GlobalConfig', useValue: { appKey: '123' }, spread: true },
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
