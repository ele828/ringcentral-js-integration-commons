import Enum from '../../lib/Enum';

export default new Enum([
  'connectFailed',
  'connected',
  'browserNotSupported',
  'webphoneCountOverLimit',
  'notOutboundCallWithoutDL',
  'notWebphonePermission',
  'getSipProvisionError',
  'toVoiceMailError',
  'checkDLError',
  'forwardError',
  'muteError',
  'holdError',
  'flipError',
  'recordError',
  'recordDisabled'
], 'webphone');
