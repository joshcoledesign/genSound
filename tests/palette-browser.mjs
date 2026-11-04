import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const browsers = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const url = process.argv[2];
if (!url) throw new Error('Usage: node tests/palette-browser.mjs <lab-url> [report.json]');
const results = [];

for (const name of (process.env.GENSOUND_TEST_BROWSERS || 'chromium,firefox,webkit').split(',')) {
  const browser = await browsers[name].launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      // Optional source-page substitution keeps the real example data while
      // checking an unpublished HTML change without starting a local server.
      if (process.env.GENSOUND_TEST_HTML) await context.route(url, route => route.fulfill({ path: process.env.GENSOUND_TEST_HTML, contentType: 'text/html' }));
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url);
      await page.locator('#stats').filter({ hasText: '250,000 windows' }).waitFor();
      const waitForSettings = async (size, hue) => page.waitForFunction(({ size, hue }) => {
        const out = JSON.parse(document.getElementById('settings-json').textContent || '{}');
        return out.palette?.length === size && out.hue?.picked_by === hue;
      }, { size, hue });
      const reset = async () => {
        await page.locator('#presets button').first().click();
        await waitForSettings(3, 'gensound');
      };
      await reset();
      const sizes = [];
      for (let size = 3; size <= 12; size++) {
        if (size > 3) await page.locator('#add-stop').click();
        await waitForSettings(size, size === 3 ? 'gensound' : 'note');
        assert.equal(await page.locator('#hue-source').inputValue(), size === 3 ? 'gensound' : 'note');
        // Use distinct palette hues and remove intentional shading to count
        // actual canvas output, including both spatial layouts.
        await page.locator('#wheel').click();
        await page.locator('#sat-source').selectOption('palette');
        await page.locator('#light-source').selectOption('palette');
        await page.waitForFunction(size => {
          const count = id => {
            const canvas = document.getElementById(id), colors = new Set();
            const pixels = canvas.getContext('2d').getImageData(0, 0, 500, 500).data;
            for (let i = 0; i < pixels.length; i += 4) if (pixels[i] || pixels[i + 1] || pixels[i + 2]) colors.add(pixels[i] * 65536 + pixels[i + 1] * 256 + pixels[i + 2]);
            return colors.size;
          };
          return count('rings') === size && count('hilbert') === size;
        }, size);
        sizes.push({ paletteSize: size, renderedColors: size });
      }
      await page.locator('#add-stop').click();
      assert.equal(await page.locator('#stops input').count(), 12);
      await page.reload();
      await page.locator('#stats').filter({ hasText: '250,000 windows' }).waitFor();
      await waitForSettings(12, 'note');
      await page.locator('#stops .stop').nth(11).hover();
      await page.locator('[data-remove="11"]').click();
      await waitForSettings(11, 'note');
      // Blend, legend and explicit alternate sources still follow the controls.
      await page.locator('#blend-smooth').click();
      assert.equal(await page.locator('#blend-smooth').getAttribute('aria-pressed'), 'true');
      assert.match(await page.locator('#key-title').innerText(), /Note name/);
      await reset();
      await page.locator('#hue-source').selectOption('time');
      await page.locator('#add-stop').click();
      await waitForSettings(4, 'time');
      await reset();
      await page.locator('#add-stop').click();
      await waitForSettings(4, 'note');
      // A deliberate three-group selection is retained after the fix.
      await page.locator('#hue-source').selectOption('gensound');
      await waitForSettings(4, 'gensound');
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('gensound-lab-settings')).paletteMappingVersion === 1 && JSON.parse(localStorage.getItem('gensound-lab-settings')).hue === 'gensound');
      await page.reload();
      await page.locator('#stats').filter({ hasText: '250,000 windows' }).waitFor();
      await waitForSettings(4, 'gensound');
      // Simulate an affected visitor's existing, unversioned saved palette.
      await page.evaluate(() => {
        const old = JSON.parse(localStorage.getItem('gensound-lab-settings'));
        delete old.paletteMappingVersion;
        localStorage.setItem('gensound-lab-settings', JSON.stringify(old));
      });
      await page.reload();
      await page.locator('#stats').filter({ hasText: '250,000 windows' }).waitFor();
      await waitForSettings(4, 'note');
      assert.equal(await page.locator('#hue-source').inputValue(), 'note');
      // Preset reset retains the original three-color treatment.
      await reset();
      const palette = () => page.locator('#stops input');
      await palette().first().fill('#112233');
      await page.locator('[data-view="rings"]').click();
      await page.locator('#viewer').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#viewer #palette-controls').count(), 1);
      assert.equal(await palette().first().inputValue(), '#112233');
      const assertPreview = async layout => page.waitForFunction(layout => {
        const pixels = id => document.getElementById(id).getContext('2d').getImageData(0, 0, 500, 500).data;
        const a = pixels('viewer-canvas'), b = pixels(layout);
        return a.every((value, i) => value === b[i]);
      }, layout);
      await palette().first().fill('#ff6600');
      await page.locator('#add-stop').press('Enter');
      await waitForSettings(4, 'note');
      await page.locator('#wheel').click();
      assert.notEqual(await palette().nth(1).inputValue(), '#17edfc');
      await page.locator('#blend-smooth').click();
      assert.equal(await page.locator('#blend-smooth').getAttribute('aria-pressed'), 'true');
      await assertPreview('rings');
      await page.locator('[data-viewer-layout="hilbert"]').click();
      await assertPreview('hilbert');
      for (let size = 5; size <= 12; size++) await page.locator('#add-stop').click();
      await page.locator('#add-stop').click();
      assert.equal(await palette().count(), 12);
      for (let size = 12; size > 1; size--) await page.locator('#viewer [data-remove]').last().click();
      assert.equal(await palette().count(), 1);
      assert.equal(await page.locator('#viewer [data-remove]').count(), 0);
      await page.locator('#blend-hard').click();
      const finalColor = '#2244cc';
      await palette().first().fill(finalColor);
      await page.waitForFunction(color => JSON.parse(localStorage.getItem('gensound-lab-settings')).palette[0] === color, finalColor);
      await assertPreview('hilbert');
      await page.locator('#viewer-close').click();
      assert.equal(await page.locator('.rail #palette-controls').count(), 1);
      assert.equal(await palette().first().inputValue(), finalColor);
      await palette().first().fill('#33aa77');
      await page.locator('[data-view="hilbert"]').click();
      assert.equal(await palette().first().inputValue(), '#33aa77');
      await assertPreview('hilbert');
      await page.keyboard.press('Escape');
      await page.locator('#viewer').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.rail #palette-controls').count(), 1);
      assert.equal(await page.locator('#palette-controls').count(), 1);
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('gensound-lab-settings')).palette[0] === '#33aa77');
      await page.reload();
      await page.locator('#stats').filter({ hasText: '250,000 windows' }).waitFor();
      assert.equal(await palette().first().inputValue(), '#33aa77');
      assert.deepEqual(errors, []);
      results.push({ browser: name, version: browser.version(), width, sizes, bothLayouts: 'passed', addedColorCap: 'passed', persistence: 'passed', removal: 'passed', blendAndLegend: 'passed', alternateHueSource: 'passed', explicitGroupsPersistence: 'passed', legacySettingsMigration: 'passed', originalPreset: 'passed', viewerPalette: 'passed', viewerPreviewBothLayouts: 'passed', viewerAddRemoveBounds: 'passed', viewerKeyboard: 'passed', viewerMainSync: 'passed', viewerPersistence: 'passed', errors });
      console.log(`${name} ${width}: palette regression passed`);
      await context.close();
    }
  } finally { await browser.close(); }
}
const report = { verifiedAt: new Date().toISOString(), url, htmlOverride: process.env.GENSOUND_TEST_HTML || null, status: 'passed', results, limitations: ['Note-based mappings can omit colors when their assigned notes are absent from a track.', 'These are desktop engines at phone widths, not physical-phone or actual Safari tests.'] };
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2) + '\n');
