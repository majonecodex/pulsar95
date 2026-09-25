/* ============================================================
   PULSAR95 TERMINAL — with fastfetch
   Exports: openTerminal, registerTerminalIcon
   ============================================================ */

const terminalState = {
  history: [],
  historyIndex: -1,
  cwd: 'C:\\PULSAR95',
  sessionStart: Date.now(),
};

/**
 * Register the terminal desktop icon.
 * Call this from app.js after the desktop is initialized.
 * @param {Array} desktopIcons - The DESKTOP_ICONS array from app.js
 * @param {object} deps - Dependencies: { state, escapeHtml, getCurrentTheme, THEMES }
 */
export function registerTerminalIcon(desktopIcons, deps) {
  // Don't add twice
  if (desktopIcons.find((i) => i.id === 'terminal')) return;

  desktopIcons.push({
    id: 'terminal',
    label: 'Terminal',
    icon: '⌨️',
    action: () => openTerminal(deps),
    defaultPos: { x: 16, y: 520 },
  });
}

/**
 * Open the Pulsar95 Terminal window.
 * @param {object} deps - Dependencies passed from app.js
 */
export function openTerminal(deps) {
  const { state, escapeHtml } = deps;
  const pulsarOS = window.pulsarOS;   // ← always live

  if (!pulsarOS) {
    console.error('[Terminal] pulsarOS is not available');
    return;
  }

  // Already open? Focus it.
  if (pulsarOS.getOpenWindows().find((w) => w.id === 'terminal')) {
    pulsarOS.focusWindow('terminal');
    return;
  }

  const content = document.createElement('div');
  content.style.cssText =
    'width:100%;height:100%;background:#000;color:#c0c0c0;' +
    'font-family:\'Courier New\',monospace;font-size:12px;' +
    'padding:8px;overflow-y:auto;line-height:1.4;' +
    'display:flex;flex-direction:column;';

  content.innerHTML =
    '<div id="terminal-output" style="flex:1;white-space:pre-wrap;overflow-y:auto;"></div>' +
    '<div id="terminal-prompt-line" style="display:flex;align-items:center;gap:4px;">' +
    '<span id="terminal-prompt" style="color:#00ff00;white-space:nowrap;">C:\\PULSAR95&gt;</span>' +
    '<input id="terminal-input" type="text" autocomplete="off" spellcheck="false" ' +
    'style="flex:1;background:transparent;border:none;outline:none;color:#c0c0c0;' +
    'font-family:inherit;font-size:inherit;caret-color:#00ff00;padding:0;min-width:0;">' +
    '</div>';

  const win = pulsarOS.openWindow({
    id: 'terminal',
    title: 'Pulsar Terminal',
    icon: '⌨️',
    width: 720,
    height: 480,
    content,
    onClose: () => {
      terminalState.history = [];
    },
  });

  // Wire up the input
  setTimeout(() => {
    const input = document.getElementById('terminal-input');
    const output = document.getElementById('terminal-output');
    if (!input || !output) return;

    input.focus();

    // Welcome banner
    output.innerHTML +=
      '<div style="color:#00ff00;">Pulsar95 Terminal [Version 1.0.0]</div>' +
      '<div style="color:#808080;">(c) 2026 Pulsar95 Corp. All rights reserved.</div>' +
      '<div style="color:#808080;">Type <span style="color:#ffff00;">fastfetch</span> for system info, or <span style="color:#ffff00;">help</span> for commands.</div>' +
      '<div>&nbsp;</div>';

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = input.value.trim();
        input.value = '';

        // Echo the command
        output.innerHTML +=
          '<div><span style="color:#00ff00;">C:\\PULSAR95&gt;</span> ' +
          escapeHtml(cmd) + '</div>';

        if (cmd) {
          terminalState.history.push(cmd);
          terminalState.historyIndex = terminalState.history.length;
          runTerminalCommand(cmd, output, deps);
        }

        output.scrollTop = output.scrollHeight;

      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (terminalState.historyIndex > 0) {
          terminalState.historyIndex--;
          input.value = terminalState.history[terminalState.historyIndex] || '';
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (terminalState.historyIndex < terminalState.history.length - 1) {
          terminalState.historyIndex++;
          input.value = terminalState.history[terminalState.historyIndex] || '';
        } else {
          terminalState.historyIndex = terminalState.history.length;
          input.value = '';
        }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const partial = input.value.trim().toLowerCase();
        const commands = [
          'fastfetch', 'neofetch', 'help', 'clear', 'whoami',
          'date', 'time', 'ver', 'rooms', 'channels', 'theme', 'exit'
        ];
        const match = commands.find((c) => c.startsWith(partial));
        if (match) input.value = match;
      }
    });

    // Click anywhere in terminal to focus input
    content.addEventListener('click', () => input.focus());
    win?.addEventListener('click', () => input.focus());
  }, 100);
}

/**
 * Run a terminal command.
 */
function runTerminalCommand(cmd, output, deps) {
  const { state, escapeHtml, getCurrentTheme } = deps;
  const pulsarOS = window.pulsarOS;

  // ✅ THE FIX — split the command into parts
  const parts = cmd.trim().split(/\s+/);
  const command = (parts[0] || '').toLowerCase();

  switch (command) {
    case 'fastfetch':
    case 'neofetch':
      output.innerHTML += renderFastFetch(deps);
      break;

    case 'help':
      output.innerHTML +=
        '<div style="color:#00ff00;">Available commands:</div>' +
        '<div>  fastfetch    - Show system information</div>' +
        '<div>  help         - Show this help</div>' +
        '<div>  clear        - Clear the screen</div>' +
        '<div>  whoami       - Show current user</div>' +
        '<div>  date         - Show current date</div>' +
        '<div>  time         - Show current time</div>' +
        '<div>  ver          - Show OS version</div>' +
        '<div>  rooms        - List chat rooms</div>' +
        '<div>  channels     - List channels in current room</div>' +
        '<div>  theme        - Show current theme</div>' +
        '<div>  exit         - Close terminal</div>' +
        '<div>&nbsp;</div>';
      break;

    case 'clear':
    case 'cls':
      output.innerHTML = '';
      break;

    case 'whoami':
      output.innerHTML +=
        '<div>' + escapeHtml(state.profile?.username || 'guest') + '</div>';
      break;

    case 'date':
      output.innerHTML +=
        '<div>' + new Date().toLocaleDateString([], {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        }) + '</div>';
      break;

    case 'time':
      output.innerHTML +=
        '<div>' + new Date().toLocaleTimeString() + '</div>';
      break;

    case 'ver':
      output.innerHTML +=
        '<div>Pulsar95 OS [Version 1.0.0]</div>' +
        '<div>Build 950.1995</div>';
      break;

    case 'rooms':
      if (state.rooms?.length) {
        output.innerHTML += '<div style="color:#00ff00;">Chat Rooms:</div>';
        state.rooms.forEach((r) => {
          const isCurrent = state.currentRoom?.id === r.id;
          output.innerHTML +=
            '<div>' + (isCurrent ? ' &gt; ' : '   ') +
            escapeHtml(r.name) + '</div>';
        });
      } else {
        output.innerHTML += '<div style="color:#808080;">No rooms available.</div>';
      }
      break;

    case 'channels':
      if (state.channels?.length) {
        output.innerHTML += '<div style="color:#00ff00;">Channels in ' +
          escapeHtml(state.currentRoom?.name || 'room') + ':</div>';
        state.channels.forEach((c) => {
          const isCurrent = state.currentChannel?.id === c.id;
          output.innerHTML +=
            '<div>' + (isCurrent ? ' &gt; ' : '   ') +
            '#' + escapeHtml(c.name) + '</div>';
        });
      } else {
        output.innerHTML += '<div style="color:#808080;">No channels available.</div>';
      }
      break;

    case 'theme':
      output.innerHTML +=
        '<div>Current theme: <span style="color:#ffff00;">' +
        escapeHtml(getCurrentTheme()) + '</span></div>';
      break;

    case 'exit':
    case 'quit':
      if (pulsarOS) pulsarOS.closeWindow('terminal');
      break;

    default:
      output.innerHTML +=
        '<div style="color:#ff5555;">\'' + escapeHtml(command) +
        '\' is not recognized as an internal or external command.</div>' +
        '<div style="color:#808080;">Type <span style="color:#ffff00;">help</span> for a list of commands.</div>';
  }
}

/**
 * Render the fastfetch output.
 */
function renderFastFetch(deps) {
  const { state, escapeHtml, getCurrentTheme, THEMES } = deps;

  // Uptime
  const uptimeMs = Date.now() - (terminalState.sessionStart || Date.now());
  const hours = Math.floor(uptimeMs / 3600000);
  const mins = Math.floor((uptimeMs % 3600000) / 60000);
  const uptimeStr = hours > 0
    ? hours + ' hour' + (hours === 1 ? '' : 's') + ', ' + mins + ' min' + (mins === 1 ? '' : 's')
    : mins + ' min' + (mins === 1 ? '' : 's');

  // Memory (fake)
  const usedMem = 8192;
  const totalMem = 32768;
  const memPct = Math.round((usedMem / totalMem) * 100);

  // Disk (fake)
  const usedDisk = 420;
  const totalDisk = 540;
  const diskPct = Math.round((usedDisk / totalDisk) * 100);

  // Resolution
  const w = window.innerWidth;
  const h = window.innerHeight;

  // Theme
  const themeKey = getCurrentTheme();
  const themeName = (THEMES && THEMES[themeKey]?.name) || themeKey;

  // User + host
  const user = state.profile?.username || 'guest';
  const host = 'PULSAR95-PC';

  // Message count
  const msgCount = document.querySelectorAll('.message').length;

  // ASCII art
  const logo = [
    '       ▄▄▄▄▄▄▄▄▄▄▄       ',
    '     ▄█████████████▄     ',
    '    ██████████████████    ',
    '   ████████████████████   ',
    '    ██████████████████    ',
    '     ▀███████████████▀     ',
    '       ▀▀▀▀▀▀▀▀▀▀▀       ',
  ];

  const info = [
    { text: user + '@' + host, color: '#00ff00' },
    { text: '─────────────────────', color: '#808080' },
    { label: 'OS', value: 'Pulsar95 OS 1.0' },
    { label: 'Kernel', value: '486DX2-66' },
    { label: 'Uptime', value: uptimeStr },
    { label: 'Shell', value: 'pulsar-sh 1.0' },
    { label: 'Resolution', value: w + 'x' + h },
    { label: 'Terminal', value: 'Pulsar Terminal' },
    { label: 'CPU', value: 'Cosmic 486DX2 (1) @ 66MHz' },
    { label: 'GPU', value: 'S3 Trio64V+ (2MB)' },
    { label: 'Memory', value: usedMem.toLocaleString() + 'K / ' + totalMem.toLocaleString() + 'K (' + memPct + '%)' },
    { label: 'Disk (C:)', value: usedDisk + ' MB / ' + totalDisk + ' MB (' + diskPct + '%)' },
    { label: 'Network', value: 'PulsarNet (connected)' },
    { label: 'Theme', value: themeName },
    { label: 'Rooms', value: String(state.rooms?.length || 0) },
    { label: 'Messages', value: String(msgCount) },
    { label: 'Session', value: 'Active' },
  ];

  const maxLines = Math.max(logo.length, info.length);
  let html = '<div style="display:flex;gap:16px;margin:8px 0;">';

  // Left — logo
  html += '<div style="color:#00aaff;white-space:pre;line-height:1.2;">';
  for (let i = 0; i < maxLines; i++) {
    html += (logo[i] || '') + '\n';
  }
  html += '</div>';

  // Right — info
  html += '<div style="white-space:pre;line-height:1.4;">';
  info.forEach((line) => {
    if (line.text !== undefined) {
      html += '<span style="color:' + line.color + ';">' + escapeHtml(line.text) + '</span>\n';
    } else {
      const paddedLabel = (line.label + ':').padEnd(11, ' ');
      html += '<span style="color:#ffff00;">' + escapeHtml(paddedLabel) + '</span>' +
        '<span style="color:#c0c0c0;">' + escapeHtml(String(line.value)) + '</span>\n';
    }
  });
  html += '</div></div>';

  // Color palette
  html += '<div style="display:flex;gap:0;margin-top:8px;">';
  const colors = [
    '#000000', '#800000', '#008000', '#808000',
    '#000080', '#800080', '#008080', '#c0c0c0',
    '#808080', '#ff0000', '#00ff00', '#ffff00',
    '#0000ff', '#ff00ff', '#00ffff', '#ffffff'
  ];
  colors.forEach((c) => {
    html += '<div style="width:20px;height:12px;background:' + c + ';"></div>';
  });
  html += '</div>';

  html += '<div>&nbsp;</div>';
  return html;
}