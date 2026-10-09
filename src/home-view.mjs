import {icon} from './icons.mjs';
import {localDay,studyStreak,filterQuestions} from './engine.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const questionCount=n=>`${n} ${n===1?'questão':'questões'}`;

function bankRow(bank,model){
  const answered=bank.questions.filter(q=>model.progress.has(`${bank.id}:${q.id}`)).length;
  const disciplines=[...new Set(bank.questions.map(q=>q.discipline))].join(' · ');
  return `<button class="home-bank" data-action="${bank.enabled?'start':'nav'}" ${bank.enabled?`data-bank="${esc(bank.id)}"`:'data-view="banks"'} aria-label="${bank.enabled?'Estudar':'Gerenciar'} ${esc(bank.name)}">
    <span class="home-bank-icon">${icon('book',21)}</span>
    <span class="home-bank-copy"><strong>${esc(bank.name)}</strong><span>${esc(disciplines)}</span><small>${questionCount(bank.questions.length)} · ${bank.enabled?`${answered} resolvidas`:'Desativado'}</small></span>
    <span class="home-bank-arrow">${icon('arrow',18)}</span>
  </button>`;
}

function weekView(model,now){
  const days=Array.from({length:7},(_,i)=>{const date=new Date(now-(6-i)*86400000),key=localDay(date);const answers=model.answers.filter(a=>localDay(a.at)===key);return {label:date.toLocaleDateString('pt-BR',{weekday:'short',timeZone:'America/Sao_Paulo'}).replace('.',''),total:answers.length,correct:answers.filter(a=>a.correct).length};});
  const total=days.reduce((n,d)=>n+d.total,0),correct=days.reduce((n,d)=>n+d.correct,0),max=Math.max(5,...days.map(d=>d.total));
  return `<section class="home-week" aria-labelledby="home-week-title">
    <div class="home-section-heading"><h2 id="home-week-title">Seu ritmo</h2><span>Últimos 7 dias</span></div>
    <div class="home-week-summary"><strong>${total}</strong><span>questões respondidas<br>nesta semana</span>${total?`<span class="home-week-rate">${Math.round(correct/total*100)}% de acertos</span>`:''}</div>
    <div class="home-week-chart" role="img" aria-label="Respostas nos últimos sete dias: ${days.map(d=>`${d.label}: ${d.total}`).join('; ')}">
      ${days.map((d,i)=>`<div class="home-week-day ${i===6?'today':''}"><span class="home-week-track"><span style="height:${d.total/max*100}%"></span></span><small>${d.label}</small></div>`).join('')}
    </div>
    <p class="home-week-note">${total?'Seu histórico cresce a cada sessão.':'Sua primeira sessão começa a preencher este espaço.'}</p>
  </section>`;
}

export function homeView({model,config,resume,driveConnected,driveStatus,driveMessage,guest=false,now=Date.now()}){
  const today=model.answers.filter(a=>localDay(a.at)===localDay(now)).length;
  const goal=Math.max(1,Number(config.dailyGoal)||10),goalPercent=Math.min(100,Math.round(today/goal*100)),streak=studyStreak(model.answers,now);
  const hour=Number(new Intl.DateTimeFormat('pt-BR',{hour:'numeric',hourCycle:'h23',timeZone:'America/Sao_Paulo'}).format(now));
  const greeting=hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite';
  const firstName=String(config.name||'Estudante').trim().split(/\s+/)[0];
  const banks=[...model.banks].sort((a,b)=>Number(b.enabled)-Number(a.enabled)).slice(0,3);
  const hasContent=model.banks.some(b=>b.enabled);
  const mainAction=resume?'resume':hasContent?'start':'import';
  const available=mode=>filterQuestions(model,{mode},now).length;
  const newCount=available('new'),errorCount=available('errors'),favoriteCount=available('favorites');
  const choices=[
    {mode:'new',name:'Não respondidas',text:`${newCount} para explorar`,icon:'book',available:newCount},
    {mode:'errors',name:'Revisar erros',text:errorCount?`${errorCount} para refazer`:'Tudo em dia',icon:'repeat',available:errorCount},
    {mode:'favorites',name:'Favoritas',text:favoriteCount?`${favoriteCount} ${guest?'nesta sessão':'salvas'}`:'Marque durante o estudo',icon:'heart',available:favoriteCount},
    {mode:'exam',name:'Simulado',text:'Teste seus conhecimentos',icon:'clock',available:Number(hasContent)}
  ];
  return `<div class="home-page">
    <header class="home-welcome"><div><p>SEU ESPAÇO DE ESTUDO</p><h1>${greeting}, ${esc(firstName)}<span>.</span></h1></div><span class="home-date">${new Date(now).toLocaleDateString('pt-BR',{day:'numeric',month:'long',timeZone:'America/Sao_Paulo'})}</span></header>
    <section class="home-focus" aria-labelledby="home-focus-title">
      <div class="home-focus-top"><span class="home-focus-label">${icon(resume?'pause':'spark',14)} ${resume?'SESSÃO EM ANDAMENTO':'UMA QUESTÃO DE CADA VEZ'}</span><span class="home-streak">${icon('flame',15)} ${streak} ${streak===1?'dia':'dias'}</span></div>
      <h2 id="home-focus-title">${resume?'Vamos continuar?':hasContent?'Hora de dar o próximo passo.':'Seu estudo começa aqui.'}</h2>
      <p>${resume?`${resume.queue.length-resume.index} questões para retomar de onde você parou.`:hasContent?'Escolha seu conteúdo e avance no seu ritmo.':'Importe seu primeiro banco de questões para começar.'}</p>
      <div class="home-focus-actions"><button class="home-primary" data-action="${mainAction}">${icon(resume?'play':hasContent?'play':'plus',18)} ${resume?'Continuar sessão':hasContent?'Começar a estudar':'Importar questões'} ${icon('arrow',19)}</button>${hasContent?`<button class="home-secondary" data-action="${resume?'start':'nav'}" ${resume?'':'data-view="study"'}>${resume?'Nova sessão':'Escolher modo de estudo'}</button>`:''}</div>
      <div class="home-daily"><div><span>${today>=goal?'Meta de hoje concluída':'Sua meta de hoje'}</span><strong>${today}<small> / ${goal} questões</small></strong></div><progress value="${Math.min(today,goal)}" max="${goal}" aria-label="Meta diária: ${today} de ${goal} questões">${goalPercent}%</progress></div>
    </section>
    ${config.folderId&&!driveConnected?`<section class="home-drive-note ${driveStatus==='error'?'has-error':''}" aria-label="Sincronização do Drive"><span>${icon('cloud',20)}</span><div><strong>${driveStatus==='error'?'Confira sua conexão com o Drive':'Sua pasta já está configurada'}</strong><p>${driveStatus==='error'?esc(driveMessage||'Autorize novamente para sincronizar seus estudos.'):'Autorize o Drive para recuperar seus estudos.'}</p></div><button data-action="connect-drive">Conectar ${icon('arrow',15)}</button></section>`:''}
    <section class="home-stats" aria-label="Seu progresso geral"><div>${icon('book',17)}<strong>${model.stats.answered}</strong><span>Respondidas</span></div><div>${icon('target',17)}<strong>${model.stats.attempts?`${model.stats.accuracy}%`:'—'}</strong><span>Acertos</span></div><button data-action="nav" data-view="revision">${icon('repeat',17)}<strong>${model.stats.review}</strong><span>Para revisar ${icon('arrow',11)}</span></button></section>
    <section class="home-modes" aria-labelledby="home-modes-title"><div class="home-section-heading"><h2 id="home-modes-title">Como vamos estudar?</h2><button data-action="nav" data-view="study">Ver modos ${icon('arrow',14)}</button></div><div class="home-mode-grid">${choices.map(c=>`<button class="home-mode" data-action="start" data-mode="${c.mode}" ${c.available?'':'disabled'}><span class="home-mode-icon ${c.mode}">${icon(c.icon,20)}</span><span><strong>${c.name}</strong><small>${c.text}</small></span>${icon('arrow',15)}</button>`).join('')}</div></section>
    <div class="home-lower"><section class="home-banks" aria-labelledby="home-banks-title"><div class="home-section-heading"><h2 id="home-banks-title">Meus bancos</h2><button data-action="nav" data-view="banks">Ver todos ${icon('arrow',14)}</button></div><div class="home-bank-list">${banks.length?banks.map(b=>bankRow(b,model)).join(''):'<p class="home-bank-empty">Adicione seus conteúdos e organize o próximo estudo.</p>'}<button class="home-import" data-action="import">${icon('plus',18)} Importar banco JSON</button></div></section>${weekView(model,now)}</div>
    <footer class="home-footer">Foco nos estudos. Um passo por dia.</footer>
  </div>`;
}
