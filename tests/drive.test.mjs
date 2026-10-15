import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {DriveSync} from '../src/drive.mjs';
import {AccountStorage} from '../src/account.mjs';
import {coversEvents} from '../src/event-conflicts.mjs';
import {longBank} from './helpers/long-bank.mjs';
import {GoogleAccount} from '../src/auth.mjs';

class MemoryStorage{data=new Map();get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
const document=(events,subject)=>({schemaVersion:1,app:'foco-concursos',...(subject?{owner:{provider:'google',subject}}:{}),events});
const flag=(id,key=`bank:${id}`)=>({id,at:'2026-10-08T12:00:00.000Z',type:'flag',key,flag:'favorite',value:true});
const ids=file=>file.document.events.map(e=>e.id).sort();
function barrier(count){let release;const waiting=new Promise(resolve=>{release=resolve;});return async()=>{if(--count===0)release();await waiting;};}
function server(){
  const files=new Map(),calls=[];let sequence=0;
  const state={files,calls,failWrite:false,unknownSuccess:false,incomplete:false,beforeUpdate:null,beforeTrash:null,afterCreate:null,corruptWrite:false,missingEtag:false,failTrash:false};
  const etag=(id,file)=>`"${id}:${file.version||1}"`;
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
  const multipart=options=>{
    const boundary=options.headers['Content-Type'].split('boundary=')[1];
    return options.body.split(`--${boundary}`).filter(x=>x.includes('Content-Type')).map(x=>JSON.parse(x.split('\r\n\r\n').slice(1).join('\r\n\r\n').trim()));
  };
  state.live=()=>[...files].filter(([,file])=>!file.trashed);
  state.seed=(id,name,events,subject)=>files.set(id,{name,document:document(events,subject),version:1});
  state.fetch=async(url,options={})=>{
    const u=new URL(url),method=options.method||'GET',id=u.pathname.split('/').at(-1);
    calls.push({url,method,ifMatch:options.headers?.['If-Match']});
    if(u.pathname.endsWith('generateIds'))return json({ids:[`remote-${++sequence}`]});
    if(u.pathname==='/drive/v3/files')return json({incompleteSearch:state.incomplete,files:state.live().map(([id,file])=>({id,name:file.name,size:Buffer.byteLength(JSON.stringify(file.document),'utf8'),mimeType:'application/json',ownedByMe:file.ownedByMe!==false}))});
    if(u.pathname.startsWith('/drive/v3/files/')&&u.searchParams.get('alt')==='media')return files.has(id)?json(files.get(id).document):json({},404);
    if(u.pathname.startsWith('/drive/v2/files/')){
      const file=files.get(id);if(!file)return json({},404);
      if(method==='GET')return json({id,etag:state.missingEtag?undefined:etag(id,file),title:file.name,fileSize:Buffer.byteLength(JSON.stringify(file.document),'utf8'),ownedByMe:file.ownedByMe!==false,parents:[{id:'test-folder'}],labels:{trashed:!!file.trashed}});
      if(method==='PATCH'){
        if(state.failTrash){state.failTrash=false;return json({},500);}
        if(state.beforeTrash)await state.beforeTrash(id,file);
        if(options.headers['If-Match']!==etag(id,file))return json({},412);
        file.trashed=JSON.parse(options.body).labels.trashed;file.version=(file.version||1)+1;return json({id});
      }
    }
    if(u.pathname.startsWith('/upload/drive/')){
      if(method==='PUT'&&state.beforeUpdate)await state.beforeUpdate(id,files.get(id));
      if(state.failWrite){state.failWrite=false;return json({},500);}
      const [meta,data]=multipart(options);
      if(method==='POST'){
        if(files.has(meta.id))return json({},409);
        files.set(meta.id,{name:meta.name,document:data,version:1});
        if(state.afterCreate)await state.afterCreate(meta.id);
      }else{
        const file=files.get(id);if(!file)return json({},404);
        if(options.headers['If-Match']!==etag(id,file))return json({},412);
        file.name=meta.title;file.document=state.corruptWrite?document([]):data;file.version=(file.version||1)+1;
      }
      if(state.unknownSuccess){state.unknownSuccess=false;throw new TypeError('connection lost after upload');}
      return json({id:meta.id||id});
    }
    return json({},404);
  };
  return state;
}
function syncClient(subject){const storage=subject?new AccountStorage(new MemoryStorage(),subject):new MemoryStorage(),store=new Store(storage),drive=new DriveSync(store,{folderId:'test-folder',clientId:''});drive.token='fixture-only';drive.expires=Date.now()+3600000;return {store,drive};}
async function withRemote(run){const remote=server(),old=globalThis.fetch;globalThis.fetch=remote.fetch;try{await run(remote);}finally{globalThis.fetch=old;}}

test('Drive: sessão expirada renova e salva 30 ações pendentes no único arquivo sem perder progresso',()=>withRemote(async remote=>{
  const {store,drive}=syncClient('111'),account=new GoogleAccount('fixture.apps.googleusercontent.com');
  Object.assign(account,{profile:{sub:'111',email:'test@example.test',email_verified:true,name:'Teste'},token:'expired-fixture',expires:Date.now()-1000,canDrive:true,canAppData:true,canRefresh:true,redirectEnabled:true});
  drive.account=account;drive.token=account.token;drive.expires=account.expires;
  await store.merge(Array.from({length:30},(_,i)=>flag(`pending-${i}`)));let renewals=0;
  globalThis.fetch=async(url,options)=>url==='/api/auth/refresh'?(renewals++,Response.json({authorization:{profile:account.profile,token:'renewed-fixture',expires:Date.now()+3600000,canDrive:true,canAppData:true,canRefresh:true}})):remote.fetch(url,options);
  const before=JSON.stringify(store.events);await drive.sync();
  assert.equal(renewals,1);assert.equal(drive.status,'synced');assert.equal(remote.live().length,1);assert.equal(remote.live()[0][1].document.events.length,30);
  assert.equal(JSON.stringify(store.events),before);await drive.sync();assert.equal(renewals,1);assert.equal(remote.live().length,1);
}));

test('Drive: reset sincroniza na mesma conta sem reativar etapa antiga nem alterar outra conta',()=>withRemote(async remote=>{
  const first=syncClient('reset-alpha'),second=syncClient('reset-alpha'),foreign=syncClient('reset-beta');
  await first.store.merge([flag('before')]);await first.drive.sync();await second.drive.sync();
  await foreign.store.merge([flag('foreign')]);await foreign.drive.sync();
  const foreignBefore=JSON.stringify(foreign.store.events),principal=remote.live().find(([,f])=>f.name==='foco-progresso-reset-alpha-principal.json')[0];
  await first.store.resetProgress();await first.drive.sync();
  await second.store.merge([{...flag('offline-old'),at:'2099-01-01T00:00:00.000Z'}]);await second.drive.sync();await first.drive.sync();
  assert.equal(first.store.model().flags.size,0);assert.equal(second.store.model().flags.size,0);
  assert.equal(first.store.model().progressEpoch,second.store.model().progressEpoch);
  await second.store.add([{type:'flag',key:'bank:new',flag:'favorite',value:true}]);await second.drive.sync();await first.drive.sync();
  assert.equal(first.store.model().flags.size,1);assert.equal(first.store.model().flags.get('bank:new').favorite,true);
  assert.equal(remote.live().filter(([,f])=>f.name==='foco-progresso-reset-alpha-principal.json').length,1);
  assert(remote.files.has(principal));await foreign.drive.sync();assert.equal(JSON.stringify(foreign.store.events),foreignBefore);
}));

test('Drive: banco e progresso acima de 10 MB são importados e restaurados sem cortes',()=>withRemote(async remote=>{
  const bank=longBank({large:true});remote.files.set('bank-long',{name:'banco-longo.json',document:bank,version:1});
  const first=syncClient(),second=syncClient();
  assert(new TextEncoder().encode(JSON.stringify(bank)).byteLength>10*1024*1024);
  assert.deepEqual(await first.drive.importNewBanks(),{imported:1,skipped:0});
  const principal=remote.live().find(([,file])=>file.name==='foco-progresso-principal.json');
  assert(principal);assert(new TextEncoder().encode(JSON.stringify(principal[1].document)).byteLength>10*1024*1024);
  await second.drive.sync();assert.equal(second.drive.status,'synced');
  assert.deepEqual(second.store.model().banks[0].questions,bank.questions);
  assert.equal(second.store.model().banks[0].description,bank.description);
  await second.store.merge([flag('large-bank-favorite')]);await second.drive.sync();await first.drive.sync();
  assert(first.store.model().flags.get('bank:large-bank-favorite').favorite);
  assert.equal(remote.live().filter(([,file])=>file.name.startsWith('foco-progresso-')).length,1);
  assert.deepEqual(first.store.model().banks[0].questions,bank.questions);
}));

test('Drive: JSON UTF-8 com BOM é lido como texto sem mudar a estrutura',async()=>{
  const {drive}=syncClient(),original=globalThis.fetch;
  globalThis.fetch=async()=>new Response('\uFEFF'+JSON.stringify({schemaVersion:1}),{headers:{'content-type':'application/json'}});
  try{assert.deepEqual(await drive.readFile({id:'bom',size:12*1024*1024}),{schemaVersion:1});}finally{globalThis.fetch=original;}
});

test('Drive: importa números nas alternativas e restaura a representação textual em outro cliente',()=>withRemote(async remote=>{
  const bank=longBank();bank.questions[0].options[0].text=0;
  remote.files.set('bank-numeric',{name:'numeros.json',document:bank,version:1});
  const first=syncClient(),second=syncClient();assert.deepEqual(await first.drive.importNewBanks(),{imported:1,skipped:0});
  await second.drive.sync();const question=second.store.model().questions[0];
  assert.equal(question.options[0].text,'0');assert.equal(question.options[0].id,'A');assert.equal(question.correctOption,'A');
  assert.equal(remote.files.get('bank-numeric').document.questions[0].options[0].text,0);
}));

test('Drive: primeiro envio cria principal e próximos envios atualizam o mesmo ID',()=>withRemote(async remote=>{
  const {store,drive}=syncClient();await store.merge([flag('a')]);await drive.sync();const id=remote.live()[0][0];
  assert.equal(remote.live()[0][1].name,'foco-progresso-principal.json');
  for(let i=0;i<5;i++){await store.merge([flag(`next-${i}`)]);await drive.sync();}
  assert.equal(remote.live().length,1);assert.equal(remote.live()[0][0],id);assert.equal(remote.live()[0][1].document.events.length,6);assert.equal(drive.status,'synced');
  assert(!store.storage.getItem('foco:drive:test-folder').includes('fixture-only'));
}));
test('Drive: histórico inalterado usa versão em cache sem baixar nem regravar',()=>withRemote(async remote=>{
  const {store,drive}=syncClient();await store.merge([flag('a')]);await drive.sync();remote.calls.length=0;let changes=0;store.addEventListener('change',()=>changes++);await drive.sync();
  assert.equal(changes,0);assert.equal(remote.calls.length,2);assert(!remote.calls.some(c=>c.url.includes('alt=media')||c.method!=='GET'));
}));
test('Drive: migra lotes antigos, deduplica e mantém um único arquivo verificando antes da lixeira',()=>withRemote(async remote=>{
  remote.seed('old-1','foco-progresso-old1.json',[flag('a')]);remote.seed('old-2','foco-progresso-old2.json',[flag('a'),flag('b')]);
  const {store,drive}=syncClient();await store.merge([flag('c')]);await drive.sync();
  assert.equal(remote.live().length,1);assert.deepEqual(ids(remote.live()[0][1]),['a','b','c']);assert(remote.files.get('old-2').trashed);assert.equal(store.events.length,3);
  const cleanup=remote.calls.findIndex(c=>c.method==='PATCH'),write=remote.calls.findIndex(c=>c.method==='PUT');assert(cleanup>write);assert(remote.calls.slice(write,cleanup).some(c=>c.url.includes('alt=media')));assert(!remote.calls.some(c=>c.method==='DELETE'));
}));
test('Drive: dispositivos independentes recuperam e unem dados no mesmo arquivo',()=>withRemote(async remote=>{
  const a=syncClient(),b=syncClient();await a.store.merge([flag('a')]);await a.drive.sync();await b.store.merge([flag('b')]);await b.drive.sync();await a.drive.sync();
  assert.equal(remote.live().length,1);assert.equal(a.store.events.length,2);assert.equal(b.store.events.length,2);
}));
test('Drive: gravações simultâneas retentam conflito de versão sem perder respostas',()=>withRemote(async remote=>{
  remote.seed('main','foco-progresso-principal.json',[flag('base')]);const a=syncClient(),b=syncClient();await a.drive.sync();await b.drive.sync();await a.store.merge([flag('a')]);await b.store.merge([flag('b')]);
  const wait=barrier(2);let updates=0;remote.beforeUpdate=async()=>{if(++updates<=2)await wait();};
  await Promise.all([a.drive.sync(),b.drive.sync()]);assert(updates>=3);assert.equal(remote.live().length,1);assert.deepEqual(ids(remote.files.get('main')),['a','b','base']);await a.drive.sync();await b.drive.sync();assert.equal(a.store.events.length,3);assert.equal(b.store.events.length,3);
}));
test('Drive: primeira criação simultânea converge para um principal contendo ambos os históricos',()=>withRemote(async remote=>{
  const a=syncClient(),b=syncClient();await a.store.merge([flag('a')]);await b.store.merge([flag('b')]);const wait=barrier(2);remote.afterCreate=wait;
  await Promise.all([a.drive.sync(),b.drive.sync()]);assert.equal(remote.live().length,1);assert.deepEqual(ids(remote.live()[0][1]),['a','b']);
}));
test('Drive: falha no primeiro envio preserva pendência e usa o mesmo ID ao tentar novamente',()=>withRemote(async remote=>{
  const {store,drive}=syncClient();await store.merge([flag('a')]);remote.failWrite=true;await assert.rejects(()=>drive.sync(),/falha 500/);const pending=drive.cache().pending;assert(pending);assert.equal(drive.status,'error');await drive.sync();assert(remote.files.has(pending.id));assert.equal(remote.live().length,1);assert.equal(drive.status,'synced');
}));
test('Drive: resposta perdida depois da criação não duplica o arquivo',()=>withRemote(async remote=>{
  const {store,drive}=syncClient();await store.merge([flag('a')]);remote.unknownSuccess=true;await assert.rejects(()=>drive.sync());await drive.sync();assert.equal(remote.live().length,1);assert.deepEqual(ids(remote.live()[0][1]),['a']);assert.equal(drive.cache().pending,null);
}));
test('Drive: falha de atualização mantém principal anterior e dados locais recuperáveis',()=>withRemote(async remote=>{
  const {store,drive}=syncClient();await store.merge([flag('a')]);await drive.sync();await store.merge([flag('b')]);remote.failWrite=true;await assert.rejects(()=>drive.sync(),/falha 500/);assert.deepEqual(ids(remote.live()[0][1]),['a']);assert.equal(store.events.length,2);await drive.sync();assert.deepEqual(ids(remote.live()[0][1]),['a','b']);
}));
test('Drive: resposta perdida após atualizar retoma sem duplicar os registros',()=>withRemote(async remote=>{
  const {store,drive}=syncClient();await store.merge([flag('a')]);await drive.sync();await store.merge([flag('b')]);remote.unknownSuccess=true;await assert.rejects(()=>drive.sync());await drive.sync();assert.equal(remote.live().length,1);assert.deepEqual(ids(remote.live()[0][1]),['a','b']);
}));
test('Drive: pendência do formato antigo é recuperada antes de consolidar',()=>withRemote(async remote=>{
  const {store,drive}=syncClient();remote.seed('old','foco-progresso-old.json',[flag('a')]);drive.saveCache({files:['old'],events:['a'],pending:{id:'unsent',name:'foco-progresso-unsent.json',document:document([flag('b')])}});await drive.sync();assert.equal(remote.live().length,1);assert.deepEqual(ids(remote.live()[0][1]),['a','b']);assert.equal(store.events.length,2);assert(!remote.files.has('unsent'));
}));
test('Drive: lote alterado durante limpeza é relido e incorporado antes de ir para lixeira',()=>withRemote(async remote=>{
  remote.seed('a','foco-progresso-principal.json',[flag('a')]);remote.seed('b','foco-progresso-old.json',[flag('b')]);let edited=false;remote.beforeTrash=async(id,file)=>{if(!edited){edited=true;file.document.events.push(flag('late'));file.version++;}};
  const {drive}=syncClient();await drive.sync();assert.deepEqual(ids(remote.live()[0][1]),['a','b','late']);assert.equal(remote.live().length,1);
}));
test('Drive: conteúdo gravado incompleto impede qualquer limpeza',()=>withRemote(async remote=>{
  remote.seed('a','foco-progresso-old-a.json',[flag('a')]);remote.seed('b','foco-progresso-old-b.json',[flag('b')]);remote.corruptWrite=true;const {store,drive}=syncClient();await assert.rejects(()=>drive.sync(),/preservados/);assert.equal(remote.live().length,2);assert.equal(store.events.length,2);assert(!remote.calls.some(c=>c.method==='PATCH'));
}));
test('Drive: arquivos inválidos e busca incompleta impedem gravação e limpeza',()=>withRemote(async remote=>{
  const {store,drive}=syncClient();await store.merge([flag('local')]);remote.seed('bad','foco-progresso-bad.json',[]);remote.files.get('bad').document.schemaVersion=99;await assert.rejects(()=>drive.sync(),/inválido/);assert.equal(store.events.length,1);
  remote.files.clear();remote.incomplete=true;await assert.rejects(()=>drive.sync(),/incompleta/);assert(!remote.calls.some(c=>c.method!=='GET'));
}));

test('Drive: colisões reais são reconciliadas, verificadas e preservadas antes da limpeza',()=>withRemote(async remote=>{
  const a=flag('same','first'),b=flag('same','second');remote.seed('a','foco-progresso-a.json',[a]);remote.seed('b','foco-progresso-b.json',[b]);
  const {store,drive}=syncClient();await drive.sync();
  assert.equal(drive.status,'synced');assert.equal(remote.live().length,1);assert.equal(store.events.length,3);
  const events=remote.live()[0][1].document.events;assert(coversEvents(events,[a,b]));assert.equal(events.filter(event=>event.type==='event-conflict').length,2);
  remote.calls.length=0;await drive.sync();assert(!remote.calls.some(call=>call.method!=='GET'));assert.equal(store.events.length,3);
}));

test('Drive: IDs repetidos dentro de um arquivo são corrigidos no próprio principal',()=>withRemote(async remote=>{
  const a=flag('same','first'),b=flag('same','second');remote.seed('main','foco-progresso-principal.json',[a,b]);
  const {drive}=syncClient();await drive.sync();const file=remote.files.get('main');
  assert.equal(drive.status,'synced');assert(file.version>1);assert.equal(file.document.events.length,3);assert(coversEvents(file.document.events,[a,b]));
}));

test('Drive: cache do mesmo ETag não esconde uma versão ativa reconciliada',()=>withRemote(async remote=>{
  const first=flag('same','first'),latest={...flag('same','second'),at:'2026-10-09T00:00:00.000Z'};
  const {store,drive}=syncClient();await store.merge([first]);await drive.sync();const id=remote.live()[0][0];
  await store.merge([latest]);remote.calls.length=0;await drive.sync();
  assert(remote.calls.some(call=>call.url.includes('alt=media')));assert(coversEvents(remote.files.get(id).document.events,[first,latest]));
  assert.equal(remote.files.get(id).document.events.length,3);assert.equal(drive.status,'synced');
}));

test('Drive: dois dispositivos com a mesma tentativa divergente convergem sem novas cópias',()=>withRemote(async remote=>{
  const first=flag('same','first'),latest={...flag('same','second'),at:'2026-10-09T00:00:00.000Z'},a=syncClient(),b=syncClient();
  await a.store.merge([first]);await a.drive.sync();await b.store.merge([latest]);await b.drive.sync();await a.drive.sync();await b.drive.sync();
  assert.equal(remote.live().length,1);assert.equal(a.store.events.length,3);assert.equal(b.store.events.length,3);
  assert.deepEqual(a.store.events,b.store.events);assert(coversEvents(remote.live()[0][1].document.events,[first,latest]));
}));
test('Drive: sem versão remota nunca atualiza nem move o histórico',()=>withRemote(async remote=>{
  remote.seed('a','foco-progresso-a.json',[flag('a')]);remote.missingEtag=true;const {drive}=syncClient();await assert.rejects(()=>drive.sync(),/versão/);assert.equal(remote.live().length,1);assert(!remote.calls.some(c=>c.method!=='GET'));
}));
test('Drive: falha na limpeza mantém histórico consolidado e retoma os lotes restantes',()=>withRemote(async remote=>{
  remote.seed('a','foco-progresso-a.json',[flag('a')]);remote.seed('b','foco-progresso-b.json',[flag('b')]);remote.failTrash=true;
  const {drive}=syncClient();await assert.rejects(()=>drive.sync(),/falha 500/);assert.equal(remote.live().length,2);assert.deepEqual(ids(remote.files.get('a')),['a','b']);await drive.sync();assert.equal(remote.live().length,1);assert.deepEqual(ids(remote.live()[0][1]),['a','b']);
}));
test('Drive: ação local durante upload fica pendente e entra na próxima atualização',()=>withRemote(async remote=>{
  const {store,drive}=syncClient();await store.merge([flag('a')]);await drive.sync();await store.merge([flag('b')]);
  remote.beforeUpdate=async()=>{remote.beforeUpdate=null;await store.merge([flag('late')]);};await drive.sync();assert.equal(drive.status,'pending');assert.deepEqual(ids(remote.live()[0][1]),['a','b']);clearTimeout(drive.timer);await drive.sync();assert.equal(drive.status,'synced');assert.deepEqual(ids(remote.live()[0][1]),['a','b','late']);
}));
test('Drive: principal removido do Drive é recriado com o histórico local completo',()=>withRemote(async remote=>{
  const {store,drive}=syncClient();await store.merge([flag('a')]);await drive.sync();remote.live()[0][1].trashed=true;await drive.sync();assert.equal(remote.live().length,1);assert.deepEqual(ids(remote.live()[0][1]),['a']);
}));
test('Drive: consolidação respeita conta, propriedade e bancos de questões',()=>withRemote(async remote=>{
  remote.seed('mine','foco-progresso-111-old.json',[flag('mine')],'111');remote.seed('other','foco-progresso-222-old.json',[flag('other')],'222');remote.seed('forged','foco-progresso-111-forged.json',[flag('forged')],'111');remote.files.get('forged').ownedByMe=false;remote.seed('bank','questoes.json',[]);
  const {store,drive}=syncClient('111');await drive.sync();assert.equal(remote.live().length,4);assert.equal(remote.files.get('mine').name,'foco-progresso-111-principal.json');assert.equal(store.events.length,1);assert(!remote.files.get('other').trashed);assert(!remote.files.get('forged').trashed);assert(!remote.files.get('bank').trashed);
}));
test('Drive: token expirado exige reconectar sem enviar nem apagar',async()=>{
  const {store,drive}=syncClient();await store.merge([flag('local')]);drive.expires=Date.now()-1;await assert.rejects(()=>drive.request('https://www.googleapis.com/drive/v3/files'),/expirou/);assert.equal(drive.status,'expired');assert.equal(store.events.length,1);assert.equal(drive.token,null);
});
