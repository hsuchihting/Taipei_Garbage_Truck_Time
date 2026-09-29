export const PAGE_SIZE = 10;
export const PAGINATION_MIN_PAGES = 10;
export const NEARBY_RADIUS_METERS = 1000;
export const NEARBY_WINDOW_MINUTES = 60;
export const FAVORITES_KEY = 'taipei-garbage-favorites-v1';

export function paginate(items, requestedPage = 1) {
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const visible = totalPages >= PAGINATION_MIN_PAGES;
  const page = visible ? Math.max(1, Math.min(totalPages, Math.trunc(requestedPage) || 1)) : 1;
  const start = visible ? (page - 1) * PAGE_SIZE : 0;
  const end = visible ? Math.min(start + PAGE_SIZE, items.length) : items.length;
  return { items: items.slice(start, end), page, totalPages, visible, start, end };
}

export function validCoordinates(point) {
  return point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180
    && !(point.latitude === 0 && point.longitude === 0);
}

export function distanceMeters(from, to) {
  if (!validCoordinates(from) || !validCoordinates(to)) return null;
  const rad = degrees => degrees * Math.PI / 180;
  const deltaLat = rad(to.latitude - from.latitude);
  const deltaLon = rad(to.longitude - from.longitude);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(rad(from.latitude)) * Math.cos(rad(to.latitude)) * Math.sin(deltaLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '距離未知';
  return meters < 1000 ? `約 ${Math.round(meters)} m` : `約 ${(meters / 1000).toFixed(1)} km`;
}

export function sortByDistance(stops, position) {
  return stops.map(stop => ({ ...stop, distance: distanceMeters(position, stop) }))
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)
      || a.arrivalMinutes - b.arrivalMinutes || String(a.id).localeCompare(String(b.id)));
}

export function taipeiMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  return Number(parts.find(p => p.type === 'hour').value) * 60 + Number(parts.find(p => p.type === 'minute').value);
}

// The source describes scheduled times, not vehicle telemetry or service dates.
export function upcomingStops(stops, position, now = new Date()) {
  const current = taipeiMinutes(now);
  return sortByDistance(stops, position).filter(stop => stop.distance !== null && stop.distance <= NEARBY_RADIUS_METERS && stop.arrivalMinutes !== null)
    .map(stop => ({ ...stop, minutesUntil: (stop.arrivalMinutes - current + 1440) % 1440, nextDay: stop.arrivalMinutes < current }))
    .filter(stop => stop.minutesUntil <= NEARBY_WINDOW_MINUTES);
}

export function arrivalEstimate(stop, now = new Date(), nextDay = false) {
  if (stop.arrivalMinutes === null) return '';
  const current = taipeiMinutes(now);
  const remaining = stop.arrivalMinutes - current + (nextDay ? 1440 : 0);
  if (remaining === 0) return '依時刻表，現在預定抵達';
  if (remaining > 0 && remaining <= NEARBY_WINDOW_MINUTES) return `${nextDay ? '明日 · ' : ''}依時刻表，約 ${remaining} 分鐘後抵達`;
  return '';
}

export function requestLocation(geolocation) {
  return new Promise((resolve, reject) => {
    if (!geolocation) { reject(new Error('此瀏覽器不支援定位，請使用行政區與里別查詢。')); return; }
    geolocation.getCurrentPosition(({ coords }) => {
      const point = { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy };
      if (!validCoordinates(point)) { reject(new Error('無法取得有效位置，請重新定位或使用行政區查詢。')); return; }
      resolve(point);
    }, error => {
      const messages = {
        1: '尚未允許定位。可在瀏覽器網站設定開啟位置權限，或使用行政區查詢。',
        2: '目前無法取得位置，請確認裝置定位已開啟，或使用行政區查詢。',
        3: '定位逾時，請再試一次，或使用行政區查詢。',
      };
      reject(new Error(messages[error.code] || '定位失敗，請稍後再試，或使用行政區查詢。'));
    }, { enableHighAccuracy: true, maximumAge: 60000, timeout: 12000 });
  });
}

export function parseFavorites(raw) {
  const values = JSON.parse(raw || '[]');
  if (!Array.isArray(values)) throw new Error('Invalid saved places');
  return values.filter(value => value && typeof value.id === 'string' && typeof value.name === 'string'
    && value.name.trim() && value.name.length <= 30 && typeof value.district === 'string' && value.district
    && typeof value.village === 'string').map(({ id, name, district, village }) => ({ id, name, district, village }));
}

export function loadFavorites(storage) {
  return parseFavorites(storage.getItem(FAVORITES_KEY));
}

export function saveFavorite(storage, favorite) {
  const name = favorite.name.trim();
  if (!name || name.length > 30 || !favorite.district) throw new Error('請選擇行政區並輸入 1～30 字的收藏名稱。');
  const favorites = loadFavorites(storage);
  const existing = favorites.find(item => item.name === name);
  const item = { id: existing?.id || crypto.randomUUID(), name, district: favorite.district, village: favorite.village || '' };
  const next = existing ? favorites.map(old => old.id === existing.id ? item : old) : [...favorites, item];
  storage.setItem(FAVORITES_KEY, JSON.stringify(next));
  return next;
}

export function removeFavorite(storage, id) {
  const next = loadFavorites(storage).filter(item => item.id !== id);
  storage.setItem(FAVORITES_KEY, JSON.stringify(next));
  return next;
}
