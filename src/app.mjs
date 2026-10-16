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
import {sourceType,sourceTag,sourceLabel,questionSource,sessionQuestion,preparePersonalBank} from './bank-source.mjs';
import {createSession,chooseAnswer,moveSession,completeSession} from './session.mjs';
import {FocusMode} from './focus-mode.mjs';
import {TemporaryStorage} from './temporary-storage.mjs';
import {restoreProgress,resetSaveProgress} from './restore-progress.mjs';
import {questionOriginBadges,questionSourceDetails} from './question-origin.mjs';
import {explanationView} from './explanation-view.mjs';
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
const draftSelections=new Map();
const expandedBankDetails=new Set();
const systemCatalog=new SystemBanks();
let systemCatalogError='';
async function loadSystemCatalog({force=false}={}){try{await systemCatalog.load({force});systemCatalogError='';}catch(error){systemCatalogError=error.message;}store.setSystemBanks(systemCatalog.banks);}
let sessionFilters={status:'open',bankId:'',type:'all',page:1},performanceBank='',performanceOrigin='all',resultSessionId=null;
function resetHistoryUI(){sessionFilters={status:'open',bankId:'',type:'all',page:1};performanceBank='';performanceOrigin='all';resultSessionId=null;}
const draftKey=()=>session?`${session.id}:${session.queue[session.index]}`:null;
let store,model,drive,view='home',session=null,selected=null,working=false,config={...defaults},toastTimer,auth,accountStorage,publicConfig={},loginError='',loginErrorCode='',legacyAvailable=false;
const modes={smart:['Recomendadas','Um equilíbrio entre questões novas, erros e revisões.','spark'],random:['Aleatórias','Uma nova seleção, sem repetir questões na sessão.','shuffle'],new:['Não respondidas','Amplie o conteúdo que você já estudou.','book'],errors:['Revisar erros','Transforme as últimas respostas erradas em aprendizado.','repeat'],favorites:['Favoritas','Volte às questões que você quer ter por perto.','heart'],review:['Revisão espaçada','Questões marcadas e revisões que venceram hoje.','flag'],subject:['Por assunto','Escolha a disciplina, o assunto e o tópico.','filter'],exam:['Simulado','Responda no seu ritmo. O resultado aparece no final.','clock']};
const syncText={local:'Salvo neste dispositivo',pending:'Envio pendente',syncing:'Sincronizando…',synced:'Drive sincronizado',expired:'Reconectar Drive',error:'Falha na sincronização'};
const desktopLayout=matchMedia('(min-width: 701px)');
function isStandalone(){return matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||window.navigator?.standalone===true;}
const focusMode=new FocusMode({document,standalone:isStandalone,retainOnFullscreenExit:()=>!desktopLayout.matches&&view==='session'&&!!session&&!session.completed,onChange:()=>{
  if((!auth?.profile&&!guest)||!store||!drive)return;
  render();
  $(focusMode.active?(desktopLayout.matches?'.question-body':'[data-action=exit-focus]'):'[data-action=toggle-focus]')?.focus({preventScroll:true});
},onUnavailable:()=>toast(desktopLayout.matches?'Modo foco ativado. A tela cheia não está disponível neste navegador.':'Foco ativado. Para ocultar as barras, use o acesso pela Tela de Início (ícone de ajuda).')});
desktopLayout.addEventListener('change',()=>{
  if(restoration||view!=='session'||!session||session.completed)return;
  if(!desktopLayout.matches&&!focusMode.active){void focusMode.enter({automatic:true});return;}
  render();
});
function saveConfig(){accountStorage?.setItem('foco:config',JSON.stringify(config));localStorage.setItem('foco:appearance',config.theme);}
function applyTheme(){document.documentElement.dataset.theme=config.theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):config.theme;document.querySelector('meta[name=theme-color]').content=document.documentElement.dataset.theme==='dark'?'#212121':'#f8f9fc';}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),4500);}
function failure(error){console.error(error);if(error?.code==='PROGRESS_RESET'){refreshModel();render();}toast(error?.name==='QuotaExceededError'?'O armazenamento local está cheio. Exporte seu progresso para preservar os dados.':error.message||'Não foi possível concluir. Tente novamente.');}
function refreshModel(){
  const next=store.model(),changed=!!model&&model.progressEpoch!==next.progressEpoch;model=next;
  if(changed||(session&&(session.progressEpoch??null)!==model.progressEpoch)){
    session=null;selected=null;draftSelections.clear();resetCuts();resetHistoryUI();config.activeSession=null;
    try{saveConfig();}catch(error){console.warn('Não foi possível salvar a referência da sessão encerrada.',error);}
    if(view==='session'||view==='result'){view='performance';if(focusMode.active)void focusMode.exit();return true;}
  }
  return false;
}
function navItem(key,label,i,count=''){return `<button class="nav-btn ${view===key?'selected':''}" data-action="nav" data-view="${key}" aria-label="${label}" title="${label}" ${view===key?'aria-current="page"':''}>${icon(i)}<span class="nav-label">${label}</span>${count?`<span class="nav-count">${count}</span>`:''}</button>`;}
function profileAvatar(extra=''){
  return `<div class="avatar ${extra}" title="${esc(config.name)}">${isProfilePhoto(config.photo)?`<img src="${config.photo}" alt="Foto de ${esc(config.name)}" width="256" height="256">`:esc(config.name.slice(0,2).toUpperCase())}</div>`;
}
function syncIcon(){return icon(drive.status==='synced'?'check':'alert',16);}
function connectionFeedback(){return `<strong>${syncIcon()}<span>${syncText[drive.status]}</span></strong><p>${esc(drive.message||'Ative a sincronização para recuperar seus estudos em outros dispositivos.')}</p>`;}
function updateDriveFeedback(){
  const label=$('.sync-label');if(label){label.dataset.status=drive.status;label.title=drive.message||syncText[drive.status];label.setAttribute('aria-label',`Google Drive: ${syncText[drive.status]}`);label.innerHTML=`${syncIcon()}<span>${syncText[drive.status]}</span>`;}
  const card=$('.connection-card');if(card){card.dataset.status=drive.status;card.innerHTML=connectionFeedback();}
}
function shell(content){
  const profile=guest?{name:'Visitante',email:'Sessão temporária'}:auth.profile;
  return `<div class="shell ${view==='session'?'session':''} ${view==='home'?'home-shell':''} ${config.sidebarCollapsed?'sidebar-collapsed':''} ${focusMode.active?'focus-mode':''}">
  <aside class="sidebar" id="sidebar"><div class="sidebar-header"><div class="logo"><span class="brand-mark">f.</span><span class="logo-word">foco</span></div><button class="icon-btn sidebar-toggle" data-action="toggle-sidebar" aria-label="${config.sidebarCollapsed?'Expandir menu':'Recolher menu'}" title="${config.sidebarCollapsed?'Expandir menu':'Recolher menu'}" aria-expanded="${!config.sidebarCollapsed}" aria-controls="sidebar">${icon(config.sidebarCollapsed?'panel-open':'panel-close',19)}</button></div><div class="logo-sub">ESTUDO PARA CONCURSOS</div>
  <nav class="nav" aria-label="Navegação principal">${navItem('home','Visão geral','home')}${navItem('study','Estudar','play')}${navItem('sessions','Minhas sessões','clock')}${navItem('banks','Banco de questões','book',model.banks.length)}${navItem('performance','Desempenho','chart')}${navItem('revision','Revisão','repeat',model.stats.review||'')}${navItem('settings','Ajustes','settings')}</nav>
  <div class="sidebar-bottom"><div class="sidebar-note">${icon('spark',16)}<strong>Uma questão de cada vez.</strong>A constância de hoje abre caminhos para amanhã.</div><div class="profile">${profileAvatar()}<div class="profile-info"><div class="profile-name">${esc(config.name)}</div><small title="${esc(profile.email)}">${esc(profile.email)}</small></div><button class="icon-btn" data-action="logout" aria-label="${guest?'Voltar ao login':'Sair da conta'}" title="${guest?'Voltar ao login':'Sair da conta'}">${icon('logout',16)}</button></div></div></aside>
  <div class="workspace"><header class="topbar"><div class="topbar-heading"><span class="top-label">Seu espaço de estudo</span></div><div class="mobile-logo"><span class="brand-mark">f.</span>foco</div><div class="flex">${guest?`<button class="guest-status" data-action="guest-login" aria-label="Modo visitante, sem salvar progresso. Voltar ao login" title="Entrar para salvar seus estudos">${icon('clock',16)}<span>Visitante · sem salvar</span></button>`:`<button class="sync-label" aria-label="Google Drive: ${syncText[drive.status]}" data-status="${drive.status}" data-action="nav" data-view="settings" title="${esc(drive.message||'Configurar sincronização com o Google Drive')}">${syncIcon()}<span>${syncText[drive.status]}</span></button>`}<button class="icon-btn" data-action="toggle-theme" aria-label="Alternar tema claro e escuro" title="Alternar tema">${icon(document.documentElement.dataset.theme==='dark'?'sun':'moon',17)}</button><button class="icon-btn" data-action="logout" aria-label="${guest?'Voltar ao login':'Sair da conta'}" title="${guest?'Voltar ao login':'Sair da conta'}">${icon('logout',17)}</button>${view==='session'&&session&&!session.completed?`<button class="icon-btn focus-toggle" data-action="toggle-focus" aria-label="Ativar modo foco em tela cheia" title="Modo foco em tela cheia" aria-pressed="false">${icon('maximize',19)}</button>`:''}</div></header>${focusToolbar()}
  <main class="content" id="main" tabindex="-1">${guest?`<div class="guest-banner" role="status"><span>${icon('clock',16)} Modo visitante. Seu progresso será perdido ao sair ou recarregar.</span><button class="text-link" data-action="guest-login">Entrar com Google ${icon('arrow',13)}</button></div>`:''}${content}</main></div>
  <nav class="mobile-nav" aria-label="Navegação no celular">${[['home','Início','home'],['study','Estudar','play'],['banks','Questões','book'],['performance','Desempenho','chart'],['settings','Ajustes','settings']].map(([k,l,i])=>`<button data-action="nav" data-view="${k}" aria-label="${k==='banks'?'Banco de questões':l}" class="${view===k||k==='study'&&view==='sessions'?'selected':''}" ${view===k||k==='study'&&view==='sessions'?'aria-current="page"':''}>${icon(i)}<span>${l}</span></button>`).join('')}</nav>
  <input type="file" id="bank-file" accept=".json,application/json" class="hidden" multiple><input type="file" id="progress-file" accept=".json,application/json" class="hidden"></div>`;
}
function focusToolbar(){
  const counter=session?`Questão ${session.index+1} de ${session.queue.length}`:'Modo foco';
  const mobile=!desktopLayout.matches,exitLabel=mobile?'Pausar e voltar ao início':'Sair do modo foco';
  return `<div class="focus-toolbar"><span class="focus-caption">${icon('target',16)}<span class="focus-desktop-label">Modo foco</span><span class="focus-mobile-progress">${counter}</span>${guest?'<span class="focus-guest-label">Visitante · progresso temporário</span>':''}</span><div class="flex"><span class="focus-escape"><kbd>Esc</kbd> para sair</span>${isStandalone()?'':`<button class="icon-btn focus-install" data-action="fullscreen-help" aria-label="Como abrir sem as barras do navegador" title="Sem as barras do navegador">${icon('info',18)}</button>`}<button class="icon-btn" data-action="toggle-theme" aria-label="${document.documentElement.dataset.theme==='dark'?'Ativar tema claro':'Ativar tema escuro'}" title="Alternar tema">${icon(document.documentElement.dataset.theme==='dark'?'sun':'moon',19)}</button><button class="btn small" data-action="exit-focus" aria-label="${exitLabel}" title="${exitLabel}${mobile?'':' · Esc'}">${icon(mobile?'back':'minimize',18)}<span class="focus-exit-desktop">Sair do foco</span><span class="focus-exit-mobile">Sair</span></button></div></div>`;
}
function fullscreenHelp(){
  showDialog(`<div class="dialog-title"><h2 id="dialog-title">Foco sem as barras do navegador</h2><p>A tela cheia depende do navegador. Se ele não permitir ocultar as barras, abra o Foco como app da web.</p></div><section class="fullscreen-help"><h3>iPhone / iPad</h3><ol><li>Abra o site no Safari e use o menu de compartilhar.</li><li>Escolha Adicionar à Tela de Início.</li><li>Se disponível, ative Abrir como App da Web e confirme.</li><li>Abra o Foco pelo novo ícone e inicie ou retome uma sessão. No Mobile, o modo foco é automático.</li></ol><h3>Android</h3><p>No menu do navegador, procure Instalar app ou Adicionar à tela inicial. Se disponível, abra pelo novo ícone.</p><p class="setting-note">Entre com a mesma conta Google e conecte o Drive para recuperar os estudos neste acesso. O modo visitante continua temporário. Acesso à internet necessário; não há modo offline.</p></section><div class="dialog-actions"><button class="btn primary" data-action="close-dialog">Voltar à questão</button></div>`);
}
function heading(title,subtitle,extra=''){return `<div class="page-heading between"><div><h1>${title}</h1><p>${subtitle}</p></div>${extra}</div>`;}
function stat(label,value,sub,i){return `<div class="stat"><div class="stat-top"><span>${label}</span>${icon(i,16)}</div><div class="stat-number">${value}</div><div class="stat-sub">${sub}</div></div>`;}
function progressBar(value){return `<div class="progress-track"><span style="width:${clamp(value,0,100)}%"></span></div>`;}
function empty(title,description,action=''){return `<div class="empty">${icon('book',28)}<h3>${title}</h3><p>${description}</p>${action}</div>`;}
function resumeSession(){return model.sessions.find(s=>s.id===config.activeSession&&!s.completed)||model.sessions.filter(s=>!s.completed&&!s.abandoned).at(-1);}
function sessions(){return heading('Minhas sessões','Retome seus estudos e consulte os resultados de cada tentativa.',`<button class="btn primary small" data-action="start">${icon('plus',15)} Nova sessão</button>`)+sessionsView(model,sessionFilters);}
function currentResultSession(){return resultSessionId?model.sessions.find(s=>s.id===resultSessionId):session;}
async function resumeStudy(id){
  store.load();refreshModel();
  const target=id?model.sessions.find(s=>s.id===id):resumeSession();
  if(!target||target.completed||target.abandoned){toast('Esta sessão não está mais disponível para continuar.');return;}
  if(!sessionSummary(target,model).canResume){toast('Reimporte o banco original para recuperar as questões desta sessão.');return;}
  session=structuredClone(target);resultSessionId=null;config.activeSession=session.id;saveConfig();await navigate('session');
}
function clearSessionDrafts(id){for(const key of draftSelections.keys())if(key.startsWith(`${id}:`))draftSelections.delete(key);}
function weekChart(answers=model.answers){
  const days=Array.from({length:7},(_,i)=>{const d=new Date(Date.now()-(6-i)*86400000);const a=answers.filter(e=>localDay(e.at)===localDay(d));return {day:d.toLocaleDateString('pt-BR',{weekday:'short',timeZone:'America/Sao_Paulo'}).replace('.',''),total:a.length,correct:a.filter(e=>e.correct).length};});
  const max=Math.max(5,...days.map(d=>d.total));
  return `<div class="week-chart" role="img" aria-label="Questões resolvidas nos últimos sete dias: ${days.map(d=>`${d.day} ${d.total}`).join(', ')}">${days.map(d=>`<div class="week-col" title="${d.total} respostas, ${d.correct} acertos"><div class="bar-wrap"><span class="bar" style="height:${d.total/max*100}%"></span></div><small>${d.day}</small></div>`).join('')}</div><div class="chart-caption"><span class="dot" style="color:var(--accent)"></span>${answers.length?'Cada sessão conta para sua evolução.':'Seu primeiro estudo começa a preencher este gráfico.'}</div>`;
}
function home(){return homeView({model,config,resume:resumeSession(),driveConnected:!!drive.token,driveStatus:drive.status,driveMessage:drive.message,guest});}
function study(){return heading('O que vamos estudar?','Escolha seu objetivo. O resto é uma questão de prática.',`<button class="btn small" data-action="nav" data-view="sessions">${icon('clock',15)} Minhas sessões</button>`)+`<div class="mode-grid">${Object.entries(modes).map(([key,[name,description,i]])=>`<button class="mode-card" data-action="start" data-mode="${key}">${icon(i,25)}<h3>${name}</h3><p>${description}</p><span class="badge">${filterQuestions(model,{mode:key}).length} questões disponíveis ${icon('arrow',12)}</span></button>`).join('')}</div><p class="study-tip">As sessões não repetem questões. As recomendadas equilibram conteúdo novo e revisão, com intervalos maiores após acertos consecutivos.</p>`;}
function banks(){
  return heading('Banco de questões','Seu conteúdo, organizado do seu jeito.',`<button class="btn primary" data-action="import">${icon('plus',16)} Importar JSON</button>`)+`
    ${systemCatalogError?`<p class="system-catalog-error" role="status">${esc(systemCatalogError)} Seus dados pessoais foram preservados.</p>`:''}<p class="system-catalog-note">Bancos do sistema disponíveis para todos. ${sourceTag({sourceType:'personal'})} identifica os seus arquivos. <button class="text-link" data-action="refresh-system-banks">Atualizar catálogo</button></p><section class="import-zone" id="drop-zone"><div class="flex">${icon('upload',25)}<h3>Um novo conteúdo começa aqui.</h3></div><p>Selecione ou arraste arquivos JSON. Não é preciso alterar o código.</p><div class="flex"><button class="btn small" data-action="import">Escolher arquivos</button><button class="btn small ghost" data-action="drive-banks">${icon('cloud',15)} Buscar no Drive</button><a class="btn small ghost" href="./docs/modelo-banco.json" download>Baixar modelo ${icon('download',14)}</a></div></section>
    <div class="banks-grid">${model.banks.map((bank,index)=>bankCardView(bank,{index,detailsOpen:expandedBankDetails.has(bank.id)})).join('')}</div>
    ${model.banks.length?'':empty('Seu primeiro banco','Use o modelo JSON para organizar seu conteúdo.')}`;
}
function performanceRows(field,answers=model.answers){const rows=breakdown(answers,field);return rows.length?rows.map(r=>`<div class="perf-row"><div class="between"><span>${esc(r.label)}</span><strong>${r.accuracy}%</strong></div><div class="progress-track"><span class="${r.accuracy<60?'low':''}" style="width:${r.accuracy}%"></span></div><small>${r.correct} acertos · ${r.wrong} erros · ${r.total} tentativas</small></div>`).join(''):'<p class="muted" style="font-size:12px">Os resultados aparecerão após suas primeiras respostas.</p>';}
function originPerformance(){return `<section class="origin-performance" aria-label="Desempenho por origem">${['system','personal'].map(source=>{const {stats}=performanceForBank(model,performanceBank,source);return `<article>${sourceTag({sourceType:source})}<strong>${stats.accuracy}%</strong><p>${stats.attempts} respostas · ${stats.correct} acertos · ${stats.wrong} erros</p></article>`;}).join('')}</section>`;}
function performance(){const scoped=performanceForBank(model,performanceBank,performanceOrigin);const worst=scoped.questions.filter(q=>scoped.progress.get(q.key)?.wrong).sort((a,b)=>scoped.progress.get(b.key).wrong-scoped.progress.get(a.key).wrong).slice(0,5);const recent=scoped.answers.slice(-20);return heading('Entenda sua evolução','Veja o que já domina e onde vale investir mais atenção.',`<button class="btn small" data-action="nav" data-view="sessions">${icon('clock',15)} Minhas sessões</button>`)+`<div class="history-filters">${bankSelect(model,performanceBank,{id:'performance-bank',attribute:'data-performance-bank'})}<label class="history-filter" for="performance-origin"><span>Origem</span><select id="performance-origin" data-performance-origin>${[['all','Todas as origens'],['system','Sistema'],['personal','Pessoal']].map(([value,label])=>`<option value="${value}" ${performanceOrigin===value?'selected':''}>${label}</option>`).join('')}</select></label></div>`+`<div class="stat-grid">${stat('Taxa de acertos',`${scoped.stats.accuracy}%`,performanceBank?'Tentativas no banco selecionado':'Todas as tentativas do histórico','target')}${stat('Questões respondidas',scoped.stats.answered,`${scoped.stats.attempts} tentativas no total`,'book')}${stat('Últimas 20 respostas',`${recent.length?Math.round(recent.filter(a=>a.correct).length/recent.length*100):0}%`,`${recent.length} tentativas consideradas`,'chart')}${stat('Constância',studyStreak(scoped.answers),'Dias consecutivos de estudo','flame')}</div>${originPerformance()}<div class="performance-grid"><section class="card"><h3>Por disciplina</h3>${performanceRows('discipline',scoped.answers)}</section><section class="card"><h3>Por assunto</h3>${performanceRows('subject',scoped.answers)}</section><section class="card"><h3>Por tópico</h3>${performanceRows('topic',scoped.answers)}</section><section class="card"><h3>Sua última semana</h3>${weekChart(scoped.answers)}<div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Data</th><th>Respostas</th><th>Acertos</th></tr></thead><tbody>${[...new Set(scoped.answers.map(a=>localDay(a.at)))].slice(-7).reverse().map(d=>{const a=scoped.answers.filter(e=>localDay(e.at)===d);return `<tr><td>${d.split('-').reverse().join('/')}</td><td>${a.length}</td><td>${Math.round(a.filter(e=>e.correct).length/a.length*100)}%</td></tr>`;}).join('')||'<tr><td colspan="3">Nenhuma resposta registrada ainda.</td></tr>'}</tbody></table></div></section></div><section class="card" style="margin-top:22px"><h3 style="margin-bottom:18px">Questões que merecem atenção</h3>${worst.length?`<div class="revision-list">${worst.map(q=>`<div class="revision-row"><div><p>${esc(q.statement.slice(0,140))}${q.statement.length>140?'…':''}</p><small>${sourceTag(q)} ${esc(q.subject)} · ${scoped.progress.get(q.key).wrong} erros no histórico</small></div><button class="btn small" data-action="single" data-key="${esc(q.key)}">Refazer ${icon('arrow',13)}</button></div>`).join('')}</div>`:'<p class="muted" style="font-size:12px">Quando houver erros, as questões aparecerão aqui para revisão.</p>'}</section>`+progressResetPanel();}
function revision(){const due=filterQuestions(model,{mode:'review'});const next=model.questions.filter(q=>model.progress.has(q.key)&&Date.parse(model.progress.get(q.key).due)>Date.now()).sort((a,b)=>model.progress.get(a.key).due.localeCompare(model.progress.get(b.key).due)).slice(0,5);return heading('Revisar é avançar.','Retome o conteúdo antes de ele ficar distante.',`<button class="btn primary" data-action="start" data-mode="review" ${due.length?'':'disabled'}>${icon('repeat',16)} Começar revisão</button>`)+`<div class="study-shortcuts" style="margin:0 0 26px"><button class="shortcut" data-action="start" data-mode="errors">${icon('repeat',22)}<span><strong>${model.stats.errors} erros para refazer</strong><small>A última resposta ainda pede atenção</small></span></button><button class="shortcut" data-action="start" data-mode="favorites">${icon('heart',22)}<span><strong>${model.stats.favorites} favoritas</strong><small>Suas questões de referência</small></span></button><div class="shortcut">${icon('clock',22)}<span><strong>${due.length} revisões para agora</strong><small>Marcadas ou com prazo vencido</small></span></div></div><h2 style="font-size:18px;margin-bottom:16px">Disponíveis para revisão</h2>${due.length?`<div class="revision-list">${due.map(q=>`<div class="revision-row"><div><p>${esc(q.statement.slice(0,140))}${q.statement.length>140?'…':''}</p><small>${sourceTag(q)} ${esc(q.subject)} · ${model.flags.get(q.key)?.review?'Marcada por você':'Revisão vencida'}</small></div><button class="btn small" data-action="single" data-key="${esc(q.key)}">Revisar ${icon('arrow',13)}</button></div>`).join('')}</div>`:empty('Tudo em dia por aqui.','Marque questões durante o estudo ou retorne quando a próxima revisão vencer.', '<button class="btn" data-action="start">Continuar estudando</button>')}<section class="card" style="margin-top:25px"><h3 style="margin-bottom:15px">Próximas revisões</h3>${next.length?next.map(q=>`<div class="between" style="font-size:12px;margin:12px 0"><span>${esc(q.topic)}</span><span class="badge">${new Date(model.progress.get(q.key).due).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})}</span></div>`).join(''):'<p class="muted" style="font-size:12px">Seu calendário começa após a primeira resposta.</p>'}<p class="setting-note">Após um erro: revisão em 1 dia. Após acertos consecutivos: 1, 3, 7, 14, 30 e 60 dias. Questões marcadas ficam disponíveis até você retirar a marcação.</p></section>`;}
function guestSettings(){return heading('Seu espaço de estudo.','Você está usando uma sessão temporária.')+`<div class="settings-grid"><section class="card"><h3 style="margin-bottom:20px">Aparência</h3><div class="theme-options">${[['light','Claro','sun'],['dark','Escuro','moon'],['system','Sistema','system']].map(([key,label,i])=>`<button class="theme-option ${config.theme===key?'active':''}" data-action="theme" data-theme="${key}" aria-pressed="${config.theme===key}">${icon(i,21)}${label}</button>`).join('')}</div></section><section class="card"><h3>Modo visitante</h3><p class="setting-note">Você pode importar questões, responder e testar os modos de estudo. Respostas, favoritos, bancos e estatísticas existem apenas nesta sessão.</p><p class="setting-note">Ao sair ou recarregar a página, seu progresso será perdido. Entre com Google e conecte sua pasta do Drive para salvar os próximos estudos.</p><button class="btn primary" data-action="guest-login">Voltar ao login ${icon('arrow',15)}</button></section></div>`;}
function settings(){return heading('Um espaço do seu jeito.','Ajuste sua experiência e mantenha o progresso por perto.')+`<div class="settings-grid"><div class="stack"><section class="card"><h3>Aparência</h3><div class="theme-options">${[['light','Claro','sun'],['dark','Escuro','moon'],['system','Sistema','system']].map(([key,label,i])=>`<button class="theme-option ${config.theme===key?'active':''}" data-action="theme" data-theme="${key}" aria-pressed="${config.theme===key}">${icon(i,21)}${label}</button>`).join('')}</div><div class="profile-photo-editor">${profileAvatar('profile-photo-preview')}<div><strong>Sua foto de perfil</strong><div class="settings-actions"><button class="btn small" data-action="change-photo">${icon('upload',15)} Alterar foto</button>${isProfilePhoto(config.photo)?'<button class="btn small ghost" data-action="remove-photo">Remover foto</button>':''}</div><p class="setting-note">JPG, PNG ou WebP até 5 MB. Salva nesta conta, neste navegador.</p></div></div><input type="file" id="profile-photo-file" accept="image/jpeg,image/png,image/webp" class="hidden"><form id="profile-form" style="margin-top:24px"><div class="field"><label for="user-name">Como podemos chamar você?</label><input id="user-name" name="name" value="${esc(config.name)}" maxlength="80" required></div><div class="field"><label for="goal">Meta diária de questões</label><input id="goal" name="goal" type="number" value="${config.dailyGoal}" min="1" max="200" required></div><button class="btn small" type="submit">Salvar preferências</button></form></section><section class="card"><h3>Seu progresso</h3><p class="setting-note">Conta: <strong>${esc(auth.profile.email)}</strong>. Favoritos, respostas, bancos e preferências pertencem somente a este perfil.</p><p class="setting-note">Respostas, favoritos, revisões, bancos e sessões são salvos automaticamente neste navegador. Exporte um arquivo para levar uma cópia com você.</p><div class="settings-actions"><button class="btn small" data-action="export-progress">${icon('download',15)} Exportar progresso</button><button class="btn small" data-action="restore-progress">${icon('upload',15)} Restaurar JSON</button></div><p class="setting-note">A restauração aceita arquivos da mesma conta e une os históricos.</p>${legacyAvailable?'<button class="btn small" data-action="migrate-legacy">Recuperar meus estudos da versão anterior</button>':''}</section><section class="card"><h3>Atalhos para estudar</h3><div class="table-wrap"><table><tbody><tr><td>Selecionar alternativa</td><td><kbd>1</kbd> a <kbd>8</kbd></td></tr><tr><td>Registrar resposta</td><td><kbd>Enter</kbd></td></tr><tr><td>Questão anterior (Desktop)</td><td><kbd>←</kbd></td></tr><tr><td>Próxima questão (Desktop)</td><td><kbd>→</kbd> ou <kbd>Enter</kbd> após registrar</td></tr><tr><td>Riscar ou restaurar seleção (Desktop)</td><td><kbd>T</kbd></td></tr><tr><td>Favoritar</td><td><kbd>F</kbd></td></tr><tr><td>Marcar para revisão</td><td><kbd>R</kbd></td></tr></tbody></table></div></section></div><div class="stack"><section class="card"><div class="between"><h3 style="margin:0">Google Drive</h3>${icon('cloud',21)}</div><div class="connection-card" data-status="${drive.status}" role="status" aria-live="polite">${connectionFeedback()}</div><form id="drive-form"><div class="field"><label for="folder-id">Sua pasta do Google Drive</label><input id="folder-id" name="folderId" value="${esc(config.folderId)}" placeholder="https://drive.google.com/drive/folders/…" required><small>Use uma pasta do seu Meu Drive. Sua conta conectada é ${esc(auth.profile.email)}.</small></div><button class="btn small" type="submit">Salvar e conectar pasta</button></form><div class="settings-actions"><button class="btn primary small" data-action="connect-drive">${icon('cloud',16)}${drive.token?'Renovar acesso ao Drive':'Autorizar minha pasta'}</button><button class="btn small" data-action="sync" ${drive.token?'':'disabled'}>${icon('repeat',14)} Sincronizar</button>${drive.token?'<button class="btn small ghost" data-action="disconnect-drive">Desconectar</button>':''}</div><p id="folder-settings-status" class="setting-note" role="status" data-status="${drive.settings.status}">${esc(drive.settings.message)}</p><p class="setting-note">Entre com a mesma conta Google em outro dispositivo para recuperar esta pasta. O progresso usa um único JSON por conta nesta pasta. Os lotes antigos são consolidados automaticamente e movidos para a lixeira após a conferência. O histórico é carregado após autorizar o Drive. O acesso é renovado automaticamente durante o uso; o Google poderá pedir nova autorização se a permissão precisar ser confirmada.</p><p class="setting-note">Os bancos JSON novos da pasta são importados ao conectar. Bancos existentes não são substituídos automaticamente. <button class="text-link" data-action="refresh-folder-banks">Buscar novos bancos agora</button></p>${drive.lastSync||accountStorage.getItem('foco:lastSync')?`<p class="setting-note">Último envio confirmado: ${new Date(drive.lastSync||accountStorage.getItem('foco:lastSync')).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</p>`:''}</section><section class="card"><h3>Novos conteúdos</h3><p class="setting-note">Peça questões em outros chats usando o mesmo formato. Cada arquivo vira um banco independente, com disciplina, assunto, tópico e comentários.</p><div class="download-links"><a href="./docs/modelo-banco.json" download>${icon('download',15)} Baixar modelo JSON</a><a href="./docs/questions.schema.json" download>${icon('file',15)} Baixar JSON Schema</a><a href="./formato-json.html" target="_blank" rel="noopener">Ler a documentação do formato ${icon('arrow',14)}</a><a href="./privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a><a href="./termos.html" target="_blank" rel="noopener">Termos de Serviço</a></div></section></div></div>`;}
function feedback(q,answer){const correct=answer===q.correctOption;return `<section class="feedback ${correct?'':'wrong'}" role="status"><div class="feedback-title">${icon(correct?'check':'x',19)}${correct?'Resposta correta. Bom trabalho!':answer?'Resposta incorreta. Vamos revisar.':'Questão não respondida.'}</div><p class="answer-line">${correct?`Alternativa correta: ${esc(q.correctOption)}.`:`Sua resposta: ${esc(answer||'não respondida')}. Alternativa correta: ${esc(q.correctOption)}.`}</p>${explanationView(q.explanation,q.options)}${q.reference?`<div class="reference">${icon('file',14)} ${q.reference.url?`<a href="${esc(q.reference.url)}" target="_blank" rel="noopener noreferrer">${esc(q.reference.label)} ${icon('arrow',12)}</a>`:esc(q.reference.label)}</div>`:''}${questionSourceDetails(q)}</section>`;}
function resetCuts(){cutQuestion=null;cutOptions.clear();}
function prepareCuts(q){
  const identity=JSON.stringify([session.id,q.key]);
  if(cutQuestion!==identity){resetCuts();cutQuestion=identity;}
}
function optionView(o,{answer,answered,show,correctOption}){
  const isSelected=(answer||selected)===o.id,correct=show&&o.id===correctOption,incorrect=show&&isSelected&&!correct;
  const cut=cutOptions.has(o.id),label=`${cut?'Restaurar':'Riscar'} alternativa ${o.id}`;
  return `<div class="option ${answered?'answered':''} ${isSelected?'selected':''} ${correct?'correct':''} ${incorrect?'incorrect':''} ${cut?'eliminated':''}" data-option-row="${o.id}" ${answered?'':'data-action="select"'} data-option="${o.id}"><span class="option-letter" id="option-letter-${o.id}">${o.id}</span><button type="button" class="option-cut" data-action="toggle-cut" data-option="${o.id}" aria-label="${label}" title="${label}" aria-pressed="${cut}">${icon('scissors',14)}</button><button type="button" class="option-select" data-action="select" data-option="${o.id}" aria-labelledby="option-letter-${o.id} option-text-${o.id}" aria-pressed="${isSelected}" ${answered?'disabled':''}><span class="option-text" id="option-text-${o.id}">${esc(o.text)}</span>${correct?`<span class="option-result">${icon('check',17)}Correta</span>`:incorrect?`<span class="option-result">${icon('x',17)}Sua resposta</span>`:''}</button></div>`;
}
function toggleCut(option,value){
  if(view!=='session'||!session)return;
  const q=sessionQuestion(model,session,session.queue[session.index]);
  if(!q?.options.some(o=>o.id===option))return;
  prepareCuts(q);
  const cut=typeof value==='boolean'?value:!cutOptions.has(option);
  if(cut)cutOptions.add(option);else cutOptions.delete(option);
  const row=$(`[data-option-row="${option}"]`),control=row?.querySelector('.option-cut');
  row?.classList.toggle('eliminated',cut);
  if(control){const label=`${cut?'Restaurar':'Riscar'} alternativa ${option}`;control.setAttribute('aria-pressed',String(cut));control.setAttribute('aria-label',label);control.title=label;}
}
function questionPanel(q,f,{mobile=false}={}){
  const difficulty=({easy:'Fácil',medium:'Média',hard:'Difícil'})[q.difficulty];
  const tools=`<div class="question-tools"><button class="icon-btn ${f.favorite?'active':''}" data-action="flag" data-flag="favorite" aria-label="Favoritar questão" aria-pressed="${!!f.favorite}" title="Favoritar · F" aria-keyshortcuts="F">${icon('heart',18)}</button><button class="icon-btn ${f.review?'active':''}" data-action="flag" data-flag="review" aria-label="Marcar para revisão" aria-pressed="${!!f.review}" title="Marcar para revisão · R" aria-keyshortcuts="R">${icon('flag',18)}</button></div>`;
  if(mobile)return `<div class="mobile-question-bar" role="group" aria-label="Informações e ações da questão"><span class="question-discipline" title="${esc(q.discipline)}">${esc(q.discipline)}</span><span class="question-difficulty">${difficulty}</span>${questionOriginBadges(q,{showAdapted:false})}${sourceTag(q)}${tools}</div>`;
  return `<div class="between"><div class="flex wrap"><span class="badge green">${esc(q.discipline)}</span><span class="badge">${difficulty}</span>${questionOriginBadges(q)}${sourceTag(q)}</div>${tools}</div><p class="question-bank-name">${esc(q.displayName||q.bankName||'')}</p><div class="question-meta"><span>${esc(q.subject)}</span><span>›</span><span>${esc(q.topic)}</span><span class="muted" style="margin-left:auto">${esc(q.id)}</span></div>`;
}
function questionActions(answered,{desktopFocus,mobile}){
  const hint=key=>desktopFocus?`<kbd class="question-nav-key">${key}</kbd>`:'';
  const enterNext=!mobile&&answered;
  return `<div class="question-actions"><button class="btn ghost" data-action="previous" aria-label="Questão anterior" ${mobile?'':'aria-keyshortcuts="ArrowLeft"'} title="Questão anterior${mobile?'':' · ←'}" ${session.index===0?'disabled':''}>${icon('back',16)}<span class="question-nav-label">Anterior</span>${hint('←')}</button><button class="btn primary" data-action="answer" ${enterNext?'':'aria-keyshortcuts="Enter"'} title="${answered?(guest?'Resposta registrada nesta sessão':'Resposta já registrada'):'Registrar resposta · Enter'}" ${answered||!selected?'disabled':''}>${icon('check',16)}<span>Registrar resposta</span></button><button class="btn ghost" data-action="next" aria-label="Próxima questão" ${mobile?'':`aria-keyshortcuts="ArrowRight${enterNext?' Enter':''}"`} title="Próxima questão${mobile?'':` · →${enterNext?' / Enter':''}`}" ${session.index===session.queue.length-1?'disabled':''}><span class="question-nav-label">Próxima</span>${icon('arrow',16)}${hint('→')}${enterNext?hint('Enter'):''}</button></div>`;
}
function sessionView(){
  if(!session)return empty('Nenhuma sessão em andamento','Escolha um conteúdo para iniciar seu estudo.');
  const key=session.queue[session.index],q=sessionQuestion(model,session,key);
  if(!q)return empty('Conteúdo não disponível','O banco desta questão foi removido. Você pode voltar e iniciar outra sessão.','<button class="btn" data-action="pause">Voltar ao início</button>');
  const answer=session.answers[key],answered=answer!=null,exam=session.mode==='exam',show=answered&&!exam,f=model.flags.get(key)||{},stats=model.answers.filter(a=>a.sessionId===session.id),mobile=!desktopLayout.matches,desktopFocus=desktopLayout.matches&&focusMode.active;
  prepareCuts(q);
  return `<div class="session-container"><div class="session-header"><button class="btn ghost small" data-action="pause">${icon('back',15)} Pausar e voltar</button><span class="muted">${modes[session.mode]?.[0]||'Estudo'} · <strong>Questão ${session.index+1} de ${session.queue.length}</strong></span></div><div class="session-progress">${progressBar(session.index/session.queue.length*100)}</div>${mobile?questionPanel(q,f,{mobile:true}):''}<article class="question-card"><div class="question-body" data-question="${esc(key)}" tabindex="0" role="region" aria-label="Questão e alternativas">${mobile?'':questionPanel(q,f)}<h1 class="question-statement">${esc(formatQuestionStatement(q.statement))}</h1><div class="options" role="group" aria-label="Alternativas">${q.options.map(o=>optionView(o,{answer,answered,show,correctOption:q.correctOption})).join('')}</div>${show?feedback(q,answer):exam?'<p class="setting-note" style="margin-bottom:0">Modo simulado: comentários e gabarito aparecem somente ao concluir.</p>':''}</div>${questionActions(answered,{desktopFocus,mobile})}</article><div class="session-summary-bar">${exam?`<span>${Object.values(session.answers).filter(v=>v).length} respostas registradas</span>`:`<span><strong>${stats.filter(a=>a.correct).length}</strong> acertos</span><span><strong>${stats.filter(a=>!a.correct).length}</strong> erros</span><span><strong>${stats.length?Math.round(stats.filter(a=>a.correct).length/stats.length*100):0}%</strong> na sessão</span>`}${session.index===session.queue.length-1?'<button class="text-link session-finish" data-action="finish">Concluir sessão</button>':''}<span class="keyboard-tip"><kbd>1</kbd>–<kbd>${q.options.length}</kbd> selecionar · <kbd>Enter</kbd> ${!mobile&&answered?'próxima':'registrar'}${mobile?'':' · <kbd>T</kbd> riscar/restaurar · <kbd>←</kbd> anterior · <kbd>→</kbd> próxima'}</span></div></div>`;
}
function resultView(){
  const source=currentResultSession();
  if(!source?.completed)return empty('Resultado indisponível','Conclua a sessão para consultar seu resultado.','<button class="btn" data-action="nav" data-view="sessions">Minhas sessões</button>');
  const report=sessionReport(source,model);
  return `<div class="session-end"><span class="badge green">${icon('check',13)} ${report.exam?'SIMULADO CONCLUÍDO':'SESSÃO CONCLUÍDA'}</span>
    <h1 style="margin-top:18px">${report.exam?'Resultado do simulado':'Resultado da sessão'}</h1>
    <p class="historical-result-info">${esc(report.title)}<br>${esc(sessionDate(source.completedAt||report.updatedAt))} · ${report.total} questões${guest?' · Resultado temporário':''}</p>
    <div class="result-ring"><strong>${report.accuracy===null?'—':`${report.accuracy}%`}</strong><span>aproveitamento da sessão</span></div>
    <div class="result-row"><div><strong style="color:var(--success)">${report.correct}</strong><span>acertos</span></div><div><strong style="color:var(--coral)">${report.wrong}</strong><span>erros</span></div><div><strong>${report.skipped}</strong><span>não respondidas</span></div></div>
    ${report.ungraded?`<p class="session-unavailable">${report.ungraded} respostas sem correção registrada no histórico.</p>`:''}
    <div class="flex wrap" style="justify-content:center"><button class="btn primary" data-action="start">Nova sessão ${icon('arrow',15)}</button>${report.wrong?'<button class="btn" data-action="session-errors">Revisar erros desta sessão</button>':''}<button class="btn" data-action="nav" data-view="sessions">Minhas sessões</button><button class="btn ghost" data-action="nav" data-view="home">Voltar ao início</button></div>
    <div class="results-list"><h2 style="font-size:18px;margin-bottom:15px">Seu estudo, questão por questão</h2>${report.questions.map((item,i)=>{
      const q=item.question,status=!item.selected?'Não respondida':item.correct===null?'Sem correção registrada':item.correct?'Acerto':'Erro';
      return `<details class="result-item"><summary>${icon(item.correct===null?'clock':item.correct?'check':'x',17)}<span>${i+1}. ${esc(q?.topic||'Conteúdo indisponível')}</span><span class="badge" style="margin-left:auto">${status}</span></summary>${q?`<div class="result-body"><p class="result-bank-source">${sourceTag(item)} ${esc(item.displayName)}</p><p>${esc(formatQuestionStatement(q.statement))}</p><p class="setting-note">Correta (${esc(q.correctOption)}): ${esc(q.options.find(o=>o.id===q.correctOption)?.text||'Gabarito registrado')}</p>${feedback(q,item.selected)}</div>`:`<div class="result-unavailable"><p>O conteúdo original desta questão não está disponível nos bancos salvos. Reimporte o banco original para consultá-lo.</p><p>Sua resposta: ${esc(item.selected||'não respondida')}${item.correctOption?` · Gabarito registrado: ${esc(item.correctOption)}`:''}.</p></div>`}</details>`;
    }).join('')}</div></div>`;
}
function render(){if(resetSaving){renderResetSaving();return;}if(restoration){renderLoading();return;}if((!auth?.profile&&!guest)||!store||!drive){renderLogin();return;}const previousBody=$('.question-body'),previousKey=previousBody?.dataset.question,previousScroll=previousBody?.scrollTop||0;refreshModel();const content=({home,study,sessions,banks,performance,revision,settings:()=>guest?guestSettings():settings(),folder:()=>folderView(auth.profile,config,!!drive.token),session:sessionView,result:resultView})[view]();$('#app').innerHTML=shell(content);document.title=`${({home:'Início',study:'Estudar',sessions:'Minhas sessões',banks:'Banco de questões',performance:'Desempenho',revision:'Revisão',settings:'Ajustes',folder:'Conectar pasta',session:'Estudando',result:'Resultado'})[view]} · Foco`;const body=$('.question-body');if(body&&body.dataset.question===previousKey)body.scrollTop=previousScroll;bindFiles();bindForms();if(view==='settings'&&!guest)drive.prepare().catch(()=>{});}
function navigate(next){
  if(restoration||resetSaving)return;
  view=next;selected=next==='session'?draftSelections.get(draftKey())||null:null;
  let focusChange;
  if(next!=='session')focusChange=focusMode.exit();
  else if(!desktopLayout.matches&&session&&!session.completed)focusChange=focusMode.enter({automatic:true});
  render();window.scrollTo(0,0);$('#main').focus({preventScroll:true});
  return focusChange;
}
async function leaveQuestionFocus(){
  if(!desktopLayout.matches&&view==='session'){if(working)return;await navigate('home');}
  else await focusMode.exit();
}
function showDialog(html){const dialog=$('#dialog');dialog.innerHTML=html;dialog.showModal();return dialog;}
function closeDialog(){const d=$('#dialog');if(d.open)d.close();}
function confirmDialog(title,description,label='Confirmar',{danger=false}={}){return new Promise(resolve=>{const d=showDialog(`<div class="dialog-title"><h2 id="dialog-title">${esc(title)}</h2><p>${esc(description)}</p></div><div class="dialog-actions"><button class="btn" id="confirm-cancel">Cancelar</button><button class="btn ${danger?'danger':'primary'}" id="confirm-ok">${esc(label)}</button></div>`);let settled=false;const done=value=>{if(settled)return;settled=true;d.removeEventListener('cancel',cancel);closeDialog();resolve(value);};const cancel=e=>{e.preventDefault();done(false);};$('#confirm-cancel',d).onclick=()=>done(false);$('#confirm-ok',d).onclick=()=>done(true);d.addEventListener('cancel',cancel);if(danger)$('#confirm-cancel',d).focus();});}
function progressResetPanel(){
  return `<section class="card progress-reset" aria-labelledby="progress-reset-title"><div><h3 id="progress-reset-title">Recomeçar seus estudos</h3><p>Zere o progresso de todos os bancos: respostas, estatísticas, favoritos, revisões e sessões. Sua conta, nome, preferências e bancos de questões serão mantidos.</p></div><button type="button" class="btn danger" data-action="reset-progress">${icon('repeat',16)} Zerar progresso</button></section>`;
}
async function resetPersonalProgress(){
  if(working)return;
  if(drive.busy||drive.connecting){toast('Aguarde a sincronização terminar antes de zerar o progresso.');return;}
  working=true;const currentStore=store,currentDrive=drive;
  const updateProgress=()=>{
    if(!resetSaving||store!==currentStore||drive!==currentDrive)return;
    resetSaving=resetSaveProgress(resetSaving,currentDrive.restoreProgress);renderResetSaving();
  };
  try{
    const confirmed=await confirmDialog('Zerar todo o seu progresso?',`Suas respostas, estatísticas, favoritos, revisões e sessões ${guest?'temporárias':'desta conta'} serão zerados em todos os bancos. Seu nome, sua conta, suas preferências e as questões serão mantidos. Não há opção de desfazer. Com o Drive conectado, o reinício será sincronizado com os outros dispositivos.`,'Zerar meu progresso',{danger:true});
    if(!confirmed||store!==currentStore||drive!==currentDrive)return;
    if(drive.busy||drive.connecting){toast('Aguarde a sincronização terminar e tente novamente. Nenhum progresso foi zerado.');return;}
    resetSaving=resetSaveProgress(null);renderResetSaving();$('#main')?.focus({preventScroll:true});
    currentDrive.addEventListener('progress',updateProgress);clearTimeout(currentDrive.timer);
    await currentStore.resetProgress();
    session=null;selected=null;draftSelections.clear();resetCuts();config.activeSession=null;render();
    if(!drive.token){toast(guest?'Progresso temporário zerado. Você pode começar de novo.':'Progresso zerado neste dispositivo. Conecte o Drive para sincronizar o reinício.');return;}
    clearTimeout(currentDrive.timer);
    try{
      if(!drive.busy&&!drive.connecting)await drive.sync();
      if(drive.status==='synced'){resetSaving=resetSaveProgress(resetSaving,{stage:'ready'});renderResetSaving();}
      toast(drive.status==='synced'?'Progresso zerado e sincronizado. Sua conta e suas questões foram mantidas.':'Progresso zerado neste dispositivo. A sincronização com o Drive está pendente.');
    }
    catch(error){console.error(error);toast('Progresso zerado neste dispositivo. O envio ao Drive está pendente; reconecte e sincronize.');}
  }finally{
    currentDrive.removeEventListener('progress',updateProgress);working=false;
    if(resetSaving){
      resetSaving=null;
      if(store===currentStore&&drive===currentDrive){
        if(currentDrive.status==='pending'&&currentDrive.token&&!currentDrive.busy&&!currentDrive.connecting)currentDrive.schedule();
        render();$('#main')?.focus({preventScroll:true});
      }
    }
  }
}
function renderResetSaving(){
  $('#app').innerHTML=loadingView({...resetSaving,saving:true,theme:document.documentElement.dataset.theme,guest});
  document.title='Salvando reinício · Foco';
}
function startDialog(mode='smart',bankId=''){
  if(!model.banks.some(b=>b.enabled)){toast('Importe ou ative um banco para começar.');navigate('banks');return;}
  const d=showDialog(sessionSetupView({banks:model.banks.filter(b=>b.enabled),modes,mode,bankId}));
  const f=$('#session-form',d);const read=()=>({mode:f.mode.value,count:clamp(f.count.value,1,5000),banks:[...f.querySelectorAll('[name=banks]:checked')].map(i=>i.value),discipline:f.discipline.value,subject:f.subject.value,topic:f.topic.value});
  const status=()=>sessionSetupStatus(model,{...read(),count:Number(f.count.value)});
  function available(){
    const s=status();
    $('#session-size',d).textContent=!s.validCount?'Defina a quantidade':s.available?`${s.count} ${s.count===1?'questão':'questões'} na sessão`:'Nenhuma questão disponível';
    $('#eligible',d).textContent=!s.validCount?'Informe um número inteiro de 1 a 5.000.':s.available?`${s.available} ${s.available===1?'disponível':'disponíveis'} · ${s.banks} ${s.banks===1?'banco selecionado':'bancos selecionados'}`:read().banks.length?'Ajuste os filtros ou o modo de estudo.':'Selecione ao menos um banco para começar.';
    $('#session-start',d).disabled=!s.canStart;
    $('#session-start-label',d).textContent=f.mode.value==='exam'?'Iniciar simulado':'Começar estudo';
    $('#mode-description',d).textContent=modes[f.mode.value]?.[1]||'';
    $('#session-error',d).textContent='';
  }
  function fill(select,items,label){
    const previous=select.value;select.innerHTML=`<option value="">${label}</option>`+items.map(item=>`<option>${esc(item)}</option>`).join('');
    select.value=items.includes(previous)?previous:'';
  }
  function cascade(source){
    const base=model.questions.filter(q=>q.enabled&&read().banks.includes(q.bankId));
    if(source==='banks')fill(f.discipline,[...new Set(base.map(q=>q.discipline))].sort(),'Todas');
    if(source==='banks'||source==='discipline')fill(f.subject,[...new Set(base.filter(q=>!f.discipline.value||q.discipline===f.discipline.value).map(q=>q.subject))].sort(),'Todos');
    fill(f.topic,[...new Set(base.filter(q=>(!f.discipline.value||q.discipline===f.discipline.value)&&(!f.subject.value||q.subject===f.subject.value)).map(q=>q.topic))].sort(),'Todos');
    available();
  }
  f.addEventListener('change',event=>{
    if(['banks','discipline','subject'].includes(event.target.name))cascade(event.target.name);else available();
    if(event.target.name==='mode'&&f.mode.value==='subject')$('#session-filters',d).open=true;
  });
  f.count.addEventListener('input',available);cascade('banks');
  f.onsubmit=async event=>{
    event.preventDefault();if(working)return;
    if(!status().validCount){f.count.reportValidity();return;}
    const options=read(),queue=makeQueue(model,options);
    if(!queue.length){$('#session-error',d).textContent='Nenhuma questão encontrada. Ajuste os bancos, filtros ou modo de estudo.';return;}
    working=true;try{await newSession(queue,options.mode);closeDialog();navigate('session');}catch(e){failure(e);}finally{working=false;}
  };
}
async function newSession(queue,mode='smart'){
  const questions=new Map(model.questions.map(q=>[q.key,q]));
  const selectedBanks=new Set(queue.map(key=>questions.get(key)?.bankId));
  const snapshots=model.banks.filter(bank=>bank.sourceType==='system'&&selectedBanks.has(bank.id)&&!store.events.some(e=>e.type==='system-bank-snapshot'&&e.bank.id===bank.id&&e.revision===(bank.revision||'1')));
  if(snapshots.length)await store.add(snapshots.map(bank=>({
    id:`system-snapshot-${bank.id}-${bank.revision||'1'}`,at:bank.publishedAt||'2026-10-16T00:00:00.000Z',type:'system-bank-snapshot',revision:bank.revision||'1',
    bank:{schemaVersion:1,id:bank.id,name:bank.name,displayName:bank.displayName,subtitle:bank.subtitle,description:bank.description,questions:bank.questions}
  })));
  const next=createSession(queue,mode,undefined,undefined,store.model().progressEpoch);
  next.questionSources=Object.fromEntries(queue.map(key=>[key,questionSource(questions.get(key))]));
  await store.add([{type:'session',session:next}]);session=next;resultSessionId=null;resetCuts();config.activeSession=session.id;saveConfig();selected=null;
}
async function answer(){if(!selected||!session)return;const key=session.queue[session.index];if(session.answers[key])return;const q=sessionQuestion(model,session,key);const result=chooseAnswer(session,q,selected);await store.add(result.events);session=result.session;draftSelections.delete(draftKey());render();$('.feedback')?.scrollIntoView({behavior:'smooth',block:'nearest'});}
async function move(direction){
  if(view!=='session'||!session||session.completed)return;
  const result=moveSession(session,direction);if(!result.events.length)return;
  await store.add(result.events);session=result.session;selected=draftSelections.get(draftKey())||null;resetCuts();
  render();window.scrollTo(0,0);if(desktopLayout.matches)$('.question-body')?.focus({preventScroll:true});
}
async function finish(){
  if(view!=='session'||!session||session.completed)return;
  const unanswered=session.queue.filter(key=>!session.answers[key]).length;
  if(unanswered&&!(await confirmDialog('Concluir sessão?',`${unanswered} ${unanswered===1?'questão ainda não tem resposta registrada':'questões ainda não têm resposta registrada'}. Você pode cancelar e continuar revisando antes de concluir.`,'Concluir sessão')))return;
  const result=completeSession(session,session.queue.map(key=>sessionQuestion(model,session,key)).filter(Boolean));await store.add(result.events);session=result.session;resultSessionId=session.id;selected=null;clearSessionDrafts(session.id);resetCuts();config.activeSession=null;saveConfig();
  await navigate('result');if(drive.token)drive.sync().catch(()=>{});
}
async function toggleFlag(flag){if(!session)return;const key=session.queue[session.index];await store.add([{type:'flag',key,sourceType:model.questions.find(q=>q.key===key)?.sourceType||'personal',flag,value:!model.flags.get(key)?.[flag],progressEpoch:session.progressEpoch??null}]);render();toast(flag==='favorite'?(model.flags.get(key)?.favorite?'Questão favoritada.':'Favorito removido.'):(model.flags.get(key)?.review?'Questão marcada para revisão.':'Marcação removida.'));}
function download(name,document){const url=URL.createObjectURL(new Blob([JSON.stringify(document,null,2)],{type:'application/json'}));const link=documentElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function documentElement(tag){return document.createElement(tag);}
async function readJSON(file){const content=await file.text();try{return JSON.parse(content.replace(/^\uFEFF/,''));}catch{throw new Error(`${file.name}: JSON inválido. Confira vírgulas, aspas e colchetes.`);}}
async function importBank(raw){const bank=preparePersonalBank(validateBank(raw)),old=model.banks.find(b=>b.id===bank.id&&sourceType(b)==='personal');if(old&&!(await confirmDialog('Atualizar banco?',`Já existe “${old.displayName||old.name}” com este ID. O conteúdo será atualizado, preservando seu histórico de respostas. Mantenha IDs existentes apenas para as mesmas questões.`,'Atualizar')))return false;await store.add([{type:'bank',bank},{type:'bank-state',bankId:bank.id,value:'enabled'}]);refreshModel();return true;}
async function renamePersonalBank(id){
  const bank=model.banks.find(b=>b.id===id&&sourceType(b)==='personal');if(!bank){toast('Apenas bancos pessoais podem ser renomeados.');return;}
  const ownStore=store,d=showDialog(`<form id="rename-bank-form"><div class="dialog-title"><h2 id="dialog-title">Renomear banco pessoal</h2><p>Escolha o nome que prefere usar nos seus estudos.</p></div><div class="field"><label for="bank-display-name">Nome do banco</label><input id="bank-display-name" name="displayName" value="${esc(bank.displayName||bank.name)}" required autofocus></div><p class="setting-note">Questões, respostas e sessões continuam associadas a este banco.</p><div class="dialog-actions"><button class="btn" type="button" data-action="close-dialog">Cancelar</button><button class="btn primary" type="submit">Salvar nome</button></div></form>`);
  const form=$('#rename-bank-form',d);form.onsubmit=async event=>{event.preventDefault();const displayName=form.elements.namedItem('displayName').value.trim();if(!displayName||store!==ownStore)return;const button=form.querySelector('[type=submit]');button.disabled=true;try{await store.add([{type:'bank-metadata',bankId:id,displayName}]);closeDialog();render();toast('Nome atualizado.');}catch(error){failure(error);}finally{button.disabled=false;}};
}
function bindFiles(){
  $('#bank-file').onchange=async event=>{const files=[...event.target.files];for(const file of files){try{if(await importBank(await readJSON(file)))toast(`Banco importado: ${file.name}`);}catch(e){failure(e);}}navigate('banks');};
  $('#progress-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{const doc=await readJSON(file);assertProgressOwner(doc,auth.profile.sub);const events=validateEvents(doc);await store.merge(events);render();toast('Históricos unidos. Seu progresso foi recuperado.');}catch(e){failure(e);}};
  const zone=$('#drop-zone');if(zone){zone.ondragover=e=>{e.preventDefault();zone.classList.add('drag');};zone.ondragleave=()=>zone.classList.remove('drag');zone.ondrop=async e=>{e.preventDefault();zone.classList.remove('drag');for(const f of e.dataTransfer.files){try{if(await importBank(await readJSON(f)))toast(`Banco importado: ${f.name}`);}catch(error){failure(error);}}render();};}
}
function bindForms(){
  const photoInput=$('#profile-photo-file');if(photoInput)photoInput.onchange=async event=>{
    const file=event.target.files[0],owner=accountStorage;event.target.value='';if(!file||working||guest)return;working=true;
    try{const photo=await prepareProfilePhoto(file);if(owner!==accountStorage||!auth.profile)return;saveProfilePhoto(config,owner,photo);render();toast('Foto de perfil atualizada.');}catch(error){failure(error);}finally{working=false;}
  };
  const profile=$('#profile-form');if(profile)profile.onsubmit=e=>{e.preventDefault();config.name=profile.elements.namedItem('name').value.trim()||'Estudante';config.dailyGoal=clamp(profile.elements.namedItem('goal').value,1,200);saveConfig();render();toast('Preferências salvas.');};
  for(const id of ['drive-form','folder-form']){const form=$(`#${id}`);if(!form)continue;form.onsubmit=async e=>{e.preventDefault();if(working)return;working=true;const button=form.querySelector('[type=submit]');button.disabled=true;try{const folder=parseFolder(form.elements.namedItem('folderId').value);await drive.connect(folder);config.onboardingDone=true;saveConfig();navigate(id==='folder-form'?'home':'settings');toast('Pasta salva na sua conta Google e progresso sincronizado.');}catch(error){if(id==='folder-form')$('#folder-error').textContent=error.message;else failure(error);}finally{working=false;button.disabled=false;}};}
}
async function driveBanks(){if(!drive.token){navigate('settings');toast('Conecte o Google Drive para buscar bancos na pasta.');return;}toast('Buscando arquivos JSON na pasta…');const files=await drive.bankFiles();if(!files.length){toast('Nenhum banco JSON encontrado na pasta.');return;}const d=showDialog(`<div class="dialog-title"><h2 id="dialog-title">Bancos no Google Drive</h2><p>Escolha um arquivo para importar.</p></div><div class="stack">${files.map(f=>`<button class="btn drive-file" data-id="${esc(f.id)}">${icon('file',17)} ${esc(f.name)}</button>`).join('')}</div><div class="dialog-actions"><button class="btn" data-action="close-dialog">Fechar</button></div>`);for(const b of d.querySelectorAll('.drive-file'))b.onclick=async()=>{b.disabled=true;try{const f=files.find(f=>f.id===b.dataset.id);const raw=await drive.readFile(f);closeDialog();if(await importBank(raw)){navigate('banks');toast('Banco do Drive importado.');}}catch(e){failure(e);b.disabled=false;}};}
document.addEventListener('click',async event=>{
  if(resetSaving)return;
  const target=event.target.closest('[data-action]');if(!target||target.disabled)return;const action=target.dataset.action;
  if(action==='toggle-theme'||action==='theme'){try{config.theme=action==='theme'?target.dataset.theme:document.documentElement.dataset.theme==='dark'?'light':'dark';saveConfig();applyTheme();render();const selector=action==='theme'?`.theme-option[data-theme="${config.theme}"]`:focusMode.active?'.focus-toolbar [data-action=toggle-theme]':restoration||(!auth?.profile&&!guest)?'.entry-toolbar [data-action=toggle-theme]':'.topbar [data-action=toggle-theme]';$(selector)?.focus({preventScroll:true});}catch(error){failure(error);}return;}
  if(restoration){await handleRestorationAction(action);return;}
  if(!auth?.profile&&!guest&&!['login','guest','retry-google'].includes(action))return;
  if(action==='exit-focus'){await leaveQuestionFocus();return;}
  if(working)return;
  if(guest&&['connect-drive','disconnect-drive','sync','drive-banks','refresh-folder-banks','restore-progress','export-progress','migrate-legacy'].includes(action)){toast('Entre com Google para salvar ou recuperar seu progresso.');return;}
  try{
    if(action==='guest'){working=true;await openGuest();return;}
    if(action==='guest-login'){await logout();return;}
    if(action==='retry-google'){await loadGoogleForLogin();return;}
    if(action==='login'){if(!auth.redirectEnabled&&!isGoogleReady()){void loadGoogleForLogin();return;}working=true;loginError='';loginErrorCode='';const authorization=auth.authorize();renderLogin();try{const result=await authorization;await openAccount(result);}catch(error){loginError=error.message;loginErrorCode=error.code||'';drive?.close();await auth.signOut();guest=false;restoration=null;accountStorage=null;store=null;drive=null;renderLogin();}return;}
    if(action==='logout'){await logout();return;}
    if(action==='toggle-sidebar'){config.sidebarCollapsed=!config.sidebarCollapsed;saveConfig();render();$('[data-action=toggle-sidebar]')?.focus({preventScroll:true});return;}
    if(action==='toggle-focus'){if(view==='session'&&session&&!session.completed)await focusMode.enter();return;}
    if(action==='fullscreen-help'){fullscreenHelp();return;}
    if(action==='skip-folder'){config.onboardingDone=true;saveConfig();navigate('home');return;}
    if(action==='migrate-legacy'){await migrateLegacy();return;}
    if(action==='refresh-folder-banks'){if(!drive.token)throw new Error('Autorize sua pasta primeiro.');const result=await drive.importNewBanks();render();toast(`${result.imported} novos bancos importados.`);return;}
    if(action==='nav'){navigate(target.dataset.view);return;}
    if(action==='start'){startDialog(target.dataset.mode||'smart',target.dataset.bank||'');return;}
    if(action==='close-dialog'){closeDialog();return;}
    if(action==='change-photo'&&!guest){$('#profile-photo-file')?.click();return;}
    if(action==='remove-photo'&&!guest){saveProfilePhoto(config,accountStorage,'');render();toast('Foto removida.');return;}
    if(action==='import'){$('#bank-file').click();return;}
    if(action==='restore-progress'){$('#progress-file').click();return;}
    if(action==='export-progress'){download(`foco-progresso-exportado-${localDay(Date.now())}.json`,store.export());return;}
    if(action==='reset-progress'){await resetPersonalProgress();return;}
    if(action==='bank-export'){const b=model.banks.find(b=>b.id===target.dataset.bank);const {enabled,...raw}=b;download(`${b.id}.json`,raw);return;}
    if(action==='bank-details'){
      const panel=document.getElementById(target.getAttribute('aria-controls'));
      if(!panel)return;
      const open=target.getAttribute('aria-expanded')!=='true';
      if(open)expandedBankDetails.add(target.dataset.bank);else expandedBankDetails.delete(target.dataset.bank);
      panel.hidden=!open;target.setAttribute('aria-expanded',String(open));
      const label=open?'Ocultar detalhes':'Ver mais detalhes',bank=model.banks.find(b=>b.id===target.dataset.bank);
      target.querySelector('.bank-details-label').textContent=label;
      target.setAttribute('aria-label',`${label} de ${bank?.name||'banco de questões'}`);return;
    }
    if(action==='refresh-system-banks'){working=true;await loadSystemCatalog({force:true});render();if(systemCatalogError)toast(systemCatalogError);else toast('Catálogo atualizado.');return;}
    if(action==='bank-rename'){await renamePersonalBank(target.dataset.bank);return;}
    if(action==='bank-toggle'){const b=model.banks.find(b=>b.id===target.dataset.bank);await store.add([{type:sourceType(b)==='system'?'system-bank-state':'bank-state',bankId:b.id,value:b.enabled?'disabled':'enabled'}]);render();return;}
    if(action==='bank-delete'){const b=model.banks.find(b=>b.id===target.dataset.bank);if(!b||sourceType(b)!=='personal'){toast('Apenas bancos pessoais podem ser excluídos.');return;}if(await confirmDialog('Excluir este banco?',`“${b.displayName||b.name}” sairá da lista de estudos. Seu histórico será preservado. Você poderá importar o banco novamente.`, 'Excluir banco')){await store.add([{type:'bank-state',bankId:b.id,value:'deleted'}]);render();toast('Banco removido da lista.');}return;}
    if(action==='resume'||action==='session-resume'){await resumeStudy(target.dataset.session);return;}
    if(action==='session-result'){
      const item=model.sessions.find(s=>s.id===target.dataset.session);
      if(!item?.completed){toast('Conclua a sessão para consultar o resultado.');return;}
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
      const queue=sessionReport(source,model).questions.filter(q=>q.correct===false&&model.questions.some(current=>current.key===q.key)).map(q=>q.key);
      if(!queue.length){toast('Reimporte o banco para revisar as questões desta sessão.');return;}
      await newSession(queue,'errors');navigate('session');return;
    }
    if(action==='flag'){working=true;await toggleFlag(target.dataset.flag);return;}
    if(action==='answer'){working=true;await answer();return;}
    if(action==='previous'||action==='next'){working=true;await move(action==='previous'?-1:1);return;}
    if(action==='finish'){working=true;await finish();return;}
    if(action==='connect-drive'){working=true;toast('Abrindo a autorização do Google…');await drive.connect();config.onboardingDone=true;saveConfig();if(view==='folder')view='home';render();toast('Pasta salva na sua conta Google e progresso sincronizado.');return;}
    if(action==='disconnect-drive'){drive.disconnect();render();return;}
    if(action==='sync'){await drive.sync();render();toast('Históricos sincronizados com o Drive.');return;}
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
  if(enterButton&&!['select','answer',...(desktopLayout.matches?['next']:[])].includes(enterAction))return;
  if(view!=='session'||!session||session.completed||$('#dialog').open||working||event.defaultPrevented||event.isComposing||document.querySelector('dialog[open],[aria-modal="true"]:not([hidden])')||event.target.isContentEditable||event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"]'))return;
  const q=sessionQuestion(model,session,session.queue[session.index]);if(!q)return;
  try{
    if(event.altKey||event.ctrlKey||event.metaKey)return;
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
        if(session?.answers[q.key]&&session.index<session.queue.length-1)$('[data-action=next]')?.focus({preventScroll:true});
        return;
      }
    }
    if(['f','r'].includes(event.key.toLowerCase())){event.preventDefault();if(event.repeat)return;working=true;await toggleFlag(event.key.toLowerCase()==='f'?'favorite':'review');return;}
    if(event.repeat)return;
    const option=/^[1-8]$/.test(event.key)?q.options[Number(event.key)-1]?.id:q.options.find(o=>o.id===event.key.toUpperCase())?.id;
    if(option&&!session.answers[q.key]){event.preventDefault();selected=option;draftSelections.set(draftKey(),selected);render();}
    if(event.key==='Enter'&&!session.answers[q.key]&&selected){event.preventDefault();working=true;await answer();}
  }catch(e){failure(e);}finally{working=false;}
});
window.addEventListener('storage',event=>{if(!restoration&&auth?.profile&&accountStorage?.ownsKey(event.key)&&event.key.includes(':foco:v1:event:')){try{store.load();refreshModel();if(view!=='session'&&!$('#dialog').open)render();}catch(e){failure(e);}}});
window.addEventListener('online',()=>{if(!restoration&&!resetSaving&&drive?.token&&!drive.connecting)drive.sync().catch(()=>{});});
window.addEventListener('focus',()=>{if(!restoration&&!resetSaving&&drive?.token&&!drive.busy&&!drive.connecting)drive.sync().catch(()=>{});});
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
  $('#app').innerHTML=loginView({ready:validClientId(auth?.clientId),oauthReady:!googleLoading&&(auth?.redirectEnabled||isGoogleReady()&&!googleLoadError),redirect:auth?.redirectEnabled,loading:googleLoading,retryGoogle:!!googleLoadError,busy:working,error:loginError||googleLoadError,errorCode:loginError?loginErrorCode:'',siteOrigin:window.location?.origin,theme:document.documentElement.dataset.theme});document.title='Entrar · Foco';
  const form=$('#oauth-preview-form');if(form)form.onsubmit=e=>{e.preventDefault();const id=form.elements.namedItem('clientId').value.trim();if(!validClientId(id)){loginErrorCode='';loginError='Informe apenas o ID público de um cliente OAuth Google Web.';renderLogin();return;}localStorage.setItem('foco:oauth-preview',id);auth.clientId=id;loginError='';renderLogin();void loadGoogleForLogin();};
}
async function openAccount(result){
  guest=false;resetHistoryUI();restoreAuthorization=result;restoration=restoreProgress(null,{stage:'profile'});renderLoading();
  const profile=result.profile;accountStorage=new AccountStorage(localStorage,profile.sub);
  config={...defaults,...JSON.parse(accountStorage.getItem('foco:config')||'{}')};config.name=config.name==='Estudante'?profile.name:config.name;applyTheme();store=new Store(accountStorage);
  await loadSystemCatalog();
  legacyAvailable=false;
  if(publicConfig.legacyOwnerEmailSha256){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(profile.email.toLowerCase()));const hash=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');legacyAvailable=hash===publicConfig.legacyOwnerEmailSha256&&Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).some(k=>k?.startsWith('foco:v1:event:'));}
  refreshModel();const folderSettings=new DriveSettings(accountStorage,auth);drive=new DriveSync(store,config,auth,folderSettings);const ownDrive=drive;
  drive.addEventListener('config',()=>{if(drive===ownDrive)saveConfig();});
  folderSettings.addEventListener('status',()=>{if(drive!==ownDrive)return;const text=$('#folder-settings-status');if(text){text.textContent=folderSettings.message;text.setAttribute('data-status',folderSettings.status);}});
  store.addEventListener('change',()=>{if(drive===ownDrive){if(refreshModel()&&!restoration){render();toast('Seu progresso foi reiniciado. Inicie uma nova sessão.');}ownDrive.schedule();}});
  drive.addEventListener('status',()=>{if(drive===ownDrive&&auth.profile)updateDriveFeedback();});
  ownDrive.addEventListener('progress',()=>{if(drive===ownDrive&&restoration?.state==='loading'){restoration=restoreProgress(restoration,ownDrive.restoreProgress);renderLoading();}});
  await restoreAccount(result);
}
async function restoreAccount(result=restoreAuthorization){
  restoration=restoreProgress(null,{stage:'folder'});renderLoading();
  const folderSettings=drive.settings;
  try{
    if(!auth.canAppData){restoration={state:'permission',percent:20,detail:'Autorize o Google para localizar sua pasta e restaurar seus estudos em segurança.'};renderLoading();return;}
    if(result?.pendingFolderId){
      if(!auth.canDrive){restoration={state:'permission',percent:25,detail:'Autorize o Drive para conectar a pasta escolhida.'};renderLoading();return;}
      await drive.useAuthorization(result,{folderId:parseFolder(result.pendingFolderId)});delete result.pendingFolderId;config.onboardingDone=true;
      restoration=restoreProgress(restoration,{stage:'ready'});renderLoading();finishRestoration();return;
    }
    const saved=await folderSettings.restore();if(saved){config.folderId=saved.folderId;config.onboardingDone=true;}
    if(config.folderId){
      if(!auth.canDrive){restoration={state:'permission',percent:25,detail:'Sua pasta foi encontrada. Autorize o acesso ao Drive para recuperar as questões e o progresso antes de continuar.'};renderLoading();return;}
      await drive.useAuthorization(result);
    }
    restoration=restoreProgress(restoration,{stage:'ready'});renderLoading();
    finishRestoration();
  }catch(error){restoration={state:'error',percent:restoration?.percent||20,detail:error.message};renderLoading();}
}
function renderLoading(){
  $('#app').innerHTML=loadingView({...restoration,theme:document.documentElement.dataset.theme,guest});
  document.title=guest?'Preparando questões · Foco':'Restaurando estudos · Foco';
}
function finishRestoration(){
  restoration=null;session=null;selected=null;draftSelections.clear();resetCuts();view=config.onboardingDone||config.folderId?'home':'folder';saveConfig();render();window.scrollTo(0,0);$('#main')?.focus({preventScroll:true});
}
async function handleRestorationAction(action){
  if(restoration.state==='loading'||working)return;
  try{
    if(action==='restore-local'){config.onboardingDone=true;drive.disconnect();finishRestoration();toast('Usando apenas os dados deste navegador. O Drive não foi restaurado.');return;}
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
  }catch(error){guest=false;restoration=null;store=null;drive=null;accountStorage=null;loginError=error.message;loginErrorCode=error.code||'';renderLogin();}
}

async function logout(){
  if(drive?.busy||drive?.connecting){toast('Aguarde a sincronização terminar para sair.');return;}
  if(drive?.token&&drive.status==='pending'){working=true;try{await drive.sync();}catch{toast('O envio não foi concluído. O progresso local desta conta foi preservado.');}}
  await focusMode.exit();drive?.close();await auth.signOut();guest=false;restoration=null;restoreAuthorization=null;closeDialog();store=null;model=null;drive=null;accountStorage=null;session=null;selected=null;draftSelections.clear();resetCuts();resetHistoryUI();expandedBankDetails.clear();view='home';legacyAvailable=false;working=false;loginError='';loginErrorCode='';config={...defaults,theme:localStorage.getItem('foco:appearance')||'light'};applyTheme();renderLogin();window.scrollTo(0,0);
}
async function migrateLegacy(){
  if(!legacyAvailable)return;
  if(!await confirmDialog('Recuperar estudos anteriores?','As respostas e os bancos da versão pessoal serão unidos a esta conta Google. A cópia original continuará preservada.','Recuperar'))return;
  const legacy=new Store(localStorage);await store.merge(legacy.events);const old=JSON.parse(localStorage.getItem('foco:config')||'{}');if(!config.folderId&&old.folderId)config.folderId=old.folderId;saveConfig();render();toast('Histórico anterior recuperado nesta conta.');
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
      catch(error){loginError=error.message;drive?.close();await auth.signOut();restoration=null;accountStorage=null;store=null;drive=null;}
      finally{working=false;}
    }else if(notice)loginError=googleReturnMessage(notice);
    if(!auth.profile&&!restoration){renderLogin();if(!auth.redirectEnabled)void loadGoogleForLogin();}
  }catch(error){googleLoading=false;working=false;loginError=error.message;auth=new GoogleAccount('');renderLogin();}
}
init();
