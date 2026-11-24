import { calendarDates, scheduledTime } from './calendar.mjs';
export const DEFAULT_REMINDERS = Object.freeze({ enabled:false, hour:9, days:[3,1,0], eventMinutes:30, enabledAt:0 });
export function validateReminderSettings(value) {
  if (!value || typeof value.enabled!=='boolean' || !Number.isInteger(value.hour) || value.hour<0 || value.hour>23 || !Array.isArray(value.days) || !value.days.length || value.days.some(day=>![0,1,3].includes(day)) || (value.eventMinutes!==undefined && ![0,30].includes(value.eventMinutes))) throw new Error('알림 시간과 시점을 확인해 주세요.');
  return {enabled:value.enabled,hour:value.hour,days:[...new Set(value.days)].sort((a,b)=>b-a),eventMinutes:value.eventMinutes??30};
}
export function koreanDate(now=Date.now()){return new Date(now+9*3600000).toISOString().slice(0,10);}
export function reminderPlan(items,settings,delivered={},now=Date.now()) {
  if(!settings.enabled)return {due:[],next:null};
  const candidates=[];
  for(const item of items){
    if(item.completed||!item.confirmed||item.needs_review||item.reminderEnabled===false)continue;
    const dates=calendarDates(item);if(!dates||dates.start<koreanDate(now))continue;
    const time=item.kind==='schedule'?scheduledTime(item.time):null;
    const begins=time?Date.parse(`${dates.start}T${time}:00+09:00`):null;
    // An already-started event must not produce a late "starting soon" reminder.
    if(begins&&begins<=now)continue;
    const add=(key,when,days,minutes=0)=>{if(delivered[key]||when<(settings.enabledAt||0)||when<now-86400000)return;candidates.push({key,when,item,days,minutes});};
    for(const days of settings.days){
      const when=Date.parse(`${dates.start}T${String(settings.hour).padStart(2,'0')}:00:00+09:00`)-days*86400000;
      if(begins&&when>=begins)continue;
      add(`${item.id}:${dates.start}:${days}`,when,days);
    }
    if(begins&&(settings.eventMinutes??30))add(`${item.id}:${dates.start}:${time}:30m`,begins-30*60000,0,30);
  }
  candidates.sort((a,b)=>a.when-b.when);
  const dueByItem=new Map();for(const entry of candidates.filter(x=>x.when<=now))dueByItem.set(entry.item.id,entry);
  return {due:[...dueByItem.values()],next:candidates.find(x=>x.when>now)?.when??null};
}
