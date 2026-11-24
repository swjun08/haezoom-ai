import {analyzeText,analyzeDocument} from '../extension/api.mjs';import fs from 'node:fs/promises';
const cases=[
['제출과 행사 분리','[가상 문서] 2026년 11월 25일 오전 9시 과학관 현장체험학습을 갑니다. 장소는 시립과학관입니다. 참가 신청서는 2026년 11월 20일까지 담임교사에게 제출하세요. 준비물은 도시락과 물이며 참가비 18000원은 2026년 11월 23일까지 납부합니다.'],
['과제 마감','[가상 수업 공지] 정보 프로젝트 보고서를 2026년 11월 26일 오후 4시까지 클래스룸에 PDF로 제출하세요. 2026년 11월 24일 정보 수업에서 중간 발표를 합니다.'],
['회의와 준비','[가상 안내] 동아리 회의는 2026년 11월 23일 오후 3시 시청각실입니다. 발표 자료는 2026년 11월 22일까지 동아리 게시판에 올리세요.'],
['연도 없는 날짜','[가상 공지] 11월 30일까지 참가 신청서를 제출해 주세요. 다음 주 금요일 모임의 장소와 시간은 추후 안내합니다.'],
['할 일 없는 안내','[가상 안내] 도서관에서 학생들이 추천한 책을 소개합니다. 이번 전시는 독서의 즐거움을 나누기 위한 전시입니다. 별도의 신청이나 제출은 없습니다.']];
const results=[];for(const [name,text]of cases){const start=Date.now();try{const result=await analyzeText(text);results.push({name,seconds:(Date.now()-start)/1000,result});console.log(name,JSON.stringify({tasks:result.tasks.length,schedules:result.schedules.length}));}catch(e){results.push({name,error:e.message});console.log(name,e.message);}}
for(const [name,path,type]of [['PDF 8쪽','../haezoom-demo-site/dist/assets/school-notices.pdf','application/pdf'],['포착 이미지','../haezoom-demo-site/dist/assets/notice-1.png','image/png']]){const start=Date.now();try{const file=new File([await fs.readFile(path)],path.split('/').pop(),{type});const result=await analyzeDocument(file);results.push({name,seconds:(Date.now()-start)/1000,result});console.log(name,JSON.stringify({tasks:result.tasks.length,schedules:result.schedules.length}));}catch(e){results.push({name,error:e.message});console.log(name,e.message);}}
await fs.mkdir('docs/verification',{recursive:true});await fs.writeFile('docs/verification/live-ai-2026-11-17.json',JSON.stringify(results,null,2));
