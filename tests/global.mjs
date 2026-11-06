import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdtemp, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const temp = await mkdtemp(resolve(tmpdir(), 'haezoom-global-'));
const extension = resolve(temp, 'extension'); await cp(resolve('extension'), extension, { recursive: true });
const manifestFile = resolve(extension, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
manifest.host_permissions.push('https://*/*', 'http://*/*');
await writeFile(manifestFile, JSON.stringify(manifest));
const context = await chromium.launchPersistentContext(resolve(temp, 'profile'), { headless: true, channel: 'chromium', args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const settings = await context.newPage(); await settings.goto(`chrome-extension://${extensionId}/workspace.html`);
  const result = await settings.evaluate(() => chrome.runtime.sendMessage({ type: 'enableGlobal' }));
  assert.equal(result.ok, true); assert.equal(result.data, true);
  for (const origin of ['https://school.example', 'http://notice.example']) {
    const page = await context.newPage();
    await page.route(`${origin}/**`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>공지</title><h1>학교 공지</h1><p>11월 12일까지 신청서를 제출해 주세요.</p>' }));
    await page.goto(`${origin}/notice`);
    await page.locator('[data-haezoom-launcher]').waitFor({ state: 'visible' });
  }
  const scripts = await settings.evaluate(() => chrome.scripting.getRegisteredContentScripts({ ids: ['hz-global'] }));
  assert.deepEqual([...scripts[0].matches].sort(), ['http://*/*', 'https://*/*']);
  const notice = context.pages().find(page => page.url().startsWith('https://school.example/'));
  const tabCount = context.pages().length;
  const selected = await settings.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://school.example/*' });
    return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => chrome.runtime.sendMessage({ type: 'selection', payload: { text: '11월 12일까지 신청서를 제출해 주세요.' } }) }))[0].result;
  });
  assert.equal(selected.ok, true);
  await notice.locator('[data-haezoom-review]').waitFor({ state: 'visible' });
  assert.equal(context.pages().length, tabCount, 'selection opens on the original page');
  assert.equal(notice.frames().length, 1, 'selection review has no iframe');
  const cdp = await context.newCDPSession(notice);
  const tree = (await cdp.send('Accessibility.getFullAXTree')).nodes;
  const text = tree.find(node => node.role?.value === 'textbox' && node.name?.value === '읽어온 내용' && !node.ignored);
  assert.equal(text.value.value, '11월 12일까지 신청서를 제출해 주세요.');
  await notice.keyboard.press('Escape');
  assert.equal(await notice.locator('[data-haezoom-review]').count(), 0);
  await worker.evaluate(() => { chrome.permissions.remove = async () => true; });
  assert.equal((await settings.evaluate(() => chrome.runtime.sendMessage({ type: 'disableGlobal' }))).ok, true);
  assert.equal((await settings.evaluate(() => chrome.scripting.getRegisteredContentScripts({ ids: ['hz-global'] }))).length, 0);
  for (const page of context.pages().filter(page => /\.example\//.test(page.url()))) assert.equal(await page.locator('[data-haezoom-launcher]').count(), 0);
  console.log('PASS: real global registration automatically injects on HTTP + HTTPS and disable removes scripts and visible helpers. Test-only copied manifest pregrants origins; permission removal is mocked because fixture permissions are mandatory; native approval/revocation UI not tested.');
} finally { await context.close(); }
