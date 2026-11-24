import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/date-hints.js';

const { suggestDates, referenceLabel } = globalThis.haezoomDateHints;
// 2026-11-24(화) 오전 9시 한국 시간
const ref = new Date('2026-11-24T00:00:00Z');
const first = text => suggestDates(text, ref)[0]?.date;

test('오늘·내일·모레와 며칠 뒤를 계산한다', () => {
  assert.equal(first('오늘까지'), '2026-11-24');
  assert.equal(first('내일 오전'), '2026-11-25');
  assert.equal(first('모레'), '2026-11-26');
  assert.equal(first('3일 후'), '2026-11-27');
  assert.equal(first('2주 뒤'), '2026-12-08');
});

test('이번 주·다음 주 요일은 월요일 시작 주 기준', () => {
  assert.equal(first('이번 주 금요일'), '2026-11-27');
  assert.equal(first('다음 주 금요일까지'), '2026-12-04');
  assert.equal(first('다음주 월요일'), '2026-11-30');
  assert.equal(first('다다음 주 수요일'), '2026-12-09');
  assert.equal(first('금요일까지'), '2026-11-27');
});

test('연도 없는 날짜는 가장 가까운 앞으로의 날짜, 지난 지 오래면 다음 해', () => {
  assert.equal(first('11월 27일(금)'), '2026-11-27');
  assert.equal(first('12/4'), '2026-12-04');
  assert.equal(first('1월 7일'), '2027-01-07');
  assert.equal(suggestDates('1월 7일', ref)[0].label, '2027년 1월 7일(목)');
  assert.equal(first('11월 20일'), '2026-11-20');
});

test('이번 달·다음 달과 일(日)만 있는 표현', () => {
  assert.equal(first('다음 달 5일'), '2026-12-05');
  assert.equal(first('30일까지'), '2026-11-30');
  assert.equal(first('10일까지'), '2026-12-10');
});

test('연도가 있는 원문은 그대로, 날짜가 아니면 후보 없음', () => {
  assert.equal(first('2026. 12. 2.(수) 출금일 전날까지'), '2026-12-02');
  assert.deepEqual(suggestDates('추후 안내', ref), []);
  assert.deepEqual(suggestDates('', ref), []);
  assert.equal(referenceLabel(ref), '11월 24일');
});
