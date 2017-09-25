import { createStore } from 'redux';
import React from 'react';
import ReactDOM from 'react-dom';
import { connect, Provider } from 'react-redux';
import JSONTree from 'react-json-tree';

// import Phone from './Phone';
import { ModuleFactory, Module } from '../src/lib/di';
import RcPhone from '../src/modules/RcPhone';
import RcModule from '../src/lib/RcModule';
import config from './config';

@Module()
class Chars {
  toUpperCase(str) {
    return str.toUpperCase();
  }
}

@ModuleFactory({
  providers: [
    RcPhone,
    { provide: 'Chars', useClass: Chars }
  ]
})
class Utils extends RcModule {}

@ModuleFactory({
  providers: [
    { provide: Utils, private: false },
    { provide: 'Config', useValue: config, private: true },
    { provide: 'TestFactory',
      useFactory: ({ utils }) => utils.chars.toUpperCase('test_factory'),
      deps: ['Utils']
    }
  ]
})
class Phone extends RcPhone {}
console.time('init time');
const phone = Phone.create();
console.timeEnd('init time');
global.phone = phone;
const baseStore = createStore(phone.reducer);
phone.setStore(baseStore);

// baseStore.subscribe(() => {
//   console.log(baseStore.getState());
// });

const DemoView = connect(state => ({
  data: state,
  invertTheme: false,
}), () => ({
  shouldExpandNode: (keyName, data, level) => level < 2,
}))(JSONTree);

// const phone = new Phone();
// const store = createStore(phone.reducer);
// store.subscribe(() => {
//   console.log(store.getState());
// });
// global.phone = phone;
// phone.setStore(store);

ReactDOM.render((
  <Provider store={baseStore}>
    <DemoView />
  </Provider>
), document.querySelector('#viewport'));
