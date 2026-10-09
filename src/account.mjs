const SUBJECT=/^[A-Za-z0-9_-]{1,255}$/;
export function normalizeGoogleProfile(raw){
  if(!raw||typeof raw.sub!=='string'||!SUBJECT.test(raw.sub)||typeof raw.email!=='string'||raw.email_verified!==true)throw new Error('O Google não confirmou uma identidade válida com e-mail verificado.');
  return Object.freeze({sub:raw.sub,email:raw.email,name:typeof raw.name==='string'?raw.name.slice(0,80):raw.email.split('@')[0]});
}
export class AccountStorage{
  constructor(storage,subject){if(!SUBJECT.test(subject))throw new Error('Identificador de conta inválido.');this.base=storage;this.userId=subject;this.prefix=`foco:user:${subject}:`;}
  keys(){const keys=[];for(let i=0;i<this.base.length;i++){const k=this.base.key(i);if(k?.startsWith(this.prefix))keys.push(k.slice(this.prefix.length));}return keys;}
  get length(){return this.keys().length;}
  key(i){return this.keys()[i]??null;}
  getItem(k){return this.base.getItem(this.prefix+k);}
  setItem(k,v){this.base.setItem(this.prefix+k,v);}
  removeItem(k){this.base.removeItem(this.prefix+k);}
  ownsKey(k){return typeof k==='string'&&k.startsWith(this.prefix);}
}
export function parseFolder(value){
  const raw=String(value||'').trim();let id=raw;
  if(raw.includes('://')){let u;try{u=new URL(raw);}catch{throw new Error('Informe um link válido da pasta do Google Drive.');}if(u.protocol!=='https:'||u.hostname!=='drive.google.com')throw new Error('Use um link HTTPS de pasta do Google Drive.');const match=u.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)\/?$/);if(!match)throw new Error('O link deve apontar para uma pasta, não para um arquivo.');id=match[1];}
  if(!/^[\w-]{1,200}$/.test(id))throw new Error('Informe o ID ou link de uma pasta do Google Drive.');return id;
}
export function assertProgressOwner(document,subject){
  if(subject&&document?.owner?.subject!==subject)throw new Error('Este arquivo de progresso pertence a outra conta ou não possui identificação. Nenhum dado foi importado.');
  if(subject&&document.owner.provider!=='google')throw new Error('Identificação do arquivo de progresso inválida.');
}
