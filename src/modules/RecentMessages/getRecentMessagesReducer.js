import { combineReducers } from 'redux';
import messageStatus from './messageStatus';
import getModuleStatusReducer from '../../lib/getModuleStatusReducer';

export function getContactsReducer(types) {
  return (state = {}, { type, contact }) => {
    const contactId = String(contact && contact.id);
    if (type === types.loadSuccess) {
      return {
        ...state,
        [contactId]: contact
      };
    } else if (type === types.loadReset) {
      const { [contactId]: _, ...rest } = state;
      return rest;
    }
    return state;
  };
}

export function getMessagesReducer(types) {
  return (state = {}, { type, contact, messages }) => {
    const contactId = String(contact && contact.id);
    if (type === types.loadSuccess) {
      return {
        ...state,
        [contactId]: messages
      };
    } else if (type === types.loadReset) {
      const { [contactId]: _, ...rest } = state;
      return rest;
    }
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
    contacts: getContactsReducer(types),
    messages: getMessagesReducer(types),
    messageStatus: getMessageStatusReducer(types)
  });
}
