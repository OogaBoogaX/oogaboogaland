// The reviewed same-origin program catalogue shared by classic client scripts and the Worker.
// Adding an entry requires reviewed rights, accurate duration, captions/transcript and staged assets.
(() => {
  "use strict";
  const validate=rows=>{
    if(!Array.isArray(rows)||!rows.length||rows.length>32)return [];
    const ids=new Set(),path=(value,extension)=>typeof value==="string"&&new RegExp("^/media/[a-z0-9][a-z0-9._-]*\\.("+extension+")$").test(value);
    for(const row of rows){
      if(!row||typeof row.id!=="string"||! /^[a-z0-9][a-z0-9-]{0,39}$/.test(row.id)||ids.has(row.id)||typeof row.title!=="string"||!row.title.length||row.title.length>120||!path(row.url,"mp4|webm")||!Number.isFinite(row.duration)||row.duration<=0||row.duration>21600||!path(row.captions,"vtt")||!path(row.transcript,"txt")||typeof row.transcriptText!=="string"||row.transcriptText.length>4096)return [];
      ids.add(row.id);
    }
    return rows;
  };
  const sources=validate([
    {id:"sample",title:"Studio color study · 12 seconds",url:"/media/studio-sample.mp4",duration:12,captions:"/media/studio-sample.vtt",transcript:"/media/studio-sample.txt",transcriptText:"Moving synthetic color fields accompany a quiet generated 440 Hz tone for twelve seconds. There is no speech, music or recorded imagery."},
    {id:"sample-quiet",title:"Quiet color study · 8 seconds",url:"/media/studio-quiet.mp4",duration:8,captions:"/media/studio-quiet.vtt",transcript:"/media/studio-quiet.txt",transcriptText:"A different synthetic color animation accompanies a softer generated 220 Hz tone for eight seconds. There is no speech, music or recorded imagery."}
  ]).map(entry=>Object.freeze(entry));
  const byId=Object.create(null);
  for(const source of sources)byId[source.id]=source;
  const BL=typeof window!=="undefined"?(window.BL=window.BL||{}):(globalThis.BL=globalThis.BL||{});
  globalThis.BL=BL;
  BL.studioMedia=Object.freeze({sources:Object.freeze(sources),byId:Object.freeze(byId),validate});
})();
