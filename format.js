const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const EVENTS = {
  333: '3x3', 222: '2x2', 444: '4x4', 555: '5x5', 666: '6x6', 777: '7x7',
  '333bf': "3x3 à l'aveugle", '333fm': 'FMC', '333oh': '3x3 à une main',
  clock: 'Horloge', minx: 'Mégaminx', pyram: 'Pyraminx', skewb: 'Skewb', sq1: 'Square-1',
  '444bf': "4x4 à l'aveugle", '555bf': "5x5 à l'aveugle", '333mbf': '3x3 résolution multiple à l’aveugle',
};

export function formatDates(start, end) {
  const [y1, m1, d1] = start.split('-').map(Number);
  const [y2, m2, d2] = end.split('-').map(Number);
  const full = (y, m, d) => `${d} ${MONTHS[m - 1]} ${y}`;
  if (start === end) return full(y1, m1, d1);
  if (y1 !== y2) return `${full(y1, m1, d1)} - ${full(y2, m2, d2)}`;
  if (m1 !== m2) return `${d1} ${MONTHS[m1 - 1]} - ${full(y2, m2, d2)}`;
  return `${d1}${d2 - d1 === 1 ? ' et ' : ' - '}${full(y2, m2, d2)}`;
}

export function format(c) {
  const place = [
    c.venue.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'),
    c.venue_details,
    c.venue_address?.trim().replace(/,\s*Canada$/i, ''),
  ].map((s) => s?.trim()).filter(Boolean).join(', ');
  const events = c.event_ids.map((e) => EVENTS[e] ?? e);
  return [
    c.name,
    `📍 ${place}`,
    `🗓️ ${formatDates(c.start_date, c.end_date)}`,
    `${events.length === 1 ? 'Épreuve' : 'Épreuves'}: ${events.join(', ')}`,
    `👥 Places: ${c.competitor_limit}`,
    `<https://www.worldcubeassociation.org/competitions/${c.id}>`,
    '',
    '@everyone',
  ].join('\n');
}

export function compId(input) {
  const m = input.trim().match(/^(?:https?:\/\/(?:www\.)?worldcubeassociation\.org\/competitions\/)?([A-Za-z0-9]+)(?:[/?#].*)?$/);
  return m ? m[1] : null;
}

export function inLastHour(c, now = new Date(), hours = 1) {
  if (!c.announced_at) return false;
  const end = Math.floor(now / 3600e3) * 3600e3;
  const t = Date.parse(c.announced_at);
  return t >= end - hours * 3600e3 && t < end;
}
