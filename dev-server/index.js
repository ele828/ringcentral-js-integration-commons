import { createStore } from 'redux';
import React from 'react';
import ReactDOM from 'react-dom';
import { connect, Provider } from 'react-redux';
import JSONTree from 'react-json-tree';

import { ModuleFactory } from '../src/lib/di';
import RcPhone from '../src/modules/RcPhone';
import config from './config';

@ModuleFactory({
  providers: [
    { provide: 'Config', useValue: config, private: true }
  ]
})
class Phone extends RcPhone {}
const phone = Phone.create();
global.phone = phone;
const store = createStore(phone.reducer);
phone.setStore(store);

store.subscribe(() => {
  console.log(store.getState().lastAction);
});

const DemoView = connect(state => ({
  data: state,
  invertTheme: false,
}), () => ({
  shouldExpandNode: (keyName, data, level) => level < 2,
}))(JSONTree);

ReactDOM.render((
  <Provider store={store}>
    <DemoView />
  </Provider>
), document.querySelector('#viewport'));
