import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import App from '../src/App.vue';
import { loadDataset } from '../src/lib/data.js';
import { FAVORITES_KEY } from '../src/lib/features.js';

vi.mock('../src/lib/data.js', async original => ({ ...await original(), loadDataset: vi.fn() }));
const rows = Array.from({ length: 101 }, (_, index) => ({
  _id: index + 1, 行政區: index < 90 ? '信義區' : '大安區', 里別: index < 80 ? '三張里' : index < 90 ? '中興里' : '龍安里',
  抵達時間: '1908', 離開時間: '1915', 地點: `測試站 ${index + 1}`, 緯度: index < 90 ? '25.03' : '25.5', 經度: '121.56',
}));
const dataset = { rows, fetchedAt: '2026-09-29T11:00:00Z', source: 'snapshot' };
let wrapper;
async function open() { wrapper = mount(App, { attachTo: document.body }); await flushPromises(); return wrapper; }

beforeEach(() => {
  localStorage.clear();
  loadDataset.mockReset().mockResolvedValue(dataset);
  vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; vi.useRealTimers(); });

describe('Vue application regression', () => {
  it('paginates 101 results and resets to all 90 results when filtering', async () => {
    await open();
    expect(wrapper.findAll('.stop-card')).toHaveLength(10);
    await wrapper.get('#last-page').trigger('click');
    expect(wrapper.findAll('.stop-card')).toHaveLength(1);
    expect(wrapper.get('#page-summary').text()).toContain('11 / 11');
    await wrapper.get('#district').setValue('信義區');
    await wrapper.get('#search-form').trigger('submit');
    expect(wrapper.findAll('.stop-card')).toHaveLength(90);
    expect(wrapper.find('#pagination').exists()).toBe(false);
    await wrapper.get('#village').setValue('三張里');
    await wrapper.get('#district').setValue('大安區');
    expect(wrapper.get('#village').element.value).toBe('');
    await wrapper.get('#search-form').trigger('submit');
    expect(wrapper.findAll('.stop-card')).toHaveLength(11);
    expect(wrapper.get('#query-summary').text()).toContain('大安區');
  });
  it('keeps submitted results independent of form edits, validates time, and shows empty results', async () => {
    await open();
    await wrapper.get('#start-time').setValue('22:00');
    expect(wrapper.get('#query-summary').text()).toContain('18:30');
    await wrapper.get('#search-form').trigger('submit');
    expect(wrapper.get('#validation-error').text()).toContain('不可早於');
    await wrapper.get('#start-time').setValue('00:00');
    await wrapper.get('#end-time').setValue('00:01');
    await wrapper.get('#search-form').trigger('submit');
    expect(wrapper.find('#validation-error').exists()).toBe(false);
    expect(wrapper.get('#empty-state').text()).toContain('找不到垃圾車');
  });
  it('disables search while loading and can retry after an API failure', async () => {
    let reject;
    loadDataset.mockImplementationOnce(() => new Promise((resolve, fail) => { reject = fail; }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await open();
    expect(wrapper.get('#search-fields').element.disabled).toBe(true);
    reject(new Error('unavailable'));
    await flushPromises();
    expect(wrapper.get('#error-state').text()).toContain('目前無法取得');
    await wrapper.get('#retry').trigger('click');
    await flushPromises();
    expect(wrapper.find('#error-state').exists()).toBe(false);
    expect(wrapper.get('#search-fields').element.disabled).toBe(false);
  });
  it('restores legacy favorites and persists new named areas across mounts', async () => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([{ id: 'old', name: '家裡', district: '信義區', village: '三張里' }]));
    await open();
    await wrapper.get('[aria-label="查詢收藏 家裡：信義區 · 三張里"]').trigger('click');
    expect(wrapper.get('#village').element.value).toBe('三張里');
    expect(wrapper.findAll('.stop-card')).toHaveLength(80);
    await wrapper.get('#favorite-name').setValue('公司');
    await wrapper.get('#favorite-form').trigger('submit');
    wrapper.unmount();
    await open();
    expect(wrapper.find('[aria-label="查詢收藏 公司：信義區 · 三張里"]').exists()).toBe(true);
    await wrapper.get('[aria-label="移除收藏 公司"]').trigger('click');
    expect(JSON.parse(localStorage.getItem(FAVORITES_KEY))).toHaveLength(1);
  });
  it('restores time sorting when location is denied and ignores a cancelled callback', async () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (success, fail) => fail({ code: 1 }) } });
    await open();
    await wrapper.get('#sort-order').setValue('distance');
    await flushPromises();
    expect(wrapper.get('#sort-order').element.value).toBe('time');
    expect(wrapper.get('#location-status').text()).toContain('尚未允許');
    let resolve;
    navigator.geolocation.getCurrentPosition = success => { resolve = success; };
    await wrapper.get('#nearby').trigger('click');
    await wrapper.get('#search-form').trigger('submit');
    resolve({ coords: { latitude: 25.03, longitude: 121.56, accuracy: 10 } });
    await flushPromises();
    expect(wrapper.get('#query-summary').text()).toContain('全臺北市');
    expect(wrapper.find('.distance-note').exists()).toBe(false);
  });
  it('renders nearby distances and updates scheduled countdowns with timer cleanup', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-09-29T11:00:00Z'));
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: success => success({ coords: { latitude: 25.03, longitude: 121.56, accuracy: 10 } }) } });
    await open();
    await wrapper.get('#nearby').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('.stop-card')).toHaveLength(90);
    expect(wrapper.get('.distance-note').text()).toContain('約 0 m');
    expect(wrapper.get('.arrival-estimate').text()).toContain('8 分鐘');
    vi.setSystemTime(new Date('2026-09-29T11:09:00Z'));
    await vi.advanceTimersByTimeAsync(30000);
    expect(wrapper.findAll('.stop-card')).toHaveLength(0);
    expect(wrapper.get('#empty-state').text()).toContain('附近目前沒有');
    wrapper.unmount();
    wrapper = null;
    expect(vi.getTimerCount()).toBe(0);
  });
});
