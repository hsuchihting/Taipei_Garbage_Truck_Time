import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { fetchGarbageData, normalizeData } from '../js/data.js';

// Publish only application assets. Keep tests, scripts, and repository metadata out of Pages.
for (const dir of ['dist', 'dist/css', 'dist/js', 'dist/data']) await mkdir(dir, { recursive: true });
for (const file of ['index.html', 'favicon.svg', 'css/style.css', 'js/app.js', 'js/data.js', 'js/features.js']) {
  await copyFile(file, `dist/${file}`);
}
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
await writeFile('dist/data/stops.json', JSON.stringify({ fetchedAt: new Date().toISOString(), count: rows.length, rows }));
await writeFile('dist/.nojekyll', '');
console.log(`Built site with ${rows.length} official records. API failure stops deployment and preserves the existing site.`);
