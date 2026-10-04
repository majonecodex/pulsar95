import Sound from '../sounds.js';

const BOOT_SEQUENCE = [
  { text: '', delay: 100 },
  { text: 'Pulsar95 Systems Inc. — BIOS v2.1', delay: 200, cls: 'boot-header' },
  { text: 'Copyright (C) 1996-2026, Pulsar95 Corp.', delay: 300, cls: 'boot-header' },
  { text: '', delay: 300 },
  { text: 'Main Processor    : Cosmic 486DX2 66MHz', delay: 150 },
  { text: '', delay: 150 },
  { text: 'Memory Test       : 0K', delay: 80, key: 'memory' },
  { text: '', delay: 200 },
  { text: 'Detecting IDE drives...', delay: 400 },
  { text: '  Primary Master  : PULSAR-95 HDD', delay: 250 },
  { text: '  Primary Slave   : None', delay: 200 },
  { text: '  Secondary Master: CD-ROM 4x', delay: 200 },
  { text: '', delay: 300 },
  { text: 'Keyboard.........OK', delay: 150 },
  { text: 'Mouse............OK', delay: 150 },
  { text: 'Network..........OK', delay: 150 },
  { text: '', delay: 300 },
  { text: 'Starting Pulsar95...', delay: 700, cls: 'boot-header' },
];

function playBootChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes = [
      { freq: 261.63, start: 0.00, dur: 0.60 },
      { freq: 329.63, start: 0.15, dur: 0.60 },
      { freq: 392.00, start: 0.30, dur: 0.60 },
      { freq: 523.25, start: 0.45, dur: 1.20 },
    ];
    notes.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.15, now + start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now + start); osc.stop(now + start + dur);
    });
    setTimeout(() => ctx.close(), 3000);
  } catch (e) {}
}

export async function runBootSequence() {
  const bootScreen = document.getElementById('boot-screen');
  const bootContent = document.getElementById('boot-content');
  const authScreen = document.getElementById('auth-screen');
  if (!bootScreen || !bootContent) return;

  if (sessionStorage.getItem('pulsar95_boot_done') === '1') {
    bootScreen.classList.add('hidden-boot');
    return;
  }

  let skipped = false;
  const skipHandler = () => {
    skipped = true;
    bootScreen.classList.add('fade-out');
    sessionStorage.setItem('pulsar95_boot_done', '1');
    setTimeout(() => bootScreen.classList.add('hidden-boot'), 600);
  };
  bootScreen.addEventListener('click', skipHandler, { once: true });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  for (const line of BOOT_SEQUENCE) {
    if (skipped) return;
    if (line.key === 'memory') {
      const memLine = document.createElement('div');
      memLine.className = 'boot-line';
      memLine.innerHTML = '<span class="label">Memory Test       : </span>' +
        '<span class="value" id="mem-count">0K</span>';
      bootContent.appendChild(memLine);
      for (let k = 0; k <= 640; k += 64) {
        if (skipped) return;
        const el = document.getElementById('mem-count');
        if (el) el.textContent = k + 'K';
        await sleep(30);
      }
      const el = document.getElementById('mem-count');
      if (el) el.innerHTML = '640K <span class="accent">OK</span>';
      await sleep(200);
    } else {
      const div = document.createElement('div');
      div.className = 'boot-line' + (line.cls ? ' ' + line.cls : '');
      div.textContent = line.text;
      bootContent.appendChild(div);
      await sleep(line.delay);
    }
  }

  if (skipped) return;
  const cursorDiv = document.createElement('div');
  cursorDiv.className = 'boot-line';
  cursorDiv.innerHTML = '<span class="boot-cursor"></span>';
  bootContent.appendChild(cursorDiv);
  await sleep(800);
  if (skipped) return;

  playBootChime();
  bootScreen.classList.add('fade-out');
  sessionStorage.setItem('pulsar95_boot_done', '1');
  if (authScreen) authScreen.classList.add('boot-appear');
  setTimeout(() => bootScreen.classList.add('hidden-boot'), 600);
}