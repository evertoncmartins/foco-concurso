import {normalizeQuestionOrigin} from './question-origin.mjs';
import {bankPresentation} from './bank-names.mjs';
import {personalBankId,sourceType} from './bank-source.mjs';
import {deriveProgressLinks,linkedStudyKey,questionIdentity} from './bank-progress.mjs';
export const VERSION = 1;
export const DAY = 86400000;
export const questionKey = (b, q) => `${b}:${q}`;
// JSON object key order is not part of an event's content. Array order is.
export const canonicalJSON = value => JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0)):item);
export const sameEvent = (a,b) => canonicalJSON(a)===canonicalJSON(b);
export const isStudyEvent = e => ['answer','flag','session'].includes(e.type);
export const studyEpoch = e => Object.hasOwn(e,'progressEpoch') ? e.progressEpoch : e.type==='session' ? e.session?.progressEpoch??null : null;
export const currentProgressEpoch = events => mergeEvents(events).findLast(e=>e.type==='progress-reset')?.id??null;
const text = (v, label, max = Infinity) => {
  if (typeof v !== 'string') throw new Error(`${label}: o valor deve ser um texto.`);
  if (!v.trim()) throw new Error(`${label}: informe um texto não vazio.`);
  if (v.length > max) throw new Error(`${label}: use até ${max} caracteres.`);
  return v.trim();
};
function optionText(value,label){
  if(typeof value==='number'&&Number.isFinite(value))return String(value);
  if(typeof value==='string')return text(value,label);
  if(value==null)throw new Error(`${label}: o campo "text" está ausente ou nulo. Preencha o conteúdo da alternativa.`);
  const type=Array.isArray(value)?'uma lista':typeof value==='object'?'um objeto':typeof value==='boolean'?'um booleano':'um valor inválido';
  throw new Error(`${label}: "text" contém ${type}. Use texto entre aspas ou um número finito; não é possível recuperar a alternativa automaticamente.`);
}
export function validateBank(raw) {
  if (!raw || raw.schemaVersion !== 1) throw new Error('schemaVersion deve ser 1. Baixe o modelo JSON.');
  const bank = {schemaVersion: 1, id: text(raw.id, 'ID do banco', 120), name: text(raw.name, 'Nome'), description: typeof raw.description === 'string' ? raw.description : '', questions: []};
  if(raw.displayName!=null)bank.displayName=text(raw.displayName,'Nome de exibição');
  if(typeof raw.subtitle==='string')bank.subtitle=raw.subtitle;
  if (!/^[a-zA-Z0-9_-]+$/.test(bank.id)) throw new Error('ID do banco: use letras, números, _ ou -.');
  if (!Array.isArray(raw.questions) || !raw.questions.length || raw.questions.length > 5000) throw new Error('O banco deve conter de 1 a 5.000 questões.');
  const ids = new Set();
  bank.questions = raw.questions.map((q, i) => {
    const label = `Questão ${i + 1}`;
    if (!q || typeof q !== 'object') throw new Error(`${label}: objeto inválido.`);
    const n = {id: text(q.id, `${label} ID`, 120), discipline: text(q.discipline, `${label} disciplina`), subject: text(q.subject, `${label} assunto`), topic: text(q.topic, `${label} tópico`), statement: text(q.statement, `${label} enunciado`), explanation: text(q.explanation, `${label} comentário`), difficulty: q.difficulty, tags: q.tags};
    if (!/^[a-zA-Z0-9_-]+$/.test(n.id) || ids.has(n.id)) throw new Error(`${label}: ID inválido ou repetido.`); ids.add(n.id);
    if (!['easy','medium','hard'].includes(n.difficulty)) throw new Error(`${label}: difficulty deve ser easy, medium ou hard.`);
    if (!Array.isArray(n.tags) || n.tags.length > 30 || n.tags.some(x => typeof x !== 'string')) throw new Error(`${label}: tags deve ser uma lista de até 30 textos.`);
    n.tags = [...new Set(n.tags)];
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 8) throw new Error(`${label}: informe 2 a 8 alternativas.`);
    const optionIds = new Set();
    n.options = q.options.map(o => { const id = text(o?.id, `${label} alternativa ID`, 1); if (!/^[A-H]$/.test(id) || optionIds.has(id)) throw new Error(`${label}: alternativas precisam de IDs únicos A–H.`); optionIds.add(id); return {id, text: optionText(o.text, `${label} alternativa ${id}`)}; });
    if (!optionIds.has(q.correctOption)) throw new Error(`${label}: correctOption precisa existir nas alternativas.`);
    n.correctOption = q.correctOption;
    if (q.reference != null) { n.reference = {label: text(q.reference.label, `${label} referência`)}; if (q.reference.url) { const u = new URL(q.reference.url); if (u.protocol !== 'https:') throw new Error(`${label}: a referência deve usar HTTPS.`); n.reference.url = u.href; } }
    return {...n,...normalizeQuestionOrigin(q,label)};
  });
  return bank;
}
export function validateEvents(document) {
  if (document?.schemaVersion !== 1 || !Array.isArray(document.events) || document.events.length > 100000) throw new Error('Arquivo de progresso inválido ou versão incompatível.');
  const events = document.events.map(e => {
    if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !e.id || e.id.length > 300 || typeof e.at !== 'string' || !Number.isFinite(Date.parse(e.at)) || new Date(e.at).toISOString() !== e.at) throw new Error('Evento de progresso inválido.');
    if (Object.hasOwn(e,'progressEpoch') && e.progressEpoch!==null && (typeof e.progressEpoch!=='string'||!e.progressEpoch||e.progressEpoch.length>300)) throw new Error('Etapa de progresso inválida.');
    if (e.type === 'event-conflict') {
      if (!/^foco-conflict-[a-f0-9]{64}$/.test(e.id) || typeof e.originalId !== 'string' || !e.event || e.event.type === 'event-conflict') throw new Error('Registro de recuperação inválido.');
      const original=validateEvents({schemaVersion:1,events:[e.event]})[0];
      if (original.id !== e.originalId || original.at !== e.at) throw new Error('Registro de recuperação inválido.');
      return {...e,event:original};
    }
    if (e.type === 'bank') return {...e, bank: validateBank(e.bank)};
    if(e.type==='system-bank-snapshot'){const bank=validateBank(e.bank);if(!/^lei-[1-9]\d*$/.test(bank.id)||typeof e.revision!=='string'||!e.revision)throw new Error('Versão histórica de banco inválida.');return {...e,bank:{...bank,revision:e.revision,sourceType:'system'}};}
    if (e.type === 'bank-state'||e.type==='system-bank-state') { if (typeof e.bankId !== 'string' || !(e.type==='system-bank-state'?['enabled','disabled']:['enabled','disabled','deleted']).includes(e.value)) throw new Error('Estado de banco inválido.'); }
    else if(e.type==='bank-metadata'){text(e.bankId,'Banco');text(e.displayName,'Nome de exibição');}
    else if(e.type==='bank-progress-link'||e.type==='bank-progress-unlink'){
      if(typeof e.fromBankId!=='string'||!/^[\w-]{1,120}$/.test(e.fromBankId))throw new Error('Banco de origem da associação inválido.');
      if(e.type==='bank-progress-link'){
        if(typeof e.toBankId!=='string'||!/^lei-[1-9]\d*$/.test(e.toBankId)||e.fromBankId===e.toBankId||typeof e.fromEventId!=='string'||!e.fromEventId||e.fromEventId.length>300||typeof e.toRevision!=='string'||!e.toRevision)throw new Error('Destino da associação inválido.');
        if(!Array.isArray(e.questions)||!e.questions.length||e.questions.length>5000||e.questions.some(q=>!q||typeof q.from!=='string'||typeof q.to!=='string'||!/^[\w-]{1,120}$/.test(q.from)||!/^[\w-]{1,120}$/.test(q.to))||new Set(e.questions.map(q=>q.from)).size!==e.questions.length||new Set(e.questions.map(q=>q.to)).size!==e.questions.length)throw new Error('Questões da associação inválidas.');
      }
    }
    else if (e.type === 'answer') {
      if (typeof e.key !== 'string' || typeof e.sessionId !== 'string' || typeof e.correct !== 'boolean' || !/^[A-H]$/.test(e.selected) || !/^[A-H]$/.test(e.correctOption)) throw new Error('Resposta inválida.');
      if (e.correct !== (e.selected === e.correctOption)) throw new Error('Resultado inconsistente.');
      for (const field of ['discipline','subject','topic']) text(e[field], `Resposta ${field}`);
      if(e.sourceType!=null&&!['personal','system'].includes(e.sourceType))throw new Error('Origem da resposta inválida.');
      if(e.questionSnapshot!=null)validateBank({schemaVersion:1,id:'snapshot',name:'Snapshot',questions:[e.questionSnapshot]});
    } else if (e.type === 'flag') { if (typeof e.key !== 'string' || !['favorite','review'].includes(e.flag) || typeof e.value !== 'boolean') throw new Error('Marcação inválida.'); }
    else if (e.type === 'session') {
      const s = e.session;
      if (!s || typeof s.id !== 'string' || !Array.isArray(s.queue) || s.queue.length > 5000 || s.queue.some(k => typeof k !== 'string') || !Number.isInteger(s.index) || s.index < 0 || s.index > s.queue.length || !s.answers || typeof s.answers !== 'object' || !['smart','random','new','errors','favorites','review','subject','exam'].includes(s.mode)) throw new Error('Sessão inválida.');
      for (const v of Object.values(s.answers)) if (v !== null && !/^[A-H]$/.test(v)) throw new Error('Alternativa da sessão inválida.');
      if (Object.hasOwn(s,'progressEpoch') && s.progressEpoch!==null && (typeof s.progressEpoch!=='string'||!s.progressEpoch||s.progressEpoch.length>300)) throw new Error('Etapa da sessão inválida.');
      if (Object.hasOwn(e,'progressEpoch') && e.progressEpoch!==(s.progressEpoch??null)) throw new Error('Etapa da sessão inconsistente.');
    } else if (e.type !== 'progress-reset') throw new Error('Tipo de evento desconhecido.');
    return structuredClone(e);
  });
  return events;
}
export function mergeEvents(...collections) {
  const map = new Map();
  for (const e of collections.flat()) { const old = map.get(e.id); if (old && !sameEvent(old,e)) throw new Error('Conflito: dois eventos com o mesmo ID têm conteúdos diferentes.'); map.set(e.id, e); }
  return [...map.values()].sort((a,b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
export function derive(events, now = Date.now(), systemBanks=[]) {
  const banks = new Map(), states = new Map(), metadata=new Map(), systemStates=new Map(), progress = new Map(), flags = new Map(), sessions = new Map(), answers = [], flagEvents=[],bankHistory=[], sessionUpdatedAt=new Map();
  const ordered=mergeEvents(events),progressEpoch=ordered.findLast(e=>e.type==='progress-reset')?.id??null;
  const aliases=new Map(ordered.filter(e=>e.type==='bank'&&personalBankId(e.bank.id)!==e.bank.id).map(e=>[e.bank.id,personalBankId(e.bank.id)]));
  const keyAlias=(key,origin)=>origin==='system'?key:aliases.has(key.split(':')[0])?`${aliases.get(key.split(':')[0])}${key.slice(key.indexOf(':'))}`:key;
  for (const e of ordered) {
    // Retired generations stay inactive even when an old device has a fast clock.
    if (isStudyEvent(e)&&studyEpoch(e)!==progressEpoch) continue;
    if (e.type === 'bank') {const id=aliases.get(e.bank.id)||e.bank.id,bank={...e.bank,id,bankId:id,sourceType:'personal',editable:true,removable:true};banks.set(id,bank);bankHistory.push({...e,bank});}
    if(e.type==='system-bank-snapshot')bankHistory.push({...e,bank:{...e.bank,bankId:e.bank.id,sourceType:'system'}});
    if (e.type === 'bank-state') states.set(aliases.get(e.bankId)||e.bankId, e.value);
    if(e.type==='system-bank-state')systemStates.set(e.bankId,e.value);
    if(e.type==='bank-metadata')metadata.set(aliases.get(e.bankId)||e.bankId,e.displayName);
    if (e.type === 'session') {const s=structuredClone(e.session),sources=s.questionSources||{};s.queue=s.queue.map(k=>keyAlias(k,sources[k]?.sourceType));s.answers=Object.fromEntries(Object.entries(s.answers).map(([k,v])=>[keyAlias(k,sources[k]?.sourceType),v]));if(s.questionSources)s.questionSources=Object.fromEntries(Object.entries(sources).map(([k,v])=>[keyAlias(k,v.sourceType),v]));sessions.set(s.id,s);sessionUpdatedAt.set(s.id,e.at);}
    if (e.type === 'flag') flagEvents.push({...e,key:keyAlias(e.key,e.sourceType)});
    if (e.type === 'answer') {
      const key=keyAlias(e.key,e.sourceType);answers.push({...e,key,bankId:key.split(':')[0],sourceType:sourceType(e)});
    }
  }
  const links=deriveProgressLinks(ordered,bankHistory,systemBanks);
  for(const e of answers){
      const key=linkedStudyKey(e,e.key,links.keys,bankHistory);e.progressKey=key;const p = progress.get(key) || {attempts:0, correct:0, wrong:0, streak:0};
      p.attempts++; p.correct += +e.correct; p.wrong += +!e.correct; p.streak = e.correct ? p.streak + 1 : 0; p.lastCorrect = e.correct; p.lastAt = e.at;
      p.due = new Date(Date.parse(e.at) + DAY * (e.correct ? [1,3,7,14,30,60][Math.min(p.streak-1,5)] : 1)).toISOString();
      progress.set(key, p);
  }
  for(const e of flagEvents){const key=linkedStudyKey(e,e.key,links.keys,bankHistory);if(!flags.has(key))flags.set(key,{});flags.get(key)[e.flag]=e.value;}
  for(const [key,link] of links.keys){
    const current=banks.get(key.split(':')[0])?.questions.find(q=>q.id===key.slice(key.indexOf(':')+1));
    if(current&&questionIdentity(current)!==link.signature)continue;
    if(progress.has(link.key))progress.set(key,progress.get(link.key));if(flags.has(link.key))flags.set(key,flags.get(link.key));
  }
  const personal=[...banks.values()].filter(b => states.get(b.id) !== 'deleted').map(b=>({...b,displayName:metadata.get(b.id)||bankPresentation(b).title,enabled:!links.banks.has(b.id)&&states.get(b.id)!=='disabled',linkedTo:links.banks.get(b.id)||null}));
  for(const event of bankHistory){const custom=metadata.get(event.bank.id);if(custom)event.bank={...event.bank,displayName:custom};}
  const native=systemBanks.map(b=>({...b,bankId:b.id,sourceType:'system',editable:false,removable:false,enabled:systemStates.get(b.id)!=='disabled'}));
  const visibleBanks=[...native,...personal];
  const questions = visibleBanks.flatMap(b => b.questions.map(q => ({...q, key:questionKey(b.id,q.id), bankId:b.id, bankName:b.displayName||b.name, displayName:b.displayName||b.name,sourceType:b.sourceType,bankRevision:b.revision||null,enabled:b.enabled})));
  const available=new Set(questions.map(q=>q.key)),needed=new Set([...sessions.values()].filter(s=>!s.completed&&!s.abandoned).flatMap(s=>s.queue));
  for(const e of [...bankHistory].reverse())if(e.type==='system-bank-snapshot')for(const q of e.bank.questions){const key=questionKey(e.bank.id,q.id);if(needed.has(key)&&!available.has(key)){questions.push({...q,key,bankId:e.bank.id,bankName:e.bank.displayName||e.bank.name,displayName:e.bank.displayName||e.bank.name,sourceType:'system',bankRevision:e.revision,enabled:false});available.add(key);}}
  for(const [key,link] of links.keys)if(needed.has(key)&&!available.has(key)){questions.push({...link.question,key,bankId:link.bank.id,bankName:link.bank.displayName||link.bank.name,displayName:link.bank.displayName||link.bank.name,sourceType:'personal',enabled:false});available.add(key);}
  for(const q of questions){const link=links.keys.get(q.key);q.progressKey=link&&questionIdentity(q)===link.signature?link.key:q.key;}
  const uniqueQuestions=[...new Map(questions.map(q=>[q.progressKey,q])).values()];
  const correct = answers.filter(e => e.correct).length;
  const stats = {attempts:answers.length, correct, wrong:answers.length-correct, accuracy:answers.length?Math.round(correct/answers.length*100):0, answered:uniqueQuestions.filter(q=>progress.has(q.progressKey)).length, pending:uniqueQuestions.filter(q=>!progress.has(q.progressKey)).length, errors:uniqueQuestions.filter(q=>progress.get(q.progressKey)?.lastCorrect===false).length, favorites:uniqueQuestions.filter(q=>flags.get(q.progressKey)?.favorite).length, review:uniqueQuestions.filter(q=>flags.get(q.progressKey)?.review || (progress.has(q.progressKey)&&Date.parse(progress.get(q.progressKey).due)<=now)).length};
  return {banks:visibleBanks,systemBanks:native,personalBanks:personal,questions,progress,flags,answers,sessions:[...sessions.values()],stats,progressEpoch,bankHistory,sessionUpdatedAt,bankLinks:links.banks,progressLinks:links.keys};
}
export function filterQuestions(model, options, now = Date.now()) {
  return model.questions.filter(q => {
    const p = model.progress.get(q.key), f = model.flags.get(q.key);
    if (!q.enabled || (options.banks && !options.banks.includes(q.bankId))) return false;
    if (options.discipline && q.discipline !== options.discipline || options.subject && q.subject !== options.subject || options.topic && q.topic !== options.topic) return false;
    if (options.mode === 'new') return !p;
    if (options.mode === 'errors') return p?.lastCorrect === false;
    if (options.mode === 'favorites') return !!f?.favorite;
    if (options.mode === 'review') return !!f?.review || (!!p && Date.parse(p.due)<=now);
    return true;
  });
}
export function makeQueue(model, options, rng = Math.random, now = Date.now()) {
  return filterQuestions(model,options,now).map(q => {
    const p = model.progress.get(q.key); let weight = 1;
    if (options.mode !== 'random' && options.mode !== 'exam') weight = !p ? 6 : p.lastCorrect === false ? (Date.parse(p.due)<=now?5:1) : Date.parse(p.due)<=now?2:0.25;
    return {key:q.key, rank:-Math.log(Math.max(rng(),1e-10))/weight};
  }).sort((a,b)=>a.rank-b.rank).slice(0,Math.max(1,options.count||10)).map(q=>q.key);
}
export function breakdown(answers, field) {
  const result = new Map(); for (const a of answers) {const label = a[field]; const p = result.get(label)||{label,total:0,correct:0,wrong:0}; p.total++; p.correct+=+a.correct; p.wrong+=+!a.correct; result.set(label,p);}
  return [...result.values()].map(p=>({...p,accuracy:Math.round(p.correct/p.total*100)})).sort((a,b)=>b.wrong-a.wrong || b.total-a.total);
}
export function localDay(date) {return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));}
export function studyStreak(answers, now = Date.now()) {
  const days = new Set(answers.map(a=>localDay(a.at))); let n=0, date=now;
  if(!days.has(localDay(date))) date-=DAY;
  while(days.has(localDay(date))){n++; date-=DAY;} return n;
}
