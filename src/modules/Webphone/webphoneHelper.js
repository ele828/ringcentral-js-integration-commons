import recordStatus from './recordStatus';

export function isBrowerSupport() {
  const isChrome = !!(navigator.userAgent.match(/Chrom(e|ium)/));
  if (!isChrome) {
    return false;
  }
  const chromeVersion =
    parseInt(navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./)[2], 10);
  if (chromeVersion >= 51) {
    return true;
  }
  return false;
}

export function normalizeSession(session) {
  return {
    id: session.id,
    direction: session.direction,
    callStatus: session.callStatus,
    to: session.request.to.uri.user,
    toUserName: session.request.to.displayName,
    from: session.request.from.uri.user,
    fromUserName: session.request.from.displayName,
    startTime: (new Date(session.startTime)).getTime(),
    creationTime: session.creationTime,
    isOnHold: !!session.isOnHold().local,
    isOnMute: !!session.isOnMute,
    isOnFlip: !!session.isOnFlip,
    recordStatus: session.recordStatus || recordStatus.idle,
    contactMatch: session.contactMatch,
    minimized: !!session.minimized,
  };
}

function createRcMessage(options) {
  options.body = options.body || '';
  const msgBody = `<Msg><Hdr SID="${options.sid}" Req="${options.request}" From="${options.from}" To="${options.to}" Cmd="${options.cmd}"/> <Bdy Cln="${this.sipInfo.authorizationId}" ${options.body}/></Msg>`;
  return msgBody;
}

function sendMessage(to, messageData) {
  const userAgent = this;
  const sipOptions = {};
  sipOptions.contentType = 'x-rc/agent';
  sipOptions.extraHeaders = [];
  sipOptions.extraHeaders.push(`P-rc-ws: ${this.contact}`);

  return new Promise((resolve, reject) => {
    const message = userAgent.message(to, messageData, sipOptions);

    message.once('accepted', () => {
      resolve();
    });
    message.once('failed', (response, cause) => {
      reject(new Error(cause));
    });
  });
}

function onMessage(e) {
  let data = e.data;

  // WebSocket binary message.
  if (typeof data !== 'string') {
    try {
      data = String.fromCharCode.apply(null, new Uint8Array(data));
    } catch (error) {
      return this._onMessage.apply(this, [e]);
    }
  }

  if (data.match(/CSeq:\s*\d+\s+MESSAGE/i)) {
    const re = new RegExp(`${this.ua.configuration.viaHost}:\\d+`, 'g');
    const newData = e.data.replace(re, this.ua.configuration.viaHost);
    Object.defineProperty(e, 'data', {
      value: newData,
      writable: false
    });
  }

  return this._onMessage.apply(this, [e]);
}

export function patchUserAgent(userAgent) {
  userAgent.createRcMessage = createRcMessage;
  userAgent.sendMessage = sendMessage;
  userAgent.transport._onMessage = userAgent.transport.onMessage;
  userAgent.transport.onMessage = onMessage;
}

// parse RC headers
function parseRcHeader(session) {
  const prc = session.request.headers['P-Rc'];
  if (prc && prc.length) {
    const rawInviteMsg = prc[0].raw;
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(rawInviteMsg, 'text/xml');
    const hdrNode = xmlDoc.getElementsByTagName('Hdr')[0];

    if (hdrNode) {
      session.rcHeaders = {
        sid: hdrNode.getAttribute('SID'),
        request: hdrNode.getAttribute('Req'),
        from: hdrNode.getAttribute('From'),
        to: hdrNode.getAttribute('To'),
      };
    }
  }
}

function canUseRCMCallControl() {
  return !!this.rcHeaders;
}

function createSessionMessage(options) {
  if (!this.rcHeaders) {
    return undefined;
  }

  const opts = {
    ...options,
    sid: this.rcHeaders.sid,
    request: this.rcHeaders.request,
    from: this.rcHeaders.to,
    to: this.rcHeaders.from
  };

  return this.ua.createRcMessage(opts);
}

function sendSessionMessage(options) {
  if (!this.rcHeaders) {
    return Promise.reject(new Error('Can\'t send SIP MESSAGE related to session: no RC headers available'));
  }

  const to = this.rcHeaders.from;

  return this.ua.sendMessage(to, this.createSessionMessage(options));
}

function sendReceiveConfirm() {
  return this.sendSessionMessage({ cmd: 17 });
}

function toVoiceMail() {
  return this.sendSessionMessage({ cmd: 11 });
}

function replyWithMessage(replyOptions) {
  let body = `RepTp="${replyOptions.replyType}"`;

  if (replyOptions.replyType === 0) {
    body = `${body} Bdy="${replyOptions.replyText}"`;
  } else if (replyOptions.replyType === 1) {
    body = `${body} Vl="${replyOptions.timeValue}"`;
    body = `${body} Units="${replyOptions.timeUnits}"`;
    body = `${body} Dir="${replyOptions.callbackDirection}"`;
  }

  return this.sendSessionMessage({ cmd: 14, body });
}

export function patchIncomingSession(session) {
  try {
    parseRcHeader(session);
  } catch (e) {
    console.error('RC_Phone: Can\'t parse RC heders from invite request due to ', e);
  }

  session.canUseRCMCallControl = canUseRCMCallControl;
  session.createSessionMessage = createSessionMessage;
  session.sendSessionMessage = sendSessionMessage;
  session.sendReceiveConfirm = sendReceiveConfirm;
  session.toVoiceMail = toVoiceMail;

  session.replyWithMessage = replyWithMessage;
}
