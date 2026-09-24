/* ============================================================
   PULSAR95 THEME ENGINE
   9 Win95-inspired color schemes via CSS variables
   ============================================================ */

export const THEMES = {
  classic: {
    name: 'Windows Standard',
    icon: '🪟',
    vars: {
      '--desktop-bg': '#008080',
      '--win-bg': '#c0c0c0',
      '--win-bg-alt': '#dfdfdf',
      '--win-bg-dark': '#b0b0b0',
      '--win-border-light': '#ffffff',
      '--win-border-dark': '#404040',
      '--win-border-mid': '#808080',
      '--title-bg': '#000080',
      '--title-bg-end': '#1084d0',
      '--title-text': '#ffffff',
      '--text': '#000000',
      '--text-muted': '#808080',
      '--accent': '#000080',
      '--accent-text': '#ffffff',
      '--scrollbar-bg': '#dfdfdf',
      '--scrollbar-thumb': '#c0c0c0',
      '--chat-bg': '#ffffff',
      '--chat-text': '#000000',
      '--message-hover': '#f0f0f0',
    },
  },

  highcontrast: {
    name: 'High Contrast Black',
    icon: '◐',
    vars: {
      '--desktop-bg': '#000000',
      '--win-bg': '#000000',
      '--win-bg-alt': '#1a1a1a',
      '--win-bg-dark': '#000000',
      '--win-border-light': '#ffffff',
      '--win-border-dark': '#ffffff',
      '--win-border-mid': '#808080',
      '--title-bg': '#000000',
      '--title-bg-end': '#000000',
      '--title-text': '#ffff00',
      '--text': '#ffffff',
      '--text-muted': '#808080',
      '--accent': '#ffff00',
      '--accent-text': '#000000',
      '--scrollbar-bg': '#1a1a1a',
      '--scrollbar-thumb': '#404040',
      '--chat-bg': '#000000',
      '--chat-text': '#ffffff',
      '--message-hover': '#1a1a1a',
    },
  },

  hotdog: {
    name: 'Hot Dog Stand',
    icon: '🌭',
    vars: {
      '--desktop-bg': '#ff0000',
      '--win-bg': '#ffff00',
      '--win-bg-alt': '#ffff66',
      '--win-bg-dark': '#ccaa00',
      '--win-border-light': '#ffffff',
      '--win-border-dark': '#804000',
      '--win-border-mid': '#c08000',
      '--title-bg': '#ff0000',
      '--title-bg-end': '#cc0000',
      '--title-text': '#ffffff',
      '--text': '#000000',
      '--text-muted': '#804000',
      '--accent': '#ff0000',
      '--accent-text': '#ffff00',
      '--scrollbar-bg': '#ffff66',
      '--scrollbar-thumb': '#ffcc00',
      '--chat-bg': '#ffffff',
      '--chat-text': '#000000',
      '--message-hover': '#fff0c0',
    },
  },

  rose: {
    name: 'Rose',
    icon: '🌹',
    vars: {
      '--desktop-bg': '#800080',
      '--win-bg': '#ffd0d0',
      '--win-bg-alt': '#ffe8e8',
      '--win-bg-dark': '#e0b0b0',
      '--win-border-light': '#ffffff',
      '--win-border-dark': '#804040',
      '--win-border-mid': '#c08080',
      '--title-bg': '#800080',
      '--title-bg-end': '#a040a0',
      '--title-text': '#ffffff',
      '--text': '#400040',
      '--text-muted': '#a080a0',
      '--accent': '#800080',
      '--accent-text': '#ffffff',
      '--scrollbar-bg': '#ffe8e8',
      '--scrollbar-thumb': '#e0b0b0',
      '--chat-bg': '#fff8f8',
      '--chat-text': '#400040',
      '--message-hover': '#ffe8e8',
    },
  },

  plum: {
    name: 'Plum',
    icon: '🍇',
    vars: {
      '--desktop-bg': '#400040',
      '--win-bg': '#d0a0d0',
      '--win-bg-alt': '#e0c0e0',
      '--win-bg-dark': '#b080b0',
      '--win-border-light': '#f0e0f0',
      '--win-border-dark': '#604060',
      '--win-border-mid': '#a080a0',
      '--title-bg': '#400040',
      '--title-bg-end': '#702070',
      '--title-text': '#ffffff',
      '--text': '#200020',
      '--text-muted': '#906090',
      '--accent': '#400040',
      '--accent-text': '#ffffff',
      '--scrollbar-bg': '#e0c0e0',
      '--scrollbar-thumb': '#b080b0',
      '--chat-bg': '#f8f0f8',
      '--chat-text': '#200020',
      '--message-hover': '#e0c0e0',
    },
  },

  slate: {
    name: 'Slate',
    icon: '🪨',
    vars: {
      '--desktop-bg': '#404040',
      '--win-bg': '#a0a0a0',
      '--win-bg-alt': '#b8b8b8',
      '--win-bg-dark': '#808080',
      '--win-border-light': '#c0c0c0',
      '--win-border-dark': '#303030',
      '--win-border-mid': '#606060',
      '--title-bg': '#202020',
      '--title-bg-end': '#505050',
      '--title-text': '#ffffff',
      '--text': '#000000',
      '--text-muted': '#505050',
      '--accent': '#404040',
      '--accent-text': '#ffffff',
      '--scrollbar-bg': '#b8b8b8',
      '--scrollbar-thumb': '#a0a0a0',
      '--chat-bg': '#e8e8e8',
      '--chat-text': '#000000',
      '--message-hover': '#d0d0d0',
    },
  },

  plasma: {
    name: 'Plasma Power Saver',
    icon: '⚡',
    vars: {
      '--desktop-bg': '#000000',
      '--win-bg': '#000000',
      '--win-bg-alt': '#0a0a0a',
      '--win-bg-dark': '#000000',
      '--win-border-light': '#00ff00',
      '--win-border-dark': '#004400',
      '--win-border-mid': '#008800',
      '--title-bg': '#000000',
      '--title-bg-end': '#003300',
      '--title-text': '#00ff00',
      '--text': '#00ff00',
      '--text-muted': '#008800',
      '--accent': '#00ff00',
      '--accent-text': '#000000',
      '--scrollbar-bg': '#0a0a0a',
      '--scrollbar-thumb': '#004400',
      '--chat-bg': '#000000',
      '--chat-text': '#00ff00',
      '--message-hover': '#0a1a0a',
    },
  },

  brick: {
    name: 'Brick',
    icon: '🧱',
    vars: {
      '--desktop-bg': '#800000',
      '--win-bg': '#d0a080',
      '--win-bg-alt': '#e0b898',
      '--win-bg-dark': '#b08868',
      '--win-border-light': '#f0d0b0',
      '--win-border-dark': '#402010',
      '--win-border-mid': '#806040',
      '--title-bg': '#800000',
      '--title-bg-end': '#b02020',
      '--title-text': '#ffffff',
      '--text': '#201008',
      '--text-muted': '#806040',
      '--accent': '#800000',
      '--accent-text': '#ffd0a0',
      '--scrollbar-bg': '#e0b898',
      '--scrollbar-thumb': '#b08868',
      '--chat-bg': '#fff8f0',
      '--chat-text': '#201008',
      '--message-hover': '#f0e0d0',
    },
  },

  desert: {
    name: 'Desert',
    icon: '🏜️',
    vars: {
      '--desktop-bg': '#c08040',
      '--win-bg': '#f0e0c0',
      '--win-bg-alt': '#fff0d0',
      '--win-bg-dark': '#d0c0a0',
      '--win-border-light': '#ffffff',
      '--win-border-dark': '#604020',
      '--win-border-mid': '#a08060',
      '--title-bg': '#806040',
      '--title-bg-end': '#a08060',
      '--title-text': '#ffffff',
      '--text': '#402010',
      '--text-muted': '#a08060',
      '--accent': '#806040',
      '--accent-text': '#fffff0',
      '--scrollbar-bg': '#fff0d0',
      '--scrollbar-thumb': '#d0c0a0',
      '--chat-bg': '#fffaf0',
      '--chat-text': '#402010',
      '--message-hover': '#f0e0d0',
    },
  },
};

const STORAGE_KEY = 'pulsar95_theme';

export function applyTheme(themeKey) {
  const theme = THEMES[themeKey];
  if (!theme) return;

  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([k, v]) => {
    root.style.setProperty(k, v);
  });

  localStorage.setItem(STORAGE_KEY, themeKey);
}

export function getCurrentTheme() {
  return localStorage.getItem(STORAGE_KEY) || 'classic';
}

export function loadSavedTheme() {
  applyTheme(getCurrentTheme());
}