/* ============================================================
   PULSAR95 SOUND ENGINE
   Synthesized Win95-style sounds via Web Audio API
   No external files — everything generated on the fly
   ============================================================ */

const Sound = (() => {
  let ctx = null;
  let muted = localStorage.getItem('pulsar95_muted') === '1';
  let userGestureDetected = false;

  // Detect the first user gesture (click, key, or touch).
  // Browsers block AudioContext until the user interacts — this
  // lets us skip silent sound calls and unlock audio once ready.
  ['click', 'keydown', 'touchstart', 'pointerdown'].forEach((evt) => {
    window.addEventListener(evt, function unlock() {
      userGestureDetected = true;
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      // Remove all listeners — we only need the first gesture
      ['click', 'keydown', 'touchstart', 'pointerdown'].forEach((e) => {
        window.removeEventListener(e, unlock);
      });
    });
  });

  function getCtx() {
    // Skip entirely if the user hasn't interacted yet.
    // This prevents the console warning spam on boot.
    if (!userGestureDetected) return null;

    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      try {
        ctx = new Ctx();
      } catch (e) {
        return null;
      }
    }

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    return ctx;
  }

  // Generic note player
  function playNote({ freq, start, dur, type = 'triangle', gain = 0.12 }) {
    const c = getCtx();
    if (!c || muted) return;

    try {
      const now = c.currentTime;
      const osc = c.createOscillator();
      const g = c.createGain();

      osc.type = type;
      osc.frequency.value = freq;

      g.gain.setValueAtTime(0, now + start);
      g.gain.linearRampToValueAtTime(gain, now + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + start + dur);

      osc.connect(g);
      g.connect(c.destination);
      osc.start(now + start);
      osc.stop(now + start + dur);
    } catch (e) {
      // Silently ignore any Web Audio errors
    }
  }

  // Sequence player
  function playSequence(notes) {
    if (muted) return;
    if (!userGestureDetected) return;
    notes.forEach((n) => playNote(n));
  }

  return {
    // New message from someone else — short "beep-boop"
    message() {
      playSequence([
        { freq: 880, start: 0,    dur: 0.08, type: 'square', gain: 0.06 },
        { freq: 1100, start: 0.08, dur: 0.12, type: 'square', gain: 0.05 },
      ]);
    },

    // You sent a message — soft whoosh
    send() {
      playSequence([
        { freq: 660, start: 0,    dur: 0.06, type: 'sine', gain: 0.05 },
        { freq: 880, start: 0.05, dur: 0.08, type: 'sine', gain: 0.04 },
      ]);
    },

    // UI click — very short tick
    click() {
      playSequence([
        { freq: 1200, start: 0, dur: 0.03, type: 'square', gain: 0.03 },
      ]);
    },

    // Error / dialog opening — "ding"
    ding() {
      playSequence([
        { freq: 523.25, start: 0,    dur: 0.15, type: 'triangle', gain: 0.1 },
        { freq: 784.00, start: 0.05, dur: 0.20, type: 'triangle', gain: 0.08 },
      ]);
    },

    // Success — rising chime
    success() {
      playSequence([
        { freq: 523.25, start: 0,    dur: 0.12, type: 'sine', gain: 0.1 },
        { freq: 659.25, start: 0.10, dur: 0.12, type: 'sine', gain: 0.09 },
        { freq: 783.99, start: 0.20, dur: 0.25, type: 'sine', gain: 0.09 },
      ]);
    },

    // Login / room join — pop
    notify() {
      playSequence([
        { freq: 700,  start: 0,    dur: 0.08, type: 'sine', gain: 0.08 },
        { freq: 1000, start: 0.07, dur: 0.15, type: 'sine', gain: 0.06 },
      ]);
    },

    // Shutdown — descending notes
    shutdown() {
      playSequence([
        { freq: 523.25, start: 0,    dur: 0.20, type: 'triangle', gain: 0.1 },
        { freq: 392.00, start: 0.18, dur: 0.20, type: 'triangle', gain: 0.1 },
        { freq: 261.63, start: 0.36, dur: 0.40, type: 'triangle', gain: 0.12 },
      ]);
    },

    // Mute toggle
    toggleMute() {
      muted = !muted;
      localStorage.setItem('pulsar95_muted', muted ? '1' : '0');
      if (!muted) Sound.click();
      return muted;
    },

    isMuted() {
      return muted;
    },

    setMuted(val) {
      muted = !!val;
      localStorage.setItem('pulsar95_muted', muted ? '1' : '0');
    },

    // Expose for debugging
    isUnlocked() {
      return userGestureDetected;
    },
  };
})();

export default Sound;