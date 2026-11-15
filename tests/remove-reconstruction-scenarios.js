window.runRemoveReconstructionChecks=async function(failure=false,stale=false,sidebar=false){
  const core=window.MosaicCore,{state,makeCanvas}=core,checks=[];
  const assert=(ok,message)=>{if(!ok)throw Error(message)};
  const wait=async predicate=>{for(let i=0;i<500;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20))}throw Error('Removal timed out: '+document.getElementById('toast')?.textContent)};
  const shape=(x,y,w,h)=>{const c=makeCanvas(640,480);c.getContext('2d').fillRect(x,y,w,h);return c};
  const copy=c=>{const result=makeCanvas(640,480);result.getContext('2d').drawImage(c,0,0);return result};
  const pixel=(c,x,y)=>[...c.getContext('2d').getImageData(x,y,1,1).data];
  const has=(g,x,y)=>pixel(core.groupMask(g),x,y)[3]>128;
  const near=(actual,want)=>want.every((v,i)=>Math.abs(actual[i]-v)<18);
  const decode=uri=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const c=makeCanvas(img.width,img.height);c.getContext('2d').drawImage(img,0,0);resolve(c)};img.onerror=reject;img.src=uri});
  const chairMask=shape(220,130,200,220),tableFull=shape(100,250,400,100),lampMask=shape(315,170,35,45);
  const tableMask=copy(tableFull);tableMask.getContext('2d').globalCompositeOperation='destination-out';tableMask.getContext('2d').drawImage(chairMask,0,0);
  const wallFull=shape(0,0,640,480),wallCtx=wallFull.getContext('2d');wallCtx.globalCompositeOperation='destination-out';wallCtx.drawImage(tableFull,0,0);wallCtx.drawImage(lampMask,0,0);
  const wallMask=copy(wallFull);wallMask.getContext('2d').globalCompositeOperation='destination-out';wallMask.getContext('2d').drawImage(chairMask,0,0);
  const base=makeCanvas(640,480),ctx=base.getContext('2d');ctx.fillStyle='#dddddd';ctx.fillRect(0,0,640,480);ctx.fillStyle='#997744';ctx.fillRect(100,250,400,100);ctx.fillStyle='#335533';ctx.fillRect(220,130,200,220);
  state.reference=base;core.setMaster(base,'Remove chair and preserve ownership',false);document.getElementById('apiKeyDialog')?.close();
  const add=(name,mask)=>{const g=core.newGroup(mask,'Furniture');g.name=g.objectLabel=name;g.mapPrepared=true;return g};
  const table=add('table',tableMask),wall=add('wall',wallMask),chair=add('chair',chairMask);
  const cover=window.MosaicObjectCreateCut.create(shape(270,280,40,40),'Created foreground'),p=state.patches.get(cover.active);
  state.sources.get(p.sourceId).canvas.getContext('2d').fillStyle='#3366ee';state.sources.get(p.sourceId).canvas.getContext('2d').fillRect(0,0,640,480);cover.createdViaAI=true;core.invalidateDisplayedMask(p);
  const before=core.composeApprovedCanvas().toDataURL(),after=copy(base),afterCtx=after.getContext('2d');afterCtx.fillStyle='#dddddd';afterCtx.fillRect(220,130,200,220);afterCtx.fillStyle='#997744';afterCtx.fillRect(220,250,200,100);afterCtx.fillStyle='#ffcc22';afterCtx.fillRect(315,170,35,45);
  // Conflicting predictions on this small strip must not be assigned first-come-first-served.
  const uncertainWall=copy(wallFull);uncertainWall.getContext('2d').fillRect(220,250,200,5);
  const nativeAuth={ensure:window.MosaicAuth.ensure,request:window.MosaicAuth.request},nativeRequest=window.MosaicAccount.request;
  let recognition=null,removalPayload=null,generated=0;const labels=[];
  window.MosaicAuth.ensure=async()=>true;
  window.MosaicAuth.request=async(path,body)=>{
    if(path==='/api/ai/harmonize'){
      generated++;return {image:after.toDataURL('image/jpeg',.99).split(',')[1],mimeType:'image/jpeg'};
    }
    if(path==='/api/ai/reveal-context'){
      recognition=body;if(stale){const replacement=makeCanvas(640,480);replacement.getContext('2d').fillStyle='#112233';replacement.getContext('2d').fillRect(0,0,640,480);state.reference=replacement;core.setMaster(replacement,'Replacement project',false)}if(failure)throw Error('Vision unavailable');
      return {targets:[{label:'table',box:[156,521,781,729],existingId:table.id,confidence:.96},{label:'wall',box:[0,0,1000,1000],existingId:wall.id,confidence:.98},{label:'lamp',box:[492,354,547,448],existingId:'',confidence:.95}]};
    }
    if(path==='/api/ai/edit-context')return {targetObject:'table',confidence:.99};
    if(path==='/api/ai/option-name')return {name:'Red'};
    if(path==='/api/ai/edit'&&body.editIntent==='remove'){
      generated++;removalPayload=body;const frame=await decode(body.collage);
      frame.getContext('2d').drawImage(after,body.crop.x,body.crop.y,body.crop.width,body.crop.height,0,0,frame.width,frame.height);
      return {image:frame.toDataURL('image/jpeg',.99).split(',')[1],mimeType:'image/jpeg'};
    }
    if(path==='/api/ai/object-intent')return {kind:'area',label:'',confidence:0,geometry:'uncertain',behind:[]};
    if(path==='/api/ai/classify')return {category:'Furniture'};
    if(path==='/api/ai/edit'){
      const image=await decode(body.collage),red=makeCanvas(640,480),r=red.getContext('2d');r.fillStyle='#cc3344';r.fillRect(0,0,640,480);r.globalCompositeOperation='destination-in';r.drawImage(core.groupMask(state.groups.find(g=>g.id===table.id)),0,0);
      image.getContext('2d').drawImage(red,body.crop.x,body.crop.y,body.crop.width,body.crop.height,0,0,image.width,image.height);
      return {image:image.toDataURL('image/jpeg',.99).split(',')[1],mimeType:'image/jpeg'};
    }
    throw Error('Unexpected request '+path);
  };
  window.MosaicAccount.request=async(path,options)=>{
    if(path!=='/api/ai/sam3')return nativeRequest(path,options);
    labels.push(options.body.label);if(failure)throw Object.assign(Error('SAM quota'),{code:'SAM3_QUOTA',status:429});
    const masks={table:tableFull,wall:uncertainWall,lamp:lampMask};assert(masks[options.body.label],'Unexpected SAM label');
    return {mask:masks[options.body.label].toDataURL()};
  };
  try{
    core.selectGroupMask(chair,{showOutline:true});core.showQuickPrompt(null,true,false);
    if(sidebar){
      core.renderGroups();await wait(()=>document.querySelector('[data-group="'+chair.id+'"] [data-region-action="remove-group"]'));
      document.querySelector('[data-group="'+chair.id+'"] [data-region-action="remove-group"]').click();
    }else document.getElementById('geometryRemoveBtn').click();
    if(stale){
      await wait(()=>recognition&&state.groups.length===0);
      await new Promise(r=>setTimeout(r,100));
      assert(document.getElementById('geometryReviewBar').hidden,'Old removal preview appeared in replacement project');
      assert(!state.objectReconstruction?.events?.length,'Old ownership was attached to replacement project');
      assert(labels.length===0,'Stale analysis still requested SAM');
      assert(near(pixel(core.composeApprovedCanvas(),240,300),[17,34,51]),'Stale output changed replacement project');
      return {passed:1,checks:['Changing project during analysis discards stale ownership, preview and SAM work']};
    }
    await wait(()=>!document.getElementById('geometryReviewBar').hidden);
    assert(recognition&&generated===1&&removalPayload?.mask,'Remove did not send a masked crop before recognizing revealed objects');
    const sent=await decode(removalPayload.collage),c=removalPayload.crop;
    assert(near(pixel(sent,Math.floor((285-c.x)/c.width*sent.width),Math.floor((295-c.y)/c.height*sent.height)),[51,85,51]),'Remove crop still includes foreground Create');
    assert(core.composeApprovedCanvas().toDataURL()===before,'Preview changed the approved image');
    document.getElementById('geometryApply').click();
    const event=state.objectReconstruction.events.at(-1),removedId=state.groups.find(g=>g.id===chair.id).active;
    assert(near(pixel(core.composeApprovedCanvas(),285,295),[51,102,238]),'Create foreground disappeared after removal');
    assert(!window.MosaicObjectMap.hitTest({x:235,y:200})||window.MosaicObjectMap.hitTest({x:235,y:200}).id!==chair.id,'Removed chair remains selectable');
    checks.push('Remove retains its preview, original options, reconstruction and foreground Create');
    if(failure){
      assert(event.assignments.length===0&&core.exactMaskBoundingBox(event.unresolvedMask),'Service failure discarded unresolved reconstruction');
      assert(labels.length===1,'Quota failure caused repeated SAM calls');
      assert(!has(table,240,300),'Failure falsely enlarged the table mask');
      checks.push('Vision/SAM failure keeps pixels unassigned and stops after one quota response');
      return {passed:checks.length,checks};
    }
    assert(labels.join(',')==='table,wall,lamp','Vision labels were not sent to SAM');
    assert(has(table,240,300)&&!has(wall,240,300),'New table pixels do not belong to the original table');
    assert(has(wall,240,200)&&!has(table,240,200),'Wall continuation belongs to wrong object');
    assert(pixel(event.unresolvedMask,240,252)[3]>128&&!has(table,240,252)&&!has(wall,240,252),'Conflicting masks were assigned to an arbitrary owner');
    const lamp=state.groups.find(g=>g.objectLabel==='lamp');assert(lamp&&has(lamp,330,190),'Newly revealed object was not independently registered');
    assert(window.MosaicObjectMap.hitTest({x:240,y:300})?.id===table.id,'Clicking newly exposed table does not select table');
    checks.push('Existing table and wall gain precise masks; a new lamp stays independent; conflicts stay unassigned');
    const applied=core.composeApprovedCanvas().toDataURL();
    document.getElementById('undoBtn').click();assert(core.composeApprovedCanvas().toDataURL()===before,'Undo did not restore exact scene');
    document.getElementById('redoBtn').click();assert(core.composeApprovedCanvas().toDataURL()===applied,'Redo did not restore removal and ownership');
    checks.push('Undo and Redo restore the removal and all ownership changes together');
    const currentTable=state.groups.find(g=>g.id===table.id);core.selectGroupMask(currentTable,{showOutline:true});
    await window.MosaicPremium.generateSelection('Change table material to red',currentTable.id);
    await wait(()=>currentTable.active&&!state.patches.get(currentTable.active)?.generating);
    const edited=core.composeApprovedCanvas();assert(near(pixel(edited,240,300),[204,51,68]),'New table section did not receive red material');assert(near(pixel(edited,240,200),[221,221,221]),'Table edit changed the wall');assert(near(pixel(edited,285,295),[51,102,238]),'Table edit changed foreground Create');
    checks.push('Material editing covers newly revealed table while wall and created foreground stay intact');
    const currentChair=state.groups.find(g=>g.id===chair.id);
    await core.chooseGroupOption(currentChair,null,{showOutline:false});assert(core.groupMask(currentChair).toDataURL()===chairMask.toDataURL(),'Restoring Original changed native chair boundary');assert(!has(currentTable,240,300),'Restoring chair left table selectable through it');assert(state.groups.find(g=>g.id===lamp.id).reconstructionHidden,'Restoring chair left revealed lamp visible');assert(near(pixel(core.composeApprovedCanvas(),240,300),[51,85,51]),'Restoring chair left red table pixels on chair');
    await core.chooseGroupOption(currentChair,removedId,{showOutline:false});assert(has(currentTable,240,300),'Reapplying Removed option lost revealed table mask');
    checks.push('Original/Removed switching also restores and withdraws dependent masks and pixels');
    const expected=core.composeApprovedCanvas().toDataURL(),saved=await window.MosaicProjects.buildProjectData();
    assert(await window.MosaicProjects.loadProjectFile(new File([JSON.stringify(saved)],'remove.moz'),{recovery:true}),'Project reload failed');
    assert(core.composeApprovedCanvas().toDataURL()===expected,'Save/Load changed reconstructed image');assert(has(state.groups.find(g=>g.id===table.id),240,300),'Save/Load lost table ownership');
    checks.push('Project Save and Load preserve reconstruction, exact composition and object ownership');
    state.expandedObjectId=chair.id;core.renderGroups();
    const deleteOption=document.querySelector('[data-action="delete"][data-patch="'+removedId+'"]');
    assert(deleteOption,'Removed option cannot be deleted');deleteOption.click();
    const restored=state.groups.find(g=>g.id===chair.id);
    assert(restored&&!restored.objectRemoved&&!restored.active,'Deleting Removed option did not restore the original object');
    assert(!has(state.groups.find(g=>g.id===table.id),240,300),'Deleting Removed option retained stale table ownership');
    assert(state.groups.find(g=>g.id===lamp.id).reconstructionHidden,'Deleting Removed option retained a stale revealed object');
    checks.push('Deleting a Removed option restores the original and withdraws dependent ownership');
    return {passed:checks.length,checks};
  }finally{Object.assign(window.MosaicAuth,nativeAuth);window.MosaicAccount.request=nativeRequest}
};
window.runRemoveReconstructionFailureChecks=()=>window.runRemoveReconstructionChecks(true);

window.runRemoveReconstructionStaleChecks=()=>window.runRemoveReconstructionChecks(false,true);

window.runSidebarRemoveChecks=()=>window.runRemoveReconstructionChecks(false,false,true);

window.runShapeRevealedLayerChecks=async function(){
  const core=window.MosaicCore,{state,makeCanvas}=core;
  const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
  const mask=(x,y,w,h)=>{const c=makeCanvas(640,480);c.getContext('2d').fillRect(x,y,w,h);return c};
  const solid=color=>{const c=makeCanvas(640,480),ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,640,480);return c};
  const base=solid('#ddd');state.reference=base;core.setMaster(base,'Shape reveals background',false);
  const surface=core.newGroup(mask(100,100,50,200),'Walls'),subject=core.newGroup(mask(200,100,200,200),'Furniture');
  const fresh=mask(200,100,80,200),reveal=mask(280,100,120,200),source=solid('#557755');
  const ctx=source.getContext('2d');ctx.fillStyle='#ddd';ctx.fillRect(280,100,120,200);
  const patch={id:'shape',groupId:subject.id,sourceId:'shape-source',mask:mask(200,100,200,200),bbox:{x:200,y:100,w:200,h:200},geometryObjectMask:fresh,editMode:'shape'};
  state.patches.set(patch.id,patch);state.sources.set(patch.sourceId,{canvas:source});subject.patchIds=[patch.id];subject.active=patch.id;
  const revealedRGB=solid('#ddd');revealedRGB.getContext('2d').globalCompositeOperation='destination-in';revealedRGB.getContext('2d').drawImage(reveal,0,0);
  state.objectReconstruction={events:[{id:'shape-event',ownershipVersion:2,operation:'shape',groupId:subject.id,patchId:patch.id,sourceId:patch.sourceId,revealedRGB,assignments:[{groupId:surface.id,mask:reveal}]}]};
  const material={id:'surface-red',groupId:surface.id,sourceId:'red',mask:mask(100,100,300,200),bbox:{x:100,y:100,w:300,h:200},reconstructionEvents:['shape-event']};
  // Surface has pixels only in its original area plus its revealed continuation.
  material.mask.getContext('2d').clearRect(150,100,130,200);
  state.patches.set(material.id,material);state.sources.set('red',{canvas:solid('#cc3344')});surface.patchIds=[material.id];surface.active=material.id;
  window.MosaicReconstruction.sync();const result=core.composeApprovedCanvas(),pixel=x=>[...result.getContext('2d').getImageData(x,150,1,1).data].slice(0,3).join(',');
  assert(pixel(320)==='204,51,68','Shape result painted over the revealed surface material');
  assert(pixel(240)==='85,119,85','Surface reconstruction covered the new shape');
  return {passed:1,checks:['Shape renders its new silhouette separately from revealed surface material']};
};
