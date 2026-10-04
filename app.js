/* ============================================================
   PULSAR95 — Entry Point
   Boots every module in the right order and wires globals.
   ============================================================ */

import { state } from './lib/state.js';

// Auth
import { initAuth } from './auth/auth.js';
import { initInviteCheck } from './auth/invite.js';

// Chat
import { initRoomButtons } from './chat/rooms.js';
import { initChannelButtons } from './chat/channels.js';
import { initComposer } from './chat/composer.js';
import { initMentions } from './chat/mentions.js';

// OS
import { runBootSequence } from './os/boot-sequence.js';
import { initTaskbar } from './os/taskbar.js';
import { initGlobalContextMenus } from './os/context-menu.js';
import { initLightbox } from './os/lightbox.js';
import { initAltF4 } from './os/shutdown.js';
import { buildDesktop, setupDesktopSelectionBox, showDesktop, hideDesktop,
         clearDesktopSelection, DESKTOP_ICONS } from './os/desktop.js';
import {
  openWindow, closeWindow, focusWindow, minimizeWindow, restoreWindow,
  toggleMaximizeWindow, getOpenWindows, closeAllWindows,
} from './os/window-manager.js';
import { setupMobileUI } from './os/mobile-ui.js';

// AI
import { summonPulsar } from './ai/pulsar-bot.js';

// Extras
import { registerTerminalIcon } from './terminal.js';
import { loadSavedTheme, getCurrentTheme, applyTheme, THEMES } from './themes.js';
import { formatGMT8, formatGMT8Full } from './lib/time.js';
import { escapeHtml } from './lib/dom.js';
import Sound from './sounds.js';

/* ---------- Register global PulsarOS namespace ---------- */
window.pulsarOS = {
  openWindow, closeWindow, focusWindow, minimizeWindow, restoreWindow,
  toggleMaximizeWindow, getOpenWindows, closeAllWindows,
  buildDesktop, showDesktop, hideDesktop, clearDesktopSelection,
  DESKTOP_ICONS,
};

/* ---------- Boot the OS UI ---------- */
runBootSequence();
initTaskbar();
initGlobalContextMenus();
initLightbox();
initAltF4();
setupMobileUI();
buildDesktop();
setupDesktopSelectionBox();
loadSavedTheme();

/* ---------- Wire up auth + chat UI ---------- */
initAuth();
initRoomButtons();
initChannelButtons();
initComposer();
initMentions();
initInviteCheck();

/* ---------- Register Terminal app ---------- */
registerTerminalIcon(DESKTOP_ICONS, {
  state,
  escapeHtml,
  getCurrentTheme,
  THEMES,
  pulsarOS: window.pulsarOS,
});

/* ---------- Expose debug namespace ---------- */
window.pulsar = {
  state,
  Sound,
  applyTheme,
  getCurrentTheme,
  summonPulsar,
  formatGMT8,
  formatGMT8Full,
};