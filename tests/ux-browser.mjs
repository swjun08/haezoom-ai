// 기본 사용성 점검: 창 닫기(Esc·바깥·×), 메뉴 닫기, 삭제·완료 실행 취소, 엔터로 추가, 검색 결과 없음, 페이지 안 결과 창 닫기
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdtemp, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const temp = await mkdtemp(resolve(tmpdir(), 'haezoom-ux-'));
const extension = resolve(temp, 'extension');
await cp(resolve('extension'), extension, { recursive: true });
const manifest = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'));
manifest.host_permissions.push('https://school.example/*');
await writeFile(resolve(extension, 'manifest.json'), JSON.stringify(manifest));
const context = await chromium.launchPersistentContext(resolve(temp, 'profile'), {
  headless: true,
  channel: 'chromium',
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  viewport: { width: 1440, height: 900 },
});
const open = (page, id) => page.locator('#' + id).evaluate(d => d.open);
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`chrome-extension://${id}/workspace.html#tasks`);
  await page.evaluate(async () => {
    const base = { completed: false, revision: 1, notes: '', confirmed: true, needs_review: false, source: { title: '알림장' }, materials: [], cost: null };
    await chrome.storage.local.set({
      haezoomItems: [
        { ...base, id: '11111111-1111-4111-8111-111111111111', kind: 'task', title: '신청서 제출', date: '2026-12-01', action: '제출' },
        { ...base, id: '22222222-2222-4222-8222-222222222222', kind: 'schedule', title: '학부모 설명회', date: '2026-12-03', time: '18:00', details: '설명회' },
      ],
    });
  });
  await page.reload();
  const row = page.locator('#task-list .task-card', { hasText: '신청서 제출' });

  // 1. 상세 창: 줄 클릭으로 열기 → Esc / × / 바깥 클릭으로 닫기
  await row.locator('h3').click();
  assert.equal(await open(page, 'item-dialog'), true, '줄을 누르면 상세가 열림');
  await page.keyboard.press('Escape');
  assert.equal(await open(page, 'item-dialog'), false, 'Esc로 닫힘');
  await row.locator('h3').click();
  await page.click('#close-item');
  assert.equal(await open(page, 'item-dialog'), false, '×로 닫힘');
  await row.locator('h3').click();
  await page.mouse.click(8, 8);
  assert.equal(await open(page, 'item-dialog'), false, '바깥을 누르면 닫힘');

  // 2. 직접 추가: 바깥 클릭·Esc로 닫힘, 엔터로 추가
  await page.click('#new-item');
  await page.mouse.click(8, 8);
  assert.equal(await open(page, 'manual-dialog'), false);
  await page.click('#new-item');
  await page.keyboard.press('Escape');
  assert.equal(await open(page, 'manual-dialog'), false);
  await page.click('#new-item');
  await page.locator('#manual-title').fill('준비물 사기');
  await page.locator('#manual-title').press('Enter');
  await page.locator('#task-list .task-card', { hasText: '준비물 사기' }).waitFor();
  assert.equal(await open(page, 'manual-dialog'), false, '추가하면 창이 닫힘');

  // 3. 삭제는 확인 창 없이 바로, 실행 취소로 되돌리기
  await row.locator('h3').click();
  await page.locator('#item-dialog').getByRole('button', { name: '삭제', exact: true }).click();
  assert.equal(await open(page, 'confirm-dialog'), false, '삭제에 확인 창이 뜨지 않음');
  await page.locator('#undo-toast').waitFor({ state: 'visible' });
  assert.equal(await row.count(), 0);
  await page.click('#undo-action');
  await row.waitFor();

  // 4. 완료도 실행 취소
  await row.getByRole('button', { name: '완료 표시' }).click();
  await page.locator('#undo-toast').waitFor({ state: 'visible' });
  await page.click('#undo-action');
  await page.waitForFunction(async () => !(await chrome.storage.local.get('haezoomItems')).haezoomItems.find(x => x.id === '11111111-1111-4111-8111-111111111111').completed);

  // 5. 검색 결과 없음 안내
  await page.locator('#search').fill('없는제목');
  assert.match(await page.locator('#task-list .empty h3').textContent(), /검색 결과가 없어요/);
  await page.locator('#search').fill('');

  // 6. 캘린더 내보내기 메뉴: Esc·바깥 클릭으로 닫힘
  await page.goto(`chrome-extension://${id}/workspace.html#calendar`);
  await page.click('#export-menu summary');
  assert.equal(await page.locator('#export-menu').evaluate(d => d.open), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#export-menu').evaluate(d => d.open), false, 'Esc로 메뉴 닫힘');
  await page.click('#export-menu summary');
  await page.mouse.click(700, 500);
  assert.equal(await page.locator('#export-menu').evaluate(d => d.open), false, '바깥을 누르면 메뉴 닫힘');

  // 7. 웹페이지 안 확인 창: 바깥 클릭·Esc로 닫힘
  const site = await context.newPage();
  await site.route('https://school.example/**', route =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>공지</title><p>12월 1일까지 신청서 제출</p>' }),
  );
  await site.goto('https://school.example/notice');
  const show = () =>
    worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'https://school.example/*' });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['date-hints.js', 'review.js'] });
      await chrome.tabs.sendMessage(tab.id, { type: 'showSelectionReview', payload: { text: '12월 1일까지 신청서 제출' } });
    });
  await show();
  await site.locator('[data-haezoom-review]').waitFor({ state: 'attached' });
  await site.mouse.click(5, 5);
  await site.locator('[data-haezoom-review]').waitFor({ state: 'detached' });
  await show();
  await site.locator('[data-haezoom-review]').waitFor({ state: 'attached' });
  await site.keyboard.press('Escape');
  await site.locator('[data-haezoom-review]').waitFor({ state: 'detached' });

  assert.deepEqual(errors, []);
  console.log('PASS: dialogs close by Esc/×/outside click, Enter adds, delete and complete can be undone, empty search, export menu and in-page review close properly.');
} finally {
  await context.close();
}
