import {launchAudit,auditPage} from '../tests/helpers/browser-audit.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
const label=process.argv[2]||'after',ref=process.argv[3];
const audit=await launchAudit(),{browser,url}=audit;
try{
const results=[];
const scenarios=[['small',25,5,{width:1365,height:900}],['large',1000,30,{width:1365,height:900}],['mobile',1000,30,{width:390,height:844}]];
if(process.env.FOCO_PROFILE_MAX)scenarios.push(['maximum',5000,3,{width:1365,height:900}]);
for(const [name,count,history,viewport] of scenarios){
 const {context,page,errors}=await auditPage(browser,url,{viewport,ref});
 await page.evaluate(async({count,history})=>{await __audit.seed(count,history);},{count,history});
 await page.evaluate(async()=>{for(let i=0;i<6;i++){await __audit.move(i%2?-1:1);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}await __audit.settled();});
 const cdp=await context.newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 const metrics=await page.evaluate(async()=>{
  const timings=[],select=[],longTasks=[];let shells=0;
  const observer=new MutationObserver(records=>{for(const r of records)for(const n of r.removedNodes)if(n.nodeType===1&&n.matches?.('.shell'))shells++;});observer.observe(document.querySelector('#app'),{childList:true});
  const perf=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration)));perf.observe({type:'longtask'});
  async function click(action){const before=performance.now(),key=document.querySelector('.question-body').dataset.question;
   const changed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Question did not change within 5 seconds')),5000);const o=new MutationObserver(()=>{if(document.querySelector('.question-body')?.dataset.question!==key){o.disconnect();requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);resolve(performance.now()-before);}));}});o.observe(document.querySelector('#app'),{childList:true,subtree:true});});
   document.querySelector('[data-action='+action+']').click();return changed;
  }
  for(let i=0;i<30;i++)timings.push(await click(i%2?'previous':'next'));
  for(let i=0;i<20;i++){const start=performance.now();document.querySelector('.option-select[data-option='+ (i%2?'A':'B')+']').click();select.push(performance.now()-start);}
  await __audit.settled();observer.disconnect();perf.disconnect();
  return {timings,select,shells,longTasks,state:__audit.state};
 });
 const {profile}=await cdp.send('Profiler.stop');
 const times=new Map();for(let i=0;i<(profile.samples||[]).length;i++){const id=profile.samples[i],n=profile.nodes.find(n=>n.id===id);const fn=n.callFrame.functionName||'(anonymous)';times.set(fn,(times.get(fn)||0)+(profile.timeDeltas[i]||0)/1000);}
 const summarize=a=>({median:+[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)].toFixed(2),p95:+[...a].sort((a,b)=>a-b)[Math.floor(a.length*.95)].toFixed(2),max:+Math.max(...a).toFixed(2)});
 results.push({name,count,history,navigation:summarize(metrics.timings),selectionHandler:summarize(metrics.select),shellReplacements:metrics.shells,longTasks:metrics.longTasks.filter(n=>n>50).length,profileTop:[...times].sort((a,b)=>b[1]-a[1]).slice(0,14),errors});
 await mkdir('.sites-runtime/performance',{recursive:true});await writeFile('.sites-runtime/performance/'+label+'-'+name+'.cpuprofile',JSON.stringify(profile));
 await page.screenshot({path:'.sites-runtime/performance/'+label+'-'+name+'.png',fullPage:true});
 console.log(JSON.stringify(results.at(-1)));await context.close();
}
await writeFile('.sites-runtime/performance/'+label+'.json',JSON.stringify(results,null,2)+'\n');await audit.close();


}finally{await audit.close();}
