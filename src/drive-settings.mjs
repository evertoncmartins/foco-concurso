import {parseFolder,assertProgressOwner} from './account.mjs';

const API='https://www.googleapis.com/drive/v3';
const FILE_NAME='foco-configuracao.json';
const PENDING_KEY='foco:folder-settings:pending';
const CONFLICT='A pasta foi alterada em outro dispositivo. A escolha anterior foi preservada. Salve a pasta novamente em Ajustes para confirmar sua escolha.';

function validate(document,subject){
  assertProgressOwner(document,subject);
  if(document?.schemaVersion!==1||document.app!=='foco-concursos'||document.kind!=='folder-settings'||!Number.isSafeInteger(document.revision)||document.revision<1||typeof document.changeId!=='string'||!document.changeId||typeof document.folderId!=='string'||parseFolder(document.folderId)!==document.folderId)throw new Error('Configuração privada inválida. Nenhuma pasta foi substituída.');
  return document;
}
function compare(a,b){
  return a.document.revision-b.document.revision||String(a.modifiedTime).localeCompare(String(b.modifiedTime))||a.id.localeCompare(b.id);
}

// Immutable configuration snapshots prevent simultaneous devices from overwriting
// each other. Revisions use the remote state, never the device's clock.
export class DriveSettings extends EventTarget{
  constructor(storage,account){super();this.storage=storage;this.subject=storage.userId;this.account=account;this.closed=false;this.status='local';this.message='A pasta ainda não foi salva na sua conta Google.';this.latest=null;}
  setStatus(status,message){this.status=status;this.message=message;this.dispatchEvent(new Event('status'));}
  close(){this.closed=true;}
  pending(){const raw=this.storage.getItem(PENDING_KEY);if(!raw)return null;const batch=JSON.parse(raw);validate(batch.document,this.subject);if(typeof batch.id!=='string'||!batch.id||!(batch.baseId===null||typeof batch.baseId==='string'))throw new Error('Configuração pendente inválida.');return batch;}
  async request(url,options={}){
    const account=this.account,generation=account.generation,token=account.token;
    if(this.closed||account.profile?.sub!==this.subject)throw new Error('A sessão da configuração foi encerrada.');
    if(!account.canAppData)throw new Error('Autorize a configuração privada do Drive para recuperar sua pasta automaticamente.');
    if(!token||Date.now()>=account.expires-10000)throw new Error('Entre novamente com Google para sincronizar a configuração da pasta.');
    const response=await fetch(url,{...options,cache:'no-store',signal:AbortSignal.timeout(30000),headers:{...options.headers,Authorization:`Bearer ${token}`}});
    if(this.closed||account.generation!==generation||account.token!==token||account.profile?.sub!==this.subject)throw new Error('A conta conectada mudou. A configuração local foi preservada.');
    if(!response.ok){const e=new Error(response.status===403?'O Google não permitiu acessar a configuração privada. Autorize novamente e confira o escopo drive.appdata.':`Configuração da pasta: falha ${response.status}. Sua escolha local foi preservada.`);e.status=response.status;throw e;}
    return response.json();
  }
  async readLatest(){
    let pageToken;const files=[];
    do{
      const params=new URLSearchParams({spaces:'appDataFolder',q:`name = '${FILE_NAME}' and mimeType = 'application/json'`,fields:'nextPageToken,incompleteSearch,files(id,size,modifiedTime,ownedByMe)',pageSize:'1000'});
      if(pageToken)params.set('pageToken',pageToken);
      const data=await this.request(`${API}/files?${params}`);
      if(data.incompleteSearch||!Array.isArray(data.files))throw new Error('Busca de configuração incompleta. Nenhuma pasta foi substituída.');
      files.push(...data.files);pageToken=data.nextPageToken;
      if(files.length>10000)throw new Error('Limite de configurações excedido. A pasta local foi preservada.');
    }while(pageToken);
    let latest=null;
    for(const file of files){
      if(file.ownedByMe!==true)throw new Error('A configuração privada não pertence à conta conectada.');
      if(Number(file.size)>65536)throw new Error('Configuração privada maior que o limite de 64 KB.');
      const document=validate(await this.request(`${API}/files/${encodeURIComponent(file.id)}?alt=media`),this.subject);
      const candidate={id:file.id,modifiedTime:file.modifiedTime||'',document};
      if(!latest||compare(candidate,latest)>0)latest=candidate;
    }
    this.latest=latest;return latest;
  }
  async restore(){
    this.setStatus('loading','Recuperando a pasta da sua conta Google…');
    try{
      const latest=await this.readLatest(),pending=this.pending();
      if(pending){
        if(latest?.id===pending.id){if(JSON.stringify(latest.document)!==JSON.stringify(pending.document))throw new Error(CONFLICT);this.storage.removeItem(PENDING_KEY);}
        else{
          if((latest?.id||null)!==pending.baseId)throw new Error(CONFLICT);
          this.setStatus('pending','A escolha da pasta aguarda confirmação de envio. Autorize sua pasta para concluir.');return pending.document;
        }
      }
      this.setStatus(latest?'saved':'local',latest?'Pasta salva na sua conta Google. Ela será recuperada em outros dispositivos.':'Escolha e conecte sua pasta para salvá-la na conta Google.');
      return latest?.document||null;
    }catch(e){this.setStatus('error',e.message);throw e;}
  }
  async save(folderId,{explicit=false}={}){
    folderId=parseFolder(folderId);this.setStatus('pending','Salvando a pasta na sua conta Google…');
    try{
      const latest=await this.readLatest();let batch=this.pending();
      if(batch&&latest?.id===batch.id){if(JSON.stringify(latest.document)!==JSON.stringify(batch.document))throw new Error(CONFLICT);this.storage.removeItem(PENDING_KEY);batch=null;}
      if(batch&&(batch.document.folderId!==folderId||(latest?.id||null)!==batch.baseId)){
        if(!explicit)throw new Error(CONFLICT);
        batch=null;
      }
      if(!batch&&latest?.document.folderId===folderId){this.storage.removeItem(PENDING_KEY);this.setStatus('saved','Pasta salva na sua conta Google. Ela será recuperada em outros dispositivos.');return latest.document;}
      if(!batch){
        const ids=await this.request(`${API}/files/generateIds?count=1&space=appDataFolder&type=files`);
        if(typeof ids.ids?.[0]!=='string')throw new Error('O Drive não forneceu um ID para a configuração.');
        batch={id:ids.ids[0],baseId:latest?.id||null,document:{schemaVersion:1,app:'foco-concursos',kind:'folder-settings',owner:{provider:'google',subject:this.subject},revision:(latest?.document.revision||0)+1,changeId:crypto.randomUUID(),folderId}};
        this.storage.setItem(PENDING_KEY,JSON.stringify(batch));
      }
      const boundary=`foco_config_${crypto.randomUUID()}`;
      const metadata={id:batch.id,name:FILE_NAME,mimeType:'application/json',parents:['appDataFolder']};
      const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(batch.document)}\r\n--${boundary}--`;
      try{await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});}
      catch(e){if(e.status!==409)throw e;const existing=await this.request(`${API}/files/${encodeURIComponent(batch.id)}?alt=media`);if(JSON.stringify(existing)!==JSON.stringify(batch.document))throw new Error(CONFLICT);}
      const confirmed=await this.readLatest();
      if(confirmed?.id!==batch.id)throw new Error(CONFLICT);
      this.storage.removeItem(PENDING_KEY);this.setStatus('saved','Pasta salva na sua conta Google. Ela será recuperada em outros dispositivos.');return batch.document;
    }catch(e){this.setStatus('error',e.message);throw e;}
  }
}
