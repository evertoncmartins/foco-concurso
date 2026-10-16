// Equivalence is exact, never based on a law's name or filename. Explanations
// and descriptive metadata may improve without changing the question itself.
export const questionIdentity=q=>JSON.stringify([q.statement,q.options.map(o=>[o.id,o.text]),q.correctOption]);
export function bankProgressPlan(personal,native){
  if(!personal?.questions?.length||!native?.questions?.length||personal.id===native.id)return null;
  const byId=new Map(native.questions.map(q=>[q.id,q])),byContent=new Map(),used=new Set(),questions=[];
  for(const q of native.questions){const signature=questionIdentity(q);if(!byContent.has(signature))byContent.set(signature,[]);byContent.get(signature).push(q);}
  for(const q of personal.questions){
    const signature=questionIdentity(q),sameId=byId.get(q.id),matches=byContent.get(signature)||[];
    const target=sameId&&questionIdentity(sameId)===signature?sameId:matches.length===1?matches[0]:null;
    if(!target||used.has(target.id))return null;
    used.add(target.id);questions.push({from:q.id,to:target.id});
  }
  return {fromBankId:personal.id,toBankId:native.id,questions};
}
export function progressLinkCandidates(model,bank){
  if(!bank||bank.sourceType!=='personal'||bank.linkedTo)return [];
  return model.systemBanks.filter(native=>bankProgressPlan(bank,native));
}
export function deriveProgressLinks(ordered,bankHistory,nativeBanks){
  const latest=new Map(),banks=new Map(),keys=new Map();
  for(const e of ordered)if(e.type==='bank-progress-link'||e.type==='bank-progress-unlink')latest.set(e.fromBankId,e);
  for(const [fromBankId,e] of latest){
    if(e.type==='bank-progress-unlink')continue;
    const from=bankHistory.find(h=>h.type==='bank'&&h.id===e.fromEventId&&h.bank.id===fromBankId);
    const to=bankHistory.find(h=>h.type==='system-bank-snapshot'&&h.bank.id===e.toBankId&&h.revision===e.toRevision);
    if(!from||!to)continue;
    const plan=bankProgressPlan(from.bank,to.bank),pairs=new Map(e.questions.map(q=>[q.from,q.to]));
    if(!plan||plan.questions.length!==pairs.size||!plan.questions.every(q=>pairs.get(q.from)===q.to))continue;
    const current=nativeBanks.find(b=>b.id===e.toBankId),targetQuestions=new Map(to.bank.questions.map(q=>[q.id,q]));
    for(const pair of plan.questions){
      const source=from.bank.questions.find(q=>q.id===pair.from),target=targetQuestions.get(pair.to),live=current?.questions.find(q=>q.id===pair.to);
      if(live&&questionIdentity(live)!==questionIdentity(target))continue;
      keys.set(`${fromBankId}:${pair.from}`,{key:`${e.toBankId}:${pair.to}`,signature:questionIdentity(source),question:source,bank:from.bank});
    }
    const own=bankHistory.findLast(h=>h.type==='bank'&&h.bank.id===fromBankId)?.bank;
    const complete=own?.questions.length===plan.questions.length&&own.questions.every(q=>keys.get(`${fromBankId}:${q.id}`)?.signature===questionIdentity(q));
    if(complete)banks.set(fromBankId,{...e,displayName:current?.displayName||current?.name||to.bank.displayName||to.bank.name});
  }
  return {banks,keys};
}
export function linkedStudyKey(event,key,links,history){
  const link=links.get(key);if(!link)return key;
  const bankId=key.split(':')[0],id=key.slice(bankId.length+1);
  const versions=history.filter(h=>h.type==='bank'&&h.bank.id===bankId),version=versions.findLast(h=>h.at<=event.at)||versions[0];
  const question=event.questionSnapshot||version?.bank.questions.find(q=>q.id===id);
  return question&&questionIdentity(question)===link.signature?link.key:key;
}
