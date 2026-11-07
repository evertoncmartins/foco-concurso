import {icon} from './icons.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function bankUploadView({message='Enviando questões…',detail='Aguarde enquanto seu banco é preparado.',percent=10}={}){
  return `<main class="restore-page" id="main" tabindex="-1" aria-busy="true"><section class="restore-card" aria-labelledby="bank-upload-title"><div class="restore-symbol">${icon('upload',25)}<span class="restore-orbit" aria-hidden="true"></span></div><p class="restore-eyebrow">BANCO DE QUESTÕES</p><h1 id="bank-upload-title">Preparando seu banco.</h1><p class="restore-description">A tela será liberada quando o banco estiver pronto para estudar.</p><div class="restore-status" role="status" aria-live="polite"><span>${esc(message)}</span><strong>${percent}%</strong></div><div class="restore-track" role="progressbar" aria-label="Preparação do banco, andamento por etapas" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-valuetext="${esc(message)}"><span style="width:${percent}%"></span></div><p class="restore-detail">${esc(detail)}<span>Andamento por etapas</span></p></section></main>`;
}

export async function syncImportedBank(drive,{current=()=>true,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts=300}={}){
  for(let attempt=0;drive.busy&&attempt<attempts;attempt++){
    if(!current())return false;
    await sleep(100);
  }
  if(!current())return false;
  if(drive.busy)throw new Error('O Drive ainda está ocupado. Tente sincronizar novamente em instantes.');
  await drive.sync();
  if(!current())return false;
  if(drive.status!=='synced')throw new Error('O Drive ainda não confirmou o envio completo.');
  return true;
}

// The POST only confirms the repository commit. Wait for the exact public
// revision and the administration service before enabling study in this tab.
export async function waitForPublishedBank({catalog,id,revision,current=()=>true,inspect=async()=>true,onProgress=()=>{},sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts=60,interval=3000,maxWait=180000,now=Date.now}){
  if(!revision)throw new Error('O envio foi recebido, mas a versão publicada não foi confirmada. Sincronize o catálogo antes de reenviar.');
  const deadline=now()+maxWait;
  for(let attempt=0;attempt<attempts;attempt++){
    if(now()>=deadline)break;
    if(!current())return null;
    onProgress({percent:55,message:'Aguardando a publicação…',detail:'O envio foi recebido. Estamos conferindo a disponibilidade do banco.'});
    try{
      await catalog.check();if(!current())return null;
      const bank=(catalog.available?.banks||catalog.banks).find(b=>b.id===id&&b.revision===revision&&b.active!==false);
      if(bank){
        onProgress({percent:80,message:'Habilitando e sincronizando…',detail:'Conferindo o banco publicado para liberar novas sessões.'});
        const ready=await inspect();if(!current())return null;
        if(ready){catalog.apply(id);return bank;}
      }
    }catch(error){if(!current())return null;}
    if(attempt+1<attempts&&now()<deadline)await sleep(Math.min(interval,deadline-now()));
  }
  throw new Error('O banco foi enviado, mas a publicação ainda não ficou pronta. Use Sincronizar em instantes para conferir. Não é necessário reenviar o JSON.');
}
