import {questionIdentity} from './bank-progress.mjs';
export const sourceType=value=>value?.sourceType==='system'?'system':'personal';
export const sourceLabel=value=>sourceType(value)==='system'?'Sistema':'Pessoal';
export const sourceTag=value=>`<span class="bank-source ${sourceType(value)}"${value?.associatedFrom?' title="Progresso associado ao Sistema; registro original Pessoal." aria-label="Sistema, com progresso associado de um banco Pessoal"':''}>${sourceLabel(value)}</span>`;
export const personalBankId=id=>/^lei-\d+$/.test(id)?`personal_bank_${id}`:id;
export function questionSource(question){return {bankId:question.bankId,sourceType:sourceType(question),displayName:question.displayName||question.bankName||'',...(question.bankRevision?{bankRevision:question.bankRevision}:{})};}
export function preparePersonalBank(bank){return {...bank,id:personalBankId(bank.id),sourceType:'personal'};}
// Presentation only. Keep original keys, questionSources and answer origins in
// the journal; display the verified association's current native destination.
export function studyPresentation(model,value){
  if(!value||sourceType(value)==='system')return value;
  const link=model.progressLinks?.get(value.key);
  if(!link||(value.options?questionIdentity(value)!==link.signature:value.progressKey!==link.key))return value;
  const bank=model.systemBanks?.find(b=>link.key.startsWith(`${b.id}:`));
  if(!bank)return value;
  return {...value,bankId:bank.id,sourceType:'system',displayName:bank.displayName||bank.name,associatedFrom:{bankId:value.bankId||value.key.split(':')[0],sourceType:'personal',displayName:value.displayName||value.bankName||''}};
}
// Enrich only an identical native question at display time. Historical grading,
// question text, source, revision and the stored events remain untouched.
export function latestNativeFeedback(question,current){
  if(!question||question.sourceType!=='system'||current?.sourceType!=='system'||questionIdentity(question)!==questionIdentity(current)||!current.optionExplanations)return question;
  return {...question,explanation:current.explanation,optionExplanations:current.optionExplanations,fundamentoLegal:current.fundamentoLegal,reference:current.reference};
}
export function sessionQuestion(model,session,key){
  const current=model.questions.find(q=>q.key===key),source=session.questionSources?.[key];
  if(source?.sourceType!=='system')return current;
  if(current?.sourceType==='system'&&current.bankRevision===source.bankRevision&&model.systemBanks?.some(b=>b.id===source.bankId&&b.revision===source.bankRevision))return current;
  const saved=model.bankHistory?.findLast(e=>e.type==='system-bank-snapshot'&&e.bank.id===source.bankId&&e.revision===source.bankRevision);
  const q=saved?.bank.questions.find(q=>`${source.bankId}:${q.id}`===key);
  return q?latestNativeFeedback({...q,key,...source,bankName:source.displayName,enabled:false},current):current;
}
