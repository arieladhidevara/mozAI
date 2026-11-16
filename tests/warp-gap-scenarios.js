window.inspectInverseWarpGaps=async function(){
  const core=window.MosaicCore,{state,makeCanvas}=core;
  const source=makeCanvas(640,480),ctx=source.getContext('2d');ctx.fillStyle='#ccaa88';ctx.fillRect(0,0,640,480);
  state.reference=source;core.setMaster(source,'Inverse warp coverage fixture',false);
  const b={x:120,y:90,w:240,h:180};
  const cases={
    translated:[{x:145,y:120},{x:385,y:120},{x:385,y:300},{x:145,y:300}],
    resized:[{x:100,y:70},{x:460,y:70},{x:460,y:340},{x:100,y:340}],
    skewed:[{x:100,y:100},{x:410,y:75},{x:385,y:350},{x:120,y:320}]
  };
  const report={};
  for(const [kind,corners] of Object.entries(cases)){
    const output=core.unwarpPatchSelection(source,{bbox:b,corners}),pixels=output.getContext('2d').getImageData(b.x+2,b.y+2,b.w-4,b.h-4).data;
    let translucent=0,empty=0,minimumAlpha=255;
    for(let i=3;i<pixels.length;i+=4){minimumAlpha=Math.min(minimumAlpha,pixels[i]);if(pixels[i]<255)translucent++;if(pixels[i]===0)empty++}
    report[kind]={translucent,empty,minimumAlpha,selectedPixels:pixels.length/4};
  }
  return report;
};

window.runWarpGapChecks=async function(){
  const core=window.MosaicCore,{state,makeCanvas}=core,assert=(ok,msg)=>{if(!ok)throw Error(msg)};
  const inverse=await window.inspectInverseWarpGaps();
  for(const [kind,stats] of Object.entries(inverse))assert(stats.translucent===0&&stats.empty===0,'Inverse '+kind+' introduced alpha gaps');
  const bbox={x:120,y:90,w:240,h:180},corners=[{x:100,y:100},{x:410,y:75},{x:385,y:350},{x:120,y:320}];
  const mask=makeCanvas(640,480),mc=mask.getContext('2d');mc.fillRect(bbox.x,bbox.y,bbox.w,bbox.h);mc.clearRect(210,150,50,50);
  const source=makeCanvas(640,480),sc=source.getContext('2d');
  const patch={id:'gap-check',mask,bbox,corners},maskBefore=mask.toDataURL();
  const point=(u,v)=>({x:corners[0].x*(1-u)*(1-v)+corners[1].x*u*(1-v)+corners[2].x*u*v+corners[3].x*(1-u)*v,
    y:corners[0].y*(1-u)*(1-v)+corners[1].y*u*(1-v)+corners[2].y*u*v+corners[3].y*(1-u)*v});
  for(const opacity of [1,.4]){
    sc.clearRect(0,0,640,480);sc.fillStyle='rgba(200,120,60,'+opacity+')';sc.fillRect(0,0,640,480);
    core.invalidateDisplayedMask(patch);
    const render=makeCanvas(640,480),ctx=render.getContext('2d');ctx.fillStyle='#283c50';ctx.fillRect(0,0,640,480);
    core.drawPatch(ctx,patch,{canvas:source});
    for(const u of [.125,.25,.75,.875])for(const v of [.125,.25,.75,.875]){
      const p=point(u,v),pixel=ctx.getImageData(Math.floor(p.x),Math.floor(p.y),1,1).data;
      const expected=[200*opacity+40*(1-opacity),120*opacity+60*(1-opacity),60*opacity+80*(1-opacity)];
      assert(expected.every((value,index)=>Math.abs(pixel[index]-value)<=1),'Skew mesh darkened or brightened '+opacity+' alpha at '+u+','+v+': '+pixel);
      assert(pixel[3]===255,'Compositing changed scene alpha');
    }
    const hole=point(.5,.5),through=ctx.getImageData(Math.floor(hole.x),Math.floor(hole.y),1,1).data;
    assert(through[0]===40&&through[1]===60&&through[2]===80,'Warp filled an original mask hole');
    const cached=makeCanvas(640,480);cached.getContext('2d').fillStyle='#283c50';cached.getContext('2d').fillRect(0,0,640,480);
    core.drawPatch(cached.getContext('2d'),patch,{canvas:source});assert(cached.toDataURL()===render.toDataURL(),'Cached warp differs from original render');
  }
  assert(mask.toDataURL()===maskBefore,'Warp modified the original mask');
  return {passed:3,checks:['Opaque inverse warps have no alpha seams for move, resize or skew','Skew rendering preserves opaque/semitransparent RGB over the background','Mask holes and cached renders remain intact'],inverse};
};

window.runWarpedGenerateChecks=async function(){
  const core=window.MosaicCore,{state,makeCanvas}=core;
  const assert=(ok,msg)=>{if(!ok)throw Error(msg)},pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async fn=>{for(let i=0;i<400;i++){if(fn())return;await pause(20)}throw Error('Warped generation timed out')};
  const auth={ensure:window.MosaicAuth.ensure,request:window.MosaicAuth.request},unwarp=core.unwarpPatchSelection;
  let requests=0,inject=false;
  window.MosaicAuth.ensure=async()=>true;
  window.MosaicAuth.request=async(path,body)=>{
    if(path==='/api/ai/edit-context')return {targetObject:'wall',confidence:.95};
    if(path==='/api/ai/option-name')return {name:'Warm wall'};
    if(path==='/api/ai/edit'){
      requests++;const image=makeCanvas(400,300),ctx=image.getContext('2d');ctx.fillStyle='#cc8844';ctx.fillRect(0,0,400,300);
      return {image:image.toDataURL('image/png').split(',')[1],mimeType:'image/png',generationId:'warp-fixture-'+requests};
    }
    throw Error('Unexpected fixture request '+path);
  };
  try{
    const base=makeCanvas(640,480),bc=base.getContext('2d');bc.fillStyle='#111';bc.fillRect(0,0,640,480);
    state.reference=base;core.setMaster(base,'Warped material generation',false);
    const bbox={x:120,y:90,w:240,h:180},mask=makeCanvas(640,480);mask.getContext('2d').fillRect(bbox.x,bbox.y,bbox.w,bbox.h);
    mask.getContext('2d').clearRect(210,150,50,50);
    const group=core.newGroup(mask,'Wall');group.name='Wall';group.mapPrepared=true;
    const original=makeCanvas(640,480);original.getContext('2d').fillStyle='#aaa';original.getContext('2d').fillRect(0,0,640,480);
    const sid=core.uid('source'),pid=core.uid('patch');state.sources.set(sid,{id:sid,canvas:original});
    const corners=[{x:100,y:100},{x:410,y:75},{x:385,y:350},{x:120,y:320}];
    state.patches.set(pid,{id:pid,groupId:group.id,sourceId:sid,mask,bbox,corners,name:'Wall option',prompt:'Warm wood material',manualName:true});group.patchIds=[pid];group.active=pid;
    core.refreshGroupFootprint(group);core.selectGroupMask(group);
    const originalMask=core.groupMask(group).toDataURL();
    await window.MosaicPremium.regenerateOption(pid);
    await wait(()=>requests===1&&!state.patches.get(pid).generating);
    let patch=state.patches.get(pid);
    assert(patch.sourceId!==sid,'Valid generated RGB was not saved');
    assert(patch.generationValidation?.inverseWarp&&!patch.generationValidation.inverseWarp.invalid,'Final inverse-warp output was not validated');
    assert(core.groupMask(group).toDataURL()===originalMask,'Generation changed the locked mask');
    const approved=core.composeApprovedCanvas().toDataURL(),approvedSource=patch.sourceId;
    core.unwarpPatchSelection=(image,submitted)=>{
      const output=unwarp(image,submitted);if(inject)output.getContext('2d').clearRect(120,90,240,100);return output;
    };
    inject=true;await window.MosaicPremium.regenerateOption(pid);await wait(()=>requests===2&&!patch.generating);
    assert(patch.sourceId===approvedSource&&core.composeApprovedCanvas().toDataURL()===approved,'Bad final warp overwrote the approved option');
    assert(state.lastGenerationIssue?.stage==='inverse-warp','Warp failure was not identified at the correct stage');
    assert(requests===2,'Local warp validation retried paid generation');
    document.querySelector('.guide-skip')?.click();
    return {passed:3,checks:['Generated material on a skewed object passes final warp validation with its original mask','A corrupted inverse-warp result cannot replace the approved source','Warp failure identifies its stage and makes no automatic AI retries'],simulatedImageRequests:requests};
  }finally{Object.assign(window.MosaicAuth,auth);core.unwarpPatchSelection=unwarp}
};
