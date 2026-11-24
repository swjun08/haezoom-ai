import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeText, foldLine, icsFileName, makeIcs } from '../extension/ics.mjs';

const base = {
  id: '00112233-4455-4677-8899-aabbccddeeff',
  confirmed: true,
  needs_review: false,
  completed: false,
};
const schedule = {
  ...base,
  kind: 'schedule',
  title: '학부모 설명회',
  date: '2026-11-18',
  time: '오후 2시 30분',
  location: '본관 3층, 시청각실',
  details: '참석해 주세요.',
  source: { title: '학교 안내문', url: 'https://school.example/notice/1' },
};
const task = {
  ...base,
  id: '10112233-4455-4677-8899-aabbccddeeff',
  kind: 'task',
  title: '참가 동의서 제출',
  date: '2026-11-27',
  action: '담임 선생님께 제출',
  materials: ['참가 동의서'],
};
const unfolded = text => text.replace(/\r\n /g, '');
const now = new Date('2026-11-24T00:00:00Z');

test('시간이 있는 일정은 UTC 시각, 30분 전 알림으로 담는다', () => {
  const { text, count } = makeIcs([schedule], now);
  assert.equal(count, 1);
  const flat = unfolded(text);
  assert.match(flat, /BEGIN:VCALENDAR\r\nVERSION:2\.0/);
  assert.match(flat, /DTSTART:20261118T053000Z/);
  assert.match(flat, /DTEND:20261118T063000Z/);
  assert.match(flat, /LOCATION:본관 3층\\, 시청각실/);
  assert.match(flat, /URL:https:\/\/school\.example\/notice\/1/);
  assert.match(flat, /TRIGGER:-PT30M/);
  assert.match(flat, /UID:00112233-4455-4677-8899-aabbccddeeff@haezoom\.ai/);
  assert.ok(text.endsWith('END:VCALENDAR\r\n'));
});

test('마감 할 일은 종일 일정(다음 날 종료)과 하루 전 알림으로 담는다', () => {
  const flat = unfolded(makeIcs([task], now).text);
  assert.match(flat, /DTSTART;VALUE=DATE:20261127/);
  assert.match(flat, /DTEND;VALUE=DATE:20261128/);
  assert.match(flat, /TRIGGER:-P1D/);
  assert.match(flat, /CATEGORIES:할 일/);
});

test('확인 전·완료·날짜 없는 항목은 파일에 넣지 않는다', () => {
  const { text, count } = makeIcs(
    [task, { ...schedule, needs_review: true, confirmed: false }, { ...task, id: '20112233-4455-4677-8899-aabbccddeeff', completed: true }, { ...task, id: '30112233-4455-4677-8899-aabbccddeeff', date: '다음 주 금요일' }],
    now,
  );
  assert.equal(count, 1);
  assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, 1);
});

test('특수문자를 이스케이프하고 75바이트에서 한글을 깨뜨리지 않고 접는다', () => {
  assert.equal(escapeText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const line = 'DESCRIPTION:' + '가'.repeat(60);
  const folded = foldLine(line);
  for (const part of folded.split('\r\n')) assert.ok(new TextEncoder().encode(part).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ''), line);
});

test('파일 이름은 한 항목이면 제목, 여러 개면 날짜', () => {
  assert.equal(icsFileName([task]), 'haezoom-참가-동의서-제출.ics');
  assert.equal(icsFileName([task, schedule], now), 'haezoom-2026-11-24.ics');
});
