import {validateEvents,validateBank} from './engine.mjs';
import {assertProgressOwner} from './account.mjs';
import {GoogleAccount,prepareGoogle} from './auth.mjs';
export const DEFAULT_FOLDER='1BsRHtMhLBHVSpn7gqIZCjuE4JaGbitPV';
const API='https://www.googleapis.com/drive/v3';
export class DriveSync extends EventTarget {
  constructor(store,config,account=null,settings=null) {super();this.store=store;this.storage=store.storage;this.userId=store.storage.userId||null;this.config=config;this.account=account;this.settings=settings;this.token=null;this.expires=0;this.status='local';this.busy=false;this.connecting=false;this.timer=null;this.lastSync=null;this.folder=null;this.closed=false;this.generation=0;}
  reportProgress(stage,completed=0,total=0){this.restoreProgress={stage,completed,total};this.dispatchEvent(new Event('progress'));}
  setStatus(status,message=''){this.status=status;this.message=message;this.dispatchEvent(new Event('status'));}
  async prepare(){
    return prepareGoogle();
  }
  async connect(folderId){
    if(this.busy||this.connecting)throw new Error('Aguarde a conexão ou sincronização terminar.');
    const account=this.account||new GoogleAccount(this.config.clientId);
    const result=await account.authorize(true);
    if(this.userId&&result.profile.sub!==this.userId)throw new Error('A conta Google não corresponde ao perfil conectado.');
    await this.useAuthorization(result,folderId?{folderId}:{});
  }
  async useAuthorization(result,{folderId}={}){
    if(this.closed)throw new Error('A sessão foi encerrada.');
    if(this.userId&&result.profile?.sub!==this.userId)throw new Error('A conta Google não corresponde ao perfil conectado.');
    if(this.busy||this.connecting)throw new Error('Aguarde a conexão ou sincronização terminar.');
    this.connecting=true;clearTimeout(this.timer);this.reportProgress('folder');
    try{
    if(this.settings&&!folderId){const saved=await this.settings.restore();if(saved)this.setFolder(saved.folderId);}
    const selected=folderId||this.config.folderId;
    if(!selected)throw new Error('Informe sua pasta do Google Drive primeiro.');
    this.token=result.token;this.expires=result.expires;
    this.reportProgress('access');
    this.folder=await this.request(`${API}/files/${encodeURIComponent(selected)}?fields=id,name,mimeType,driveId,capabilities(canAddChildren)`);
    if(this.folder.mimeType!=='application/vnd.google-apps.folder'||!this.folder.capabilities?.canAddChildren){this.disconnect();throw new Error('Escolha a conta proprietária da pasta ou uma conta com permissão para adicionar arquivos.');}
    if(this.folder.driveId){this.disconnect();throw new Error('Escolha uma pasta do seu Meu Drive. Drives compartilhados institucionais ainda não são suportados.');}
    if(this.settings)await this.settings.save(selected,{explicit:!!folderId});
    this.setFolder(selected);
    await this.sync({duringConnect:true});
    return await this.importNewBanks();
    }catch(e){this.disconnect();this.setStatus('error',e.message);throw e;}finally{this.connecting=false;if(this.status==='pending')this.schedule();}
  }
  setFolder(folderId){this.config.folderId=folderId;this.dispatchEvent(new Event('config'));}
  disconnect(){this.generation++;this.token=null;this.expires=0;this.folder=null;clearTimeout(this.timer);this.setStatus('local','Drive desconectado. O progresso continua salvo neste dispositivo.');}
  close(){this.closed=true;this.settings?.close();this.disconnect();}
  async request(url,options={}) {
    if(!this.token||Date.now()>=this.expires-10000){this.token=null;this.setStatus('expired','Entre novamente no Google para sincronizar.');throw new Error('A autorização do Google expirou. O progresso local está salvo.');}
    if(this.closed)throw new Error('A sessão foi encerrada.');
    const generation=this.generation;
    const response=await fetch(url,{...options,signal:AbortSignal.timeout(30000),headers:{...options.headers,Authorization:`Bearer ${this.token}`}});
    if(this.closed)throw new Error('A sessão foi encerrada.');
    if(generation!==this.generation)throw new Error('A conexão com o Drive mudou. Os dados locais foram preservados.');
    if(!response.ok){if(response.status===401){this.token=null;this.setStatus('expired');}const error=new Error(response.status===403?'Sem permissão no Drive ou cota excedida. Verifique a conta e a configuração OAuth.':`Google Drive: falha ${response.status}. O progresso local continua salvo.`);error.status=response.status;throw error;}
    const contentType=response.headers.get('content-type');if(contentType?.includes('application/json'))return response.json();return JSON.parse(await response.text());
  }
  async list(query){
    const result=[];let pageToken;
    do {const params=new URLSearchParams({q:`'${this.config.folderId}' in parents and trashed = false and (${query})`,fields:'nextPageToken,incompleteSearch,files(id,name,size,mimeType,md5Checksum,modifiedTime,ownedByMe)',pageSize:'1000',spaces:'drive'});if(pageToken)params.set('pageToken',pageToken);const data=await this.request(`${API}/files?${params}`);if(data.incompleteSearch)throw new Error('O Drive retornou uma busca incompleta. Sincronização interrompida para preservar os dados.');result.push(...data.files);pageToken=data.nextPageToken;if(result.length>10000)throw new Error('Mais de 10.000 arquivos. Exporte e consolide o histórico antes de continuar.');}while(pageToken);
    return result;
  }
  cacheKey(){return `foco:drive:${this.config.folderId}`;}
  cache(){const raw=this.storage.getItem(this.cacheKey());return raw?JSON.parse(raw):{files:[],events:[],pending:null};}
  saveCache(cache){this.storage.setItem(this.cacheKey(),JSON.stringify(cache));}
  progressPrefix(){return this.userId?`foco-progresso-${this.userId}-`:'foco-progresso-';}
  async readFile(file){if(Number(file.size)>10*1024*1024)throw new Error(`${file.name}: arquivo maior que 10 MB.`);return this.request(`${API}/files/${encodeURIComponent(file.id)}?alt=media`);}
  schedule(){if(!this.token||this.connecting)return;clearTimeout(this.timer);this.setStatus('pending','Alterações locais aguardando envio.');this.timer=setTimeout(()=>this.sync().catch(()=>{}),6000);}
  async sync({duringConnect=false}={}){
    if(this.connecting&&!duringConnect)throw new Error('Aguarde a conexão da pasta terminar.');
    if(this.busy)return;this.busy=true;this.setStatus('syncing','Unindo os históricos do Drive e deste dispositivo…');
    try{
      this.reportProgress('history',0,1);
      const cache=this.cache(), files=(await this.list(`name contains '${this.progressPrefix()}' and mimeType = 'application/json'`)).filter(f=>f.name.startsWith(this.progressPrefix())&&(!this.userId||f.ownedByMe===true));
      // Append-only JSON journals: concurrent devices create independent files.
      // No existing progress file is ever overwritten or deleted.
      const unread=files.filter(file=>!cache.files.includes(file.id));let restored=0;this.reportProgress('history',0,unread.length);
      for(const file of unread){const document=await this.readFile(file);assertProgressOwner(document,this.userId);const events=validateEvents(document);await this.store.merge(events);cache.files.push(file.id);cache.events=[...new Set([...cache.events,...events.map(e=>e.id)])];this.saveCache(cache);this.reportProgress('history',++restored,unread.length);}
      this.reportProgress('upload');
      if(cache.pending){await this.upload(cache.pending);cache.files.push(cache.pending.id);cache.events=[...new Set([...cache.events,...cache.pending.document.events.map(e=>e.id)])];cache.pending=null;this.saveCache(cache);}
      const sent=new Set(cache.events), events=this.store.events.filter(e=>!sent.has(e.id));
      if(events.length||(files.length===0&&cache.files.length===0)){
        const ids=await this.request(`${API}/files/generateIds?count=1&space=drive&type=files`);
        cache.pending={id:ids.ids[0],name:`${this.progressPrefix()}${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID().slice(0,8)}.json`,document:{schemaVersion:1,app:'foco-concursos',...(this.userId?{owner:{provider:'google',subject:this.userId}}:{}),createdAt:new Date().toISOString(),events}};
        if(JSON.stringify(cache.pending.document).length>10*1024*1024)throw new Error('Lote maior que 10 MB. Exporte seu progresso antes de reorganizar os bancos.');
        this.saveCache(cache);await this.upload(cache.pending);cache.files.push(cache.pending.id);cache.events=[...new Set([...cache.events,...events.map(e=>e.id)])];cache.pending=null;this.saveCache(cache);
      }
      this.lastSync=new Date().toISOString();this.storage.setItem('foco:lastSync',this.lastSync);
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
  async importNewBanks(){
    this.reportProgress('banks',0,1);
    const files=await this.bankFiles();let imported=0,skipped=0,processed=0;this.reportProgress('banks',0,files.length);
    for(const file of files){try{const bank=validateBank(await this.readFile(file));const existing=this.store.model().banks.find(b=>b.id===bank.id);if(existing){skipped++;continue;}const hadBank=this.store.events.some(e=>e.type==='bank'&&e.bank.id===bank.id);if(hadBank){skipped++;continue;}await this.store.add([{type:'bank',bank},{type:'bank-state',bankId:bank.id,value:'enabled'}]);imported++;}catch(e){if(e.status||this.closed||!this.token)throw e;skipped++;}finally{this.reportProgress('banks',++processed,files.length);}}
    if(imported)await this.sync({duringConnect:this.connecting});this.bankImportSummary={imported,skipped};return this.bankImportSummary;
  }
}
