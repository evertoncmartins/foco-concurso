// Keep fullscreen on a stable element: the application redraws each answer.
export class FocusMode {
  constructor({document,standalone=()=>false,retainOnFullscreenExit=()=>false,onChange=()=>{},onUnavailable=()=>{}}) {
    this.document=document;
    this.standalone=standalone;
    this.retainOnFullscreenExit=retainOnFullscreenExit;
    this.onChange=onChange;
    this.onUnavailable=onUnavailable;
    this.active=false;
    this.pending=false;
    this.ownsFullscreen=false;
    this.revision=0;
    document.addEventListener('fullscreenchange',()=>{
      if(this.active&&this.pending&&document.fullscreenElement===document.documentElement)this.ownsFullscreen=true;
      if(this.active&&this.ownsFullscreen&&document.fullscreenElement!==document.documentElement){
        this.active=this.retainOnFullscreenExit();this.ownsFullscreen=false;this.revision++;this.onChange();
      }
    });
  }
  async enter({automatic=false}={}) {
    if(this.active)return;
    if(this.pending){
      // A resumed Mobile session needs its focus layout even while an old
      // native request is finishing. Do not issue a second browser request.
      if(automatic){this.active=true;this.revision++;this.onChange();}
      return;
    }
    const revision=++this.revision;
    this.active=true;
    this.onChange();
    if(this.document.fullscreenElement||this.standalone())return;
    const root=this.document.documentElement;
    if(!root.requestFullscreen){if(!automatic)this.onUnavailable();return;}
    this.pending=true;
    try {
      await root.requestFullscreen({navigationUI:'hide'});
      if(revision!==this.revision||!this.active){
        // The user can leave or finish a session while the browser is entering.
        if(this.document.fullscreenElement===root)await this.document.exitFullscreen();
        return;
      }
      this.ownsFullscreen=this.document.fullscreenElement===root;
    }catch{if(!automatic&&this.active&&revision===this.revision)this.onUnavailable();}
    finally{this.pending=false;}
  }
  async exit() {
    if(!this.active)return;
    this.active=false;this.revision++;
    const ownsFullscreen=this.ownsFullscreen;
    this.ownsFullscreen=false;
    this.onChange();
    if(ownsFullscreen&&this.document.fullscreenElement===this.document.documentElement){
      try{await this.document.exitFullscreen();}catch{/* The normal layout is already restored. */}
    }
  }
}
