import {AccountStorage,assertProgressOwner} from './account.mjs';
import {validateEvents} from './engine.mjs';
import {reconcileEvents,coversEvents} from './event-conflicts.mjs';

const eventPrefix='foco:v1:event:';
const managed=key=>key.startsWith(eventPrefix)||key.startsWith('foco:drive:');
const changed=()=>Object.assign(new Error('O histórico mudou em outra aba. Tentando preservar as alterações…'),{code:'JOURNAL_CHANGED'});
const entriesEvents=items=>validateEvents({schemaVersion:1,events:[...items].filter(([key])=>key.startsWith(eventPrefix)).map(([,value])=>JSON.parse(value))});

// One atomic IndexedDB record per account. Revision checks prevent competing
// tabs from replacing a newer journal with an older in-memory copy.
export async function openIndexedJournal(indexedDB){
  const db=await new Promise((resolve,reject)=>{
    const request=indexedDB.open('foco-study-journals',2);let blocked=false;
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains('accounts'))request.result.createObjectStore('accounts',{keyPath:'subject'});
      if(!request.result.objectStoreNames.contains('revisions')){
        const revisions=request.result.createObjectStore('revisions');
        const cursor=request.transaction.objectStore('accounts').openCursor();
        cursor.onsuccess=()=>{if(cursor.result){revisions.put(cursor.result.value.revision,cursor.result.key);cursor.result.continue();}};
      }
    };
    request.onsuccess=()=>{if(blocked){request.result.close();return;}resolve(request.result);};request.onerror=()=>reject(request.error);
    request.onblocked=()=>{blocked=true;reject(new Error('Feche as outras abas do Foco para preparar o armazenamento dos estudos.'));};
  });
  db.onversionchange=()=>db.close();
  return {
    read(subject,knownRevision){return new Promise((resolve,reject)=>{
      const tx=db.transaction(['accounts','revisions'],'readonly'),request=tx.objectStore('revisions').get(subject);let record;
      request.onsuccess=()=>{
        const revision=request.result||0;
        if(knownRevision===revision)record={subject,revision};
        else{const data=tx.objectStore('accounts').get(subject);data.onsuccess=()=>{record=data.result||{subject,revision:0,items:[]};};}
      };
      tx.oncomplete=()=>resolve(record);tx.onabort=tx.onerror=()=>reject(tx.error||request.error);
    });},
    commit(subject,expected,items){return new Promise((resolve,reject)=>{
      const tx=db.transaction(['accounts','revisions'],'readwrite'),store=tx.objectStore('accounts'),revisions=tx.objectStore('revisions'),request=revisions.get(subject);let conflict=false;
      request.onsuccess=()=>{if((request.result||0)!==expected){conflict=true;tx.abort();return;}store.put({subject,revision:expected+1,items:[...items]});revisions.put(expected+1,subject);};
      tx.oncomplete=()=>resolve(expected+1);tx.onabort=tx.onerror=()=>reject(conflict?changed():tx.error||request.error||new Error('Não foi possível salvar seus estudos.'));
    });},
    close(){db.close();}
  };
}

export class JournalStorage extends EventTarget{
  constructor(legacy,driver,{channelFactory=name=>typeof BroadcastChannel==='function'?new BroadcastChannel(name):null}={}){
    super();this.legacy=legacy;this.driver=driver;this.userId=legacy.userId;this.items=new Map();this.revision=0;this.closed=false;
    this.channel=channelFactory('foco-study-journals');
    if(this.channel)this.channel.onmessage=event=>{if(event.data?.subject===this.userId&&!this.closed)void this.refresh().then(()=>{if(!this.closed)this.dispatchEvent(new Event('change'));}).catch(error=>{this.error=error;});};
  }
  install(record){if(record.revision>=this.revision){this.revision=record.revision;this.items=new Map(record.items);}}
  keys(){return [...new Set([...this.legacy.keys(),...this.items.keys()])];}
  get length(){return this.keys().length;}
  key(index){return this.keys()[index]??null;}
  getItem(key){return managed(key)&&this.items.has(key)?this.items.get(key):this.legacy.getItem(key);}
  setItem(key,value){if(managed(key))throw new Error('O diário de estudos deve ser salvo em uma transação.');this.legacy.setItem(key,value);}
  removeItem(key){if(managed(key)&&this.items.has(key))throw new Error('O histórico persistente não pode ser apagado por uma alteração de preferências.');this.legacy.removeItem(key);}
  ownsKey(key){return this.legacy.ownsKey(key);}
  async refresh(){
    if(this.closed)return;
    // Older versions may still write localStorage. Merge those records before
    // removing any legacy copy, including unsent records in a Drive cache.
    for(let attempt=0;attempt<6;attempt++){
      const record=await this.driver.read(this.userId,this.revision),items=record.items?new Map(record.items):new Map(this.items),legacy=new Map(this.legacy.keys().filter(managed).map(key=>[key,this.legacy.getItem(key)]));
      if(!legacy.size){if(record.revision!==this.revision)entriesEvents(items);if(record.items)this.install(record);return;}
      const incoming=entriesEvents(legacy);
      for(const [key,value] of legacy)if(key.startsWith('foco:drive:')){
        const cache=JSON.parse(value);if(cache.pending?.document){assertProgressOwner(cache.pending.document,this.userId);incoming.push(...validateEvents(cache.pending.document));}
        if(!items.has(key))items.set(key,value);
      }
      const merged=await reconcileEvents(entriesEvents(items),incoming);
      for(const e of merged)items.set(eventPrefix+e.id,JSON.stringify(e));
      let revision;
      try{revision=await this.driver.commit(this.userId,record.revision,items);}catch(error){if(error.code==='JOURNAL_CHANGED')continue;throw error;}
      const verified=await this.driver.read(this.userId);
      if(verified.revision<revision||!coversEvents(entriesEvents(new Map(verified.items)),incoming))throw new Error('A cópia local dos estudos não pôde ser verificada. Os dados anteriores foram mantidos.');
      this.install(verified);
      for(const [key,value] of legacy)if(this.legacy.getItem(key)===value)this.legacy.removeItem(key);
      return;
    }
    throw changed();
  }
  async commitEvents(events){
    const revision=this.revision,items=new Map(this.items);
    this.serialized??=new WeakMap();
    for(const event of events){let raw=this.serialized.get(event);if(raw===undefined){raw=JSON.stringify(event);this.serialized.set(event,raw);}items.set(eventPrefix+event.id,raw);}
    const next=await this.driver.commit(this.userId,revision,items);this.install({revision:next,items});
    this.channel?.postMessage({subject:this.userId});
  }
  async setLargeItem(key,value){
    for(let attempt=0;attempt<6;attempt++){
      await this.refresh();const revision=this.revision,items=new Map(this.items);items.set(key,String(value));
      try{const next=await this.driver.commit(this.userId,revision,items);this.install({revision:next,items});return;}catch(error){if(error.code!=='JOURNAL_CHANGED')throw error;}
    }
    throw changed();
  }
  close(){this.closed=true;this.channel?.close();this.driver.close?.();}
}

export async function openAccountStorage(base,subject,{indexedDB=globalThis.indexedDB,driver,channelFactory}={}){
  const legacy=new AccountStorage(base,subject);
  if(!driver&&!indexedDB)return legacy;
  const storage=new JournalStorage(legacy,driver||await openIndexedJournal(indexedDB),{channelFactory});
  try{await storage.refresh();return storage;}catch(error){storage.close();throw error;}
}
