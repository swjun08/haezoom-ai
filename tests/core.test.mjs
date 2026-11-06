import test from 'node:test';
import assert from 'node:assert/strict';
import { validDate, validateAnalysis, makeItems } from '../extension/core.mjs';
import { samples } from '../extension/samples.mjs';

test('실제 달력 날짜만 확정 날짜로 인정한다', () => {
  for (const value of ['2026-11-12', '2028-02-29']) assert.equal(validDate(value), true);
  for (const value of ['2026-02-29', '2026-13-01', '11월 12일', null, '다음 금요일', '2026-11-12 ~ 2026-11-15']) assert.equal(validDate(value), false);
});
for (const [index, sample] of samples.entries()) test(`샘플 ${index + 1}: 상세 정보와 미확정 날짜를 유지한다`, () => {
  const checked = validateAnalysis(sample.result);
  assert.equal(checked.summary, sample.result.summary);
  const items = makeItems(sample.result, { title: '가상 문서' });
  assert.equal(items.length, sample.result.tasks.length + sample.result.schedules.length);
  for (const item of items) {
    assert.equal(item.confirmed, false); assert.equal(item.completed, false); assert.equal(item.source.title, '가상 문서'); assert.ok(item.id);
    if (!validDate(item.date)) assert.equal(item.needs_review, true);
  }
});
test('AI 출력에 잘못된 자료형이 있으면 거부한다', () => {
  for (const change of [{ materials: '신청서' }, { cost: -1 }, { cost: NaN }, { needs_review: 'false' }, { title: '' }]) {
    const result = structuredClone(samples[0].result); Object.assign(result.tasks[0], change);
    assert.throws(() => validateAnalysis(result));
  }
});
test('근거와 비용·준비물·출처를 UI 항목까지 유지한다', () => {
  const [item] = makeItems(samples[0].result, { title: '공지', url: 'https://school.example/notice' });
  assert.deepEqual(item.materials, samples[0].result.tasks[0].materials);
  assert.equal(item.cost, 15000); assert.equal(item.submission, '담임 선생님'); assert.ok(item.evidence);
});
