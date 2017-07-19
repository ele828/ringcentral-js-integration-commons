import { combineReducers } from 'redux';
import getModuleStatusReducer from '../../lib/getModuleStatusReducer';

export function getMessagesReducer(types) {
  return (state = [], { type, messages }) => {
    if (type === types.messagesLoaded) return messages;
    else if (type === types.messagesReset) return [];
    return state;
  };
}

export function getMessageStatusReducer(types) {
  return (state = null, { type }) => {
    if (type === types.initMessageLoad) return type;
    else if (type === types.messagesLoaded) return type;
    else if (type === types.messagesReset) return type;
    return state;
  };
}

export default function getRecentMessagesReducer(types) {
  return combineReducers({
    status: getModuleStatusReducer(types),
    messages: getMessagesReducer(types),
    messageStatus: getMessageStatusReducer(types)
  });
}
