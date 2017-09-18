export function isEmpty(param) {
  return !param || param.length === 0;
}

export function isAnonymousFunction(param) {
  return param && param === 'Function';
}

export function getParentClass(klass) {
  return Object.getPrototypeOf(klass);
}

/* eslint-disable */
const STRING_CAMELIZE_REGEXP_1 = (/(\-|\_|\.|\s)+(.)?/g);
const STRING_CAMELIZE_REGEXP_2 = (/(^|\/)([A-Z])/g);

// Transfrom string to camel case, from Ember String
export function camelize(key) {
  return key.replace(
    STRING_CAMELIZE_REGEXP_1,
    (match, separator, chr) => chr ? chr.toUpperCase() : ''
  ).replace(
    STRING_CAMELIZE_REGEXP_2,
    (match, separator, chr) => match.toLowerCase()
  );
}
/* eslint-enable*/
