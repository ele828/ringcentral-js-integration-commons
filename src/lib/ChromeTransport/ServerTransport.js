import TransportBase from '../TransportBase';

/* global chrome */

export default class ServerTransport extends TransportBase {
  constructor(options) {
    super({
      ...options,
      name: 'ChromeTransport',
    });
    this._ports = new Set();
    this._requests = new Map();

    // Keep active tabs up to date
    this._activeTabs = [];
    chrome.tabs.onActivated.addListener(() => {
      chrome.tabs.query({ active: true }, (tabs) => {
        this._activeTabs = tabs;
      });
    });
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name === 'transport') {
        this._ports.add(port);
        port.onMessage.addListener(({ type, requestId, payload }) => {
          if (type === this._events.request && requestId && payload) {
            this._requests.set(requestId, port);
            this.emit(this._events.request, {
              requestId,
              payload,
            });
          }
        });
        port.onDisconnect.addListener(() => {
          this._ports.delete(port);
        });
      }
    });
  }
  response({ requestId, result, error }) {
    const port = this._requests.get(requestId);
    if (port) {
      this._requests.delete(requestId);
      if (error instanceof Error) {
        error = error.message;
      }
      port.postMessage({
        type: this._events.response,
        requestId,
        result,
        error,
      });
    }
  }
  push({ payload }) {
    const message = { type: this._events.push, payload };
    const isOnActiveTabs = port =>
      !!this._activeTabs.find(tab => tab.id === port.sender.tab.id);
    // Since postMessage is really expensive,
    // we only send messages to those ports on active tabs.
    Array.from(this._ports)
      .filter(port => isOnActiveTabs(port))
      .forEach(port => port.postMessage(message));
  }
}
