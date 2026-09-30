import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate, distanceMeters, sortByDistance, formatDistance, taipeiMinutes, upcomingStops, arrivalEstimate, requestLocation, saveFavorite, loadFavorites, removeFavorite, FAVORITES_KEY } from '../src/lib/features.js';
import { normalizeData } from '../src/lib/data.js';

const position = { latitude:25.03, longitude:121.56 };
const stop = (id, minutes, lat = 25.03) => ({ id, arrivalMinutes:minutes, latitude:lat, longitude:121.56 });
const now = new Date('2026-09-29T11:00:00Z'); // Taipei 19:00
const memoryStorage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

test('pagination stays hidden through 90 records and shows all results', () => {
  for (const count of [0, 1, 10, 11, 89, 90]) {
    const items = Array.from({ length:count }, (_, i) => i);
    const page = paginate(items, 5);
    assert.equal(page.visible, false);
    assert.deepEqual(page.items, items);
    assert.equal(page.page, 1);
  }
});
test('91 records enable ten pages; navigation preserves order and clamps out-of-range pages', () => {
  const items = Array.from({ length:91 }, (_, i) => i);
  assert.equal(paginate(items).visible, true);
  assert.equal(paginate(items).totalPages, 10);
  assert.deepEqual(paginate(items, 2).items, [10,11,12,13,14,15,16,17,18,19]);
  assert.deepEqual(paginate(items, 100).items, [90]);
  assert.equal(paginate(items, -1).page, 1);
  assert.equal(paginate(Array(100), 10).items.length, 10);
  assert.equal(paginate(Array(101), 11).items.length, 1);
});
test('distance calculation and sorting put missing coordinates last', () => {
  assert.equal(distanceMeters(position, position), 0);
  assert.ok(Math.abs(distanceMeters(position, { ...position, latitude:25.04 }) - 1111.95) < 1);
  assert.equal(distanceMeters(position, { latitude:null, longitude:121.56 }), null);
  assert.equal(distanceMeters(position, { latitude:0, longitude:0 }), null);
  const sorted = sortByDistance([stop(1,1140,25.04), stop(2,1140,null), stop(3,1148)], position);
  assert.deepEqual(sorted.map(x=>x.id), [3,1,2]);
  assert.equal(formatDistance(350), '約 350 m');
  assert.equal(formatDistance(1200), '約 1.2 km');
});
test('nearby uses Taipei time, one kilometer, and inclusive upcoming 60-minute window', () => {
  assert.equal(taipeiMinutes(now), 1140);
  const source = [stop(1,1139), stop(2,1140), stop(3,1200), stop(4,1201), stop(5,1148,25.04), stop(6,null), stop(7,1148,null)];
  assert.deepEqual(upcomingStops(source, position, now).map(x=>x.id), [2,3]);
  assert.equal(arrivalEstimate(stop(1,1148),now), '依時刻表，約 8 分鐘後抵達');
  assert.equal(arrivalEstimate(stop(1,1139),now), '');
  assert.equal(arrivalEstimate(stop(1,1140),now), '依時刻表，現在預定抵達');
  assert.equal(arrivalEstimate(stop(1,1201),now), '');
});
test('nearby crosses midnight without treating a passed stop as arriving soon', () => {
  const midnight = new Date('2026-09-29T15:50:00Z');
  const found = upcomingStops([stop(1,1435),stop(2,5),stop(3,51),stop(4,1429)],position,midnight);
  assert.deepEqual(found.map(x=>x.id),[2,1]); // Equal distances: deterministic scheduled-time order.
  assert.equal(found.find(x=>x.id===2).minutesUntil,15);
  assert.equal(arrivalEstimate(found[0],midnight,found[0].nextDay),'明日 · 依時刻表，約 15 分鐘後抵達');
  const source = normalizeData([{_id:1,'抵達時間':'2411','離開時間':'2417'}])[0];
  assert.equal(source.arrivalTime,'00:11');
  assert.equal(source.arrivalMinutes,11);
});
test('favorites persist only names and area filters, update by name, and support removal', () => {
  const storage = memoryStorage();
  saveFavorite(storage,{name:' 家裡 ',district:'信義區',village:'三張里',latitude:25.03});
  let saved = loadFavorites(storage);
  assert.equal(saved[0].name,'家裡');
  assert.equal(saved[0].latitude,undefined);
  const id = saved[0].id;
  saved = saveFavorite(storage,{name:'家裡',district:'大安區',village:''});
  assert.equal(saved.length,1);
  assert.equal(saved[0].id,id);
  assert.equal(loadFavorites(storage)[0].district,'大安區');
  assert.deepEqual(removeFavorite(storage,id),[]);
  assert.throws(()=>saveFavorite(storage,{name:' ',district:'信義區'}));
  storage.setItem(FAVORITES_KEY,'bad json');
  assert.throws(()=>loadFavorites(storage));
  assert.throws(()=>saveFavorite({ getItem:()=>null, setItem:()=>{throw new Error('storage disabled');} },{name:'公司',district:'信義區'}));
});
test('geolocation handles success, denied, unavailable, timeout and unsupported browsers', async () => {
  const geo = {getCurrentPosition: (success, failure, options)=>{assert.equal(options.timeout,12000);success({coords:{...position,accuracy:20}});}};
  assert.equal((await requestLocation(geo)).accuracy,20);
  for (const [code, expected] of [[1,/尚未允許/],[2,/無法取得/],[3,/逾時/]]) {
    await assert.rejects(requestLocation({getCurrentPosition:(success,failure)=>failure({code})}),expected);
  }
  await assert.rejects(requestLocation(null),/不支援/);
});
