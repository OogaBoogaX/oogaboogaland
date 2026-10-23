(() => {
  "use strict";
  const BL = window.BL, { createNode, addChild, createCamera } = BL.scene;
  const model = BL.models.caveman(BL.contributors.traitsFor("SatsMason"));
  const root = createNode(), camera = createCamera({ fov: 38, near: 0.1, far: 30 });
  addChild(root, model.root, createNode({ geometry: BL.models.box({ w: 16, h: 0.08, d: 16, color: "#61645d", offset: { x: 0, y: -0.06, z: 0 } }) }));
  camera.position.x = 0; camera.position.y = 1.35; camera.position.z = 3.9;
  camera.target.x = 0; camera.target.y = 1.05; camera.target.z = 0;
  const renderer = BL.glRenderer.createRenderer(document.getElementById("model"), { quality: "high" });
  const opts = { clear: [0.14,0.16,0.15], light: { x: 0.35, y: 0.8, z: 0.7 }, sky: [0.60,0.65,0.70], ground: [0.3,0.28,0.24], sun: [1,0.94,0.85], ambientFloor: 0.12, diffuseFloor: 0.12, shadowFloor: 0.25, shadowCenter: { x: 0, y: 1, z: 0 }, shadowExtent: 3, bloomStrength: 0.4 };
  model.parts.gun.visible = false; model.parts.snack.visible = false;
  const equipment=document.getElementById("equipment");
  for(const tool of [...model.tools,{id:"holster",label:"Holster all"}]) {
    const option=document.createElement("option");option.value=tool.id;option.textContent=tool.label;equipment.append(option);
  }
  const equip=()=>{
    const index=model.tools.findIndex((tool)=>tool.id===equipment.value),held=index>=0;
    if(held) BL.models.setTool(model,index);
    model.parts.club.rotation.x=model.clubCarry.x;model.parts.club.rotation.y=0;model.parts.club.rotation.z=model.clubCarry.z;
    model.parts.club.visible=held;
    BL.models.poseTools(model,held);
    document.getElementById("status").textContent=held?`${model.tools[index].label} drawn · remaining tools stowed` : "All equipment holstered · hands free";
  };
  equipment.addEventListener("change",equip);equip();
  let walking = false, start = performance.now(), raf = 0;
  const buttons = document.querySelectorAll("[data-yaw]");
  const select = (button) => {
    model.root.rotation.y = Number(button.dataset.yaw);
    for (const other of buttons) other.setAttribute("aria-pressed", String(other === button));
  };
  for (const button of buttons) button.addEventListener("click", () => select(button));
  select(buttons[0]);
  const walk = document.getElementById("walk");
  walk.addEventListener("click", () => { walking = !walking; walk.setAttribute("aria-pressed", String(walking)); });

  const metrics=document.getElementById("metrics");
  const geometries=new Set();
  const count=(node)=>{if(node.geometry)geometries.add(node.geometry);for(const child of node.children)count(child);};
  count(model.root);
  let triangles=0;
  for(const geo of geometries)for(const face of geo.faces)triangles+=face.i.length-2;
  let samples=0,renderMs=0,frameMs=0,last=0;
  const draw = (now) => {
    const phase = (now - start) / 1000 * 5, stride = walking ? Math.sin(phase) : 0;
    model.parts.armR.rotation.x = -0.2 + stride * 0.35; model.parts.armL.rotation.x = -0.2 - stride * 0.35;
    model.parts.legR.rotation.x = stride * 0.3; model.parts.legL.rotation.x = -stride * 0.3;
    BL.models.poseTools(model,model.parts.club.visible);
    const before=performance.now();
    renderer.render(root, camera, opts);
    if(!document.hidden && last && now-last<100) {
      renderMs+=performance.now()-before;frameMs+=now-last;samples++;
      if(samples===120) {
        metrics.textContent=`${triangles.toLocaleString()} unique mesh triangles · ${(renderMs/samples).toFixed(1)} ms render submission · ${(1000*samples/frameMs).toFixed(0)} delivered FPS`;
        samples=0;renderMs=0;frameMs=0;
      }
    }
    last=now;
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  window.addEventListener("pagehide", () => { cancelAnimationFrame(raf); renderer.dispose(); }, { once: true });
})();
