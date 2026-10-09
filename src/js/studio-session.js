// Shared Studio program, reviewed sources and explicit local sound/microphone consent.
// The Room owns seats, modes and publication rights; this controller mirrors its acknowledgements.
(() => {
  "use strict";
  const BL=window.BL;
  const create=({onOpen=()=>{},onPresentation=()=>{},onSeatRejected=()=>{}}={})=>{
    const dialog=document.createElement("dialog");dialog.className="studio-session";dialog.setAttribute("aria-label","DSB Studio shared session");
    dialog.innerHTML='<header><h2>DSB Studio</h2><button type="button" data-close>Return to room</button></header><p data-status role="status">Sign in to join the shared Studio.</p><video playsinline preload="metadata" aria-label="Shared Studio program"></video><p data-program></p><p data-playback role="status"></p><p data-screen-state role="status"></p><div class="studio-controls"><button type="button" data-sound>Enable Studio sound</button><button type="button" data-retry hidden>Retry sound</button><button type="button" data-mic>Join conversation</button><button type="button" data-listen-off>Leave Studio audio</button></div><p data-audio role="status">Studio sound off.</p><p data-mic-reason></p><p data-mic-error role="status"></p><div class="studio-controls"><button type="button" data-raise hidden>Raise hand</button><button type="button" data-lower hidden>Lower hand</button><button type="button" data-captions>Show captions</button></div><details><summary>Transcript and description</summary><p data-transcript></p><a data-transcript-link>Open transcript</a></details><details><summary>Personal sound and microphone setup</summary><label>Program level for you <input data-program-level type="range" min="0" max="1" step=".05" value="1"></label><label>Voice level for you <input data-voice-level type="range" min="0" max="1" step=".05" value="1"></label><label>Microphone <select data-device><option value="">Default microphone</option></select></label><button type="button" data-preflight>Test microphone locally</button><button type="button" data-cancel-preflight>Release test microphone</button><label>Local microphone level <meter data-meter min="0" max="1" value="0"></meter></label><p data-preflight-state>Testing never publishes your microphone. Joining conversation is a separate action.</p></details><section data-host hidden><h3>Host controls</h3><button type="button" data-claim>Become host</button><div data-presenter hidden><button type="button" data-presentation>Present</button><button type="button" data-discussion>Open discussion</button><button type="button" data-qa>Open Q&amp;A</button><label>Reviewed program <select data-source></select></label><button type="button" data-next>Next reviewed program</button><button type="button" data-play>Play program</button><button type="button" data-pause>Pause program</button><label>Program position <input data-seek type="range" min="0" max="0" step=".1" value="0"></label><label>Shared program volume <input data-volume type="range" min="0" max="1" step=".05" value=".65"></label><label>Participant <select data-participant></select></label><button type="button" data-invite>Invite raised hand</button><button type="button" data-restore>Restore speaking eligibility</button><button type="button" data-transfer>Transfer host</button><button type="button" data-revoke>Revoke speaking</button><button type="button" data-release>Release host</button></div></section><p data-error role="status"></p>';
    document.body.appendChild(dialog);
    const q=s=>dialog.querySelector(s),video=q("video"),status=q("[data-status]"),error=q("[data-error]"),mic=q("[data-mic]"),sound=q("[data-sound]"),participant=q("[data-participant]"),sourceSelect=q("[data-source]"),deviceSelect=q("[data-device]"),events=new AbortController();
    const catalogue=BL.studioMedia;
    for(const source of catalogue.sources){const option=document.createElement("option");option.value=source.id;option.textContent=source.title;sourceSelect.appendChild(option);}
    video.muted=true;
    let active=false,disposed=false,room=null,state=null,soundEnabled=false,soundWanted=false,soundAttempt=false,soundGeneration=0,soundFailure="",muted=false,attempting=false,playBlocked=false,buffering=false,elapsed=0,returnFocus=null,visit=0,playGeneration=0,sequence=0,seatClaim=null,awaitingSeat=false,micRequested=false,micRequestGeneration=0,presenting=null,programGain=1,personalProgram=1,selectedSource=null,captions=false;
    const mediaUrl=path=>location.protocol==="file:"?new URL((location.pathname.endsWith("/src/index.html")?"":"src/")+path.slice(1),location.href).href:path;
    const currentSource=()=>catalogue.byId[state?.source]||catalogue.sources[0];
    const isHost=()=>state?.hostId===BL.net.state.selfId;
    const soundState=()=>{
      const voice=BL.voice.stats;
      if(!soundWanted)return "off";
      if(soundAttempt||voice.joining&&!voice.ready)return "connecting";
      if(playBlocked||voice.blocked)return "blocked";
      if(soundFailure||voice.error||voice.receiveState==="failed"||voice.receiveState==="disconnected")return "error";
      if(!voice.ready||!voice.enabled||voice.peers>0&&voice.receiveState==="connecting")return "connecting";
      return voice.hearing>0?"listening":"ready";
    };
    const command=(action,fields={})=>{
      error.textContent="";
      if(!BL.net.studioCommand(action,{...fields,revision:state?.revision,commandId:`studio-${++sequence}`}))error.textContent="The room is disconnected. Rejoin before changing the session.";
    };
    const syncSound=()=>{soundEnabled=soundWanted&&BL.voice.stats.ready===true&&BL.voice.stats.enabled===true&&!BL.voice.stats.blocked&&!playBlocked&&!BL.voice.stats.error&&!soundFailure&&BL.voice.stats.receiveState!=="failed"&&BL.voice.stats.receiveState!=="disconnected";video.muted=!soundEnabled||muted;};
    const micReason=()=>{
      if(BL.net.state.room!=="live"||!state)return "Connect to the room before speaking.";
      if(state.canSpeak)return BL.voice.stats.publishing?"Your microphone is publishing. Choose Mute microphone to release it.":micRequested?"Connecting your microphone by your explicit choice…":"Your microphone remains off until you choose Join conversation.";
      if((state.restrictedIds||[]).includes(BL.net.state.selfId))return "The host has revoked your speaking eligibility. Ask the host to restore it.";
      if(!isHost()&&!state.seats.some(seat=>seat.id===BL.net.state.selfId))return "Sit in an available Studio seat to join discussion or raise your hand.";
      if(state.mode==="qa")return "Raise your hand and wait for a host invitation. Inviting never activates your microphone.";
      if(state.mode==="presentation")return "The host is presenting. Attendee microphones are unavailable until discussion or an invitation.";
      return "The session is suspended. An approved host must resume it.";
    };
    const reflect=()=>{
      syncSound();
      const connected=BL.net.state.room==="live"&&!!state,stage=soundState();
      status.textContent=!connected?"Sign in and connect to join the shared Studio.":state.hostId?`${state.mode} · Host: ${BL.net.remotes.get(state.hostId)?.display||(isHost()?BL.net.state.me?.display:"connected participant")}`:state?.allowedHost?"Session suspended · You can claim the Studio.":"Session suspended · Awaiting an approved host. Host accounts are configured by the operator.";
      if(state?.cleanupPending)status.textContent+=" · Media cleanup pending; permissions revoked";
      q("[data-host]").hidden=!connected||!state.allowedHost;q("[data-claim]").hidden=!!state?.hostId;q("[data-presenter]").hidden=!isHost();
      mic.disabled=!connected||!state.canSpeak||micRequested;mic.textContent=micRequested?"Joining microphone…":BL.voice.stats.publishing&&!BL.voice.stats.muted?"Mute microphone":"Join conversation";
      q("[data-mic-reason]").textContent=micReason();q("[data-mic-error]").textContent=BL.voice.stats.micError||"";
      sound.disabled=!connected;sound.textContent=soundWanted?"Turn Studio sound off":"Enable Studio sound";
      q("[data-retry]").hidden=stage!=="blocked"&&stage!=="error";
      q("[data-audio]").textContent=stage==="off"?"Studio sound off.":stage==="connecting"?"Connecting Studio sound…":stage==="ready"?"Studio sound ready. No speakers are currently audible.":stage==="listening"?"Listening to Studio voices.":stage==="blocked"?"Sound needs your gesture. Press Retry sound.":`Sound unavailable. ${soundFailure||BL.voice.stats.error||"Press Retry sound."}`;
      q("[data-playback]").textContent=video.error?"Program unavailable; voice can still work.":state?.playing&&video.readyState<2?"Loading shared program…":buffering?"Program buffering; shared playback remains controlled by the host.":state?.playing?video.ended?"Program ended.":"Shared program playing.":"Shared program paused.";
      q("[data-screen-state]").textContent=room?.screen?.geometry.imageSurface?.mediaErrorCode?"In-world screen preview unavailable. Use this accessible panel for native playback; voice is unaffected. Serve the site over HTTP for an origin-safe preview.":"";
      const selfId=BL.net.state.selfId,raised=(state?.hands||[]).includes(selfId),seated=state?.seats.some(seat=>seat.id===selfId);
      const invited=(state?.invited||[]).includes(selfId);q("[data-raise]").hidden=!connected||state.mode!=="qa"||!seated||isHost()||raised||invited;q("[data-lower]").hidden=!connected||(!raised&&!invited);q("[data-lower]").textContent=invited?"Finish question":"Lower hand";
      q("[data-captions]").textContent=captions?"Hide captions":"Show captions";
      if(state){q("[data-volume]").value=String(state.volume);q("[data-seek]").max=String(currentSource().duration);q("[data-seek]").value=String(Math.min(currentSource().duration,video.currentTime||0));sourceSelect.value=state.source;}
      q("[data-meter]").value=Math.min(1,(BL.voice.stats.micLevel||0)*5);
      q("[data-preflight-state]").textContent=BL.voice.stats.permission==="requesting"?"Waiting for microphone permission…":BL.voice.stats.permission==="denied"?"Microphone permission was denied. You can still listen.":BL.voice.stats.preflight?"Microphone test active locally. Nothing is being published.":BL.voice.stats.publishing?"Microphone publishing by your explicit choice.":"Testing never publishes your microphone. Joining conversation is a separate action.";
      q("[data-cancel-preflight]").disabled=!BL.voice.stats.preflight&&!BL.voice.stats.preflightPending;q("[data-preflight]").disabled=!!BL.voice.stats.publishing||!!BL.voice.stats.joining||!!BL.voice.stats.preflightPending;
      const selected=participant.value,ids=[];
      for(const rec of BL.net.remotes.values())if(rec.zone==="dsb-studio")ids.push(rec);
      const queue=state?.hands||[];ids.sort((a,b)=>{const ai=queue.indexOf(a.id),bi=queue.indexOf(b.id);return (ai<0?Infinity:ai)-(bi<0?Infinity:bi)||a.id-b.id;});
      const signature=ids.map(rec=>`${rec.id}:${rec.display}:${(state?.hands||[]).includes(rec.id)}:${(state?.invited||[]).includes(rec.id)}:${(state?.restrictedIds||[]).includes(rec.id)}`).join("|");
      if(participant.dataset.signature!==signature){participant.replaceChildren();for(const rec of ids){const option=document.createElement("option");option.value=String(rec.id);option.textContent=rec.display+((state?.hands||[]).includes(rec.id)?` · queue ${queue.indexOf(rec.id)+1}`:"")+((state?.invited||[]).includes(rec.id)?" · invited":"")+((state?.restrictedIds||[]).includes(rec.id)?" · speaking revoked":"");participant.appendChild(option);}if(ids.some(rec=>String(rec.id)===selected))participant.value=selected;participant.dataset.signature=signature;}
      const targetId=Number(participant.value);q("[data-invite]").disabled=state?.mode!=="qa"||!(state?.hands||[]).includes(targetId);
    };
    const loadSource=()=>{
      const source=currentSource();if(source.id===selectedSource)return;
      selectedSource=source.id;playGeneration++;attempting=false;playBlocked=false;buffering=false;video.pause();video.src=mediaUrl(source.url);
      video.querySelectorAll("track").forEach(track=>track.remove());
      const track=document.createElement("track");track.kind="captions";track.label="English description";track.srclang="en";track.src=mediaUrl(source.captions);track.default=captions;video.appendChild(track);
      q("[data-program]").textContent=source.title+" · The screen and this panel share one player.";
      q("[data-transcript]").textContent=source.transcriptText;q("[data-transcript-link]").href=mediaUrl(source.transcript);
      video.load();
    };
    const reconcile=()=>{
      if(!active||!state||disposed)return;loadSource();syncSound();
      const duration=currentSource().duration,position=Math.max(0,Math.min(duration,state.position+(state.playing?(BL.net.serverNow()-state.at)/1000:0)));
      if(video.readyState>=1&&Math.abs(video.currentTime-position)>.45)video.currentTime=position;
      video.volume=Math.max(0,Math.min(1,state.volume*programGain*personalProgram));
      if(state.playing&&position<duration){
        if(video.paused&&!attempting&&!playBlocked){attempting=true;const token=visit,generation=playGeneration;video.play().catch(()=>{if(active&&token===visit&&generation===playGeneration){playBlocked=true;reflect();}}).finally(()=>{if(token===visit&&generation===playGeneration)attempting=false;});}
      }else video.pause();
    };
    const requestSound=async()=>{
      if(!active||BL.net.state.room!=="live")return;
      soundWanted=true;soundFailure="";soundAttempt=true;playBlocked=false;reflect();const token=visit,generation=++soundGeneration;
      const failedConnection=BL.voice.stats.enabled&&!BL.voice.stats.blocked&&(BL.voice.stats.error||BL.voice.stats.receiveState==="failed"||BL.voice.stats.receiveState==="disconnected");
      try{await BL.voice.listen();if(!active||token!==visit||generation!==soundGeneration)return;if(failedConnection)await BL.voice.restart();if(!active||token!==visit||generation!==soundGeneration)return;if(!BL.voice.stats.ready||!BL.voice.stats.enabled)soundFailure=BL.voice.stats.error||"Voice connection could not become ready.";}
      catch{if(active&&token===visit&&generation===soundGeneration)soundFailure="Voice connection failed. Retry sound to reconnect.";}
      finally{if(active&&token===visit&&generation===soundGeneration){soundAttempt=false;syncSound();reconcile();reflect();}}
    };
    const accept=message=>{
      if(!active)return;
      if(message.t==="studio-result"){if(message.action==="seat")awaitingSeat=false;if(!message.ok){error.textContent=message.error||"The room rejected this action.";if(message.action==="seat"){seatClaim=null;onSeatRejected();}}return;}
      const incoming=message.state;
      if(state&&incoming&&(incoming.epoch<state.epoch||(incoming.epoch===state.epoch&&incoming.revision<state.revision)))return;state=incoming;
      if(!state){video.pause();if(BL.voice.stats.publishing||micRequested){micRequestGeneration++;micRequested=false;BL.voice.dropMic();}reflect();return;}
      if(!state.canSpeak&&(BL.voice.stats.publishing||micRequested)){micRequestGeneration++;micRequested=false;BL.voice.dropMic();}
      if(seatClaim!==null&&!awaitingSeat&&!state.seats.some(seat=>seat.id===BL.net.state.selfId&&seat.seat===seatClaim)){seatClaim=null;onSeatRejected();}
      const nextPresenting=state.mode==="presentation"||state.mode==="qa";if(presenting!==nextPresenting){presenting=nextPresenting;onPresentation(presenting);}reconcile();reflect();
    };
    const unsubscribeVoice=BL.voice.subscribe(()=>{if(active){reflect();}});
    const unsubscribe=BL.net.subscribeStudio(accept),unsubscribeAccount=BL.net.subscribe(()=>{if(active){if(BL.net.state.room!=="live"){state=null;awaitingSeat=false;video.pause();}reflect();}});
    const listen=(el,event,fn)=>el.addEventListener(event,fn,{signal:events.signal});
    const refreshDevices=async()=>{const token=visit;try{const devices=await BL.voice.devices();if(!active||token!==visit)return;deviceSelect.replaceChildren();const fallback=document.createElement("option");fallback.value="";fallback.textContent="Default microphone";deviceSelect.appendChild(fallback);for(const device of devices){if(!device.deviceId)continue;const option=document.createElement("option");option.value=device.deviceId;option.textContent=device.label||"Microphone";deviceSelect.appendChild(option);}deviceSelect.value=BL.voice.stats.deviceId||"";}catch{if(active&&token===visit)error.textContent="Microphone device list unavailable. Default microphone remains usable.";}};
    listen(q("[data-close]"),"click",()=>close());listen(dialog,"cancel",e=>{e.preventDefault();close();});
    listen(sound,"click",()=>{if(soundWanted){soundGeneration++;soundWanted=false;soundEnabled=false;soundAttempt=false;soundFailure="";video.muted=true;BL.voice.stop();reflect();}else void requestSound();});
    listen(q("[data-retry]"),"click",()=>void requestSound());
    listen(mic,"click",()=>{if(!state?.canSpeak)return;if(BL.voice.stats.publishing&&!BL.voice.stats.muted)BL.voice.dropMic();else{soundWanted=true;soundFailure="";playBlocked=false;micRequested=true;const generation=++micRequestGeneration;void BL.voice.enable().finally(()=>{if(generation===micRequestGeneration){micRequested=false;reconcile();reflect();}});}reflect();});
    listen(q("[data-listen-off]"),"click",()=>{soundGeneration++;soundWanted=false;soundEnabled=false;soundAttempt=false;video.muted=true;BL.voice.stop();reflect();});
    for(const action of ["claim","play","pause","release","raise","lower"])listen(q(`[data-${action}]`),"click",()=>command(action));
    for(const mode of ["presentation","discussion","qa"])listen(q(`[data-${mode}]`),"click",()=>command("mode",{mode}));
    listen(sourceSelect,"change",()=>command("source",{source:sourceSelect.value}));
    listen(q("[data-next]"),"click",()=>{const index=catalogue.sources.findIndex(source=>source.id===state?.source);command("source",{source:catalogue.sources[(index+1)%catalogue.sources.length].id});});
    listen(q("[data-seek]"),"change",e=>command("seek",{position:Number(e.target.value)}));listen(q("[data-volume]"),"change",e=>command("volume",{volume:Number(e.target.value)}));
    for(const action of ["transfer","revoke","invite","restore"])listen(q(`[data-${action}]`),"click",()=>{const id=Number(participant.value);if(id)command(action,{id});});
    listen(participant,"change",reflect);
    listen(q("[data-program-level]"),"input",e=>{personalProgram=Number(e.target.value);reconcile();});listen(q("[data-voice-level]"),"input",e=>BL.voice.setReceiveLevel(Number(e.target.value)));
    listen(q("[data-preflight]"),"click",()=>{void BL.voice.preflight(deviceSelect.value).then(()=>{if(active)void refreshDevices();});});
    listen(q("[data-cancel-preflight]"),"click",()=>BL.voice.cancelPreflight());listen(deviceSelect,"change",()=>{micRequestGeneration++;micRequested=false;void BL.voice.selectDevice(deviceSelect.value);});
    listen(q("[data-captions]"),"click",()=>{captions=!captions;if(video.textTracks)for(const track of video.textTracks)track.mode=captions?"showing":"disabled";reflect();});
    // Metadata can precede a seekable decoded frame. Reapply the latest timeline when
    // decoding/seek settlement becomes ready; do not depend on the scene polling clock.
    for(const event of ["loadedmetadata","loadeddata","durationchange"])listen(video,event,reconcile);listen(video,"error",()=>{if(active)reflect();});
    for(const event of ["waiting","stalled"])listen(video,event,()=>{buffering=true;if(active)reflect();});for(const event of ["playing","canplay","seeked"])listen(video,event,()=>{buffering=false;if(active){reconcile();reflect();}});
    listen(document,"visibilitychange",()=>{if(active&&!document.hidden){reconcile();reflect();}});
    const close=()=>{if(dialog.open){dialog.close();BL.dsbMenuShell?.present(dialog,false);onOpen(false);returnFocus?.focus();returnFocus=null;}};
    const leave=()=>{
      if(!active)return;visit++;soundGeneration++;playGeneration++;attempting=false;active=false;micRequestGeneration++;micRequested=false;presenting=null;programGain=1;close();state=null;seatClaim=null;awaitingSeat=false;soundEnabled=false;soundWanted=false;soundAttempt=false;soundFailure="";playBlocked=false;buffering=false;selectedSource=null;video.pause();video.muted=true;video.removeAttribute("src");video.querySelectorAll("track").forEach(track=>track.remove());video.load();
      if(room?.screen)delete room.screen.geometry.imageSurface;room=null;BL.voice.stop();onPresentation(false);
    };
    return {
      enter:r=>{if(disposed)return;visit++;attempting=false;active=true;room=r;state=BL.net.state.studio||null;loadSource();r.screen.geometry.imageSurface={dynamic:true,asset:{width:320,height:180,load:()=>video},rect:[-3.5,-1.75,7,3.5]};reconcile();reflect();},
      leave,open:()=>{if(!active||dialog.open)return;returnFocus=document.activeElement;dialog.showModal();BL.dsbMenuShell?.present(dialog,true);onOpen(true);reflect();},close,
      seat:seat=>{seatClaim=seat;awaitingSeat=seat!==null;command(seat===null?"stand":"seat",seat===null?{}:{seat});},
      update:dt=>{if(!active)return;const talking=state?.hostId&&(isHost()?BL.voice.stats.speaking:BL.voice.speaking?.(state.hostId));const target=talking?0.35:1;programGain+=(target-programGain)*(1-Math.exp(-Math.min(dt,.1)/(talking?0.08:0.45)));if(state)video.volume=Math.max(0,Math.min(1,state.volume*programGain*personalProgram));elapsed+=dt;if(elapsed>.5){elapsed=0;reconcile();reflect();}},
      setMuted:on=>{muted=!!on;video.muted=muted||!soundEnabled;},
      get isOpen(){return dialog.open;},get playing(){return active&&!video.paused;},
      get stats(){return {active,epoch:state?.epoch??null,revision:state?.revision??null,anchorPosition:state?.position??null,open:dialog.open,soundEnabled,soundState:soundState(),buffering,mode:state?.mode||null,source:selectedSource,position:video.currentTime||0,media:active?1:0};},
      dispose:()=>{leave();disposed=true;events.abort();unsubscribe();unsubscribeAccount();unsubscribeVoice();dialog.remove();}
    };
  };
  BL.studioSession={create};
})();
