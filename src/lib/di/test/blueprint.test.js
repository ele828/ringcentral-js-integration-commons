import { expect } from 'chai';
import RcModule from '../../RcModule';
import {
  Injector,
  Module,
  Library,
  ModuleFactory
} from '../';

describe('Dependency Injection Specifications', () => {
  beforeEach(() => {
    Injector.reset();
  });

  it('should support spreadValues in ModuleFactory', () => {
    @Module()
    class MessageStore {}
    @Module({
      deps: ['MessageStore', { dep: 'RecentMessageOptions', optional: true }]
    })
    class RecentMessage {
      constructor({
        enabled = false
      }) {
        this.enabled = enabled;
      }
    }

    @ModuleFactory({
      providers: [
        { provide: 'MessageStore', useClass: MessageStore },
        { provide: 'RecentMessage', useClass: RecentMessage },
        { provide: 'RecentMessageOptions', useValue: { enabled: true }, spread: true }
      ]
    })
    class Root {
      constructor({ messageStore, recentMessage }) {
        this.messageStore = messageStore;
        this.recentMessage = recentMessage;
      }
    }
    const instance = Injector.bootstrap(Root);
    expect(instance.recentMessage).to.be.an.instanceof(RecentMessage);
    expect(instance.recentMessage.enabled).to.be.true;
  });

  it('should inject modules', () => {
    @Module()
    class MessageStore {}
    @Module({
      deps: ['MessageStore']
    })
    class RecentMessage {}

    @ModuleFactory({
      providers: [
        { provide: 'MessageStore', useClass: MessageStore },
        { provide: 'RecentMessage', useClass: RecentMessage }
      ]
    })
    class Root extends RcModule {}
    const instance = Injector.bootstrap(Root);
    expect(instance.messageStore).to.be.an.instanceof(MessageStore);
    expect(instance.recentMessage).to.be.an.instanceof(RecentMessage);
  });

  it('should inject dependencies', () => {
    @Module()
    class MessageStore {}
    @Module({
      deps: ['MessageStore']
    })
    class RecentMessage {
      constructor({ messageStore }) {
        this.messageStore = messageStore;
      }
    }

    @ModuleFactory({
      providers: [
        { provide: 'MessageStore', useClass: MessageStore },
        { provide: 'RecentMessage', useClass: RecentMessage }
      ]
    })
    class Root extends RcModule {}
    const instance = Injector.bootstrap(Root);
    expect(instance.recentMessage.messageStore).to.be.an.instanceof(MessageStore);
  });

  it('should handle circular dependency', () => {
    function circular() {
      @Module({
        deps: ['ModuleC']
      })
      class ModuleA {}

      @Module({
        deps: ['ModuleA']
      })
      class ModuleB {}

      @Module({
        deps: ['ModuleB']
      })
      class ModuleC {}

      @ModuleFactory({
        providers: [
          { provide: 'ModuleA', useClass: ModuleA },
          { provide: 'ModuleB', useClass: ModuleB },
          { provide: 'ModuleC', useClass: ModuleC },
        ]
      })
      class RootModule {}
      Injector.bootstrap(RootModule);
    }
    expect(circular).to.throw();
  });

  it('should support ModuleFactory inheritance', () => {
    @Module()
    class ModuleA {}

    @Module()
    class ModuleB {}

    @ModuleFactory({
      providers: [
        { provide: 'ModuleB', useClass: ModuleB },
      ]
    })
    class RootModule extends RcModule {}

    @ModuleFactory({
      providers: [
        { provide: 'ModuleA', useClass: ModuleA },
      ]
    })
    class ChildModule extends RootModule {}
    const childModule = Injector.bootstrap(ChildModule);
    expect(childModule.moduleA).to.be.an.instanceof(ModuleA);
    expect(childModule.moduleB).to.be.an.instanceof(ModuleB);
  });

  it('should support value inheritance', () => {
    @ModuleFactory({
      providers: [
        { provide: 'Options', useValue: { appKey: 'appKey', appSecret: 'appSecret' } }
      ]
    })
    class RootModule extends RcModule {}

    @ModuleFactory({
      providers: [
        { provide: 'Options', useValue: { appKey: 'newAppKey' }, merge: true }
      ]
    })
    class ChildModule extends RootModule {}
    const childModule = Injector.bootstrap(ChildModule);
    expect(childModule.options).to.deep.equal({
      appKey: 'newAppKey',
      appSecret: 'appSecret'
    });
  });

  it('should support value overwrite', () => {
    @ModuleFactory({
      providers: [
        { provide: 'Options', useValue: { appKey: 'appKey', appSecret: 'appSecret' } }
      ]
    })
    class RootModule {}

    @ModuleFactory({
      providers: [
        { provide: 'Options', useValue: { appKey: 'newAppKey' } }
      ]
    })
    class ChildModule extends RootModule {
      constructor({ options }) {
        super();
        this.options = options;
      }
    }
    const childModule = Injector.bootstrap(ChildModule);
    expect(childModule.options).to.deep.equal({
      appKey: 'newAppKey',
    });
  });

  it('should throw when module deps is not found', () => {
    function moduleNotFound() {
      @Module()
      class ModuleA {}

      @Module({
        deps: ['ModuleA', 'TestModuleOptions']
      })
      class TestModule {}

      @ModuleFactory({
        providers: [
          { provide: 'ModuleA', useClass: ModuleA },
          { provide: 'TestModule', useClass: TestModule },
        ]
      })
      class ChildModule {}
      Injector.bootstrap(ChildModule);
    }
    expect(moduleNotFound).to.throw();
  });

  it('should not throw when module deps is optional', () => {
    @Module()
    class ModuleA {}

    @Module({
      deps: [
        'ModuleA',
        { dep: 'TestModuleOptions', optional: true }
      ]
    })
    class TestModule {}

    @ModuleFactory({
      providers: [
        { provide: 'ModuleA', useClass: ModuleA },
        { provide: 'TestModule', useClass: TestModule },
      ]
    })
    class ChildModule {
      constructor({ testModule }) {
        expect(testModule).to.be.an.instanceof(TestModule);
      }
    }
    Injector.bootstrap(ChildModule);
  });

  it('should inheritant deps correctly', () => {
    @Module({
      deps: [{
        dep: 'ModuleOptions', optional: true
      }]
    })
    class ModuleA {}

    @Module({
      deps: [
        'ModuleA',
        { dep: 'TestModuleOptions', optional: true }
      ]
    })
    class TestModule extends ModuleA {
      constructor({ testModuleOptions }) {
        super();
        this.testModuleOptions = testModuleOptions;
      }
    }

    @ModuleFactory({
      providers: [
        { provide: 'TestModuleOptions', useValue: { key: 'key' } },
        { provide: 'ModuleA', useClass: ModuleA },
        { provide: 'TestModule', useClass: TestModule },
      ]
    })
    class ChildModule {
      constructor({ testModule }) {
        this.testModule = testModule;
      }
    }
    const testModule = Injector.bootstrap(ChildModule).testModule;
    expect(testModule).to.be.an.instanceof(TestModule);
    expect(testModule.testModuleOptions).to.deep.equal({
      key: 'key'
    });
  });

  it('should get value if provided when module deps is optional', () => {
    @Module()
    class ModuleA {}

    @Module({
      deps: [
        'ModuleA',
        { dep: 'TestModuleOptions', optional: true }
      ]
    })
    class TestModule {
      constructor({ testModuleOptions }) {
        this.testModuleOptions = testModuleOptions;
      }
    }

    @ModuleFactory({
      providers: [
        { provide: 'TestModuleOptions', useValue: { key: 'key' } },
        { provide: 'ModuleA', useClass: ModuleA },
        { provide: 'TestModule', useClass: TestModule },
      ]
    })
    class ChildModule {
      constructor({ testModule }) {
        expect(testModule).to.be.an.instanceof(TestModule);
        expect(testModule.testModuleOptions).to.deep.equal({
          key: 'key'
        });
      }
    }
    Injector.bootstrap(ChildModule);
  });
});
