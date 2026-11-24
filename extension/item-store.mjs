export function mergeItems(existing, incoming) {
  if (!Array.isArray(existing) || !Array.isArray(incoming) || incoming.length > 100) {
    throw new Error('저장할 항목 목록이 올바르지 않습니다.');
  }
  const items = structuredClone(existing);
  let added = 0;
  for (const item of incoming) {
    if (!item || typeof item.id !== 'string' || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 500 || JSON.stringify(item).length > 20000) {
      throw new Error('저장할 항목 내용이 올바르지 않습니다.');
    }
    const duplicate = items.some(old => old.id === item.id || (old.title === item.title && old.date === item.date && old.source?.title === item.source?.title));
    if (!duplicate) { items.push(structuredClone(item)); added++; }
  }
  if (items.length > 1000) throw new Error('저장 가능한 항목 수를 초과했습니다.');
  return { items, added };
}

export function validateItem(item) {
  if (!item || typeof item.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id) || !['task','schedule'].includes(item.kind)) throw new Error('항목 형식이 올바르지 않습니다.');
  if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 500) throw new Error('제목은 1~500자로 입력해 주세요.');
  for (const field of ['action','details','notes','documentSummary','submission','location','time','evidence','date','endDate','originalDate','endTime']) if (item[field] != null && (typeof item[field] !== 'string' || item[field].length > 5000)) throw new Error('항목 내용을 확인해 주세요.');
  for (const field of ['confirmed','completed','needs_review']) if (typeof item[field] !== 'boolean') throw new Error('확인 상태가 올바르지 않습니다.');
  if(item.reminderEnabled!==undefined && typeof item.reminderEnabled!=='boolean')throw new Error('알림 상태를 확인해 주세요.');
  if (item.materials != null && (!Array.isArray(item.materials) || item.materials.length>100 || item.materials.some(x=>typeof x!=='string'||x.length>5000))) throw new Error('준비물을 확인해 주세요.');
  if (item.cost != null && (typeof item.cost!=='number'||!Number.isFinite(item.cost)||item.cost<0)) throw new Error('비용은 0 이상의 숫자로 입력해 주세요.');
  if (item.source != null && (typeof item.source!=='object'||typeof item.source.title!=='string'||item.source.title.length>5000|| (item.source.url != null && (typeof item.source.url!=='string'||!/^https?:\/\//.test(item.source.url)||item.source.url.length>5000)))) throw new Error('출처 정보가 올바르지 않습니다.');
  if (JSON.stringify(item).length>20000) throw new Error('항목 내용이 너무 큽니다.');
  return item;
}
export function importBackup(payload, newId = ()=>crypto.randomUUID()) {
  if (!payload || payload.version!==3 || !Array.isArray(payload.items) || payload.items.length>1000) throw new Error('해줌에서 내려받은 백업 파일을 선택해 주세요.');
  return payload.items.map(raw=>{
    const item={};
    for(const field of ['kind','title','date','endDate','endTime','reminderEnabled','originalDate','time','location','action','details','notes','documentSummary','materials','cost','submission','evidence','source','confirmed','completed','needs_review','createdAt']) if(raw[field]!==undefined) item[field]=structuredClone(raw[field]);
    Object.assign(item,{id:newId(),revision:1});
    return validateItem(item);
  });
}
