import { makeItems, validDate } from './core.mjs';
import { samples } from './samples.mjs';
import { getPdfPageCount, renderPdfPage } from './ocr.mjs';
import { analyzeDocument, analyzeText, analyzeImageDataUrl } from './api.mjs';
import {
  calendarDates,
  eligibleForCalendar,
  calendarFingerprint,
  scheduledTime,
  makeGoogleEvent,
} from './calendar.mjs';
import { icsFileName, makeIcs } from './ics.mjs';
import { koreanDate } from './reminders.mjs';

const $ = id => document.getElementById(id);
const node = (tag, text, className) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
};
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
/** 2026-11-27 → 11월 27일 (금) */
function shortDate(iso, withYear = false) {
  const d = new Date(iso + 'T12:00:00Z');
  const text = `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
  return withYear ? `${d.getUTCFullYear()}년 ${text}` : text;
}
const dayDiff = (from, to) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
/** 날짜를 읽기 쉬운 글과 남은 기간 표시로 */
function dueInfo(item) {
  const dates = calendarDates(item);
  if (!dates) return null;
  const today = koreanDate(),
    otherYear = dates.start.slice(0, 4) !== today.slice(0, 4);
  let label = shortDate(dates.start, otherYear);
  if (dates.end !== dates.start)
    label +=
      ' – ' +
      (dates.end.slice(0, 7) === dates.start.slice(0, 7) ? `${Number(dates.end.slice(8))}일` : shortDate(dates.end));
  let chip = '',
    tone = '';
  if (!item.completed) {
    const untilStart = dayDiff(today, dates.start);
    if (dates.end < today) {
      chip = `${dayDiff(dates.end, today)}일 지남`;
      tone = 'overdue';
    } else if (dates.start <= today) {
      chip = item.kind === 'task' ? '오늘 마감' : dates.start === today ? '오늘' : '진행 중';
      tone = 'today';
    } else if (untilStart === 1) {
      chip = '내일';
      tone = 'soon';
    } else if (untilStart <= 14) {
      chip = `D-${untilStart}`;
      tone = untilStart <= 3 ? 'soon' : '';
    }
  }
  return { label, chip, tone, dates };
}
let items = [],
  draft = [],
  selected = new Set(),
  sampleIndex = 0,
  source = { title: '입력한 문서' },
  busy = false,
  selectedFile = null,
  calendarConnected = false,
  syncing = false,
  filter = 'pending',
  filePreview = null;
let month = koreanDate().slice(0, 7),
  selectedDay = koreanDate(),
  kindFilter = 'task';
let notificationTimer;
function notify(text, persistent = false) {
  clearTimeout(notificationTimer);
  $('status').textContent = text;
  if (!persistent) notificationTimer = setTimeout(() => ($('status').textContent = ''), 9000);
}
let undoTimer, undoAction;
function offerUndo(message, action) {
  clearTimeout(undoTimer);
  undoAction = action;
  $('undo-message').textContent = message;
  $('undo-toast').hidden = false;
  $('undo-action').disabled = false;
  undoTimer = setTimeout(() => ($('undo-toast').hidden = true), 12000);
}
$('undo-dismiss').onclick = () => {
  $('undo-toast').hidden = true;
  clearTimeout(undoTimer);
};
$('undo-action').onclick = async () => {
  clearTimeout(undoTimer);
  $('undo-action').disabled = true;
  try {
    await undoAction();
    $('undo-toast').hidden = true;
  } catch (error) {
    notify(error.message, true);
    $('undo-toast').hidden = true;
  }
};
async function request(type, payload = {}, timeoutMs = 20000) {
  let timer;
  try {
    const response = await Promise.race([
      chrome.runtime.sendMessage({ type, payload }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('응답이 지연되고 있어요. 잠시 뒤 다시 시도해 주세요.')), timeoutMs);
      }),
    ]);
    if (!response?.ok) throw new Error(response?.error || '요청을 처리하지 못했어요.');
    return response.data;
  } finally {
    clearTimeout(timer);
  }
}
let asking = false;
async function ask(title, copy, action = '확인') {
  if (asking) return false;
  asking = true;
  const dialog = $('confirm-dialog');
  $('confirm-title').textContent = title;
  $('confirm-copy').textContent = copy;
  $('confirm-yes').textContent = action;
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise(resolve =>
    dialog.addEventListener(
      'close',
      () => {
        asking = false;
        resolve(dialog.returnValue === 'yes');
      },
      { once: true },
    ),
  );
}
function button(text, handler, className = 'secondary') {
  const b = node('button', text, className);
  b.type = 'button';
  b.onclick = async () => {
    if (b.disabled) return;
    b.disabled = true;
    try {
      await handler();
    } catch (error) {
      notify(error.message, true);
    } finally {
      b.disabled = false;
    }
  };
  return b;
}
function route() {
  const hash = location.hash.slice(1),
    target = hash.startsWith('item/')
      ? 'tasks'
      : ['tasks', 'calendar', 'settings', 'home', 'analyze'].includes(hash)
        ? hash
        : hash === 'upload'
          ? 'analyze'
          : 'home';
  document.body.dataset.view = target;
  $('page-label').textContent = {
    home: '오늘',
    analyze: '공지 가져오기',
    tasks: '할 일 · 일정',
    calendar: '캘린더',
    settings: '연결 · 설정',
  }[target];
  document.querySelectorAll('.view').forEach(v => (v.hidden = v.id !== target));
  document
    .querySelectorAll('nav a, .settings-link')
    .forEach(a => a.classList.toggle('active', a.hash === `#${target}`));
  if (target === 'tasks') renderItems();
  if (hash.startsWith('item/')) {
    const item = items.find(x => x.id === decodeURIComponent(hash.slice(5)));
    if (item && !$('item-dialog').open) openItem(item);
  }
  if (target === 'calendar') renderCalendar();
  if (hash === 'upload') {
    setInputMode(true);
    $('file').focus({ preventScroll: true });
  }
  if (target === 'home') renderHome();
}
addEventListener('hashchange', route);
function setInputMode(file) {
  $('file-area').hidden = !file;
  $('text-mode').setAttribute('aria-pressed', String(!file));
  $('file-mode').setAttribute('aria-pressed', String(file));
  $('input-label').textContent = file ? '추가 메모 (선택)' : '공지 내용';
  $('input-text').placeholder = file
    ? '추가로 확인할 내용이 있으면 적어 주세요.'
    : '학교 공지나 수업 안내를 붙여 넣으세요.';
}
$('text-mode').onclick = () => setInputMode(false);
$('file-mode').onclick = () => setInputMode(true);
function openManual(date) {
  $('manual-date').value = date || '';
  $('manual-dialog').showModal();
  $('manual-title').focus();
}
for (const id of ['home-add', 'new-item']) $(id).onclick = () => openManual();
$('close-manual').onclick = () => $('manual-dialog').close();
function renderHome() {
  const today = koreanDate();
  $('home-date').textContent = new Date(today + 'T12:00:00+09:00').toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: 'Asia/Seoul',
  });
  const pending = items.filter(x => !x.completed),
    unknown = pending.filter(x => !x.confirmed);
  const dated = pending
    .filter(x => x.kind === 'task' && x.confirmed)
    .sort((a, b) => (calendarDates(a)?.start || '9999').localeCompare(calendarDates(b)?.start || '9999'));
  const todayCount = dated.filter(x => calendarDates(x)?.start === today).length;
  const overdueCount = dated.filter(x => calendarDates(x)?.start < today).length;
  $('home-description').textContent = overdueCount
    ? `기한 지난 일 ${overdueCount}개${todayCount ? ` · 오늘 마감 ${todayCount}개` : ''}`
    : todayCount
      ? `오늘 마감 ${todayCount}개`
      : pending.length
        ? '마감이 가까운 순서로 모았어요.'
        : '새 공지를 가져오면 여기에 모아드려요.';
  $('home-review').replaceChildren();
  $('home-list').replaceChildren();
  const upcoming = dated.filter(x => !calendarDates(x) || calendarDates(x).start > today);
  const groups = [
    ['기한이 지났어요', dated.filter(x => calendarDates(x)?.start < today), 'overdue'],
    ['오늘까지', dated.filter(x => calendarDates(x)?.start === today), 'today'],
    ['날짜를 확인해 주세요', unknown, 'review'],
    ['다가오는 할 일', upcoming.slice(0, 5), ''],
  ];
  for (const [name, list, tone] of groups) {
    if (!list.length) continue;
    const title = node('h3', undefined, 'priority-group ' + tone);
    title.append(
      node('span', name),
      node('span', String(list === groups[3][1] ? upcoming.length : list.length), 'count'),
    );
    $('home-list').append(title, ...list.map(x => listCard(x, { showKind: false })));
  }
  if (upcoming.length > 5) {
    const more = node('a', `다가오는 할 일 ${upcoming.length - 5}개 더 보기`, 'more-link');
    more.href = '#tasks';
    $('home-list').append(more);
  }
  if (!dated.length && !unknown.length) {
    const empty = node('div', undefined, 'empty');
    empty.append(
      node('h3', '오늘 마감할 일이 없어요'),
      node('p', '새 공지는 웹페이지의 해줌 버튼에서 가져올 수 있어요.'),
    );
    $('home-list').append(empty);
  }
  const [y, m] = today.split('-').map(Number),
    count = new Date(Date.UTC(y, m, 0)).getUTCDate(),
    first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  $('mini-month').textContent = `${y}년 ${m}월`;
  const grid = $('mini-calendar');
  grid.replaceChildren(...['일', '월', '화', '수', '목', '금', '토'].map(x => node('span', x, 'mini-weekday')));
  for (let i = 0; i < first; i++) grid.append(node('span'));
  for (let d = 1; d <= count; d++) {
    const date = today.slice(0, 7) + '-' + String(d).padStart(2, '0');
    const matches = items.filter(x => {
      const value = calendarDates(x);
      return value && !x.completed && date >= value.start && date <= value.end;
    });
    const b = button(
      String(d),
      () => {
        selectedDay = date;
        renderHome();
      },
      'mini-day' +
        (date === today ? ' is-today' : '') +
        (date === selectedDay ? ' selected' : '') +
        (matches.length ? ' has-item' : ''),
    );
    b.setAttribute('aria-label', date + ' 일정 보기');
    grid.append(b);
  }
  const dayItems = pending.filter(x => {
    const d = calendarDates(x);
    return d && selectedDay >= d.start && selectedDay <= d.end;
  });
  $('home-agenda-title').textContent = shortDate(selectedDay) + (selectedDay === today ? ' · 오늘' : '');
  $('home-events').replaceChildren(
    ...dayItems.map(x => {
      const b = button('', () => openItem(x), 'agenda-item');
      b.append(
        node('span', x.kind === 'task' ? '마감' : '일정', 'kind-tag ' + x.kind),
        node('strong', x.title),
        node('small', x.time || (x.kind === 'task' ? '하루 종일' : '시간 미정')),
      );
      return b;
    }),
  );
  if (!dayItems.length) $('home-events').append(node('p', '이 날은 비어 있어요.', 'muted tiny'));
  $('home-events').append(button('+ 이 날짜에 추가', () => openManual(selectedDay), 'secondary add-on-day'));
}
function detailsText(item) {
  return [
    item.kind === 'task' ? item.action : item.details,
    item.materials?.length ? `준비물 · ${item.materials.join(', ')}` : '',
    item.cost != null ? `비용 · ${item.cost.toLocaleString()}원` : '',
    item.submission ? `제출처 · ${item.submission}` : '',
    item.location ? `장소 · ${item.location}` : '',
    item.time ? `시간 · ${item.time}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
function syncNeeded(item) {
  return eligibleForCalendar(item) && (!item.calendarEventId || item.calendarFingerprint !== calendarFingerprint(item));
}
function makeEditor(item, onSave) {
  const form = node('form', undefined, 'edit-form');
  form.hidden = true;
  const field = (label, value, type = 'text', full = false) => {
    const l = node('label', label, full ? 'full' : '');
    const input = node(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') input.type = type;
    input.value = value ?? '';
    input.maxLength = type === 'textarea' ? 5000 : 500;
    l.append(input);
    form.append(l);
    return input;
  };
  const category = node('label', '등록 위치', 'full');
  const kind = node('select');
  kind.setAttribute('aria-label', '등록 위치');
  for (const [value, label] of [
    ['task', '할 일 · 제출, 신청, 준비하기'],
    ['schedule', '일정 · 수업, 행사, 참석하기'],
  ]) {
    const option = node('option', label);
    option.value = value;
    kind.append(option);
  }
  kind.value = item.kind;
  category.append(kind);
  form.append(category);
  const title = field('제목', item.title, 'text', true);
  title.required = true;
  const dates = calendarDates(item);
  const date = field(item.kind === 'task' ? '확인한 날짜' : '시작 날짜', dates?.start, 'date');
  const originalText = typeof item.originalDate === 'string' ? item.originalDate : item.date;
  const hints =
    !dates?.start && typeof originalText === 'string' && !validDate(originalText)
      ? (globalThis.haezoomDateHints?.suggestDates(originalText, item.createdAt || new Date()) ?? [])
      : [];
  if (hints.length) {
    const box = node('div', undefined, 'date-suggest full');
    box.append(
      node(
        'p',
        `원문 ‘${originalText}’을 가져온 날(${globalThis.haezoomDateHints.referenceLabel(item.createdAt || new Date())}) 기준으로 계산했어요. 맞는 날짜를 누르세요.`,
      ),
    );
    for (const hint of hints)
      box.append(
        button(
          hint.label,
          () => {
            date.value = hint.date;
            box
              .querySelectorAll('button')
              .forEach(b => b.setAttribute('aria-pressed', String(b === document.activeElement)));
            checked.parentElement.classList.add('attention');
          },
          'suggest-chip',
        ),
      );
    form.append(box);
  }
  const end = field('종료 날짜 (선택)', item.endDate || (dates?.end !== dates?.start ? dates?.end : ''), 'date');
  const time = field('시작 시간 (선택)', item.time);
  time.placeholder = '14:30';
  const endTime = field('종료 시간 (선택)', item.endTime);
  endTime.placeholder = '미입력 시 1시간';
  const location = field('장소 (선택)', item.location);
  const description = field('정리 내용', item.action || item.details, 'textarea', true);
  const notes = field('내 메모', item.notes, 'textarea', true);
  notes.dataset.notes = '';
  notes.placeholder = '기억할 내용이나 준비 상황을 적어 주세요.';
  const materials = field('준비물 (쉼표로 구분)', item.materials?.join(', '));
  const cost = field('비용 (원)', item.cost, 'number');
  cost.min = '0';
  const submission = field('제출 방법 · 제출처', item.submission, 'text', true);
  const toggleKind = () => {
    [end, time, endTime, location].forEach(e => (e.parentElement.hidden = kind.value !== 'schedule'));
    [materials, cost, submission].forEach(e => (e.parentElement.hidden = kind.value !== 'task'));
  };
  kind.onchange = toggleKind;
  toggleKind();
  const evidence = node('p', `원문 · ${item.evidence || '직접 입력'}`, 'muted tiny full');
  form.append(evidence);
  const checked = node('input');
  checked.type = 'checkbox';
  checked.checked = Boolean(item.confirmed);
  const consent = node('label', undefined, 'consent full');
  consent.append(checked, node('span', '원문을 확인했고 제목과 날짜가 맞습니다'));
  form.append(consent);
  const reminder = node('input');
  reminder.type = 'checkbox';
  reminder.checked = item.reminderEnabled !== false;
  const reminderLabel = node('label', undefined, 'consent full');
  reminderLabel.append(reminder, node('span', '이 항목의 Chrome 알림 받기'));
  form.append(reminderLabel);
  const error = node('p', '', 'privacy full');
  error.setAttribute('role', 'alert');
  const actions = node('div', undefined, 'actions full');
  const apply = node('button', '수정 저장', 'primary');
  apply.type = 'submit';
  actions.append(
    apply,
    button('취소', () => {
      form.hidden = true;
    }),
  );
  form.append(error, actions);
  form.onsubmit = async event => {
    event.preventDefault();
    if (!title.value.trim()) return;
    const patch = {
      kind: kind.value,
      title: title.value.trim(),
      date: date.value || null,
      confirmed: checked.checked,
      reminderEnabled: reminder.checked,
    };
    if (end) patch.endDate = end.value || null;
    if (time) patch.time = time.value.trim() || null;
    patch.endTime = endTime.value.trim() || null;
    if (location) patch.location = location.value.trim() || null;
    patch.notes = notes.value.trim();
    patch[kind.value === 'task' ? 'action' : 'details'] = description.value.trim();
    patch[kind.value === 'task' ? 'details' : 'action'] = '';
    if (materials)
      patch.materials = materials.value
        .split(',')
        .map(x => x.trim())
        .filter(Boolean);
    if (cost) patch.cost = cost.value === '' ? null : Number(cost.value);
    if (submission) patch.submission = submission.value.trim() || null;
    if (!item.originalDate) patch.originalDate = item.date;
    if (checked.checked && (patch.date || patch.kind === 'schedule') && !calendarDates({ ...item, ...patch })) {
      error.textContent = '정확한 날짜를 입력한 뒤 확인 완료해 주세요.';
      return;
    }
    if (checked.checked && patch.kind === 'schedule') {
      if ((patch.time && !scheduledTime(patch.time)) || (patch.endTime && !scheduledTime(patch.endTime))) {
        error.textContent = '시간은 14:30처럼 입력해 주세요.';
        return;
      }
      try {
        makeGoogleEvent({ ...item, ...patch, needs_review: false, completed: false });
      } catch (e) {
        error.textContent = e.message;
        return;
      }
    }
    apply.disabled = true;
    try {
      await onSave(patch);
      form.hidden = true;
    } catch (e) {
      error.textContent = e.message;
    } finally {
      apply.disabled = false;
    }
  };
  return form;
}
function card(item, isDraft = false, { showKind = true } = {}) {
  const article = node('article', undefined, `task-card${item.completed ? ' done' : ''}`);
  article.dataset.id = item.id;
  const heading = node('div', undefined, 'row');
  if (isDraft) {
    const label = node('label', undefined, 'draft-selection');
    const checkbox = node('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selected.has(item.id);
    checkbox.setAttribute('aria-label', `${item.title} 저장 선택`);
    checkbox.onchange = () => {
      checkbox.checked ? selected.add(item.id) : selected.delete(item.id);
      updateSave();
    };
    label.append(checkbox);
    heading.append(label);
  }
  heading.append(node('h3', item.title));
  if (showKind)
    heading.append(
      node(
        'span',
        item.kind === 'task' ? '할 일' : '일정',
        item.kind === 'task' ? 'kind-tag task' : 'kind-tag schedule',
      ),
    );
  if (!isDraft) {
    const open = button(
      item.confirmed ? '' : '날짜 확인',
      () => openItem(item),
      'open-item' + (!item.confirmed ? ' review-action' : ''),
    );
    if (item.confirmed) open.setAttribute('aria-label', '보기');
    heading.append(open);
  }
  article.append(heading);
  const due = dueInfo(item);
  const meta = node('div', undefined, 'item-meta');
  meta.append(
    node(
      'span',
      (due ? due.label : item.originalDate || item.date || '날짜 없음') +
        (item.kind === 'schedule' && item.time ? ' · ' + item.time : ''),
      'date-label' + (due?.tone === 'overdue' ? ' overdue' : ''),
    ),
  );
  if (due?.chip) meta.append(node('span', due.chip, 'due-chip ' + due.tone));
  if (!item.confirmed) meta.append(node('span', '날짜 확인 필요', 'badge'));
  if (item.reminderEnabled === false) meta.append(node('span', '알림 끔', 'muted tiny'));
  const preview = item.notes || item.action || item.details;
  if (preview) meta.append(node('span', (item.notes ? '메모 · ' : '') + preview, 'item-preview'));
  article.append(meta);
  const expansion = node('details', undefined, 'item-expansion');
  expansion.append(node('summary', '상세 · 수정'));
  const facts = node('dl', undefined, 'item-facts');
  for (const [name, value] of [
    ['내용', item.action || item.details],
    ['준비물', item.materials?.join(', ')],
    ['비용', item.cost != null ? item.cost.toLocaleString() + '원' : ''],
    ['제출 방법', item.submission],
    ['장소', item.location],
    ['시간', item.time],
  ])
    if (value) {
      facts.append(node('dt', name), node('dd', value));
    }
  const memoForm = node('form', undefined, 'item-memo');
  const memoLabel = node('label', '내 메모');
  const memo = node('textarea');
  memo.value = item.notes || '';
  memo.maxLength = 5000;
  memo.rows = 3;
  memo.setAttribute('aria-label', '내 메모');
  memo.placeholder = '준비 상황이나 기억할 내용을 적어 주세요.';
  memoLabel.append(memo);
  const memoActions = node('div', undefined, 'memo-actions'),
    memoState = node('span', '', 'muted tiny'),
    memoSave = node('button', '메모 저장', 'secondary');
  memoSave.type = 'submit';
  memoState.setAttribute('role', 'status');
  memoActions.append(memoState, memoSave);
  memoForm.append(memoLabel, memoActions);
  memoForm.onsubmit = async event => {
    event.preventDefault();
    memoSave.disabled = true;
    try {
      const notes = memo.value.trim();
      if (isDraft) {
        item.notes = notes;
      } else {
        const current = items.find(x => x.id === item.id) || item;
        items = await request('updateItem', { id: item.id, revision: current.revision, patch: { notes } });
        Object.assign(
          item,
          items.find(x => x.id === item.id),
        );
        renderAll();
      }
      const editorMemo = editor.querySelector('[data-notes]');
      if (editorMemo) editorMemo.value = notes;
      memoState.textContent = '저장했어요';
    } catch (e) {
      memoState.textContent = e.message;
    } finally {
      memoSave.disabled = false;
    }
  };
  let summary = null;
  if (item.documentSummary) {
    summary = node('details', undefined, 'document-summary');
    summary.append(node('summary', '공지 전체 요약'), node('p', item.documentSummary));
  }
  const evidence = node('details', undefined, 'evidence');
  evidence.append(
    node('summary', '원문 근거와 출처'),
    node('p', item.evidence || '직접 입력'),
    node('p', item.source?.title || '직접 입력'),
  );
  if (/^https?:\/\//.test(item.source?.url || '')) {
    const a = node('a', '원문 페이지 열기 ↗', 'source-link');
    a.href = item.source.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    evidence.append(a);
  }
  const actions = node('div', undefined, 'actions item-actions');
  const editor = makeEditor(item, async patch => {
    if (isDraft) {
      Object.assign(item, patch, { needs_review: !patch.confirmed });
      renderDraft();
    } else {
      items = await request('updateItem', { id: item.id, patch, revision: item.revision });
      $('item-dialog').close();
      renderAll();
      notify('수정한 내용을 저장했어요. 캘린더도 수정하려면 업데이트를 눌러 주세요.');
    }
  });
  if (!isDraft)
    heading.prepend(
      button(
        item.completed ? '다시 할 일로' : '완료 표시',
        async () => {
          items = await request('updateItem', {
            id: item.id,
            revision: item.revision,
            patch: { completed: !item.completed },
          });
          const updated = items.find(x => x.id === item.id);
          $('item-dialog').close();
          renderAll();
          if (!item.completed)
            offerUndo('완료했어요', async () => {
              items = await request('updateItem', {
                id: item.id,
                revision: updated.revision,
                patch: { completed: false },
              });
              renderAll();
            });
          else notify('다시 할 일로 옮겼어요.');
        },
        'complete-button',
      ),
    );
  actions.append(
    button(isDraft || !item.confirmed ? '날짜·내용 확인' : '내용 수정', () => {
      editor.hidden = !editor.hidden;
      if (!editor.hidden) editor.querySelector('input').focus();
    }),
  );
  if (!isDraft) {
    if (eligibleForCalendar(item)) actions.append(button('캘린더 파일', () => downloadIcs([item])));
    if (eligibleForCalendar(item))
      actions.append(
        button(
          item.calendarEventId
            ? syncNeeded(item)
              ? 'Google 캘린더 업데이트'
              : 'Google 캘린더에 등록됨'
            : 'Google 캘린더 등록',
          async () => {
            if (!calendarConnected) {
              location.hash = 'settings';
              notify('Google 캘린더를 먼저 연결해 주세요.');
              return;
            }
            await syncItems([item]);
          },
        ),
      );
    const danger = [];
    if (item.calendarEventId)
      danger.push(
        button(
          'Google 일정 삭제',
          async () => {
            if (!(await ask('Google 일정 삭제', 'Google에 등록한 일정만 삭제합니다. 해줌의 할 일은 유지돼요.', '삭제')))
              return;
            items = await request('removeCalendarEvent', { id: item.id }, 45000);
            renderAll();
            notify('Google 일정을 삭제했어요.');
          },
          'quiet-danger',
        ),
      );
    danger.push(
      button(
        '삭제',
        async () => {
          if (
            !(await ask(
              item.kind === 'task' ? '할 일을 삭제할까요?' : '일정을 삭제할까요?',
              item.calendarEventId
                ? '해줌 목록에서 삭제합니다. Google에 등록한 일정은 유지돼요.'
                : '목록에서 이 항목을 삭제합니다.',
              '삭제',
            ))
          )
            return;
          items = await request('deleteItem', { id: item.id });
          $('item-dialog').close();
          renderAll();
          notify('삭제했어요.');
        },
        'quiet-danger',
      ),
    );
    const spacer = node('span', undefined, 'actions-spacer');
    actions.append(spacer, ...danger);
  }
  if (facts.childElementCount) expansion.append(facts);
  expansion.append(actions, editor, memoForm);
  if (summary) expansion.append(summary);
  expansion.append(evidence);
  article.append(expansion);
  return article;
}
/** 목록 줄: 줄 아무 곳이나 눌러도 상세가 열립니다 */
function listCard(item, options) {
  const article = card(item, false, options);
  article.classList.add('clickable');
  article.onclick = event => {
    if (!event.target.closest('button,a,input,textarea,select,summary,label,form')) openItem(item);
  };
  return article;
}
function renderItems() {
  $('nav-count').textContent = items.filter(x => !x.completed).length;
  const pending = items.filter(x => !x.completed && x.kind === kindFilter),
    today = koreanDate();
  $('task-stats').hidden = true;
  $('task-stats').replaceChildren(
    ...[
      ['진행 중', pending.length],
      [
        kindFilter === 'task' ? '오늘 마감' : '오늘 일정',
        pending.filter(x => calendarDates(x)?.start === today).length,
      ],
      ['확인 필요', pending.filter(x => !x.confirmed).length],
    ].map(([label, count]) => {
      const n = node('div', undefined, 'stat');
      n.append(node('span', label), node('strong', String(count)));
      return n;
    }),
  );
  const query = $('search').value.trim().toLowerCase();
  const visible = items.filter(
    x =>
      x.kind === kindFilter &&
      (!query ||
        `${x.title} ${detailsText(x)} ${x.notes || ''} ${x.documentSummary || ''}`.toLowerCase().includes(query)) &&
      (filter === 'all' ||
        (filter === 'pending' && !x.completed) ||
        (filter === 'completed' && x.completed) ||
        (filter === 'review' && !x.completed && !x.confirmed)),
  );
  visible.sort(
    $('sort').value === 'recent'
      ? (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')
      : (a, b) => (calendarDates(a)?.start || '9999').localeCompare(calendarDates(b)?.start || '9999'),
  );
  $('task-list').replaceChildren(...visible.map(x => listCard(x, { showKind: false })));
  if (!visible.length) {
    const empty = node('div', undefined, 'empty');
    empty.append(
      node('span', '✓', 'empty-mark'),
      node(
        'h3',
        items.length
          ? '여기에 표시할 항목이 없어요'
          : kindFilter === 'task'
            ? '아직 가져온 할 일이 없어요'
            : '아직 등록한 일정이 없어요',
      ),
      node(
        'p',
        items.length
          ? '다른 필터를 선택하거나 새 할 일을 추가해 보세요.'
          : '문서를 가져오거나 위에서 직접 할 일을 추가하세요.',
      ),
    );
    const a = node('a', '문서 가져오기 →', 'button-link primary empty-link');
    a.href = '#analyze';
    empty.append(a);
    $('task-list').append(empty);
  }
}
function renderCalendar() {
  const [year, m] = month.split('-').map(Number),
    count = new Date(Date.UTC(year, m, 0)).getUTCDate(),
    start = new Date(Date.UTC(year, m - 1, 1)).getUTCDay();
  $('month-title').textContent = `${year}년 ${m}월`;
  const grid = $('calendar-grid');
  grid.setAttribute('role', 'grid');
  grid.replaceChildren(...['일', '월', '화', '수', '목', '금', '토'].map(x => node('div', x, 'weekday')));
  grid.style.setProperty('--weeks', Math.ceil((start + count) / 7));
  for (let i = 0; i < start; i++) grid.append(node('div', undefined, 'day blank'));
  for (let day = 1; day <= count; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const cell = node('div', undefined, `day${date === koreanDate() ? ' is-today' : ''}`);
    cell.classList.toggle('selected', date === selectedDay);
    cell.tabIndex = 0;
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', date + ' 일정 보기');
    cell.setAttribute('aria-selected', String(date === selectedDay));
    cell.append(node('span', String(day), 'day-number'));
    const choose = () => {
      selectedDay = date;
      renderCalendar();
    };
    cell.onclick = event => {
      if (!event.target.closest('button')) choose();
    };
    cell.onkeydown = event => {
      if (event.target !== cell) return;
      if (['Enter', ' '].includes(event.key)) {
        event.preventDefault();
        choose();
      }
      const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
      if (move) {
        event.preventDefault();
        const d = new Date(date + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() + move);
        selectedDay = d.toISOString().slice(0, 10);
        month = selectedDay.slice(0, 7);
        renderCalendar();
        document.querySelector('[aria-label="' + selectedDay + ' 일정 보기"][role=gridcell]')?.focus();
      }
    };
    for (const item of items.filter(x => {
      const d = calendarDates(x);
      return d && date >= d.start && date <= d.end;
    })) {
      const b = button(
        '',
        () => openItem(item),
        `calendar-item ${item.kind}${item.completed ? ' done' : !item.confirmed ? ' unconfirmed' : ''}`,
      );
      if (item.time && item.time.length <= 8 && date === calendarDates(item).start)
        b.append(node('span', item.time, 'chip-time'));
      b.append(node('span', item.title, 'chip-title'));
      b.title = `${item.title} · ${item.confirmed ? '확인 완료' : '확인 필요'}`;
      cell.append(b);
    }
    grid.append(cell);
  }
  while ((grid.children.length - 7) % 7) grid.append(node('div', undefined, 'day blank'));
  renderDay();
  const unknown = items.filter(x => !x.completed && !calendarDates(x)).length;
  $('calendar-review').textContent = unknown
    ? `날짜를 확인해야 하는 항목 ${unknown}개는 달력에 표시하지 않았어요. 내 할 일에서 날짜를 확인해 주세요.`
    : '';
  const candidates = items.filter(syncNeeded);
  $('sync-calendar').disabled = syncing || !candidates.length;
  $('sync-calendar').textContent = syncing
    ? '등록 중…'
    : candidates.length
      ? `Google에 등록 · ${candidates.length}`
      : '등록할 항목 없음';
  $('calendar-state').textContent = calendarConnected ? 'Google 캘린더 연결됨' : 'Google 캘린더 연결 전';
  const icsCount = items.filter(eligibleForCalendar).length;
  $('export-ics').disabled = !icsCount;
  $('export-ics').textContent = icsCount ? `캘린더 파일 받기 · ${icsCount}` : '캘린더 파일 받기';
}
function downloadIcs(list) {
  const { text, count } = makeIcs(list);
  if (!count) return notify('날짜를 확인한 항목만 캘린더 파일에 담을 수 있어요.');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  const a = node('a');
  a.href = url;
  a.download = icsFileName(list.length === 1 ? list : list.filter(eligibleForCalendar));
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  notify(`${count}개 항목을 캘린더 파일로 내려받았어요. 파일을 열면 캘린더 앱에 추가돼요.`);
}
function openItem(item) {
  $('item-dialog-title').textContent = item.kind === 'task' ? '할 일' : '일정';
  $('item-detail').replaceChildren(card(item));
  $('item-detail').querySelector('.item-expansion').open = true;
  if (!item.confirmed) $('item-detail').querySelector('.edit-form').hidden = false;
  $('item-dialog').showModal();
}
$('close-item').onclick = () => $('item-dialog').close();
function renderDay() {
  const date = new Date(selectedDay + 'T12:00:00+09:00');
  $('day-title').textContent = date.toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Seoul',
  });
  const list = items.filter(x => {
    const d = calendarDates(x);
    return d && selectedDay >= d.start && selectedDay <= d.end;
  });
  $('day-items').replaceChildren(
    ...list.map(item => {
      const b = button('', () => openItem(item), 'agenda-item');
      b.append(
        node('span', item.kind === 'task' ? '마감' : '일정', 'kind-tag ' + item.kind),
        node('strong', item.title),
        node('small', item.time || (item.kind === 'task' ? '하루 종일' : '시간 미정')),
      );
      return b;
    }),
  );
  if (!list.length) $('day-items').append(node('p', '이 날은 비어 있어요.', 'muted tiny'));
  $('day-items').append(button('+ 이 날짜에 추가', () => openManual(selectedDay), 'secondary add-on-day'));
}
function renderAll() {
  renderHome();
  renderItems();
  renderCalendar();
  $('connect-calendar').textContent = calendarConnected ? '연결 해제' : 'Google 캘린더 연결';
  $('google-state').textContent = calendarConnected
    ? '연결됐어요. 확인한 항목을 캘린더에서 등록하세요.'
    : 'Google 계정에 연결하면 일정과 마감일을 등록할 수 있어요.';
  $('connection-label').textContent = calendarConnected ? 'Google 연결됨 · 설정' : '연결 · 설정';
}
function setFilter() {
  $('status-filter').value = filter;
  renderItems();
}
$('status-filter').onchange = () => {
  filter = $('status-filter').value;
  renderItems();
};
document.querySelectorAll('#kind-filters button').forEach(
  b =>
    (b.onclick = () => {
      kindFilter = b.dataset.kind;
      $('manual-kind').value = kindFilter;
      document.querySelectorAll('#kind-filters button').forEach(x => x.setAttribute('aria-pressed', x === b));
      renderItems();
    }),
);
$('search').oninput = renderItems;
$('sort').onchange = renderItems;
function changeMonth(delta) {
  const [y, m] = month.split('-').map(Number);
  month = new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
  selectedDay = month + '-01';
  renderCalendar();
}
$('previous-month').onclick = () => changeMonth(-1);
$('next-month').onclick = () => changeMonth(1);
$('today').onclick = () => {
  month = koreanDate().slice(0, 7);
  selectedDay = koreanDate();
  renderCalendar();
};
function invalidate() {
  $('step-input').classList.add('current');
  $('step-review').classList.remove('current');
  draft = [];
  selected.clear();
  $('analysis-result').hidden = true;
  $('result-empty').hidden = false;
  $('save').disabled = true;
}
function updateSave() {
  const count = draft.filter(x => selected.has(x.id)).length;
  $('save').disabled = !count;
  $('save').textContent = count ? `${count}개 확인하고 저장` : '선택한 항목 없음';
  const tasks = draft.filter(x => selected.has(x.id) && x.kind === 'task').length;
  $('save-hint').textContent = `할 일 ${tasks}개 · 일정 ${count - tasks}개`;
}
function renderDraft() {
  $('draft-list').replaceChildren(...draft.map(x => card(x, true)));
  updateSave();
  if (!draft.length) $('draft-list').append(node('p', '이 문서에는 할 일이나 날짜가 있는 일정이 없어요.', 'muted'));
}
function showDraft(result, sample = false) {
  $('step-input').classList.remove('current');
  $('step-review').classList.add('current');
  draft = makeItems(result, source);
  selected = new Set(draft.map(x => x.id));
  $('summary').textContent = result.summary;
  $('sample-badge').hidden = !sample;
  $('result-empty').hidden = true;
  $('analysis-result').hidden = false;
  renderDraft();
}
$('input-text').oninput = () => {
  invalidate();
  $('run').disabled = busy || (!selectedFile && !$('input-text').value.trim());
  if (!selectedFile) source = { title: '입력한 문서' };
};
function clearFile() {
  $('pdf-options').hidden = true;
  selectedFile = null;
  $('file').value = '';
  $('file-card').hidden = true;
  if (filePreview) {
    URL.revokeObjectURL(filePreview);
    filePreview = null;
  }
  document.querySelector('.file-preview')?.remove();
}
$('remove-file').onclick = () => {
  clearFile();
  invalidate();
  $('file-status').textContent = '파일을 제거했어요.';
  $('run').disabled = !$('input-text').value.trim();
  source = { title: '입력한 문서' };
};
$('sample').onclick = () => {
  if (busy) return;
  setInputMode(false);
  clearFile();
  $('file-status').textContent = '';
  const sample = samples[sampleIndex++ % samples.length];
  $('input-text').value = sample.text;
  source = { title: `가상 샘플 문서 ${((sampleIndex - 1) % samples.length) + 1}` };
  showDraft(sample.result, true);
  $('run').disabled = false;
  notify('미리 작성된 예시예요. 실제 AI 분석은 ‘할 일 정리하기’를 눌러 주세요.');
};
$('save').onclick = async () => {
  const chosen = draft
    .filter(x => selected.has(x.id))
    .map(x => ({
      ...x,
      confirmed: Boolean(calendarDates(x) || (x.kind === 'task' && !x.date)),
      needs_review: !(calendarDates(x) || (x.kind === 'task' && !x.date)),
    }));
  if (!chosen.length) return;
  $('save').disabled = true;
  try {
    const result = await request('addItems', { items: chosen });
    items = result.items;
    location.hash = 'home';
    filter = 'pending';
    setFilter();
    renderHome();
    notify(result.added ? `${result.added}개 항목을 저장했어요.` : '이미 저장된 항목이에요.');
  } catch (e) {
    notify(e.message, true);
  } finally {
    updateSave();
  }
};
$('run').onclick = async () => {
  const text = $('input-text').value.trim();
  if (busy) return;
  if (!selectedFile && !text) {
    notify('내용을 입력하거나 문서를 가져와 주세요.');
    return;
  }
  if (
    !(await ask(
      'AI로 정리할까요?',
      `${selectedFile ? '선택한 파일과 추가 메모' : '입력한 원문'}를 해줌 서버를 거쳐 Claude에 전송해 분석합니다. 개인정보가 포함되어 있지 않은지 확인해 주세요.`,
      '동의하고 분석',
    ))
  )
    return;
  busy = true;
  invalidate();
  for (const id of ['run', 'sample', 'input-text', 'file', 'remove-file']) $(id).disabled = true;
  const original = $('run').textContent;
  $('run').textContent = '내용을 정리하고 있어요…';
  notify('AI가 공지를 읽고 있어요. 잠시 기다려 주세요.', true);
  try {
    showDraft(
      selectedFile
        ? selectedFile.type === 'application/pdf'
          ? await analyzeImageDataUrl((await renderPdfPage(selectedFile, Number($('pdf-page').value))).image, text)
          : await analyzeDocument(selectedFile, text)
        : await analyzeText(text),
    );
    notify('정리했어요. 날짜와 내용을 확인한 뒤 저장해 주세요.');
  } catch (e) {
    notify(`분석하지 못했어요. ${e.message}`, true);
  } finally {
    busy = false;
    for (const id of ['run', 'sample', 'input-text', 'file', 'remove-file']) $(id).disabled = false;
    $('run').textContent = original;
  }
};
$('manual').onsubmit = async event => {
  event.preventDefault();
  const title = $('manual-title').value.trim();
  if (!title) return;
  const date = $('manual-date').value || null;
  const item = {
    id: crypto.randomUUID(),
    kind: $('manual-kind').value,
    title,
    date,
    notes: $('manual-notes').value.trim(),
    evidence: '사용자가 직접 입력',
    source: { title: '직접 입력' },
    confirmed: !!date || $('manual-kind').value === 'task',
    needs_review: !date && $('manual-kind').value === 'schedule',
    completed: false,
    revision: 1,
    createdAt: new Date().toISOString(),
  };
  const submit = event.submitter;
  submit.disabled = true;
  try {
    const result = await request('addItems', { items: [item] });
    items = result.items;
    kindFilter = item.kind;
    document
      .querySelectorAll('#kind-filters button')
      .forEach(x => x.setAttribute('aria-pressed', x.dataset.kind === kindFilter));
    event.target.reset();
    $('manual-kind').value = kindFilter;
    $('manual-dialog').close();
    filter = 'pending';
    setFilter();
    renderAll();
    notify('할 일을 추가했어요.');
  } catch (e) {
    notify(e.message, true);
  } finally {
    submit.disabled = false;
  }
};
$('connect-calendar').onclick = async () => {
  const b = $('connect-calendar');
  b.disabled = true;
  try {
    if (calendarConnected) {
      if (
        !(await ask('Google 연결을 해제할까요?', '이미 등록한 Google 일정과 해줌의 할 일은 유지됩니다.', '연결 해제'))
      )
        return;
      await request('calendarDisconnect');
      calendarConnected = false;
      notify('연결을 해제했어요.');
    } else {
      notify('Google 로그인 창에서 계정과 일정 권한을 확인해 주세요.', true);
      calendarConnected = (await request('calendarConnect', {}, 180000)).connected;
      notify('Google 캘린더를 연결했어요.');
    }
    renderAll();
  } catch (e) {
    notify(e.message, true);
  } finally {
    b.disabled = false;
  }
};
async function syncItems(list) {
  if (syncing) return;
  if (!calendarConnected) {
    location.hash = 'settings';
    notify('Google 캘린더를 먼저 연결해 주세요.');
    return;
  }
  if (!list.length) return;
  if (
    !(await ask(
      'Google 캘린더에 등록할까요?',
      `${list.length}개 항목의 제목, 날짜, 상세 내용과 출처를 Google로 보냅니다. 이미 등록한 항목은 같은 일정을 업데이트해요.`,
      '등록',
    ))
  )
    return;
  syncing = true;
  renderCalendar();
  let synced = 0;
  const failed = [];
  try {
    for (let i = 0; i < list.length; i += 5) {
      notify(`${Math.min(i + 5, list.length)} / ${list.length}개 일정을 등록하고 있어요.`, true);
      const result = await request('syncCalendar', { itemIds: list.slice(i, i + 5).map(x => x.id) }, 180000);
      items = result.items;
      synced += result.synced;
      failed.push(...result.failed);
    }
    notify(
      failed.length
        ? `${synced}개 등록 · ${failed.length}개 실패: ${failed[0].error}`
        : `${synced}개 일정을 Google에 등록했어요.`,
      !!failed.length,
    );
  } catch (e) {
    notify(e.message, true);
  } finally {
    syncing = false;
    renderAll();
  }
}
$('sync-calendar').onclick = () => {
  $('export-menu').open = false;
  syncItems(items.filter(syncNeeded));
};
$('export-ics').onclick = () => {
  $('export-menu').open = false;
  downloadIcs(items.filter(eligibleForCalendar));
};
document.addEventListener('click', event => {
  if ($('export-menu').open && !event.target.closest('#export-menu')) $('export-menu').open = false;
});
// 알림 설정은 바꾸는 즉시 저장합니다.
$('reminder-form').addEventListener('change', () => $('reminder-form').requestSubmit($('save-reminders')));
for (let hour = 0; hour < 24; hour++) {
  const option = node('option', `${String(hour).padStart(2, '0')}:00`);
  option.value = hour;
  $('reminder-hour').append(option);
}
$('reminder-form').onsubmit = async event => {
  event.preventDefault();
  const b = event.submitter;
  b.disabled = true;
  try {
    await request('setReminderSettings', {
      enabled: $('reminders-enabled').checked,
      hour: Number($('reminder-hour').value),
      eventMinutes: $('event-reminder').checked ? 30 : 0,
      days: [...document.querySelectorAll('[name=reminder-day]:checked')].map(x => Number(x.value)),
    });
    $('home-reminders').textContent = $('reminders-enabled').checked
      ? 'Chrome 알림 켜짐 · 설정'
      : '마감을 놓치지 않도록 알림 켜기';
    notify('알림 설정을 저장했어요.');
  } catch (e) {
    notify(e.message, true);
  } finally {
    b.disabled = false;
  }
};
$('test-notification').onclick = async () => {
  try {
    await request('testNotification');
    notify('알림을 보냈어요. 표시되지 않으면 macOS·Chrome 알림 설정을 확인해 주세요.');
  } catch (e) {
    notify(e.message, true);
  }
};
$('export-json').onclick = () => {
  if (!items.length) return notify('내려받을 항목이 없어요.');
  const url = URL.createObjectURL(
    new Blob([JSON.stringify({ version: 3, items }, null, 2)], { type: 'application/json' }),
  );
  const a = node('a');
  a.href = url;
  a.download = 'haezoom-items.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
$('import-json').onclick = () => $('backup-file').click();
$('backup-file').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('5MB 이하 백업 파일을 선택해 주세요.');
    const data = JSON.parse(await file.text());
    if (!(await ask('백업을 가져올까요?', '기존 항목을 유지하고 중복을 제외한 할 일을 추가합니다.', '가져오기')))
      return;
    const result = await request('importBackup', data);
    items = result.items;
    renderAll();
    notify(`${result.added}개 항목을 가져왔어요.`);
  } catch (e) {
    notify(e.message, true);
  } finally {
    event.target.value = '';
  }
};
async function readFile(file) {
  if (!file || busy) return;
  clearFile();
  invalidate();
  source = { title: '입력한 문서' };
  busy = true;
  for (const id of ['file', 'run', 'sample', 'input-text']) $(id).disabled = true;
  $('file-status').textContent = '파일을 확인하고 있어요.';
  try {
    if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type))
      throw new Error('PDF, PNG, JPG, WEBP 파일을 선택해 주세요.');
    if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('20MB 이하 파일을 선택해 주세요.');
    if (file.type.startsWith('image/') && file.size > 5 * 1024 * 1024)
      throw new Error('이미지는 5MB 이하로 선택해 주세요.');
    let count;
    if (file.type === 'application/pdf') {
      count = await getPdfPageCount(file);
      if (count > 30) throw new Error('PDF는 30페이지 이하로 나누어 주세요.');
      $('pdf-page').replaceChildren(
        ...Array.from({ length: count }, (_, i) => {
          const o = node('option', String(i + 1) + '페이지');
          o.value = i + 1;
          return o;
        }),
      );
      $('pdf-options').hidden = false;
    }
    selectedFile = file;
    source = { title: file.name };
    document.querySelector('.selected-file-icon').textContent =
      file.type === 'application/pdf' ? 'PDF' : file.type.split('/')[1].toUpperCase();
    document.querySelector('.selected-file-name').textContent = file.name;
    document.querySelector('.selected-file-meta').textContent = [
      `${Math.max(1, Math.round(file.size / 1024))}KB`,
      count ? `${count}페이지` : '',
      '분석 준비 완료',
    ]
      .filter(Boolean)
      .join(' · ');
    $('file-card').hidden = false;
    $('file-status').textContent =
      file.type === 'application/pdf' ? '선택한 한 페이지를 분석해요.' : '분석에 동의하면 이미지를 전송해요.';
    if (file.type.startsWith('image/')) {
      filePreview = URL.createObjectURL(file);
      const img = node('img', undefined, 'file-preview');
      img.src = filePreview;
      img.alt = '가져온 이미지 전체 미리보기';
      $('file-card').after(img);
    }
  } catch (e) {
    $('file-status').textContent = e.message;
  } finally {
    busy = false;
    for (const id of ['file', 'sample', 'input-text']) $(id).disabled = false;
    $('run').disabled = !selectedFile && !$('input-text').value.trim();
  }
}
$('pdf-page').onchange = invalidate;
$('file').onchange = event => readFile(event.target.files[0]);
for (const type of ['dragenter', 'dragover'])
  $('drop').addEventListener(type, event => {
    event.preventDefault();
    $('drop').classList.add('dragging');
  });
for (const type of ['dragleave', 'drop'])
  $('drop').addEventListener(type, event => {
    event.preventDefault();
    $('drop').classList.remove('dragging');
  });
$('drop').addEventListener('drop', event => readFile(event.dataTransfer.files[0]));
$('extension-id').textContent = chrome.runtime.id;
route();
renderAll();
request('getItems')
  .then(saved => {
    items = saved;
    renderAll();
    route();
  })
  .catch(e => notify(e.message, true));
request('calendarStatus')
  .then(result => {
    calendarConnected = result.connected;
    renderAll();
  })
  .catch(() => {});
request('getReminderSettings')
  .then(({ settings, permission }) => {
    $('reminders-enabled').checked = settings.enabled;
    $('home-reminders').textContent = settings.enabled ? 'Chrome 알림 켜짐 · 설정' : '마감을 놓치지 않도록 알림 켜기';
    $('reminder-hour').value = settings.hour;
    $('event-reminder').checked = settings.eventMinutes !== 0;
    document
      .querySelectorAll('[name=reminder-day]')
      .forEach(x => (x.checked = settings.days.includes(Number(x.value))));
    if (permission !== 'granted')
      $('notification-help').textContent =
        'Chrome의 알림이 차단되어 있어요. 브라우저와 시스템 알림 설정을 허용해 주세요.';
  })
  .catch(e => notify(e.message));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.haezoomItems && Array.isArray(changes.haezoomItems.newValue)) {
    items = changes.haezoomItems.newValue;
    if (document.querySelector('.edit-form:not([hidden])')) {
      notify('목록이 갱신됐어요. 수정 중인 내용은 유지됩니다.');
      return;
    }
    renderAll();
  }
});

async function refreshHelperSetting() {
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: ['hz-global'] });
  const enabled = registered.length > 0;
  $('global-helper').textContent = enabled ? '모든 사이트에서 버튼 끄기' : '모든 사이트에서 버튼 켜기';
  $('global-helper').dataset.enabled = String(enabled);
}
$('global-helper').onclick = async () => {
  const b = $('global-helper');
  b.disabled = true;
  try {
    if (b.dataset.enabled === 'true') await request('disableGlobal');
    else {
      if (!(await chrome.permissions.request({ origins: ['https://*/*', 'http://*/*'] }))) return;
      if (!(await request('enableGlobal'))) throw new Error('사이트 접근 권한을 확인해 주세요.');
    }
    await refreshHelperSetting();
  } catch (error) {
    notify(error.message, true);
  } finally {
    b.disabled = false;
  }
};
refreshHelperSetting().catch(error => notify(error.message, true));
