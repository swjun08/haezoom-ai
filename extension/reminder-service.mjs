import {DEFAULT_REMINDERS,reminderPlan} from './reminders.mjs';
export function installReminderService(chrome){
  let queue=Promise.resolve();
  const run=(deliver=false)=>{
    const work=queue.then(async()=>{
      const stored=await chrome.storage.local.get(['haezoomItems','reminderSettings','reminderDelivered']);
      const items=stored.haezoomItems||[],remaining=items.filter(x=>!x.completed&&x.kind==='task').length;
      await chrome.action.setBadgeText({text:remaining?String(Math.min(remaining,999)):''});
      await chrome.action.setBadgeBackgroundColor({color:'#14171f'});
      const settings=stored.reminderSettings||DEFAULT_REMINDERS,now=Date.now();
      const delivered=Object.fromEntries(Object.entries(stored.reminderDelivered||{}).filter(([,t])=>t>now-35*86400000));
      const plan=reminderPlan(items,settings,delivered,now);let failed=false;
      if(deliver)for(const entry of plan.due){
        try{
          const schedule=entry.item.kind==='schedule';
          const title=entry.minutes?'일정 시작 30분 전 · 해줌':entry.days?`${schedule?'일정':'마감'} ${entry.days}일 전 · 해줌`:schedule?'오늘의 일정 · 해줌':'오늘 해야 할 일 · 해줌';
          await chrome.notifications.create(`haezoom:${entry.item.id}`,{type:'basic',iconUrl:'icon.png',title,message:entry.item.title,contextMessage:'눌러서 내용과 준비물을 확인하세요.',priority:1});
          delivered[entry.key]=now;
          // Older reminders for the same item are superseded by this one after a restart.
          for(const previous of reminderPlan([entry.item],settings,delivered,now).due)delivered[previous.key]=now;
        }catch{failed=true;}
      }
      if(deliver)await chrome.storage.local.set({reminderDelivered:delivered});
      await chrome.alarms.clear('haezoom-reminders');
      const retry=failed?now+15*60000:!deliver&&plan.due.length?now+1000:null;
      const next=[plan.next,retry].filter(Boolean).sort((a,b)=>a-b)[0];
      if(next)await chrome.alarms.create('haezoom-reminders',{when:Math.max(next,Date.now()+1000)});
    });queue=work.catch(console.error);return work;
  };
  chrome.alarms.onAlarm.addListener(a=>{if(a.name==='haezoom-reminders')run(true).catch(console.error);});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&(changes.haezoomItems||changes.reminderSettings))run().catch(console.error);});
  chrome.notifications.onClicked.addListener(async id=>{if(!id.startsWith('haezoom:'))return;const itemId=id.slice(8);await chrome.tabs.create({url:chrome.runtime.getURL('workspace.html#item/'+encodeURIComponent(itemId))});await chrome.notifications.clear(id);});
  chrome.runtime.onStartup.addListener(()=>run(true).catch(console.error));
  chrome.runtime.onInstalled.addListener(()=>run().catch(console.error));
  run().catch(console.error);return run;
}
