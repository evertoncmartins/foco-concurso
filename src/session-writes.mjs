import {validateEvents} from './engine.mjs';

const prefix='foco:session-outbox:';
const pack=event=>event.type==='session'?{...event,session:Object.fromEntries(Object.entries(event.session).filter(([key])=>!['queue','questionSources'].includes(key)))}:event;
function unpack(events,model){
  return events.flatMap(event=>{
    const id=event.type==='session'?event.session.id:event.sessionId,base=model.sessions.find(s=>s.id===id);
    // A reset or deletion supersedes pending actions, including from offline tabs.
    if(!base||model.deletedSessions.has(id)||(event.progressEpoch??null)!==model.progressEpoch)return [];
    return [event.type==='session'?{...event,session:{...event.session,queue:base.queue,...(base.questionSources?{questionSources:base.questionSources}:{})}}:event];
  });
}

// A small, account-scoped write-ahead copy precedes the visual update. Full
// journal transactions run in order in a later task; reload can replay the same
// IDs after a crash, an interrupted transaction or a temporary storage failure.
export class SessionWrites{
  constructor(store,{onStatus=()=>{},onError=()=>{},delay=0}={}){
    this.store=store;this.onStatus=onStatus;this.onError=onError;this.delay=delay;
    this.key=prefix+crypto.randomUUID();this.pending=[];this.records=[];this.lastTime=0;this.closed=false;
  }
  enqueue(items){
    if(this.closed)throw new Error('A conta conectada mudou. Retome a sessão.');
    if(!items.length)return [];
    let time=Math.max(Date.now(),this.lastTime+1,Date.parse(this.store.events.at(-1)?.at||0)+1||0);
    const events=items.map(item=>({id:crypto.randomUUID(),at:new Date(time++).toISOString(),...item,progressEpoch:item.progressEpoch??item.session?.progressEpoch??null}));
    // The journal still validates the full payload. This copy omits only the
    // immutable queue/origins already durably saved when the session was created.
    const key=this.key+':'+events[0].id;
    this.store.storage.setItem(key,JSON.stringify({schemaVersion:1,events:events.map(pack)}));
    this.pending.push(...events);this.records.push({key,events});this.lastTime=time;this.error=null;this.onStatus('saving');
    clearTimeout(this.timer);this.timer=setTimeout(()=>{void this.flush().catch(()=>{});},this.delay);
    return events;
  }
  async flush(){
    clearTimeout(this.timer);
    if(this.running)return this.running;
    this.running=this.drain();
    try{return await this.running;}finally{this.running=null;}
  }
  async drain(){
    try{
      while(this.pending.length&&!this.closed){
        const batch=[...this.pending],records=[...this.records];await this.store.add(batch);
        const remaining=this.pending.slice(batch.length);
        // Remove the recovery copy only after the atomic journal commit.
        for(const {key} of records)this.store.storage.removeItem(key);
        this.pending=remaining;this.records=this.records.slice(records.length);
      }
      this.error=null;this.onStatus('saved');
    }catch(error){
      if(['PROGRESS_RESET','SESSION_DELETED'].includes(error.code)){
        for(const {key} of this.records)this.store.storage.removeItem(key);
        this.pending=[];this.records=[];
      }
      this.error=error;this.onStatus('error');this.onError(error);throw error;
    }
  }
  async close(){clearTimeout(this.timer);if(this.running)await this.running.catch(()=>{});this.closed=true;}
  static async recover(store){
    const storage=store.storage,keys=storage.keys?.()||Array.from({length:storage.length},(_,i)=>storage.key(i));
    const records=[];
    for(const key of keys.filter(key=>key?.startsWith(prefix))){
      let document;try{document=JSON.parse(storage.getItem(key));}catch{throw new Error('Há um salvamento pendente que não pôde ser lido. Os dados foram preservados.');}
      if(document?.schemaVersion!==1||!Array.isArray(document.events))throw new Error('Salvamento pendente inválido. Os dados foram preservados.');
      if(document.events.some(event=>!event||!['session','answer'].includes(event.type)||typeof event.id!=='string'||typeof event.at!=='string'||event.type==='session'&&!event.session))throw new Error('Salvamento pendente inválido. Os dados foram preservados.');
      records.push({key,events:document.events});
    }
    const pending=records.flatMap(record=>record.events).sort((a,b)=>String(a.at).localeCompare(String(b.at))||String(a.id).localeCompare(String(b.id)));
    const events=validateEvents({schemaVersion:1,events:unpack(pending,store.model())});
    if(events.length)await store.add(events);
    for(const {key} of records)storage.removeItem(key);
  }
}
