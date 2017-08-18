'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = undefined;

var _map = require('babel-runtime/core-js/map');

var _map2 = _interopRequireDefault(_map);

var _set = require('babel-runtime/core-js/set');

var _set2 = _interopRequireDefault(_set);

var _extends2 = require('babel-runtime/helpers/extends');

var _extends3 = _interopRequireDefault(_extends2);

var _getPrototypeOf = require('babel-runtime/core-js/object/get-prototype-of');

var _getPrototypeOf2 = _interopRequireDefault(_getPrototypeOf);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _possibleConstructorReturn2 = require('babel-runtime/helpers/possibleConstructorReturn');

var _possibleConstructorReturn3 = _interopRequireDefault(_possibleConstructorReturn2);

var _inherits2 = require('babel-runtime/helpers/inherits');

var _inherits3 = _interopRequireDefault(_inherits2);

var _uuid = require('uuid');

var _uuid2 = _interopRequireDefault(_uuid);

var _TransportBase2 = require('../TransportBase');

var _TransportBase3 = _interopRequireDefault(_TransportBase2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* global chrome */

var ServerTransport = function (_TransportBase) {
  (0, _inherits3.default)(ServerTransport, _TransportBase);

  function ServerTransport(options) {
    (0, _classCallCheck3.default)(this, ServerTransport);

    var _this = (0, _possibleConstructorReturn3.default)(this, (ServerTransport.__proto__ || (0, _getPrototypeOf2.default)(ServerTransport)).call(this, (0, _extends3.default)({}, options, {
      name: 'ChromeTransport'
    })));

    _this._ports = new _set2.default();
    _this._requests = new _map2.default();
    chrome.runtime.onConnect.addListener(function (port) {
      if (port.name === 'transport') {
        _this._ports.add(port);
        port.onMessage.addListener(function (_ref) {
          var type = _ref.type,
              requestId = _ref.requestId,
              payload = _ref.payload;

          if (type === _this._events.request && requestId && payload) {
            _this._requests.set(requestId, port);
            _this.emit(_this._events.request, {
              requestId: requestId,
              payload: payload
            });
          }
        });
        port.onDisconnect.addListener(function () {
          _this._ports.delete(port);
        });
      }
    });
    return _this;
  }

  (0, _createClass3.default)(ServerTransport, [{
    key: 'response',
    value: function response(_ref2) {
      var requestId = _ref2.requestId,
          result = _ref2.result,
          error = _ref2.error;

      var port = this._requests.get(requestId);
      if (port) {
        this._requests.delete(requestId);
        port.postMessage({
          type: this._events.response,
          requestId: requestId,
          result: result,
          error: error
        });
      }
    }
  }, {
    key: 'push',
    value: function push(_ref3) {
      var _this2 = this;

      var payload = _ref3.payload;

      this._ports.forEach(function (port) {
        port.postMessage({
          type: _this2._events.push,
          payload: payload
        });
      });
    }
  }]);
  return ServerTransport;
}(_TransportBase3.default);

exports.default = ServerTransport;
//# sourceMappingURL=ServerTransport.js.map
