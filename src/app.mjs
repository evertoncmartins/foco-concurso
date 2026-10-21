Exit code: 0
Wall time: 1.2 seconds
Total output lines: 658
Output:
import {PublicDocuments} from './public-documents.mjs';
import {openAccountStorage} from './journal-storage.mjs';
import {progressLinkCandidates} from './bank-progress.mjs';
import {Store} from './store.mjs';
import {validateBank,validateEvents,derive,makeQueue,filterQuestions,breakdown,studyStreak,localDay} from './engine.mjs';
import {DriveSync} from './drive.mjs';
import {DriveSettings} from './drive-settings.mjs';
import {GoogleAccount,prepareGoogle,isGoogleReady,validClientId,consumeGoogleReturn,googleReturnMessage} from './auth.mjs';
import {AccountStorage,parseFolder,assertProgressOwner} from './account.mjs';
import {loginView,folderView,loadingView} from './access-views.mjs';
import {icon} from './icons.mjs';
import {homeView} from './home-view.mjs';
import {bankCardView,bankPresentation} from './bank-view.mjs';
import {SystemBanks} from './system-banks.mjs';
import {sourceType,sourceTag,sourceLabel,questionSource,sessionQuestion,preparePersonalBank,studyPresentation} from './bank-source.mjs';
import {createSession,chooseAnswer,moveSession,completeSession} from './session.mjs';
import {FocusMode} from './focus-mode.mjs';
import {TemporaryStorage} from './temporary-storage.mjs';
import {restoreProgress,resetSaveProgress} from './restore-progress.mjs';
import {questionOriginBadges} from './question-origin.mjs';
import {questionFeedbackView} from './explanation-view.mjs';
import {formatQuestionStatement} from './statement-view.mjs';
import {isProfilePhoto,prepareProfilePhoto,saveProfilePhoto} from './profile-photo.mjs';
import {sessionsView,sessionSummary,sessionReport,sessionBankCatalog,performanceForBank,bankSelect,sessionDate} from './sessions-view.mjs';
import {sessionSetupView,sessionSetupStatus} from './session-setup.mjs';
const $=(selector,root=document)=>root.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||min));
const defaults={theme:'light',name:'Estudante',photo:'',dailyGoal:10,folderId:'',onboardingDone:false,sidebarCollapsed:false};
let guest=false,restoration=null,restoreAuthorization=null,resetSaving=null;
let googleLoading=false,googleLoadError='';
let cutQuestion=null,cutOptions=new Set();
let finishingSession=false;
const draftSelections=new Map();
const expandedBankDetails=new Set();
const systemCatalog=new SystemBanks();
let systemCatalogError='';
async function loadSystemCatalog({force=false}={}){try{await systemCatalog.load({force});systemCatalogError='';}catch(error){systemCatalogError=error.message;}store.setSystemBanks(systemCatalog.banks);}
let sessionFilters={status:'open',bankId:'',type:'all',page:1},performanceBank='',performanceOrigin='all',resultSessionId=null;
function resetHistoryUI(){sessionFilters={status:'open',bankId:'',type:'all',page:1};performanceBank='';performanceOrigin='all';resultSessionId=null;}
const draftKey=()=>session?`${session.id}:${session.queue[session.index]}`:null;
let store,model,drive,view='home',session=null,selected=null,working=false,config={...defaults},toastTimer,auth,accountStorage,publicConfig={},loginError='',loginErrorCode='',legacyAvailable=false;
const publicDocuments=new PublicDocuments({canOpen:()=>!restoration&&!resetSaving&&!working,getContext:()=>({view,subject:auth?.profile?.sub,generation:auth?.generation}),onReturn:async origin=>{
  if(auth?.profile){
    if(origin?.subject===auth.profile.sub&&origin.generation===auth.generation){if(view!==origin.view)await navigate(origin.view);}
    else render();
  }
  else if(guest)await logout();
  else{renderLogin();$('[data-action=login]')?.focus({preventScroll:true});}
}});
const modes={smart:['Recomendadas','Um equilÃ­brio entre questÃµes novas, erros e revisÃµes.','spark'],random:['AleatÃ³rias','Uma nova seleÃ§Ã£o, sem repetir questÃµes na sessÃ£o.','shuffle'],new:['NÃ£o respondidas','Amplie o conteÃºdo que vocÃª jÃ¡ estudou.','book'],errors:['Revisar erros','Transforme as Ãºltimas respostas erradas em aprendizado.','repeat'],favorites:['Favoritas','Volte Ã s questÃµes que vocÃª quer ter por perto.','heart'],review:['RevisÃ£o espaÃ§ada','QuestÃµes marcadas e revisÃµes que venceram hoje.','flag'],subject:['Por assunto','Escolha a disciplina, o assunto e o tÃ³pico.','filter'],exam:['Simulado','Responda no seu ritmo. O resultado aparece no final.','clock']};
const syncText={local:'Salvo neste dispositivo',pending:'Envio pendente',syncing:'Sincronizandoâ€¦',synced:'Drive sincronizado',expired:'Reconectar Drive',error:'Falha na sincronizaÃ§Ã£o'};
const desktopLayout=matchMedia('(min-width: 701px)');
function isStandalone(){return matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||window.navigator?.standalone===true;}
const focusMode=new FocusMode({document,standalone:isStandalone,retainOnFullscreenExit:()=>!desktopLayout.matches&&view==='session'&&!!session&&!session.completed,onChange:()=>{
  if((!auth?.profile&&!guest)||!store||!drive)return;
  render();
  $(focusMode.active?(desktopLayout.matches?'.question-body':'[data-action=exit-focus]'):'[data-action=toggle-focus]')?.focus({preventScroll:true});
},onUnavailable:()=>toast(desktopLayout.matches?'Modo foco ativado. A tela cheia nÃ£o estÃ¡ disponÃ­vel neste navegador.':'Foco ativado. Para ocultar as barras, use o acesso pela Tela de InÃ­cio (Ã­cone de ajuda).')});
desktopLayout.addEventListener('change',()=>{
  if(restoration||view!=='session'||!session||session.completed)return;
  if(!desktopLayout.matches&&!focusMode.active){void focusMode.enter({automatic:true});return;}
  render();
});
function saveConfig(){accountStorage?.setItem('foco:config',JSON.stringify(config));localStorage.setItem('foco:appearance',config.theme);}
function applyTheme(){document.documentElement.dataset.theme=config.theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):config.theme;document.querySelector('meta[name=theme-color]').content=document.documentElement.dataset.theme==='dark'?'#212121':'#f8f9fc';}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),4500);}
function failure(error){console.error(error);if(['PROGRESS_RESET','SESSION_DELETED'].includes(error?.code)){refreshModel();render();}toast(error?.name==='QuotaExceededError'?'O armazenamento local estÃ¡ cheio. Exporte seu progresso para preservar os dados.':error.message||'NÃ£o foi possÃ­vel concluir. Tente novamente.');}
function refreshModel(){
  const next=store.model(),changed=!!model&&model.progressEpoch!==next.progressEpoch;model=next;
  if(changed||(session&&(session.progressEpoch??null)!==model.progressEpoch)){
    session=null;selected=null;draftSelections.clear();resetCuts();resetHistoryUI();config.activeSession=null;
    try{saveConfig();}catch(error){console.warn('NÃ£o foi possÃ­vel salvar a referÃªncia da sessÃ£o encerrada.',error);}
    if(view==='session'||view==='result'){view='performance';if(focusMode.active)void focusMode.exit();return true;}
  }
  let removed=false;
  if(session&&model.deletedSessions.has(session.id)){clearSessionDrafts(session.id);session=null;selected=null;resetCuts();removed=true;if(view==='session'){view='sessions';if(focusMode.active)void focusMode.exit();}}
  if(config.activeSession&&model.deletedSessions.has(config.activeSession)){config.activeSession=null;try{saveConfig();}catch{}}
  if(resultSessionId&&model.deletedSessions.has(resultSessionId)){resultSessionId=null;removed=true;if(view==='result')view='sessions';}
  if(removed)return 'session-deleted';
  return false;
}
function navItem(key,label,i,count=''){return `<button class="nav-btn ${view===key?'selected':''}" data-action="nav" data-view="${key}" aria-label="${label}" title="${label}" ${view===key?'aria-current="page"':''}>${icon(i)}<span class="nav-label">${label}</span>${count?`<span class="nav-count">${count}</span>`:''}</button>`;}
function profileAvatar(extra=''){
  return `<div class="avatar ${extra}" title="${esc(config.name)}">${isProfilePhoto(config.photo)?`<img src="${config.photo}" alt="Foto de ${esc(config.name)}" width="256" height="256">`:esc(config.name.slice(0,2).toUpperCase())}</div>`;
}
function syncIcon(){return icon(drive.status==='synced'?'check':'alert',16);}
function connectionFeedback(){return `<strong>${syncIcon()}<span>${syncText[drive.status]}</span></strong><p>${esc(drive.message||'Ative a sincronizaÃ§Ã£o para recuperar seus estudos em outros dispositivos.')}</p>`;}
function updateDriveFeedback(){
  const label=$('.sync-label');if(label){label.dataset.status=drive.status;label.title=drive.message||syncText[drive.status];label.setAttribute('aria-label',`Google Drive: ${syncText[drive.status]}`);label.innerHTML=`${syncIcon()}<span>${syncText[drive.status]}</span>`;}
  const card=$('.connection-card');if(card){card.dataset.status=drive.status;card.innerHTML=connectionFeedback();}
}
function shell(content){
  const profile=guest?{name:'Visitante',email:'SessÃ£o temporÃ¡ria'}:auth.profile;
  return `<div class="shell ${view==='session'?'session':''} ${view==='home'?'home-shell':''} ${config.sidebarCollapsed?'sidebar-collapsed':''} ${focusMode.active?'focus-mode':''}">
  <aside class="sidebar" id="sidebar"><div class="sidebar-header"><div class="logo"><span class="brand-mark">f.</span><span class="logo-word">foco</span></div><button class="icon-btn sidebar-toggle" data-action="toggle-sidebar" aria-label="${config.sidebarCollapsed?'Expandir menu':'Recolher menu'}" title="${config.sidebarCollapsed?'Expandir menu':'Recolher menu'}" aria-expanded="${!config.sidebarCollapsed}" aria-controls="sidebar">${icon(config.sidebarCollapsed?'panel-open':'panel-close',19)}</button></div><div class="logo-sub">ESTUDO PARA CONCURSOS</div>
  <nav class="nav" aria-label="NavegaÃ§Ã£o principal">${navItem('home','VisÃ£o geral','home')}${navItem('study','Estudar','play')}${navItem('sessions','Minhas sessÃµes','clock')}${navItem('banks','Banco de questÃµes','book',model.banks.length)}${navItem('performance','Desempenho','chart')}${navItem('revision','RevisÃ£o','repeat',model.stats.review||'')}${navItem('settings','Ajustes','settings')}</nav>
  <div class="sidebar-bottom"><div class="sidebar-note">${icon('spark',16)}<strong>Uma questÃ£o de cada vez.</strong>A constÃ¢ncia de hoje abre caminhos para amanhÃ£.</div><div class="profile">${profileAvatar()}<div class="profile-info"><div class="profile-name">${esc(config.name)}</div><small title="${esc(profile.email)}">${esc(profile.email)}</small></div><button class="icon-btn" data-action="logout" aria-label="${guest?'Voltar ao login':'Sair da conta'}" title="${guest?'Voltar ao login':'Sair da conta'}">${icon('logout',16)}</button></div></div></aside>
  <div class="workspace"><header class="topbar"><div class="topbar-heading"></div><div class="mobile-logo"><span class="brand-mark">f.</span>foco</div><div class="flex">${guest?`<button class="guest-status" data-action="guest-login" aria-label="Modo visitante, sem salvar progresso. Voltar ao login" title="Entrar para salvar seus estudos">${icon('clock',16)}<span>Visitante Â· sem salvar</span></button>`:`<button class="sync-label" aria-label="Google Drive: ${syncText[drive.status]}" data-status="${drive.status}" data-action="nav" data-view="settings" title="${esc(drive.message||'Configurar sincronizaÃ§Ã£o com o Google Drive')}">${syncIcon()}<span>${syncText[drive.status]}</span></button>`}<button class="icon-btn" data-action="toggle-theme" aria-label="Alternar tema claro e escuro" title="Alternar tema">${icon(document.documentElement.dataset.theme==='dark'?'sun':'moon',17)}</button><button class="icon-btn" data-action="logout" aria-label="${guest?'Voltar ao login':'Sair da conta'}" title="${guest?'Voltar ao login':'Sair da conta'}">${icon('logout',17)}</button>${view==='session'&&session&&!session.completed?`<button class="icon-btn focus-toggle" data-action="toggle-focus" aria-label="Ativar modo foco em tela cheia" title="Modo foco em tela cheia" aria-pressed="false">${icon('maximize',19)}</button>`:''}</div></header>${focusToolbar()}
  <main class="content" id="main" tabindex="-1">${guest?`<div class="guest-banner" role="status"><span>${icon('clock',16)} Modo visitante. Seu progresso serÃ¡ perdido ao sair ou recarregar.</span><button class="text-link" data-action="guest-login">Entrar com Google ${icon('arrow',13)}</button></div>`:''}${content}</main></div>
  <nav class="mobile-nav" aria-label="NavegaÃ§Ã£o no celular">${[['home','InÃ­cio','home'],['study','Estudar','play'],['banks','QuestÃµes','book'],['performance','Desempenho','chart'],['settings','Ajustes','settings']].map(([k,l,i])=>`<button data-action="nav" data-view="${k}" aria-label="${k==='banks'?'Banco de questÃµes':l}" class="${view===k||k==='study'&&view==='sessions'?'selected':''}" ${view===k||k==='study'&&view==='sessions'?'aria-current="page"':''}>${icon(i)}<span>${l}</span></button>`).join('')}</nav>
  <input type="file" id="bank-file" accept=".json,application/json" class="hidden" multiple><input type="file" id="progress-file" accept=".json,application/json" class="hidden"></div>`;
}
function focusToolbar(){
  const counter=session?`QuestÃ£o ${session.index+1} de ${session.queue.length}`:'Modo foco';
  const mobile=!desktopLayout.matches,exitLabel=mobile?'Pausar e voltar ao inÃ­cio':'Sair do modo foco';
  const question=mobile&&session?sessionQuestion(model,session,session.queue[session.index]):null;
  const caption=question?esc(question.discipline):counter;
  return `<div class="focus-toolbar"><span class="focus-caption">${icon('target',16)}<span class="focus-desktop-label">Modo foco</span><span class="focus-mobile-discipline">${caption}</span>${guest?'<span class="focus-guest-label">Visitante Â· progresso temporÃ¡rio</span>':''}</span><div class="flex"><span class="focus-escape"><kbd>Esc</kbd> para sair</span>${isStandalone()?'':`<button class="icon-btn focus-install" data-action="fullscreen-help" aria-label="Como abrir sem as barras do navegador" title="Sem as barras do navegador">${icon('info',18)}</button>`}<button class="icon-btn" data-action="toggle-theme" aria-label="${document.documentElement.dataset.theme==='dark'?'Ativar tema claro':'Ativar tema escuro'}" title="Alternar tema">${icon(document.documentElement.dataset.theme==='dark'?'sun':'moon',19)}</button><button class="btn small" data-action="exit-focus" aria-label="${exitLabel}" title="${exitLabel}${mobile?'':' Â· Esc'}">${icon(mobile?'back':'minimize',18)}<span class="focus-exit-desktop">Sair do foco</span><span class="focus-exit-mobile">Sair</span></button></div></div>`;
}
function fullscreenHelp(){
  showDialog(`<div class="dialog-title"><h2 id="dialog-title">Foco sem as barras do navegador</h2><p>A tela cheia depende do navegador. Se ele nÃ£o permitir ocultar as barras, abra o Foco como app da web.</p></div><section class="fullscreen-help"><h3>iPhone / iPad</h3><ol><li>Abra o site no Safari e use o menu de compartilhar.</li><li>Escolha Adicionar Ã  Tela de InÃ­cio.</li><li>Se disponÃ­vel, ative Abrir como App da Web e confirme.</li><li>Abra o Foco pelo novo Ã­cone e inicie ou retome uma sessÃ£o. No Mobile, o modo foco Ã© automÃ¡tico.</li></ol><h3>Android</h3><p>No menu do navegador, procure Instalar app ou Adicionar Ã  tela inicial. Se disponÃ­vel, abra pelo novo Ã­cone.</p><p class="setting-note">Entre com a mesma conta Google e conecte o Drive para recuperar os estudos neste acesso. O modo visitante continua temporÃ¡rio. Acesso Ã  internet necessÃ¡rio; nÃ£o hÃ¡ modo offline.</p></section><div class="dialog-actions"><button class="btn primary" data-action="close-dialog">Voltar Ã  questÃ£o</button></div>`);
}
function heading(title,subtitle,extra=''){return `<div class="page-heading between"><div><h1>${title}</h1><p>${subtitle}</p></div>${extra}</div>`;}
function stat(label,value,sub,i){return `<div class="stat"><div class="stat-top"><span>${label}</span>${icon(i,16)}</div><div class="stat-number">${value}</div><div class="stat-sub">${sub}</div></div>`;}
function progressBar(value){return `<div class="progress-track"><span style="width:${clamp(value,0,100)}%"></span></div>`;}
function empty(title,description,action=''){return `<div class="empty">${icon('book',28)}<h3>${title}</h3><p>${description}</p>${action}</div>`;}
function resumeSession(){return model.sessions.find(s=>s.id===config.activeSession&&!s.completed)||model.sessions.filter(s=>!s.completed&&!s.abandoned).at(-1);}
function sessions(){return heading('Minhas sessÃµes','Retome seus estudos e consulte os resultados de cada tentativa.',`<button class="btn primary small" data-action="start">${icon('plus',15)} Nova sessÃ£o</button>`)+sessionsView(model,sessionFilters);}
function currentResultSession(){return resultSessionId?model.sessions.find(s=>s.id===resultSessionId):session;}
async function resumeStudy(id){
  await accountStorage.refresh?.();store.load();refreshModel();
  const target=id?model.sessions.find(s=>s.id===id):resumeSession();
  if(!target||target.completed||target.abandoned){toast('Esta sessÃ£o nÃ£o estÃ¡ mais disponÃ­vel para continuar.');return;}
  if(!sessionSummary(target,model).canResume){toast('Reimporte o banco original para recuperar as questÃµes desta sessÃ£o.');return;}
  session=structuredClone(target);resultSessionId=null;config.activeSession=session.id;saveConfig();await navigate('session');
}
async function deleteStudySession(id){
  const ownStore=store,ownDrive=drive,subject=auth?.profile?.sub,generation=auth?.generation;
  const target=model.sessions.find(s=>s.id===id);if(!target)return;
  const summary=sessionSummary(target,model);
  if(!await confirmDialog('Excluir esta sessÃ£o?',`â€œ${summary.title}â€ Â· ${sessionDate(summary.updatedAt)}. A sessÃ£o sairÃ¡ da lista e nÃ£o poderÃ¡ ser retomada ou consultada. Suas respostas jÃ¡ registradas, acertos, erros, favoritos e revisÃµes continuarÃ£o no progresso. As outras sessÃµes serÃ£o mantidas.${target.mode==='exam'&&!target.completed?' As escolhas deste simulado nÃ£o concluÃ­do serÃ£o descartadas, sem gerar acertos ou erros.':''}`,'Excluir sessÃ£o',{danger:true}))return;
  if(store!==ownStore||drive!==ownDrive||auth?.profile?.sub!==subject||auth?.generation!==generation)return;
  working=true;
  try{
    await ownStore.deleteSession(id);refreshModel();clearSessionDrafts(id);render();
    if(ownDrive.token){try{await ownDrive.sync();toast(ownDrive.status==='synced'?'SessÃ£o excluÃ­da e sincronizada. Seu progresso foi mantido.':'SessÃ£o excluÃ­da neste dispositivo. A sincronizaÃ§Ã£o estÃ¡ pendente.');}catch{toast('SessÃ£o excluÃ­da neste dispositivo. O envio ao Drive estÃ¡ pendente.');}}
    else toast('SessÃ£o excluÃ­da. Seu progresso foi mantido.');
  }finally{working=false;}
}
function clearSessionDrafts(id){for(const key of draftSelections.keys())if(key.startsWith(`${id}:`))draftSelections.delete(key);}
function weekChart(answers=model.answers){
  const days=Array.from({length:7},(_,i)=>{const d=new Date(Date.now()-(6-i)*86400000);const a=answers.filter(e=>localDay(e.at)===localDay(d));return {day:d.toLocaleDateString('pt-BR',{weekday:'short',timeZone:'America/Sao_Paulo'}).replace('.',''),total:a.length,correct:a.filter(e=>e.correct).length};});
  const max=Math.max(5,...days.map(d=>d.total));
  return `<div class="week-chart" role="img" aria-label="QuestÃµes resolvidas nos Ãºltimos sete dias: ${days.map(d=>`${d.day} ${d.total}`).join(', ')}">${days.map(d=>`<div class="week-col" title="${d.total} respo…13360 tokens truncated…t.dataset.bank,null,true);return;}
    if(action==='bank-toggle'){const b=model.banks.find(b=>b.id===target.dataset.bank);await store.add([{type:sourceType(b)==='system'?'system-bank-state':'bank-state',bankId:b.id,value:b.enabled?'disabled':'enabled'}]);render();return;}
    if(action==='bank-delete'){const b=model.banks.find(b=>b.id===target.dataset.bank);if(!b||sourceType(b)!=='personal'){toast('Apenas bancos pessoais podem ser excluÃ­dos.');return;}const warning=progressLinkCandidates(model,b).length?' Este progresso ainda estÃ¡ separado do Sistema. Para continuar os mesmos estudos no banco nativo, cancele e use Associar progresso primeiro.':'';if(await confirmDialog('Excluir este banco?',`â€œ${b.displayName||b.name}â€ sairÃ¡ da lista de estudos. Seu histÃ³rico serÃ¡ preservado. VocÃª poderÃ¡ importar o banco novamente.${warning}`, 'Excluir banco')){await store.add([{type:'bank-state',bankId:b.id,value:'deleted'}]);render();toast('Banco removido da lista.');}return;}
    if(action==='resume'||action==='session-resume'){await resumeStudy(target.dataset.session);return;}
    if(action==='session-delete'){await deleteStudySession(target.dataset.session);return;}
    if(action==='session-result'){
      const item=model.sessions.find(s=>s.id===target.dataset.session);
      if(!item?.completed){toast('Conclua a sessÃ£o para consultar o resultado.');return;}
      resultSessionId=item.id;await navigate('result');return;
    }
    if(action==='sessions-tab'&&view==='sessions'){sessionFilters.status=target.dataset.status==='completed'?'completed':'open';sessionFilters.page=1;render();return;}
    if(action==='sessions-page'&&view==='sessions'){sessionFilters.page=Math.max(1,Number(target.dataset.page)||1);render();return;}
    if(action==='pause'){await navigate('home');return;}
    if(action==='toggle-cut'){toggleCut(target.dataset.option);return;}
    if(action==='select'){if(view!=='session'||!session||session.answers[session.queue[session.index]]!=null)return;selected=target.dataset.option;draftSelections.set(draftKey(),selected);render();$(`.option-select[data-option="${selected}"]`)?.focus({preventScroll:true});return;}
    if(action==='single'){await newSession([target.dataset.key]);navigate('session');return;}
    if(action==='session-errors'){
      const source=currentResultSession();if(!source?.completed)return;
      const queue=[...new Set(sessionReport(source,model).questions.filter(q=>q.correct===false).map(q=>model.progressLinks?.get(q.key)?.key||q.key).filter(key=>model.questions.some(current=>current.key===key)))];
      if(!queue.length){toast('Reimporte o banco para revisar as questÃµes desta sessÃ£o.');return;}
      await newSession(queue,'errors');navigate('session');return;
    }
    if(action==='flag'){working=true;await toggleFlag(target.dataset.flag);return;}
    if(action==='answer'){working=true;await answer();return;}
    if(action==='previous'||action==='next'){working=true;await move(action==='previous'?-1:1);return;}
    if(action==='finish'){working=true;await finish();return;}
    if(action==='connect-drive'){working=true;toast('Abrindo a autorizaÃ§Ã£o do Googleâ€¦');await drive.connect();config.onboardingDone=true;saveConfig();if(view==='folder')view='home';render();toast('Pasta salva na sua conta Google e progresso sincronizado.');return;}
    if(action==='disconnect-drive'){drive.disconnect();render();return;}
    if(action==='sync'){await drive.sync();render();toast('HistÃ³ricos sincronizados com o Drive.');return;}
    if(action==='drive-banks'){await driveBanks();return;}
  }catch(error){if(action==='connect-drive')render();failure(error);}finally{working=false;if(!auth?.profile&&!guest&&!restoration)renderLogin();}
});
document.addEventListener('change',event=>{
  if(restoration||resetSaving||working)return;
  if(view==='sessions'&&['bankId','type'].includes(event.target.dataset?.sessionFilter)){
    const field=event.target.dataset.sessionFilter;
    sessionFilters[field]=field==='type'&& !['all','study','exam'].includes(event.target.value)?'all':event.target.value;
    sessionFilters.page=1;render();$(`#sessions-${field==='bankId'?'bank':'type'}`)?.focus({preventScroll:true});
  }
  if(view==='performance'&&event.target.dataset?.performanceOrigin!==undefined){performanceOrigin=['system','personal'].includes(event.target.value)?event.target.value:'all';render();$('#performance-origin')?.focus({preventScroll:true});}
  if(view==='performance'&&event.target.dataset?.performanceBank!==undefined){performanceBank=event.target.value;render();$('#performance-bank')?.focus({preventScroll:true});}
});
// Arrow keys remain available to editors and controls that own their navigation.
function usesQuestionNavigation(target){
  return target?.isContentEditable||!!target?.closest?.('input,textarea,select,summary,iframe,audio,video,[contenteditable]:not([contenteditable="false"]),[aria-haspopup]:not([aria-haspopup="false"]),[role="textbox"],[role="combobox"],[role="listbox"],[role="option"],[role="checkbox"],[role="radio"],[role="switch"],[role="slider"],[role="spinbutton"],[role="menu"],[role="menuitem"],[role="tab"],[role="tree"],[role="grid"]');
}
document.addEventListener('keydown',async event=>{
  if(restoration||resetSaving)return;
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
    if(!desktopLayout.matches||view!=='session'||!session||session.completed||working||$('#dialog').open||document.querySelector('dialog[open],[aria-modal="true"]:not([hidden])')||event.defaultPrevented||event.isComposing||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||usesQuestionNavigation(event.target)||event.composedPath?.().some(usesQuestionNavigation))return;
    const q=sessionQuestion(model,session,session.queue[session.index]);
    if(!q)return;
    event.preventDefault();
    if(event.repeat)return;
    working=true;
    try{await move(event.key==='ArrowLeft'?-1:1);}catch(error){failure(error);}finally{working=false;}
    return;
  }
  if(event.key==='Escape'&&focusMode.active&&!$('#dialog').open){event.preventDefault();await leaveQuestionFocus();return;}
  const enterButton=event.key==='Enter'?event.target.closest?.('button'):null;
  const enterAction=enterButton?.dataset?.action??event.target.dataset?.action;
  if(event.key==='Enter'&&event.repeat&&(finishingSession||enterAction==='finish')){event.preventDefault();return;}
  if(enterButton&&!['select','answer','finish',...(desktopLayout.matches?['next']:[])].includes(enterAction))return;
  if(view!=='session'||!session||session.completed||$('#dialog').open||working||event.defaultPrevented||event.isComposing||document.querySelector('dialog[open],[aria-modal="true"]:not([hidden])')||event.target.isContentEditable||event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"]'))return;
  const q=sessionQuestion(model,session,session.queue[session.index]);if(!q)return;
  try{
    if(event.altKey||event.ctrlKey||event.metaKey)return;
    if(event.key==='Enter'&&(enterAction==='finish'||!enterButton)&&sessionFinishButton()){
      const ownsEnter=target=>usesQuestionNavigation(target)||!!target?.closest?.('a[href]');
      if(event.shiftKey||ownsEnter(event.target)||event.composedPath?.().some(ownsEnter))return;
      event.preventDefault();if(event.repeat)return;
      working=true;await finish();return;
    }
    if(event.key==='Enter'&&enterAction==='finish'){event.preventDefault();return;}
    if(desktopLayout.matches&&(event.key.toLowerCase()==='t'||event.key==='Enter')){
      if(event.shiftKey||usesQuestionNavigation(event.target)||event.composedPath?.().some(usesQuestionNavigation))return;
      if(event.key.toLowerCase()==='t'){
        event.preventDefault();
        if(!event.repeat)toggleCut(session.answers[q.key]||selected);
        return;
      }
      if(session.answers[q.key]||enterAction==='next'){
        event.preventDefault();if(event.repeat)return;
        working=true;await move(1);return;
      }
      if(selected){
        event.preventDefault();if(event.repeat)return;
        working=true;await answer();
        if(session?.answers[q.key])(sessionFinishButton()||$('[data-action=next]'))?.focus({preventScroll:true});
        return;
      }
    }
    if(['f','r'].includes(event.key.toLowerCase())){event.preventDefault();if(event.repeat)return;working=true;await toggleFlag(event.key.toLowerCase()==='f'?'favorite':'review');return;}
    if(event.repeat)return;
    const option=/^[1-8]$/.test(event.key)?q.options[Number(event.key)-1]?.id:q.options.find(o=>o.id===event.key.toUpperCase())?.id;
    if(option&&!session.answers[q.key]){event.preventDefault();selected=option;draftSelections.set(draftKey(),selected);render();}
    if(event.key==='Enter'&&!session.answers[q.key]&&selected){event.preventDefault();working=true;await answer();sessionFinishButton()?.focus({preventScroll:true});}
  }catch(e){failure(e);}finally{working=false;}
});
async function refreshAccountJournal(){
  const ownStorage=accountStorage;if(restoration||!ownStorage||!store)return;
  await ownStorage.refresh?.();if(accountStorage!==ownStorage||restoration||!store)return;
  store.load();refreshModel();if(view!=='session'&&!$('#dialog').open)render();
}
window.addEventListener('storage',event=>{if(auth?.profile&&accountStorage?.ownsKey(event.key)&&event.key.includes(':foco:v1:event:'))void refreshAccountJournal().catch(failure);});
window.addEventListener('online',()=>{if(!restoration&&!resetSaving&&drive?.token&&!drive.connecting)drive.sync().catch(()=>{});});
window.addEventListener('focus',()=>{void refreshAccountJournal().then(()=>{if(!restoration&&!resetSaving&&drive?.token&&!drive.busy&&!drive.connecting)return drive.sync();}).catch(()=>{});});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(config.theme==='system'){applyTheme();render();}});
async function loadGoogleForLogin(){
  if(googleLoading||auth?.redirectEnabled||!validClientId(auth?.clientId))return;
  googleLoading=true;googleLoadError='';loginError='';loginErrorCode='';
  if(!guest&&!auth.profile&&!restoration)renderLogin();
  try{await prepareGoogle();}catch(error){googleLoadError=error.message;}
  finally{googleLoading=false;if(!guest&&!auth?.profile&&!restoration)renderLogin();}
}
function renderLogin(){
  if(restoration){renderLoading();return;}
  if(!auth?.redirectEnabled&&isGoogleReady()&&!working)try{auth.prepareAuthorization();}catch(error){googleLoadError=error.message;}
  $('#app').innerHTML=loginView({ready:validClientId(auth?.clientId),oauthReady:!googleLoading&&(auth?.redirectEnabled||isGoogleReady()&&!googleLoadError),redirect:auth?.redirectEnabled,loading:googleLoading,retryGoogle:!!googleLoadError,busy:working,error:loginError||googleLoadError,errorCode:loginError?loginErrorCode:'',siteOrigin:window.location?.origin,theme:document.documentElement.dataset.theme});document.title='Entrar Â· Foco';
  const form=$('#oauth-preview-form');if(form)form.onsubmit=e=>{e.preventDefault();const id=form.elements.namedItem('clientId').value.trim();if(!validClientId(id)){loginErrorCode='';loginError='Informe apenas o ID pÃºblico de um cliente OAuth Google Web.';renderLogin();return;}localStorage.setItem('foco:oauth-preview',id);auth.clientId=id;loginError='';renderLogin();void loadGoogleForLogin();};
}
async function openAccount(result){
  guest=false;resetHistoryUI();restoreAuthorization=result;restoration=restoreProgress(null,{stage:'profile'});renderLoading();
  const profile=result.profile;accountStorage?.close?.();accountStorage=await openAccountStorage(localStorage,profile.sub);
  const ownStorage=accountStorage;
  accountStorage.addEventListener?.('change',()=>{if(accountStorage!==ownStorage||!store||restoration)return;try{store.load();refreshModel();if(view!=='session'&&!$('#dialog').open)render();}catch(error){failure(error);}});
  config={...defaults,...JSON.parse(accountStorage.getItem('foco:config')||'{}')};config.name=config.name==='Estudante'?profile.name:config.name;applyTheme();store=new Store(accountStorage);
  await loadSystemCatalog();
  legacyAvailable=false;
  if(publicConfig.legacyOwnerEmailSha256){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(profile.email.toLowerCase()));const hash=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');legacyAvailable=hash===publicConfig.legacyOwnerEmailSha256&&Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).some(k=>k?.startsWith('foco:v1:event:'));}
  refreshModel();const folderSettings=new DriveSettings(accountStorage,auth);drive=new DriveSync(store,config,auth,folderSettings);const ownDrive=drive;
  drive.addEventListener('config',()=>{if(drive===ownDrive)saveConfig();});
  folderSettings.addEventListener('status',()=>{if(drive!==ownDrive)return;const text=$('#folder-settings-status');if(text){text.textContent=folderSettings.message;text.setAttribute('data-status',folderSettings.status);}});
  store.addEventListener('change',()=>{if(drive===ownDrive){const change=refreshModel();if(change&&!restoration){render();if(change!=='session-deleted'||!working)toast(change==='session-deleted'?'Esta sessÃ£o foi excluÃ­da. Seu progresso foi mantido.':'Seu progresso foi reiniciado. Inicie uma nova sessÃ£o.');}ownDrive.schedule();}});
  drive.addEventListener('status',()=>{if(drive===ownDrive&&auth.profile)updateDriveFeedback();});
  ownDrive.addEventListener('progress',()=>{if(drive===ownDrive&&restoration?.state==='loading'){restoration=restoreProgress(restoration,ownDrive.restoreProgress);renderLoading();}});
  await restoreAccount(result);
}
async function restoreAccount(result=restoreAuthorization){
  restoration=restoreProgress(null,{stage:'folder'});renderLoading();
  const folderSettings=drive.settings;
  try{
    if(!auth.canAppData){restoration={state:'permission',percent:20,detail:'Autorize o Google para localizar sua pasta e restaurar seus estudos em seguranÃ§a.'};renderLoading();return;}
    if(result?.pendingFolderId){
      if(!auth.canDrive){restoration={state:'permission',percent:25,detail:'Autorize o Drive para conectar a pasta escolhida.'};renderLoading();return;}
      await drive.useAuthorization(result,{folderId:parseFolder(result.pendingFolderId)});delete result.pendingFolderId;config.onboardingDone=true;
      restoration=restoreProgress(restoration,{stage:'ready'});renderLoading();finishRestoration();return;
    }
    const saved=await folderSettings.restore();if(saved){config.folderId=saved.folderId;config.onboardingDone=true;}
    if(config.folderId){
      if(!auth.canDrive){restoration={state:'permission',percent:25,detail:'Sua pasta foi encontrada. Autorize o acesso ao Drive para recuperar as questÃµes e o progresso antes de continuar.'};renderLoading();return;}
      await drive.useAuthorization(result);
    }
    restoration=restoreProgress(restoration,{stage:'ready'});renderLoading();
    finishRestoration();
  }catch(error){restoration={state:'error',percent:restoration?.percent||20,detail:error.message};renderLoading();}
}
function renderLoading(){
  $('#app').innerHTML=loadingView({...restoration,theme:document.documentElement.dataset.theme,guest});
  document.title=guest?'Preparando questÃµes Â· Foco':'Restaurando estudos Â· Foco';
}
function finishRestoration(){
  restoration=null;session=null;selected=null;draftSelections.clear();resetCuts();view=config.onboardingDone||config.folderId?'home':'folder';saveConfig();render();window.scrollTo(0,0);$('#main')?.focus({preventScroll:true});
}
async function handleRestorationAction(action){
  if(restoration.state==='loading'||working)return;
  try{
    if(action==='restore-local'){config.onboardingDone=true;drive.disconnect();finishRestoration();toast('Usando apenas os dados deste navegador. O Drive nÃ£o foi restaurado.');return;}
    if(action==='restore-logout'){restoration=null;await logout();return;}
    if(!['restore-authorize','restore-retry'].includes(action))return;
    working=true;
    if(action==='restore-authorize'||Date.now()>=auth.expires-10000){
      restoration=restoreProgress(null,{stage:'access'});renderLoading();
      restoreAuthorization=await auth.authorize(true);
    }
    await restoreAccount(restoreAuthorization);
  }catch(error){restoration={state:'error',percent:restoration?.percent||20,detail:error.message};renderLoading();}
  finally{working=false;}
}
async function openGuest(){
  await auth.signOut();resetHistoryUI();guest=true;legacyAvailable=false;accountStorage=new TemporaryStorage();
  config={...defaults,name:'Visitante',onboardingDone:true,theme:localStorage.getItem('foco:appearance')||'light'};
  applyTheme();restoration=restoreProgress(null,{stage:'profile'});renderLoading();
  try{
    store=new Store(accountStorage);await loadSystemCatalog();
    drive=new DriveSync(store,config);store.addEventListener('change',refreshModel);
    finishRestoration();
  }catch(error){guest=false;restoration=null;store=null;drive=null;accountStorage?.close?.();accountStorage=null;loginError=error.message;loginErrorCode=error.code||'';renderLogin();}
}

async function logout(){
  if(drive?.busy||drive?.connecting){toast('Aguarde a sincronizaÃ§Ã£o terminar para sair.');return;}
  if(drive?.token&&drive.status==='pending'){working=true;try{await drive.sync();}catch{toast('O envio nÃ£o foi concluÃ­do. O progresso local desta conta foi preservado.');}}
  await focusMode.exit();drive?.close();await auth.signOut();guest=false;restoration=null;restoreAuthorization=null;closeDialog();store=null;model=null;drive=null;accountStorage?.close?.();accountStorage=null;session=null;selected=null;draftSelections.clear();resetCuts();resetHistoryUI();expandedBankDetails.clear();view='home';legacyAvailable=false;working=false;loginError='';loginErrorCode='';config={...defaults,theme:localStorage.getItem('foco:appearance')||'light'};applyTheme();renderLogin();window.scrollTo(0,0);
}
async function migrateLegacy(){
  if(!legacyAvailable)return;
  if(!await confirmDialog('Recuperar estudos anteriores?','As respostas e os bancos da versÃ£o pessoal serÃ£o unidos a esta conta Google. A cÃ³pia original continuarÃ¡ preservada.','Recuperar'))return;
  const legacy=new Store(localStorage);await store.merge(legacy.events);const old=JSON.parse(localStorage.getItem('foco:config')||'{}');if(!config.folderId&&old.folderId)config.folderId=old.folderId;saveConfig();render();toast('HistÃ³rico anterior recuperado nesta conta.');
}
async function init(){
  try{
    config={...defaults,theme:localStorage.getItem('foco:appearance')||'light'};applyTheme();
    const response=await fetch('./app-config.json',{cache:'no-store'});if(response.ok)publicConfig=await response.json();
    const legacyConfig=JSON.parse(localStorage.getItem('foco:config')||'{}');
    auth=new GoogleAccount(publicConfig.googleClientId||localStorage.getItem('foco:oauth-preview')||legacyConfig.clientId||'');
    const notice=consumeGoogleReturn();googleLoading=true;working=notice==='success';renderLogin();
    await auth.prepareRedirect();googleLoading=false;
    if(guest)return;
    if(notice==='success'){
      try{await openAccount(await auth.restoreRedirect());}
      catch(error){loginError=error.message;drive?.close();await auth.signOut();restoration=null;accountStorage?.close?.();accountStorage=null;store=null;drive=null;}
      finally{working=false;}
    }else if(notice)loginError=googleReturnMessage(notice);
    if(!auth.profile&&!restoration){renderLogin();if(!auth.redirectEnabled)void loadGoogleForLogin();}
  }catch(error){googleLoading=false;working=false;loginError=error.message;auth=new GoogleAccount('');renderLogin();}
}
init();

