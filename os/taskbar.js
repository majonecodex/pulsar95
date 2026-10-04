import Sound from '../sounds.js';
import { escapeHtml, $ } from '../lib/dom.js';
import { formatLocal, formatLocalDateOnly } from '../lib/time.js';
import { handleStartMenuAction } from './start-menu.js';

export function initTaskbar() {
    const startBtn = document.getElementById('win95-start-btn');
    const startMenu = document.getElementById('win95-start-menu');
    const clockEl = document.getElementById('win95-clock');
    if (!startBtn || !startMenu) return;

    startBtn.onclick = (e) => {
        e.stopPropagation();
        Sound.click();
        startMenu.classList.toggle('open');
        startBtn.classList.toggle('active', startMenu.classList.contains('open'));
    };

    document.addEventListener('click', (e) => {
        if (!startMenu.contains(e.target) && e.target !== startBtn) {
            startMenu.classList.remove('open');
            startBtn.classList.remove('active');
        }
    });

    startMenu.querySelectorAll('.start-menu-item').forEach((item) => {
        item.onclick = () => {
            Sound.click();
            const action = item.dataset.action;
            startMenu.classList.remove('open');
            startBtn.classList.remove('active');
            handleStartMenuAction(action);
        };
    });

    let showSeconds = false;
    let showDate = false;
    let clicks = 0;

    function updateClock() {
        const now = new Date();
        const timeStr = formatLocal(now, { seconds: showSeconds });
        clockEl.textContent = showDate
            ? formatLocalDateOnly(now) + ' ' + timeStr
            : timeStr;
    }
    updateClock();
    setInterval(updateClock, 1000);

    clockEl.onclick = () => {
        clicks++;
        if (clicks === 1) showSeconds = true;
        else if (clicks === 2) showDate = true;
        else { showSeconds = false; showDate = false; clicks = 0; }
        updateClock();
    };

    const volumeIcon = document.querySelector('#win95-tray .tray-icon[title="Volume"]');
    if (volumeIcon) {
        volumeIcon.textContent = Sound.isMuted() ? '🔇' : '🔊';
        volumeIcon.onclick = () => {
            const nowMuted = Sound.toggleMute();
            volumeIcon.textContent = nowMuted ? '🔇' : '🔊';
            volumeIcon.title = nowMuted ? 'Muted' : 'Volume';
        };
    }

    window.updateTaskButtons();
}

export function updateTaskButtons() {
    const taskButtons = document.getElementById('win95-task-buttons');
    if (!taskButtons) return;
    taskButtons.innerHTML = '';

    if (window.pulsarOS && window.pulsarOS.getOpenWindows) {
        window.pulsarOS.getOpenWindows().forEach((w) => {
            const btn = document.createElement('button');
            btn.className = 'win95-task-btn' +
                (w.focused && !w.minimized ? ' active' : '') +
                (w.minimized ? ' minimized' : '');
            btn.dataset.windowId = w.id;
            btn.innerHTML =
                '<span class="task-icon">' + escapeHtml(w.icon) + '</span>' +
                '<span>' + escapeHtml(w.title) + '</span>';
            btn.onclick = (e) => {
                e.stopPropagation();
                Sound.click();
                const entry = window.pulsarOS.getOpenWindows().find((x) => x.id === w.id);
                if (entry?.minimized) window.pulsarOS.restoreWindow(w.id);
                else if (entry?.focused) window.pulsarOS.minimizeWindow(w.id);
                else window.pulsarOS.focusWindow(w.id);
            };
            taskButtons.appendChild(btn);
        });
    }

    if (!$('app-screen').classList.contains('hidden') &&
        !document.querySelector('.os-window[data-window-id="chat"]')) {
        const btn = document.createElement('button');
        btn.className = 'win95-task-btn active';
        btn.id = 'task-app';
        btn.innerHTML = '<span class="task-icon">💬</span><span>Pulsar95</span>';
        btn.onclick = (e) => {
            e.stopPropagation();
            Sound.click();
            const win = document.querySelector('#app-screen .window');
            if (win) win.style.zIndex = 1000;
        };
        taskButtons.appendChild(btn);
    }

    if (document.getElementById('lightbox-overlay')) {
        const btn = document.createElement('button');
        btn.className = 'win95-task-btn active';
        btn.id = 'task-lightbox';
        btn.innerHTML = '<span class="task-icon">🖼</span><span>Image Viewer</span>';
        btn.onclick = (e) => {
            e.stopPropagation();
            Sound.click();
            const lb = document.getElementById('lightbox-overlay');
            if (lb) lb.style.zIndex = 100001;
        };
        taskButtons.appendChild(btn);
    }
}

window.updateTaskButtons = updateTaskButtons;