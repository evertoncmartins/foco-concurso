import {bankPresentation} from './bank-view.mjs';
import {icon} from './icons.mjs';
import {sourceType,sourceLabel,sourceTag} from './bank-source.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const sessionBankIds=session=>[...new Set(session.queue.map(key=>key.includes(':')?key.slice(0,key.indexOf(':')):'').filter(Boolean))];
export function sessionBankCatalog(model){
  const currentIds=new Set(model.banks.map(b=>b.id)),studiedIds=new Set(model.sessions.filter(s=>!s.abandoned).flatMap(sessionBankIds));
  const banks=new Map((model.bankHistory||[]).map(e=>[e.bank.id,e.bank]));
  for(const bank of model.banks)banks.set(bank.id,bank);
  for(const answer of model.answers)studiedIds.add(answer.key.split(':')[0]);
  for(const id of studiedIds)if(!banks.has(id)){const recorded=model.answers.find(a=>a.bankId===id),saved=model.sessions.flatMap(s=>Object.values(s.questionSources||{})).find(q=>q.bankId===id);banks.set(id,{id,name:recorded?.displayName||saved?.displayName||'Banco indisponível',questions:[],sourceType:recorded?.sourceType||saved?.sourceType||'personal'});}
  return [...banks.values()].filter(b=>currentIds.has(b.id)||studiedIds.has(b.id)).map(b=>({...b,title:bankPresentation(b).title,removed:!currentIds.has(b.id)})).sort((a,b)=>a.title.localeCompare(b.title,'pt-BR',{numeric:true}));
}
function recordings(model){
  const bySession=new Map();
  for(const a of model.answers){if(!bySession.has(a.sessionId))bySession.set(a.sessionId,new Map());bySession.get(a.sessionId).set(a.key,a);}
  return bySession;
}
export function sessionSummary(s,model,context={}){
  const grades=(context.recordings||recordings(model)).get(s.id)||new Map(),catalog=context.catalog||sessionBankCatalog(model);
  let answered=0,correct=0,wrong=0,ungraded=0;
  for(const key of s.queue)if(s.answers[key]){answered++;const grade=grades.get(key);if(!grade)ungraded++;else if(s.answers[key]===grade.correctOption)correct++;else wrong++;}
  const bankIds=sessionBankIds(s),names=bankIds.map(id=>catalog.find(b=>b.id===id)?.title||'Banco indisponível'),sources=[...new Set(bankIds.map(id=>sourceType(catalog.find(b=>b.id===id)||Object.values(s.questionSources||{}).find(q=>q.bankId===id))))];
  const available=context.available||new Set(model.questions.map(q=>q.key));
  return {id:s.id,session:s,bankIds,sources,title:names.join(' · ')||'Sessão de estudo',total:s.queue.length,answered,correct,wrong,ungraded,skipped:s.queue.length-answered,
    accuracy:s.completed&&!ungraded?Math.round(correct/s.queue.length*100)||0:null,
    canResume:!s.completed&&!s.abandoned&&s.index<s.queue.length&&s.queue.every(key=>available.has(key)),
    updatedAt:model.sessionUpdatedAt?.get(s.id)||s.completedAt||s.startedAt||'',exam:s.mode==='exam',completed:!!s.completed};
}
export function sessionLibrary(model,{status='open',bankId='',type='all',page=1,pageSize=12}={}){
  const context={recordings:recordings(model),catalog:sessionBankCatalog(model),available:new Set(model.questions.map(q=>q.key))};
  const matching=model.sessions.filter(s=>!s.abandoned).filter(s=>(!bankId||sessionBankIds(s).includes(bankId))&&(type==='all'||(type==='exam')===(s.mode==='exam'))).map(s=>sessionSummary(s,model,context));
  const open=matching.filter(s=>!s.completed).length,completed=matching.length-open;
  const rows=matching.filter(s=>s.completed===(status==='completed')).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.id.localeCompare(a.id));
  const pages=Math.max(1,Math.ceil(rows.length/pageSize)),current=Math.max(1,Math.min(pages,Math.floor(Number(page)||1)));
  return {catalog:context.catalog,rows:rows.slice((current-1)*pageSize,current*pageSize),open,completed,total:rows.length,page:current,pages};
}
export function sessionReport(s,model){
  const catalog=sessionBankCatalog(model),bankMap=new Map(catalog.map(b=>[b.id,b])),summary=sessionSummary(s,model,{catalog}),grades=recordings(model).get(s.id)||new Map(),versions=new Map(),maps=new Map();
  for(const event of model.bankHistory||[]){if(!versions.has(event.bank.id))versions.set(event.bank.id,[]);versions.get(event.bank.id).push(event);}
  const current=new Map(model.questions.map(q=>[q.key,q]));
  const questions=s.queue.map(key=>{
    const grade=grades.get(key),selected=s.answers[key]||null,bankId=key.split(':')[0],id=key.slice(bankId.length+1);
    const cutoff=grade?.at||summary.updatedAt;
    const saved=s.questionSources?.[key],history=versions.get(bankId)||[];
    const version=(saved?.sourceType==='system'&&history.findLast(e=>e.revision===saved.bankRevision))||history.findLast(e=>e.at<=cutoff)||history[0];
    let question=current.get(key)||null;
    if(version){if(!maps.has(version))maps.set(version,new Map(version.bank.questions.map(q=>[q.id,q])));question=maps.get(version).get(id)||null;}
    if(grade?.questionSnapshot)question=grade.questionSnapshot;
    if(question&&grade&&!question.options.some(o=>o.id===grade.correctOption))question=null;
    const bank=bankMap.get(bankId),metadata={bankId,sourceType:grade?.sourceType||saved?.sourceType||sourceType(bank),displayName:bank?.title||grade?.displayName||saved?.displayName||'Banco indisponível'};
    if(question)question={...question,key,...metadata,correctOption:grade?.correctOption||question.correctOption};
    return {key,question,...metadata,selected,correctOption:grade?.correctOption||question?.correctOption||null,correct:selected&&grade?selected===grade.correctOption:null};
  });
  return {...summary,questions};
}
export function performanceForBank(model,bankId='',origin='all'){
  if(!bankId&&origin==='all')return model;
  const answers=model.answers.filter(a=>(!bankId||a.key.startsWith(`${bankId}:`))&&(origin==='all'||sourceType(a)===origin)),questions=model.questions.filter(q=>(!bankId||q.bankId===bankId)&&(origin==='all'||sourceType(q)===origin)),correct=answers.filter(a=>a.correct).length;
  return {...model,answers,questions,stats:{...model.stats,attempts:answers.length,correct,wrong:answers.length-correct,accuracy:answers.length?Math.round(correct/answers.length*100):0,answered:new Set(answers.map(a=>a.key)).size}};
}
export function bankSelect(model,value='',{id='sessions-bank',attribute='data-session-filter="bankId"'}={}){
  return `<label class="history-filter" for="${id}"><span>Banco / lei</span><select id="${id}" ${attribute}><option value="">Todos os bancos</option>${sessionBankCatalog(model).map(b=>`<option value="${esc(b.id)}" ${value===b.id?'selected':''}>${esc(b.title)} · ${sourceLabel(b)}${b.removed?' (removido)':''}</option>`).join('')}</select></label>`;
}
export function sessionDate(value){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}):'Data não informada';}
export function sessionsView(model,filters){
  const library=sessionLibrary(model,filters),completed=filters.status==='completed';
  return `<div class="session-library">
    <div class="history-filters">${bankSelect(model,filters.bankId)}<label class="history-filter" for="sessions-type"><span>Tipo de estudo</span><select id="sessions-type" data-session-filter="type"><option value="all" ${filters.type==='all'?'selected':''}>Todos os tipos</option><option value="study" ${filters.type==='study'?'selected':''}>Estudo</option><option value="exam" ${filters.type==='exam'?'selected':''}>Simulado</option></select></label></div>
    <div class="session-status-tabs" role="group" aria-label="Situação das sessões"><button data-action="sessions-tab" data-status="open" aria-pressed="${!completed}">Em andamento <span>${library.open}</span></button><button data-action="sessions-tab" data-status="completed" aria-pressed="${completed}">Concluídas <span>${library.completed}</span></button></div>
    <p class="session-list-count" role="status">${library.total} ${library.total===1?'sessão encontrada':'sessões encontradas'}</p>
    ${library.rows.length?`<div class="saved-sessions">${library.rows.map(row=>`<article class="saved-session">
      <header><span class="saved-session-kind ${row.exam?'is-exam':''}">${icon(row.exam?'clock':'book',14)} ${row.exam?'Simulado':'Estudo'}</span><time>${esc(sessionDate(row.updatedAt))}</time></header>
      <h2>${esc(row.title)}</h2><p class="session-sources">${row.sources.map(sourceType=>sourceTag({sourceType})).join(' ')}</p><p class="saved-session-description">${row.total} questões${row.completed?'':` · Parou na questão ${Math.min(row.total,row.session.index+1)}`}</p>
      ${row.completed?`<dl class="saved-session-stats"><div><dt>Aproveitamento</dt><dd>${row.accuracy===null?'—':`${row.accuracy}%`}</dd></div><div><dt>Acertos</dt><dd>${row.correct}</dd></div><div><dt>Erros</dt><dd>${row.wrong}</dd></div></dl>`:`<div class="saved-session-progress"><span>${row.answered} de ${row.total} respostas registradas</span><progress max="${row.total}" value="${row.answered}" aria-label="${row.answered} de ${row.total} respostas registradas"></progress></div>`}
      ${!row.completed&&!row.canResume?'<p class="session-unavailable">Reimporte o banco original para recuperar as questões desta sessão.</p>':''}
      ${row.completed&&row.ungraded?'<p class="session-unavailable">Há respostas sem correção registrada no histórico.</p>':''}
      <footer><button class="btn small ${row.completed?'':'primary'}" data-action="${row.completed?'session-result':'session-resume'}" data-session="${esc(row.id)}" ${!row.completed&&!row.canResume?'disabled':''}>${row.completed?'Ver resultado':'Continuar'} ${icon('arrow',15)}</button></footer>
    </article>`).join('')}</div>`:`<div class="empty"><h3>${completed?'Nenhuma sessão concluída':'Nenhuma sessão em andamento'}</h3><p>${filters.bankId||filters.type!=='all'?'Experimente outros filtros para encontrar seus estudos.':'Suas sessões de estudo e simulados aparecerão aqui.'}</p></div>`}
    ${library.pages>1?`<nav class="session-pagination" aria-label="Páginas de sessões"><button class="btn small" data-action="sessions-page" data-page="${library.page-1}" ${library.page===1?'disabled':''}>${icon('back',14)} Anterior</button><span>${library.page} de ${library.pages}</span><button class="btn small" data-action="sessions-page" data-page="${library.page+1}" ${library.page===library.pages?'disabled':''}>Próxima ${icon('arrow',14)}</button></nav>`:''}
  </div>`;
}
