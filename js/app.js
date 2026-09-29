import { loadDataset, normalizeData, getDistricts, getVillages, filterGarbageStops, googleMapsUrl } from './data.js';

const $ = id => document.getElementById(id);
let allGarbageStops = [];
const villageIndex = new Map();

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

function search() {
  const query = { startTime: $('start-time').value, endTime: $('end-time').value, district: $('district').value, village: $('village').value };
  let results;
  try {
    results = filterGarbageStops(allGarbageStops, query);
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
  $('query-summary').textContent = `${query.district || '全臺北市'}${query.village ? ` · ${query.village}` : ''}　/　${query.startTime} – ${query.endTime}`;
  $('result-count').textContent = `${results.length.toLocaleString('zh-TW')} 個停靠地點`;
  $('result-count').setAttribute('aria-live', 'polite');
  $('results').replaceChildren(...results.map(createCard));
  $('empty-state').hidden = results.length !== 0;
  $('results-section').hidden = false;
}

async function initialize() {
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
    search();
  } catch (error) {
    console.error('Unable to load garbage schedules', error);
    $('load-status').hidden = true;
    $('error-state').hidden = false;
  } finally {
    $('load-status').dataset.loading = 'false';
  }
}

$('district').addEventListener('change', () => {
  const district = $('district').value;
  setOptions($('village'), villageIndex.get(district) || [], district ? '全部里別' : '請先選擇行政區');
  $('village').disabled = !district;
});
$('search-form').addEventListener('submit', event => { event.preventDefault(); search(); });
$('retry').addEventListener('click', initialize);
initialize();
