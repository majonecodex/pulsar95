import { escapeHtml } from '../lib/dom.js';

export function openLightbox(src, title) {
  if (document.getElementById('lightbox-overlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.id = 'lightbox-overlay';
  overlay.innerHTML =
    '<div class="lightbox-inner">' +
    '<div class="lightbox-titlebar">' +
    '<span>🖼 ' + escapeHtml(title || 'Image Preview') + '</span>' +
    '<button class="lightbox-close" id="lightbox-close">✕</button>' +
    '</div>' +
    '<div class="lightbox-img-wrap">' +
    '<img id="lightbox-img" src="' + escapeHtml(src) + '" alt="preview">' +
    '</div>' +
    '<div class="lightbox-statusbar">' +
    '<span id="lightbox-size">Loading…</span>' +
    '<span>Click image to zoom · Click outside to close · Esc to close</span>' +
    '</div></div>';
  document.body.appendChild(overlay);
  const img = overlay.querySelector('#lightbox-img');
  const sizeEl = overlay.querySelector('#lightbox-size');
  img.onload = () => { sizeEl.textContent = img.naturalWidth + ' × ' + img.naturalHeight + ' px'; };
  img.onclick = (e) => { e.stopPropagation(); img.classList.toggle('zoomed'); };
  overlay.onclick = (e) => { if (e.target === overlay) closeLightbox(); };
  overlay.querySelector('#lightbox-close').onclick = closeLightbox;
  const escHandler = (e) => { if (e.key === 'Escape') closeLightbox(); };
  document.addEventListener('keydown', escHandler);
  overlay._escHandler = escHandler;
  if (window.updateTaskButtons) window.updateTaskButtons();
}

export function closeLightbox() {
  const overlay = document.getElementById('lightbox-overlay');
  if (!overlay) return;
  if (overlay._escHandler) document.removeEventListener('keydown', overlay._escHandler);
  overlay.remove();
  if (window.updateTaskButtons) window.updateTaskButtons();
}

export function initLightbox() {
  document.addEventListener('click', (e) => {
    const wrap = e.target.closest('.message-image');
    if (!wrap) return;
    const src = wrap.dataset.full || wrap.querySelector('img')?.src;
    if (!src) return;
    openLightbox(src, 'Pulsar95 Image Preview');
  });
}