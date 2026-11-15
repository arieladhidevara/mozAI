// Inspect the actual queued image payload and then apply its mocked material result.
window.runMaterialSnapshotChecks=async function(createdTarget=false){
  const core=window.MosaicCore,ai=window.MosaicPremium,{state,makeCanvas}=core;
  const checks=[],assert=(ok,message)=>{if(!ok)throw Error(message)};
  const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
  const wait=async predicate=>{for(let i=0;i<400;i++){if(predicate())return;await pause()}throw Error('Material snapshot timed out')};
  const mask=(x,y,w,h)=>{const frame=makeCanvas(640,480);frame.getContext('2d').fillStyle='#fff';frame.getContext('2d').fillRect(x,y,w,h);return frame};
  const pixel=(image,x,y)=>[...image.getContext('2d').getImageData(Math.floor(x),Math.floor(y),1,1).data];
  const near=(actual,expected)=>expected.every((value,index)=>Math.abs(actual[index]-value)<22);
  const decode=uri=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const frame=makeCanvas(img.width,img.height);frame.getContext('2d').drawImage(img,0,0);resolve(frame)};img.onerror=reject;img.src=uri});
  const base=makeCanvas(640,480),baseCtx=base.getContext('2d');baseCtx.fillStyle='#eee';baseCtx.fillRect(0,0,640,480);
  baseCtx.fillStyle='#b29460';baseCtx.fillRect(180,130,220,200);
  state.reference=base;core.setMaster(base,'Material without Create occluders',false);
  document.getElementById('apiKeyDialog')?.close();
  const addCreated=(name,color,shape)=>{
    const group=window.MosaicObjectCreateCut.create(shape,name),patch=state.patches.get(group.active),source=state.sources.get(patch.sourceId);
    source.canvas.getContext('2d').fillStyle=color;source.canvas.getContext('2d').fillRect(0,0,640,480);
    patch.createObject=true;group.createdViaAI=true;core.invalidateDisplayedMask(patch,{geometryChanged:false});core.refreshGroupFootprint(group);return group;
  };
  // This object is below a Create target; it must remain visible through its hole.
  const behind=createdTarget?addCreated('Behind target','#44bb44',mask(240,170,40,50)):null;
  const targetMask=mask(180,130,220,200);targetMask.getContext('2d').clearRect(240,170,40,50);
  let target;
  if(createdTarget)target=addCreated('Created chair','#26a69a',targetMask);
  else{
    const local=makeCanvas(220,200);local.getContext('2d').drawImage(targetMask,-180,-130);
    target=core.newGroupFromCrop({mask:local,x:180,y:130},'Furniture');target.name='Existing chair';target.mapPrepared=true;
    const id=core.uid('approved-material'),source=makeCanvas(640,480);source.getContext('2d').fillStyle='#26a69a';source.getContext('2d').fillRect(0,0,640,480);
    state.sources.set(id,{id,canvas:source});state.patches.set(id,{id,groupId:target.id,sourceId:id,mask:targetMask,bbox:{x:180,y:130,w:220,h:200},maskPaths:core.maskPathsFromRaster(targetMask)});
    target.patchIds=[id];target.active=id;core.refreshGroupFootprint(target);
  }
  const covered=addCreated('Occluding Create','#3366ee',mask(210,230,120,80));
  const hole=addCreated('Create only in the hole','#aa44cc',mask(250,180,20,30));
  const nearby=addCreated('Nearby Create','#ee8833',mask(138,240,25,35));
  const regularMask=mask(190,145,25,25),regular=core.newGroup(regularMask,'Furniture');regular.name='Existing foreground';regular.mapPrepared=true;
  const regularId=core.uid('regular-option'),regularSource=makeCanvas(640,480);regularSource.getContext('2d').fillStyle='#ddaa22';regularSource.getContext('2d').fillRect(0,0,640,480);
  state.sources.set(regularId,{id:regularId,canvas:regularSource});state.patches.set(regularId,{id:regularId,groupId:regular.id,sourceId:regularId,mask:regularMask,bbox:{x:190,y:145,w:25,h:25},maskPaths:core.maskPathsFromRaster(regularMask)});
  regular.patchIds=[regularId];regular.active=regularId;core.refreshGroupFootprint(regular);core.bringObjectToFront(regular.id);
  const otherGroups=[covered,hole,nearby,regular,...(behind?[behind]:[])];
  const otherState=JSON.stringify(otherGroups.map(g=>[g.id,g.active,g.frontStackOrder,g.createdStackOrder,g.objectBehind]));
  const originalMask=core.groupMask(target).toDataURL(),oldActive=target.active;
  const before=core.composeApprovedCanvas().toDataURL();let payload,finish,contextRequest,imageCalls=0;
  const auth={ensure:window.MosaicAuth.ensure,request:window.MosaicAuth.request};
  window.MosaicAuth.ensure=async()=>true;
  window.MosaicAuth.request=async(path,body)=>{
    if(path==='/api/ai/edit'){imageCalls++;payload=body;return new Promise(resolve=>{finish=resolve})}
    if(path==='/api/ai/edit-context'){contextRequest=body;return {targetObject:'chair',confidence:1}}
    if(path==='/api/ai/option-name')return {name:'Red material'};
    throw Error('Unexpected AI request: '+path);
  };
  try{
    core.selectGroupMask(target,{showOutline:true});
    await ai.generateSelection('Change this chair material to red',target.id);
    await wait(()=>Boolean(payload));
    assert(!payload.createObject,'Material Edit became a new Create');
    const crop=await decode(payload.collage),context=await decode(payload.context),preview=await decode(contextRequest.image),editMask=await decode(payload.mask);
    const point=(image,x,y)=>pixel(image,(x-payload.crop.x)/payload.crop.width*image.width,(y-payload.crop.y)/payload.crop.height*image.height);
    assert(near(point(crop,270,260),[38,166,154]),'Crop still includes the foreground Create or lost the accepted underlying material');
    assert(near(pixel(context,270/640*context.width,260/480*context.height),[38,166,154]),'Full-scene context still includes the removed occluder');
    const intentPixel=point(preview,270,260);assert(intentPixel[1]>115&&intentPixel[2]<220,'Target inference received a conflicting occluded snapshot');
    assert(point(editMask,270,260)[3]===0,'Hidden foreground pixels were cut out of the editable target mask');
    assert(near(point(crop,260,195),[170,68,204]),'A Create inside a target mask hole was incorrectly hidden');
    assert(near(point(crop,150,250),[238,136,51]),'A nearby, nonoverlapping Create was incorrectly hidden');
    assert(near(point(crop,202,157),[221,170,34]),'An original foreground object was incorrectly hidden');
    if(behind)assert(near(point(crop,245,175),[68,187,68]),'A Create below the edited target was incorrectly hidden');
    checks.push('Crop, full-scene context and target inference exclude only the Create occluder, revealing the accepted material below');
    checks.push('Create objects behind the target, inside mask holes or nearby remain in the snapshot');
    assert(core.composeApprovedCanvas().toDataURL()===before,'Preparing a snapshot changed the live composition');
    assert(JSON.stringify(otherGroups.map(g=>[g.id,g.active,g.frontStackOrder,g.createdStackOrder,g.objectBehind]))===otherState,'Snapshot preparation changed another object');
    checks.push('Queued generation leaves live foreground objects and their depth intact');
    // Mock just the provider response; exercise the actual decode/validation/commit.
    const red=makeCanvas(640,480),redCtx=red.getContext('2d');redCtx.fillStyle='#cc3344';redCtx.fillRect(0,0,640,480);redCtx.globalCompositeOperation='destination-in';redCtx.drawImage(targetMask,0,0);
    crop.getContext('2d').drawImage(red,payload.crop.x,payload.crop.y,payload.crop.width,payload.crop.height,0,0,crop.width,crop.height);
    finish({image:crop.toDataURL('image/jpeg',.98).split(',')[1],mimeType:'image/jpeg'});
    await wait(()=>target.active!==oldActive&&!state.patches.get(target.active)?.generating);
    const after=core.composeApprovedCanvas(),applied=state.patches.get(target.active),layer=core.renderedPatchLayer(applied);
    assert(near(pixel(layer,270,260),[204,51,68]),'The material behind the foreground object was not updated');
    assert(near(pixel(after,270,260),[51,102,238]),'Applying the material overwrote the foreground Create');
    assert(near(pixel(after,360,290),[204,51,68]),'The exposed target did not receive the red material');
    assert(core.groupMask(target).toDataURL()===originalMask,'Material Edit changed target geometry');
    assert(JSON.stringify(otherGroups.map(g=>[g.id,g.active,g.frontStackOrder,g.createdStackOrder,g.objectBehind]))===otherState,'Applying the edit changed another object');
    assert(imageCalls===1,'Material Edit generated more than one image');
    checks.push('The material updates behind the foreground object while final compositing preserves foreground pixels and every original mask');
    return {passed:checks.length,checks};
  }finally{Object.assign(window.MosaicAuth,auth)}
};
window.runCreatedTargetMaterialSnapshotChecks=()=>window.runMaterialSnapshotChecks(true);
