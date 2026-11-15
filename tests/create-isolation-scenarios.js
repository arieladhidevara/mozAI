// Isolated browser regression: Create must never steal the existing Object ID or its pixels.
window.runCreateIsolationChecks=async function(){
  const core=window.MosaicCore,ai=window.MosaicPremium,{state,canvas,overlay,makeCanvas}=core;
  const failedInitially=Boolean(window.createSAMFailure);let imageRequests=0;
  const checks=[],assert=(ok,description)=>{if(!ok)throw Error(description)};
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async predicate=>{for(let i=0;i<350;i++){if(predicate())return;await pause(20)}throw Error('Create scenario timed out')};
  const capture=Element.prototype.setPointerCapture,release=Element.prototype.releasePointerCapture;
  const originalAuth={ensure:window.MosaicAuth.ensure,request:window.MosaicAuth.request};
  const originalSamRequest=window.MosaicAccount.request;
  Element.prototype.setPointerCapture=()=>{};Element.prototype.releasePointerCapture=()=>{};
  const pointer=(type,x,y)=>{
    const r=overlay.getBoundingClientRect();
    overlay.dispatchEvent(new PointerEvent(type,{bubbles:true,button:0,pointerType:'mouse',pointerId:74,
      clientX:r.left+x/canvas.width*r.width,clientY:r.top+y/canvas.height*r.height}));
  };
  try{
    await window.MosaicAccount.ready();
    const base=makeCanvas(640,480),x=base.getContext('2d');
    x.fillStyle='#eeeeee';x.fillRect(0,0,640,480);
    x.fillStyle='#a08060';x.fillRect(100,80,400,330);
    state.reference=base;core.setMaster(base,'Create placement fixture',false);core.updateZoomFit();
    const existingMask=makeCanvas(640,480),m=existingMask.getContext('2d');
    m.fillStyle='#ffffff';m.fillRect(100,80,400,330);
    const wall=core.newGroup(existingMask,'Wall');wall.name='Existing wall';wall.mapPrepared=true;
    const wallId=wall.id,originalScene=core.composeApprovedCanvas().toDataURL();
    core.selectGroupMask(wall,{showOutline:true});
    assert(state.draftGroupId===wallId,'Fixture did not select existing object');
    core.selectTool('rect');
    assert(state.draftGroupId!==wallId&&state.selectionMode==='new',
      'Create did not clear the existing selection and restore New mode');
    pointer('pointerdown',190,160);pointer('pointermove',320,310);pointer('pointerup',320,310);
    const created=state.groups.find(group=>group.createdLocally);
    assert(created&&created.id!==wallId,'Create reused an underlying Object ID');
    assert(state.groups.some(group=>group.id===wallId),'Create removed the original object');
    assert(created.patchIds.length===1&&state.draftGroupId===created.id,'Create failed to select its new Group');
    assert(document.querySelector('.geometry-mode-switcher')?.hidden,
      'Create should hide Material/Shape/Remove and use transparent PNG mode');
    const placeholder=state.patches.get(created.active),source=state.sources.get(placeholder.sourceId);
    const pixels=source.canvas.getContext('2d').getImageData(0,0,640,480).data;
    assert(pixels.every((value,index)=>index%4!==3||value===0),'Create copied underlying wall pixels');
    assert(core.composeApprovedCanvas().toDataURL()===originalScene,'Drawing Create modified the original scene');
    checks.push('Drawing over an existing object starts a new object ID, empty foreground and unchanged scene');
    let samCreateRequests=0;
    window.MosaicAccount.request=async(path,options)=>{
      if(path==='/api/ai/sam3'){
        samCreateRequests++;
        if(window.createSAMFailure){const error=Error('ZeroGPU quota exceeded');error.code='SAM3_QUOTA';error.status=429;throw error}
        const {width,height,label}=options.body;
        assert(label==='person','SAM 3 received a supporting object instead of person');
        const sam=makeCanvas(width,height),ctx=sam.getContext('2d');
        ctx.fillStyle='#fff';ctx.fillRect(width*80/256,height*58/256,width*94/256,height*128/256);
        ctx.fillRect(2,2,1,1);
        return {mask:sam.toDataURL('image/png')};
      }
      return originalSamRequest(path,options);
    };
    window.MosaicAuth.ensure=async()=>true;
    let payload,finish;
    window.MosaicAuth.request=async(path,request)=>{
      if(path==='/api/ai/edit'){imageRequests++;payload=request;return new Promise(resolve=>{finish=resolve})}
      if(path==='/api/ai/object-intent'){assert(request.createObject===true,'Create resolver was not enabled');return {kind:'object',label:'person',confidence:.99,targets:[{label:'person',box:[313,227,680,727]}]}}
      if(path==='/api/ai/option-name')return {name:'New chair'};
      return {};
    };
    await ai.generateSelection('Add a person sitting on a chair, person only');
    await wait(()=>Boolean(payload));
    assert(payload.createObject===true,'Create generation fell back to Material Edit');
    assert(payload.crop.x<=70&&payload.crop.y<=40&&payload.crop.x+payload.crop.width>=440&&payload.crop.y+payload.crop.height>=430,
      'Create crop did not include the wider surrounding scene context');
    assert(Boolean(payload.placementGuide&&payload.context&&payload.mask&&payload.base),
      'Create omitted scene, Base, placement guide or approximate selection');
    assert(state.groups.some(g=>g.id===wallId),'Create request changed the old wall');
    checks.push('Generate bypasses existing Object Map and asks for a transparent foreground object');
    // A mock OpenAI cutout: transparent border + blue foreground + soft alpha shadow.
    const cutout=makeCanvas(256,256),c=cutout.getContext('2d');
    c.fillStyle='rgba(20,20,50,0.3)';c.beginPath();c.ellipse(128,203,80,20,0,0,Math.PI*2);c.fill();
    c.fillStyle='#3166bb';c.fillRect(80,58,94,128);
    c.fillStyle='#aa3333';c.fillRect(176,145,55,60);
    finish({image:cutout.toDataURL('image/png').split(',')[1],mimeType:'image/png'});
    await wait(()=>[...state.patches.values()].some(p=>p.createObject&&!p.generating&&!p.awaitingResult));
    assert(samCreateRequests===1,'Create should request SAM 3 exactly once');
    const completedCreate=[...state.patches.values()].find(p=>p.createObject&&!p.generating&&!p.awaitingResult);
    if(window.createSAMFailure){
      assert(completedCreate?.maskAlignmentStatus==='png-alpha'&&completedCreate.createCleanupWarning.includes('quota'),'Quota fallback was hidden or discarded the PNG');
    }else{
      assert(completedCreate?.maskAlignmentStatus==='sam3-smooth','Create skipped smooth SAM cleanup');
      assert(completedCreate.createSegmentationLabel==='person','Create lost its requested subject label');
    }
    if(failedInitially){
      assert(completedCreate.createCleanupPending&&created.active!==completedCreate.id,'Failed cleanup was automatically applied');
      assert(core.composeApprovedCanvas().toDataURL()===originalScene,'Unclean PNG changed the accepted scene');
      state.expandedObjectId=created.id;core.renderGroups();
      assert(document.querySelector('[data-action="retry-create-cleanup"][data-patch="'+completedCreate.id+'"]'),'Inline cleanup retry is missing');
      window.createSAMFailure=false;
      await ai.retryCreateCleanup(completedCreate.id);
      assert(!completedCreate.createCleanupPending&&created.active===completedCreate.id,'Retry did not apply the cleaned Option');
      assert(imageRequests===1&&samCreateRequests===2,'Cleanup retry generated another paid image or looped SAM requests');
      checks.push('Failed cleanup stays unapplied and an inline retry reuses the same generated image');
    }
    assert(state.groups.some(g=>g.id===wallId),'Create result removed the wall');
    assert(state.groups.some(g=>g.id===created.id),'Create result lost its independent Group');
    assert(core.composeApprovedCanvas().toDataURL()!==originalScene,'Transparent Create result did not composite');
    const cropPatch=state.patches.get(created.active),cropSource=state.sources.get(cropPatch.sourceId);
    if(!failedInitially){
      const px=Math.floor(payload.crop.x+202/256*payload.crop.width-cropSource.crop.x);
      const py=Math.floor(payload.crop.y+168/256*payload.crop.height-cropSource.crop.y);
      const chairAlpha=px<0||py<0||px>=cropSource.canvas.width||py>=cropSource.canvas.height?0:
        cropSource.canvas.getContext('2d').getImageData(px,py,1,1).data[3];
      assert(chairAlpha===0,'SAM cleanup kept the unrequested chair');
      assert(cropPatch.maskAlignmentCoverage>0&&cropPatch.maskAlignmentCoverage<1,'SAM cleanup did not remove any unwanted pixels');
      checks.push('SAM removes supporting furniture and noise using only the requested person label');
    }
    assert(cropPatch.maskOffset&&cropPatch.mask.width<canvas.width&&cropPatch.mask.height<canvas.height,
      'Create generated a full-scene mask instead of a lightweight cropped mask');
    assert(cropSource.crop&&cropSource.canvas.width<canvas.width&&cropSource.canvas.height<canvas.height,
      'Create kept a full-scene RGBA buffer unnecessarily');
    assert(cropPatch.bbox.x===cropPatch.maskOffset.x&&cropPatch.bbox.y===cropPatch.maskOffset.y,
      'Cropped Create mask is not positioned in world coordinates');
    assert(core.fullPatchMask(cropPatch).width===canvas.width,
      'Create full-mask expansion is not available for legacy editing');
    checks.push('Transparent PNG output is composited as a new object without changing the original Group');
    checks.push('Create uses cropped world-positioned RGBA/mask without full-image per-pixel readback');
    // Removing a new PNG cutout is just turning its own layer off. There is
    // already an accepted background underneath, so no image model is needed.
    const createdOption=created.active,generatedScene=core.composeApprovedCanvas().toDataURL();
    core.selectGroupMask(created,{showOutline:true});
    const formerAuth=window.MosaicAuth.request,formerSam=window.MosaicAccount.request;
    let extraCalls=0;
    window.MosaicAuth.request=async()=>{extraCalls++;throw Error('Remove must not call OpenAI')};
    window.MosaicAccount.request=async()=>{extraCalls++;throw Error('Remove must not call SAM 3')};
    document.getElementById('geometryRemoveBtn').click();
    const removed=state.patches.get(created.active);
    const optionCountAfterRemove=created.patchIds.length;
    assert(removed?.localCutoutRemoval&&removed.editMode==='remove','Remove did not create an empty local Option');
    assert(created.objectRemoved&&created.patchIds.includes(createdOption),'Remove discarded original Create Option');
    assert(core.composeApprovedCanvas().toDataURL()===originalScene,'Removing Create did not reveal original underlying scene');
    assert(extraCalls===0,'Removing Create made an unnecessary AI call');
    assert(document.querySelector('.region-group[data-group="'+created.id+'"]'),
      'Removed Create object disappeared from Groups, blocking restoration');
    await core.chooseGroupOption(created,createdOption,{showOutline:false});
    assert(!created.objectRemoved&&core.composeApprovedCanvas().toDataURL()===generatedScene,
      'Selecting prior Option failed to restore the cutout');
    core.selectGroupMask(created,{showOutline:true});
    document.getElementById('geometryRemoveBtn').click();
    assert(state.patches.get(created.active)===removed&&created.patchIds.length===optionCountAfterRemove,
      'Repeated Remove did not reuse its Option: '+JSON.stringify({same:state.patches.get(created.active)===removed,ids:created.patchIds,active:created.active,removed:removed.id}));
    window.MosaicAuth.request=formerAuth;
    window.MosaicAccount.request=formerSam;
    checks.push('Create Remove is instant, costs zero AI requests, and its Option remains reversible');
    return {passed:checks.length,checks};
  }finally{
    Object.assign(window.MosaicAuth,originalAuth);
    window.MosaicAccount.request=originalSamRequest;
    Element.prototype.setPointerCapture=capture;Element.prototype.releasePointerCapture=release;
  }
};

window.runCreateSAMFailureChecks=async function(){window.createSAMFailure=true;try{return await window.runCreateIsolationChecks()}finally{window.createSAMFailure=false}};
