import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBankManagementHandler} from '../server/bank-management.mjs';
import {repositoryBank} from '../server/repository-banks.mjs';
import {BankAssignments,ASSIGN_SCRIPT,RESERVE_SCRIPT} from '../server/bank-assignments.mjs';
import {BankManagement} from '../src/bank-management.mjs';
import {bankCardView} from '../src/bank-view.mjs';

const url='https://foco-concurso-wine.vercel.app/api/bank-management';
const raw={...JSON.parse(await readFile(new URL('../public/data/question-banks/lei-9394.json',import.meta.url))),id:'lei-12345',name:'Lei nº 12.345/2010'};
raw.questions=raw.questions.slice(0,2);
const bank=repositoryBank(raw,'lei-12345.json');
const env={BANK_ADMIN_EMAILS:'admin@example.test',GOOGLE_CLIENT_ID:'fixture-client',BANK_GITHUB_TOKEN:'fixture-service-token',BANK_PROTECTED_IDS:'lei-8112'};
const request=(body,headers={})=>new Request(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer fixture-access',...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
async function fixture(t,options={}){
  const directory=await mkdtemp(join(tmpdir(),'foco-management-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const source=options.bank||raw,currentBank=repositoryBank(source,`${source.id}.json`);
  await writeFile(join(directory,`${source.id}.json`),JSON.stringify(source));
  const calls=[],state=new Map(),members=new Set();
  const registry={configured:options.configured??true,
    async status(ids){return ids.map(id=>({id,assigned:members.size,state:state.get(id)||null}));},
    async assign(ids,sub){calls.push(['assign',ids,sub]);if(ids.some(id=>state.has(id)))return false;members.add(sub);return true;},
    async reserve(id,operation){calls.push(['reserve',id]);if(members.size||state.has(id)||options.assigned)return false;state.set(id,operation);return true;},
    async finish(id,operation,{release=false}={}){calls.push(['finish',release]);assert.equal(state.get(id),operation);if(release)state.delete(id);else state.set(id,'deleted');}
  };
  const fetcher=async(address,settings={})=>{
    if(address.includes('tokeninfo'))return Response.json({aud:options.audience||'fixture-client',sub:'test-subject',expires_in:3600});
    if(address.includes('userinfo'))return Response.json({sub:options.subject||'test-subject',email:options.email||'admin@example.test',email_verified:options.verified??true});
    calls.push(['github',settings.method,address,settings.body&&JSON.parse(settings.body)]);
    if(settings.method==='GET')return Response.json({type:'file',encoding:'base64',sha:'file-sha',content:Buffer.from(JSON.stringify(source)).toString('base64')});
    if(options.timeout)throw new Error('network timeout');
    return Response.json({commit:{sha:'delete-commit'}},{status:options.gitStatus||200});
  };
  const handler=createBankManagementHandler({env:{...env,...options.env},registry,directory,fetcher});
  return {handler,calls,state,members,bank:currentBank};
}

test('exclusão global valida conta, audiência, origem e papel no servidor',async t=>{
  const app=await fixture(t);
  assert.equal((await app.handler(new Request(url))).status,401);
  assert.equal((await app.handler(request({action:'delete',bankId:bank.id,revision:bank.revision},{Origin:'https://evil.test'}))).status,403);
  for(const settings of [{email:'user@example.test'},{audience:'other-client'},{verified:false},{subject:'foreign-subject'}]){
    const other=await fixture(t,settings),response=await other.handler(request({action:'delete',bankId:bank.id,revision:bank.revision}));
    assert([401,403].includes(response.status));assert.equal(other.calls.length,0);
  }
  const preflight=await app.handler(new Request(url,{method:'OPTIONS',headers:{Origin:'https://foco-concursos.ecmdigital.chatgpt.site'}}));
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://foco-concursos.ecmdigital.chatgpt.site');
  assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'),null);
});

test('atribuição é idempotente e impede excluir, inclusive após outra conta iniciar estudos',async t=>{
  const app=await fixture(t);
  for(let i=0;i<2;i++)assert.equal((await app.handler(request({action:'assign',bankIds:[bank.id,bank.id]}))).status,200);
  assert.equal(app.members.size,1);
  const response=await app.handler(request({action:'delete',bankId:bank.id,revision:bank.revision}));
  assert.equal(response.status,409);assert(!app.calls.some(c=>c[0]==='github'&&c[1]==='DELETE'));
  const status=await (await app.handler(request())).json();assert.equal(status.banks[0].assigned,1);
});

test('banco livre é removido do arquivo correto na main com SHA conferido e bloqueia atribuições seguintes',async t=>{
  const app=await fixture(t),response=await app.handler(request({action:'delete',bankId:bank.id,revision:bank.revision}));
  assert.equal(response.status,200);assert.equal((await response.json()).publishing,true);
  const mutation=app.calls.find(c=>c[0]==='github'&&c[1]==='DELETE');
  assert(mutation[2].endsWith('/evertoncmartins/foco-concurso/contents/public/data/question-banks/lei-12345.json'));
  assert.equal(mutation[3].branch,'main');assert.equal(mutation[3].sha,'file-sha');
  assert.equal(app.state.get(bank.id),'deleted');
  assert.equal((await app.handler(request({action:'assign',bankIds:[bank.id]}))).status,409);
  assert.equal((await app.handler(request({action:'delete',bankId:bank.id,revision:bank.revision}))).status,409);
});

test('estado sem configuração e bancos anteriores ao controle sem revisão bloqueiam exclusão',async t=>{
  for(const options of [{configured:false},{env:{BANK_GITHUB_TOKEN:''}},{env:{BANK_PROTECTED_IDS:''}},{env:{BANK_PROTECTED_IDS:bank.id}}]){
    const app=await fixture(t,options),response=await app.handler(request({action:'delete',bankId:bank.id,revision:bank.revision}));
    assert([409,503].includes(response.status));assert.equal(app.calls.length,0);
  }
  const app=await fixture(t),response=await app.handler(request({action:'delete',bankId:'lei-8112',revision:'any'}));
  assert.equal(response.status,409);assert.equal(app.calls.length,0);
});

test('revisão expressa libera só a retenção antiga da lei escolhida e nunca ignora atribuições',async t=>{
  const legacy=JSON.parse(await readFile(new URL('../public/data/question-banks/lei-11892.json',import.meta.url)));legacy.questions=legacy.questions.slice(0,2);
  for(const settings of [{},{env:{BANK_REVIEWED_UNUSED_IDS:'lei-8112'}},{env:{BANK_REVIEWED_UNUSED_IDS:'*'}}]){
    const app=await fixture(t,{bank:legacy,...settings});
    const status=await (await app.handler(request())).json();assert.equal(status.banks[0].protected,true);
    assert.equal((await app.handler(request({action:'delete',bankId:app.bank.id,revision:app.bank.revision}))).status,409);
    assert(!app.calls.some(c=>c[0]==='github'));
  }
  const reviewed={bank:legacy,env:{BANK_REVIEWED_UNUSED_IDS:'lei-11892'}};
  const app=await fixture(t,reviewed),status=await (await app.handler(request())).json();assert.equal(status.banks[0].protected,false);
  assert.equal((await app.handler(request({action:'delete',bankId:app.bank.id,revision:app.bank.revision}))).status,200);
  const used=await fixture(t,reviewed);
  assert.equal((await used.handler(request({action:'assign',bankIds:[used.bank.id]}))).status,200);
  assert.equal((await used.handler(request({action:'delete',bankId:used.bank.id,revision:used.bank.revision}))).status,409);
  assert(!used.calls.some(c=>c[0]==='github'&&c[1]==='DELETE'));
});

test('revisão desatualizada e caminhos inválidos não chegam à exclusão',async t=>{
  const app=await fixture(t);
  assert.equal((await app.handler(request({action:'delete',bankId:bank.id,revision:'old'}))).status,409);
  for(const id of ['../lei-12345','lei-12345.json','Lei-12345'])assert.equal((await app.handler(request({action:'delete',bankId:id,revision:bank.revision}))).status,400);
  assert(!app.calls.some(c=>c[0]==='reserve'));
  assert.equal((await app.handler(request({action:'assign',bankIds:['lei-99999']}))).status,409);
});

test('conflito confirmado do GitHub libera reserva; timeout ambíguo mantém banco bloqueado',async t=>{
  for(const options of [{gitStatus:409},{timeout:true}]){
    const app=await fixture(t,options),response=await app.handler(request({action:'delete',bankId:bank.id,revision:bank.revision}));
    assert.equal(response.status,503);
    assert.equal(app.state.has(bank.id),!!options.timeout);
    assert.equal((await app.handler(request({action:'assign',bankIds:[bank.id]}))).status,options.timeout?409:200);
  }
});

test('adapter usa operação atômica e pseudônimo em vez do identificador Google no armazenamento',async()=>{
  const calls=[],registry=new BankAssignments({env:{UPSTASH_REDIS_REST_URL:'https://redis.example.test',UPSTASH_REDIS_REST_TOKEN:'fixture',BANK_ASSIGNMENT_SECRET:'s'.repeat(32)},fetcher:async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json({result:1});}});
  assert(await registry.assign([bank.id,'lei-99999'],'private-google-subject'));
  assert.equal(calls[0][0],'EVAL');assert.equal(calls[0][1],ASSIGN_SCRIPT);assert.equal(calls[0][2],4);
  assert(!JSON.stringify(calls).includes('private-google-subject'));assert.match(calls[0].at(-1),/^[a-f0-9]{64}$/);
  assert(await registry.reserve(bank.id,'operation'));assert.equal(calls[1][1],RESERVE_SCRIPT);
});

function client(fetcher){
  const manager=new BankManagement(fetcher,{origin:'https://foco-concurso-wine.vercel.app'});
  const auth={profile:{sub:'subject'},generation:0,async ensureAccess(){return {token:'fixture-access'};}};
  return {manager,auth};
}
test('cliente distingue controle adiado de falha e não inicia atribuições sem verificação',async()=>{
  const calls=[],app=client(async(url,settings)=>{calls.push(settings);return Response.json({admin:true,tracking:false,deletion:false,banks:[]});});
  await app.manager.assign([bank.id],app.auth);assert.equal(calls.length,1);assert.equal(calls[0].method,'GET');
  assert.equal(app.manager.presentation(bank.id).canDelete,false);
  assert(app.manager.presentation(bank.id).reason.includes('configuração'));
  const offline=client(async()=>{throw new Error('offline');});
  await assert.rejects(offline.manager.assign([bank.id],offline.auth),/verificar/);
  assert.equal(offline.manager.presentation(bank.id),null);
});

test('conta trocada descarta resposta administrativa e não herda permissão ou atribuição',async()=>{
  let release;const pending=new Promise(resolve=>release=resolve);
  const {manager,auth}=client(async()=>{await pending;return Response.json({admin:true,tracking:true,deletion:true,banks:[{id:bank.id,assigned:0,protected:false}]});});
  const inspect=manager.inspect(auth);auth.generation++;auth.profile={sub:'another'};manager.reset();release();await inspect;
  assert.equal(manager.admin,false);assert.equal(manager.banks.size,0);assert.equal(manager.assigned.size,0);
});

test('cliente segue a revisão do servidor e registra a primeira sessão também em lei antiga',async()=>{
  const calls=[],id='lei-11892',app=client(async(url,settings)=>{
    calls.push(settings);
    return Response.json(settings.method==='POST'?{assigned:true}:{admin:true,tracking:true,deletion:true,banks:[{id,protected:false,assigned:0,state:null}]});
  });
  await app.manager.inspect(app.auth);assert.equal(app.manager.presentation(id).canDelete,true);
  app.manager.banks.get(id).assigned=1;assert.equal(app.manager.presentation(id).canDelete,false);
  await app.manager.assign([id],app.auth);
  assert.deepEqual(JSON.parse(calls.find(c=>c.method==='POST').body),{action:'assign',bankIds:[id]});
  const count=calls.length;await app.manager.assign([id],app.auth);assert.equal(calls.length,count);
  delete app.manager.banks.get(id).protected;assert.equal(app.manager.presentation(id).canDelete,false);
});

test('card mantém desativação e limita exclusão global à apresentação administrativa liberada',()=>{
  for(const management of [null,{admin:true,canDelete:false,reason:'Já atribuído.'},{admin:true,canDelete:true}]){
    const html=bankCardView({...bank,enabled:true},{detailsOpen:true,management});
    assert(html.includes('data-action="bank-toggle"'));
    assert.equal(html.includes('data-action="system-bank-delete"'),!!management);
    if(management&&!management.canDelete)assert.match(html,/data-action="system-bank-delete"[^>]*disabled/);
  }
});
