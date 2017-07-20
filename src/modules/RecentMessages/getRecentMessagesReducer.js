import { combineReducers } from 'redux';
import messageStatus from './messageStatus';
import getModuleStatusReducer from '../../lib/getModuleStatusReducer';

export function getMessagesReducer(types) {
  return (state = [], { type, messages }) => {
    if (type === types.loadSuccess) return messages;
    else if (type === types.loadReset) return [];
    return state;
  };
}

export function getMessageStatusReducer(types) {
  return (state = null, { type }) => {
    switch (type) {
      case types.initLoad:
        return messageStatus.loading;
      case types.loadReset:
      case types.loadSuccess:
        return messageStatus.loaded;
      default:
        return state;
    }
  };
}

export default function getRecentMessagesReducer(types) {
  return combineReducers({
    status: getModuleStatusReducer(types),
    messages: getMessagesReducer(types),
    messageStatus: getMessageStatusReducer(types)
  });
}
