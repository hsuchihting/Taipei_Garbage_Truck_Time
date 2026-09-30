<script setup>
defineProps({ page: { type: Object, required: true } });
const emit = defineEmits(['change']);
</script>

<template>
  <nav v-if="page.visible" id="pagination" class="pagination" aria-label="垃圾車結果分頁">
    <button id="first-page" type="button" :disabled="page.page === 1" @click="emit('change', 1)">首頁</button>
    <button id="previous-page" type="button" :disabled="page.page === 1" @click="emit('change', page.page - 1)">上一頁</button>
    <label for="page-select" class="sr-only">選擇頁碼</label>
    <select id="page-select" :value="page.page" @change="emit('change', Number($event.target.value))">
      <option v-for="number in page.totalPages" :key="number" :value="number">{{ number }} / {{ page.totalPages }} 頁</option>
    </select>
    <button id="next-page" type="button" :disabled="page.page === page.totalPages" @click="emit('change', page.page + 1)">下一頁</button>
    <button id="last-page" type="button" :disabled="page.page === page.totalPages" @click="emit('change', page.totalPages)">末頁</button>
  </nav>
</template>
