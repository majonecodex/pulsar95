const GMT8_OFFSET_MINUTES = 8 * 60; // +08:00

export function toGMT8(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getTime() + GMT8_OFFSET_MINUTES * 60 * 1000);
}

export function formatGMT8(dateInput, opts = {}) {
  const d = toGMT8(dateInput);
  if (!d) return '--:--';

  let hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  const seconds = d.getUTCSeconds();
  const ampm = hours >= 12 ? 'PM' : 'AM';

  hours = hours % 12;
  if (hours === 0) hours = 12;

  const pad = (n) => String(n).padStart(2, '0');
  if (opts.seconds) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)} ${ampm}`;
  return `${pad(hours)}:${pad(minutes)} ${ampm}`;
}

export function formatGMT8Full(dateInput) {
  const d = toGMT8(dateInput);
  if (!d) return '—';

  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  const day = d.getUTCDate();
  const month = months[d.getUTCMonth()];
  const year = d.getUTCFullYear();

  let hours = d.getUTCHours();
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const hh = String(hours).padStart(2, '0');

  return `${day} ${month} ${year}, ${hh}:${minutes} ${ampm}`;
}

export function formatGMT8DateOnly(dateInput) {
  const d = toGMT8(dateInput);
  if (!d) return '—';
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

/**
 * Format a UTC timestamp in the user's LOCAL timezone.
 * Automatically handles DST, half-hour offsets (India), etc.
 */
export function formatLocal(dateInput, opts = {}) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '--:--';

  const options = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };
  if (opts.seconds) options.second = '2-digit';

  return d.toLocaleTimeString([], options);
}

export function formatLocalFull(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString([], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatLocalDateOnly(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}