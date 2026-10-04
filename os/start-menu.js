import { state } from '../lib/state.js';
import { $ } from '../lib/dom.js';
import Sound from '../sounds.js';
import { showDisplayProperties } from './properties.js';
import { showShutdownScreen } from './shutdown.js';

export function handleStartMenuAction(action) {
  switch (action) {
    case 'programs':
      window.pulsarOS.openWindow({
        id: 'notepad',
        title: 'Untitled - Notepad',
        icon: '📝',
        width: 560,
        height: 400,
        content:
          '<textarea style="width:100%;height:100%;border:2px inset #808080;' +
          'font-family:\'Courier New\',monospace;font-size:13px;padding:6px;' +
          'resize:none;background:#fff;color:#000;outline:none;"></textarea>',
      });
      break;
    case 'documents':
      if (state.rooms?.length) {
        alert('Your rooms:\n\n' + state.rooms.map((r) => '• ' + r.name).join('\n'));
      } else alert('No rooms yet.');
      break;
    case 'settings':
      showDisplayProperties();
      break;
    case 'find':
      if (state.currentChannel) {
        const q = prompt('Find in #' + state.currentChannel.name + ':');
        if (q) {
          document.querySelectorAll('.message').forEach((m) => {
            const text = m.querySelector('.message-text')?.textContent || '';
            m.style.background = text.toLowerCase().includes(q.toLowerCase()) ? '#ffff99' : '';
          });
        }
      } else alert('Open a channel first.');
      break;
    case 'help':
      alert(
        'Pulsar95 Help\n\n' +
        '• Right-click a message you sent to delete it\n' +
        '• Drag the blue title bar to move the window\n' +
        '• Click 📎 to attach an image\n' +
        '• Click the clock to show seconds\n' +
        '• Mention @pulsar to talk to the AI bot'
      );
      break;
    case 'run': {
      const cmd = prompt(
        'Type a command:\n\n' +
        '  about    — About Pulsar95\n' +
        '  whoami   — Your username\n' +
        '  logout   — Sign out\n' +
        '  clear    — Reload the app\n'
      );
      if (cmd) {
        const c = cmd.trim().toLowerCase();
        if (c === 'about') alert('Pulsar95 — Cosmic chat for the retro web.');
        else if (c === 'whoami') alert(state.profile?.username || 'Not logged in');
        else if (c === 'logout') $('logout-btn').click();
        else if (c === 'clear') location.reload();
        else alert('Unknown command: ' + cmd);
      }
      break;
    }
    case 'shutdown':
      showShutdownScreen();
      break;
  }
}