// 날짜 도우미 — 모든 계산은 한국 시간 기준
const WD = ['일', '월', '화', '수', '목', '금', '토'];

export function todayKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  return new Date(kst.getFullYear(), kst.getMonth(), kst.getDate());
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** 오늘로부터 n일 뒤. weekday=true면 주말은 다음 월요일로 */
export function fromToday(n, { weekday = false, weekdayIs = null } = {}) {
  let d = addDays(todayKST(), n);
  if (weekdayIs !== null) { while (d.getDay() !== weekdayIs) d = addDays(d, 1); }
  else if (weekday) { while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1); }
  return d;
}

export const fmt = {
  long: d => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일(${WD[d.getDay()]})`,
  dot: d => `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.(${WD[d.getDay()]})`,
  md: d => `${d.getMonth() + 1}월 ${d.getDate()}일(${WD[d.getDay()]})`,
  mdShort: d => `${d.getMonth() + 1}/${d.getDate()}`,
  wd: d => WD[d.getDay()],
  iso: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
};

export function sameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function daysBetween(a, b) {
  return Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

/**
 * AI가 돌려준 날짜 문자열을 읽어요. 연도가 없으면 추정하지 않고 yearMissing으로 표시합니다.
 * 반환: { start, end, yearMissing, guess } — guess는 연도 없는 날짜의 '가장 가까운 다음 날짜' 후보(사용자 확인용)
 */
export function parseDateish(value) {
  const out = { start: null, end: null, yearMissing: false, guess: null };
  if (typeof value !== 'string' || !value.trim()) return out;
  const s = value.replace(/\([^)]*\)/g, ' ');
  const full = [...s.matchAll(/(20\d{2})\s*(?:-|\.|년)\s*(\d{1,2})\s*(?:-|\.|월)\s*(\d{1,2})/g)]
    .map(m => new Date(+m[1], +m[2] - 1, +m[3]));
  if (full.length) {
    out.start = full[0];
    if (full[1]) out.end = full[1];
    else {
      // "2027년 1월 7일~9일" 같은 범위
      const tail = s.slice(s.search(/[~∼–-]\s*\d/));
      const m = tail.match(/^[~∼–-]\s*(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일/);
      if (m) out.end = new Date(full[0].getFullYear(), m[1] ? +m[1] - 1 : full[0].getMonth(), +m[2]);
    }
    if (out.end && out.end < out.start) out.end = null;
    return out;
  }
  const md = s.match(/(\d{1,2})\s*(?:월|\/)\s*(\d{1,2})\s*일?/);
  if (md) {
    out.yearMissing = true;
    const t = todayKST();
    let g = new Date(t.getFullYear(), +md[1] - 1, +md[2]);
    if (daysBetween(t, g) < -30) g = new Date(t.getFullYear() + 1, +md[1] - 1, +md[2]);
    out.guess = g;
  }
  return out;
}

/** "오후 6시", "18:00", "오전 9시 30분" → {h, m} */
export function parseTime(value) {
  if (typeof value !== 'string') return null;
  let m = value.match(/(\d{1,2}):(\d{2})/);
  if (m) return { h: +m[1], m: +m[2] };
  m = value.match(/(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분|\s*반)?/);
  if (!m) return null;
  let h = +m[2];
  if (m[1] === '오후' && h < 12) h += 12;
  if (m[1] === '오전' && h === 12) h = 0;
  return { h, m: m[3] ? +m[3] : /반/.test(m[0]) ? 30 : 0 };
}

export function dday(date) {
  const n = daysBetween(todayKST(), date);
  if (n === 0) return '오늘';
  if (n > 0) return `D-${n}`;
  return '지남';
}
