import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const records = JSON.parse(await fs.readFile('src/data/hd-exercise-videos.json', 'utf8'));
const browser = await chromium.launch({
  ...(process.platform === 'win32'
    ? { executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' }
    : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  for (const row of records.filter((row) => row.source === 'workout-free-videos')) {
    await page.unroute('https://media.nutri.test/clip.mp4');
    await page.route('https://media.nutri.test/clip.mp4', (route) =>
      route.fulfill({ path: path.resolve('public', '.' + row.path), contentType: 'video/mp4' }),
    );
    await page.setContent(
      '<html><body style="margin:0;background:white"><video muted preload="auto" style="width:640px;height:360px;object-fit:contain" src="https://media.nutri.test/clip.mp4"></video></body></html>',
    );
    await page.locator('video').evaluate(async (video) => {
      if (video.readyState < 2)
        await new Promise((resolve, reject) => {
          video.addEventListener('loadeddata', resolve, { once: true });
          video.addEventListener('error', reject, { once: true });
        });
      await new Promise((resolve) => {
        video.addEventListener('seeked', resolve, { once: true });
        video.currentTime = Math.min(1, video.duration / 2);
      });
    });
    await page
      .locator('video')
      .screenshot({ path: path.resolve('public', '.' + row.poster), type: 'jpeg', quality: 85 });
  }
} finally {
  await browser.close();
}
console.log('Created local video poster frames.');
