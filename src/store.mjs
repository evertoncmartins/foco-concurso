import {mergeEvents,validateEvents,derive,breakdown,studyStreak,sameEvent} from './engine.mjs';
import {reconcileEvents} from './event-conflicts.mjs';
const PREFIX='foco:v1:event:';
export class Store extends EventTarget {
  constructor(storage=globalThis.localStorage) { super(); this.storage=storage; this.events=[]; this.load(); }
  load() { const list=[]; for(let i=0;i<this.storage.length;i++){const key=this.storage.key(i);if(key?.startsWith(PREFIX)){let e;try{e=JSON.parse(this.storage.getItem(key));}catch{throw new Error('Há dados locais corrompidos. Não serão substituídos. Exporte uma cópia antes de restaurar.');}list.push(e);}} this.events=mergeEvents(validateEvents({schemaVersion:1,events:list}));return this.events; }
  async add(items) { this.load();let time=Math.max(Date.now(),Date.parse(this.events.at(-1)?.at||0)+1||0);const result=items.map(item=>({id:crypto.randomUUID(),at:new Date(time++).toISOString(),...item})); return this.merge(result); }
  async merge(events) {
    const incoming=validateEvents({schemaVersion:1,events});
    // Each event has its own key: different tabs never rewrite a shared document.
    // Recheck after hashing: another tab may append events while it is in flight.
    for(let attempt=0;attempt<6;attempt++){
      const before=this.load(),merged=await reconcileEvents(before,incoming),current=this.load();
      if(before.length!==current.length||before.some((event,index)=>!sameEvent(event,current[index])))continue;
      const previous=[];
      // Preserve the originals before replacing any active version. All writes
      // are rolled back if quota/storage fails, including changed active keys.
      const ordered=[...merged].sort((a,b)=>Number(b.type==='event-conflict')-Number(a.type==='event-conflict'));
      try{for(const event of ordered){
        const key=PREFIX+event.id,old=this.storage.getItem(key);
        if(old!==null&&sameEvent(JSON.parse(old),event))continue;
        this.storage.setItem(key,JSON.stringify(event));previous.push({key,old});
      }}catch(error){for(const {key,old} of previous.reverse()){if(old===null)this.storage.removeItem(key);else this.storage.setItem(key,old);}this.load();throw error;}
      this.events=merged;this.dispatchEvent(new Event('change'));return incoming;
    }
    throw new Error('O histórico está mudando em outra aba. Aguarde um instante e tente novamente; seus dados foram preservados.');
  }
  model(){return derive(this.events);}
  export(){const model=this.model();return {schemaVersion:1,app:'foco-concursos',...(this.storage.userId?{owner:{provider:'google',subject:this.storage.userId}}:{}),exportedAt:new Date().toISOString(),events:this.events,summary:model.stats,performance:{questions:Object.fromEntries(model.progress),flags:Object.fromEntries(model.flags),byDiscipline:breakdown(model.answers,'discipline'),bySubject:breakdown(model.answers,'subject'),byTopic:breakdown(model.answers,'topic'),studyStreak:studyStreak(model.answers),recentAnswers:model.answers.slice(-20),sessions:model.sessions}};}
}
