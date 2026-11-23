import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {launchAudit,auditPage} from './helpers/browser-audit.mjs';

const audit=await launchAudit(),{browser,url}=audit;
await mkdir('.sites-runtime/performance',{recursive:true});
try{
  for(const mobile of [false,true]){
    const {page,context,errors}=await auditPage(browser,url,{viewport:mobile?{width:390,height:844}:{width:1365,height:900}});
    await page.evaluate(async()=>{await __audit.seed(80,0,'smart');await __audit.navigate('session');__audit.writes.delay=60000;});
    const toolColors=await page.evaluate(()=>{
      const color=selector=>getComputedStyle(document.querySelector(selector)).color;
      return {heart:color('.question-tools [data-icon=heart]'),cut:color('.option-cut [data-icon=scissors]'),primaryIcon:color('[data-action=answer] [data-icon=check]'),primaryText:color('[data-action=answer]')};
    });
    assert.notEqual(toolColors.heart,toolColors.cut);assert.equal(toolColors.primaryIcon,toolColors.primaryText,'filled buttons retain icon contrast');
    await page.locator('.question-body').focus();await page.keyboard.press('1');await page.keyboard.press('2');
    assert.equal(await page.locator('.option-select[data-option=B]').getAttribute('aria-pressed'),'true');
    await page.locator('.option[data-option=A]').hover();await page.locator('.option-cut[data-option=A]').click();
    await page.locator('[data-action=next]').click();await page.locator('[data-action=previous]').click();
    assert(await page.locator('.option[data-option=A]').evaluate(row=>row.classList.contains('eliminated')));
    assert.equal(await page.locator('.option-select[data-option=B]').getAttribute('aria-pressed'),'true');
    // Refresh before the deferred transaction: the account outbox must replay.
    await page.reload();await page.waitForSelector('[data-action=guest]');await page.evaluate(()=>__audit.seed(80,0,'smart'));
    assert(await page.locator('.option[data-option=A]').evaluate(row=>row.classList.contains('eliminated')));
    assert.equal(await page.locator('.option-select[data-option=B]').getAttribute('aria-pressed'),'true');
    await page.locator('[data-action=answer]').click();await page.evaluate(()=>__audit.settled());
    assert.equal(await page.evaluate(()=>__audit.state.stats.attempts),1);
    await page.locator('.question-body').focus();await page.keyboard.press('Space');
    assert.equal(await page.evaluate(()=>__audit.state.index),1);
    if(!mobile){await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>__audit.state.index),2);await page.keyboard.press('ArrowLeft');}
    await page.locator('.option-select[data-option=A]').focus();await page.keyboard.press('Space');
    assert.equal(await page.evaluate(()=>__audit.state.index),1,'native button Space must not skip');
    // Hold a real Drive request while the UI continues handling answers/navigation.
    let release,requested;
    const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>requested=resolve);
    await page.route('https://www.googleapis.com/**',async route=>{requested();await gate;await route.abort();});
    await page.evaluate(()=>{const drive=__audit.drive;drive.config.folderId='synthetic-test-folder';drive.token='synthetic-test-token';drive.expires=Date.now()+3600000;globalThis.syncAttempt=drive.sync().catch(()=>{});});
    await started;
    const duringSync=await page.evaluate(async()=>{
      const start=performance.now();for(let i=0;i<50;i++){await __audit.move(i%2?-1:1);}
      __audit.selectOption('A');await __audit.answer();await __audit.settled();return {elapsed:performance.now()-start,busy:__audit.drive.busy,attempts:__audit.state.stats.attempts};
    });
    assert(duringSync.busy);assert.equal(duringSync.attempts,2);release();await page.evaluate(()=>syncAttempt);
    assert.equal(await page.evaluate(()=>__audit.drive.status),'error');
    await context.setOffline(true);
    await page.evaluate(async()=>{await __audit.move(1);__audit.selectOption('B');__audit.toggleCut('C');await __audit.answer();await __audit.settled();});
    assert.equal(await page.evaluate(()=>__audit.state.stats.attempts),3);
    await context.setOffline(false);await page.reload();await page.waitForSelector('[data-action=guest]');await page.evaluate(()=>__audit.seed(80,0,'smart'));
    assert.equal(await page.evaluate(()=>__audit.state.stats.attempts),3);
    assert(await page.locator('.option[data-option=C]').evaluate(row=>row.classList.contains('eliminated')));
    // Theme tokens and mobile geometry are checked in the rendered app.
    const colors=await page.evaluate(()=>{
      const css=getComputedStyle(document.documentElement),body=document.querySelector('.question-body'),footer=document.querySelector('.question-actions');
      return {bg:css.getPropertyValue('--bg').trim(),accent:css.getPropertyValue('--accent').trim(),surface:getComputedStyle(document.querySelector('.question-card')).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth,bodyBottom:body.getBoundingClientRect().bottom,footerTop:footer.getBoundingClientRect().top};
    });
    assert.equal(colors.bg,'#121212');assert.equal(colors.accent,'#79ccc2');assert.equal(colors.surface,'rgb(32, 32, 32)');assert(!colors.overflow);if(mobile)assert(colors.bodyBottom<=colors.footerTop);
    await page.screenshot({path:'.sites-runtime/performance/dark-'+(mobile?'mobile':'desktop')+'.png',fullPage:true});
    await page.evaluate(()=>__audit.theme('light'));assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(248, 249, 252)');
    await page.screenshot({path:'.sites-runtime/performance/light-'+(mobile?'mobile':'desktop')+'.png',fullPage:true});
    const lightIconColor=await page.locator('.option-cut [data-icon=scissors]').first().evaluate(node=>({icon:getComputedStyle(node).color,control:getComputedStyle(node.parentElement).color}));
    assert.equal(lightIconColor.icon,lightIconColor.control,'light icons keep their existing inherited colors');
    await page.evaluate(async()=>{await __audit.theme('dark');await __audit.navigate('home');});
    const navColors=await page.locator(mobile?'.mobile-nav>button>svg':'.nav-btn>svg').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).color));
    assert(new Set(navColors).size>=4,'navigation uses distinct functional accents on desktop and mobile');
    if(mobile)await page.screenshot({path:'.sites-runtime/performance/dark-icons-mobile.png',fullPage:true});
    assert.deepEqual(errors,[]);console.log(JSON.stringify({viewport:mobile?'mobile':'desktop',passed:true,slowDriveNavigationMs:duringSync.elapsed}));await context.close();
  }
  // Actual native banks still work without login or Drive.
  const {page,context,errors}=await auditPage(browser,url);
  await page.evaluate(()=>__audit.native());assert.equal(await page.locator('.bank-source.system').first().textContent(),'Sistema');
  await page.locator('.option-select').first().click();await page.locator('[data-action=answer]').click();await page.evaluate(()=>__audit.settled());assert.equal(await page.evaluate(()=>__audit.state.stats.attempts),1);assert.deepEqual(errors,[]);await context.close();
  // Exam answers remain ungraded through navigation/reload, and grade once.
  const exam=await auditPage(browser,url);await exam.page.evaluate(async()=>{await __audit.seed(1,0,'exam');__audit.selectOption('B');await __audit.answer();await __audit.settled();});
  assert.equal(await exam.page.evaluate(()=>__audit.state.stats.attempts),0);assert.equal(await exam.page.locator('.feedback').count(),0);
  await exam.page.reload();await exam.page.waitForSelector('[data-action=guest]');await exam.page.evaluate(()=>__audit.seed(1,0,'exam'));
  assert.equal(await exam.page.evaluate(()=>__audit.state.stats.attempts),0);await exam.page.locator('[data-action=finish]').click();await exam.page.waitForFunction(()=>__audit.state.stats.attempts===1);assert.deepEqual(exam.errors,[]);await exam.context.close();
  console.log('Native banks, exam secrecy, offline progress, reload, keyboard, scissors and delayed Drive: passed.');
  const migration=await auditPage(browser,url);
  await migration.page.evaluate(async()=>{
    const prefix='foco:v1:event:',event={id:'legacy',type:'flag',at:'2026-11-23T12:00:00.000Z',key:'test:q',flag:'favorite',value:true};
    await new Promise((resolve,reject)=>{
      const request=indexedDB.open('foco-study-journals',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('accounts',{keyPath:'subject'});
      request.onerror=()=>reject(request.error);request.onsuccess=()=>{
        const db=request.result,tx=db.transaction('accounts','readwrite');
        tx.objectStore('accounts').put({subject:'upgrade-test',revision:7,items:[[prefix+event.id,JSON.stringify(event)]]});
        tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
      };
    });
    const {openAccountStorage}=await import('/assets/journal-storage.mjs'),{Store}=await import('/assets/store.mjs');
    const storage=await openAccountStorage(localStorage,'upgrade-test'),store=new Store(storage);
    if(store.events[0]?.id!=='legacy')throw new Error('Version 1 journal lost during migration');
    await store.add([{type:'flag',key:'test:q',flag:'review',value:true}]);storage.close();
    const reopened=await openAccountStorage(localStorage,'upgrade-test');
    if(new Store(reopened).events.length!==2)throw new Error('Version 2 journal was not persisted');reopened.close();
  });
  assert.deepEqual(migration.errors,[]);await migration.context.close();console.log('IndexedDB v1 to v2 migration and reopen: passed.');
  const visual=await auditPage(browser,url);await visual.page.evaluate(()=>__audit.native());await visual.page.evaluate(()=>__audit.theme('dark'));
  for(const view of ['home','banks','performance','settings']){
    await visual.page.evaluate(view=>__audit.navigate(view),view);
    if(view==='home'){
      const modes=await visual.page.locator('.home-mode-icon>svg').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).color));
      assert.equal(new Set(modes).size,4,'home study shortcuts retain four discreet colors');
    }
    await visual.page.screenshot({path:'.sites-runtime/performance/dark-'+view+'.png',fullPage:true});
    assert.equal(await visual.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,view+' overflows');
  }
  await visual.page.evaluate(()=>__audit.navigate('study'));
  const modeColors=await visual.page.locator('.mode-card>svg').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).color));
  assert(new Set(modeColors).size>=5,'study modes must not fall back to a single accent');
  await visual.page.screenshot({path:'.sites-runtime/performance/dark-icons-study.png',fullPage:true});
  await visual.page.locator('[data-action=start]').first().click();await visual.page.locator('#dialog[open]').waitFor();
  assert.equal(await visual.page.locator('#dialog').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(32, 32, 32)');
  await visual.page.screenshot({path:'.sites-runtime/performance/dark-setup.png',fullPage:true});assert.deepEqual(visual.errors,[]);await visual.context.close();console.log('Dark home, banks, performance, settings and session modal: passed.');
}finally{await audit.close();}
