import test from 'node:test';
import assert from 'node:assert/strict';
import {makeItems,validateAnalysis} from '../extension/core.mjs';
import {validateItem,importBackup} from '../extension/item-store.mjs';
import {makeGoogleEvent} from '../extension/calendar.mjs';
import {samples} from '../extension/samples.mjs';
test('할 일과 일정 모두 정리 내용, 문서 요약, 개인 메모를 보존한다',()=>{
 const result=structuredClone(samples[0].result);
 result.tasks[0].notes='도시락은 전날 준비\n신청서는 가방에 넣기';
 const item={...makeItems(result,{title:'학교 공지'})[0],confirmed:true,needs_review:false,date:'2026-11-20'};
 assert.equal(item.notes,result.tasks[0].notes);assert.equal(item.documentSummary,result.summary);validateItem(item);
 const restored=importBackup({version:3,items:[item]})[0];assert.equal(restored.notes,item.notes);assert.equal(restored.documentSummary,item.documentSummary);
 const event=makeGoogleEvent(item);assert.ok(event.description.includes(item.notes));
 const scheduleResult={summary:'학교 설명회',tasks:[],schedules:[{title:'학교 설명회 참석',date:'2026-11-20',time:'14:00',location:'강당',details:'신입생 교육과정 안내',evidence:'11월 20일 14시 강당',needs_review:false,notes:'질문 목록 가져가기'}]};
 const schedule={...makeItems(scheduleResult,{title:'설명회 안내'})[0],confirmed:true};validateItem(schedule);assert.equal(schedule.notes,'질문 목록 가져가기');assert.ok(makeGoogleEvent(schedule).description.includes('질문 목록 가져가기'));
});
test('메모 유효성 검사와 기존 데이터 호환',()=>{
 const result=structuredClone(samples[0].result);result.tasks[0].notes={bad:true};assert.throws(()=>validateAnalysis(result));result.tasks[0].notes='a'.repeat(5001);assert.throws(()=>validateAnalysis(result));delete result.tasks[0].notes;const item=makeItems(result,{title:'공지'})[0];assert.equal(item.notes,'');delete item.notes;delete item.documentSummary;validateItem(item);
});
