import { expect } from 'chai';
import {
  Injector,
  Module,
  Library,
  ModuleFactory
} from '../';
import Registry from '../registry/registry';

describe('Module and Library decorator', () => {
  beforeEach(() => {
    Injector.reset();
  });

  it('metadata should be registered', () => {
    @Module()
    class FakeModule {}
    @Library()
    class FakeLib {}
    expect(Registry.moduleRegistry.getClass('FakeModule')).to.equal(FakeModule);
    expect(Registry.moduleRegistry.getClass('FakeLib')).to.equal(FakeLib);
  });

  it('Module metadata should be regitered', () => {
    const metadata = { deps: [] };
    @Module(metadata)
    class FakeModule {}
    @Library(metadata)
    class FakeLib {}
    expect(Registry.moduleRegistry.get('FakeModule')).to.equal(metadata);
    expect(Registry.moduleRegistry.get('FakeLib')).to.equal(metadata);
  });

  it('Support empty module metadata', () => {
    @Module()
    class FakeModule {}
    @Library()
    class FakeLib {}
    expect(Registry.moduleRegistry.get('FakeModule')).to.equal(null);
    expect(Registry.moduleRegistry.get('FakeLib')).to.equal(null);
  });

  it('Throw an error when register invalid module', () => {
    function module() {
      @Module([])
      class FakeModule {}
    }
    function library() {
      @Library([])
      class FakeLib {}
    }
    expect(module).to.throw();
    expect(library).to.throw();
  });
});

describe('ModuleFactory decorator', () => {
  beforeEach(() => {
    Injector.reset();
  });
  it('metadata should be registered', () => {
    @ModuleFactory()
    class RootModule {}
    expect(Registry.providerRegistry.get('RootModule')).to.equal(null);
  });

  it('should register metadata', () => {
    const metadata = { providers: [] };
    @ModuleFactory(metadata)
    class RootModule {}
    expect(Registry.providerRegistry.get('RootModule')).to.equal(metadata);
  });

  it('should throw error when metadata is invalid', () => {
    function moduleFactory() {
      @ModuleFactory([])
      class RootModule {}
    }
    expect(moduleFactory).to.throw();
  });

  it('should throw error when providers is invalid', () => {
    function moduleFactory() {
      @ModuleFactory({
        providers: {}
      })
      class RootModule {}
    }
    expect(moduleFactory).to.throw();
  });
});
