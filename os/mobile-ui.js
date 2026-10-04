import Sound from '../sounds.js';

export function setupMobileUI() {
  const isMobile = () => window.matchMedia('(max-width: 900px)').matches;
  const roomsBtn = document.getElementById('mobile-rooms-btn');
  const membersBtn = document.getElementById('mobile-members-btn');
  const scrim = document.getElementById('mobile-scrim');
  const roomRail = document.getElementById('room-rail');
  const channelPane = document.getElementById('channel-pane');
  const channelName = document.getElementById('mobile-channel-name');
  if (!roomsBtn || !roomRail || !channelPane) return;

  function closeAllDrawers() {
    roomRail.classList.remove('open');
    channelPane.classList.remove('open');
    scrim.classList.remove('open');
  }
  function openRoomsDrawer() {
    closeAllDrawers(); roomRail.classList.add('open'); scrim.classList.add('open');
  }
  function openChannelsDrawer() {
    closeAllDrawers(); channelPane.classList.add('open'); scrim.classList.add('open');
  }

  roomsBtn.onclick = (e) => {
    e.stopPropagation(); Sound.click();
    if (roomRail.classList.contains('open')) closeAllDrawers();
    else openRoomsDrawer();
  };
  membersBtn.onclick = (e) => {
    e.stopPropagation(); Sound.click();
    if (channelPane.classList.contains('open')) closeAllDrawers();
    else openChannelsDrawer();
  };
  scrim.onclick = () => closeAllDrawers();

  document.getElementById('rooms-container')?.addEventListener('click', (e) => {
    if (e.target.closest('.room-icon')) closeAllDrawers();
  });
  document.getElementById('channels-container')?.addEventListener('click', (e) => {
    if (e.target.closest('.channel-item')) closeAllDrawers();
  });
  document.getElementById('add-room-btn')?.addEventListener('click', () => {
    setTimeout(closeAllDrawers, 100);
  });
  document.getElementById('add-channel-btn')?.addEventListener('click', () => {
    setTimeout(closeAllDrawers, 100);
  });

  const observer = new MutationObserver(() => {
    const desktopChannelName = document.getElementById('channel-name')?.textContent || 'general';
    if (channelName) channelName.textContent = desktopChannelName;
  });
  const desktopChannel = document.getElementById('channel-name');
  if (desktopChannel) {
    observer.observe(desktopChannel, { childList: true, characterData: true, subtree: true });
  }

  window.addEventListener('resize', () => { if (!isMobile()) closeAllDrawers(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllDrawers(); });
}