import { loadDataset, normalizeData, getDistricts, getVillages, filterGarbageStops, googleMapsUrl } from './data.js';
import { paginate, sortByDistance, formatDistance, upcomingStops, arrivalEstimate, requestLocation, loadFavorites, saveFavorite, removeFavorite, FAVORITES_KEY } from './features.js';

const $ = id => document.getElementById(id);
let allGarbageStops = [];
const villageIndex = new Map();
let activeQuery = null;
let results = [];
let currentPage = 1;
let sortOrder = 'time';
let position = null;
let locationRequest = 0;
let ready = false;
let favorites = [];

function message(id, text, error = false) {
  $(id).textContent = text;
  $(id).hidden = !text;
  $(id).classList.toggle('is-error', error);
}

function updateVillages() {
  const district = $('district').value;
  setOptions($('village'), villageIndex.get(district) || [], district ? '全部里別' : '請先選擇行政區');
  $('village').disabled = !district;
}

function setOptions(select, values, placeholder) {
  select.replaceChildren(new Option(placeholder, ''), ...values.map(value => new Option(value, value)));
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createCard(stop) {
  const card = node('article', 'stop-card');
  const body = node('div', 'card-main');
  const time = node('div', 'time-line');
  time.setAttribute('aria-label', `抵達 ${stop.arrivalTime}，離開 ${stop.leaveTime}`);
  time.append(node('span', 'arrival', stop.arrivalTime), node('span', 'time-separator', '–'), node('span', 'leave', stop.leaveTime));
  body.append(time, node('h3', 'address', stop.address || '未提供停靠地點'), node('span', 'area', [stop.district, stop.village].filter(Boolean).join(' · ')));
  const estimate = node('p', 'arrival-estimate', arrivalEstimate(stop, new Date(), stop.nextDay));
  estimate.dataset.stopId = String(stop.id);
  estimate.hidden = !estimate.textContent;
  body.append(estimate);
  if (position) body.append(node('p', 'distance-note', `${formatDistance(stop.distance)} · 直線距離`));
  const details = node('dl', 'details');
  for (const [label, value] of [['路線', stop.route], ['車次', stop.trip], ['車號', stop.vehicleNo], ['分隊', stop.team]]) {
    const item = node('div');
    item.append(node('dt', '', label), node('dd', '', value || '未提供'));
    details.append(item);
  }
  body.append(details);
  const footer = node('div', 'card-footer');
  footer.append(node('span', '', '預定清運時間'));
  const url = googleMapsUrl(stop);
  if (url) {
    const link = node('a', 'map-link', '查看地圖 ↗');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `查看地圖：${stop.address}（另開視窗）`);
    footer.append(link);
  } else {
    footer.append(node('span', '', '未提供座標'));
  }
  card.append(body, footer);
  return card;
}

function cancelLocationRequest() {
  locationRequest++;
  $('nearby').disabled = !ready;
  $('nearby').textContent = '◎ 現在附近有垃圾車嗎？';
  $('sort-order').disabled = false;
}

function search() {
  const query = { startTime: $('start-time').value, endTime: $('end-time').value, district: $('district').value, village: $('village').value };
  try {
    filterGarbageStops(allGarbageStops, query);
  } catch (error) {
    $('validation-error').textContent = error.message;
    $('validation-error').hidden = false;
    $('end-time').setAttribute('aria-invalid', 'true');
    $('end-time').setAttribute('aria-describedby', 'validation-error');
    $('end-time').focus();
    return;
  }
  $('validation-error').hidden = true;
  $('end-time').removeAttribute('aria-invalid');
  $('end-time').removeAttribute('aria-describedby');
  cancelLocationRequest();
  if ($('location-status').textContent.startsWith('正在取得位置')) message('location-status', '已切換為時間與區里查詢。');
  activeQuery = { mode: 'manual', ...query };
  currentPage = 1;
  refreshResults();
}

function refreshResults() {
  if (!activeQuery) return;
  if (activeQuery.mode === 'nearby') {
    results = upcomingStops(allGarbageStops, position);
    if (sortOrder === 'time') results.sort((a, b) => a.minutesUntil - b.minutesUntil || a.distance - b.distance);
    $('query-summary').textContent = '現在附近 · 1 公里內 · 未來 60 分鐘（臺北時間）';
  } else {
    results = filterGarbageStops(allGarbageStops, activeQuery);
    if (position) {
      results = sortByDistance(results, position);
      if (sortOrder === 'time') results.sort((a, b) => a.arrivalMinutes - b.arrivalMinutes || a.address.localeCompare(b.address, 'zh-Hant'));
    }
    const query = activeQuery;
    $('query-summary').textContent = `${query.district || '全臺北市'}${query.village ? ` · ${query.village}` : ''}　/　${query.startTime} – ${query.endTime}`;
  }
  $('sort-order').value = sortOrder;
  $('result-count').textContent = `${results.length.toLocaleString('zh-TW')} 個停靠地點`;
  $('empty-state').hidden = results.length !== 0;
  $('empty-state').querySelector('h3').textContent = activeQuery.mode === 'nearby' ? '附近目前沒有即將抵達的垃圾車' : '這個時間目前找不到垃圾車';
  $('empty-state').querySelector('p').textContent = activeQuery.mode === 'nearby' ? '1 公里內未來 60 分鐘沒有預定停靠點。可改用上方時間、行政區與里別查詢。' : '試著放寬搜尋時間，或選擇其他里別、行政區再查詢。';
  $('results-section').hidden = false;
  renderPage();
}

function renderPage(moveFocus = false) {
  const page = paginate(results, currentPage);
  currentPage = page.page;
  $('results').replaceChildren(...page.items.map(createCard));
  $('pagination').hidden = !page.visible;
  $('page-summary').textContent = page.visible ? `第 ${page.page} / ${page.totalPages} 頁 · 顯示第 ${page.start + 1}–${page.end} 筆，每頁 10 筆` : (results.length ? `顯示全部 ${results.length} 筆` : '');
  if (page.visible) {
    $('page-select').replaceChildren(...Array.from({ length: page.totalPages }, (_, i) => new Option(`${i + 1} / ${page.totalPages} 頁`, String(i + 1))));
    $('page-select').value = String(page.page);
    $('first-page').disabled = $('previous-page').disabled = page.page === 1;
    $('next-page').disabled = $('last-page').disabled = page.page === page.totalPages;
  }
  if (moveFocus) {
    $('results-title').focus({ preventScroll: true });
    $('results-title').scrollIntoView({ block: 'start' });
  }
}

async function locate(forNearby) {
  const token = ++locationRequest;
  $('nearby').disabled = true;
  $('nearby').textContent = '正在定位…';
  $('sort-order').disabled = true;
  message('location-status', '正在取得位置，請在瀏覽器提示中選擇是否允許定位。');
  try {
    const point = await requestLocation(navigator.geolocation);
    if (token !== locationRequest) return;
    position = point;
    sortOrder = 'distance';
    const precision = Number.isFinite(point.accuracy) ? `，定位精度約 ${Math.round(point.accuracy)} 公尺` : '';
    message('location-status', `已取得位置${precision}。距離依本次定位估算；移動後請重新按附近查詢。${point.accuracy > 1000 ? '目前定位較不精確，附近結果可能有誤差。' : ''}`);
    if (forNearby) {
      activeQuery = { mode: 'nearby' };
      $('validation-error').hidden = true;
      $('end-time').removeAttribute('aria-invalid');
      $('end-time').removeAttribute('aria-describedby');
    }
    currentPage = 1;
    refreshResults();
  } catch (error) {
    if (token !== locationRequest) return;
    $('sort-order').value = sortOrder;
    message('location-status', error.message, true);
  } finally {
    if (token === locationRequest) cancelLocationRequest();
  }
}

function renderFavorites() {
  $('favorites-list').replaceChildren(...favorites.map(favorite => {
    const group = node('div', 'favorite-chip');
    const use = node('button', '', `★ ${favorite.name}`);
    use.type = 'button';
    use.disabled = !ready;
    use.title = `${favorite.district}${favorite.village ? ` · ${favorite.village}` : ''}`;
    use.setAttribute('aria-label', `查詢收藏 ${favorite.name}：${use.title}`);
    use.addEventListener('click', () => {
      if (!villageIndex.has(favorite.district) || (favorite.village && !villageIndex.get(favorite.district).includes(favorite.village))) {
        message('favorite-status', '此收藏的區里已不在目前資料中，請重新選擇區里並以相同名稱更新收藏。', true);
        return;
      }
      $('district').value = favorite.district;
      updateVillages();
      $('village').value = favorite.village;
      search();
      message('favorite-status', `已套用「${favorite.name}」的區里，使用目前設定的時間查詢。`);
    });
    const remove = node('button', 'remove-favorite', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `移除收藏 ${favorite.name}`);
    remove.addEventListener('click', () => {
      try {
        favorites = removeFavorite(localStorage, favorite.id);
        renderFavorites();
        message('favorite-status', `已移除「${favorite.name}」。`);
      } catch { message('favorite-status', '無法更新收藏，請確認瀏覽器允許儲存資料。', true); }
    });
    group.append(use, remove);
    return group;
  }));
  $('favorites-empty').hidden = favorites.length > 0;
}

function readFavorites() {
  try { favorites = loadFavorites(localStorage); }
  catch { message('favorite-status', '無法讀取收藏，瀏覽器可能限制儲存或資料已損壞。仍可正常查詢。', true); }
  renderFavorites();
}

async function initialize() {
  ready = false;
  cancelLocationRequest();
  $('search-fields').disabled = true;
  $('error-state').hidden = true;
  $('results-section').hidden = true;
  $('load-status').hidden = false;
  $('load-status').dataset.loading = 'true';
  $('load-text').textContent = '正在取得臺北市垃圾車資料…';
  try {
    const dataset = await loadDataset({ onProgress: (loaded, total) => {
      $('load-text').textContent = `正在取得臺北市垃圾車資料… ${loaded.toLocaleString('zh-TW')} / ${total.toLocaleString('zh-TW')}`;
    } });
    allGarbageStops = normalizeData(dataset.rows);
    if (!allGarbageStops.some(stop => stop.arrivalMinutes !== null && stop.district)) throw new Error('No usable schedule data');
    villageIndex.clear();
    const districts = getDistricts(allGarbageStops);
    for (const district of districts) villageIndex.set(district, getVillages(allGarbageStops, district));
    setOptions($('district'), districts, '全臺北市');
    setOptions($('village'), [], '請先選擇行政區');
    $('village').disabled = true;
    const date = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(dataset.fetchedAt));
    const old = Date.now() - Date.parse(dataset.fetchedAt) > 48 * 60 * 60 * 1000;
    $('load-text').textContent = `資料載入完成 · ${allGarbageStops.length.toLocaleString('zh-TW')} 筆${dataset.source === 'snapshot' ? '官方資料快照' : '官方資料'} · 擷取於 ${date}${old ? '（資料較舊，請留意實際清運安排）' : ''}`;
    $('search-fields').disabled = false;
    ready = true;
    $('nearby').disabled = false;
    $('favorite-name').disabled = false;
    $('save-favorite').disabled = false;
    renderFavorites();
    search();
  } catch (error) {
    console.error('Unable to load garbage schedules', error);
    $('load-status').hidden = true;
    $('error-state').hidden = false;
  } finally {
    $('load-status').dataset.loading = 'false';
  }
}

$('district').addEventListener('change', updateVillages);
$('search-form').addEventListener('submit', event => { event.preventDefault(); search(); });
$('retry').addEventListener('click', initialize);
$('nearby').addEventListener('click', () => locate(true));
$('sort-order').addEventListener('change', () => {
  if ($('sort-order').value === 'distance' && !position) { locate(false); return; }
  sortOrder = $('sort-order').value;
  currentPage = 1;
  refreshResults();
});
function goToPage(page) { currentPage = page; renderPage(true); }
$('first-page').addEventListener('click', () => goToPage(1));
$('previous-page').addEventListener('click', () => goToPage(currentPage - 1));
$('next-page').addEventListener('click', () => goToPage(currentPage + 1));
$('last-page').addEventListener('click', () => goToPage(Math.ceil(results.length / 10)));
$('page-select').addEventListener('change', () => goToPage(Number($('page-select').value)));
$('favorite-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!$('district').value) { message('favorite-status', '請先選擇要收藏的行政區與里別（里別可不選）。', true); return; }
  try {
    const name = $('favorite-name').value.trim();
    if (!name) { message('favorite-status', '請輸入收藏名稱。', true); return; }
    favorites = saveFavorite(localStorage, { name, district: $('district').value, village: $('village').value });
    renderFavorites();
    message('favorite-status', `已儲存「${name}」。同名收藏會更新為目前選擇的區里。`);
    $('favorite-name').value = '';
  } catch { message('favorite-status', '無法儲存收藏，請確認瀏覽器允許儲存資料且尚有可用空間。', true); }
});
window.addEventListener('storage', event => { if (event.key === FAVORITES_KEY || event.key === null) readFavorites(); });
function refreshClock() {
  if (!ready || !activeQuery) return;
  if (activeQuery.mode === 'nearby') { refreshResults(); return; }
  const byId = new Map(results.map(stop => [String(stop.id), stop]));
  document.querySelectorAll('.arrival-estimate').forEach(element => {
    const stop = byId.get(element.dataset.stopId);
    element.textContent = stop ? arrivalEstimate(stop) : '';
    element.hidden = !element.textContent;
  });
}
setInterval(() => { if (!document.hidden) refreshClock(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshClock(); });
readFavorites();
initialize();
