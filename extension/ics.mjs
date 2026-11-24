// 캘린더 파일(.ics) 만들기 — Google 로그인 없이 Apple·Google·Outlook·삼성 캘린더에 가져갈 수 있어요.
// Google 등록과 같은 규칙(makeGoogleEvent)으로 날짜·시간·설명을 만들고, 날짜를 확인한 미완료 항목만 담습니다.
import { eligibleForCalendar, makeGoogleEvent } from './calendar.mjs';

const PRODID = '-//Haezoom AI//Haezoom Calendar Export//KO';

/** RFC 5545 텍스트 이스케이프 */
export function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/** 한 줄을 75바이트(UTF-8) 단위로 접습니다. 한글이 중간에서 잘리지 않게 문자 단위로 셉니다. */
export function foldLine(line) {
  const encoder = new TextEncoder();
  const parts = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length ? 74 : 75; // 이어지는 줄은 맨 앞 공백 1바이트를 뺍니다.
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.map((part, index) => (index ? ` ${part}` : part)).join('\r\n');
}

const compactDate = value => value.replaceAll('-', '');
const compactDateTime = iso =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');

function eventLines(item, stamp) {
  const event = makeGoogleEvent(item);
  const lines = ['BEGIN:VEVENT', `UID:${item.id}@haezoom.ai`, `DTSTAMP:${stamp}`];
  if (event.start.date) {
    lines.push(
      `DTSTART;VALUE=DATE:${compactDate(event.start.date)}`,
      `DTEND;VALUE=DATE:${compactDate(event.end.date)}`,
    );
  } else {
    lines.push(`DTSTART:${compactDateTime(event.start.dateTime)}`, `DTEND:${compactDateTime(event.end.dateTime)}`);
  }
  lines.push(`SUMMARY:${escapeText(event.summary)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (item.location) lines.push(`LOCATION:${escapeText(item.location)}`);
  if (item.source?.url && /^https?:\/\//.test(item.source.url)) lines.push(`URL:${item.source.url}`);
  lines.push(`CATEGORIES:${item.kind === 'task' ? '할 일' : '일정'}`);
  // 마감은 하루 전, 시간이 정해진 일정은 30분 전에 캘린더 앱이 한 번 더 알려 줍니다.
  const trigger = event.start.dateTime ? '-PT30M' : '-P1D';
  lines.push(
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(event.summary)}`,
    `TRIGGER:${trigger}`,
    'END:VALARM',
    'END:VEVENT',
  );
  return lines;
}

/** 캘린더에 넣을 수 있는 항목만 골라 .ics 내용을 만듭니다. */
export function makeIcs(items, now = new Date()) {
  const eligible = (Array.isArray(items) ? items : [items]).filter(eligibleForCalendar);
  const stamp = compactDateTime(now.toISOString());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:해줌 AI',
    'X-WR-TIMEZONE:Asia/Seoul',
  ];
  for (const item of eligible) lines.push(...eventLines(item, stamp));
  lines.push('END:VCALENDAR');
  return { text: lines.map(foldLine).join('\r\n') + '\r\n', count: eligible.length };
}

export function icsFileName(items, now = new Date()) {
  const list = Array.isArray(items) ? items : [items];
  if (list.length === 1 && list[0]?.title) {
    const safe = list[0].title
      .replace(/[\\/:*?"<>|\s]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 40);
    return `haezoom-${safe || 'item'}.ics`;
  }
  const day = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  return `haezoom-${day}.ics`;
}
