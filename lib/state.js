export const state = {
  user: null,
  profile: null,
  rooms: [],
  channels: [],
  currentRoom: null,
  currentChannel: null,
  messagesSub: null,
  presenceChannel: null,
  typingUsers: new Map(),
};

export let isBooted = false;
export function setBooted(v) { isBooted = v; }
export function getBooted() { return isBooted; }

export let pendingAttachmentUrl = null;
export function setPendingAttachmentUrl(url) { pendingAttachmentUrl = url; }
export function getPendingAttachmentUrl() { return pendingAttachmentUrl; }