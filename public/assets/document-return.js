// Standalone documents use their normal login link. Embedded documents return
// to the application's existing session without navigating or authenticating.
document.addEventListener('click',event=>{
  if(window.parent===window||event.defaultPrevented||event.button>0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const link=event.target.closest('a');if(!link)return;
  if(link.hasAttribute('data-foco-return')){
    event.preventDefault();window.parent.postMessage({type:'foco:document:return'},window.location.origin);return;
  }
  if(link.hasAttribute('download')||link.target&&link.target!=='_self')return;
  const url=new URL(link.href,window.location.href),current=new URL(window.location.href);
  if(url.origin!==current.origin)return;
  if(url.pathname===current.pathname&&url.search===current.search&&url.hash){
    // Section links scroll within the document without creating iframe-only
    // entries that would sit between the document and the preserved app screen.
    event.preventDefault();window.history.replaceState(window.history.state,'',url.href);
    let id;try{id=decodeURIComponent(url.hash.slice(1));}catch{return;}
    document.getElementById(id)?.scrollIntoView();return;
  }
  if(['privacidade.html','termos.html','formato-json.html'].some(name=>url.href.split('#')[0]===new URL(`./${name}`,current).href)){
    event.preventDefault();window.parent.postMessage({type:'foco:document:open',url:url.href},window.location.origin);
  }
});
