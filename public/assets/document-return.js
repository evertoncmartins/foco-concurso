// Standalone documents use their normal login link. Embedded documents return
// to the application's existing session without navigating or authenticating.
document.addEventListener('click',event=>{
  if(window.parent===window||event.defaultPrevented||event.button>0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||!event.target.closest('a[data-foco-return]'))return;
  event.preventDefault();window.parent.postMessage({type:'foco:document:return'},window.location.origin);
});
