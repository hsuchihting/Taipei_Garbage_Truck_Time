export const API_URL = 'https://data.taipei/api/v1/dataset/a6e90031-7ec4-4089-afb5-361a4efe7202';

export function timeToMinutes(value) {
  const raw = String(value ?? '').trim();
  const match = /^(\d{2}):?(\d{2})$/.exec(raw);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

export function formatTime(value) {
  const minutes = timeToMinutes(value);
  if (minutes === null) return '未提供';
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function coordinate(value, max) {
  if (value == null || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= max ? number : null;
}

export function normalizeData(rows) {
  const text = value => String(value ?? '').trim();
  return rows.map(row => ({
    id: row._id,
    district: text(row['行政區']), village: text(row['里別']), team: text(row['分隊']),
    internalNo: text(row['局編']), vehicleNo: text(row['車號']),
    route: text(row['路線']), trip: text(row['車次']), address: text(row['地點']),
    arrivalRaw: text(row['抵達時間']), leaveRaw: text(row['離開時間']),
    arrivalTime: formatTime(row['抵達時間']), leaveTime: formatTime(row['離開時間']),
    arrivalMinutes: timeToMinutes(row['抵達時間']), leaveMinutes: timeToMinutes(row['離開時間']),
    latitude: coordinate(row['緯度'], 90), longitude: coordinate(row['經度'], 180),
  }));
}

const unique = values => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
export const getDistricts = stops => unique(stops.map(stop => stop.district));
export const getVillages = (stops, district) => unique(stops.filter(stop => stop.district === district).map(stop => stop.village));

export function filterGarbageStops(stops, { startTime, endTime, district = '', village = '' }) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null || start > end) throw new Error('請確認開始與結束時間，結束時間不可早於開始時間。');
  return stops.filter(stop => stop.arrivalMinutes !== null && stop.arrivalMinutes >= start && stop.arrivalMinutes <= end)
    .filter(stop => !district || stop.district === district)
    .filter(stop => !district || !village || stop.village === village)
    .sort((a, b) => a.arrivalMinutes - b.arrivalMinutes || a.address.localeCompare(b.address, 'zh-Hant'));
}

export function googleMapsUrl(stop) {
  if (stop.latitude === null || stop.longitude === null || (stop.latitude === 0 && stop.longitude === 0)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${stop.latitude},${stop.longitude}`;
}

export async function fetchJson(url, fetcher = fetch) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(20000), credentials: 'omit' });
  if (!response.ok) throw new Error(`Data request failed: ${response.status}`);
  return response.json();
}

// Advance by the actual returned page length: the server may cap the requested limit.
// Reject missing/overlapping pages so a partial dataset never appears to be complete.
export async function fetchGarbageData({ fetcher = fetch, onProgress = () => {} } = {}) {
  const rows = [];
  const ids = new Set();
  let expectedCount = null;
  do {
    const url = new URL(API_URL);
    url.search = new URLSearchParams({ scope: 'resourceAquire', limit: '1000', offset: String(rows.length) });
    const { result } = await fetchJson(url, fetcher);
    if (!result || !Array.isArray(result.results) || !Number.isInteger(Number(result.count)) || Number(result.count) < 0 || Number(result.offset) !== rows.length) {
      throw new Error('Invalid API page');
    }
    const count = Number(result.count);
    if (expectedCount !== null && expectedCount !== count) throw new Error('Dataset changed during pagination');
    expectedCount = count;
    if (result.results.length === 0 && rows.length < count) throw new Error('Incomplete API dataset');
    for (const row of result.results) {
      if (!row || row._id == null || ids.has(String(row._id))) throw new Error('Missing or duplicate record ID');
      ids.add(String(row._id));
      rows.push(row);
    }
    if (rows.length > count) throw new Error('API count mismatch');
    onProgress(rows.length, count);
  } while (rows.length < expectedCount);
  return rows;
}

export async function loadDataset({ fetcher = fetch, onProgress } = {}) {
  try {
    const rows = await fetchGarbageData({ fetcher, onProgress });
    if (!rows.length) throw new Error('Empty source dataset');
    return { rows, fetchedAt: new Date().toISOString(), source: 'live' };
  } catch (error) {
    console.warn('Direct Taipei API unavailable; trying published official dataset.', error);
    const snapshot = await fetchJson('./data/stops.json', fetcher);
    if (!Array.isArray(snapshot.rows) || !snapshot.rows.length || snapshot.rows.length !== snapshot.count || !Number.isFinite(Date.parse(snapshot.fetchedAt))) {
      throw new Error('Invalid published dataset');
    }
    return { ...snapshot, source: 'snapshot' };
  }
}
