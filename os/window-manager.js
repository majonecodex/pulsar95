import { escapeHtml } from '../lib/dom.js';

const WINDOW_POS_KEY = 'pulsar95_window_geometry';
let openWindows = {};
let topZIndex = 300;

function loadWindowGeometry() {
  try { return JSON.parse(localStorage.getItem(WINDOW_POS_KEY) || '{}'); }
  catch (e) { return {}; }
}
function saveWindowGeometry(id, geometry) {
  const all = loadWindowGeometry();
  all[id] = geometry;
  localStorage.setItem(WINDOW_POS_KEY, JSON.stringify(all));
}

export function openWindow(options) {
  const {
    id, title = 'Window', icon = '📄',
    width = 500, height = 400, x, y, content,
    onClose, onFocus, resizable = true, minimizable = true, maximizable = true,
  } = options;

  if (openWindows[id]) {
    focusWindow(id);
    if (openWindows[id].element.classList.contains('minimized')) restoreWindow(id);
    return openWindows[id].element;
  }

  const savedGeometry = loadWindowGeometry()[id];
  const desktop = document.getElementById('desktop');
  if (!desktop) return null;
  const desktopRect = desktop.getBoundingClientRect();
  const finalWidth = Math.min(width, desktopRect.width - 40);
  const finalHeight = Math.min(height, desktopRect.height - 40);
  const offset = (Object.keys(openWindows).length % 6) * 24;
  const defaultX = Math.max(20, (desktopRect.width - finalWidth) / 2 + offset - 60);
  const defaultY = Math.max(20, (desktopRect.height - finalHeight) / 2 + offset - 60);

  const posX = x !== undefined ? x : (savedGeometry?.x ?? defaultX);
  const posY = y !== undefined ? y : (savedGeometry?.y ?? defaultY);
  const posW = savedGeometry?.width ?? finalWidth;
  const posH = savedGeometry?.height ?? finalHeight;

  const win = document.createElement('div');
  win.className = 'os-window';
  win.dataset.windowId = id;
  win.style.left = posX + 'px';
  win.style.top = posY + 'px';
  win.style.width = posW + 'px';
  win.style.height = posH + 'px';
  win.style.zIndex = ++topZIndex;

  win.innerHTML =
    '<div class="win-titlebar">' +
    '<div class="win-icon">' + escapeHtml(icon) + '</div>' +
    '<div class="win-title">' + escapeHtml(title) + '</div>' +
    '<div class="win-controls">' +
    (minimizable ? '<button class="win-btn win-min" title="Minimize">_</button>' : '') +
    (maximizable ? '<button class="win-btn win-max" title="Maximize">□</button>' : '') +
    '<button class="win-btn win-close" title="Close">✕</button>' +
    '</div></div>' +
    '<div class="win-body"></div>' +
    (resizable ?
      '<div class="win-resize win-resize-n"></div>' +
      '<div class="win-resize win-resize-s"></div>' +
      '<div class="win-resize win-resize-e"></div>' +
      '<div class="win-resize win-resize-w"></div>' +
      '<div class="win-resize win-resize-ne"></div>' +
      '<div class="win-resize win-resize-nw"></div>' +
      '<div class="win-resize win-resize-se"></div>' +
      '<div class="win-resize win-resize-sw"></div>' : '');

  const body = win.querySelector('.win-body');
  if (typeof content === 'string') body.innerHTML = content;
  else if (content instanceof HTMLElement) body.appendChild(content);

  const layer = document.getElementById('window-layer');
  if (!layer) return null;
  layer.appendChild(win);

  openWindows[id] = {
    element: win, title, icon, onClose, onFocus,
    resizable, maximizable, minimizable, maximized: false, previousGeometry: null,
  };

  win.querySelector('.win-close')?.addEventListener('click', (e) => {
    e.stopPropagation(); closeWindow(id);
  });
  win.querySelector('.win-min')?.addEventListener('click', (e) => {
    e.stopPropagation(); minimizeWindow(id);
  });
  win.querySelector('.win-max')?.addEventListener('click', (e) => {
    e.stopPropagation(); toggleMaximizeWindow(id);
  });

  const titlebar = win.querySelector('.win-titlebar');
  titlebar.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.win-btn')) return;
    startWindowDrag(e, id);
  });

  win.addEventListener('mousedown', () => focusWindow(id));

  if (resizable) {
    win.querySelectorAll('.win-resize').forEach((handle) => {
      handle.addEventListener('mousedown', (e) => {
        const cls = handle.className;
        const dir = cls.replace('win-resize', '').replace('win-resize-', '').trim();
        startWindowResize(e, id, dir);
      });
    });
  }

  focusWindow(id);
  if (window.updateTaskButtons) window.updateTaskButtons();
  return win;
}

export function focusWindow(id) {
  const entry = openWindows[id];
  if (!entry) return;
  entry.element.style.zIndex = ++topZIndex;
  document.querySelectorAll('.os-window').forEach((el) => {
    el.classList.toggle('focused', el.dataset.windowId === id);
  });
  entry.onFocus?.();
  if (window.updateTaskButtons) window.updateTaskButtons();
}

export function closeWindow(id) {
  const entry = openWindows[id];
  if (!entry) return;
  const el = entry.element;
  saveWindowGeometry(id, {
    x: parseFloat(el.style.left), y: parseFloat(el.style.top),
    width: parseFloat(el.style.width), height: parseFloat(el.style.height),
  });
  entry.onClose?.();
  el.remove();
  delete openWindows[id];

  const remaining = Object.keys(openWindows);
  if (remaining.length > 0) {
    let topId = remaining[0]; let topZ = -1;
    remaining.forEach((wId) => {
      const z = parseInt(openWindows[wId].element.style.zIndex, 10) || 0;
      if (z > topZ) { topZ = z; topId = wId; }
    });
    focusWindow(topId);
  }
  if (window.updateTaskButtons) window.updateTaskButtons();
}

export function minimizeWindow(id) {
  const entry = openWindows[id];
  if (!entry) return;
  entry.element.classList.add('minimized');
  const remaining = Object.keys(openWindows).filter((wId) => {
    return !openWindows[wId].element.classList.contains('minimized');
  });
  if (remaining.length > 0) {
    let topId = remaining[0]; let topZ = -1;
    remaining.forEach((wId) => {
      const z = parseInt(openWindows[wId].element.style.zIndex, 10) || 0;
      if (z > topZ) { topZ = z; topId = wId; }
    });
    focusWindow(topId);
  } else {
    document.querySelectorAll('.os-window').forEach((el) => el.classList.remove('focused'));
  }
  if (window.updateTaskButtons) window.updateTaskButtons();
}

export function restoreWindow(id) {
  const entry = openWindows[id];
  if (!entry) return;
  entry.element.classList.remove('minimized');
  focusWindow(id);
  if (window.updateTaskButtons) window.updateTaskButtons();
}

export function toggleMaximizeWindow(id) {
  const entry = openWindows[id];
  if (!entry || !entry.maximizable) return;
  const el = entry.element;
  if (entry.maximized) {
    if (entry.previousGeometry) {
      el.style.left = entry.previousGeometry.x + 'px';
      el.style.top = entry.previousGeometry.y + 'px';
      el.style.width = entry.previousGeometry.width + 'px';
      el.style.height = entry.previousGeometry.height + 'px';
    }
    el.classList.remove('maximized');
    entry.maximized = false;
  } else {
    entry.previousGeometry = {
      x: parseFloat(el.style.left), y: parseFloat(el.style.top),
      width: parseFloat(el.style.width), height: parseFloat(el.style.height),
    };
    el.classList.add('maximized');
    entry.maximized = true;
  }
}

let windowDragState = { active: false, id: null, startX: 0, startY: 0, startLeft: 0, startTop: 0 };

function startWindowDrag(e, id) {
  const entry = openWindows[id];
  if (!entry || entry.maximized) return;
  const el = entry.element;
  windowDragState.active = true;
  windowDragState.id = id;
  windowDragState.startX = e.clientX;
  windowDragState.startY = e.clientY;
  windowDragState.startLeft = parseFloat(el.style.left) || 0;
  windowDragState.startTop = parseFloat(el.style.top) || 0;
  document.body.classList.add('window-dragging');
  document.addEventListener('mousemove', onWindowDragMove);
  document.addEventListener('mouseup', onWindowDragEnd);
  e.preventDefault();
}

function onWindowDragMove(e) {
  if (!windowDragState.active) return;
  const entry = openWindows[windowDragState.id];
  if (!entry) return;
  const el = entry.element;
  const desktop = document.getElementById('desktop');
  const maxX = desktop.clientWidth - el.offsetWidth;
  const maxY = desktop.clientHeight - el.offsetHeight;
  let newLeft = windowDragState.startLeft + (e.clientX - windowDragState.startX);
  let newTop = windowDragState.startTop + (e.clientY - windowDragState.startY);
  newLeft = Math.max(-el.offsetWidth + 100, Math.min(maxX, newLeft));
  newTop = Math.max(0, Math.min(maxY, newTop));
  el.style.left = newLeft + 'px';
  el.style.top = newTop + 'px';
}

function onWindowDragEnd() {
  if (!windowDragState.active) return;
  const id = windowDragState.id;
  windowDragState.active = false;
  document.body.classList.remove('window-dragging');
  document.removeEventListener('mousemove', onWindowDragMove);
  document.removeEventListener('mouseup', onWindowDragEnd);
  const entry = openWindows[id];
  if (entry) {
    saveWindowGeometry(id, {
      x: parseFloat(entry.element.style.left), y: parseFloat(entry.element.style.top),
      width: parseFloat(entry.element.style.width), height: parseFloat(entry.element.style.height),
    });
  }
}

let windowResizeState = {
  active: false, id: null, dir: '',
  startX: 0, startY: 0, startLeft: 0, startTop: 0, startWidth: 0, startHeight: 0,
};

function startWindowResize(e, id, dir) {
  const entry = openWindows[id];
  if (!entry || !entry.resizable || entry.maximized) return;
  const el = entry.element;
  windowResizeState.active = true;
  windowResizeState.id = id;
  windowResizeState.dir = dir;
  windowResizeState.startX = e.clientX;
  windowResizeState.startY = e.clientY;
  windowResizeState.startLeft = parseFloat(el.style.left) || 0;
  windowResizeState.startTop = parseFloat(el.style.top) || 0;
  windowResizeState.startWidth = parseFloat(el.style.width) || el.offsetWidth;
  windowResizeState.startHeight = parseFloat(el.style.height) || el.offsetHeight;
  document.body.classList.add('window-resizing');
  document.addEventListener('mousemove', onWindowResizeMove);
  document.addEventListener('mouseup', onWindowResizeEnd);
  e.preventDefault(); e.stopPropagation();
}

function onWindowResizeMove(e) {
  if (!windowResizeState.active) return;
  const entry = openWindows[windowResizeState.id];
  if (!entry) return;
  const el = entry.element;
  const dx = e.clientX - windowResizeState.startX;
  const dy = e.clientY - windowResizeState.startY;
  const dir = windowResizeState.dir;
  let newLeft = windowResizeState.startLeft;
  let newTop = windowResizeState.startTop;
  let newWidth = windowResizeState.startWidth;
  let newHeight = windowResizeState.startHeight;
  const MIN_W = 200, MIN_H = 120;
  if (dir.includes('e')) newWidth = Math.max(MIN_W, windowResizeState.startWidth + dx);
  if (dir.includes('s')) newHeight = Math.max(MIN_H, windowResizeState.startHeight + dy);
  if (dir.includes('w')) {
    newWidth = Math.max(MIN_W, windowResizeState.startWidth - dx);
    newLeft = windowResizeState.startLeft + (windowResizeState.startWidth - newWidth);
  }
  if (dir.includes('n')) {
    newHeight = Math.max(MIN_H, windowResizeState.startHeight - dy);
    newTop = windowResizeState.startTop + (windowResizeState.startHeight - newHeight);
  }
  el.style.left = newLeft + 'px'; el.style.top = newTop + 'px';
  el.style.width = newWidth + 'px'; el.style.height = newHeight + 'px';
}

function onWindowResizeEnd() {
  if (!windowResizeState.active) return;
  const id = windowResizeState.id;
  windowResizeState.active = false;
  document.body.classList.remove('window-resizing');
  document.removeEventListener('mousemove', onWindowResizeMove);
  document.removeEventListener('mouseup', onWindowResizeEnd);
  const entry = openWindows[id];
  if (entry) {
    saveWindowGeometry(id, {
      x: parseFloat(entry.element.style.left), y: parseFloat(entry.element.style.top),
      width: parseFloat(entry.element.style.width), height: parseFloat(entry.element.style.height),
    });
  }
}

export function getOpenWindows() {
  return Object.entries(openWindows).map(([id, entry]) => ({
    id, title: entry.title, icon: entry.icon,
    minimized: entry.element.classList.contains('minimized'),
    focused: entry.element.classList.contains('focused'),
  }));
}

export function closeAllWindows() {
  Object.keys(openWindows).forEach((id) => openWindows[id]?.element.remove());
  openWindows = {};
  if (window.updateTaskButtons) window.updateTaskButtons();
}