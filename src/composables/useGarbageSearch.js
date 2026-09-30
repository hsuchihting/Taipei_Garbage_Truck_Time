import { computed, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue';
import { loadDataset, normalizeData, getDistricts, getVillages, filterGarbageStops } from '../lib/data.js';
import { paginate, sortByDistance, upcomingStops, requestLocation } from '../lib/features.js';

export function useGarbageSearch() {
  const stops = shallowRef([]);
  const query = reactive({ startTime: '18:30', endTime: '21:00', district: '', village: '' });
  const activeQuery = shallowRef(null);
  const loading = ref(true);
  const failed = ref(false);
  const loadText = ref('正在取得臺北市垃圾車資料…');
  const validationError = ref('');
  const position = shallowRef(null);
  const locating = ref(false);
  const locationStatus = ref('');
  const locationFailed = ref(false);
  const sortOrder = ref('time');
  const currentPage = ref(1);
  const now = shallowRef(new Date());
  let locationRequest = 0;
  let loadRequest = 0;
  let clock;
  const ready = computed(() => !loading.value && !failed.value && stops.value.length > 0);
  const districts = computed(() => getDistricts(stops.value));
  const villageIndex = computed(() => new Map(districts.value.map(district => [district, getVillages(stops.value, district)])));
  const villages = computed(() => villageIndex.value.get(query.district) || []);
  // Synchronous reset also allows a saved area's village to be applied immediately afterwards.
  watch(() => query.district, () => { query.village = ''; }, { flush: 'sync' });

  const results = computed(() => {
    if (!activeQuery.value) return [];
    if (activeQuery.value.mode === 'nearby') {
      const nearby = upcomingStops(stops.value, position.value, now.value);
      return sortOrder.value === 'time' ? nearby.sort((a, b) => a.minutesUntil - b.minutesUntil || a.distance - b.distance) : nearby;
    }
    let matches = filterGarbageStops(stops.value, activeQuery.value);
    if (position.value) {
      matches = sortByDistance(matches, position.value);
      if (sortOrder.value === 'time') matches.sort((a, b) => a.arrivalMinutes - b.arrivalMinutes || a.address.localeCompare(b.address, 'zh-Hant'));
    }
    return matches;
  });
  const page = computed(() => paginate(results.value, currentPage.value));
  watch(() => page.value.page, value => { currentPage.value = value; });
  const summary = computed(() => {
    const active = activeQuery.value;
    if (!active) return '';
    if (active.mode === 'nearby') return '現在附近 · 1 公里內 · 未來 60 分鐘（臺北時間）';
    return `${active.district || '全臺北市'}${active.village ? ` · ${active.village}` : ''}　/　${active.startTime} – ${active.endTime}`;
  });
  const pageSummary = computed(() => page.value.visible
    ? `第 ${page.value.page} / ${page.value.totalPages} 頁 · 顯示第 ${page.value.start + 1}–${page.value.end} 筆，每頁 10 筆`
    : results.value.length ? `顯示全部 ${results.value.length} 筆` : '');

  function cancelLocation() { locationRequest++; locating.value = false; }
  function search() {
    if (!ready.value) return false;
    try { filterGarbageStops(stops.value, query); }
    catch (error) { validationError.value = error.message; return false; }
    validationError.value = '';
    if (locating.value) locationStatus.value = '已切換為時間與區里查詢。';
    cancelLocation();
    activeQuery.value = { mode: 'manual', ...query };
    currentPage.value = 1;
    return true;
  }
  function selectFavorite(favorite) {
    query.district = favorite.district;
    query.village = favorite.village;
    return search();
  }
  async function locate(forNearby = true) {
    if (!ready.value || locating.value) return;
    const token = ++locationRequest;
    locating.value = true;
    locationFailed.value = false;
    locationStatus.value = '正在取得位置，請在瀏覽器提示中選擇是否允許定位。';
    try {
      const point = await requestLocation(navigator.geolocation);
      if (token !== locationRequest) return;
      position.value = point;
      sortOrder.value = 'distance';
      const precision = Number.isFinite(point.accuracy) ? `，定位精度約 ${Math.round(point.accuracy)} 公尺` : '';
      locationStatus.value = `已取得位置${precision}。距離依本次定位估算；移動後請重新按附近查詢。${point.accuracy > 1000 ? '目前定位較不精確，附近結果可能有誤差。' : ''}`;
      if (forNearby) { activeQuery.value = { mode: 'nearby' }; validationError.value = ''; }
      now.value = new Date();
      currentPage.value = 1;
    } catch (error) {
      if (token !== locationRequest) return;
      locationStatus.value = error.message;
      locationFailed.value = true;
    } finally { if (token === locationRequest) locating.value = false; }
  }
  async function changeSort(value) {
    if (value === 'distance' && !position.value) { await locate(false); return; }
    sortOrder.value = value;
    currentPage.value = 1;
  }
  async function initialize() {
    const token = ++loadRequest;
    cancelLocation();
    loading.value = true;
    failed.value = false;
    activeQuery.value = null;
    loadText.value = '正在取得臺北市垃圾車資料…';
    try {
      const dataset = await loadDataset({ onProgress: (loaded, count) => {
        if (token === loadRequest) loadText.value = `正在取得臺北市垃圾車資料… ${loaded.toLocaleString('zh-TW')} / ${count.toLocaleString('zh-TW')}`;
      } });
      if (token !== loadRequest) return;
      const normalized = normalizeData(dataset.rows);
      if (!normalized.some(stop => stop.arrivalMinutes !== null && stop.district)) throw new Error('No usable schedule data');
      stops.value = normalized;
      query.district = '';
      query.village = '';
      const date = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(dataset.fetchedAt));
      const old = Date.now() - Date.parse(dataset.fetchedAt) > 48 * 60 * 60 * 1000;
      loadText.value = `資料載入完成 · ${normalized.length.toLocaleString('zh-TW')} 筆${dataset.source === 'snapshot' ? '官方資料快照' : '官方資料'} · 擷取於 ${date}${old ? '（資料較舊，請留意實際清運安排）' : ''}`;
      loading.value = false;
      search();
    } catch (error) {
      if (token !== loadRequest) return;
      console.error('Unable to load garbage schedules', error);
      failed.value = true;
    } finally { if (token === loadRequest) loading.value = false; }
  }
  function refreshClock() { if (!document.hidden) now.value = new Date(); }
  onMounted(() => {
    initialize();
    clock = setInterval(refreshClock, 30000);
    document.addEventListener('visibilitychange', refreshClock);
  });
  onUnmounted(() => {
    loadRequest++;
    cancelLocation();
    clearInterval(clock);
    document.removeEventListener('visibilitychange', refreshClock);
  });
  return { query, activeQuery, loading, failed, loadText, validationError, ready, districts, villages, villageIndex,
    position, locating, locationStatus, locationFailed, sortOrder, currentPage, now, results, page, summary, pageSummary,
    search, selectFavorite, locate, changeSort, initialize };
}
