// Shared Studio program and explicit local sound/microphone consent. Room state owns permissions.
(() => {
  "use strict";
  const BL=window.BL;
  const create=({onOpen=()=>{},onPresentation=()=>{},onSeatRejected=()=>{}}={})=>{
    const dialog=document.createElement("dialog");dialog.className="studio-session";dialog.setAttribute("aria-label","DSB Studio shared session");
    dialog.innerHTML='<header><h2>DSB Studio</h2><button type="button" data-close>Return to room</button></header><p data-status role="status">Sign in to join the shared Studio.</p><video playsinline preload="metadata" aria-label="Shared Studio program"></video><p>Original synthetic 12-second Studio demonstration. The screen and this panel share one player.</p><div class="studio-controls"><button type="button" data-sound>Enable Studio sound</button><button type="button" data-mic>Join conversation</button><button type="button" data-listen-off>Leave Studio audio</button></div><section data-host hidden><h3>Host controls</h3><button type="button" data-claim>Become host</button><div data-presenter hidden><button type="button" data-presentation>Present</button><button type="button" data-discussion>Open discussion</button><button type="button" data-play>Play program</button><button type="button" data-pause>Pause program</button><label>Program position <input data-seek type="range" min="0" max="12" step=".1" value="0"></label><label>Program volume <input data-volume type="range" min="0" max="1" step=".05" value="1"></label><label>Participant <select data-participant></select></label><button type="button" data-transfer>Transfer host</button><button type="button" data-revoke>Revoke speaking</button><button type="button" data-release>Release host</button></div></section><p data-error role="status"></p>';
    document.body.appendChild(dialog);
    const q=s=>dialog.querySelector(s),video=q("video"),status=q("[data-status]"),error=q("[data-error]"),mic=q("[data-mic]"),sound=q("[data-sound]"),participant=q("select"),events=new AbortController();
    video.muted=true;
    let active=false,disposed=false,room=null,state=null,soundEnabled=false,muted=false,attempting=false,playBlocked=false,elapsed=0,returnFocus=null,visit=0,sequence=0,seatClaim=null,awaitingSeat=false,micRequested=false,micRequestGeneration=0,presenting=null,programGain=1;
    const command=(action,fields={})=>{
      error.textContent="";
      if(!BL.net.studioCommand(action,{...fields,revision:state?.revision,commandId:`studio-${++sequence}`}))error.textContent="The room is disconnected. Rejoin before changing the session.";
    };
    const isHost=()=>state?.hostId===BL.net.state.selfId;
    const reflect=()=>{
      const connected=BL.net.state.room==="live"&&!!state;
      status.textContent=!connected?"Sign in and connect to join the shared Studio.":state.hostId?`${state.mode} · Host: ${BL.net.remotes.get(state.hostId)?.display|| (isHost()?BL.net.state.me?.display:"connected participant")}`:"Discussion · An approved host can start a presentation.";
      if(state?.cleanupPending)status.textContent+=" · Media cleanup pending; permissions revoked";
      q("[data-host]").hidden=!connected||!state.allowedHost;
      q("[data-claim]").hidden=!!state?.hostId;
      q("[data-presenter]").hidden=!isHost();
      mic.disabled=!connected||!state.canSpeak;
      mic.textContent=BL.voice.stats.publishing&&!BL.voice.stats.muted?"Mute microphone":"Join conversation";
      sound.textContent=soundEnabled?"Mute Studio sound":"Enable Studio sound";
      if(state){q("[data-volume]").value=String(state.volume);q("[data-seek]").value=String(Math.min(12,video.currentTime||0));}
      const selected=participant.value,ids=[];
      for(const rec of BL.net.remotes.values())if(rec.zone==="dsb-studio")ids.push(rec);
      const signature=ids.map(rec=>`${rec.id}:${rec.display}`).join("|");
      if(participant.dataset.signature!==signature){participant.replaceChildren();for(const rec of ids){const option=document.createElement("option");option.value=String(rec.id);option.textContent=rec.display;participant.appendChild(option);}participant.value=selected;participant.dataset.signature=signature;}
    };
    const reconcile=()=>{
      if(!active||!state||disposed)return;
      const position=Math.max(0,Math.min(12,state.position+(state.playing?(BL.net.serverNow()-state.at)/1000:0)));
      if(video.readyState>=1&&Math.abs(video.currentTime-position)>.45)video.currentTime=position;
      video.volume=Math.max(0,Math.min(1,state.volume*programGain));video.muted=!soundEnabled||muted;
      if(state.playing&&position<12){
        if(video.paused&&!attempting&&!playBlocked){attempting=true;const token=visit;video.play().catch(()=>{if(active&&token===visit){playBlocked=true;error.textContent="Playback needs your gesture. Press Enable Studio sound to resume.";}}).finally(()=>{if(token===visit)attempting=false;});}
      }else video.pause();
    };
    const accept=message=>{
      if(!active)return;
      if(message.t==="studio-result"){if(message.action==="seat")awaitingSeat=false;if(!message.ok){error.textContent=message.error||"The room rejected this action.";if(message.action==="seat"){seatClaim=null;onSeatRejected();}}return;}
      const incoming=message.state;
      if(state&&incoming&&(incoming.epoch<state.epoch||(incoming.epoch===state.epoch&&incoming.revision<state.revision)))return;
      state=incoming;
      if(!state){video.pause();if(BL.voice.stats.publishing||micRequested){micRequestGeneration++;micRequested=false;BL.voice.dropMic();}reflect();return;}
      if(!state.canSpeak&&(BL.voice.stats.publishing||micRequested)){micRequestGeneration++;micRequested=false;BL.voice.dropMic();}
      if(seatClaim!==null&&!awaitingSeat&&!state.seats.some(seat=>seat.id===BL.net.state.selfId&&seat.seat===seatClaim)){seatClaim=null;onSeatRejected();}
      const nextPresenting=state.mode==="presentation";if(presenting!==nextPresenting){presenting=nextPresenting;onPresentation(presenting);}reconcile();reflect();
    };
    const unsubscribeVoice=BL.voice.subscribe(()=>{if(active){reflect();if(BL.voice.stats.error)error.textContent=BL.voice.stats.error;}});
    const unsubscribe=BL.net.subscribeStudio(accept),unsubscribeAccount=BL.net.subscribe(()=>{if(active){if(BL.net.state.room!=="live"){state=null;awaitingSeat=false;video.pause();}reflect();}});
    const listen=(el,event,fn)=>el.addEventListener(event,fn,{signal:events.signal});
    listen(q("[data-close]"),"click",()=>close());
    listen(dialog,"cancel",e=>{e.preventDefault();close();});
    listen(sound,"click",()=>{
      soundEnabled=!soundEnabled;playBlocked=false;
      if(soundEnabled){video.muted=muted;void BL.voice.listen();reconcile();}else {video.muted=true;BL.voice.stop();}
      reflect();
    });
    listen(mic,"click",()=>{if(!state?.canSpeak)return;if(BL.voice.stats.publishing&&!BL.voice.stats.muted)BL.voice.dropMic();else {soundEnabled=true;playBlocked=false;reconcile();micRequested=true;const generation=++micRequestGeneration;void BL.voice.enable().finally(()=>{if(generation===micRequestGeneration)micRequested=false;});}reflect();});
    listen(q("[data-listen-off]"),"click",()=>{soundEnabled=false;video.muted=true;BL.voice.stop();reflect();});
    for(const action of ["claim","play","pause","release"])listen(q(`[data-${action}]`),"click",()=>command(action));
    for(const mode of ["presentation","discussion"])listen(q(`[data-${mode}]`),"click",()=>command("mode",{mode}));
    listen(q("[data-seek]"),"change",e=>command("seek",{position:Number(e.target.value)}));
    listen(q("[data-volume]"),"change",e=>command("volume",{volume:Number(e.target.value)}));
    for(const action of ["transfer","revoke"])listen(q(`[data-${action}]`),"click",()=>{const id=Number(participant.value);if(id)command(action,{id});});
    listen(video,"loadedmetadata",reconcile);listen(video,"error",()=>{if(active)error.textContent="The shared program could not load. Voice remains available.";});
    listen(document,"visibilitychange",()=>{if(active&&!document.hidden){playBlocked=false;reconcile();}});
    const close=()=>{if(dialog.open){dialog.close();BL.dsbMenuShell?.present(dialog,false);onOpen(false);returnFocus?.focus();returnFocus=null;}};
    const leave=()=>{
      if(!active)return;visit++;attempting=false;active=false;micRequestGeneration++;micRequested=false;presenting=null;programGain=1;close();state=null;seatClaim=null;awaitingSeat=false;soundEnabled=false;playBlocked=false;video.pause();video.muted=true;video.removeAttribute("src");video.load();
      if(room?.screen)delete room.screen.geometry.imageSurface;room=null;BL.voice.stop();onPresentation(false);
    };
    return {
      enter:r=>{if(disposed)return;visit++;attempting=false;active=true;room=r;state=BL.net.state.studio||null;video.src=location.protocol==="file:"?new URL(location.pathname.endsWith("/src/index.html")?"media/studio-sample.mp4":"src/media/studio-sample.mp4",location.href).href:"/media/studio-sample.mp4";r.screen.geometry.imageSurface={dynamic:true,asset:{width:320,height:180,load:()=>video},rect:[-3.5,-1.75,7,3.5]};reconcile();reflect();},
      leave,open:()=>{if(!active||dialog.open)return;returnFocus=document.activeElement;dialog.showModal();BL.dsbMenuShell?.present(dialog,true);onOpen(true);reflect();},close,
      seat:seat=>{seatClaim=seat;awaitingSeat=seat!==null;command(seat===null?"stand":"seat",seat===null?{}:{seat});},
      update:dt=>{if(!active)return;const talking=state?.hostId&&(isHost()?BL.voice.stats.speaking:BL.voice.speaking?.(state.hostId));const target=talking?0.35:1;programGain+=(target-programGain)*(1-Math.exp(-Math.min(dt,.1)/(talking?0.08:0.45)));if(state)video.volume=Math.max(0,Math.min(1,state.volume*programGain));elapsed+=dt;if(elapsed>.5){elapsed=0;reconcile();reflect();}},
      setMuted:on=>{muted=!!on;video.muted=muted||!soundEnabled;},
      get isOpen(){return dialog.open;},get playing(){return active&&!video.paused;},
      get stats(){return {active,open:dialog.open,soundEnabled,mode:state?.mode||null,position:video.currentTime||0,media:active?1:0};},
      dispose:()=>{leave();disposed=true;events.abort();unsubscribe();unsubscribeAccount();unsubscribeVoice();dialog.remove();}
    };
  };
  BL.studioSession={create};
})();
