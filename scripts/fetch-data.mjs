import { mkdir, writeFile } from 'node:fs/promises';
import { fetchGarbageData, normalizeData } from '../src/lib/data.js';
await mkdir('public/data', { recursive: true });
let rows;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    rows = await fetchGarbageData({ onProgress: (loaded, count) => console.log(`Official API: ${loaded}/${count}`) });
    if (!rows.length || !normalizeData(rows).some(stop => stop.arrivalMinutes !== null)) throw new Error('Empty or invalid official dataset');
    break;
  } catch (error) {
    if (attempt === 3) throw error;
    console.warn(`Fetch attempt ${attempt} failed; retrying.`, error.message);
    await new Promise(resolve => setTimeout(resolve, attempt * 2000));
  }
}
await writeFile('public/data/stops.json', JSON.stringify({ fetchedAt: new Date().toISOString(), count: rows.length, rows }));
await writeFile('public/.nojekyll', '');
console.log(`Built site with ${rows.length} official records. API failure stops deployment and preserves the existing site.`);
