import {icon} from './icons.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statuses={correct:['Acerto','check'],wrong:['Erro','x'],skipped:['Pulada','skip-back'],pending:['Pendente','clock'],answered:['Respondida','check']};

export function sessionQuestionStates(session,answers=[]){
  const grades=new Map(answers.filter(a=>a.sessionId===session.id).map(a=>[a.key,a]));
  return session.queue.map((key,index)=>{
    const selected=session.answers[key],grade=grades.get(key);
    const status=selected?(session.mode==='exam'&&!session.completed||!grade?'answered':selected===grade.correctOption?'correct':'wrong'):session.answers[key]===null?'skipped':'pending';
    return {key,index,status,current:index===session.index};
  });
}

export function nextSkippedIndex(session){
  for(let offset=1;offset<=session.queue.length;offset++){
    const index=(session.index+offset)%session.queue.length;
    if(session.answers[session.queue[index]]===null)return index;
  }
  return -1;
}

export function sessionNavigationView(session){
  const count=session.queue.filter(key=>session.answers[key]===null).length;
  return `<nav class="session-navigation" aria-label="Navegar pelas questões"><button class="btn ghost small" data-action="skipped" aria-label="Ir para a próxima questão pulada: ${count} ${count===1?'pulada':'puladas'}" title="Ir para a próxima questão pulada" ${count?'':'disabled'}>${icon('skip-back',17)}<span>Puladas</span><strong>${count}</strong></button><button class="btn ghost small" data-action="question-list" aria-label="Lista de todas as questões" aria-haspopup="dialog" aria-controls="dialog" title="Lista de questões">${icon('list',17)}<span>Questões</span></button></nav>`;
}

export function sessionQuestionListView(session,answers=[],topicFor=()=> ''){
  const items=sessionQuestionStates(session,answers),counts={};
  for(const item of items)counts[item.status]=(counts[item.status]||0)+1;
  return `<section class="question-navigator"><div class="dialog-title"><h2 id="dialog-title">Questões da sessão</h2><p>Escolha uma questão para continuar. As respostas registradas são preservadas.</p></div><div class="question-status-legend" aria-label="Resumo das questões">${Object.entries(statuses).filter(([status])=>counts[status]).map(([status,[label,i]])=>`<span class="question-state is-${status}">${icon(i,14)} ${label}: ${counts[status]}</span>`).join('')}</div>${session.mode==='exam'&&!session.completed?'<p class="setting-note">No simulado, acertos e erros aparecem somente ao concluir.</p>':''}<ol class="question-jump-list" aria-label="Todas as questões">${items.map(item=>{
    const [label,i]=statuses[item.status],topic=topicFor(item.key)||'Questão da sessão';
    return `<li><button class="question-jump is-${item.status}" data-action="jump-question" data-session="${esc(session.id)}" data-index="${item.index}" ${item.current?'aria-current="step"':''} aria-label="Questão ${item.index+1}: ${label}${item.current?', atual':''}. ${esc(topic)}"><span class="question-jump-number">${item.index+1}</span><span class="question-jump-topic">${esc(topic)}${item.current?'<small>Questão atual</small>':''}</span><span class="question-state is-${item.status}">${icon(i,15)}<span>${label}</span></span></button></li>`;
  }).join('')}</ol><div class="dialog-actions"><button class="btn" data-action="close-dialog">Voltar à questão</button></div></section>`;
}
