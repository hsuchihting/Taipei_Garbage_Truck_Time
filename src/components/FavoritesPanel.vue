<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { FAVORITES_KEY, loadFavorites, saveFavorite, removeFavorite } from '../lib/features.js';

const props = defineProps({ ready: Boolean, district: String, village: String, villageIndex: { type: Map, required: true } });
const emit = defineEmits(['select']);
const favorites = ref([]);
const name = ref('');
const status = ref('');
const failed = ref(false);
const area = favorite => `${favorite.district}${favorite.village ? ` · ${favorite.village}` : ''}`;
function message(text, error = false) { status.value = text; failed.value = error; }
function read() {
  try { favorites.value = loadFavorites(localStorage); }
  catch { message('無法讀取收藏，瀏覽器可能限制儲存或資料已損壞。仍可正常查詢。', true); }
}
function save() {
  if (!props.district) { message('請先選擇要收藏的行政區與里別（里別可不選）。', true); return; }
  if (!name.value.trim()) { message('請輸入收藏名稱。', true); return; }
  try {
    favorites.value = saveFavorite(localStorage, { name: name.value, district: props.district, village: props.village });
    message(`已儲存「${name.value.trim()}」。同名收藏會更新為目前選擇的區里。`);
    name.value = '';
  } catch { message('無法儲存收藏，請確認瀏覽器允許儲存資料且尚有可用空間。', true); }
}
function remove(favorite) {
  try { favorites.value = removeFavorite(localStorage, favorite.id); message(`已移除「${favorite.name}」。`); }
  catch { message('無法更新收藏，請確認瀏覽器允許儲存資料。', true); }
}
function select(favorite) {
  if (!props.villageIndex.has(favorite.district) || (favorite.village && !props.villageIndex.get(favorite.district).includes(favorite.village))) {
    message('此收藏的區里已不在目前資料中，請重新選擇區里並以相同名稱更新收藏。', true);
    return;
  }
  emit('select', favorite);
  message(`已套用「${favorite.name}」的區里，使用目前設定的時間查詢。`);
}
function onStorage(event) { if (event.key === FAVORITES_KEY || event.key === null) read(); }
onMounted(() => { read(); window.addEventListener('storage', onStorage); });
onUnmounted(() => window.removeEventListener('storage', onStorage));
</script>

<template>
  <section class="favorites" aria-labelledby="favorites-title">
    <h3 id="favorites-title">☆ 我的收藏地點</h3>
    <div id="favorites-list" class="favorites-list">
      <div v-for="favorite in favorites" :key="favorite.id" class="favorite-chip">
        <button type="button" :disabled="!ready" :title="area(favorite)" :aria-label="`查詢收藏 ${favorite.name}：${area(favorite)}`" @click="select(favorite)">★ {{ favorite.name }}</button>
        <button type="button" class="remove-favorite" :aria-label="`移除收藏 ${favorite.name}`" @click="remove(favorite)">×</button>
      </div>
    </div>
    <p v-if="!favorites.length" id="favorites-empty" class="search-hint">收藏常用的區與里，下次一鍵查詢。僅儲存於此瀏覽器。</p>
    <form id="favorite-form" class="favorite-form" @submit.prevent="save">
      <label class="sr-only" for="favorite-name">收藏名稱</label>
      <input id="favorite-name" v-model="name" placeholder="收藏名稱，例如：家裡、公司" maxlength="30" required :disabled="!ready">
      <button id="save-favorite" class="secondary-button" :disabled="!ready">收藏目前區里</button>
    </form>
    <p v-if="status" id="favorite-status" class="feature-status" :class="{ 'is-error': failed }" role="status">{{ status }}</p>
  </section>
</template>
