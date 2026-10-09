export const VERSION = 1;
export const DAY = 86400000;
export const questionKey = (b, q) => `${b}:${q}`;
const text = (v, label, max = 20000) => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error(`${label}: informe um texto válido (até ${max} caracteres).`); return v.trim(); };
export function validateBank(raw) {
  if (!raw || raw.schemaVersion !== 1) throw new Error('schemaVersion deve ser 1. Baixe o modelo JSON.');
  const bank = {schemaVersion: 1, id: text(raw.id, 'ID do banco', 120), name: text(raw.name, 'Nome', 200), description: typeof raw.description === 'string' ? raw.description.slice(0, 2000) : '', questions: []};
  if (!/^[a-zA-Z0-9_-]+$/.test(bank.id)) throw new Error('ID do banco: use letras, números, _ ou -.');
  if (!Array.isArray(raw.questions) || !raw.questions.length || raw.questions.length > 5000) throw new Error('O banco deve conter de 1 a 5.000 questões.');
  const ids = new Set();
  bank.questions = raw.questions.map((q, i) => {
    const label = `Questão ${i + 1}`;
    if (!q || typeof q !== 'object') throw new Error(`${label}: objeto inválido.`);
    const n = {id: text(q.id, `${label} ID`, 120), discipline: text(q.discipline, `${label} disciplina`, 200), subject: text(q.subject, `${label} assunto`, 200), topic: text(q.topic, `${label} tópico`, 200), statement: text(q.statement, `${label} enunciado`), explanation: text(q.explanation, `${label} comentário`), difficulty: q.difficulty, tags: q.tags};
    if (!/^[a-zA-Z0-9_-]+$/.test(n.id) || ids.has(n.id)) throw new Error(`${label}: ID inválido ou repetido.`); ids.add(n.id);
    if (!['easy','medium','hard'].includes(n.difficulty)) throw new Error(`${label}: difficulty deve ser easy, medium ou hard.`);
    if (!Array.isArray(n.tags) || n.tags.length > 30 || n.tags.some(x => typeof x !== 'string' || x.length > 100)) throw new Error(`${label}: tags deve ser uma lista de textos.`);
    n.tags = [...new Set(n.tags)];
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 8) throw new Error(`${label}: informe 2 a 8 alternativas.`);
    const optionIds = new Set();
    n.options = q.options.map(o => { const id = text(o?.id, `${label} alternativa ID`, 1); if (!/^[A-H]$/.test(id) || optionIds.has(id)) throw new Error(`${label}: alternativas precisam de IDs únicos A–H.`); optionIds.add(id); return {id, text: text(o.text, `${label} alternativa`)}; });
    if (!optionIds.has(q.correctOption)) throw new Error(`${label}: correctOption precisa existir nas alternativas.`);
    n.correctOption = q.correctOption;
    if (q.reference != null) { n.reference = {label: text(q.reference.label, `${label} referência`, 1000)}; if (q.reference.url) { const u = new URL(q.reference.url); if (u.protocol !== 'https:') throw new Error(`${label}: a referência deve usar HTTPS.`); n.reference.url = u.href; } }
    return n;
  });
  return bank;
}
export function validateEvents(document) {
  if (document?.schemaVersion !== 1 || !Array.isArray(document.events) || document.events.length > 100000) throw new Error('Arquivo de progresso inválido ou versão incompatível.');
  const events = document.events.map(e => {
    if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !e.id || e.id.length > 300 || typeof e.at !== 'string' || !Number.isFinite(Date.parse(e.at)) || new Date(e.at).toISOString() !== e.at) throw new Error('Evento de progresso inválido.');
    if (e.type === 'bank') return {...e, bank: validateBank(e.bank)};
    if (e.type === 'bank-state') { if (typeof e.bankId !== 'string' || !['enabled','disabled','deleted'].includes(e.value)) throw new Error('Estado de banco inválido.'); }
    else if (e.type === 'answer') {
      if (typeof e.key !== 'string' || typeof e.sessionId !== 'string' || typeof e.correct !== 'boolean' || !/^[A-H]$/.test(e.selected) || !/^[A-H]$/.test(e.correctOption)) throw new Error('Resposta inválida.');
      if (e.correct !== (e.selected === e.correctOption)) throw new Error('Resultado inconsistente.');
      for (const field of ['discipline','subject','topic']) text(e[field], `Resposta ${field}`, 200);
    } else if (e.type === 'flag') { if (typeof e.key !== 'string' || !['favorite','review'].includes(e.flag) || typeof e.value !== 'boolean') throw new Error('Marcação inválida.'); }
    else if (e.type === 'session') {
      const s = e.session;
      if (!s || typeof s.id !== 'string' || !Array.isArray(s.queue) || s.queue.length > 5000 || s.queue.some(k => typeof k !== 'string') || !Number.isInteger(s.index) || s.index < 0 || s.index > s.queue.length || !s.answers || typeof s.answers !== 'object' || !['smart','random','new','errors','favorites','review','subject','exam'].includes(s.mode)) throw new Error('Sessão inválida.');
      for (const v of Object.values(s.answers)) if (v !== null && !/^[A-H]$/.test(v)) throw new Error('Alternativa da sessão inválida.');
    } else if (e.type !== 'bank') throw new Error('Tipo de evento desconhecido.');
    return structuredClone(e);
  });
  return events;
}
export function mergeEvents(...collections) {
  const map = new Map();
  for (const e of collections.flat()) { const old = map.get(e.id); if (old && JSON.stringify(old) !== JSON.stringify(e)) throw new Error('Conflito: dois eventos com o mesmo ID têm conteúdos diferentes.'); map.set(e.id, e); }
  return [...map.values()].sort((a,b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
export function derive(events, now = Date.now()) {
  const banks = new Map(), states = new Map(), progress = new Map(), flags = new Map(), sessions = new Map(), answers = [];
  for (const e of mergeEvents(events)) {
    if (e.type === 'bank') banks.set(e.bank.id, e.bank);
    if (e.type === 'bank-state') states.set(e.bankId, e.value);
    if (e.type === 'session') sessions.set(e.session.id, e.session);
    if (e.type === 'flag') { if (!flags.has(e.key)) flags.set(e.key, {}); flags.get(e.key)[e.flag] = e.value; }
    if (e.type === 'answer') {
      answers.push(e); const p = progress.get(e.key) || {attempts:0, correct:0, wrong:0, streak:0};
      p.attempts++; p.correct += +e.correct; p.wrong += +!e.correct; p.streak = e.correct ? p.streak + 1 : 0; p.lastCorrect = e.correct; p.lastAt = e.at;
      p.due = new Date(Date.parse(e.at) + DAY * (e.correct ? [1,3,7,14,30,60][Math.min(p.streak-1,5)] : 1)).toISOString();
      progress.set(e.key, p);
    }
  }
  const visibleBanks = [...banks.values()].filter(b => states.get(b.id) !== 'deleted').map(b => ({...b, enabled: states.get(b.id) !== 'disabled'}));
  const questions = visibleBanks.flatMap(b => b.questions.map(q => ({...q, key:questionKey(b.id,q.id), bankId:b.id, bankName:b.name, enabled:b.enabled})));
  const correct = answers.filter(e => e.correct).length;
  const stats = {attempts:answers.length, correct, wrong:answers.length-correct, accuracy:answers.length?Math.round(correct/answers.length*100):0, answered:questions.filter(q=>progress.has(q.key)).length, pending:questions.filter(q=>!progress.has(q.key)).length, errors:questions.filter(q=>progress.get(q.key)?.lastCorrect===false).length, favorites:questions.filter(q=>flags.get(q.key)?.favorite).length, review:questions.filter(q=>flags.get(q.key)?.review || (progress.has(q.key)&&Date.parse(progress.get(q.key).due)<=now)).length};
  return {banks:visibleBanks, questions, progress, flags, answers, sessions:[...sessions.values()], stats};
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
