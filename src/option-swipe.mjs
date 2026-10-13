// Horizontal intent is separate from taps, vertical scrolling and browser zoom.
export class OptionSwipe{
  constructor({enabled,context,onSwipe,clock=()=>performance.now()}){Object.assign(this,{enabled,context,onSwipe,clock});this.pointers=new Set();this.active=null;this.blockedClick=null;}
  bind(root){
    root.addEventListener('pointerdown',event=>this.start(event));
    root.addEventListener('pointermove',event=>this.move(event),{passive:false});
    root.addEventListener('pointerup',event=>this.end(event));
    root.addEventListener('pointercancel',event=>this.end(event,true));
    root.addEventListener('lostpointercapture',event=>{if(this.active?.id===event.pointerId)this.end(event,true);});
  }
  row(target){return target?.closest?.('[data-option-row]');}
  cancel(){
    const active=this.active;this.active=null;
    if(active){active.row.classList.remove('swiping');delete active.row.dataset.swipeLabel;try{if(active.row.hasPointerCapture?.(active.id))active.row.releasePointerCapture(active.id);}catch{}}
  }
  start(event){
    this.pointers.add(event.pointerId);
    if(this.pointers.size>1){this.cancel();return;}
    this.blockedClick=null;
    const row=this.row(event.target);
    if(!row||!this.enabled()||event.isPrimary===false||event.button!==0||event.target.closest?.('.option-cut'))return;
    this.active={row,id:event.pointerId,x:event.clientX,y:event.clientY,context:this.context(),axis:null};
  }
  track(event){
    const active=this.active;if(!active||active.id!==event.pointerId)return null;
    if(!this.enabled()||active.context!==this.context()||active.row.isConnected===false){this.cancel();return null;}
    const dx=event.clientX-active.x,dy=event.clientY-active.y;
    if(!active.axis&&Math.max(Math.abs(dx),Math.abs(dy))>=12){
      if(Math.abs(dx)>Math.abs(dy)*1.4){active.axis='x';this.blockedClick={row:active.row,until:this.clock()+800};try{active.row.setPointerCapture?.(active.id);}catch{}}
      else if(Math.abs(dy)>Math.abs(dx)*1.2){this.cancel();return null;}
    }
    return {active,dx,dy};
  }
  move(event){
    const state=this.track(event);if(state?.active.axis!=='x')return;
    if(event.cancelable)event.preventDefault();
    state.active.row.classList.add('swiping');state.active.row.dataset.swipeLabel=state.dx<0?'Riscar':'Restaurar';
    this.blockedClick.until=this.clock()+800;
  }
  end(event,cancelled=false){
    this.pointers.delete(event.pointerId);
    if(this.active?.id!==event.pointerId)return;
    const state=cancelled?null:this.track(event);
    this.cancel();
    if(!state||state.active.axis!=='x')return;
    this.blockedClick.until=this.clock()+800;
    const threshold=Math.max(48,Math.min(80,(state.active.row.getBoundingClientRect?.().width||300)*.18));
    if(Math.abs(state.dx)>=threshold&&Math.abs(state.dx)>Math.abs(state.dy)*1.4)this.onSwipe(state.active.row.dataset.optionRow,state.dx<0);
  }
  consumeClick(event){
    const block=this.blockedClick;
    if(!block||event.detail===0||this.clock()>block.until||this.row(event.target)!==block.row)return false;
    this.blockedClick=null;return true;
  }
}
