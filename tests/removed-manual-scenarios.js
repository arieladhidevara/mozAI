window.runRemovedManualChecks=async function(all=false){
  const core=window.MosaicCore,{state,makeCanvas,overlay}=core,checks=[];
  const assert=(value,message)=>{if(!value)throw Error(message)};
  const wait=async predicate=>{for(let i=0;i<400;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20))}throw Error('Removed manual flow timed out')};
  const shape=(x,y,w,h)=>{const c=makeCanvas(640,480);c.getContext('2d').fillRect(x,y,w,h);return c};
  const copy=c=>{const d=makeCanvas(c.width,c.height);d.getContext('2d').drawImage(c,0,0);return d};
  const has=(g,x,y)=>core.groupMask(g).getContext('2d').getImageData(x,y,1,1).data[3]>128;
  const pixel=(c,x,y)=>[...c.getContext('2d').getImageData(x,y,1,1).data];
  const near=(a,b)=>b.every((v,i)=>Math.abs(a[i]-v)<20);
  const decode=uri=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const c=makeCanvas(img.width,img.height);c.getContext('2d').drawImage(img,0,0);resolve(c)};img.onerror=reject;img.src=uri});
  const chairMask=shape(220,130,200,220),tableMask=shape(100,250,400,100);
  tableMask.getContext('2d').globalCompositeOperation='destination-out';tableMask.getContext('2d').drawImage(chairMask,0,0);
  const wallMask=shape(0,0,640,480),wallCtx=wallMask.getContext('2d');wallCtx.globalCompositeOperation='destination-out';wallCtx.drawImage(shape(100,250,400,100),0,0);wallCtx.drawImage(chairMask,0,0);
  const base=makeCanvas(640,480),ctx=base.getContext('2d');ctx.fillStyle='#ddd';ctx.fillRect(0,0,640,480);ctx.fillStyle='#997744';ctx.fillRect(100,250,400,100);ctx.fillStyle='#335533';ctx.fillRect(220,130,200,220);
  state.reference=base;core.setMaster(base,'Removed area / manual Select Add',false);document.getElementById('apiKeyDialog')?.close();
  const add=(name,mask)=>{const g=core.newGroup(mask,'Furniture');g.name=g.objectLabel=name;g.manualName=true;g.mapPrepared=true;return g};
  const table=add('Table',tableMask),wall=add('Wall',wallMask),chair=add('Chair',chairMask);
  const cover=window.MosaicObjectCreateCut.create(shape(270,280,40,40),'Created foreground'),coverPatch=state.patches.get(cover.active),coverCtx=state.sources.get(coverPatch.sourceId).canvas.getContext('2d');coverCtx.fillStyle='#3366ee';coverCtx.fillRect(0,0,640,480);cover.createdViaAI=true;core.invalidateDisplayedMask(coverPatch);
  const originalComposition=core.composeApprovedCanvas().toDataURL(),nativeTable=core.groupMask(table).toDataURL(),nativeWall=core.groupMask(wall).toDataURL();
  const after=copy(base),afterCtx=after.getContext('2d');afterCtx.fillStyle='#ddd';afterCtx.fillRect(220,130,200,220);afterCtx.fillStyle='#997744';afterCtx.fillRect(220,250,200,100);
  let images=0,labels=0,sam=0,removal=null;
  const nativeAuth={ensure:window.MosaicAuth.ensure,request:window.MosaicAuth.request},nativeRequest=window.MosaicAccount.request,nativeCapture=Element.prototype.setPointerCapture;
  Element.prototype.setPointerCapture=()=>{};window.MosaicAuth.ensure=async()=>true;
  window.MosaicAuth.request=async(path,body)=>{
    if(path==='/api/ai/reveal-context'){labels++;throw Error('Remove must not label objects')}
    if(path==='/api/ai/classify')return {category:'Furniture'};
    if(path==='/api/ai/option-name')return {name:'Red'};
    if(path==='/api/ai/edit-context')return {targetObject:'table',confidence:.99};
    if(path==='/api/ai/object-intent')return {kind:'area',label:'',confidence:0,geometry:'uncertain',behind:[]};
    if(path==='/api/ai/edit'){
      images++;const image=await decode(body.collage),crop=body.crop;
      if(body.editIntent==='remove'){
        removal=body;image.getContext('2d').drawImage(after,crop.x,crop.y,crop.width,crop.height,0,0,image.width,image.height);
      }else{
        const red=makeCanvas(640,480),r=red.getContext('2d');r.fillStyle='#cc3344';r.fillRect(0,0,640,480);r.globalCompositeOperation='destination-in';r.drawImage(core.groupMask(state.groups.find(g=>g.id===table.id)),0,0);
        image.getContext('2d').drawImage(red,crop.x,crop.y,crop.width,crop.height,0,0,image.width,image.height);
      }
      return {image:image.toDataURL('image/jpeg',.99).split(',')[1],mimeType:'image/jpeg'};
    }
    throw Error('Unexpected AI request: '+path);
  };
  window.MosaicAccount.request=async(path,options)=>{if(path==='/api/ai/sam3'){sam++;throw Error('Remove must not segment objects')}return nativeRequest(path,options)};
  const get=id=>state.groups.find(g=>g.id===id);
  const at=(type,x,y)=>{const b=overlay.getBoundingClientRect();overlay.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:17,pointerType:'mouse',button:0,clientX:b.left+x/640*b.width,clientY:b.top+y/480*b.height}))};
  const claimRect=(g,x,y,w,h)=>{
    core.selectGroupMask(g,{showOutline:false});core.selectTool('select-rect');core.setMode('add');
    at('pointerdown',x,y);at('pointermove',x+w,y+h);at('pointerup',x+w,y+h);
  };
  try{
    core.selectGroupMask(chair,{showOutline:true});core.showQuickPrompt(null,true,false);document.getElementById('geometryRemoveBtn').click();
    await wait(()=>!document.getElementById('geometryReviewBar').hidden);
    assert(removal&&images===1&&labels===0&&sam===0,'Remove called segmentation or automatic labeling');
    assert(core.composeApprovedCanvas().toDataURL()===originalComposition,'Removal preview changed approved pixels');
    document.getElementById('geometryApply').click();
    const removedOption=get(chair.id).active,removedComposition=core.composeApprovedCanvas().toDataURL();
    assert(state.groups.length===4,'Remove registered guessed objects');
    assert(get(chair.id).name==='Removed'&&has(get(chair.id),240,300)&&has(get(chair.id),240,200),'Removed did not retain its exact selectable region');
    assert(core.groupMask(get(table.id)).toDataURL()===nativeTable&&core.groupMask(get(wall.id)).toDataURL()===nativeWall,'Remove automatically extended another object');
    assert(window.MosaicObjectMap.hitTest({x:240,y:300})?.id===chair.id,'Clicking unclaimed area does not select Removed');
    checks.push('Remove performs one image edit, retains a selectable Removed region, and calls no labeling or SAM');
    claimRect(get(table.id),200,240,100,80);
    assert(has(get(table.id),240,300)&&!has(get(chair.id),240,300),'Select Add did not transfer drawn pixels to Table');
    assert(has(get(chair.id),350,300)&&!has(get(table.id),350,300),'Select Add transferred unselected Removed pixels');
    assert(has(get(chair.id),240,200)&&!has(get(wall.id),240,200),'Select Add changed Wall ownership automatically');
    assert(state.draftGroupId===table.id&&state.groups.length===4,'Select Add created a new object or lost the selected owner');
    assert(core.composeApprovedCanvas().toDataURL()===removedComposition,'Claiming ownership changed scene pixels');
    assert(window.MosaicObjectMap.hitTest({x:240,y:300})?.id===table.id,'Claimed pixels are still picked as Removed');
    checks.push('Select Add transfers only the drawn intersection, preserves pixels and reduces the Removed mask');
    const claimedMask=core.groupMask(get(chair.id)).toDataURL();
    document.getElementById('undoBtn').click();assert(!has(get(table.id),240,300)&&has(get(chair.id),240,300),'Undo failed to reverse ownership');
    document.getElementById('redoBtn').click();assert(core.groupMask(get(chair.id)).toDataURL()===claimedMask&&has(get(table.id),240,300),'Redo failed to restore ownership');
    checks.push('Undo and Redo restore owner and Removed masks together');
    claimRect(get(wall.id),220,130,200,110);
    assert(has(get(wall.id),240,200)&&!has(get(chair.id),240,200)&&has(get(chair.id),350,300),'Second object did not claim its own independent part');
    checks.push('Separate objects manually take different portions while the remainder stays Removed');
    if(all){
      core.selectGroupMask(get(table.id));core.appendGroupSelection(get(chair.id));
      assert(!core.exactMaskBoundingBox(core.groupMask(get(chair.id))),'Taking the entire remainder left selectable Removed pixels');
      assert(has(get(table.id),350,300),'Ctrl/Add did not transfer the remaining area');
      checks.push('Adding the whole Removed object transfers all remaining pixels');
    }
    core.selectGroupMask(get(table.id),{showOutline:true});await window.MosaicPremium.generateSelection('Change table material to red',table.id);
    await wait(()=>get(table.id).active&&!state.patches.get(get(table.id).active)?.generating);
    const edited=core.composeApprovedCanvas();assert(near(pixel(edited,240,300),[204,51,68]),'Claimed Table pixels did not receive material edit');assert(near(pixel(edited,240,200),[221,221,221]),'Table material changed Wall');assert(near(pixel(edited,285,295),[51,102,238]),'Material changed Create foreground');
    if(!all)assert(near(pixel(edited,350,300),[153,119,68]),'Material changed unclaimed Removed area');
    checks.push('Material editing follows manual ownership and preserves unclaimed pixels and foreground Create');
    await core.chooseGroupOption(get(chair.id),null);assert(get(chair.id).name==='Chair'&&!has(get(table.id),240,300),'Original did not withdraw manual claims');assert(near(pixel(core.composeApprovedCanvas(),240,300),[51,85,51]),'Original still shows claimed material');
    await core.chooseGroupOption(get(chair.id),removedOption);assert(get(chair.id).name==='Removed'&&has(get(table.id),240,300),'Removed option did not restore manual claims');
    checks.push('Original/Removed switching withdraws and restores manual ownership');
    const expected=core.composeApprovedCanvas().toDataURL(),saved=await window.MosaicProjects.buildProjectData();
    assert(await window.MosaicProjects.loadProjectFile(new File([JSON.stringify(saved)],'manual-removed.moz'),{recovery:true}),'Project load failed');
    assert(core.composeApprovedCanvas().toDataURL()===expected&&has(get(table.id),240,300),'Save/Load lost pixels or manual ownership');
    assert(labels===0&&sam===0,'The manual flow called labeling or SAM');
    checks.push('Project Save/Load preserves remaining Removed area and manual ownership without SAM');
    return {passed:checks.length,checks};
  }finally{Object.assign(window.MosaicAuth,nativeAuth);window.MosaicAccount.request=nativeRequest;Element.prototype.setPointerCapture=nativeCapture}
};
window.runRemovedFullClaimChecks=()=>window.runRemovedManualChecks(true);
