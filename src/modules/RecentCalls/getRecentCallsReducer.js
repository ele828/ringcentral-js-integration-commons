import { combineReducers } from 'redux';
import getModuleStatusReducer from '../../lib/getModuleStatusReducer';
import callStatus from './callStatus';

export function getCallsReducer(types) {
  return (state = [], { type, calls }) => {
    if (type === types.loadSuccess) return calls;
    else if (type === types.loadReset) return [];
    return state;
  };
}

export function getCallStatusReducer(types) {
  return (state = null, { type }) => {
    switch (type) {
      case types.initLoad:
        return callStatus.loading;
      case types.loadReset:
      case types.loadSuccess:
        return callStatus.loaded;
      default:
        return state;
    }
  };
}

export default function getRecentCallsReducer(types) {
  return combineReducers({
    status: getModuleStatusReducer(types),
    calls: getCallsReducer(types),
    callStatus: getCallStatusReducer(types)
  });
}
