import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { crc32 } from 'node:zlib';

const require = createRequire(import.meta.url);
const browsers = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const url = process.argv[2];
if (!url) throw new Error('Usage: node tests/download-browser.mjs <lab-url> [report.json]');
const results = [];

function pngInfo(bytes) {
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
  assert.equal(bytes.readUInt32BE(16), 500); assert.equal(bytes.readUInt32BE(20), 500);
  return { width: 500, height: 500, metadata };
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
      const verifyDownload = async (layout, download, expectedName) => {
        assert.equal(await download.failure(), null);
        assert.match(download.suggestedFilename(), /^gensound-[a-z0-9-]+-(rings|hilbert)\.png$/);
        assert.ok(download.suggestedFilename().endsWith(`-${layout}.png`));
        const bytes = await readFile(await download.path()), info = pngInfo(bytes);
        const description = JSON.parse(info.metadata.Description);
        assert.equal(description.track, expectedName); assert.equal(description.layout, layout);
        assert.equal(info.metadata.Title, `${expectedName} — ${layout === 'rings' ? 'Rings' : 'Hilbert'}`);
        const hashes = await page.evaluate(async ({ b64, layout }) => {
          const hex = async data => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), value => value.toString(16).padStart(2, '0')).join('');
          const image = new Image(); image.src = 'data:image/png;base64,' + b64; await image.decode();
          const decoded = document.createElement('canvas'); decoded.width = image.naturalWidth; decoded.height = image.naturalHeight;
          decoded.getContext('2d').drawImage(image, 0, 0);
          return { exported: await hex(decoded.getContext('2d').getImageData(0, 0, 500, 500).data), displayed: await hex(document.getElementById(layout).getContext('2d').getImageData(0, 0, 500, 500).data) };
        }, { b64: bytes.toString('base64'), layout });
        assert.equal(hashes.exported, hashes.displayed, 'PNG must match displayed canvas pixels');
        assert.equal(await page.locator(`[data-download="${layout}"]`).isEnabled(), true);
        exports.push({ filename: download.suggestedFilename(), bytes: bytes.length, layout, width: info.width, height: info.height, pixelsSha256: hashes.exported, metadata: info.metadata });
        return info;
      };
      const save = async (layout, track) => {
        const event = page.waitForEvent('download');
        await page.getByRole('button', { name: `Download ${layout === 'rings' ? 'Rings' : 'Hilbert'} artwork as PNG`, exact: true }).click();
        return verifyDownload(layout, await event, track);
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
      await page.locator('[data-view="rings"]').click();
      await page.locator('#viewer').waitFor({ state: 'visible' });
      await page.locator('#viewer-close').click();
      await page.locator('#viewer').waitFor({ state: 'hidden' });
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
      // Null encoding errors leave the controls usable for another attempt.
      await page.evaluate(() => { document.getElementById('rings').toBlob = callback => callback(null); });
      await page.locator('[data-download="rings"]').click();
      await page.locator('#download-status').filter({ hasText: 'Could not create the PNG' }).waitFor();
      assert.equal(await page.locator('[data-download="rings"]').isEnabled(), true);
      await page.evaluate(() => { delete document.getElementById('rings').toBlob; });
      const currentName = await page.evaluate(() => track.name);
      await save('rings', currentName);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      assert.equal(requests.some(request => request.method !== 'GET'), false, 'No audio or image upload');
      results.push({ browser: name, version: browser.version(), width, exports, pendingRedraw: 'passed', loadingGuard: 'passed', fullscreen: 'passed', encodingFailureRecovery: 'passed', ownAudio, overflow: false, errors, requestsOtherThanGet: 0 });
      console.log(`${name} ${width}: ${exports.length} PNG exports passed`);
      await context.close();
    }
  } finally { await browser.close(); }
}
const report = { verifiedAt: new Date().toISOString(), url, htmlOverride: process.env.GENSOUND_TEST_HTML || null, status: 'passed', results, limitations: ['Physical phones and actual Safari are not covered.', 'Windows WebKit cannot decode visitor audio; its exports use precomputed example tracks.'] };
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2) + '\n');
