const documents={'privacidade.html':'Política de Privacidade','termos.html':'Termos de Serviço','formato-json.html':'Formato dos bancos JSON'};

// Keep the live application in memory while reading a public document. Returning
// never exchanges Google credentials or infers a login from an old cookie.
export class PublicDocuments{
  constructor({document=globalThis.document,window=globalThis.window,canOpen=()=>true,onReturn=()=>{}}={}){
    this.document=document;this.window=window;this.canOpen=canOpen;this.onReturn=onReturn;this.dialog=null;this.frame=null;
    document.addEventListener('click',event=>{
      const link=event.target.closest('a[data-foco-document]');
      if(!link||event.defaultPrevented||event.button>0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      const url=new URL(link.href,window.location.href),name=Object.keys(documents).find(name=>url.href.split('#')[0]===new URL(`./${name}`,window.location.href).href);
      if(!name)return;
      event.preventDefault();if(this.canOpen())this.open(url.href,documents[name]);
    });
    window.addEventListener('message',event=>{
      if(this.frame&&event.source===this.frame.contentWindow&&event.origin===window.location.origin&&event.data?.type==='foco:document:return')void this.close();
    });
  }
  open(url,title){
    if(this.dialog)return;
    const dialog=this.document.createElement('dialog'),frame=this.document.createElement('iframe');
    dialog.className='public-document-dialog';dialog.setAttribute('aria-label',title);
    frame.src=url;frame.title=title;frame.setAttribute('referrerpolicy','same-origin');
    dialog.append(frame);this.document.body.append(dialog);this.dialog=dialog;this.frame=frame;
    this.previousOverflow=this.document.body.style.overflow;this.document.body.style.overflow='hidden';
    dialog.addEventListener('cancel',event=>{event.preventDefault();void this.close();});
    dialog.showModal();frame.focus();
  }
  async close(){
    if(!this.dialog)return;
    const dialog=this.dialog;this.dialog=null;this.frame=null;
    dialog.close();dialog.remove();this.document.body.style.overflow=this.previousOverflow;
    await this.onReturn();
  }
}
