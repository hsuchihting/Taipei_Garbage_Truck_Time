<script setup>
import { computed } from 'vue';
import { googleMapsUrl } from '../lib/data.js';
import { arrivalEstimate, formatDistance } from '../lib/features.js';

const props = defineProps({ stop: { type: Object, required: true }, now: { type: Date, required: true }, showDistance: Boolean });
const mapUrl = computed(() => googleMapsUrl(props.stop));
const estimate = computed(() => arrivalEstimate(props.stop, props.now, props.stop.nextDay));
const details = computed(() => [['路線', props.stop.route], ['車次', props.stop.trip], ['車號', props.stop.vehicleNo], ['分隊', props.stop.team]]);
</script>

<template>
  <article class="stop-card">
    <div class="card-main">
      <div class="time-line" :aria-label="`抵達 ${stop.arrivalTime}，離開 ${stop.leaveTime}`">
        <span class="arrival">{{ stop.arrivalTime }}</span><span class="time-separator">–</span><span class="leave">{{ stop.leaveTime }}</span>
      </div>
      <h3 class="address">{{ stop.address || '未提供停靠地點' }}</h3>
      <span class="area">{{ [stop.district, stop.village].filter(Boolean).join(' · ') }}</span>
      <p v-if="estimate" class="arrival-estimate">{{ estimate }}</p>
      <p v-if="showDistance" class="distance-note">{{ formatDistance(stop.distance) }} · 直線距離</p>
      <dl class="details">
        <div v-for="[label, value] in details" :key="label"><dt>{{ label }}</dt><dd>{{ value || '未提供' }}</dd></div>
      </dl>
    </div>
    <div class="card-footer">
      <span>預定清運時間</span>
      <a v-if="mapUrl" class="map-link" :href="mapUrl" target="_blank" rel="noopener noreferrer" :aria-label="`查看地圖：${stop.address}（另開視窗）`">查看地圖 ↗</a>
      <span v-else>未提供座標</span>
    </div>
  </article>
</template>
