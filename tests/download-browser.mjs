import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { crc32 } from 'node:zlib';

const require = createRequire(import.meta.url);
const browsers = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const url = process.argv[2];
if (!url) throw new Error('Usage: node tests/download-browser.mjs <lab-url> [report.json]');
const results = [];

function pngInfo(bytes, size) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const metadata = {}, chunks = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), end = offset + length + 12;
    assert.ok(end <= bytes.length);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    assert.equal(crc32(bytes.subarray(offset + 4, end - 4)), bytes.readUInt32BE(end - 4), `${type} CRC`);
    if (type === 'iTXt') {
      const data = bytes.subarray(offset + 8, end - 4), split = data.indexOf(0);
      assert.deepEqual([...data.subarray(split, split + 5)], [0, 0, 0, 0, 0]);
      metadata[data.subarray(0, split).toString('ascii')] = data.subarray(split + 5).toString('utf8');
    }
    chunks.push(type); offset = end;
  }
  assert.equal(chunks[0], 'IHDR'); assert.equal(chunks.at(-1), 'IEND');
  assert.ok(chunks.includes('IDAT'));
  assert.equal(bytes.readUInt32BE(16), size); assert.equal(bytes.readUInt32BE(20), size);
  return { width: size, height: size, metadata };
}

function toneWav() {
  const rate = 44100, count = rate * 2, bytes = Buffer.alloc(44 + count * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) bytes.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / rate) * 12000), 44 + i * 2);
  return bytes;
}

for (const name of (process.env.GENSOUND_TEST_BROWSERS || 'chromium,firefox,webkit').split(',')) {
  const browser = await browsers[name].launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, acceptDownloads: true });
      if (process.env.GENSOUND_TEST_HTML) await context.route(url, route => route.fulfill({ path: process.env.GENSOUND_TEST_HTML, contentType: 'text/html' }));
      const page = await context.newPage(), errors = [], requests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => requests.push({ method: request.method(), url: request.url() }));
      await page.goto(url);
      await page.locator('[data-download="rings"]:enabled').waitFor();
      assert.equal(await page.locator('#export-size').inputValue(), '2000');
      const repository = page.getByRole('link', { name: 'View source on GitHub' });
      assert.equal(await repository.getAttribute('href'), 'https://github.com/joshcoledesign/genSound');
      assert.equal(await repository.isVisible(), true);
      assert.equal(await repository.getAttribute('target'), '_blank');
      assert.match(await repository.getAttribute('rel'), /noopener/);
      await page.locator('#export-size').selectOption('500');
      const selectTrack = async track => {
        await page.locator('#track').selectOption(track);
        await page.locator('#stats').filter({ hasText: `${track} ·` }).waitFor();
        await page.locator('[data-download="rings"]:enabled').waitFor();
      };
      // An in-flight track request must not export a stale canvas under a new name.
      let release, seen;
      const gate = new Promise(resolve => { release = resolve; });
      const requested = new Promise(resolve => { seen = resolve; });
      await context.route('**/data/chopin-nocturne-op9-no2.json', async route => { seen(); await gate; await route.continue(); }, { times: 1 });
      await page.locator('#track').selectOption('chopin-nocturne-op9-no2');
      await requested;
      assert.equal(await page.locator('[data-download="rings"]').isDisabled(), true);
      assert.equal(await page.locator('[data-download="hilbert"]').isDisabled(), true);
      release();
      await page.locator('[data-download="rings"]:enabled').waitFor();
      const exports = [];
      const verifyDownload = async (layout, download, expectedName, size = 500) => {
        assert.equal(await download.failure(), null);
        assert.match(download.suggestedFilename(), /^gensound-[a-z0-9-]+-(rings|hilbert)(?:-2000x2000)?\.png$/);
        assert.ok(download.suggestedFilename().endsWith(`-${layout}${size === 500 ? '' : '-2000x2000'}.png`));
        const bytes = await readFile(await download.path()), info = pngInfo(bytes, size);
        const description = JSON.parse(info.metadata.Description);
        assert.equal(description.track, expectedName); assert.equal(description.layout, layout);
        assert.equal(description.width, size); assert.equal(description.height, size);
        assert.equal(description.sourceWidth, 500); assert.equal(description.sourceHeight, 500);
        assert.equal(description.scaling, size === 500 ? 'native' : 'nearest-neighbor');
        assert.equal(info.metadata.Title, `${expectedName} — ${layout === 'rings' ? 'Rings' : 'Hilbert'}`);
        const hashes = await page.evaluate(async ({ b64, layout, size }) => {
          const hex = async data => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), value => value.toString(16).padStart(2, '0')).join('');
          const image = new Image(); image.src = 'data:image/png;base64,' + b64; await image.decode();
          const decoded = document.createElement('canvas'); decoded.width = image.naturalWidth; decoded.height = image.naturalHeight;
          decoded.getContext('2d').drawImage(image, 0, 0);
          const actual = decoded.getContext('2d').getImageData(0, 0, size, size).data;
          const original = document.getElementById(layout).getContext('2d').getImageData(0, 0, 500, 500).data;
          const scale = size / 500;
          let exact = true;
          // Verify every output pixel against its original point, independently
          // of Canvas scaling. This catches blur at every 4x4 block boundary.
          for (let y = 0; y < size && exact; y++) for (let x = 0; x < size; x++) {
            const a = (y * size + x) * 4, b = (Math.floor(y / scale) * 500 + Math.floor(x / scale)) * 4;
            if (actual[a] !== original[b] || actual[a + 1] !== original[b + 1] || actual[a + 2] !== original[b + 2] || actual[a + 3] !== original[b + 3]) { exact = false; break; }
          }
          return { exported: await hex(actual), displayed: await hex(original), exact };
        }, { b64: bytes.toString('base64'), layout, size });
        assert.equal(hashes.exact, true, 'PNG must preserve every original point without interpolation');
        if (size === 500) assert.equal(hashes.exported, hashes.displayed);
        assert.equal(await page.locator(`[data-download="${layout}"]`).isEnabled(), true);
        exports.push({ filename: download.suggestedFilename(), bytes: bytes.length, layout, width: info.width, height: info.height, exactPixelMapping: hashes.exact, pixelsSha256: hashes.exported, sourcePixelsSha256: hashes.displayed, metadata: info.metadata });
        return info;
      };
      const save = async (layout, track, size = 500) => {
        const event = page.waitForEvent('download');
        await page.getByRole('button', { name: `Download ${layout === 'rings' ? 'Rings' : 'Hilbert'} artwork as PNG`, exact: true }).click();
        return verifyDownload(layout, await event, track, size);
      };
      for (const track of ['chopin-nocturne-op9-no2', 'beethoven-symphony-8-finale', 'macleod-hitman']) {
        await selectTrack(track);
        const before = exports.length;
        for (const layout of ['rings', 'hilbert']) {
          const info = await save(layout, track);
          if (track === 'macleod-hitman') {
            assert.match(info.metadata.Copyright, /Kevin MacLeod/);
            assert.match(info.metadata.Copyright, /https:\/\/creativecommons.org\/licenses\/by\/4.0\//);
          }
        }
        assert.notEqual(exports[before].pixelsSha256, exports[before + 1].pixelsSha256);
      }
      // A download in the same task as a slider/select event must flush its redraw.
      const event = page.waitForEvent('download');
      await page.evaluate(() => {
        const hue = document.getElementById('hue-source'); hue.value = 'time'; hue.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('[data-download="rings"]').click();
      });
      const pending = await verifyDownload('rings', await event, 'macleod-hitman');
      assert.equal(JSON.parse(pending.metadata.Description).settings.hue.picked_by, 'time');
      assert.notEqual(exports.at(-1).pixelsSha256, exports.at(-3).pixelsSha256);
      const fullscreen = [];
      await page.locator('#export-size').selectOption('500');
      await page.locator('[data-view="rings"]').click();
      await page.locator('#viewer').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#viewer-export-size').inputValue(), '500');
      for (const layout of ['rings', 'hilbert']) {
        if (layout === 'hilbert') {
          const native = await page.evaluate(() => document.fullscreenElement?.id === 'viewer');
          await page.locator('[data-viewer-layout="hilbert"]').press('Enter');
          assert.equal(await page.locator('#viewer').isVisible(), true);
          assert.equal(await page.locator('#viewer-export-size').inputValue(), '2000');
          if (native) assert.equal(await page.evaluate(() => document.fullscreenElement?.id === 'viewer'), true);
        }
        assert.equal(await page.locator(`[data-viewer-layout="${layout}"]`).getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator(`[data-viewer-layout="${layout === 'rings' ? 'hilbert' : 'rings'}"]`).getAttribute('aria-pressed'), 'false');
        assert.match(await page.locator('#viewer-title').innerText(), new RegExp('^' + (layout === 'rings' ? 'Rings' : 'Hilbert')));
        for (const size of [500, 2000]) {
          await page.locator('#viewer-export-size').selectOption(String(size));
          assert.equal(await page.locator('#export-size').inputValue(), String(size));
          const nativeBefore = await page.evaluate(() => document.fullscreenElement?.id === 'viewer');
          const download = page.waitForEvent('download');
          if (size === 2000) await page.locator('#viewer-download').press('Enter');
          else await page.locator('#viewer-download').click();
          await verifyDownload(layout, await download, 'macleod-hitman', size);
          assert.equal(await page.locator('#viewer').isVisible(), true, 'Export must keep the viewer open');
          assert.equal(await page.locator('#viewer-download').isEnabled(), true);
          assert.match(await page.locator('#viewer-download-status').innerText(), new RegExp(`${size} × ${size}`));
          const nativeAfter = await page.evaluate(() => document.fullscreenElement?.id === 'viewer');
          if (nativeBefore) assert.equal(nativeAfter, true, 'Export must retain native fullscreen');
          const previewHash = await page.locator('#viewer-canvas').evaluate(async canvas => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', canvas.getContext('2d').getImageData(0, 0, 500, 500).data)), value => value.toString(16).padStart(2, '0')).join(''));
          assert.equal(previewHash, exports.at(-1).sourcePixelsSha256, 'Export must match the active preview');
          const bounds = await page.locator('#viewer').evaluate(viewer => {
            const ids = ['viewer-layout-toggle', 'viewer-export-size', 'viewer-download', 'viewer-close', 'viewer-canvas', 'viewer-download-status'];
            return { viewport: { width: innerWidth, height: innerHeight }, items: ids.map(id => { const r = viewer.querySelector('#' + id).getBoundingClientRect(); return { id, left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }) };
          });
          for (const item of bounds.items) {
            assert.ok(item.left >= -1 && item.top >= -1 && item.right <= bounds.viewport.width + 1 && item.bottom <= bounds.viewport.height + 1, JSON.stringify(bounds));
          }
          fullscreen.push({ layout, size, native: nativeAfter, stayedOpen: true, controlsFit: true });
          if (name === 'chromium' && layout === 'rings' && size === 2000 && process.env.GENSOUND_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.GENSOUND_SCREENSHOT_DIR}/gensound-viewer-${width}.png` });
        }
      }
      // Reverse the layout in place and verify the download follows it too.
      await page.locator('[data-viewer-layout="rings"]').click();
      assert.equal(await page.locator('#viewer-export-size').inputValue(), '2000');
      assert.equal(await page.locator('[data-viewer-layout="rings"]').getAttribute('aria-pressed'), 'true');
      const reversed = page.waitForEvent('download');
      await page.locator('#viewer-download').click();
      await verifyDownload('rings', await reversed, 'macleod-hitman', 2000);
      assert.equal(await page.locator('#viewer').isVisible(), true);
      await page.locator('#viewer-close').click();
      await page.locator('#viewer').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#export-size').inputValue(), '2000');
      await page.locator('#export-size').selectOption('500');
      const fallback = [];
      if (name === 'chromium' && width === 1440) {
        // Exercise the CSS viewer when browser/native fullscreen is unavailable.
        await page.locator('#viewer').evaluate(viewer => { viewer.requestFullscreen = () => Promise.reject(new Error('Fullscreen unavailable in this test')); });
        for (const viewport of [{ width: 844, height: 390 }, { width: 320, height: 640 }]) {
          await page.setViewportSize(viewport);
          await page.locator('#export-size').selectOption('500');
          await page.locator('[data-view="rings"]').click();
          await page.locator('#viewer').waitFor({ state: 'visible' });
          assert.equal(await page.evaluate(() => document.fullscreenElement), null);
          await page.evaluate(() => { document.getElementById('rings').toBlob = callback => callback(null); });
          await page.locator('#viewer-download').click();
          await page.locator('#viewer-download-status').filter({ hasText: 'Could not create the PNG' }).waitFor();
          assert.equal(await page.locator('#viewer').isVisible(), true);
          assert.equal(await page.locator('#viewer-download').isEnabled(), true);
          await page.evaluate(() => { delete document.getElementById('rings').toBlob; });
          for (const size of [500, 2000]) {
            const layout = size === 500 ? 'rings' : 'hilbert';
            if (size === 2000) await page.locator('[data-viewer-layout="hilbert"]').click();
            await page.locator('#viewer-export-size').selectOption(String(size));
            const event = page.waitForEvent('download');
            await page.locator('#viewer-download').click();
            await verifyDownload(layout, await event, 'macleod-hitman', size);
            assert.equal(await page.locator('#viewer').isVisible(), true);
          }
          const controlsFit = await page.locator('.viewer-controls').evaluate(controls => [...controls.querySelectorAll('button, select')].every(element => { const r = element.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
          assert.equal(controlsFit, true);
          await page.keyboard.press('Escape');
          await page.locator('#viewer').waitFor({ state: 'hidden' });
          assert.equal(await page.locator('#export-size').inputValue(), '2000');
          fallback.push({ viewport, encodingRecovery: 'passed', bothSizes: 'passed', controlsFit, escapeCloses: true });
        }
        await page.locator('#viewer').evaluate(viewer => { delete viewer.requestFullscreen; });
        await page.setViewportSize({ width, height: 1000 });
        await page.locator('#export-size').selectOption('500');
      }
      let ownAudio = 'not run at this viewport';
      if (width === 1440 && name !== 'webkit') {
        await page.locator('#file').setInputFiles({ name: 'Mélodie 2026 (test).wav', mimeType: 'audio/wav', buffer: toneWav() });
        await page.locator('#upload-status').filter({ hasText: 'Done. Mélodie 2026 (test) was analyzed' }).waitFor({ timeout: 60000 });
        for (const layout of ['rings', 'hilbert']) {
          const info = await save(layout, 'Mélodie 2026 (test)');
          assert.equal(info.metadata.Copyright, undefined);
        }
        ownAudio = 'passed with Unicode filename and both layouts';
      } else if (name === 'webkit') ownAudio = 'deferred: Windows WebKit lacks Web Audio constructors';
      const currentName = await page.evaluate(() => track.name);
      await page.locator('#export-size').selectOption('2000');
      for (const layout of ['rings', 'hilbert']) await save(layout, currentName, 2000);
      await page.locator('#export-size').selectOption('500');
      // Null encoding errors leave the controls usable for another attempt.
      await page.evaluate(() => { document.getElementById('rings').toBlob = callback => callback(null); });
      await page.locator('[data-download="rings"]').click();
      await page.locator('#download-status').filter({ hasText: 'Could not create the PNG' }).waitFor();
      assert.equal(await page.locator('[data-download="rings"]').isEnabled(), true);
      await page.evaluate(() => { delete document.getElementById('rings').toBlob; });
      await save('rings', currentName);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      assert.equal(requests.some(request => request.method !== 'GET'), false, 'No audio or image upload');
      results.push({ browser: name, version: browser.version(), width, exports, defaultExportSize: 2000, repositoryLink: 'passed', pendingRedraw: 'passed', loadingGuard: 'passed', fullscreen, fallback, layoutToggleBothDirections: 'passed', layoutToggleKeyboard: 'passed', sizeSyncBothDirections: 'passed', encodingFailureRecovery: 'passed', ownAudio, overflow: false, errors, requestsOtherThanGet: 0 });
      console.log(`${name} ${width}: ${exports.length} PNG exports passed`);
      await context.close();
    }
  } finally { await browser.close(); }
}
const report = { verifiedAt: new Date().toISOString(), url, htmlOverride: process.env.GENSOUND_TEST_HTML || null, status: 'passed', results, limitations: ['Physical phones and actual Safari are not covered.', 'Windows WebKit cannot decode visitor audio; its exports use precomputed example tracks.'] };
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2) + '\n');
