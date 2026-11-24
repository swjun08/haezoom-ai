import {chromium} from 'playwright';import assert from 'node:assert/strict';import {mkdtemp,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve} from 'node:path';
const profile=await mkdtemp(resolve(tmpdir(),'haezoom-service-')),extension=resolve('extension'),output=process.env.UI_OUTPUT||'/tmp/haezoom-ui-v3';await mkdir(output,{recursive:true});
const context=await chromium.launchPersistentContext(profile,{headless:true,channel:'chromium',args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:1440,height:900}});
try {
const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`chrome-extension://${id}/workspace.html#tasks`);
await page.locator('#new-item').click();await page.getByLabel('새 할 일 제목').fill('시연 · 현장체험학습 신청서 제출');await page.getByLabel('새 할 일 마감일').fill('2026-11-20');await page.getByRole('button',{name:'추가',exact:true}).click();await page.locator('#task-list .task-card').waitFor();
const stored=await page.evaluate(()=>chrome.storage.local.get('haezoomItems'));const item=stored.haezoomItems[0];assert.equal(item.confirmed,true);
await page.waitForFunction(async()=>await chrome.action.getBadgeText({})==='1');
const other=await context.newPage();await other.goto(`chrome-extension://${id}/workspace.html#tasks`);await other.locator('#task-list .task-card').waitFor();
const rejected=await page.evaluate(async item=>chrome.runtime.sendMessage({type:'updateItem',payload:{id:item.id,revision:0,patch:{title:'충돌'}}}),item);assert.equal(rejected.ok,false);
const invalid=await page.evaluate(async item=>chrome.runtime.sendMessage({type:'updateItem',payload:{id:item.id,patch:{completed:'true'}}}),item);assert.equal(invalid.ok,false);
await page.goto(`chrome-extension://${id}/workspace.html#settings`);await page.locator('#reminders-enabled').check();await page.getByRole('button',{name:'설정 저장'}).click();await page.waitForFunction(async()=>Boolean((await chrome.storage.local.get('reminderSettings')).reminderSettings?.enabled));
await page.screenshot({path:resolve(output,'20-settings.png'),fullPage:true});
await page.goto(`chrome-extension://${id}/workspace.html#calendar`);await page.locator('.calendar-item').waitFor();await page.screenshot({path:resolve(output,'21-calendar.png'),fullPage:true});
await page.getByRole('button',{name:'다음 달'}).click();assert.match(await page.locator('#month-title').textContent(),/12월/);await page.getByRole('button',{name:'오늘',exact:true}).click();
// Mock only Google's boundary; exercise real service-worker storage, queues, event persistence and recovery.
await worker.evaluate(()=>{
 globalThis.calendarCalls=[];globalThis.remoteEvents={};globalThis.failOnce=true;
 chrome.identity.getAuthToken=async()=>({token:'test-token',grantedScopes:['https://www.googleapis.com/auth/calendar.events']});chrome.identity.removeCachedAuthToken=async()=>{};
 globalThis.originalFetch=fetch;globalThis.fetch=async(url,options={})=>{
  if(!String(url).startsWith('https://www.googleapis.com/calendar/'))return originalFetch(url,options);
  calendarCalls.push({url,method:options.method||'GET'});
  if(failOnce){failOnce=false;return new Response('{}',{status:401});}
  const id=String(url).split('/').pop();if(options.method==='POST'){const body=JSON.parse(options.body);remoteEvents[body.id]=body;return Response.json(body);}
  if(options.method==='DELETE'){delete remoteEvents[id];return new Response(null,{status:204});}
  if(options.method==='PATCH'){remoteEvents[id]={...remoteEvents[id],...JSON.parse(options.body)};return Response.json(remoteEvents[id]);}
  return remoteEvents[id]?Response.json(remoteEvents[id]):new Response('{}',{status:404});
 };
});
await page.evaluate(()=>chrome.storage.local.set({calendarEnabled:true}));
let result=await page.evaluate(async id=>chrome.runtime.sendMessage({type:'syncCalendar',payload:{itemIds:[id]}}),item.id);assert.equal(result.data.synced,1);assert.ok(result.data.items[0].calendarFingerprint);
result=await page.evaluate(async id=>chrome.runtime.sendMessage({type:'syncCalendar',payload:{itemIds:[id]}}),item.id);assert.equal(result.data.synced,1);assert.equal(await worker.evaluate(()=>Object.keys(remoteEvents).length),1);
await worker.evaluate(()=>{Object.values(remoteEvents)[0].status='cancelled';});
result=await page.evaluate(async id=>chrome.runtime.sendMessage({type:'syncCalendar',payload:{itemIds:[id]}}),item.id);assert.equal(result.data.synced,1);assert.match(result.data.items[0].calendarEventId,/v1$/);
result=await page.evaluate(async id=>chrome.runtime.sendMessage({type:'removeCalendarEvent',payload:{id}}),item.id);assert.equal(result.ok,true);assert.equal(result.data[0].calendarEventId,undefined);
// Restore after export, keep existing; reject malformed backup atomically.
result=await page.evaluate(async item=>chrome.runtime.sendMessage({type:'importBackup',payload:{version:3,items:[item]}}),item);assert.equal(result.data.added,0);
await page.goto(`chrome-extension://${id}/workspace.html#tasks`);await page.locator('#task-list .task-card').waitFor();await page.screenshot({path:resolve(output,'22-tasks.png'),fullPage:true});
await page.getByRole('button',{name:'완료 표시'}).click();await page.waitForFunction(async()=>await chrome.action.getBadgeText({})==='');await other.locator('#status-filter').selectOption('completed');await other.locator('#task-list .task-card.done').waitFor();
// Demo site routes and exact provided PDF.
const demo=await context.newPage();demo.on('pageerror',error=>errors.push(error.message));await demo.goto('http://127.0.0.1:4173/classroom/');await demo.locator('.post').first().waitFor();await demo.screenshot({path:resolve(output,'30-demo-stream.png'),fullPage:false});
await demo.getByRole('link',{name:'수업',exact:true}).click();assert.equal(await demo.locator('.assignment').count(),5);await demo.screenshot({path:resolve(output,'31-demo-classwork.png'),fullPage:false});
await demo.goto('http://127.0.0.1:4173/classroom/#pdf');await demo.locator('#pdf-image').waitFor();await demo.waitForFunction(()=>document.querySelector('#pdf-image').complete);assert.ok(await demo.locator('#pdf-image').evaluate(e=>e.naturalWidth>500));await demo.getByRole('button',{name:'다음 페이지'}).click();assert.match(await demo.locator('#pdf-counter').textContent(),/2 \/ 8/);await demo.screenshot({path:resolve(output,'32-demo-pdf.png'),fullPage:false});
for(const route of ['stream','classwork','people','home','calendar','notice-assignment']){await demo.goto('http://127.0.0.1:4173/classroom/#'+route);await demo.setViewportSize({width:390,height:844});assert.equal(await demo.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,route+' fits mobile');}
assert.deepEqual(errors,[]);console.log('PASS: persistence/two windows, revision conflict, input rejection, badge, reminder settings, calendar month, mocked Google 401 refresh/idempotency/410 recovery/delete, backup dedup, demo routes/PDF/mobile.');
}finally{await context.close();}
