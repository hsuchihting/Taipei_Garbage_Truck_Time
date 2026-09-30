import test from 'node:test';
import assert from 'node:assert/strict';
import './features.test.js';
import { timeToMinutes, formatTime, normalizeData, filterGarbageStops, getDistricts, getVillages, googleMapsUrl, fetchGarbageData, loadDataset } from '../src/lib/data.js';

const row = (id, time, district = '信義區', village = '三張里') => ({ _id: id, '行政區': district, '里別': village, '抵達時間': time, '離開時間': '2110', '地點': '測試地點', '緯度': '25.03', '經度': '121.56' });
const stops = normalizeData([row(1, '2101'), row(2, '1830'), row(3, '1900', '大安區', '龍安里'), row(4, '1829'), row(5, '2100'), row(6, '1940', '信義區', '中興里'), row(7, 'invalid')]);
const query = { startTime: '18:30', endTime: '21:00' };

test('strict time parsing and display, including midnight', () => {
  assert.equal(formatTime('1905'), '19:05');
  assert.equal(timeToMinutes('18:30'), 1110);
  assert.equal(formatTime('0000'), '00:00');
  for (const value of ['', null, '2460', '1261', '2400', '18300', 'foo']) assert.equal(timeToMinutes(value), null);
});
test('inclusive boundaries, ascending order and optional area filters', () => {
  assert.deepEqual(filterGarbageStops(stops, query).map(x => x.id), [2, 3, 6, 5]);
  assert.deepEqual(filterGarbageStops(stops, { ...query, district: '信義區' }).map(x => x.id), [2, 6, 5]);
  assert.deepEqual(filterGarbageStops(stops, { ...query, district: '信義區', village: '三張里' }).map(x => x.id), [2, 5]);
  assert.deepEqual(filterGarbageStops(stops, { startTime: '21:00', endTime: '21:00' }).map(x => x.id), [5]);
  assert.equal(filterGarbageStops(stops, { startTime: '00:00', endTime: '00:01' }).length, 0);
  assert.throws(() => filterGarbageStops(stops, { startTime: '21:00', endTime: '18:30' }));
  assert.throws(() => filterGarbageStops(stops, { startTime: '', endTime: '18:30' }));
});
test('district and village options derive only from the matching official rows', () => {
  assert.equal(getDistricts(stops).length, 2);
  assert.deepEqual(new Set(getVillages(stops, '信義區')), new Set(['三張里', '中興里']));
  assert.deepEqual(getVillages(stops, '大安區'), ['龍安里']);
});
test('map uses latitude first and never fabricates missing coordinates', () => {
  assert.equal(googleMapsUrl(stops[0]), 'https://www.google.com/maps/search/?api=1&query=25.03,121.56');
  assert.equal(googleMapsUrl(normalizeData([{ ...row(9, '1900'), '緯度': '' }])[0]), null);
  assert.equal(googleMapsUrl(normalizeData([{ ...row(9, '1900'), '經度': 'invalid' }])[0]), null);
});
test('pagination follows actual returned page sizes until count is satisfied', async () => {
  const offsets = [];
  const rows = await fetchGarbageData({ fetcher: async url => {
    const offset = Number(url.searchParams.get('offset'));
    offsets.push(offset);
    return { ok: true, json: async () => ({ result: { count: 5, offset, limit: 2, results: [0, 1].filter(n => n + offset < 5).map(n => row(n + offset, '1900')) } }) };
  } });
  assert.deepEqual(offsets, [0, 2, 4]);
  assert.equal(rows.length, 5);
});
test('pagination rejects incomplete, repeated, malformed and changing pages', async () => {
  for (const mode of ['empty', 'duplicate', 'count', 'offset', 'malformed']) {
    let calls = 0;
    await assert.rejects(fetchGarbageData({ fetcher: async () => {
      const second = calls++ > 0;
      const result = { count: second && mode === 'count' ? 3 : 2, offset: second && mode !== 'offset' ? 1 : 0, results: second && mode === 'empty' ? [] : [row(second && mode !== 'duplicate' ? 2 : 1, '1900')] };
      return { ok: true, json: async () => mode === 'malformed' ? {} : { result } };
    } }));
  }
});
test('blocked live API uses complete dated snapshot; both sources failing is an error', async () => {
  let calls = 0;
  const dataset = await loadDataset({ fetcher: async url => {
    calls++;
    if (String(url).startsWith('https:')) throw new TypeError('Network error');
    return { ok: true, json: async () => ({ rows: [row(1, '1900')], count: 1, fetchedAt: '2026-09-29T00:00:00Z' }) };
  } });
  assert.equal(dataset.source, 'snapshot');
  assert.equal(calls, 2);
  await assert.rejects(loadDataset({ fetcher: async () => ({ ok: false, status: 503 }) }));
});
