// 부스 시연 사이트(booth/) 기본 흐름 검사: 첫 화면 → 체험 시작 → 단계 이동, 오류 없음 (AI 응답은 모의)
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, normalize } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = resolve('booth');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.pdf': 'application/pdf' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '') || 'index.html';
  const file = resolve(root, path);
  try {
    if (!file.startsWith(root)) throw new Error('outside');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const mockResult = {
  summary: '가정통신문 요약',
  tasks: [{ title: '참가 동의서 제출', deadline: '2026-12-04', action: '제출', materials: [], cost: null, submission: '담임', evidence: '12월 4일까지', needs_review: false }],
  schedules: [{ title: '학부모 설명회', date: '2026-12-10', time: '오후 6시', location: '시청각실', details: '설명회', evidence: '12월 10일', needs_review: false }],
};

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route('https://haezoom.sleepwhale.workers.dev/**', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(route.request().url().endsWith('/api/status') ? { configured: true } : { result: mockResult }) }),
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(base);
  await page.locator('#startBtn').waitFor();
  await page.click('#startBtn');
  await page.locator('#shell').waitFor({ state: 'visible' });
  await page.locator('#coach').waitFor({ state: 'visible' });
  assert.ok((await page.locator('#coachTitle').innerText()).trim().length > 0, '단계 안내 팝업 제목');

  for (const step of [2, 4, 5]) {
    await page.goto(`${base}#${step}`);
    await page.reload();
    await page.locator('#shell').waitFor({ state: 'visible' });
  }
  assert.ok((await page.locator('#lib li').count()) > 0, '직접 해보기 자료 목록');
  assert.deepEqual(errors, []);
  console.log('PASS: booth site loads, starts the guided flow and opens steps 2·4·5 without page errors.');
} finally {
  await browser.close();
  server.close();
}
