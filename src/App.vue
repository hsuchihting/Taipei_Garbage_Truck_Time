<script setup>
import { nextTick, ref } from 'vue';
import HeroSection from './components/HeroSection.vue';
import StopCard from './components/StopCard.vue';
import ResultsPagination from './components/ResultsPagination.vue';
import FavoritesPanel from './components/FavoritesPanel.vue';
import { useGarbageSearch } from './composables/useGarbageSearch.js';

const { query, activeQuery, loading, failed, loadText, validationError, ready, districts, villages, villageIndex,
  position, locating, locationStatus, locationFailed, sortOrder, currentPage, now, results, page, summary, pageSummary,
  search, selectFavorite, locate, changeSort, initialize } = useGarbageSearch();
const endTimeInput = ref(null);
const resultsTitle = ref(null);
async function submitSearch() {
  if (!search()) { await nextTick(); endTimeInput.value?.focus(); }
}
async function goToPage(number) {
  currentPage.value = number;
  await nextTick();
  resultsTitle.value?.focus({ preventScroll: true });
  resultsTitle.value?.scrollIntoView({ block: 'start' });
}
async function onSort(event) {
  await changeSort(event.target.value);
  // Restore the native select after a rejected location request, even if state did not change.
  event.target.value = sortOrder.value;
}
</script>

<template>
  <a class="skip-link" href="#search">跳至查詢條件</a>
  <header class="site-header">
    <div class="brand"><span class="brand-icon" aria-hidden="true">↻</span><span>臺北垃圾車時間<small>TAIPEI GARBAGE TRUCK</small></span></div>
    <span class="header-note"><span class="status-dot"></span> 清運時間查詢</span>
  </header>
  <main>
    <HeroSection />
    <section id="search" class="search-panel" aria-labelledby="search-title">
      <div class="panel-heading"><h2 id="search-title">你想在哪裡倒垃圾？</h2><span>依時間 → 行政區 → 里別查詢</span></div>
      <form id="search-form" @submit.prevent="submitSearch">
        <fieldset id="search-fields" :disabled="!ready">
          <legend class="sr-only">垃圾車查詢條件</legend>
          <div class="search-grid">
            <div class="field time-field"><span class="field-label"><span class="step">01</span> 垃圾車時間</span>
              <div class="time-range">
                <input id="start-time" v-model="query.startTime" type="time" required aria-label="開始時間"><span>～</span>
                <input id="end-time" ref="endTimeInput" v-model="query.endTime" type="time" required aria-label="結束時間" :aria-invalid="validationError ? 'true' : undefined" :aria-describedby="validationError ? 'validation-error' : undefined">
              </div>
            </div>
            <div class="field"><label for="district"><span class="step">02</span> 行政區</label><select id="district" v-model="query.district"><option value="">全臺北市</option><option v-for="district in districts" :key="district" :value="district">{{ district }}</option></select></div>
            <div class="field"><label for="village"><span class="step">03</span> 里別</label><select id="village" v-model="query.village" :disabled="!query.district"><option value="">{{ query.district ? '全部里別' : '請先選擇行政區' }}</option><option v-for="village in villages" :key="village" :value="village">{{ village }}</option></select></div>
            <button class="search-button" type="submit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg>搜尋垃圾車</button>
          </div>
        </fieldset>
        <p v-if="validationError" id="validation-error" class="validation-error" role="alert">{{ validationError }}</p>
      </form>
      <p class="search-hint">不選行政區或里別，也可以查詢整個區域的清運時間。</p>
      <div class="nearby-tools">
        <button id="nearby" class="secondary-button" :disabled="!ready || locating" @click="locate(true)">{{ locating ? '正在定位…' : '◎ 現在附近有垃圾車嗎？' }}</button>
        <p>查詢 1 公里內、未來 60 分鐘的預定停靠地點。<br>位置僅用於本頁計算距離，不儲存或上傳。</p>
      </div>
      <p v-if="locationStatus" id="location-status" class="feature-status" :class="{ 'is-error': locationFailed }" role="status">{{ locationStatus }}</p>
      <FavoritesPanel :ready="ready" :district="query.district" :village="query.village" :village-index="villageIndex" @select="selectFavorite" />
    </section>

    <div v-if="!failed" id="load-status" class="load-status" :data-loading="loading" role="status" aria-live="polite"><span class="status-dot"></span><span id="load-text">{{ loadText }}</span></div>
    <section v-if="failed" id="error-state" class="message-state" role="alert"><span class="state-icon" aria-hidden="true">!</span><h2>目前無法取得垃圾車資料</h2><p>臺北市開放資料服務可能暫時無法連線，<br>請稍後重新載入。</p><button id="retry" class="secondary-button" @click="initialize">重新載入</button></section>

    <section v-if="ready && activeQuery" id="results-section" aria-labelledby="results-title">
      <div class="results-heading">
        <div><p id="query-summary" class="query-summary">{{ summary }}</p><h2 id="results-title" ref="resultsTitle" tabindex="-1">搜尋結果 <span id="result-count" aria-live="polite">{{ results.length.toLocaleString('zh-TW') }} 個停靠地點</span></h2></div>
        <div class="sort-control"><label for="sort-order">排序</label><select id="sort-order" :value="sortOrder" :disabled="locating" @change="onSort"><option value="time">抵達時間由早到晚</option><option value="distance">距離由近到遠（需定位）</option></select></div>
      </div>
      <p class="schedule-note">以下依預定時刻表估算，非即時車輛位置；實際時間與是否清運依當日公告及現場情況為準。距離為直線距離。</p>
      <p id="page-summary" class="page-summary" role="status">{{ pageSummary }}</p>
      <div id="results" class="results-grid"><StopCard v-for="stop in page.items" :key="stop.id" :stop="stop" :now="now" :show-distance="!!position" /></div>
      <ResultsPagination :page="page" @change="goToPage" />
      <div v-if="!results.length" id="empty-state" class="message-state">
        <span class="state-icon" aria-hidden="true">◷</span>
        <h3>{{ activeQuery.mode === 'nearby' ? '附近目前沒有即將抵達的垃圾車' : '這個時間目前找不到垃圾車' }}</h3>
        <p>{{ activeQuery.mode === 'nearby' ? '1 公里內未來 60 分鐘沒有預定停靠點。可改用上方時間、行政區與里別查詢。' : '試著放寬搜尋時間，或選擇其他里別、行政區再查詢。' }}</p>
      </div>
    </section>
  </main>
  <footer><span class="footer-brand">臺北垃圾車時間</span><p>資料來源：<a href="https://data.taipei/" target="_blank" rel="noopener noreferrer">臺北市資料大平臺 ↗</a><br>臺北市垃圾車點位路線資訊 · 預定清運時間查詢</p></footer>
</template>
