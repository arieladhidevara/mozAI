window.runCreatedResizeChecks=async function(){
  const core=window.MosaicCore,{state,canvas,overlay,makeCanvas}=core;
  const assert=(ok,message)=>{if(!ok)throw Error(message)},pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),checks=[];
  const pointer=(type,x,y)=>{const r=overlay.getBoundingClientRect();overlay.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'mouse',button:0,pointerId:87,clientX:r.left+x/canvas.width*r.width,clientY:r.top+y/canvas.height*r.height}))};
  const setCapture=Element.prototype.setPointerCapture;Element.prototype.setPointerCapture=()=>{};
  const auth=window.MosaicAuth.request,account=window.MosaicAccount.request;let requests=0;
  window.MosaicAuth.request=async(path,...args)=>{if(path.startsWith('/api/ai/')){requests++;throw Error('Fixture: no AI')}return auth(path,...args)};
  window.MosaicAccount.request=async(path,...args)=>{if(path.startsWith('/api/ai/')){requests++;throw Error('Fixture: no AI')}return account(path,...args)};
  try{
    document.querySelector('.guide-skip')?.click();
    const base=makeCanvas(600,400),ctx=base.getContext('2d');ctx.fillStyle='#ddd';ctx.fillRect(0,0,600,400);ctx.fillStyle='#888';ctx.fillRect(60,80,100,180);
    state.reference=base;core.setMaster(base,'Resize created object',false);core.updateZoomFit();
    const nativeMask=makeCanvas(600,400);nativeMask.getContext('2d').fillRect(60,80,100,180);
    let native=core.newGroup(nativeMask,'Wall');native.name='Original wall';native.mapPrepared=true;const nativeId=native.id;
    core.selectGroupMask(native);core.showQuickPrompt(null,true,false);
    assert(document.getElementById('createdResizeBtn').hidden,'Resize must be hidden for original scene objects');
    const master=state.master.toDataURL();
    const red=await window.MosaicPaint.paint(native,'#cc3333');
    assert(red&&native.active===red&&state.patches.get(red).name==='Paint #cc3333','Painting Original did not create a named color option');
    await core.chooseGroupOption(native,null);
    const blue=await window.MosaicPaint.paint(native,'#3366cc');
    assert(blue!==red&&native.patchIds.length===2&&state.patches.get(red).paintColor==='#cc3333','Painting Original overwrote its earlier color option');
    assert(state.master.toDataURL()===master,'Painting changed the original image');
    checks.push('Painting Original creates independent named color options and leaves the original image intact');
    const rgb=makeCanvas(60,90),rc=rgb.getContext('2d');rc.fillStyle='#aa7744';rc.fillRect(0,0,60,90);rc.clearRect(10,20,12,15);
    const mask=makeCanvas(60,90);mask.getContext('2d').drawImage(rgb,0,0);
    const full=makeCanvas(600,400);full.getContext('2d').drawImage(mask,260,160);
    let created=core.newGroup(full,'Furniture');created.name='Created cabinet';created.createdLocally=true;
    const createdId=created.id,sid=core.uid('source'),pid=core.uid('patch');
    state.sources.set(sid,{id:sid,canvas:rgb,crop:{x:260,y:160,width:60,height:90}});
    state.patches.set(pid,{id:pid,groupId:createdId,sourceId:sid,mask,maskOffset:{x:260,y:160},bbox:{x:260,y:160,w:60,h:90},name:'Cabinet',createObject:true});created.active=pid;created.patchIds=[pid];
    core.refreshGroupFootprint(created);core.selectGroupMask(created);core.showQuickPrompt(null,true,false);window.MosaicMobile?.openAI();
    const resize=document.getElementById('createdResizeBtn');assert(!resize.hidden,'Created option has no Resize in More');
    const panel=document.getElementById('quickPromptMorePanel');if(panel.hidden)document.getElementById('quickPromptMore').click();
    resize.click();assert(state.tool==='resize','Resize did not activate');
    assert(getComputedStyle(document.getElementById('quickAreaPromptForm')).display==='none','More panel obstructed the resize handles');
    const vectors=document.getElementById('selectionOutlineVectors');assert(vectors.querySelectorAll('rect').length===4,'Resize should show four box handles');
    const sourceBefore=rgb.toDataURL(),nativeBefore=core.groupMask(native).toDataURL(),history=state.undo.length;
    pointer('pointerdown',320,250);pointer('pointermove',350,295);pointer('pointermove',380,340);pointer('pointerup',380,340);
    const patch=state.patches.get(pid),bounds=core.exactMaskBoundingBox(core.displayedPatchMask(patch));
    assert(patch.corners[0].x===260&&patch.corners[0].y===160&&patch.corners[2].x===380&&patch.corners[2].y===340,'Resize changed the aspect ratio or opposite anchor');
    // Canvas interpolation may add a one-pixel antialias fringe outside the quad.
    assert(bounds.x>=259&&bounds.y>=159&&bounds.w>=120&&bounds.w<=122&&bounds.h>=180&&bounds.h<=182,'Resized mask does not follow its displayed quad');
    assert(state.undo.length===history+1,'Resize drag should be one Undo action');
    const pixel=core.renderedPatchLayer(patch).getContext('2d').getImageData(270,170,1,1).data;
    const hole=core.displayedPatchMask(patch).getContext('2d').getImageData(288,215,1,1).data;
    assert(pixel[3]===255&&hole[3]===0,'Image and resized mask lost alignment or filled a hole');
    assert(rgb.toDataURL()===sourceBefore&&core.groupMask(native).toDataURL()===nativeBefore,'Resize changed source pixels or another object');
    assert(core.groupMaskCrop(created).mask.width===bounds.w,'Selection crop retained the old mask size');
    checks.push('More opens a proportional resize box; RGB, mask, holes and selection crop resize together');
    document.getElementById('undoBtn').click();assert(core.exactMaskBoundingBox(core.groupMask(created)).w===60,'Undo lost the original size');
    document.getElementById('redoBtn').click();assert(core.exactMaskBoundingBox(core.groupMask(created)).w===bounds.w,'Redo lost the resized mask');
    overlay.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(state.tool==='select','Escape should finish Resize');
    checks.push('Resize supports Undo/Redo and Escape without affecting other objects');
    const saved=await window.MosaicProjects.buildProjectData();
    assert(await window.MosaicProjects.loadProjectFile(new File([JSON.stringify(saved)],'resize.moz'),{recovery:true}),'Save/Load failed');await pause(150);
    created=state.groups.find(g=>g.id===createdId);native=state.groups.find(g=>g.id===nativeId);
    assert(core.exactMaskBoundingBox(core.groupMask(created)).w===bounds.w&&native.patchIds.length===2,'Save/Load lost resize or native color options');
    core.selectGroupMask(created);core.showQuickPrompt(null,true,false);window.MosaicMobile?.openAI();
    assert(!document.getElementById('createdResizeBtn').hidden,'Resize disappeared after project load');
    if(document.getElementById('quickPromptMorePanel').hidden)document.getElementById('quickPromptMore').click();
    document.querySelector('.guide-skip')?.click();
    checks.push('Resized placement/mask and both Original paint options persist in the .moz project');
    return {passed:checks.length,checks};
  }finally{Element.prototype.setPointerCapture=setCapture;window.MosaicAuth.request=auth;window.MosaicAccount.request=account}
};

window.runInitialMaskEdgeChecks=async function(){
  const core=window.MosaicCore,{state,makeCanvas}=core,assert=(ok,msg)=>{if(!ok)throw Error(msg)};
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const utils=await import('/object-map-utils.mjs'),{PALETTE}=utils;
  const auth={request:window.MosaicAuth.request,isReady:window.MosaicAuth.isReady,restore:window.MosaicAuth.restore};
  let maps=0,labels=0;
  window.MosaicAuth.isReady=()=>true;window.MosaicAuth.restore=async()=>true;
  window.MosaicAuth.request=async(path,body)=>{
    if(path!=='/api/ai/object-map')throw Error('Unexpected request '+path);
    if(body.action==='labels'){labels++;return {objects:body.ids.map((id,index)=>({id,label:index?'Chair':'Wall',category:index?'Furniture':'Wall',group:'Room'}))}}
    maps++;
    const raster=makeCanvas(1024,1024),ctx=raster.getContext('2d');ctx.fillStyle=PALETTE[0].color;ctx.fillRect(0,0,1024,1024);
    ctx.fillStyle=PALETTE[1].color;ctx.fillRect(150,180,300,500);ctx.fillRect(200,680,1,80);
    ctx.fillRect(450,300,1,1);ctx.fillRect(450,500,1,1); // False protrusions absent from the photo.
    ctx.fillStyle='#000';ctx.fillRect(250,300,4,8);
    return {image:raster.toDataURL('image/png').split(',')[1],legend:[],labelsAvailable:false};
  };
  try{
    const base=makeCanvas(2048,2048),ctx=base.getContext('2d');ctx.fillStyle='#ddd';ctx.fillRect(0,0,2048,2048);
    ctx.fillStyle='#8a4e32';ctx.fillRect(300,360,600,1000);ctx.fillRect(400,1360,2,160);
    ctx.fillStyle='#ddd';ctx.fillRect(500,600,8,16);
    state.reference=base;core.setMaster(base,'Initial mask edge fixture',true);core.updateZoomFit();
    for(let i=0;i<500;i++){if(state.objectMap?.edgeCleanup&&state.groups.some(g=>g.mapPrepared)&&labels)break;await pause(20)}
    const map=state.objectMap;assert(map?.edgeCleanup?.changed>=2,'Initial masking did not use original-photo edge cleanup: '+JSON.stringify({cleanup:map?.edgeCleanup,maps,labels,status:document.getElementById('objectMapStatus').textContent,groups:state.groups.length}));
    const object=map.entries.find(e=>e.colorId===2),group=state.groups.find(g=>g.objectMapInstanceId===object?.id);
    assert(group,'Initial object group missing');
    const crop=core.groupMaskCrop(group),mask=core.groupMask(group),ctxMask=mask.getContext('2d');
    const at=(x,y)=>ctxMask.getImageData(x,y,1,1).data[3];
    assert(at(900,600)===0&&at(900,1000)===0,'False edge spikes survived');
    assert(at(503,605)===0,'A true opening was filled');
    assert(at(400,1400)>0,'Thin chair leg was removed');
    const data=crop.mask.getContext('2d').getImageData(0,0,crop.mask.width,crop.mask.height).data;
    assert(data.some((v,i)=>i%4===3&&v>0&&v<255),'Upscaled object mask still has only hard pixel edges');
    assert(maps===1,'Edge cleanup repeated paid mapping');
    core.selectGroupMask(group);core.showQuickPrompt(null,true,false);document.querySelector('.guide-skip')?.click();
    return {passed:3,checks:['Initial map corrects photo-unsupported edge spikes','True openings and a thin chair leg remain selectable','Upscaled mask uses antialiased edges with one mapping request'],correctedPixels:map.edgeCleanup.changed,mapRequests:maps};
  }finally{Object.assign(window.MosaicAuth,auth)}
};
