import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountStorage} from '../src/account.mjs';
import {DriveSettings} from '../src/drive-settings.mjs';
import {DriveSync} from '../src/drive.mjs';
import {Store} from '../src/store.mjs';
import {validateBank} from '../src/engine.mjs';
import {readFile} from 'node:fs/promises';

const bank=validateBank(JSON.parse(await readFile(new URL('../src/lei-8112.json',import.meta.url))));

class MemoryStorage {
  data=new Map();get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}
  getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
function server(){
  const files=new Map(),calls=[];let sequence=0,failUpload=false,unknownSuccess=false,failList=false;
  const fetch=async(url,options={})=>{
    const u=new URL(url),owner=options.headers.Authorization.replace('Bearer token-','');calls.push({u,method:options.method||'GET',options,owner});
    if(u.pathname.endsWith('/generateIds'))return json({ids:[`file-${++sequence}`]});
    if(u.pathname==='/drive/v3/files'){
      if(failList)return json({},503);
      const space=u.searchParams.get('spaces'),q=u.searchParams.get('q');
      const filtered=[...files.values()].filter(f=>space==='appDataFolder'?f.space===space&&f.owner===owner:f.space==='drive'&&q.includes(`'${f.parent}'`)&&(!q.includes('name contains')||q.includes('foco-progresso-')&&f.name.startsWith('foco-progresso-')));
      return json({files:filtered.map(f=>({id:f.id,name:f.name,size:JSON.stringify(f.document).length,mimeType:'application/json',modifiedTime:f.modifiedTime,ownedByMe:f.owner===owner}))});
    }
    if(u.pathname==='/upload/drive/v3/files'){
      if(failUpload){failUpload=false;return json({},500);}
      const boundary=options.headers['Content-Type'].split('boundary=')[1];
      const [meta,document]=options.body.split(`--${boundary}`).filter(x=>x.includes('Content-Type')).map(x=>JSON.parse(x.split('\r\n\r\n').slice(1).join('\r\n\r\n').trim()));
      if(files.has(meta.id))return json({},409);
      const parent=meta.parents[0];files.set(meta.id,{...meta,parent,space:parent==='appDataFolder'?'appDataFolder':'drive',owner,document,modifiedTime:new Date(1700000000000+(++sequence)*1000).toISOString()});
      if(unknownSuccess){unknownSuccess=false;throw new TypeError('lost after success');}
      return json({id:meta.id});
    }
    if(u.pathname.startsWith('/drive/v3/files/')){
      const id=u.pathname.split('/').at(-1);
      if(u.searchParams.get('alt')==='media'){const f=files.get(id);return f?json(f.document):json({},404);}
      if(id==='invalid')return json({id,mimeType:'text/plain',capabilities:{canAddChildren:false}});
      return json({id,name:'Minha pasta',mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:true}});
    }
    return json({},404);
  };
  return {files,calls,fetch,failUpload:()=>failUpload=true,unknownSuccess:()=>unknownSuccess=true,failList:()=>failList=true};
}
function client(subject='111',base=new MemoryStorage()){
  const storage=new AccountStorage(base,subject),account={profile:{sub:subject},token:`token-${subject}`,expires:Date.now()+3600000,generation:0,canAppData:true,canDrive:true};
  return {base,storage,account,settings:new DriveSettings(storage,account)};
}
async function withServer(fn){const old=globalThis.fetch,remote=server();globalThis.fetch=remote.fetch;try{await fn(remote);}finally{globalThis.fetch=old;}}
const authorization=c=>({profile:c.account.profile,token:c.account.token,expires:c.account.expires,canAppData:true,canDrive:true});
const configurationFiles=r=>[...r.files.values()].filter(f=>f.space==='appDataFolder');

test('configuração privada usa appDataFolder e é recuperada em um navegador vazio',()=>withServer(async remote=>{
  const a=client();await a.settings.save('pasta-A');
  const file=configurationFiles(remote)[0];assert.deepEqual(file.parents,['appDataFolder']);assert.equal(file.document.owner.subject,'111');
  const b=client();assert.equal((await b.settings.restore()).folderId,'pasta-A');assert.equal(b.settings.status,'saved');
  assert(remote.calls.some(c=>c.u.searchParams.get('spaces')==='appDataFolder'));assert(remote.calls.some(c=>c.u.searchParams.get('space')==='appDataFolder'));
  assert(!JSON.stringify([...a.base.data]).includes('token-111'));assert(!JSON.stringify(file.document).includes('token-111'));
}));
test('configuração é da conta conectada e não da conta que criou o app',()=>withServer(async remote=>{
  const base=new MemoryStorage(),a=client('111',base),b=client('222',base);await a.settings.save('pasta-A');await b.settings.save('pasta-B');
  assert.equal((await client('111').settings.restore()).folderId,'pasta-A');assert.equal((await client('222').settings.restore()).folderId,'pasta-B');assert.equal(await client('333').settings.restore(),null);
  remote.failUpload();await assert.rejects(()=>a.settings.save('pasta-pendente'));assert(a.settings.pending());assert.equal(b.settings.pending(),null);
}));
test('novo dispositivo recupera pasta, respostas e favoritos antes de enviar alterações',()=>withServer(async remote=>{
  const a=client(),ca={folderId:''},sa=new Store(a.storage),da=new DriveSync(sa,ca,a.account,a.settings);
  const q=bank.questions[0],key=`${bank.id}:${q.id}`;
  await sa.merge([{id:'bank-A',at:'2026-10-08T12:00:00.000Z',type:'bank',bank},{id:'answer-A',at:'2026-10-08T12:01:00.000Z',type:'answer',key,sessionId:'session-A',selected:q.correctOption,correctOption:q.correctOption,correct:true,discipline:q.discipline,subject:q.subject,topic:q.topic},{id:'favorite-A',at:'2026-10-08T12:02:00.000Z',type:'flag',key,flag:'favorite',value:true}]);
  await da.useAuthorization(authorization(a),{folderId:'pasta-A'});assert.equal(ca.folderId,'pasta-A');assert.equal(da.status,'synced');
  const b=client(),cb={folderId:''},sb=new Store(b.storage),db=new DriveSync(sb,cb,b.account,b.settings);
  await db.useAuthorization(authorization(b));assert.equal(cb.folderId,'pasta-A');assert.deepEqual(new Set(sb.events.map(e=>e.id)),new Set(['bank-A','answer-A','favorite-A']));assert.equal(db.status,'synced');assert.equal(sb.model().stats.correct,1);assert.equal(sb.model().stats.favorites,1);assert.equal(sb.model().banks.length,1);
  assert.equal(configurationFiles(remote).length,1);assert.equal([...remote.files.values()].filter(f=>f.space==='drive').length,1);
}));
test('navegador antigo segue a configuração remota sem sobrescrever a pasta mais recente',()=>withServer(async remote=>{
  const other=client();await other.settings.save('pasta-antiga');await other.settings.save('pasta-nova');
  const stale=client(),config={folderId:'pasta-antiga'},drive=new DriveSync(new Store(stale.storage),config,stale.account,stale.settings);
  await drive.useAuthorization(authorization(stale));assert.equal(config.folderId,'pasta-nova');assert.equal(configurationFiles(remote).length,2);
  assert(!remote.calls.some(c=>c.method==='PATCH'||c.method==='DELETE'));
}));
test('pasta local antiga é migrada após validar permissão, sem exigir novo link',()=>withServer(async remote=>{
  const c=client(),config={folderId:'pasta-legada'},d=new DriveSync(new Store(c.storage),config,c.account,c.settings);
  await d.useAuthorization(authorization(c));assert.equal((await client().settings.restore()).folderId,'pasta-legada');assert.equal(configurationFiles(remote).length,1);
}));
test('pasta inválida não vira configuração remota nem recebe progresso',()=>withServer(async remote=>{
  const c=client(),config={folderId:'original'},d=new DriveSync(new Store(c.storage),config,c.account,c.settings);
  await assert.rejects(()=>d.useAuthorization(authorization(c),{folderId:'invalid'}),/proprietária/);assert.equal(config.folderId,'original');assert.equal(remote.files.size,0);assert.equal(d.token,null);
}));
test('falha de leitura não é interpretada como configuração vazia e não causa migração',()=>withServer(async remote=>{
  const c=client(),config={folderId:'local'},d=new DriveSync(new Store(c.storage),config,c.account,c.settings);remote.failList();
  await assert.rejects(()=>d.useAuthorization(authorization(c)),/503/);assert.equal(config.folderId,'local');assert.equal(remote.files.size,0);assert.equal(d.token,null);
}));
test('upload falho retoma o mesmo ID e só confirma configuração após sucesso',()=>withServer(async remote=>{
  const c=client();remote.failUpload();await assert.rejects(()=>c.settings.save('pasta-A'),/500/);const pending=c.settings.pending();assert(pending);assert.equal(c.settings.status,'error');
  await c.settings.save('pasta-A');assert.equal(c.settings.pending(),null);assert(remote.files.has(pending.id));assert.equal(configurationFiles(remote).length,1);
}));
test('upload com resposta perdida é confirmado na recarga sem duplicar a configuração',()=>withServer(async remote=>{
  const c=client();remote.unknownSuccess();await assert.rejects(()=>c.settings.save('pasta-A'),/lost/);assert(c.settings.pending());
  const reloaded=client('111',c.base);assert.equal((await reloaded.settings.restore()).folderId,'pasta-A');assert.equal(reloaded.settings.pending(),null);assert.equal(configurationFiles(remote).length,1);
}));
test('escolha offline antiga não substitui mudança remota sem nova escolha explícita',()=>withServer(async remote=>{
  const a=client(),b=client();await a.settings.save('pasta-A');remote.failUpload();await assert.rejects(()=>a.settings.save('pasta-pendente'));
  await b.settings.save('pasta-B');await assert.rejects(()=>a.settings.restore(),/outro dispositivo/);await assert.rejects(()=>a.settings.save('pasta-pendente'),/outro dispositivo/);
  assert.equal((await client().settings.restore()).folderId,'pasta-B');await a.settings.save('pasta-pendente',{explicit:true});assert.equal((await client().settings.restore()).folderId,'pasta-pendente');
}));
test('mudanças simultâneas preservam snapshots e chegam a uma escolha determinística',()=>withServer(async remote=>{
  const a=client(),b=client();await Promise.allSettled([a.settings.save('pasta-A'),b.settings.save('pasta-B')]);assert.equal(configurationFiles(remote).length,2);
  const x=await client().settings.restore(),y=await client().settings.restore();assert.equal(x.folderId,y.folderId);assert(['pasta-A','pasta-B'].includes(x.folderId));
}));
test('configuração de outra conta ou documento malformado não substitui pasta local',()=>withServer(async remote=>{
  const c=client();await c.settings.save('pasta-A');const file=configurationFiles(remote)[0];file.document.owner.subject='222';await assert.rejects(()=>c.settings.restore(),/outra conta/);
  file.document.owner.subject='111';file.document.folderId="x' in parents";await assert.rejects(()=>c.settings.restore(),/ID/);
}));
test('permissão negada e logout durante leitura não aplicam configuração',async()=>{
  const c=client();c.account.canAppData=false;await assert.rejects(()=>c.settings.restore(),/Autorize/);
  c.account.canAppData=true;const old=globalThis.fetch;globalThis.fetch=async()=>{c.account.generation++;return json({files:[]});};
  try{await assert.rejects(()=>c.settings.restore(),/mudou/);assert.equal(c.settings.latest,null);}finally{globalThis.fetch=old;}
  c.settings.close();await assert.rejects(()=>c.settings.restore(),/encerrada/);
});
