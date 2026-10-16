import {preparePersonalBank,personalBankId} from './bank-source.mjs';
import {validateEvents,validateBank,canonicalJSON} from './engine.mjs';
import {assertProgressOwner} from './account.mjs';
import {GoogleAccount,prepareGoogle} from './auth.mjs';
import {contentDigest,coversEvents} from './event-conflicts.mjs';
export const DEFAULT_FOLDER='1BsRHtMhLBHVSpn7gqIZCjuE4JaGbitPV';
const API='https://www.googleapis.com/drive/v3';
// v2 exposes the file ETag in JSON. Use that resource's ETag for conditional
// updates, never the different ETag of an alt=media download.
const VERSIONED_API='https://www.googleapis.com/drive/v2';
const changed=()=>Object.assign(new Error('O progresso mudou em outro dispositivo. Tentando unir os históricos novamente…'),{retrySync:true});
const covers=coversEvents;
export class DriveSync extends EventTarget {
  constructor(store,config,account=null,settings=null) {super();this.store=store;this.storage=store.storage;this.userId=store.storage.userId||null;this.config=config;this.account=account;this.settings=settings;this.token=null;this.expires=0;this.status='local';this.busy=false;this.connecting=false;this.timer=null;this.lastSync=null;this.folder=null;this.closed=false;this.generation=0;}
  reportProgress(stage,completed=0,total=0){this.restoreProgress={stage,completed,total};this.dispatchEvent(new Event('progress'));}
  setStatus(status,message=''){this.status=status;this.message=message;this.dispatchEvent(new Event('status'));}
  async prepare(){
    if(this.account?.redirectEnabled)return;
    return prepareGoogle();
  }
  async connect(folderId){
    if(this.busy||this.connecting)throw new Error('Aguarde a conexão ou sincronização terminar.');
    const account=this.account||new GoogleAccount(this.config.clientId);
    const result=await account.authorize(true,{folderId});
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
    if(this.closed)throw new Error('A sessão foi encerrada.');
    const generation=this.generation,subject=this.account?.profile?.sub;
    const unchanged=()=>{
      if(this.closed||generation!==this.generation||this.account&&this.account.profile?.sub!==subject)throw new Error('A conexão com o Drive mudou. Os dados locais foram preservados.');
    };
    const access=async force=>{
      if(!this.account?.ensureAccess)return;
      const result=await this.account.ensureAccess({force});unchanged();
      if(this.userId&&result.profile.sub!==this.userId)throw new Error('A conta Google não corresponde ao perfil conectado.');
      if(!result.canDrive)throw Object.assign(new Error('Reconecte o Drive para autorizar seus arquivos. Seu progresso local foi preservado.'),{code:'AUTH_REAUTH_REQUIRED'});
      this.token=result.token;this.expires=result.expires;
    };
    try{
      if(!this.token)throw Object.assign(new Error('Reconecte o Google Drive. Seu progresso local está salvo.'),{code:'AUTH_REAUTH_REQUIRED'});
      await access(false);unchanged();
      if(Date.now()>=this.expires-10000)throw Object.assign(new Error('A autorização do Google expirou. O progresso local está salvo.'),{code:'AUTH_REAUTH_REQUIRED'});
      for(let attempt=0;attempt<2;attempt++){
        const token=this.token;
        const response=await fetch(url,{...options,cache:'no-store',signal:AbortSignal.timeout(30000),headers:{...options.headers,Authorization:`Bearer ${token}`}});unchanged();
        if(response.status===401&&attempt===0&&this.account?.ensureAccess){await access(this.account.token===token);continue;}
        if(!response.ok){const error=new Error(response.status===403?'Sem permissão no Drive ou cota excedida. Verifique a conta e a configuração OAuth.':`Google Drive: falha ${response.status}. O progresso local continua salvo.`);error.status=response.status;if(response.status===401)error.code='AUTH_REAUTH_REQUIRED';throw error;}
        return JSON.parse((await response.text()).replace(/^\uFEFF/,''));
      }
    }catch(error){if(error.code==='AUTH_REAUTH_REQUIRED'&&generation===this.generation&&!this.closed){this.token=null;this.setStatus('expired',error.message);}throw error;}
  }
  async list(query){
    const result=[];let pageToken;
    do {const params=new URLSearchParams({q:`'${this.config.folderId}' in parents and trashed = false and (${query})`,fields:'nextPageToken,incompleteSearch,files(id,name,size,mimeType,md5Checksum,modifiedTime,ownedByMe)',pageSize:'1000',spaces:'drive'});if(pageToken)params.set('pageToken',pageToken);const data=await this.request(`${API}/files?${params}`);if(data.incompleteSearch)throw new Error('O Drive retornou uma busca incompleta. Sincronização interrompida para preservar os dados.');result.push(...data.files);pageToken=data.nextPageToken;if(result.length>10000)throw new Error('Mais de 10.000 arquivos. Exporte e consolide o histórico antes de continuar.');}while(pageToken);
    return result;
  }
  cacheKey(){return `foco:drive:${this.config.folderId}`;}
  cache(){const raw=this.storage.getItem(this.cacheKey());return raw?JSON.parse(raw):{files:[],events:[],pending:null};}
  saveCache(cache){const value=JSON.stringify(cache);return this.storage.setLargeItem?this.storage.setLargeItem(this.cacheKey(),value):this.storage.setItem(this.cacheKey(),value);}
  progressPrefix(){return this.userId?`foco-progresso-${this.userId}-`:'foco-progresso-';}
  progressName(){return `${this.progressPrefix()}principal.json`;}
  async readFile(file){return this.request(`${API}/files/${encodeURIComponent(file.id)}?alt=media`);}
  async progressMetadata(id){
    const file=await this.request(`${VERSIONED_API}/files/${encodeURIComponent(id)}?fields=id,etag,title,fileSize,ownedByMe,labels(trashed),parents(id)`);
    if(file.labels?.trashed||!file.parents?.some(p=>p.id===this.config.folderId))throw changed();
    if(this.userId&&file.ownedByMe!==true)throw new Error('O arquivo de progresso não pertence à conta conectada.');
    if(typeof file.etag!=='string'||!file.etag)throw new Error('O Drive não forneceu a versão do arquivo. A gravação foi interrompida para preservar o histórico.');
    return file;
  }
  async readProgress(file,cache,{force=false}={}){
    const metadata=await this.progressMetadata(file.id),snapshot=cache.snapshots[file.id];
    this.store.load();const local=new Map(this.store.events.map(e=>[e.id,e]));let events;
    if(!force&&snapshot?.etag===metadata.etag&&Array.isArray(snapshot.events)&&snapshot.events.every(id=>local.has(id))&&snapshot.signature===await contentDigest(snapshot.events.map(id=>local.get(id)))){
      events=snapshot.events.map(id=>local.get(id));
    }else{
      const document=await this.readFile({...file,size:metadata.fileSize});
      assertProgressOwner(document,this.userId);events=validateEvents(document);
      // The metadata/content requests must describe the same file revision.
      if((await this.progressMetadata(file.id)).etag!==metadata.etag)throw changed();
    }
    if(!covers(this.store.events,events))await this.store.merge(events);
    cache.snapshots[file.id]={etag:metadata.etag,events:events.map(e=>e.id),signature:await contentDigest(events)};await this.saveCache(cache);
    return {id:file.id,name:metadata.title,etag:metadata.etag,events};
  }
  progressDocument(events){
    const document={schemaVersion:1,app:'foco-concursos',kind:'consolidated-progress',...(this.userId?{owner:{provider:'google',subject:this.userId}}:{}),updatedAt:new Date().toISOString(),events};
    validateEvents(document);
    return document;
  }
  async updateProgress(file,document){
    const boundary=`foco_${crypto.randomUUID()}`;
    const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({title:this.progressName(),mimeType:'application/json'})}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(document)}\r\n--${boundary}--`;
    await this.request(`https://www.googleapis.com/upload/drive/v2/files/${encodeURIComponent(file.id)}?uploadType=multipart&fields=id,etag`,{method:'PUT',headers:{'Content-Type':`multipart/related; boundary=${boundary}`,'If-Match':file.etag},body});
  }
  async trashProgress(file){
    // Reversible cleanup, conditional on the exact revision we merged.
    await this.request(`${VERSIONED_API}/files/${encodeURIComponent(file.id)}?fields=id`,{method:'PATCH',headers:{'Content-Type':'application/json','If-Match':file.etag},body:JSON.stringify({labels:{trashed:true}})});
  }
  async consolidate(cache){
    const files=(await this.list(`name contains '${this.progressPrefix()}' and mimeType = 'application/json'`)).filter(f=>f.name.startsWith(this.progressPrefix())&&(!this.userId||f.ownedByMe===true));
    files.sort((a,b)=>Number(b.name===this.progressName())-Number(a.name===this.progressName())||(a.id<b.id?-1:a.id>b.id?1:0));
    const sources=[];this.reportProgress('history',0,files.length);
    for(const file of files){sources.push(await this.readProgress(file,cache));this.reportProgress('history',sources.length,files.length);}
    this.reportProgress('upload');this.store.load();const events=this.store.events;
    let principal=sources[0],wrote=false;
    if(!principal){
      if(!cache.pending){
        const ids=await this.request(`${API}/files/generateIds?count=1&space=drive&type=files`);
        if(typeof ids.ids?.[0]!=='string')throw new Error('O Drive não forneceu um ID para o progresso.');
        cache.pending={id:ids.ids[0],name:this.progressName(),document:this.progressDocument(events)};await this.saveCache(cache);
      }
      await this.upload(cache.pending);principal=await this.readProgress(cache.pending,cache,{force:true});
      if(!covers(principal.events,cache.pending.document.events))throw changed();
      cache.pending=null;await this.saveCache(cache);wrote=true;
      // Include actions made while the initial upload was in flight.
      if(!covers(principal.events,this.store.load()))throw changed();
    }else if(principal.name!==this.progressName()||!covers(principal.events,events)){
      await this.updateProgress(principal,this.progressDocument(events));wrote=true;
      principal=await this.readProgress(principal,cache,{force:true});
      if(!covers(principal.events,events))throw changed();
    }
    if(cache.pending){cache.pending=null;await this.saveCache(cache);}
    for(const source of sources.slice(1)){
      if(!covers(principal.events,source.events))throw changed();
      // Check the target is still the verified live file before cleanup.
      if((await this.progressMetadata(principal.id)).etag!==principal.etag)throw changed();
      await this.trashProgress(source);delete cache.snapshots[source.id];await this.saveCache(cache);
    }
    // Reconcile simultaneous first creation or an older client writing a journal.
    if(wrote||sources.length>1){
      const remaining=(await this.list(`name contains '${this.progressPrefix()}' and mimeType = 'application/json'`)).filter(f=>f.name.startsWith(this.progressPrefix())&&(!this.userId||f.ownedByMe===true));
      if(remaining.length!==1||remaining[0].id!==principal.id)throw changed();
    }
    cache.snapshots={[principal.id]:{etag:principal.etag,events:principal.events.map(e=>e.id),signature:await contentDigest(principal.events)}};await this.saveCache(cache);
    return principal;
  }
  schedule(){if(!this.token||this.connecting)return;clearTimeout(this.timer);this.setStatus('pending','Alterações locais aguardando envio.');this.timer=setTimeout(()=>this.sync().catch(()=>{}),6000);}
  async sync({duringConnect=false}={}){
    if(this.connecting&&!duringConnect)throw new Error('Aguarde a conexão da pasta terminar.');
    if(this.busy)return;this.busy=true;this.setStatus('syncing','Unindo os históricos do Drive e deste dispositivo…');
    try{
      this.reportProgress('history',0,1);
      await this.storage.refresh?.();
      const previous=this.cache();
      // Recover a pending journal from the older implementation before retiring it.
      if(previous.pending){assertProgressOwner(previous.pending.document,this.userId);await this.store.merge(validateEvents(previous.pending.document));}
      const cache={schemaVersion:2,snapshots:previous.schemaVersion===2?previous.snapshots||{}:{},pending:previous.pending?.name===this.progressName()?previous.pending:null};
      await this.saveCache(cache);let principal;
      for(let attempt=0;attempt<6;attempt++){
        try{principal=await this.consolidate(cache);break;}
        catch(e){if(!e.retrySync&&e.status!==412&&e.status!==404)throw e;if(attempt===5)throw new Error('O histórico está sendo alterado em outro dispositivo. Os dados locais e os arquivos ainda não consolidados foram preservados. Tente sincronizar novamente.');}
      }
      this.lastSync=new Date().toISOString();this.storage.setItem('foco:lastSync',this.lastSync);
      const remaining=!covers(principal.events,this.store.load());this.setStatus(remaining?'pending':'synced',remaining?'Há alterações novas aguardando envio.':'Progresso sincronizado em um único arquivo no Google Drive.');if(remaining)this.schedule();
    }catch(e){this.setStatus(this.token?'error':'expired',e.message);throw e;}finally{this.busy=false;}
  }
  async upload(batch){
    const boundary=`foco_${crypto.randomUUID()}`;
    const metadata={id:batch.id,name:batch.name,mimeType:'application/json',parents:[this.config.folderId],appProperties:{app:'foco-concursos',kind:'progress',schema:'1'}};
    const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(batch.document)}\r\n--${boundary}--`;
    try{await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});}
    catch(e){if(e.status!==409)throw e;const existing=await this.readFile({id:batch.id});if(canonicalJSON(existing)!==canonicalJSON(batch.document))throw new Error('Conflito no arquivo remoto. O lote local foi preservado.');}
  }
  async bankFiles(){return (await this.list("mimeType = 'application/json' or name contains '.json'" )).filter(f=>!f.name.startsWith('foco-progresso-'));}
  async importNewBanks(){
    this.reportProgress('banks',0,1);
    const files=await this.bankFiles();let imported=0,skipped=0,processed=0;this.reportProgress('banks',0,files.length);
    for(const file of files){try{const bank=preparePersonalBank(validateBank(await this.readFile(file)));const existing=this.store.model().banks.find(b=>b.id===bank.id);if(existing){skipped++;continue;}const hadBank=this.store.events.some(e=>e.type==='bank'&&personalBankId(e.bank.id)===bank.id);if(hadBank){skipped++;continue;}await this.store.add([{type:'bank',bank},{type:'bank-state',bankId:bank.id,value:'enabled'}]);imported++;}catch(e){if(e.status||this.closed||!this.token)throw e;skipped++;}finally{this.reportProgress('banks',++processed,files.length);}}
    if(imported)await this.sync({duringConnect:this.connecting});this.bankImportSummary={imported,skipped};return this.bankImportSummary;
  }
}
