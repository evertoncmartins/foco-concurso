import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForPublishedBank,bankUploadView,syncImportedBank} from '../src/bank-publication.mjs';

test('loading aguarda a revisão exata, a ativação e a confirmação administrativa antes de sincronizar',async()=>{
  const states=[{revision:'old',active:true},{revision:'new',active:false},{revision:'new',active:true},{revision:'new',active:true}];
  let checks=0,inspections=0,applied=0;const stages=[];
  const catalog={banks:[],async check(){this.available={banks:[{id:'lei-12345',...states[checks++]}]};},apply(id){assert.equal(checks,4);assert.equal(id,'lei-12345');applied++;}};
  const bank=await waitForPublishedBank({catalog,id:'lei-12345',revision:'new',inspect:async()=>++inspections===2,onProgress:s=>stages.push(s),sleep:async()=>{},attempts:4});
  assert.equal(bank.revision,'new');assert.equal(bank.active,true);assert.equal(applied,1);assert.equal(inspections,2);
  assert(stages.some(s=>s.percent===55));assert(stages.some(s=>s.percent===80));
});

test('falha de consulta é recuperável; limite de espera informa que não se deve reenviar',async()=>{
  let calls=0,applied=false;
  const catalog={banks:[],async check(){calls++;throw new Error('offline');},apply(){applied=true;}};
  await assert.rejects(waitForPublishedBank({catalog,id:'lei-12345',revision:'new',sleep:async()=>{},attempts:3}),/Não é necessário reenviar/);
  assert.equal(calls,3);assert.equal(applied,false);
});

test('troca de conta durante consulta ou confirmação não aplica o banco nem continua esperando',async()=>{
  for(const stage of ['check','inspect']){
    let current=true,applied=false;
    const catalog={banks:[],async check(){this.available={banks:[{id:'lei-12345',revision:'new',active:true}]};if(stage==='check')current=false;},apply(){applied=true;}};
    assert.equal(await waitForPublishedBank({catalog,id:'lei-12345',revision:'new',current:()=>current,inspect:async()=>{current=false;return true;},sleep:async()=>{throw new Error('não deveria esperar');}}),null);
    assert.equal(applied,false);
  }
});

test('loading tem estado acessível e não apresenta restauração de login nem reinício de progresso',()=>{
  const html=bankUploadView({percent:55,message:'Aguardando a publicação…',detail:'Conteúdo <seguro>'});
  assert(html.includes('aria-busy="true"'));assert(html.includes('role="progressbar"'));assert(html.includes('aria-valuenow="55"'));assert(html.includes('&lt;seguro&gt;'));
  assert(!html.includes('data-action="restore-'));assert(!html.includes('novo começo'));
});

test('espera tem limite real mesmo com consultas lentas',async()=>{
  let time=0,checks=0;const catalog={banks:[],async check(){checks++;time+=1000;},apply(){throw new Error('não deveria aplicar');}};
  await assert.rejects(waitForPublishedBank({catalog,id:'lei-12345',revision:'new',sleep:async()=>{},now:()=>time,maxWait:500,attempts:60}),/Não é necessário reenviar/);
  assert.equal(checks,1);
});

test('importação espera sincronização anterior e exige confirmação de envio, com limite e isolamento de conta',async()=>{
  let sleeps=0,syncs=0;const drive={busy:true,status:'pending',async sync(){syncs++;this.status='synced';}};
  assert.equal(await syncImportedBank(drive,{sleep:async()=>{if(++sleeps===2)drive.busy=false;}}),true);assert.equal(syncs,1);
  drive.busy=true;await assert.rejects(syncImportedBank(drive,{sleep:async()=>{},attempts:2}),/ocupado/);assert.equal(syncs,1);
  assert.equal(await syncImportedBank(drive,{current:()=>false}),false);assert.equal(syncs,1);
  drive.busy=false;drive.sync=async()=>{};drive.status='pending';await assert.rejects(syncImportedBank(drive),/não confirmou/);
});
