import { analyzeText, analyzeFile, cropImage, serverStatus } from './api.js';
import { skiNotice, classroomInfo, chatParents, chatClass, chatSoccer, classroomScience, classroomTrip, noticeImages, pdfDoc } from './samples.js';
import { renderSource, sourceText, unitsForEvidence } from './sources.js';
import { fromToday, fmt, parseDateish, parseTime, dday, todayKST, addDays, sameDay } from './dates.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const won = n => `${Number(n).toLocaleString('ko-KR')}원`;
const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const state = { step: 0, maxStep: 0, busy: false, items: [], newIds: new Set(), input: null, seq: 0 };

/* ════════════════════ 공통 ════════════════════ */
function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3300);
}

/** 고정 크기로 그린 화면(확장 프로그램 재현)을 무대 크기에 맞춰 줄입니다. */
function fitBox(stage, box, top = 100, bottom = 28) {
  const w = box.offsetWidth, h = box.offsetHeight;
  const H = stage.clientHeight - top - bottom;
  const k = Math.min((stage.clientWidth - 48) / w, H / h, 1.15);
  box.style.top = `${top + H / 2}px`;
  box.style.transform = `translate(-50%, -50%) scale(${k})`;
}

/* ── 안내: 팝업 · 한 줄 안내 · 아래 버튼 ── */
function coach({ step = '', title, body = '', extra = '', top = '', buttons = [] }) {
  $('#coachStep').textContent = step;
  $('#coachTitle').textContent = title;
  $('#coachBody').innerHTML = body;
  $('#coachExtra').innerHTML = extra;
  $('#coachTop').innerHTML = top;
  const box = $('#coachBtns');
  box.innerHTML = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = b.kind === 'link' ? 'link-btn' : `btn btn-${b.kind || 'solid'}`;
    el.textContent = b.label;
    el.onclick = b.on;
    box.append(el);
  }
  $('#coach').hidden = false;
  cue(null); dock(null);
}
const closeCoach = () => { $('#coach').hidden = true; };
function cue(text, extra = '') {
  if (!text) { $('#cue').hidden = true; return; }
  $('#cueText').textContent = text;
  $('#cueExtra').innerHTML = extra;
  const el = $('#cue');
  if (el.hidden || el.dataset.t !== text) { el.hidden = true; void el.offsetWidth; el.hidden = false; }
  el.dataset.t = text;
}
function dock(buttons) {
  const d = $('#dock');
  if (!buttons) { d.hidden = true; return; }
  d.innerHTML = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `btn btn-${b.kind || 'solid'}`;
    el.textContent = b.label;
    el.onclick = b.on;
    d.append(el);
  }
  d.hidden = false;
}

const itemDateText = it => (it.kind === 'task' ? it.deadline : it.date);

function whenLabel(it) {
  const raw = itemDateText(it);
  const d = parseDateish(raw);
  if (d.start) return { main: `${fmt.md(d.start)}${d.end ? ` ~ ${fmt.md(d.end)}` : ''}`, sub: dday(d.start), review: false, date: d };
  if (d.yearMissing) return { main: raw, sub: '연도 확인 필요', review: true, date: d };
  if (raw) return { main: raw, sub: '날짜 확인 필요', review: true, date: d };
  return { main: '날짜 없음', sub: '', review: false, date: d };
}

function storeAdd(list, sourceLabel) {
  const ids = [];
  for (const it of list) {
    if (state.items.some(x => x.title === it.title && x.dateText === itemDateText(it))) continue;
    const d = parseDateish(itemDateText(it));
    const id = crypto.randomUUID?.() || String(Math.random());
    state.items.push({
      id, kind: it.kind, title: it.title, dateText: itemDateText(it), start: d.start, end: d.end,
      yearMissing: d.yearMissing, guess: d.guess, time: it.kind === 'schedule' ? parseTime(it.time) : null,
      timeText: it.time || null, location: it.location || null, source: sourceLabel,
      review: !d.start, detail: it.kind === 'task' ? it.action : it.details,
    });
    ids.push(id);
  }
  ids.forEach(id => state.newIds.add(id));
  return ids;
}

function reminderList() {
  const now = new Date();
  const out = [];
  const at = (d, h, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
  for (const it of state.items) {
    if (!it.start) continue;
    const label = fmt.md(it.start);
    if (it.kind === 'task') {
      out.push({ when: at(addDays(it.start, -3), 9), head: '3일 남았어요', it, body: `${label}까지` });
      out.push({ when: at(addDays(it.start, -1), 20), head: '내일까지예요', it, body: `${label}까지` });
      out.push({ when: at(it.start, 8), head: '오늘까지예요', it, body: `${label}까지` });
    } else {
      out.push({ when: at(addDays(it.start, -1), 20), head: '내일 일정이 있어요', it, body: `${label}${it.timeText ? ' ' + it.timeText : ''}` });
      if (it.time) out.push({ when: new Date(at(it.start, it.time.h, it.time.m).getTime() - 30 * 60000), head: '30분 뒤 시작해요', it, body: it.location || label });
      else out.push({ when: at(it.start, 8), head: '오늘 일정이 있어요', it, body: label });
    }
  }
  return out.filter(r => r.when > now).sort((a, b) => a.when - b.when);
}

/* ════════════════════ 첫 화면 ════════════════════ */
const hero = { timer: [], running: false, i: 0 };
function heroScenes() {
  const a1 = fromToday(5, { weekday: true }), s1 = fromToday(10, { weekdayIs: 1 }), e1 = addDays(s1, 4);
  const d2 = fromToday(6, { weekday: true }), p2 = fromToday(13, { weekday: true });
  const a3 = fromToday(4, { weekday: true }), t3 = fromToday(12, { weekday: true });
  const w = (d, extra = '') => `${dday(d)} · ${fmt.mdShort(d)}${extra}`;
  return [
    {
      html: `<div class="mini mini-chat"><div class="mini-room">3학년 2반 학부모방 · 26</div><small>담임 김수연</small>
        <div class="mb">2학기 학부모 상담 안내드립니다. 상담은 <mark>${fmt.md(s1)}부터 ${fmt.md(e1)}까지</mark> 진행하고, 신청은 <mark>${fmt.md(a1)}까지 e알리미 설문</mark>으로 해 주세요.</div>
        <div class="mb me">감사합니다! 신청할게요</div></div>`,
      items: [['task', '학부모 상담 신청', w(a1)], ['schedule', '학부모 상담 주간', `${fmt.mdShort(s1)}~${fmt.mdShort(e1)}`]],
      noti: ['내일까지예요 · 학부모 상담 신청', 'e알리미 설문으로 신청해 주세요', addDays(a1, -1), '20:00'], plan: ['3일 전', '하루 전', '당일'], hit: 1,
    },
    {
      html: `<div class="mini mini-class"><div class="mc-banner">2학년 3반 정보</div><div class="mc-body"><div class="mc-meta">이서윤 선생님 · 과제</div>
        <h5>[수행평가] 생활 속 문제 해결 앱 기획서</h5>
        <p>기획서는 <mark>${fmt.long(d2)} 밤 11시 59분까지</mark> PDF로 제출해 주세요. 분량은 A4 3장 이내입니다.</p>
        <p><mark>${fmt.long(p2)} 2교시</mark>에 모둠별 5분 발표가 있습니다.</p></div></div>`,
      items: [['task', '앱 기획서 PDF 제출', w(d2, ' 23:59')], ['schedule', '모둠별 발표', w(p2, ' 2교시')]],
      noti: ['3일 남았어요 · 앱 기획서 제출', `${fmt.md(d2)} 밤 11시 59분까지`, addDays(d2, -3), '09:00'], plan: ['3일 전', '하루 전', '당일'], hit: 0,
    },
    {
      html: `<div class="mini mini-paper"><div class="mp-head">가정통신문</div><div class="mp-title">현장체험학습 참가 안내</div>
        <p>참가 신청서는 <mark>${fmt.long(a3)}까지</mark> 담임 선생님께 제출해 주세요.</p>
        <p>참가비는 <mark>15,000원</mark>이며, <mark>도시락과 물</mark>을 준비해 주세요.</p>
        <p>체험학습은 <mark>${fmt.long(t3)} 오전 9시</mark>에 학교에서 출발합니다.</p></div>`,
      items: [['task', '참가 신청서 제출', w(a3)], ['task', '참가비 15,000원 · 도시락', ''], ['schedule', '현장체험학습 출발', w(t3, ' 9:00')]],
      noti: ['내일 일정이 있어요 · 현장체험학습', '오전 9시 학교에서 출발해요', addDays(t3, -1), '20:00'], plan: ['하루 전', '30분 전'], hit: 0,
    },
  ];
}

function heroStop() { hero.timer.forEach(clearTimeout); hero.timer = []; hero.running = false; }
function heroAt(ms, fn) { hero.timer.push(setTimeout(fn, ms)); }
function heroRun() {
  heroStop();
  hero.running = true;
  const scenes = heroScenes();
  const cols = $$('#trio .col');
  const src = $('#showSrc'), resPanel = $('.panel-res'), list = $('#showList'), noti = $('#showNoti'), plan = $('#notiPlan');
  const play = () => {
    const sc = scenes[hero.i % scenes.length];
    cols.forEach(c => c.classList.remove('on', 'done'));
    src.innerHTML = sc.html;
    list.innerHTML = sc.items.map(([k, t, wtxt]) => `<li><span class="kind ${k}">${k === 'task' ? '할 일' : '일정'}</span><b>${esc(t)}</b>${wtxt ? `<em>${esc(wtxt)}</em>` : ''}</li>`).join('');
    $('#showCount').textContent = `${sc.items.length}개`;
    $('#notiTitle').textContent = sc.noti[0];
    $('#notiBody').textContent = sc.noti[1];
    $('#notiWhen').textContent = `${fmt.mdShort(sc.noti[2])} ${sc.noti[3]}`;
    plan.innerHTML = sc.plan.map((p, k) => `<li data-k="${k}">${p}</li>`).join('');
    if (reduced) {
      cols.forEach(c => c.classList.add('done'));
      cols[2].classList.replace('done', 'on');
      $$('mark', src).forEach(m => m.classList.add('on'));
      $$('li', list).forEach(li => li.classList.add('in'));
      noti.classList.add('in'); plan.children[sc.hit]?.classList.add('hit');
      return;
    }
    noti.classList.remove('in');
    [src, resPanel].forEach(p => p.classList.remove('blank'));
    heroAt(60, () => cols[0].classList.add('on'));
    heroAt(600, () => $$('mark', src).forEach((m, k) => heroAt(k * 300, () => m.classList.add('on'))));
    heroAt(2300, () => {
      cols[0].classList.replace('on', 'done'); cols[1].classList.add('on');
      $$('li', list).forEach((li, k) => heroAt(250 + k * 320, () => li.classList.add('in')));
    });
    heroAt(4800, () => {
      cols[1].classList.replace('on', 'done'); cols[2].classList.add('on');
      heroAt(250, () => noti.classList.add('in'));
      heroAt(700, () => plan.children[sc.hit]?.classList.add('hit'));
    });
    heroAt(8000, () => { [src, resPanel].forEach(p => p.classList.add('blank')); noti.classList.remove('in'); cols.forEach(c => c.classList.remove('on', 'done')); });
    heroAt(8700, () => { hero.i++; play(); });
  };
  play();
}

/* ════════════════════ 화면 전환 ════════════════════ */
const enter = {};
const NAV = { 1: 1, 2: 2, 4: 3, 5: 4 };
function go(n) {
  n = Number(n);
  if (n === state.step) return;
  const prev = state.step;
  state.step = n;
  closeCoach(); cue(null); dock(null);
  document.documentElement.classList.toggle('guided', n !== 5);
  if (n === 0) {
    $('#home').hidden = false;
    requestAnimationFrame(() => $('#home').classList.remove('leaving'));
    $('#shell').hidden = true;
    heroRun();
    return;
  }
  if (prev === 0) {
    heroStop();
    $('#home').classList.add('leaving');
    setTimeout(() => { if (state.step) $('#home').hidden = true; }, 500);
    $('#shell').hidden = false;
  }
  state.maxStep = Math.max(state.maxStep, NAV[n]);
  $$('.view').forEach(v => {
    const s = Number(v.dataset.step);
    v.classList.toggle('active', s === n);
    v.classList.toggle('back', s < n);
  });
  $$('#steps button').forEach(b => {
    const k = Number(b.dataset.n);
    if (k === NAV[n]) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    b.classList.toggle('done', k < state.maxStep && k !== NAV[n]);
  });
  requestAnimationFrame(() => enter[n]?.(prev));
}
window.addEventListener('resize', () => { if (state.step === 1) s1Fit(); });

/* ════════════════════ 1. 찾아보기 ════════════════════ */
const s1 = { src: null, root: null, phase: 'ready', found: new Set(), ai: null, timer: null, left: 25 };
function s1StartAI() {
  if (s1.ai && !s1.ai.error) return;
  s1.ai = { promise: null, result: null, ms: 0, error: null };
  s1.ai.promise = analyzeText(sourceText(s1.src))
    .then(r => { s1.ai.result = r.result; s1.ai.ms = r.ms; })
    .catch(e => { s1.ai.error = e; });
}
function s1Fit() {
  if (!s1.root) return;
  const stage = $('#s1Stage');
  s1.root.style.zoom = 1;
  s1.root.style.zoom = Math.min(1.2, (stage.clientWidth - 80) / $('.paper', s1.root).offsetWidth);
}
const s1Cue = () => cue('챙겨야 할 문장을 눌러 보세요', `<span class="${s1.left <= 5 ? 'low' : ''}">${Math.ceil(s1.left)}초</span> · ${s1.found.size}/6`);
enter[1] = () => {
  if (!s1.root) {
    s1.src = skiNotice();
    s1.root = renderSource(s1.src);
    $('#s1Stage').append(s1.root);
    s1StartAI();
    s1.root.addEventListener('click', e => {
      if (s1.phase !== 'play') return;
      const u = e.target.closest('.u');
      if (!u) return;
      const key = u.dataset.t;
      if (key && !s1.found.has(key)) {
        s1.found.add(key);
        u.classList.add('found');
        s1Cue();
        if (s1.found.size === s1.src.targets.length) s1End();
      } else if (!key) {
        u.classList.remove('nope'); void u.offsetWidth; u.classList.add('nope');
      }
    });
  }
  s1Fit();
  if (s1.phase === 'ready') s1Intro();
  else if (s1.phase === 'reveal') s1Review();
  else if (s1.phase === 'over') s1Result();
};
function s1Intro() {
  coach({
    step: '1 / 4 · 찾아보기',
    title: '먼저 직접 찾아보세요',
    body: '이 통신문에서 꼭 챙겨야 할 문장 6개를<br>25초 안에 찾아 눌러 보세요.',
    buttons: [{ label: '시작하기', on: s1Start }, { label: '건너뛰기', kind: 'link', on: () => go(2) }],
  });
}
function s1Start() {
  closeCoach();
  s1.phase = 'play';
  s1.root.classList.add('playing');
  const t0 = Date.now();
  s1.left = 25;
  s1Cue();
  s1.timer = setInterval(() => {
    s1.left = Math.max(0, 25 - (Date.now() - t0) / 1000);
    s1Cue();
    if (s1.left <= 0) s1End();
  }, 250);
}
function s1End() {
  clearInterval(s1.timer);
  if (s1.phase !== 'play') return;
  s1.phase = 'over';
  s1.root.classList.remove('playing');
  cue(null);
  s1Result();
}
async function s1Result() {
  const n = s1.found.size;
  if (!s1.ai.result) {
    coach({
      step: '1 / 4 · 찾아보기', title: n === 6 ? '6개 모두 찾았어요!' : `6개 중 ${n}개 찾았어요`,
      extra: '<p class="coach-wait"><span class="spin"></span>해줌이 같은 통신문을 읽는 중…</p>',
    });
    await s1.ai.promise;
    if (state.step !== 1) return;
  }
  if (s1.ai.error) {
    coach({
      step: '1 / 4 · 찾아보기', title: 'AI 연결이 잠깐 안 돼요', body: esc(s1.ai.error.message),
      buttons: [{ label: '다시 시도', on: () => { s1.ai = null; s1StartAI(); s1Result(); } }, { label: '다음으로', kind: 'link', on: () => go(2) }],
    });
    return;
  }
  const { result, ms } = s1.ai;
  const all = [...result.tasks, ...result.schedules];
  const evUnits = new Set(all.flatMap(it => unitsForEvidence(s1.root, it.evidence)));
  const aiHit = s1.src.targets.filter(t => evUnits.has($(`[data-t="${t.key}"]`, s1.root))).length;
  const missed = s1.src.targets.filter(t => !s1.found.has(t.key));
  missed.forEach(t => $(`[data-t="${t.key}"]`, s1.root).classList.add('miss'));
  coach({
    step: '1 / 4 · 찾아보기',
    title: missed.length ? `${missed.length}개를 놓쳤어요` : '6개 모두 찾았어요!',
    body: `해줌은 ${(ms / 1000).toFixed(0)}초 만에 ${aiHit === 6 ? '6개를 모두' : `${aiHit}개를`} 찾았어요.`,
    buttons: [{ label: '다음', on: () => go(2) }, ...(missed.length ? [{ label: '놓친 곳 보기', kind: 'link', on: s1Review }] : [])],
  });
}
function s1Review() {
  s1.phase = 'reveal';
  closeCoach();
  cue('노란색이 놓친 문장이에요');
  dock([{ label: '다음', on: () => go(2) }]);
  const first = $('.u.miss', s1.root);
  first?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
}

/* ════════════════════ 2. 맡겨보기: 문장 고르기 ════════════════════ */
const s2 = { src: null, root: null, text: '', intro: false };
enter[2] = () => {
  if (!s2.root) {
    s2.src = classroomInfo();
    s2.root = renderSource(s2.src);
    $('#selBody').append(s2.root);
    setupSelect();
  }
  if (!$('#rvLayer').hidden) return;
  if (!s2.intro) {
    coach({
      step: '2 / 4 · 맡겨보기',
      title: '이번엔 해줌에게 맡겨 보세요',
      body: '수업 공지에서 챙길 문장을 드래그하고<br>옆에 뜨는 ‘해줌으로 정리’를 눌러 보세요.',
      buttons: [{ label: '해 보기', on: () => { s2.intro = true; closeCoach(); s2Cue(); } }],
    });
  } else s2Cue();
};
function s2Cue() {
  if (state.step !== 2 || !$('#coach').hidden) return;
  if ($('#rvLayer').hidden && $('#selAct').hidden) cue('챙길 문장을 드래그해 보세요'); else cue(null);
}
function setupSelect() {
  const body = $('#selBody'), stage = $('#v2'), helper = $('#selAct');
  let t;
  const update = () => {
    if (state.step !== 2 || !$('#rvLayer').hidden) return;
    const sel = getSelection();
    const text = sel && !sel.isCollapsed ? String(sel).trim() : '';
    if (!text || !body.contains(sel.anchorNode)) { helper.hidden = true; s2Cue(); return; }
    s2.text = text;
    const r = sel.getRangeAt(sel.rangeCount - 1).getBoundingClientRect(), st = stage.getBoundingClientRect();
    $('#selCount').textContent = `선택한 문장 · ${text.length.toLocaleString()}자`;
    helper.hidden = false;
    const w = helper.offsetWidth, h = helper.offsetHeight;
    let x = r.left - st.left + r.width / 2 - w / 2, y = r.bottom - st.top + 12;
    if (y + h > st.height - 16) y = r.top - st.top - h - 12;
    helper.style.left = `${Math.max(16, Math.min(st.width - w - 16, x))}px`;
    helper.style.top = `${Math.max(16, y)}px`;
    cue(null);
  };
  document.addEventListener('selectionchange', () => { clearTimeout(t); t = setTimeout(update, 80); });
  body.addEventListener('scroll', () => { if (!helper.hidden) update(); });
  let down = null;
  body.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  body.addEventListener('pointerup', e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
    down = null;
    if (moved) return;
    const u = e.target.closest('.u');
    if (!u) return;
    setTimeout(() => { const range = document.createRange(); range.selectNodeContents(u); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); }, 0);
  });
  $('#selClear').onclick = () => { getSelection().removeAllRanges(); helper.hidden = true; s2Cue(); };
  $('#selGo').onclick = () => {
    const header = `[수업 게시판] ${s2.src.className} · ${s2.src.teacher} · 게시일 ${s2.src.posted}\n`;
    helper.hidden = true;
    startInput({ type: 'text', label: '선택한 문장', src: s2.src, text: header + s2.text, shown: s2.text });
  };
}

/* ════════════════════ 3단계: 확장 프로그램 결과 창 ════════════════════ */
const s3 = { run: null, tab: 'res', phase: 'loading', r: null, items: [], checked: new Set(), sel: 0, t0: 0, tick: null, warn: false };
function startInput(input) {
  state.input = { ...input, id: ++state.seq };
  $('#rvLayer').hidden = false;
  analyze3(state.input);
}
function closeReview() {
  clearInterval(s3.tick);
  state.input = null;
  $('#rvLayer').hidden = true;
  getSelection().removeAllRanges();
  s2Cue();
}
async function analyze3(input) {
  Object.assign(s3, { phase: 'loading', tab: 'src', r: null, items: [], checked: new Set(), sel: 0, warn: false, t0: performance.now() });
  const labels = ['AI가 공지를 읽고 있어요', '날짜와 시간을 찾고 있어요', '준비물과 비용을 찾고 있어요', '할 일과 일정으로 나누고 있어요'];
  let k = 0;
  cue(null);
  const tickCue = () => { const sec = Math.floor((performance.now() - s3.t0) / 1000); const el = $('#rvSec'); if (el) el.textContent = `${sec}초`; const lb = $('#rvLabel'); if (lb) lb.textContent = labels[Math.min(k, 3)] + '…'; };
  clearInterval(s3.tick);
  tickCue();
  s3.tick = setInterval(() => { k = Math.floor((performance.now() - s3.t0) / 1800); tickCue(); }, 500);
  drawRv();
  await sleep(reduced ? 0 : 700);
  if (state.input?.id !== input.id) return;
  s3.tab = 'res'; drawRv();
  state.busy = true;
  try {
    const r = input.type === 'text' ? await analyzeText(input.text) : await analyzeFile(input.blob, input.name);
    if (state.input?.id !== input.id) return;
    clearInterval(s3.tick);
    const items = [...r.result.tasks.map(t => ({ ...t, kind: 'task' })), ...r.result.schedules.map(x => ({ ...x, kind: 'schedule' }))];
    items.sort((a, b) => (whenLabel(a).date.start?.getTime() ?? 9e15) - (whenLabel(b).date.start?.getTime() ?? 9e15));
    Object.assign(s3, { phase: 'result', r, items, checked: new Set(items.map((_, i) => i)), sel: 0 });
    const nT = r.result.tasks.length, nS = r.result.schedules.length;
    drawRv();
  } catch (error) {
    clearInterval(s3.tick);
    s3.phase = 'error'; s3.error = error;
    drawRv();
  } finally {
    state.busy = false;
  }
}
function rvDetail(it) {
  const w = whenLabel(it);
  const rows = it.kind === 'task'
    ? [['내용', it.action], ['준비물', it.materials?.join(', ')], ['비용', it.cost === null || it.cost === undefined ? null : it.cost === 0 ? '무료' : won(it.cost)], ['제출 방법', it.submission]]
    : [['내용', it.details], ['시간', it.time], ['장소', it.location]];
  return `<h4>${esc(it.title)}</h4>
    <div class="rv-row1">
      <div class="rv-seg"><span class="${it.kind === 'task' ? 'on' : ''}">할 일</span><span class="${it.kind === 'schedule' ? 'on' : ''}">일정</span></div>
      <div class="rv-date"><small>${it.kind === 'task' ? '마감일' : '시작일'}</small><div class="${w.review ? 'warn' : ''}">${w.date.start ? fmt.dot(w.date.start) + (w.date.end ? ` ~ ${fmt.dot(w.date.end)}` : '') : w.review ? `날짜 확인 필요 · ${esc(w.main)}` : '날짜 없음'}</div></div>
    </div>
    <dl class="rv-kv">${rows.filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    <div class="rv-memo"><b>내 메모</b><div>준비 상황이나 기억할 내용을 적어 주세요.</div></div>
    <details class="rv-ev" open><summary>원문 근거</summary><p>${esc(it.evidence)}</p></details>`;
}
function drawRv() {
  const m = $('#s3Modal');
  const input = state.input;
  const nT = s3.items.filter((it, i) => s3.checked.has(i) && it.kind === 'task').length;
  const nS = s3.items.filter((it, i) => s3.checked.has(i) && it.kind === 'schedule').length;
  let body = '';
  if (s3.tab === 'src') {
    body = input.type === 'text' ? `<div class="rv-source">${esc(input.shown || input.text)}</div>` : `<div class="rv-source"><img src="${input.preview}" alt=""></div>`;
  } else if (s3.phase === 'loading') {
    body = `<div class="rv-wait"><span class="spin"></span><b id="rvLabel">AI가 공지를 읽고 있어요…</b><small>보통 5~15초 걸려요 · <span id="rvSec">0초</span></small></div>`;
  } else if (s3.phase === 'error') {
    body = `<div class="rv-wait"><b>${s3.error.kind === 'busy' ? '잠깐만요' : '분석에 실패했어요.'}</b><small>${esc(s3.error.message)}</small><button class="btn btn-solid" type="button" data-retry>다시 분석하기</button></div>`;
  } else if (!s3.items.length) {
    body = `<div class="rv-wait"><b>저장할 항목이 없어요</b><small>신청·제출할 일이나 날짜가 있는 일정이 보이지 않았어요.</small></div>`;
  } else {
    body = `<p class="rv-guide">왼쪽 항목을 하나씩 눌러 확인하고, 아래 ‘확인하고 저장’을 누르세요.</p>
      <div class="rv-box">
        <div class="rv-list"><small>등록할 항목</small>
          ${s3.items.map((it, i) => { const w = whenLabel(it); return `<div class="rv-item${i === s3.sel ? ' on' : ''}" data-i="${i}" role="button" tabindex="0" style="animation-delay:${i * 90}ms">
            <span class="rv-check${s3.checked.has(i) ? ' on' : ''}" data-check="${i}">✓</span>
            <div><span class="tag ${it.kind}">${it.kind === 'task' ? '할 일' : '일정'}</span><b>${esc(it.title)}</b><small class="${w.review ? 'warn' : ''}">${w.date.start ? fmt.iso(w.date.start) : esc(w.review ? '날짜 확인 필요' : '날짜 없음')}</small></div>
          </div>`; }).join('')}
          <details class="rv-sum"><summary>공지 전체 요약</summary><p>${esc(s3.r.result.summary)}</p></details>
        </div>
        <div class="rv-detail">${rvDetail(s3.items[s3.sel])}</div>
      </div>`;
  }
  m.innerHTML = `<div class="rv-top"><span class="rv-brand">h. 해줌 AI</span><a>내 할 일 · 일정</a><button class="x" type="button" data-close aria-label="닫기">✕</button></div>
    <p class="rv-title">할 일 · 일정 확인</p>
    <div class="rv-tabs" role="tablist"><button type="button" data-tab="src" aria-selected="${s3.tab === 'src'}">가져온 내용</button><button type="button" data-tab="res" aria-selected="${s3.tab === 'res'}">정리한 결과</button></div>
    ${body}
    <div class="rv-foot"><small>${s3.phase === 'result' ? `할 일 ${nT}개 · 일정 ${nS}개 저장` : s3.phase === 'loading' ? '분석이 끝나면 저장할 수 있어요.' : ''}</small>
      <button class="rv-save" type="button" ${s3.phase === 'result' && nT + nS ? '' : 'disabled'}>확인하고 저장</button></div>`;
  $$('[data-tab]', m).forEach(b => b.onclick = () => { s3.tab = b.dataset.tab; drawRv(); });
  $$('.rv-item', m).forEach(el => el.onclick = e => {
    const i = Number(el.dataset.i);
    if (e.target.closest('[data-check]')) { s3.checked.has(i) ? s3.checked.delete(i) : s3.checked.add(i); }
    else s3.sel = i;
    drawRv();
    $$('.rv-item', m).forEach(x => x.style.animation = 'none');
  });
  $('[data-retry]', m)?.addEventListener('click', () => analyze3(input));
  $('[data-close]', m).onclick = closeReview;
  $('.rv-save', m).onclick = () => {
    const list = s3.items.filter((_, i) => s3.checked.has(i));
    storeAdd(list, input.label);
    clearInterval(s3.tick);
    $('#rvLayer').hidden = true;
    getSelection().removeAllRanges();
    go(4);
  };
}

/* ════════════════════ 4단계: 내 할 일 · 일정 ════════════════════ */
const s4 = { view: 'today', month: null, day: null };
enter[4] = () => {
  const fresh = state.items.filter(it => state.newIds.has(it.id) && it.start).sort((a, b) => a.start - b.start);
  s4.day = fresh[0]?.start || s4.day || todayKST();
  s4.month = new Date(s4.day.getFullYear(), s4.day.getMonth(), 1);
  const newIds = new Set(state.newIds);
  state.newIds.clear();
  drawWs();
  coach({
    step: '3 / 4 · 챙기기',
    title: '저장한 일은 해줌이 챙겨요',
    body: '마감 3일 전, 하루 전, 당일에<br>먼저 알림으로 알려 줘요.',
    buttons: [{ label: state.items.length ? '알림 받아 보기' : '확인', on: () => {
      closeCoach();
      state.newIds = newIds; drawWs(); setTimeout(() => state.newIds.clear(), 1500);
      cue('왼쪽 메뉴에서 ‘캘린더’도 눌러 보세요');
      dock([{ label: '다음', on: () => go(5) }]);
      const rem = reminderList().filter(r => newIds.has(r.it.id)).slice(0, 2);
      popNotis(rem.length ? rem : reminderList().slice(0, 1));
    } }],
  });
};
function wsRow(it) {
  return `<div class="ws-row${state.newIds.has(it.id) ? ' new' : ''}">
    <span class="circle"></span>
    <div><b>${esc(it.title)}</b><small>${it.start ? `${fmt.iso(it.start)}${it.end ? ` ~ ${fmt.iso(it.end)}` : ''} · ${dday(it.start)}` : esc(it.dateText || '날짜 없음')}${it.start ? '' : ' <span class="mini-tag">확인 필요</span>'}</small></div>
    <span class="tag ${it.kind}">${it.kind === 'task' ? '할 일' : '일정'}</span>
    ${it.start ? '<span class="act">보기</span>' : `<button class="act warn" type="button" data-ok="${it.id}">확인하기</button>`}
  </div>`;
}
function drawWs() {
  const ws = $('#ws');
  const today = todayKST();
  const sorted = [...state.items].sort((a, b) => (a.start?.getTime() ?? 9e15) - (b.start?.getTime() ?? 9e15));
  const review = sorted.filter(it => !it.start), next = sorted.filter(it => it.start);
  const nav = `<nav class="ws-nav"><span class="logo"><span class="mark">h.</span>해줌 AI</span>
    <button type="button" data-v="today" class="${s4.view === 'today' ? 'on' : ''}">오늘</button>
    <button type="button" data-v="list" class="${s4.view === 'list' ? 'on' : ''}">할 일 · 일정 <small>${state.items.length}</small></button>
    <button type="button" data-v="calendar" class="${s4.view === 'calendar' ? 'on' : ''}">캘린더</button>
    <p class="foot">알림 · 연결 설정<br>해줌 AI</p></nav>`;
  let main;
  if (s4.view === 'calendar') {
    const m = s4.month, first = new Date(m.getFullYear(), m.getMonth(), 1), start = addDays(first, -first.getDay());
    const cells = [];
    const weeks = Math.ceil((first.getDay() + new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()) / 7);
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(start, i);
      const evs = state.items.filter(it => it.start && sameDay(it.start, d));
      cells.push(`<div class="c${d.getMonth() !== m.getMonth() ? ' out' : ''}${sameDay(d, today) ? ' today' : ''}${sameDay(d, s4.day) ? ' sel' : ''}" data-d="${fmt.iso(d)}"><span class="n">${d.getDate()}</span>
        ${evs.slice(0, 2).map((e, k) => `<span class="ev ${e.kind}${state.newIds.has(e.id) ? ' new' : ''}" style="animation-delay:${300 + k * 150}ms">${esc(e.title)}</span>`).join('')}${evs.length > 2 ? `<span class="ev">+${evs.length - 2}</span>` : ''}</div>`);
    }
    const dayItems = state.items.filter(it => it.start && sameDay(it.start, s4.day));
    main = `<div class="ws-head"><div><small>내 달력</small><h3>캘린더</h3></div><button type="button" data-go="2">공지 가져오기</button></div>
      <div class="wcal-bar"><button type="button" data-mon="-1">이전</button><b>${m.getFullYear()}년 ${m.getMonth() + 1}월</b><button type="button" data-mon="1">다음</button>
        <span class="legend2"><span><i style="background:#5b86e5"></i>할 일 마감</span><span><i style="background:#3f9b72"></i>참석 일정</span></span></div>
      <div class="wcal-grid">
        <div class="wcal">${['일', '월', '화', '수', '목', '금', '토'].map(d => `<span class="dw">${d}</span>`).join('')}${cells.join('')}</div>
        <div class="wcal-side"><h5>${s4.day.getMonth() + 1}월 ${s4.day.getDate()}일 (${fmt.wd(s4.day)})</h5>
          <ul>${dayItems.length ? dayItems.map(it => `<li><span class="tag ${it.kind}">${it.kind === 'task' ? '마감' : '일정'}</span><b>${esc(it.title)}</b><small>${esc(it.timeText || '시간 지정 없음')}${it.end ? ` · ~${fmt.md(it.end)}` : ''}</small></li>`).join('') : '<li><small>등록된 일정이 없어요.</small></li>'}</ul></div>
      </div>
      ${review.length ? `<p class="wcal-note">날짜를 확인해야 하는 항목 ${review.length}개는 달력에 표시하지 않았어요. ‘오늘’에서 날짜를 확인해 주세요.</p>` : ''}`;
  } else {
    const list = s4.view === 'list' ? sorted : null;
    const m = new Date(s4.day.getFullYear(), s4.day.getMonth(), 1), start = addDays(m, -m.getDay());
    const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const mcal = [];
    for (let i = 0; i < m.getDay() + days; i++) {
      const d = addDays(start, i);
      if (d.getMonth() !== m.getMonth()) { mcal.push('<span></span>'); continue; }
      const has = state.items.some(it => it.start && sameDay(it.start, d));
      mcal.push(`<span class="${sameDay(d, today) ? 'today' : ''}${has ? ' dot' : ''}${sameDay(d, s4.day) && !sameDay(d, today) ? ' sel' : ''}" data-d="${fmt.iso(d)}">${d.getDate()}</span>`);
    }
    const dayItems = state.items.filter(it => it.start && sameDay(it.start, s4.day));
    main = `<div class="ws-head"><div><small>${today.getMonth() + 1}월 ${today.getDate()}일 ${fmt.wd(today)}요일</small><h3>${list ? '할 일 · 일정' : '오늘을 가볍게.'}</h3></div><button type="button" data-go="2">공지 가져오기</button></div>
      <div class="ws-grid">
        <div class="ws-card"><h4>${list ? '전체 항목' : '먼저 확인할 일'}</h4><p>${list ? '저장한 순서와 관계없이 날짜순으로 보여요.' : '마감이 가까운 순서로 모았어요.'}</p>
          ${state.items.length ? (list ? list.map(wsRow).join('') : `${review.length ? `<p class="ws-group">확인 필요 · ${review.length}</p>${review.map(wsRow).join('')}` : ''}${next.length ? `<p class="ws-group">다음 할 일 · ${next.length}</p>${next.map(wsRow).join('')}` : ''}`)
            : '<p class="ws-empty">아직 저장한 항목이 없어요. 3단계 결과 창에서 ‘확인하고 저장’을 눌러 보세요.</p>'}
        </div>
        <div class="ws-card"><div class="mcal-head"><b>${m.getFullYear()}년 ${m.getMonth() + 1}월</b><small>전체 달력</small></div>
          <div class="mcal">${['일', '월', '화', '수', '목', '금', '토'].map(d => `<span class="dw">${d}</span>`).join('')}${mcal.join('')}</div>
          <div class="mcal-day"><b>${s4.day.getMonth() + 1}월 ${s4.day.getDate()}일</b>
            ${dayItems.length ? `<ul>${dayItems.map(it => `<li><span class="tag ${it.kind}">${it.kind === 'task' ? '할 일' : '일정'}</span>${esc(it.title)}</li>`).join('')}</ul>` : '<p>등록된 일정이 없어요.</p>'}</div>
        </div>
      </div>`;
  }
  ws.innerHTML = nav + `<div class="ws-main">${main}</div>`;
  $$('[data-v]', ws).forEach(b => b.onclick = () => { s4.view = b.dataset.v; drawWs(); });
  $$('[data-mon]', ws).forEach(b => b.onclick = () => { s4.month = new Date(s4.month.getFullYear(), s4.month.getMonth() + Number(b.dataset.mon), 1); drawWs(); });
  $$('[data-d]', ws).forEach(c => c.onclick = () => { const [y, mo, d] = c.dataset.d.split('-').map(Number); s4.day = new Date(y, mo - 1, d); if (s4.view === 'today' || s4.view === 'list') s4.view = 'calendar'; s4.month = new Date(y, mo - 1, 1); drawWs(); });
  $$('[data-ok]', ws).forEach(b => b.onclick = () => {
    const it = state.items.find(x => x.id === b.dataset.ok);
    if (it.yearMissing && it.guess) {
      it.start = it.guess; it.yearMissing = false; state.newIds = new Set([it.id]);
      toast(`‘${it.title}’ 날짜를 ${fmt.md(it.start)}로 확인했어요`);
      drawWs();
    } else toast('원문에 정확한 날짜가 없어요. 학교에 확인한 뒤 날짜를 넣어 주세요');
  });
}
async function popNotis(list) {
  const box = $('#osNoti');
  for (const r of list) {
    await sleep(reduced ? 300 : 1500);
    if (state.step !== 4) return;
    box.hidden = false;
    box.className = 'os-noti';
    box.innerHTML = `<span class="mark">h.</span><div><small>해줌 AI · 알림 미리 보기 · ${r.when.getMonth() + 1}/${r.when.getDate()} ${hhmm(r.when)}</small><b>${esc(r.head)}</b><p>${esc(r.it.title)} · ${esc(r.body)}</p></div>`;
    await sleep(3400);
    box.classList.add('out');
    await sleep(500);
    box.hidden = true;
  }
}

/* ════════════════════ 5단계: 확장 프로그램으로 직접 ════════════════════ */
const s5 = { tab: 'notice', cur: null, ext: 'idle' };
const LIB = {
  notice: () => noticeImages.map(n => ({ ...n, type: 'image', thumb: n.src, sub: '가정통신문 이미지' })),
  chat: () => [chatParents(), chatClass(), chatSoccer()].map(s => ({ id: s.id, label: s.label, sub: s.sub, type: 'text', src: s })),
  class: () => [classroomInfo(), classroomScience(), classroomTrip()].map(s => ({ id: s.id, label: s.label, sub: s.sub, type: 'text', src: s })),
  pdf: () => [{ id: 'pdf', label: pdfDoc.label, sub: '8쪽 · 가정통신문 모음', type: 'pdf' }],
};
const GUIDE = {
  text: { mission: 'select', cues: {
    idle: '정리할 문장을 드래그하고, 옆에 뜨는 ‘해줌으로 정리 →’를 누르세요',
    opened: '해줌 창에서 ‘할 일 정리하기’를 누르세요',
    analyzed: '항목을 확인하고 ‘확인하고 저장’을 누르세요',
  } },
  image: { mission: 'capture', cues: {
    idle: '오른쪽 아래 h. 버튼 → ‘화면 캡처’로 통신문을 잘라 보세요',
    opened: '해줌 창에서 ‘할 일 정리하기’를 누르세요',
    analyzed: '항목을 확인하고 ‘확인하고 저장’을 누르세요',
  } },
  pdf: { mission: 'pdf', cues: {
    idle: 'PDF를 내려받고, h. 버튼 → ‘PDF 가져오기’로 열어 보세요',
    opened: '페이지를 고르고 ‘할 일 정리하기’를 누르세요',
    analyzed: '항목을 확인하고 ‘확인하고 저장’을 누르세요',
  } },
};
const ORDER = { idle: 1, closed: 1, opened: 2, analyzed: 3 };
let s5intro = false;
enter[5] = () => {
  if (!s5.cur) { drawLib(); pickLib(LIB[s5.tab]()[0]); }
  if (!s5intro) {
    coach({
      step: '4 / 4 · 직접 해보기',
      title: '이제 직접 해 보세요',
      body: '이 컴퓨터에 설치된 해줌 확장 프로그램으로<br>왼쪽 자료를 골라 정리해 보세요.',
      buttons: [{ label: '시작하기', on: () => { s5intro = true; closeCoach(); s5Cue(); } }],
    });
  } else s5Cue();
};
function s5Cue() {
  const x = s5.cur;
  if (!x || state.step !== 5) return;
  const g = GUIDE[x.type];
  const st = s5.ext === 'saved' ? 'idle' : s5.ext;
  cue(g.cues[st] || g.cues.idle, `${ORDER[st] || 1}/3`);
  dock(x.type === 'pdf' && st !== 'opened' && st !== 'analyzed' ? [{ label: 'PDF 내려받기', kind: 'soft', on: () => { const a = document.createElement('a'); a.href = pdfDoc.file; a.download = '학교 안내문 모음.pdf'; a.click(); toast('다운로드 폴더에 저장했어요'); } }] : null);
}
function drawLib() {
  $$('#libTabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.lib === s5.tab)));
  const list = LIB[s5.tab]();
  $('#lib').innerHTML = list.map(x => `<li><button type="button" data-id="${x.id}" aria-current="${s5.cur?.id === x.id}">
    <span class="th ${s5.tab}"${x.src?.color ? ` style="background:${x.src.color}"` : ''}>${x.thumb ? `<img src="${x.thumb}" alt="">` : x.type === 'pdf' ? `<img src="${pdfDoc.pages[0].thumb}" alt="">` : s5.tab === 'chat' ? '💬' : '✎'}</span>
    <span><b>${esc(x.label)}</b><small>${esc(x.sub)}</small></span></button></li>`).join('');
  $$('#lib button').forEach(b => b.onclick = () => pickLib(list.find(x => x.id === b.dataset.id)));
}
function pickLib(x) {
  s5.cur = x; s5.ext = 'idle';
  $('.web-panel')?.remove();
  $$('#lib button').forEach(b => b.setAttribute('aria-current', String(b.dataset.id === x.id)));
  const box = $('#s5Src');
  box.innerHTML = '';
  if (x.type === 'image') box.innerHTML = `<img class="src-img" src="${x.src}" alt="${esc(x.label)} 가정통신문">`;
  else if (x.type === 'text') { const el = renderSource(x.src); el.classList.add('s5-native'); box.append(el); }
  else box.innerHTML = `<div class="pdf-grid">${pdfDoc.pages.map(p => `<figure><img src="${p.thumb}" alt=""><figcaption>${p.n}쪽 · ${esc(p.title)}</figcaption></figure>`).join('')}</div>`;
  box.scrollTop = 0;
  document.querySelector('meta[name="haezoom-demo"]').content = GUIDE[x.type].mission;
  s5Cue();
}
function s5Saved() {
  cue(null); dock(null);
  coach({
    top: '<img src="assets/haezoom-scene.jpg" alt="">',
    step: '체험 완료',
    title: '해줌에 저장했어요!',
    body: 'Chrome 오른쪽 위 해줌 아이콘에서<br>저장한 항목을 볼 수 있어요.',
    buttons: [
      { label: '다른 자료로 또 해 보기', on: () => { closeCoach(); const list = LIB[s5.tab](); const i = list.findIndex(y => y.id === s5.cur.id); pickLib(list[(i + 1) % list.length]); } },
      { label: '처음으로', kind: 'soft', on: resetAll },
    ],
  });
}
async function webFallback() {
  const x = s5.cur;
  $('.web-panel')?.remove();
  const panel = document.createElement('div');
  panel.className = 'web-panel';
  panel.innerHTML = '<div class="rv-wait" style="min-height:200px;box-shadow:none"><span class="spin"></span><b>웹에서 바로 분석하고 있어요</b><small>보통 5~15초 걸려요</small></div>';
  $('#s5Stage').append(panel);
  const t0 = performance.now();
  state.busy = true;
  try {
    let r;
    if (x.type === 'text') {
      const sel = String(getSelection()).trim();
      r = await analyzeText(sel.length > 10 ? sel : sourceText(x.src));
    } else {
      const src = x.type === 'image' ? x.src : pdfDoc.pages[5].src;
      const blob = await (await fetch(src)).blob();
      r = await analyzeFile(new Blob([blob], { type: x.type === 'image' ? 'image/png' : 'image/jpeg' }), x.type === 'image' ? 'notice.png' : 'page-6.jpg');
    }
    if (s5.cur !== x) return;
    const items = [...r.result.tasks.map(t => ({ ...t, kind: 'task' })), ...r.result.schedules.map(s => ({ ...s, kind: 'schedule' }))];
    panel.innerHTML = `<h4>정리한 결과 · ${((performance.now() - t0) / 1000).toFixed(1)}초</h4>
      ${items.length ? items.map(it => { const w = whenLabel(it); return `<div class="wr"><span class="tag ${it.kind}">${it.kind === 'task' ? '할 일' : '일정'}</span><b>${esc(it.title)}</b><small>${esc(w.main)}${w.review ? ' · 확인 필요' : ''}</small></div>`; }).join('') : '<p class="ws-empty">챙길 일이 없는 글이에요.</p>'}
      ${items.length ? '<button class="btn btn-solid" type="button" data-save>내 할 일에 저장</button>' : ''}
      <button class="link-btn" type="button" data-close>닫기</button>`;
    $('[data-save]', panel)?.addEventListener('click', e => { storeAdd(items, x.label); toast(`${items.length}개 저장했어요`); e.target.disabled = true; });
  } catch (error) {
    panel.innerHTML = `<div class="rv-wait" style="min-height:200px;box-shadow:none"><b>${error.kind === 'busy' ? '잠깐만요' : '분석에 실패했어요.'}</b><small>${esc(error.message)}</small></div><button class="btn btn-solid" type="button" data-retry>다시 분석하기</button><button class="link-btn" type="button" data-close>닫기</button>`;
    $('[data-retry]', panel).onclick = webFallback;
  } finally {
    state.busy = false;
  }
  $('[data-close]', panel)?.addEventListener('click', () => panel.remove());
}
document.addEventListener('haezoom-demo-progress', e => {
  let d; try { d = JSON.parse(e.detail); } catch { return; }
  if (!d || !['opened', 'analyzed', 'saved', 'closed'].includes(d.step)) return;
  if (d.step === 'closed' && s5.ext === 'saved') return;
  s5.ext = d.step;
  if (state.step !== 5) return;
  if (d.step === 'saved') s5Saved(); else s5Cue();
});

/* ════════════════════ 자리 비움 → 처음으로 ════════════════════ */
const idle = { last: Date.now(), count: null };
const IDLE_MS = 100000;
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(t => document.addEventListener(t, () => { idle.last = Date.now(); }, { capture: true, passive: true }));
setInterval(() => {
  if (state.step === 0 || state.busy || idle.count !== null) return;
  if (Date.now() - idle.last > IDLE_MS) {
    let n = 10;
    $('#idle').hidden = false;
    $('#idleNum').textContent = n;
    idle.count = setInterval(() => {
      n--;
      $('#idleNum').textContent = n;
      if (n <= 0) resetAll();
    }, 1000);
  }
}, 1000);
function resetAll() { location.replace(location.pathname); }

/* ════════════════════ 연결 ════════════════════ */
$('#home').addEventListener('click', () => go(1));
$('#startBtn').addEventListener('click', e => { e.stopPropagation(); go(1); });
$$('#steps button').forEach(b => b.onclick = () => go(b.dataset.go));
$('#logoBtn').onclick = () => go(0);
$('#homeBtn').onclick = resetAll;
$('#idleKeep').onclick = () => { clearInterval(idle.count); idle.count = null; idle.last = Date.now(); $('#idle').hidden = true; };
$('#webFb').onclick = webFallback;
$$('#libTabs button').forEach(b => b.onclick = () => { s5.tab = b.dataset.lib; drawLib(); pickLib(LIB[s5.tab]()[0]); });
document.addEventListener('keydown', e => { if (e.key === 'R' && e.shiftKey && e.altKey) resetAll(); });

async function checkApi() {
  const s = await serverStatus();
  const dot = $('#apiDot');
  dot.className = `api-dot ${s}`;
  dot.title = s === 'ok' ? 'AI 서버 연결됨' : s === 'off' ? 'AI 서버 키가 설정되지 않음' : 'AI 서버에 연결할 수 없음';
}
checkApi();
setInterval(checkApi, 60000);

// 진행자용: 주소 끝에 #1~#5
const startStep = Number(location.hash.replace('#', '')) || 0;
if (startStep) go(startStep); else heroRun();
