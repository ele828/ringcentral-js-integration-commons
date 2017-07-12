import { combineReducers } from 'redux';
import getModuleStatusReducer from '../../lib/getModuleStatusReducer';

export function getMessagesReducer(types) {
  return (state = [], { type, messages }) => {
    if (type === types.fetchSuccess) return messages;
    return state;
  };
}

export default function getRecentMessagesReducer(types) {
  return combineReducers({
    status: getModuleStatusReducer(types),
    messages: getMessagesReducer(types)
  });
}
