import {canonicalJSON,mergeEvents,validateEvents} from './engine.mjs';

export async function contentDigest(value){
  const bytes=new TextEncoder().encode(canonicalJSON(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function recoveryRecord(event){
  return {id:`foco-conflict-${await contentDigest(event)}`,at:event.at,type:'event-conflict',originalId:event.id,event};
}

// Recover valid collisions without counting the same answer twice. The originals
// remain in the exported/synchronized log; derive() ignores recovery records.
// Content-derived IDs make repeated imports and different merge orders converge.
export async function reconcileEvents(...collections){
  const events=collections.flatMap(events=>validateEvents({schemaVersion:1,events}));
  const groups=new Map(),recoveries=new Map();
  const include=event=>{
    if(!groups.has(event.id))groups.set(event.id,new Map());
    groups.get(event.id).set(canonicalJSON(event),event);
  };
  for(const event of events){
    if(event.type==='event-conflict'){
      const verified=await recoveryRecord(event.event);
      if(event.id!==verified.id)throw new Error('Registro de recuperação inválido.');
      recoveries.set(verified.id,verified);include(verified.event);
    }else include(event);
  }
  const active=[];
  for(const versions of groups.values()){
    const candidates=[...versions].sort(([a,first],[b,second])=>first.at<second.at?-1:first.at>second.at?1:a<b?-1:a>b?1:0);
    // Answers are immutable attempts: retain the first recorded answer. Mutable
    // bank/state/session records retain the most recent version. Ties use content.
    const firstAnswer=candidates.every(([,event])=>event.type==='answer');
    const deleted=candidates.filter(([,event])=>event.type==='session'&&event.session.deleted===true);
    active.push((deleted.at(-1)||candidates[firstAnswer?0:candidates.length-1])[1]);
    if(candidates.length>1)for(const [,event] of candidates){
      const record=await recoveryRecord(event);recoveries.set(record.id,record);
    }
  }
  const result=mergeEvents(active,[...recoveries.values()]);
  // Recovery must obey the same bounds as every other progress document.
  validateEvents({schemaVersion:1,events:result});
  return result;
}

export function coversEvents(whole,part){
  const signatures=new Map();
  const include=event=>{
    if(!signatures.has(event.id))signatures.set(event.id,new Set());
    signatures.get(event.id).add(canonicalJSON(event));
  };
  for(const event of whole){include(event);if(event.type==='event-conflict')include(event.event);}
  return part.every(event=>signatures.get(event.id)?.has(canonicalJSON(event)));
}
