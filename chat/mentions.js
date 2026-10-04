import { state } from '../lib/state.js';
import { escapeHtml } from '../lib/dom.js';

const mentionState = {
  active: false, startIndex: -1, query: '', users: [], matches: [], selectedIndex: 0,
};

function getCurrentChannelMembers() {
  const userMap = new Map();
  userMap.set('everyone', {
    id: 'everyone', username: 'everyone', avatar_color: '#c00000', isEveryone: true,
  });
  userMap.set('pulsar', {
    id: '00000000-0000-0000-0000-000000000099',
    username: 'Pulsar', avatar_color: '#800080', isBot: true,
  });
  if (state.profile?.username) {
    userMap.set(state.profile.username.toLowerCase(), {
      id: state.user?.id || 'me',
      username: state.profile.username,
      avatar_color: state.profile.avatar_color || '#000080',
      isMe: true,
    });
  }
  document.querySelectorAll('.message').forEach((msgEl) => {
    const authorEl = msgEl.querySelector('.message-author');
    const avatarEl = msgEl.querySelector('.message-avatar');
    if (authorEl && avatarEl) {
      const name = authorEl.textContent.trim();
      const color = avatarEl.style.background || '#000080';
      const key = name.toLowerCase();
      if (!userMap.has(key)) userMap.set(key, { id: key, username: name, avatar_color: color });
    }
  });
  return [...userMap.values()];
}

function openMentionDropdown(query) {
  const dropdown = document.getElementById('mention-autocomplete');
  if (!dropdown) return;

  mentionState.users = getCurrentChannelMembers();
  mentionState.query = (query || '').toLowerCase();
  mentionState.selectedIndex = 0;

  const matches = mentionState.query
    ? mentionState.users.filter((u) => u.username.toLowerCase().includes(mentionState.query))
    : mentionState.users;
  if (matches.length === 0) return closeMentionDropdown();
  mentionState.matches = matches;

  dropdown.innerHTML = matches.map((u, i) =>
    '<div class="mention-item' + (u.isBot ? ' bot' : '') +
    (i === mentionState.selectedIndex ? ' active' : '') +
    '" data-username="' + escapeHtml(u.username) + '" data-index="' + i + '">' +
    '<div class="mention-avatar" style="background:' + escapeHtml(u.avatar_color) + '">' +
    escapeHtml(u.username.charAt(0).toUpperCase()) + '</div>' +
    '<span class="mention-name">@' + escapeHtml(u.username) + '</span>' +
    (u.isBot ? '<span class="mention-badge">bot</span>' :
      u.isEveryone ? '<span class="mention-badge">notify all</span>' :
        u.isMe ? '<span class="mention-badge">you</span>' : '') +
    '</div>').join('');

  const inputEl = document.getElementById('message-input');
  if (inputEl) {
    const rect = inputEl.getBoundingClientRect();
    const dropdownHeight = Math.min(260, matches.length * 36 + 8);
    dropdown.style.left = rect.left + 'px';
    dropdown.style.width = Math.max(rect.width, 240) + 'px';
    dropdown.style.top = (rect.top - dropdownHeight - 6) + 'px';
    dropdown.style.bottom = 'auto';
    dropdown.style.position = 'fixed';
  }

  dropdown.classList.add('open');
  mentionState.active = true;
  dropdown.querySelectorAll('.mention-item').forEach((item) => {
    item.onclick = (e) => { e.preventDefault(); insertMention(item.dataset.username); };
  });
  const activeEl = dropdown.querySelector('.mention-item.active');
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}

function closeMentionDropdown() {
  const dropdown = document.getElementById('mention-autocomplete');
  if (dropdown) dropdown.classList.remove('open');
  mentionState.active = false;
  mentionState.startIndex = -1;
  mentionState.query = '';
  mentionState.matches = [];
}

function insertMention(username) {
  const input = document.getElementById('message-input');
  if (!input) return;
  const text = input.value;
  const cursorPos = input.selectionStart;
  const before = text.slice(0, mentionState.startIndex);
  const after = text.slice(cursorPos);
  input.value = before + '@' + username + ' ' + after;
  const newPos = before.length + username.length + 2;
  input.setSelectionRange(newPos, newPos);
  input.focus();
  closeMentionDropdown();
}

function updateActiveMention() {
  const dropdown = document.getElementById('mention-autocomplete');
  if (!dropdown) return;
  dropdown.querySelectorAll('.mention-item').forEach((item, i) => {
    item.classList.toggle('active', i === mentionState.selectedIndex);
    if (i === mentionState.selectedIndex) item.scrollIntoView({ block: 'nearest' });
  });
}

export function initMentions() {
  const mentionInput = document.getElementById('message-input');
  if (!mentionInput) return;

  mentionInput.addEventListener('input', () => {
    const cursorPos = mentionInput.selectionStart;
    const text = mentionInput.value;
    const beforeCursor = text.slice(0, cursorPos);
    const lastAtIndex = beforeCursor.lastIndexOf('@');
    if (lastAtIndex === -1) return closeMentionDropdown();
    const charBefore = lastAtIndex > 0 ? beforeCursor[lastAtIndex - 1] : ' ';
    if (charBefore !== ' ' && charBefore !== '\n' && lastAtIndex !== 0) {
      return closeMentionDropdown();
    }
    const query = beforeCursor.slice(lastAtIndex + 1);
    if (query.includes(' ') || query.length > 30) return closeMentionDropdown();
    mentionState.startIndex = lastAtIndex;
    openMentionDropdown(query);
  });

  mentionInput.addEventListener('keydown', (e) => {
    if (!mentionState.active) return;
    const matches = mentionState.matches || [];
    if (matches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      mentionState.selectedIndex = (mentionState.selectedIndex + 1) % matches.length;
      updateActiveMention();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      mentionState.selectedIndex =
        (mentionState.selectedIndex - 1 + matches.length) % matches.length;
      updateActiveMention();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertMention(matches[mentionState.selectedIndex].username);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMentionDropdown();
    }
  });

  mentionInput.addEventListener('blur', () => {
    setTimeout(closeMentionDropdown, 150);
  });

  window.addEventListener('resize', () => {
    if (mentionState.active) closeMentionDropdown();
  });
}

export { openMentionDropdown, insertMention };