// 3.1 기능 브라우저 검사: 캘린더 파일 내려받기, 애매한 날짜 후보로 확정하기 (실제 확장·저장, AI 없음)
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const extension = resolve('extension');
const context = await chromium.launchPersistentContext(await mkdtemp(resolve(tmpdir(), 'haezoom-31-')), {
  headless: true,
  channel: 'chromium',
  acceptDownloads: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  viewport: { width: 1440, height: 900 },
});
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`chrome-extension://${id}/workspace.html#calendar`);
  assert.equal(await page.locator('#export-ics').isDisabled(), true, '저장한 항목이 없으면 비활성');

  await page.evaluate(async () => {
    const base = {
      completed: false,
      revision: 1,
      createdAt: '2026-11-24T00:30:00Z',
      notes: '',
      source: { title: '학급 공지' },
    };
    await chrome.storage.local.set({
      haezoomItems: [
        {
          ...base,
          id: crypto.randomUUID(),
          kind: 'task',
          title: '참가 동의서 제출',
          date: '2026-11-27',
          confirmed: true,
          needs_review: false,
          action: '제출',
          materials: [],
          cost: null,
          submission: '담임',
          evidence: '11월 27일까지 제출',
        },
        {
          ...base,
          id: crypto.randomUUID(),
          kind: 'schedule',
          title: '학부모 설명회',
          date: '2026-12-04',
          time: '오후 6시',
          location: '시청각실',
          confirmed: true,
          needs_review: false,
          details: '설명회',
          evidence: '12월 4일 오후 6시',
        },
        {
          ...base,
          id: crypto.randomUUID(),
          kind: 'task',
          title: '상담 신청서 제출',
          date: '다음 주 금요일',
          originalDate: '다음 주 금요일',
          confirmed: false,
          needs_review: true,
          action: '신청서 제출',
          materials: [],
          cost: null,
          submission: '담임',
          evidence: '다음 주 금요일까지 제출',
        },
      ],
    });
  });
  await page.reload();
  await page.click('#export-menu summary');
  await page.locator('#export-ics').filter({ hasText: '· 2' }).waitFor();
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-ics')]);
  const ics = await readFile(await download.path(), 'utf8');
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2, '확인한 항목 2개만 담김');
  assert.match(ics.replace(/\r\n /g, ''), /DTSTART:20261204T090000Z/);

  await page.goto(`chrome-extension://${id}/workspace.html#tasks`);
  await page.locator('#status-filter').selectOption('all');
  await page.locator('#task-list .task-card', { hasText: '상담 신청서 제출' }).locator('.open-item').click();
  const dialog = page.locator('#item-dialog');
  const form = dialog.locator('.edit-form:not([hidden])');
  if (!(await form.count())) await dialog.getByRole('button', { name: '날짜·내용 확인' }).click();
  await form.locator('.suggest-chip', { hasText: '12월 4일(금)' }).click();
  assert.equal(await form.locator('input[type=date]').first().inputValue(), '2026-12-04');
  await form.locator('.consent input').first().check();
  await form.getByRole('button', { name: '수정 저장' }).click();
  await page.waitForFunction(async () => {
    const { haezoomItems } = await chrome.storage.local.get('haezoomItems');
    return haezoomItems.some(item => item.title === '상담 신청서 제출' && item.date === '2026-12-04' && item.confirmed);
  });
  // 할 일·일정을 함께 보는 '전체'가 기본, 직접 추가 창에 Google 캘린더 알약
  await page.goto(`chrome-extension://${id}/workspace.html#tasks`);
  await page.locator('#status-filter').selectOption('all');
  assert.equal(await page.locator('#kind-filters [aria-pressed=true]').textContent(), '전체');
  assert.equal(await page.locator('#task-list .task-card').count(), 3, '할 일과 일정이 함께 보임');
  await page.click('#new-item');
  assert.equal(await page.locator('#manual-dialog .gcal-pill').getAttribute('aria-pressed'), 'false');
  await page.mouse.click(10, 10);
  assert.equal(await page.locator('#manual-dialog').evaluate(d => d.open), false, '바깥을 누르면 닫힘');
  assert.deepEqual(errors, []);
  console.log(
    'PASS: .ics download contains only confirmed items with KST times; date hint chip fills and confirms an ambiguous date.',
  );
} finally {
  await context.close();
}
