import {mergeEvents,validateEvents,derive,breakdown,studyStreak} from './engine.mjs';
const PREFIX='foco:v1:event:';
export class Store extends EventTarget {
  constructor(storage=globalThis.localStorage) { super(); this.storage=storage; this.events=[]; this.load(); }
  load() { const list=[]; for(let i=0;i<this.storage.length;i++){const key=this.storage.key(i);if(key?.startsWith(PREFIX)){let e;try{e=JSON.parse(this.storage.getItem(key));}catch{throw new Error('Há dados locais corrompidos. Não serão substituídos. Exporte uma cópia antes de restaurar.');}list.push(e);}} this.events=mergeEvents(validateEvents({schemaVersion:1,events:list}));return this.events; }
  async add(items) { this.load();let time=Math.max(Date.now(),Date.parse(this.events.at(-1)?.at||0)+1||0);const result=items.map(item=>({id:crypto.randomUUID(),at:new Date(time++).toISOString(),...item})); return this.merge(result); }
  async merge(events) {
    validateEvents({schemaVersion:1,events});
    // Each event has its own key: different tabs never rewrite a shared document.
    // A duplicate id is accepted only for the identical event.
    this.load(); const merged=mergeEvents(this.events,events);
    const added=[];
    try{for(const e of events){const key=PREFIX+e.id;if(this.storage.getItem(key)===null){this.storage.setItem(key,JSON.stringify(e));added.push(key);}}}
    catch(error){for(const key of added)this.storage.removeItem(key);this.load();throw error;}
    this.events=merged;this.dispatchEvent(new Event('change')); return events;
  }
  model(){return derive(this.events);}
  export(){const model=this.model();return {schemaVersion:1,app:'foco-concursos',...(this.storage.userId?{owner:{provider:'google',subject:this.storage.userId}}:{}),exportedAt:new Date().toISOString(),events:this.events,summary:model.stats,performance:{questions:Object.fromEntries(model.progress),flags:Object.fromEntries(model.flags),byDiscipline:breakdown(model.answers,'discipline'),bySubject:breakdown(model.answers,'subject'),byTopic:breakdown(model.answers,'topic'),studyStreak:studyStreak(model.answers),recentAnswers:model.answers.slice(-20),sessions:model.sessions}};}
}
