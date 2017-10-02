import { expect } from 'chai';
import {
  Injector,
  Module,
  Library,
  ModuleFactory
} from '../';
import Registry from '../registry/registry';
import { ClassProvider, ExistingProvider, ValueProvider } from '../provider';

describe('Injector', () => {
  beforeEach(() => Injector.reset());

  describe('#constructor', () => {
    it('should include module and provider registry', () => {
      const injector = new Injector();
      expect(injector.moduleRegistry).to.exist;
      expect(injector.providerRegistry).to.exist;
    });
  });

  describe('#resolveModuleProvider', () => {
    it('should throw when provider class does not exist', () => {
      const invalidParamsFunction = () => {
        const injector = new Injector();
        injector.resolveModuleProvider();
      };
      expect(invalidParamsFunction).to.throw;
    });

    it('should not calculate provider if already exists', () => {
      const injector = new Injector();
      const provider = new ClassProvider('Token', {});
      injector.container.set('Token', provider);
      injector.resolveModuleProvider(provider);
      const instance = injector.get('Token');
      expect(injector.container._map.size).to.equal(1);
    });

    describe('ExistingProvider', () => {
      it('should support ClassProvider', () => {
        class Provider {}
        Registry.registerModule(Provider);
        const injector = new Injector();
        injector.universalProviders.set(
          'Provider',
          new ClassProvider('Provider', Provider)
        );
        injector.universalProviders.set(
          'Exist',
          new ExistingProvider('Exist', 'Provider')
        );
        injector.resolveModuleProvider(injector.universalProviders.get('Exist'));
        const instance = injector.get('Exist');
        expect(injector.container._map.size).to.equal(2);
        expect(injector.get('Exist')).to.be.an.instanceof(Provider);
      });

      it('shold throw when use existing parent ModuleFactory provider', () => {
        class Provider {}
        Registry.registerModule(Provider);
        const parentInjector = new Injector();
        const injector = new Injector();
        injector.setParent(parentInjector);
        parentInjector.universalProviders.set(
          'Provider',
          new ClassProvider('Provider', Provider)
        );
        injector.universalProviders.set(
          'Exist',
          new ExistingProvider('Exist', 'Provider')
        );
        const func = () => injector.resolveModuleProvider(injector.universalProviders.get('Exist'));
        expect(func).to.throw;
      });

      it('should support ValueProvider', () => {
        const val = { val: 'val' };
        const injector = new Injector();
        injector.universalProviders.set(
          'ValueProvider',
          new ValueProvider('ValueProvider', val)
        );
        injector.universalProviders.set(
          'Exist',
          new ExistingProvider('Exist', 'ValueProvider')
        );
        injector.resolveModuleProvider(injector.universalProviders.get('Exist'));
        const instance = injector.get('Exist');
        expect(injector.container._map.size).to.equal(2);
        expect(injector.get('Exist')).to.equal(val);
      });

      it('should support FactoryProvider', () => {
        const func = () => {};
        const injector = new Injector();
        injector.universalProviders.set(
          'FactoryProvider',
          new ValueProvider('FactoryProvider', func)
        );
        injector.universalProviders.set(
          'Exist',
          new ExistingProvider('Exist', 'FactoryProvider')
        );
        injector.resolveModuleProvider(injector.universalProviders.get('Exist'));
        const instance = injector.get('Exist');
        expect(injector.container._map.size).to.equal(2);
        expect(injector.get('Exist')).to.equal(func);
      });
    });

    describe('hierarchical providers', () => {
      it('should be copied to local container', () => {
        class Provider {}
        Registry.registerModule(Provider);
        const parentInjector = new Injector();
        const injector = new Injector();
        injector.setParent(parentInjector);
        parentInjector.universalProviders.set(
          'Provider',
          new ClassProvider('Provider', Provider)
        );
        injector.resolveModuleProvider(parentInjector.universalProviders.get('Provider'));
        expect(injector.container.localHas('Provider')).to.be.true;
        expect(parentInjector.container.localHas('Provider')).to.be.true;
        expect(
          parentInjector.container.localGet('Provider')
        ).to.equal(
          injector.container.localGet('Provider')
        )
      });
    });

    describe('ValueProvider', () => {
      it('should process ValueProvider correctly', () => {
        const config = { config: 'test' };
        const injector = new Injector();
        injector.universalProviders.set(
          'Config',
          new ValueProvider('Config', config)
        );
        injector.resolveModuleProvider(injector.universalProviders.get('Config'));
        expect(injector.container.get('Config').instance).to.equal(config);
      });

      it('should recognize spread flag', () => {
        const config = { config: 'test' };
        const injector = new Injector();
        injector.universalProviders.set(
          'Config',
          new ValueProvider('Config', config, true)
        );
        injector.resolveModuleProvider(injector.universalProviders.get('Config'));
        expect(injector.container.get('Config').instance).to.deep.equal({
          spread: true,
          value: config
        });
      });
    });

    describe('FactoryProvider', () => {
      it('should support factory provider', () => {

      });
    });
  });
});
