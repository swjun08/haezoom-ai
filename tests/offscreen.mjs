import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdtemp, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const temp = await mkdtemp(resolve(tmpdir(), 'haezoom-processor-'));
const extension = resolve(temp, 'extension'); await cp(resolve('extension'), extension, { recursive: true });
const manifestFile = resolve(extension, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
manifest.host_permissions.push('https://school.example/*');
await writeFile(manifestFile, JSON.stringify(manifest));
// Real runtime/offscreen lifecycle; only the expensive OCR engine is replaced.
await writeFile(resolve(extension, 'ocr.mjs'), 'export async function extractText(file) { if (file.type !== "image/png") throw new Error(); await new Promise(resolve => setTimeout(resolve, 100)); return "신청서를 제출해 주세요."; }');
const context = await chromium.launchPersistentContext(resolve(temp, 'profile'), { headless: true, channel: 'chromium', args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const settings = await context.newPage(); await settings.goto(`chrome-extension://${extensionId}/workspace.html`);
  const site = await context.newPage();
  await site.route('https://school.example/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>공지</title><p>11월 12일까지 신청서 제출</p>' }));
  await site.goto('https://school.example/notice');
  const tabCount = context.pages().length;
  const result = await settings.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://school.example/*' });
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=';
    return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async image => {
      const valid = await chrome.runtime.sendMessage({ type: 'readCapture', payload: { image } });
      const invalid = await chrome.runtime.sendMessage({ type: 'readCapture', payload: { image: 'https://external.example/image.png' } });
      const concurrent = await Promise.all([1, 2].map(() => chrome.runtime.sendMessage({ type: 'readCapture', payload: { image } })));
      return { valid, invalid, concurrent };
    }, args: [image] }))[0].result;
  });
  assert.deepEqual(result.valid, { ok: true, data: '신청서를 제출해 주세요.' });
  assert.equal(result.invalid.ok, false);
  assert.equal(result.concurrent.filter(result => result.ok).length, 1);
  assert.match(result.concurrent.find(result => !result.ok).error, /다른 캡쳐/);
  assert.equal(context.pages().length, tabCount, 'OCR does not open a tab');
  assert.equal((await settings.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }))).length, 0, 'processor closes after completion');
  assert.equal(Object.keys(await settings.evaluate(() => chrome.storage.session.get(null))).some(key => key.startsWith('capture-')), false);
  console.log('PASS: actual content runtime → background → offscreen → reply, invalid input rejection, concurrent OCR rejection, no new tab/session image, processor cleanup. OCR engine is mocked.');
} finally { await context.close(); }
