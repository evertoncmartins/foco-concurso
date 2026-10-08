import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {DriveSync} from '../src/drive.mjs';
class MemoryStorage{data=new Map();get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}}
const document=events=>({schemaVersion:1,app:'foco-concursos',events});
const flag=(id,key)=>({id,at:'2026-10-08T12:00:00.000Z',type:'flag',key,flag:'favorite',value:true});
function server(){
  const files=new Map();let sequence=0;const calls=[];let failUpload=false,unknownSuccess=false,incomplete=false;
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
  const fetch=async(url,options={})=>{const u=new URL(url);calls.push({url,method:options.method||'GET'});
    if(u.pathname.endsWith('generateIds'))return json({ids:[`remote-${++sequence}`]});
    if(u.pathname==='/drive/v3/files'){return json({incompleteSearch:incomplete,files:[...files].map(([id,v])=>({id,name:v.name,size:JSON.stringify(v.document).length,mimeType:'application/json'}))});}
    if(u.pathname.startsWith('/drive/v3/files/')&&u.searchParams.get('alt')==='media'){const file=files.get(u.pathname.split('/').at(-1));return file?json(file.document):json({},404);}
    if(u.pathname==='/upload/drive/v3/files'){
      if(failUpload){failUpload=false;return json({},500);}
      const boundary=options.headers['Content-Type'].split('boundary=')[1];const segments=options.body.split(`--${boundary}`).filter(x=>x.includes('Content-Type'));const content=segments.map(x=>JSON.parse(x.split('\r\n\r\n').slice(1).join('\r\n\r\n').trim()));
      const [meta,data]=content;if(files.has(meta.id))return json({},409);files.set(meta.id,{name:meta.name,document:data});
      if(unknownSuccess){unknownSuccess=false;throw new TypeError('connection lost after upload');}
      return json({id:meta.id,name:meta.name});
    }
    return json({},404);
  };
  return {files,calls,fetch,setFailUpload:()=>{failUpload=true;},setUnknownSuccess:()=>{unknownSuccess=true;},setIncomplete:()=>{incomplete=true;}};
}
function syncClient(storage){const store=new Store(storage);const drive=new DriveSync(store,{folderId:'test-folder',clientId:''});drive.token='fixture-only';drive.expires=Date.now()+3600000;return {store,drive};}
test('Drive: cria JSON automaticamente e só confirma após sucesso HTTP',async()=>{const remote=server();const storage=new MemoryStorage();const {store,drive}=syncClient(storage);globalThis.localStorage=storage;const old=globalThis.fetch;globalThis.fetch=remote.fetch;try{await store.merge([flag('a','bank:q1')]);await drive.sync();assert.equal(remote.files.size,1);assert.equal(drive.status,'synced');const saved=[...remote.files.values()][0].document;assert.equal(saved.events[0].id,'a');assert.equal(storage.getItem('foco:drive:test-folder').includes('fixture-only'),false);}finally{globalThis.fetch=old;}});
test('Drive: dispositivos independentes unem eventos sem reescrever arquivos',async()=>{const remote=server(),a=syncClient(new MemoryStorage()),b=syncClient(new MemoryStorage());const old=globalThis.fetch;globalThis.fetch=remote.fetch;try{globalThis.localStorage=a.store.storage;await a.store.merge([flag('a','bank:q1')]);await a.drive.sync();globalThis.localStorage=b.store.storage;await b.store.merge([flag('b','bank:q2')]);await b.drive.sync();assert.equal(b.store.events.length,2);globalThis.localStorage=a.store.storage;await a.drive.sync();assert.equal(a.store.events.length,2);assert.equal(remote.files.size,2);assert(!remote.calls.some(c=>c.method==='PATCH'||c.method==='DELETE'));}finally{globalThis.fetch=old;}});
test('Drive: upload falho preserva lote pendente e retenta com o mesmo ID',async()=>{const remote=server(),{store,drive}=syncClient(new MemoryStorage());globalThis.localStorage=store.storage;const old=globalThis.fetch;globalThis.fetch=remote.fetch;try{await store.merge([flag('a','bank:q1')]);remote.setFailUpload();await assert.rejects(()=>drive.sync(),/falha 500/);assert.equal(drive.status,'error');const pending=JSON.parse(store.storage.getItem('foco:drive:test-folder')).pending;assert(pending);assert.equal(store.events.length,1);await drive.sync();assert(remote.files.has(pending.id));assert.equal(remote.files.size,1);assert.equal(drive.status,'synced');}finally{globalThis.fetch=old;}});
test('Drive: conclusão incerta do upload não cria arquivo duplicado',async()=>{const remote=server(),{store,drive}=syncClient(new MemoryStorage());globalThis.localStorage=store.storage;const old=globalThis.fetch;globalThis.fetch=remote.fetch;try{await store.merge([flag('a','bank:q1')]);remote.setUnknownSuccess();await assert.rejects(()=>drive.sync());assert.equal(remote.files.size,1);await drive.sync();assert.equal(remote.files.size,1);assert.equal(store.events.length,1);assert.equal(drive.status,'synced');}finally{globalThis.fetch=old;}});
test('Drive: arquivo inválido ou busca incompleta não vira progresso vazio',async()=>{const remote=server(),{store,drive}=syncClient(new MemoryStorage());globalThis.localStorage=store.storage;const old=globalThis.fetch;globalThis.fetch=remote.fetch;try{await store.merge([flag('local','bank:q1')]);remote.files.set('bad',{name:'foco-progresso-bad.json',document:{schemaVersion:2,events:[]}});await assert.rejects(()=>drive.sync(),/inválido/);assert.equal(store.events.length,1);assert.equal(remote.files.size,1);remote.files.clear();remote.setIncomplete();await assert.rejects(()=>drive.sync(),/incompleta/);assert.equal(remote.files.size,0);}finally{globalThis.fetch=old;}});
test('Drive: token expirado exige reconectar, sem enviar ou apagar',async()=>{const {store,drive}=syncClient(new MemoryStorage());await store.merge([flag('local','bank:q1')]);drive.expires=Date.now()-1;await assert.rejects(()=>drive.request('https://www.googleapis.com/drive/v3/files'),/expirou/);assert.equal(drive.status,'expired');assert.equal(store.events.length,1);assert.equal(drive.token,null);});
