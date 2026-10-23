// The converter replaces __ASSET_DATA__ with packed, engine-native mesh data.
(() => {
  "use strict";
  const BL = window.BL;
  const ART = BL.satsMasonArt.body;
  const EQUIPMENT = {...BL.satsMasonArt.equipment,...BL.satsMasonKit};
  const { moved, merge, lathe, tube } = BL.models;
  const { createNode, addChild } = BL.scene;
  // Decode once per character template; clones share the authored geometry.
  const bytes = (text) => {
    const size = text.length * 3 / 4 - (text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0), out = new Uint8Array(size);
    const digit = (c) => c >= 65 && c <= 90 ? c - 65 : c >= 97 && c <= 122 ? c - 71 : c >= 48 && c <= 57 ? c + 4 : c === 43 ? 62 : c === 47 ? 63 : 0;
    let at = 0;
    for (let i = 0; i < text.length; i += 4) {
      const n = digit(text.charCodeAt(i)) * 262144 + digit(text.charCodeAt(i+1)) * 4096 + digit(text.charCodeAt(i+2)) * 64 + digit(text.charCodeAt(i+3));
      if (at < size) out[at++] = n >>> 16;
      if (at < size) out[at++] = n >>> 8 & 255;
      if (at < size) out[at++] = n & 255;
    }
    return out;
  };
  // Separate immutable topology for the wall cue; visible art keeps all detail.
  const cueGeometry = (name, p = BL.satsMasonCues[name]) => {
    if (!p) return null;
    const q = new Uint16Array(bytes(p.v).buffer), indices = new Uint16Array(bytes(p.i).buffer);
    const verts = new Array(q.length), faces = new Array(indices.length / 3);
    for (let i = 0; i < q.length; i++) { const a = i % 3; verts[i] = p.min[a] + q[i] / 65535 * (p.max[a] - p.min[a]); }
    for (let i = 0; i < faces.length; i++) faces[i] = { i: [indices[i*3],indices[i*3+1],indices[i*3+2]], color: [160,168,142], emissive: 0 };
    return { verts, faces, lines: [] };
  };
  const geometry = (name, source = ART.parts) => {
    const p = source[name], q = new Uint16Array(bytes(p.v).buffer), n = new Int8Array(bytes(p.n).buffer), c = bytes(p.c), e = bytes(p.e);
    const indices = p.i ? new Uint16Array(bytes(p.i).buffer) : null;
    const verts = new Array(q.length), normals = new Array(n.length), faces = new Array(c.length / 3);
    for (let i = 0; i < q.length; i++) { const axis = i % 3; verts[i] = p.min[axis] + q[i] / 65535 * (p.max[axis] - p.min[axis]); normals[i] = n[i] / 127; }
    for (let i = 0; i < faces.length; i++) faces[i] = { i: indices ? [indices[i*3],indices[i*3+1],indices[i*3+2]] : [i*3,i*3+1,i*3+2], color: [c[i*3],c[i*3+1],c[i*3+2]], emissive: e[i] / 255 };
    return { verts, normals, faces, lines: [], cueGeometry: cueGeometry(name,p.cue) };
  };
  const cord = (points,radius,color) => tube({ path(t) {
    const at=t*(points.length-1), i=Math.min(points.length-2,Math.floor(at)), f=at-i,a=points[i],b=points[i+1];
    return {x:a[0]+(b[0]-a[0])*f,y:a[1]+(b[1]-a[1])*f,z:a[2]+(b[2]-a[2])*f};
  }, radius:()=>radius, rings:points.length*3, segments:6, colorFn:()=>color });
  // Store only the exposed grip; the complete working tool is used when drawn.
  const sheathedGrip = (geo, top) => {
    const out = { verts: [], normals: [], faces: [], lines: [] }, hasNormals = !!geo.normals?.length;
    for (const face of geo.faces) for (let fan = 1; fan + 1 < face.i.length; fan++) {
      const polygon = [face.i[0],face.i[fan],face.i[fan+1]].map(i => [...geo.verts.slice(i*3,i*3+3),...(hasNormals ? geo.normals.slice(i*3,i*3+3) : [])]);
      const clipped = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i+1)%polygon.length];
        if (a[1] <= top) clipped.push(a);
        if ((a[1] <= top) !== (b[1] <= top)) {
          const t = (top-a[1])/(b[1]-a[1]); clipped.push(a.map((v,k) => v+(b[k]-v)*t));
        }
      }
      const base = out.verts.length/3;
      for (const v of clipped) {
        out.verts.push(v[0],v[1],v[2]);
        if (hasNormals) { const length = Math.hypot(v[3],v[4],v[5]) || 1; out.normals.push(v[3]/length,v[4]/length,v[5]/length); }
      }
      for (let i = 1; i+1 < clipped.length; i++) out.faces.push({...face,i:[base,base+i,base+i+1]});
    }
    if (!hasNormals) delete out.normals;
    if (geo.cueGeometry) out.cueGeometry = sheathedGrip(geo.cueGeometry, top);
    return out;
  };
  const sliotar = () => {
    const r=.036, profile=[];
    for(let i=0;i<=16;i++){const t=i*Math.PI/16;profile.push([r*Math.sin(t),-r*Math.cos(t)]);}
    const skin=lathe({profile,segments:32,color:"#ece3c8"}); skin.smooth=true;
    const pieces=[skin];
    for(let half=0;half<2;half++) {
      const points=[];
      for(let i=0;i<=64;i++){const t=i*Math.PI/32, a=t+half*Math.PI/2;
        points.push([Math.cos(a)*r,Math.sin(a)*r*.82,Math.sin(a)*r*.57*(half?-1:1)]);}
      pieces.push(cord(points,.0018,"#b69b70"));
      for(let i=0;i<32;i++){const a=i*Math.PI/16+half*Math.PI/2;
        const x=Math.cos(a)*r,y=Math.sin(a)*r*.82,z=Math.sin(a)*r*.57*(half?-1:1);
        pieces.push(cord([[x-.0015,y,z-.0025],[x+.0015,y,z+.0025]],.00065,"#6c5b43"));}
    }
    const result=merge(...pieces);
    result.normals=[];
    for(let i=0;i<result.verts.length;i+=3) {
      if(i<skin.verts.length) {
        const n=Math.hypot(result.verts[i],result.verts[i+1],result.verts[i+2]);
        result.normals.push(result.verts[i]/n,result.verts[i+1]/n,result.verts[i+2]/n);
      } else result.normals.push(0,0,0);
    }
    // Leather ribs/stitches do not need thousands of triangles in a hidden cue.
    const silhouette = [];
    for (let i = 0; i <= 8; i++) { const t = i * Math.PI / 8; silhouette.push([.0378*Math.sin(t),-.0378*Math.cos(t)]); }
    result.cueGeometry = lathe({ profile: silhouette, segments: 12, color: "#a0a88e" });
    return result;
  };
  BL.characters.add({
    handle: "SatsMason", joined: 1791072000, lastCommit: 1791072000,
    look: { height: 1.3, bald: true, noBrow: true, noPupils: true, face: "none", skin: "#6c6655", hair: "#4c5040", fur: "#595c49" },
    dress: {
      gear(k) {
        k.root.position.y = ART.baseY;
        for (const key of ["torso", "armR", "armL", "legR", "legL"]) {
          k.parts[key].geometry = geometry(key);
          const p = ART.parts[key].pivot;
          k.parts[key].position.x = p[0]; k.parts[key].position.y = p[1]; k.parts[key].position.z = p[2];
          k.parts[key].scale.x = k.parts[key].scale.y = k.parts[key].scale.z = 1;
        }
        k.parts.fingersR.visible = k.parts.fingersL.visible = false;
      },
      skull(k) {
        const open = geometry("head"), p = ART.parts.head;
        const closed = { ...open, faces: open.faces.map((f,i) => p.eyes.includes(i) ? { ...f, color: [67,66,49], emissive: 0 } : f) };
        k.headGeometry = { open, closed, portrait: open };
        return true;
      },
      eyes() { return true; },
      headgear(k) {
        const p = ART.parts.head.pivot;
        k.parts.head.position.x = p[0]; k.parts.head.position.y = p[1]; k.parts.head.position.z = p[2];
      },
      club: () => {
        const tools=[{id:"hurley",label:"Hurley",geometry:geometry("hurley",EQUIPMENT)},{id:"chisel",label:"Flat chisel",geometry:geometry("chisel",EQUIPMENT)},
          {id:"trowel",label:"Trowel",geometry:geometry("trowel",EQUIPMENT),carry:{x:1.65,z:.22}},{id:"point",label:"Point chisel",geometry:geometry("point",EQUIPMENT)}];
        return {default:tools[0].geometry,gold:tools[0].geometry,tools,rest:{x:Math.PI-.12,z:.06},carry:{x:Math.PI-.16,z:.06}};
      },
      extras(k) {
        const leather={bib:geometry("apronBib",EQUIPMENT),skirts:[geometry("apronR",EQUIPMENT),geometry("apronL",EQUIPMENT)]};
        addChild(k.parts.torso,createNode({geometry:leather.bib}));
        k.parts.apronFlaps=leather.skirts.map((geo,i)=>{
          const x=k.parts[i===0?"legR":"legL"].position.x;
          if (geo.cueGeometry) moved(geo.cueGeometry,-x,.24,-.35);
          return createNode({position:{x,y:-.24,z:.35},geometry:moved(geo,-x,.24,-.35)});
        });
        addChild(k.parts.torso,...k.parts.apronFlaps);
        const tools=k.tools;
        k.parts.toolStowed=tools.map((tool,i)=> {
          if (i===0) return createNode({geometry:tool.geometry,position:{x:-.21,y:-.27,z:-.46},rotation:{x:.06,y:0,z:-.40}});
          const trowel = tool.id==="trowel", flap = k.parts.apronFlaps[trowel?1:0];
          const x = trowel ? .22 : tool.id==="chisel" ? -.145 : -.055, y = -.205, z = trowel ? .43 : .425;
          const node = createNode({geometry:sheathedGrip(tool.geometry,trowel ? .05 : .04),
            position:{x:x-flap.position.x,y:y-flap.position.y,z:z-flap.position.z},rotation:{x:Math.PI,y:0,z:0}});
          addChild(flap,node);
          return node;
        });
        addChild(k.parts.torso,k.parts.toolStowed[0]);
        // The hurley retains two quiet loops on the back; the front stays clear.
        const mount=[];
        for(const t of [.16,.43]) {
          const x=-.21+Math.sin(.4)*t,y=-.27+Math.cos(.4)*t,z=-.46;
          mount.push(cord([[x-.025,y+.022,z+.02],[x-.028,y-.022,z-.02],[x+.028,y-.022,z-.02],[x+.025,y+.022,z+.02]],.009,"#66432c"));
        }
        addChild(k.parts.torso,createNode({geometry:merge(...mount)}));
        k.parts.ballHeld=createNode({geometry:sliotar(),position:{x:0,y:-.625*k.h,z:.15*k.h}});
        k.parts.ballStowed=createNode({geometry:k.parts.ballHeld.geometry,position:{x:.35,y:-.18,z:.40}});
        addChild(k.parts.armL,k.parts.ballHeld);addChild(k.parts.torso,k.parts.ballStowed);
      }
    }
  });
})();
