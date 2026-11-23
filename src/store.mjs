import {mergeEvents,validateEvents,derive,breakdown,studyStreak,sameEvent,isStudyEvent,studyEpoch,currentProgressEpoch} from './engine.mjs';
import {reconcileEvents} from './event-conflicts.mjs';
import {bankProgressPlan} from './bank-progress.mjs';
const PREFIX='foco:v1:event:';
const resetError=()=>Object.assign(new Error('Seu progresso foi reiniciado. Inicie uma nova sessão de estudo.'),{code:'PROGRESS_RESET'});
const deletedError=()=>Object.assign(new Error('Esta sessão foi excluída. Inicie outra sessão para continuar seus estudos.'),{code:'SESSION_DELETED'});
export class Store extends EventTarget {
  constructor(storage=globalThis.localStorage) { super(); this.storage=storage; this.events=[];this.systemBanks=[];this.records=new Map();this.load(); }
  load() {
    const keys=this.storage.keys?.()||Array.from({length:this.storage.length},(_,i)=>this.storage.key(i)),records=new Map(),list=[];
    let changed=false;
    for(const key of keys)if(key?.startsWith(PREFIX)){
      const raw=this.storage.getItem(key),previous=this.records.get(key);let event;
      if(previous?.raw===raw)event=previous.event;
      else{
        let parsed;try{parsed=JSON.parse(raw);}catch{throw new Error('Há dados locais corrompidos. Não serão substituídos. Exporte uma cópia antes de restaurar.');}
        event=validateEvents({schemaVersion:1,events:[parsed]})[0];changed=true;
      }
      records.set(key,{raw,event});list.push(event);
    }
    if(list.length>100000)throw new Error('Arquivo de progresso inválido ou versão incompatível.');
    if(changed||records.size!==this.records.size)this.events=mergeEvents(list);
    this.records=records;return this.events;
  }
  async add(items) {
    await this.storage.refresh?.();
    this.load();const epoch=currentProgressEpoch(this.events),hasStudy=items.some(isStudyEvent),resetting=items.some(e=>e.type==='progress-reset');
    const targets=items.filter(e=>e.type==='answer'||e.type==='session'&&!e.session.deleted).map(e=>e.type==='answer'?e.sessionId:e.session.id);
    if(targets.length&&targets.some(id=>this.model().deletedSessions.has(id)))throw deletedError();
    const timeline=resetting?this.events.filter(e=>e.type==='progress-reset'):hasStudy?this.events.filter(e=>isStudyEvent(e)&&studyEpoch(e)===epoch):this.events;
    let time=Math.max(Date.now(),Date.parse(timeline.at(-1)?.at||0)+1||0);
    const result=items.map(item=>{
      let event={id:crypto.randomUUID(),at:new Date(time++).toISOString(),...item};
      if(isStudyEvent(item)){
        const expected=Object.hasOwn(item,'progressEpoch')?item.progressEpoch:item.type==='session'?item.session?.progressEpoch??null:epoch;
        if(expected!==epoch)throw resetError();
        if(expected!==null||Object.hasOwn(item,'progressEpoch'))event={...event,progressEpoch:expected};
      }
      return event;
    });
    const saved=await this.merge(result);
    if(hasStudy){await this.storage.refresh?.();if(currentProgressEpoch(this.load())!==epoch)throw resetError();if(targets.some(id=>this.model().deletedSessions.has(id)))throw deletedError();}
    return saved;
  }
  async resetProgress(){return this.add([{type:'progress-reset'}]);}
  async deleteSession(id){
    await this.storage.refresh?.();this.load();const session=this.model().sessions.find(s=>s.id===id);
    if(!session)return false;
    await this.add([{type:'session',session:{...session,deleted:true,abandoned:true}}]);return true;
  }
  async associateBank(fromBankId,toBankId){
    this.load();const model=this.model(),source=model.personalBanks.find(b=>b.id===fromBankId),target=model.systemBanks.find(b=>b.id===toBankId);
    if(source?.linkedTo){if(source.linkedTo.toBankId===toBankId)return false;throw new Error('Este banco já está associado. Desfaça a associação antes de escolher outro.');}
    const plan=bankProgressPlan(source,target),from=model.bankHistory.findLast(e=>e.type==='bank'&&e.bank.id===fromBankId);
    if(!plan||!from||!target)throw new Error('Não foi possível confirmar que todas as questões são equivalentes. Seus estudos foram mantidos.');
    const revision=target.revision||'1',snapshot=model.bankHistory.some(e=>e.type==='system-bank-snapshot'&&e.bank.id===target.id&&e.revision===revision);
    const events=[];
    if(!snapshot)events.push({type:'system-bank-snapshot',revision,bank:target});
    if(target.personalState&&target.personalState!=='enabled')events.push({type:'system-bank-preference',bankId:target.id,value:'enabled'});
    events.push({type:'bank-progress-link',...plan,fromEventId:from.id,toRevision:revision});
    await this.add(events);return true;
  }
  async unlinkBank(fromBankId){return this.add([{type:'bank-progress-unlink',fromBankId}]);}
  async merge(events) {
    const incoming=validateEvents({schemaVersion:1,events});
    // Recheck after hashing; persistent journals also enforce an atomic revision
    // check so another tab cannot lose events appended while reconciliation runs.
    for(let attempt=0;attempt<6;attempt++){
      await this.storage.refresh?.();
      const before=this.load(),ids=new Set(before.map(e=>e.id));
      // New IDs cannot conflict. Previously validated records need no full
      // cloning/hashing on every cursor movement. Imports/collisions retain the
      // complete reconciliation and recovery path.
      const appendOnly=new Set(incoming.map(e=>e.id)).size===incoming.length&&incoming.every(e=>!ids.has(e.id)&&e.type!=='event-conflict')&&!before.some(e=>e.type==='event-conflict');
      const merged=appendOnly?mergeEvents(before,incoming):await reconcileEvents(before,incoming),current=this.load();
      if(merged.length>100000)throw new Error('Arquivo de progresso inválido ou versão incompatível.');
      if(before!==current)continue;
      if(this.storage.commitEvents){
        try{await this.storage.commitEvents(merged);}catch(error){if(error.code==='JOURNAL_CHANGED')continue;throw error;}
        this.load();this.dispatchEvent(new Event('change'));return incoming;
      }
      const previous=[];
      // Preserve the originals before replacing any active version. All writes
      // are rolled back if quota/storage fails, including changed active keys.
      const ordered=[...merged].sort((a,b)=>Number(b.type==='event-conflict')-Number(a.type==='event-conflict'));
      try{for(const event of ordered){
        const key=PREFIX+event.id,old=this.storage.getItem(key);
        if(old!==null&&sameEvent(JSON.parse(old),event))continue;
        this.storage.setItem(key,JSON.stringify(event));previous.push({key,old});
      }}catch(error){for(const {key,old} of previous.reverse()){if(old===null)this.storage.removeItem(key);else this.storage.setItem(key,old);}this.load();throw error;}
      this.load();this.dispatchEvent(new Event('change'));return incoming;
    }
    throw new Error('O histórico está mudando em outra aba. Aguarde um instante e tente novamente; seus dados foram preservados.');
  }
  setSystemBanks(banks){this.systemBanks=structuredClone(banks);return this.model();}
  model(){
    const minute=Math.floor(Date.now()/60000),cache=this.derived;
    if(!cache||cache.events!==this.events||cache.banks!==this.systemBanks||cache.minute!==minute)this.derived={events:this.events,banks:this.systemBanks,minute,value:derive(this.events,Date.now(),this.systemBanks)};
    return this.derived.value;
  }
  export(){const model=this.model();return {schemaVersion:1,app:'foco-concursos',...(this.storage.userId?{owner:{provider:'google',subject:this.storage.userId}}:{}),exportedAt:new Date().toISOString(),events:this.events,summary:model.stats,performance:{questions:Object.fromEntries(model.progress),flags:Object.fromEntries(model.flags),byDiscipline:breakdown(model.answers,'discipline'),bySubject:breakdown(model.answers,'subject'),byTopic:breakdown(model.answers,'topic'),studyStreak:studyStreak(model.answers),recentAnswers:model.answers.slice(-20),sessions:model.sessions}};}
}
