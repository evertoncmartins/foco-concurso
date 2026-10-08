import {validateEvents} from './engine.mjs';
export const DEFAULT_FOLDER='1BsRHtMhLBHVSpn7gqIZCjuE4JaGbitPV';
const API='https://www.googleapis.com/drive/v3';
const SCOPE='https://www.googleapis.com/auth/drive';
export class DriveSync extends EventTarget {
  constructor(store,config) {super();this.store=store;this.config=config;this.token=null;this.expires=0;this.status='local';this.busy=false;this.timer=null;this.lastSync=null;this.folder=null;}
  setStatus(status,message=''){this.status=status;this.message=message;this.dispatchEvent(new Event('status'));}
  async prepare(){
    if(globalThis.google?.accounts?.oauth2) return;
    if(this.loading)return this.loading;
    this.loading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.onload=resolve;script.onerror=()=>reject(new Error('Não foi possível carregar o login Google. Verifique sua conexão.'));document.head.append(script);});
    try{await this.loading;}catch(e){this.loading=null;throw e;}
  }
  async connect(){
    if(!this.config.clientId?.match(/^[\w-]+\.apps\.googleusercontent\.com$/))throw new Error('Configure primeiro o ID público do cliente OAuth do Google.');
    await this.prepare();
    await new Promise((resolve,reject)=>{
      const client=google.accounts.oauth2.initTokenClient({client_id:this.config.clientId,scope:SCOPE,callback:r=>{
        if(r.error || !r.access_token)return reject(new Error('Autorização do Google não concluída.'));
        if(!google.accounts.oauth2.hasGrantedAllScopes(r,SCOPE))return reject(new Error('O acesso ao Drive não foi autorizado.'));
        this.token=r.access_token;this.expires=Date.now()+Number(r.expires_in)*1000;resolve();
      },error_callback:()=>reject(new Error('Login cancelado ou janela bloqueada. Tente novamente.'))});
      client.requestAccessToken({prompt:'select_account'});
    });
    this.folder=await this.request(`${API}/files/${encodeURIComponent(this.config.folderId)}?fields=id,name,mimeType,capabilities(canAddChildren)`);
    if(this.folder.mimeType!=='application/vnd.google-apps.folder'||!this.folder.capabilities?.canAddChildren){this.disconnect();throw new Error('Escolha a conta proprietária da pasta ou uma conta com permissão para adicionar arquivos.');}
    await this.sync();
  }
  disconnect(){this.token=null;this.expires=0;this.folder=null;clearTimeout(this.timer);this.setStatus('local','Drive desconectado. O progresso continua salvo neste dispositivo.');}
  async request(url,options={}) {
    if(!this.token||Date.now()>=this.expires-10000){this.token=null;this.setStatus('expired','Entre novamente no Google para sincronizar.');throw new Error('A autorização do Google expirou. O progresso local está salvo.');}
    const response=await fetch(url,{...options,signal:AbortSignal.timeout(30000),headers:{...options.headers,Authorization:`Bearer ${this.token}`}});
    if(!response.ok){if(response.status===401){this.token=null;this.setStatus('expired');}const error=new Error(response.status===403?'Sem permissão no Drive ou cota excedida. Verifique a conta e a configuração OAuth.':`Google Drive: falha ${response.status}. O progresso local continua salvo.`);error.status=response.status;throw error;}
    const contentType=response.headers.get('content-type');if(contentType?.includes('application/json'))return response.json();return JSON.parse(await response.text());
  }
  async list(query){
    const result=[];let pageToken;
    do {const params=new URLSearchParams({q:`'${this.config.folderId}' in parents and trashed = false and (${query})`,fields:'nextPageToken,incompleteSearch,files(id,name,size,mimeType)',pageSize:'1000',spaces:'drive'});if(pageToken)params.set('pageToken',pageToken);const data=await this.request(`${API}/files?${params}`);if(data.incompleteSearch)throw new Error('O Drive retornou uma busca incompleta. Sincronização interrompida para preservar os dados.');result.push(...data.files);pageToken=data.nextPageToken;if(result.length>10000)throw new Error('Mais de 10.000 arquivos. Exporte e consolide o histórico antes de continuar.');}while(pageToken);
    return result;
  }
  cacheKey(){return `foco:drive:${this.config.folderId}`;}
  cache(){const raw=localStorage.getItem(this.cacheKey());return raw?JSON.parse(raw):{files:[],events:[],pending:null};}
  saveCache(cache){localStorage.setItem(this.cacheKey(),JSON.stringify(cache));}
  async readFile(file){if(Number(file.size)>10*1024*1024)throw new Error(`${file.name}: arquivo maior que 10 MB.`);return this.request(`${API}/files/${encodeURIComponent(file.id)}?alt=media`);}
  schedule(){if(!this.token)return;clearTimeout(this.timer);this.setStatus('pending','Alterações locais aguardando envio.');this.timer=setTimeout(()=>this.sync().catch(()=>{}),6000);}
  async sync(){
    if(this.busy)return;this.busy=true;this.setStatus('syncing','Unindo os históricos do Drive e deste dispositivo…');
    try{
      const cache=this.cache(), files=await this.list("name contains 'foco-progresso-' and mimeType = 'application/json'");
      // Append-only JSON journals: concurrent devices create independent files.
      // No existing progress file is ever overwritten or deleted.
      for(const file of files){if(cache.files.includes(file.id))continue;const document=await this.readFile(file);const events=validateEvents(document);await this.store.merge(events);cache.files.push(file.id);cache.events=[...new Set([...cache.events,...events.map(e=>e.id)])];this.saveCache(cache);}
      if(cache.pending){await this.upload(cache.pending);cache.files.push(cache.pending.id);cache.events=[...new Set([...cache.events,...cache.pending.document.events.map(e=>e.id)])];cache.pending=null;this.saveCache(cache);}
      const sent=new Set(cache.events), events=this.store.events.filter(e=>!sent.has(e.id));
      if(events.length||(files.length===0&&cache.files.length===0)){
        const ids=await this.request(`${API}/files/generateIds?count=1&space=drive&type=files`);
        cache.pending={id:ids.ids[0],name:`foco-progresso-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID().slice(0,8)}.json`,document:{schemaVersion:1,app:'foco-concursos',createdAt:new Date().toISOString(),events}};
        if(JSON.stringify(cache.pending.document).length>10*1024*1024)throw new Error('Lote maior que 10 MB. Exporte seu progresso antes de reorganizar os bancos.');
        this.saveCache(cache);await this.upload(cache.pending);cache.files.push(cache.pending.id);cache.events=[...new Set([...cache.events,...events.map(e=>e.id)])];cache.pending=null;this.saveCache(cache);
      }
      this.lastSync=new Date().toISOString();localStorage.setItem('foco:lastSync',this.lastSync);
      const known=new Set(cache.events);const remaining=this.store.events.some(e=>!known.has(e.id));this.setStatus(remaining?'pending':'synced',remaining?'Há alterações novas aguardando envio.':'Progresso sincronizado com o Google Drive.');if(remaining)this.schedule();
    }catch(e){this.setStatus(this.token?'error':'expired',e.message);throw e;}finally{this.busy=false;}
  }
  async upload(batch){
    const boundary=`foco_${crypto.randomUUID()}`;
    const metadata={id:batch.id,name:batch.name,mimeType:'application/json',parents:[this.config.folderId],appProperties:{app:'foco-concursos',kind:'progress',schema:'1'}};
    const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(batch.document)}\r\n--${boundary}--`;
    try{await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});}
    catch(e){if(e.status!==409)throw e;const existing=await this.readFile({id:batch.id});if(JSON.stringify(existing)!==JSON.stringify(batch.document))throw new Error('Conflito no arquivo remoto. O lote local foi preservado.');}
  }
  async bankFiles(){return (await this.list("mimeType = 'application/json' or name contains '.json'" )).filter(f=>!f.name.startsWith('foco-progresso-'));}
}
