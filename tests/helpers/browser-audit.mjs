import {chromium} from 'playwright-core';
import {spawn,execFileSync} from 'node:child_process';
export const hooks=`
globalThis.__audit={
 async seed(count=1000,history=30,mode='exam',theme='dark'){
  guest=true;restoration=null;working=false;
  accountStorage?.close?.();accountStorage=await openAccountStorage(localStorage,'performance-test');
  config={...defaults,theme,onboardingDone:true};applyTheme();
  store=new Store(accountStorage);drive=new DriveSync(store,config);
  const bank={schemaVersion:1,id:'performance-test',name:'Banco sintético de desempenho',questions:Array.from({length:count},(_,i)=>({id:'q'+i,discipline:'Direito',subject:'Assunto '+i%8,topic:'Tópico '+i,statement:'Questão sintética '+i+'. Selecione a alternativa correta.',options:[{id:'A',text:'Primeira alternativa.'},{id:'B',text:'Segunda alternativa.'},{id:'C',text:'Terceira alternativa.'}],correctOption:'A',explanation:'Comentário de teste.',difficulty:'medium',tags:[]}))};
  if(!store.events.length){await store.add([{type:'bank',bank}]);refreshModel();
   const next=createSession(model.questions.map(q=>q.key),mode,'audit-session');
   next.questionSources=Object.fromEntries(model.questions.map(q=>[q.key,questionSource(q)]));
   await store.add(Array.from({length:history+1},(_,i)=>({type:'session',session:{...next,index:i%count}})));
  }
  if(typeof SessionWrites!=='undefined')await SessionWrites.recover(store);
  refreshModel();session=structuredClone(model.sessions.at(-1));selected=session.drafts?.[session.queue[session.index]]||null;view='session';
  store.addEventListener('change',refreshModel);render();
 },
 get state(){return {index:session.index,answers:session.answers,session:session,events:store.events.length,stats:model.stats};},
 async settled(){if(typeof sessionWrites!=='undefined')await sessionWrites?.flush();},
 move,answer,navigate,render,refreshModel,finish,toggleCut,selectOption:typeof selectOption==='undefined'?null:selectOption,
 get writes(){return sessionPersistence();},get store(){return store;},get drive(){return drive;},
 async native(){await openGuest();await newSession(model.questions.slice(0,25).map(q=>q.key));await navigate('session');},
 async theme(value){config.theme=value;applyTheme();render();},
 async restored(){accountStorage.close();accountStorage=await openAccountStorage(localStorage,'performance-test');store=new Store(accountStorage);refreshModel();return model.sessions.at(-1);}
};`;

export async function launchAudit(){
  const server=spawn(process.execPath,['scripts/dev.mjs','--port','0'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  const url=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Preview did not start. Run npm run build first.')),10000);
    server.on('error',reject);server.stdout.on('data',chunk=>{const match=String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});
    server.on('exit',code=>{clearTimeout(timer);reject(new Error('Preview exited: '+code));});
  });
  let browser;
  try{browser=await chromium.launch({headless:true,...(process.env.FOCO_BROWSER_PATH?{executablePath:process.env.FOCO_BROWSER_PATH}:{channel:process.env.FOCO_BROWSER_CHANNEL||'chrome'})});}catch(error){server.kill();throw error;}
  return {browser,url,async close(){await browser.close();server.kill();}};
}
export async function auditPage(browser,url,{viewport={width:1365,height:900},ref}={}){
  const context=await browser.newContext({viewport});const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const requestUrl=new URL(route.request().url());
    if(requestUrl.origin!==url){await route.abort();return;}
    const path=requestUrl.pathname==='/'?'/index.html':requestUrl.pathname;let body;
    if(ref){
      const source=path.startsWith('/assets/')&&path.endsWith('.mjs')?'src/'+path.split('/').at(-1):'public'+path;
      try{body=execFileSync('git',['show',ref+':'+source],{encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{}
    }
    if(path==='/assets/app.mjs'){
      const response=await route.fetch();await route.fulfill({response,body:(body??await response.text())+hooks});
    }else if(body!==undefined)await route.fulfill({body,contentType:path.endsWith('.css')?'text/css':path.endsWith('.mjs')||path.endsWith('.js')?'text/javascript':path.endsWith('.html')?'text/html':'application/json'});
    else await route.continue();
  });
  await page.goto(url);await page.waitForSelector('[data-action=guest]');
  return {context,page,errors};
}
