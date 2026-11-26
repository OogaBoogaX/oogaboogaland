// A private pressing on the lounge turntable. Files enter only through the local file picker.
(() => {
  "use strict";
  const BL=window.BL;
  const tracks=["A1 · A greeting","A2 · Someone who gave me a chance","A3 · A question for you","B1 · Your answer","Pendleton"];
  const storage=(key,file)=>new Promise((resolve,reject)=>{
    const request=indexedDB.open("ember-den-record",1);
    request.onupgradeneeded=()=>request.result.createObjectStore("cuts");
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result;
      const tx=db.transaction("cuts",file===undefined?"readonly":"readwrite"),cuts=tx.objectStore("cuts");
      const op=file===undefined?cuts.get(key):file===null?cuts.delete(key):cuts.put(file,key);
      tx.oncomplete=()=>{db.close();resolve(op.result);};
      tx.onabort=()=>{db.close();reject(tx.error);};
    };
  });
  const create=()=>{
    const channel=BL.sound.channel("room"),files=new Map();
    let context=null,source=null,generation=0,selected=tracks.length-1,disposed=false,display=null;
    const stop=()=>{
      generation++;
      if(source){source.onended=null;source.stop();source.disconnect();source=null;}
    };
    const open=ui=>{
      const pick=ui.element("select");pick.setAttribute("aria-label","Side and track");
      tracks.forEach((name,i)=>{const opt=document.createElement("option");opt.value=i;opt.textContent=name;pick.append(opt);});
      pick.value=selected;
      const status=ui.status();
      const play=ui.button("Lower needle",async()=>{
        if(source){stop();refresh();return;}
        const id=++generation,file=files.get(selected);
        try{
          if(!context)context=new AudioContext();
          await context.resume();
          if(id!==generation)return;
          const data=await context.decodeAudioData(await file.arrayBuffer());
          if(id!==generation)return;
          source=context.createBufferSource();source.buffer=data;source.connect(channel.node(context));
          source.onended=()=>{source.disconnect();source=null;if(display)display();};
          source.start();refresh();
        }catch{if(id===generation){stop();status.textContent="This recording could not be played. Try a WAV or MP3 copy.";}}
      });
      const label=ui.element("label","Choose an audio file for this track");
      const input=document.createElement("input");input.type="file";input.accept="audio/*";label.append(input);
      const remove=ui.button("Remove from this browser",async()=>{
        const slot=selected,old=files.get(slot);stop();
        try{
          await storage(slot,null);
          if(files.get(slot)===old)files.delete(slot);
          if(display===refresh && selected===slot)refresh();
        }catch{if(display===refresh)status.textContent="The browser could not remove this recording.";}
      });
      ui.element("p","Your recording stays in this browser. Keep the original file with your family.");
      const refresh=()=>{
        const file=files.get(selected);
        status.textContent=source?"Playing · "+file.name:file?file.name:"This groove is waiting for a recording.";
        play.disabled=remove.disabled=!file;play.textContent=source?"Lift needle":"Lower needle";
      };
      display=refresh;
      const load=async()=>{
        const slot=selected;
        if(!files.has(slot)){
          try{const file=await storage(slot);if(file && !files.has(slot))files.set(slot,file);}
          catch{if(display===refresh && slot===selected){refresh();status.textContent="Local storage unavailable. You can still choose a recording for this visit.";return;}}
        }
        if(display===refresh && selected===slot)refresh();
      };
      pick.onchange=()=>{stop();selected=Number(pick.value);refresh();load();};
      input.onchange=async()=>{
        const file=input.files[0],slot=selected;if(!file)return;
        stop();files.set(slot,file);refresh();input.value="";
        try{await storage(slot,file);}catch{if(!disposed && display===refresh && selected===slot)status.textContent="Ready for this visit. This browser could not save the recording.";}
      };
      refresh();load();
    };
    return {open,stop,hide(){display=null;},get playing(){return !!source;},dispose(){
      disposed=true;display=null;stop();channel.release();if(context)context.close().catch(()=>{});files.clear();
    }};
  };
  BL.pokerFiresideRecord={create};
})();
