import { expect } from 'chai';
import {
  getCallsReducer,
  getCallStatusReducer
} from './getRecentCallsReducer';
import actionTypes from './actionTypes';
import callStatus from './callStatus';

describe('RecentCalls :: getCallsReducer', () => {
  it('getCallsReducer should be a function', () => {
    expect(getCallsReducer).to.be.a('function');
  });
  it('getCallsReducer should return a reducer', () => {
    expect(getCallsReducer()).to.be.a('function');
  });

  describe('callsreducer', () => {
    const reducer = getCallsReducer(actionTypes);
    it('should have initial state of empty array', () => {
      expect(reducer(undefined, {})).to.have.lengthOf(0);
    });

    it('should return original state of actionTypes is not recognized', () => {
      const originalState = [1, 2, 3];
      expect(reducer(originalState, { type: 'foo' }))
        .to.equal(originalState);
    });

    it('should return calls as passed in', () => {
      const calls = { id: 1 };
      expect(reducer([], {
        type: actionTypes.loadSuccess,
        calls
      })).to.equal(calls);
    });

    it('calls should be empty when reset', () => {
      expect(reducer([], {
        type: actionTypes.loadReset
      })).to.have.lengthOf(0);
    });
  });
});


describe('RecentCalls :: getCallStatusReducer', () => {
  it('getCallStatusReducer should be a function', () => {
    expect(getCallStatusReducer).to.be.a('function');
  });
  it('getCallStatusReducer should return a reducer', () => {
    expect(getCallStatusReducer()).to.be.a('function');
  });

  describe('callStatusReducer', () => {
    const reducer = getCallStatusReducer(actionTypes);
    it('should have initial state of null', () => {
      expect(reducer(undefined, {})).to.equal(null);
    });
    it('should return original state of actionTypes is not recognized', () => {
      const originalState = actionTypes.initLoad;
      expect(reducer(originalState, { type: 'foo' }))
        .to.equal(originalState);
    });
    it('call status can be set', () => {
      expect(reducer(null, {
        type: actionTypes.initLoad,
      })).to.equal(callStatus.loading);
      expect(reducer(null, {
        type: actionTypes.loadReset,
      })).to.equal(callStatus.loaded);
      expect(reducer(null, {
        type: actionTypes.loadSuccess,
      })).to.equal(callStatus.loaded);
    });
  });
});
