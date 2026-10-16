const documents={'privacidade.html':'Política de Privacidade','termos.html':'Termos de Serviço','formato-json.html':'Formato dos bancos JSON'};
const historyKey='focoDocument';

// Keep the live application in memory while reading a public document. Returning
// never exchanges Google credentials or infers a login from an old cookie.
export class PublicDocuments{
  constructor({document=globalThis.document,window=globalThis.window,canOpen=()=>true,getContext=()=>null,onReturn=()=>{}}={}){
    this.document=document;this.window=window;this.canOpen=canOpen;this.getContext=getContext;this.onReturn=onReturn;this.dialog=null;this.frame=null;
    this.historyId=`${Date.now()}-${Math.random()}`;this.entries=new Map();this.sequence=0;this.entry=null;this.returning=null;
    document.addEventListener('click',event=>{
      const link=event.target.closest('a[data-foco-document]');
      if(!link||event.defaultPrevented||event.button>0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      const target=this.target(link.href);if(!target)return;
      event.preventDefault();if(this.canOpen())this.open(target.url,target.title);
    });
    window.addEventListener('message',event=>{
      if(!this.frame||event.source!==this.frame.contentWindow||event.origin!==window.location.origin)return;
      if(event.data?.type==='foco:document:return')void this.close();
      else if(event.data?.type==='foco:document:open'){
        const target=this.target(event.data.url);if(target&&this.canOpen())this.open(target.url,target.title);
      }
    });
    window.addEventListener('popstate',event=>{void this.restore(event.state);});
  }
  target(value){
    if(typeof value!=='string')return null;
    try{
      const url=new URL(value,this.window.location.href),name=Object.keys(documents).find(name=>url.href.split('#')[0]===new URL(`./${name}`,this.window.location.href).href);
      return name?{url:url.href,title:documents[name]}:null;
    }catch{return null;}
  }
  open(url,title){
    if(this.returning)return;
    const entry={id:++this.sequence,url,title,depth:(this.entry?.depth||0)+1,context:this.entry?.context??this.getContext(),returnFocus:this.entry?.returnFocus??this.document.activeElement};
    // Only opaque document IDs enter browser history; the account and live
    // screen stay in memory. The original URL and its existing state survive.
    this.window.history.pushState({...this.window.history.state,[historyKey]:{owner:this.historyId,id:entry.id}},'',this.window.location.href);
    this.entries.set(entry.id,entry);this.show(entry);
  }
  show(entry){
    this.entry=entry;this.context=entry.context;this.returnFocus=entry.returnFocus;
    if(this.dialog){
      this.dialog.setAttribute('aria-label',entry.title);this.frame.title=entry.title;
      // Child navigations must not add untracked steps to joint session history.
      this.frame.contentWindow.location.replace(entry.url);return;
    }
    const dialog=this.document.createElement('dialog'),frame=this.document.createElement('iframe');
    dialog.className='public-document-dialog';dialog.setAttribute('aria-label',entry.title);
    frame.src=entry.url;frame.title=entry.title;frame.setAttribute('referrerpolicy','same-origin');
    dialog.append(frame);this.document.body.append(dialog);this.dialog=dialog;this.frame=frame;
    this.previousOverflow=this.document.body.style.overflow;this.document.body.style.overflow='hidden';
    dialog.addEventListener('cancel',event=>{event.preventDefault();void this.close();});
    dialog.showModal();frame.focus();
  }
  async restore(state){
    const marker=state?.[historyKey],entry=marker?.owner===this.historyId?this.entries.get(marker.id):null,current=this.getContext();
    if(entry&&this.canOpen()&&entry.context?.subject===current?.subject&&entry.context?.generation===current?.generation){
      if(this.entry?.id!==entry.id)this.show(entry);
      return;
    }
    if(marker?.owner===this.historyId){const clean={...state};delete clean[historyKey];this.window.history.replaceState(clean,'',this.window.location.href);}
    try{await this.hide();}finally{const returning=this.returning;this.returning=null;returning?.resolve();}
  }
  close(){
    if(this.returning)return this.returning.promise;
    if(!this.dialog)return Promise.resolve();
    const marker=this.window.history.state?.[historyKey];
    if(marker?.owner!==this.historyId||marker.id!==this.entry.id)return this.hide();
    let resolve;const promise=new Promise(done=>{resolve=done;});this.returning={promise,resolve};
    // Both the return button and Escape consume the document entries, so a
    // subsequent Back cannot reopen a document or skip the preserved screen.
    this.window.history.go(-this.entry.depth);return promise;
  }
  async hide(){
    if(!this.dialog)return;
    const dialog=this.dialog,context=this.context,returnFocus=this.returnFocus;this.dialog=null;this.frame=null;this.context=null;this.returnFocus=null;this.entry=null;
    dialog.close();dialog.remove();this.document.body.style.overflow=this.previousOverflow;
    await this.onReturn(context);
    if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
  }
}
