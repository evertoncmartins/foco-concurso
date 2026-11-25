import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {launchAudit,auditPage,hooks} from './helpers/browser-audit.mjs';

const raw=JSON.parse(await readFile(new URL('../public/data/question-banks/lei-8112.json',import.meta.url)));
raw.questions=raw.questions.slice(0,2);raw.id='decreto-12345';raw.name='Decreto nº 12.345/2026';delete raw.displayName;
const appSource=await readFile(new URL('../dist/assets/app.mjs',import.meta.url),'utf8');
const setup=`
globalThis.__bankAudit={
  published:[],calls:[],
  async setup(){
    await __audit.seed(2,0,'smart');guest=false;auth.profile={sub:'bank-browser-fixture',email:'fixture@example.test'};
    auth.ensureAccess=async()=>({token:'synthetic-browser-fixture'});
    systemCatalog.banks=[];systemCatalog.loaded=true;
    systemCatalog.fetcher=async url=>Response.json(url.endsWith('index.json')?{schemaVersion:1,banks:this.published.map(b=>({id:b.id,revision:b.revision}))}:this.published.find(b=>url.includes('/'+b.id+'.json')));
    bankManagement.fetcher=async(url,settings)=>{
      if(settings.method==='POST'){
        const body=JSON.parse(settings.body);this.calls.push(body);
        if(body.action==='create'){
          const bank=validateSystemBank({...body.bank,revision:'browser-created'});this.published.push(bank);
          return Response.json({created:true,bankId:bank.id,revision:bank.revision,commit:'synthetic-commit'});
        }
        if(body.action==='rename'){
          this.published=this.published.map(b=>b.id===body.bankId?{...b,displayName:body.displayName,revision:'browser-renamed'}:b);
          return Response.json({updated:true,bankId:body.bankId,revision:'browser-renamed',commit:'synthetic-commit'});
        }
        throw new Error('Unexpected mutation: '+body.action);
      }
      return Response.json({admin:true,tracking:true,deletion:true,publication:true,banks:this.published.map(b=>({id:b.id,assigned:1,protected:false,state:null}))});
    };
    store.setSystemBanks([]);await bankManagement.inspect(auth);view='banks';render();
  },
  state(){return {calls:this.calls,publicBank:this.published[0],bank:model.systemBanks[0],uploading:bankUploading,working};}
};`;

const audit=await launchAudit();await mkdir('.sites-runtime/banks',{recursive:true});
try{
  for(const mobile of [false,true]){
    const {page,context,errors}=await auditPage(audit.browser,audit.url,{viewport:mobile?{width:390,height:844}:{width:1365,height:900}});
    await page.route('**/assets/app.mjs',route=>route.fulfill({body:appSource+hooks+setup,contentType:'text/javascript'}));
    await page.reload();await page.waitForSelector('[data-action=guest]');await page.evaluate(()=>__bankAudit.setup());
    const file={name:'Questões do decreto — nome livre.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(raw))};
    await page.locator('#bank-file').setInputFiles(file);await page.locator('#bank-scope-system').click();await page.locator('#confirm-ok').click();
    const details=page.locator(`[data-action=bank-details][data-bank="${raw.id}"]`);await details.waitFor();await details.click();
    await page.locator(`[data-action=bank-rename][data-bank="${raw.id}"]`).click();await page.locator('#bank-scope-system').click();
    await page.locator('#bank-display-name').fill('Decreto — título escolhido');await page.getByRole('button',{name:'Salvar para todos',exact:true}).click();
    await page.getByRole('heading',{name:'Decreto — título escolhido',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>__bankAudit.state().publicBank.name),raw.name);
    await page.locator(`[data-action=bank-rename][data-bank="${raw.id}"]`).click();await page.locator('#bank-scope-personal').click();
    await page.locator('#bank-display-name').fill('Minha revisão do decreto');await page.getByRole('button',{name:'Salvar nome',exact:true}).click();
    await page.getByRole('heading',{name:'Minha revisão do decreto',exact:true}).waitFor();
    const state=await page.evaluate(()=>__bankAudit.state());
    assert.equal(state.bank.displayName,'Minha revisão do decreto');assert.equal(state.publicBank.displayName,'Decreto — título escolhido');
    assert.equal(state.bank.id,raw.id);assert.equal(state.calls.length,2);assert.equal(state.uploading,null);assert.equal(state.working,false);
    await page.evaluate(()=>__audit.navigate('home'));assert(await page.locator('.home-bank').filter({hasText:'Minha revisão do decreto'}).count());
    await page.evaluate(()=>__audit.navigate('banks'));await details.click();
    await page.locator('[data-action=banks-layout][data-layout=list]').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:'.sites-runtime/banks/'+(mobile?'mobile':'desktop')+'.png',fullPage:true});
    assert.deepEqual(errors,[]);await context.close();console.log(JSON.stringify({viewport:mobile?'mobile':'desktop',upload:true,rename:true,passed:true}));
  }
}finally{await audit.close();}
