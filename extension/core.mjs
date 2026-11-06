export function validDate(value) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function boundedText(value, name, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || value.length > 5000) throw new Error(`${name} 형식이 올바르지 않습니다.`);
  return value.trim();
}

export function validateAnalysis(result) {
  if (!result || !Array.isArray(result.tasks) || !Array.isArray(result.schedules) || result.tasks.length + result.schedules.length > 100) throw new Error('분석 결과 항목 형식이 올바르지 않습니다.');
  const summary = boundedText(result.summary, '요약');
  const normalize = (item, kind) => {
    if (!item || typeof item.needs_review !== 'boolean') throw new Error('검토 상태가 없습니다.');
    const title = boundedText(item.title, '제목');
    if (!title) throw new Error('항목 제목이 없습니다.');
    const date = boundedText(kind === 'task' ? item.deadline : item.date, '날짜', true);
    const common = { title, evidence: boundedText(item.evidence, '근거'), needs_review: item.needs_review || !validDate(date) };
    if (kind === 'schedule') return { ...common, date, time: boundedText(item.time, '시간', true), location: boundedText(item.location, '장소', true), details: boundedText(item.details, '설명') };
    if (!Array.isArray(item.materials) || item.materials.length > 100 || (item.cost !== null && (typeof item.cost !== 'number' || !Number.isFinite(item.cost) || item.cost < 0))) throw new Error('준비물 또는 비용 형식이 올바르지 않습니다.');
    return { ...common, deadline: date, action: boundedText(item.action, '행동'), materials: item.materials.map(value => boundedText(value, '준비물')), cost: item.cost, submission: boundedText(item.submission, '제출처', true) };
  };
  return { summary, tasks: result.tasks.map(item => normalize(item, 'task')), schedules: result.schedules.map(item => normalize(item, 'schedule')) };
}

export function makeItems(result, source, newId = () => crypto.randomUUID()) {
  const checked = validateAnalysis(result);
  return [ ...checked.tasks.map(item => ({ ...item, kind: 'task', date: item.deadline })), ...checked.schedules.map(item => ({ ...item, kind: 'schedule' })) ].map(item => ({ ...item, id: newId(), source, confirmed: false, completed: false, revision: 1, createdAt: new Date().toISOString() }));
}
