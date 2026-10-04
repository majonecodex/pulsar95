import Sound from '../sounds.js';
import { escapeHtml } from './dom.js';

export function win95Confirm(title, message) {
  return new Promise((resolve) => {
    Sound.ding();
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position: fixed; inset: 0; background: rgba(0,0,0,0.3);' +
      'display: flex; align-items: center; justify-content: center;' +
      'z-index: 999999; font-family: "MS Sans Serif", Arial, sans-serif;';
    overlay.innerHTML =
      '<div style="background: var(--win-bg); padding: 2px; border: 2px solid;' +
      'border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
      'min-width: 320px; max-width: 420px; box-shadow: 1px 1px 0 #000;">' +
      '<div style="background: var(--title-bg); color: var(--title-text); padding: 3px 6px;' +
      'font-weight: bold; font-size: 12px; display: flex; justify-content: space-between; align-items: center;">' +
      '<span>' + escapeHtml(title) + '</span><span style="font-size: 10px;">X</span>' +
      '</div>' +
      '<div style="padding: 16px; display: flex; gap: 12px; align-items: flex-start;">' +
      '<div style="font-size: 28px;">❓</div>' +
      '<div style="font-size: 12px; line-height: 1.4;">' + message + '</div>' +
      '</div>' +
      '<div style="padding: 8px 16px 12px; display: flex; gap: 6px; justify-content: center;">' +
      '<button id="w95-yes" style="min-width: 70px; padding: 4px; background: var(--win-bg);' +
      'border: 2px solid; border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
      'font-family: inherit; font-size: 12px; cursor: pointer;">Yes</button>' +
      '<button id="w95-no" style="min-width: 70px; padding: 4px; background: var(--win-bg);' +
      'border: 2px solid; border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
      'font-family: inherit; font-size: 12px; cursor: pointer;">No</button>' +
      '</div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#w95-yes').onclick = () => { overlay.remove(); resolve(true); };
    overlay.querySelector('#w95-no').onclick = () => { overlay.remove(); resolve(false); };
  });
}

export function showPropertiesDialog(title, rows) {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.style.background = 'rgba(0,0,0,0.35)';
  const rowsHtml = rows.map((r) =>
    '<div style="display:flex;padding:4px 0;">' +
    '<div style="width:120px;color: var(--text-muted);font-weight:bold;">' + escapeHtml(r.label) + '</div>' +
    '<div style="flex:1;">' + r.value + '</div>' +
    '</div>'
  ).join('');
  overlay.innerHTML =
    '<div style="background: var(--win-bg);padding:2px;border:2px solid;' +
    'border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
    'min-width:380px;max-width:90vw;box-shadow:1px 1px 0 #000;font-family:\'MS Sans Serif\',Arial,sans-serif;">' +
    '<div style="background: var(--title-bg);color: var(--title-text);padding:3px 6px;font-weight:bold;font-size:12px;' +
    'display:flex;justify-content:space-between;align-items:center;">' +
    '<span>' + escapeHtml(title) + '</span></div>' +
    '<div style="padding:14px;">' + rowsHtml + '</div>' +
    '<div style="padding:8px 16px 12px;text-align:right;">' +
    '<button id="props-ok" style="min-width:70px;padding:4px;background: var(--win-bg);border:2px solid;' +
    'border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
    'font-family:inherit;font-size:12px;cursor:pointer;">OK</button>' +
    '</div></div>';
  document.body.appendChild(overlay);
  overlay.querySelector('#props-ok').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}