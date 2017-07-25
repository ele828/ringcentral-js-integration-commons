import { expect } from 'chai';
import {
  getMessagesReducer,
  getMessageStatusReducer
} from './getRecentMessagesReducer';
import actionTypes from './actionTypes';
import messageStatus from './messageStatus';

describe('RecentMessages :: getMessagesReducer', () => {
  it('getMessagesReducer should be a function', () => {
    expect(getMessagesReducer).to.be.a('function');
  });
  it('getMessagesReducer should return a reducer', () => {
    expect(getMessagesReducer()).to.be.a('function');
  });

  describe('messagesReducer', () => {
    const reducer = getMessagesReducer(actionTypes);
    it('should have initial state of empty array', () => {
      expect(reducer(undefined, {})).to.have.lengthOf(0);
    });

    it('should return original state of actionTypes is not recognized', () => {
      const originalState = [1, 2, 3];
      expect(reducer(originalState, { type: 'foo' }))
        .to.equal(originalState);
    });

    it('should return messages as passed in', () => {
      const messages = { id: 1 };
      expect(reducer([], {
        type: actionTypes.loadSuccess,
        messages
      })).to.equal(messages);
    });

    it('messages should be empty when reset', () => {
      expect(reducer([], {
        type: actionTypes.messagesReset
      })).to.have.lengthOf(0);
    });
  });
});


describe('RecentMessages :: getMessageStatusReducer', () => {
  it('getMessageStatusReducer should be a function', () => {
    expect(getMessageStatusReducer).to.be.a('function');
  });
  it('getMessageStatusReducer should return a reducer', () => {
    expect(getMessageStatusReducer()).to.be.a('function');
  });

  describe('messageStatusReducer', () => {
    const reducer = getMessageStatusReducer(actionTypes);
    it('should have initial state of null', () => {
      expect(reducer(undefined, {})).to.equal(null);
    });
    it('should return original state of actionTypes is not recognized', () => {
      const originalState = actionTypes.initLoad;
      expect(reducer(originalState, { type: 'foo' }))
        .to.equal(originalState);
    });
    it('messageLoad status should be set', () => {
      expect(reducer(null, {
        type: actionTypes.initLoad,
      })).to.equal(messageStatus.loading);
      expect(reducer(null, {
        type: actionTypes.loadReset,
      })).to.equal(messageStatus.loaded);
      expect(reducer(null, {
        type: actionTypes.loadSuccess,
      })).to.equal(messageStatus.loaded);
    });
  });
});
