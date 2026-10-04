import { escapeHtml } from '../lib/dom.js';
import Sound from '../sounds.js';
import { showContextMenu, CONTEXT_MENUS } from './context-menu.js';

export const DESKTOP_ICONS = [
  { id: 'my-computer', label: 'My Computer', icon: '🖥️',
    action: () => alert('My Computer\n\n💾  Local Disk (C:)\n📀  CD-ROM Drive (D:)\n\n(File explorer coming soon)'),
    defaultPos: { x: 16, y: 16 } },
  { id: 'my-documents', label: 'My Documents', icon: '📁',
    action: () => alert('My Documents\n\n📄  readme.txt\n📁  My Pictures\n📁  My Music\n\n(File explorer coming soon)'),
    defaultPos: { x: 16, y: 100 } },
  { id: 'network', label: 'Network Neighborhood', icon: '🌐',
    action: () => alert('Network Neighborhood\n\n🖥️  PULSAR95-PC\n🖥️  Guest (offline)\n\n(Network explorer coming soon)'),
    defaultPos: { x: 16, y: 184 } },
  { id: 'recycle-bin', label: 'Recycle Bin', icon: '🗑️',
    action: () => alert('Recycle Bin is empty'),
    defaultPos: { x: 16, y: 268 } },
  { id: 'pulsar-chat', label: 'Pulsar95 Chat', icon: '💬',
    action: () => {
      const appScreen = document.getElementById('app-screen');
      if (appScreen) {
        appScreen.classList.remove('hidden');
        const win = appScreen.querySelector('.window');
        if (win) win.style.zIndex = 1000;
      }
      if (window.updateTaskButtons) window.updateTaskButtons();
    },
    defaultPos: { x: 16, y: 352 } },
  { id: 'readme', label: 'Read Me', icon: '📄',
    action: () => alert(
      'Welcome to Pulsar95!\n\n' +
      '• Double-click icons to open\n' +
      '• Drag icons to rearrange\n' +
      '• Right-click desktop for menu\n' +
      '• Double-click "Pulsar95 Chat" to chat\n' +
      '• Start → Programs for apps'
    ),
    defaultPos: { x: 16, y: 436 } },
];

const DESKTOP_POS_KEY = 'pulsar95_desktop_icon_pos';
let desktopIconPositions = {};
let selectedDesktopIcons = new Set();

function loadDesktopIconPositions() {
  try { desktopIconPositions = JSON.parse(localStorage.getItem(DESKTOP_POS_KEY) || '{}'); }
  catch (e) { desktopIconPositions = {}; }
}
function saveDesktopIconPositions() {
  localStorage.setItem(DESKTOP_POS_KEY, JSON.stringify(desktopIconPositions));
}

export function buildDesktop() {
  const container = document.getElementById('desktop-icons');
  if (!container) return;
  loadDesktopIconPositions();
  container.innerHTML = '';

  DESKTOP_ICONS.forEach((icon) => {
    const pos = desktopIconPositions[icon.id] || icon.defaultPos;
    const el = document.createElement('div');
    el.className = 'desktop-icon';
    el.dataset.iconId = icon.id;
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
    el.innerHTML =
      '<div class="icon-image">' + icon.icon + '</div>' +
      '<div class="icon-label">' + escapeHtml(icon.label) + '</div>';

    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        if (!selectedDesktopIcons.has(icon.id)) {
          clearDesktopSelection();
          selectedDesktopIcons.add(icon.id);
          el.classList.add('selected');
        }
        startIconDrag(e, icon.id);
      }
    });
    el.addEventListener('dblclick', () => {
      Sound.click();
      try { icon.action(); } catch (err) { console.error(err); }
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      showContextMenu(e.clientX, e.clientY, CONTEXT_MENUS.desktop());
    });
    container.appendChild(el);
  });
}

export function clearDesktopSelection() {
  selectedDesktopIcons.clear();
  document.querySelectorAll('.desktop-icon.selected').forEach((el) =>
    el.classList.remove('selected'));
}

let iconDragState = { active: false, startX: 0, startY: 0, dragStartPositions: {} };

function startIconDrag(e, iconId) {
  if (e.button !== 0) return;
  const dragging = selectedDesktopIcons.has(iconId)
    ? [...selectedDesktopIcons] : [iconId];

  iconDragState.active = true;
  iconDragState.startX = e.clientX;
  iconDragState.startY = e.clientY;
  iconDragState.dragStartPositions = {};

  dragging.forEach((id) => {
    const iconEl = document.querySelector('.desktop-icon[data-icon-id="' + id + '"]');
    if (!iconEl) return;
    iconDragState.dragStartPositions[id] = {
      x: parseFloat(iconEl.style.left) || 0,
      y: parseFloat(iconEl.style.top) || 0,
    };
  });

  document.body.classList.add('icon-dragging');
  document.addEventListener('mousemove', onIconDragMove);
  document.addEventListener('mouseup', onIconDragEnd);
  e.preventDefault();
}

function onIconDragMove(e) {
  if (!iconDragState.active) return;
  const dx = e.clientX - iconDragState.startX;
  const dy = e.clientY - iconDragState.startY;

  Object.entries(iconDragState.dragStartPositions).forEach(([id, start]) => {
    const iconEl = document.querySelector('.desktop-icon[data-icon-id="' + id + '"]');
    if (!iconEl) return;
    let newX = start.x + dx;
    let newY = start.y + dy;
    const desktop = document.getElementById('desktop');
    const maxX = desktop.clientWidth - iconEl.offsetWidth - 4;
    const maxY = desktop.clientHeight - iconEl.offsetHeight - 4;
    newX = Math.max(4, Math.min(maxX, newX));
    newY = Math.max(4, Math.min(maxY, newY));
    iconEl.style.left = newX + 'px';
    iconEl.style.top = newY + 'px';
  });
}

function onIconDragEnd() {
  if (!iconDragState.active) return;
  iconDragState.active = false;
  document.body.classList.remove('icon-dragging');
  document.removeEventListener('mousemove', onIconDragMove);
  document.removeEventListener('mouseup', onIconDragEnd);

  document.querySelectorAll('.desktop-icon').forEach((el) => {
    const id = el.dataset.iconId;
    if (id) {
      desktopIconPositions[id] = {
        x: parseFloat(el.style.left) || 0,
        y: parseFloat(el.style.top) || 0,
      };
    }
  });
  saveDesktopIconPositions();
}

let selectionBoxState = { active: false, startX: 0, startY: 0 };

export function setupDesktopSelectionBox() {
  const desktop = document.getElementById('desktop');
  const box = document.getElementById('selection-box');
  if (!desktop || !box) return;

  desktop.addEventListener('mousedown', (e) => {
    if (e.target !== desktop && !e.target.classList.contains('desktop-icons')) return;
    if (e.button !== 0) return;
    selectionBoxState.active = true;
    selectionBoxState.startX = e.clientX;
    selectionBoxState.startY = e.clientY;
    box.style.left = e.clientX + 'px';
    box.style.top = e.clientY + 'px';
    box.style.width = '0px';
    box.style.height = '0px';
    box.classList.add('active');
    document.body.classList.add('selecting');
    document.addEventListener('mousemove', onSelectionMove);
    document.addEventListener('mouseup', onSelectionEnd);
    clearDesktopSelection();
    e.preventDefault();
  });
}

function onSelectionMove(e) {
  if (!selectionBoxState.active) return;
  const box = document.getElementById('selection-box');
  if (!box) return;
  const x1 = Math.min(selectionBoxState.startX, e.clientX);
  const y1 = Math.min(selectionBoxState.startY, e.clientY);
  const x2 = Math.max(selectionBoxState.startX, e.clientX);
  const y2 = Math.max(selectionBoxState.startY, e.clientY);
  box.style.left = x1 + 'px'; box.style.top = y1 + 'px';
  box.style.width = (x2 - x1) + 'px'; box.style.height = (y2 - y1) + 'px';

  document.querySelectorAll('.desktop-icon').forEach((el) => {
    const rect = el.getBoundingClientRect();
    const intersects = !(rect.right < x1 || rect.left > x2 || rect.bottom < y1 || rect.top > y2);
    if (intersects) {
      el.classList.add('selected');
      selectedDesktopIcons.add(el.dataset.iconId);
    } else {
      el.classList.remove('selected');
      selectedDesktopIcons.delete(el.dataset.iconId);
    }
  });
}

function onSelectionEnd() {
  if (!selectionBoxState.active) return;
  selectionBoxState.active = false;
  const box = document.getElementById('selection-box');
  if (box) box.classList.remove('active');
  document.body.classList.remove('selecting');
  document.removeEventListener('mousemove', onSelectionMove);
  document.removeEventListener('mouseup', onSelectionEnd);
}

export function showDesktop() {
  document.getElementById('desktop')?.classList.remove('hidden');
}
export function hideDesktop() {
  document.getElementById('desktop')?.classList.add('hidden');
}