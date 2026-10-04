export const $ = (id) => document.getElementById(id);

export const isMobileDevice = () =>
  window.matchMedia('(max-width: 900px)').matches;

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));