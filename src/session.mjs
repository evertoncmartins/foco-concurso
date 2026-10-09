export function createSession(queue,mode='smart',id=crypto.randomUUID(),at=new Date().toISOString()){
  if(!Array.isArray(queue)||!queue.length||new Set(queue).size!==queue.length)throw new Error('A sessão deve ter questões únicas e não pode estar vazia.');
  return {id,mode,queue:[...queue],index:0,answers:{},startedAt:at,completed:false};
}
export function answerEvent(session,q,chosen){return {id:`answer-${session.id}-${q.key}`,type:'answer',key:q.key,sessionId:session.id,selected:chosen,correctOption:q.correctOption,correct:chosen===q.correctOption,discipline:q.discipline,subject:q.subject,topic:q.topic};}
export function chooseAnswer(session,q,chosen){
  if(session.completed||session.queue[session.index]!==q.key||session.answers[q.key])throw new Error('Esta questão já foi respondida ou não está ativa.');
  if(!q.options.some(o=>o.id===chosen))throw new Error('Selecione uma alternativa válida.');
  const next={...structuredClone(session),answers:{...session.answers,[q.key]:chosen}};
  const events=[{type:'session',session:next}];if(session.mode!=='exam')events.unshift(answerEvent(session,q,chosen));
  return {session:next,events};
}
export function advanceSession(session,questions,skip=false,now=new Date().toISOString()){
  if(session.completed)throw new Error('Esta sessão já foi concluída.');
  const next=structuredClone(session),key=next.queue[next.index];
  if(!skip&&!next.answers[key])throw new Error('Responda ou pule a questão antes de continuar.');
  if(skip){if(next.answers[key])throw new Error('Questão respondida não pode ser pulada.');next.answers[key]=null;}
  next.index++;const events=[];
  if(next.index>=next.queue.length){next.completed=true;next.completedAt=now;if(next.mode==='exam')for(const key of next.queue){const q=questions.find(q=>q.key===key);if(!q)throw new Error('O banco do simulado foi removido. Recupere-o para concluir.');if(next.answers[key])events.push(answerEvent(next,q,next.answers[key]));}}
  events.push({type:'session',session:next});return {session:next,events};
}
