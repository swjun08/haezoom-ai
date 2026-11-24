// 애매한 날짜에 후보 날짜를 계산합니다. 자동으로 확정하지 않고, 사용자가 눌러야 입력돼요.
// 페이지 안 결과 창(일반 스크립트)과 워크스페이스(모듈)에서 함께 쓰려고 전역 객체로 내보냅니다.
(function (root) {
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const DAY = 86400000;

  /** 기준 시각의 한국 날짜를 UTC 자정 Date로 */
  function koreanDay(reference) {
    const time = reference instanceof Date ? reference.getTime() : Date.parse(reference);
    const kst = new Date((Number.isFinite(time) ? time : Date.now()) + 9 * 3600000);
    return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
  }
  const addDays = (date, n) => new Date(date.getTime() + n * DAY);
  const iso = date => date.toISOString().slice(0, 10);
  const valid = (y, m, d) => {
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
  };
  function label(date, base) {
    const text = `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일(${WEEKDAYS[date.getUTCDay()]})`;
    return date.getUTCFullYear() === base.getUTCFullYear() ? text : `${date.getUTCFullYear()}년 ${text}`;
  }
  /** 월요일 시작 주의 요일 날짜 (weekOffset 0 = 이번 주) */
  function weekday(base, target, weekOffset) {
    const mondayIndex = (base.getUTCDay() + 6) % 7;
    const monday = addDays(base, -mondayIndex);
    return addDays(monday, weekOffset * 7 + ((target + 6) % 7));
  }

  function candidates(text, base) {
    const s = String(text || '').replace(/\s+/g, ' ');
    const found = [];

    const full = s.match(/(20\d{2})\s*(?:년|[.\-/])\s*(\d{1,2})\s*(?:월|[.\-/])\s*(\d{1,2})/);
    if (full) {
      const date = valid(+full[1], +full[2], +full[3]);
      if (date) return [date];
    }

    const relative = { 오늘: 0, 금일: 0, 내일: 1, 익일: 1, 모레: 2, 내일모레: 2, 글피: 3 };
    const word = s.match(/(내일모레|오늘|금일|내일|익일|모레|글피)/);
    if (word) found.push(addDays(base, relative[word[1]]));

    const later = s.match(/(\d{1,3})\s*(일|주)\s*(?:후|뒤)/);
    if (later) found.push(addDays(base, +later[1] * (later[2] === '주' ? 7 : 1)));

    const week = s.match(/(다다음\s*주|다음\s*주|차주|이번\s*주|금주|이번)\s*([일월화수목금토])요일/);
    if (week) {
      const offset = /다다음/.test(week[1]) ? 2 : /다음|차주/.test(week[1]) ? 1 : 0;
      found.push(weekday(base, WEEKDAYS.indexOf(week[2]), offset));
    }

    const monthWord = s.match(/(이번|다음)\s*달\s*(\d{1,2})\s*일/);
    if (monthWord) {
      const shift = monthWord[1] === '다음' ? 1 : 0;
      const m = base.getUTCMonth() + shift;
      const date = valid(base.getUTCFullYear() + Math.floor(m / 12), (m % 12) + 1, +monthWord[2]);
      if (date) found.push(date);
    }

    const monthDay = s.match(/(?:^|[^\d])(\d{1,2})\s*(?:월\s*|\/)(\d{1,2})\s*일?/);
    if (!monthWord && monthDay) {
      let date = valid(base.getUTCFullYear(), +monthDay[1], +monthDay[2]);
      if (date && date < addDays(base, -30)) date = valid(base.getUTCFullYear() + 1, +monthDay[1], +monthDay[2]);
      if (date) found.push(date);
    }

    if (!week && !found.length) {
      const lone = s.match(/([일월화수목금토])요일/);
      if (lone) {
        const target = WEEKDAYS.indexOf(lone[1]);
        found.push(addDays(base, (target - base.getUTCDay() + 7) % 7));
      }
    }

    if (!found.length) {
      const dayOnly = s.match(/(?:^|[^\d월])(\d{1,2})\s*일\s*(?:까지|에|부터|\(|$)/);
      if (dayOnly) {
        let date = valid(base.getUTCFullYear(), base.getUTCMonth() + 1, +dayOnly[1]);
        if (!date || date < base) {
          const m = base.getUTCMonth() + 1;
          date = valid(base.getUTCFullYear() + Math.floor(m / 12), (m % 12) + 1, +dayOnly[1]);
        }
        if (date) found.push(date);
      }
    }
    return found;
  }

  /**
   * @param {string} text 원문 날짜 표현 (예: '다음 주 금요일', '11월 27일(금)')
   * @param {Date|string} reference 기준 시각 — 공지를 가져온 때
   * @returns {{ date: string, label: string }[]} 최대 2개
   */
  function suggestDates(text, reference = new Date()) {
    const base = koreanDay(reference);
    const seen = new Set();
    return candidates(text, base)
      .filter(date => date >= addDays(base, -60) && date <= addDays(base, 400))
      .filter(date => (seen.has(iso(date)) ? false : seen.add(iso(date))))
      .slice(0, 2)
      .map(date => ({ date: iso(date), label: label(date, base) }));
  }

  function referenceLabel(reference = new Date()) {
    const base = koreanDay(reference);
    return `${base.getUTCMonth() + 1}월 ${base.getUTCDate()}일`;
  }

  root.haezoomDateHints = { suggestDates, referenceLabel };
})(globalThis);
