window.runObjectFrontChecks=async function(nativeCrop=false,edited=false){
  const core=window.MosaicCore,{state,canvas,makeCanvas}=core,checks=[];
  const assert=(ok,message)=>{if(!ok)throw Error(message)};
  const pixel=(image,x,y)=>[...image.getContext('2d').getImageData(x,y,1,1).data].join(',');
  const shape=(x,y,w,h)=>{const mask=makeCanvas(640,480);mask.getContext('2d').fillStyle='#fff';mask.getContext('2d').fillRect(x,y,w,h);return mask};
  const base=makeCanvas(640,480),ctx=base.getContext('2d');ctx.fillStyle='#eee';ctx.fillRect(0,0,640,480);
  const chairMask=shape(160,120,180,210),m=chairMask.getContext('2d');m.clearRect(205,165,50,65);
  ctx.fillStyle='#bd782c';ctx.fillRect(160,120,180,210);ctx.fillStyle='#eee';ctx.fillRect(205,165,50,65);
  ctx.fillStyle='#554433';ctx.fillRect(430,160,70,190);
  state.reference=base;core.setMaster(base,'Original object in front',false);
  const localMask=makeCanvas(180,210);localMask.getContext('2d').drawImage(chairMask,-160,-120);
  const chair=nativeCrop?core.newGroupFromCrop({mask:localMask,x:160,y:120},'Furniture'):core.newGroup(chairMask,'Furniture');
  chair.name='Existing chair';chair.mapPrepared=true;
  let editedId=null;
  if(edited){
    const appearance=makeCanvas(180,210);appearance.getContext('2d').drawImage(base,-160,-120);
    // Legacy Original captures may already contain foreground pixels. Lifting
    // the original must recover its own scene pixels, not lift those pixels too.
    appearance.getContext('2d').fillStyle='#3366ee';appearance.getContext('2d').fillRect(100,60,30,100);
    chair.objectOriginal={mask:chairMask,appearance,appearanceOffset:{x:160,y:120},repairs:[]};
    const source=makeCanvas(640,480);source.getContext('2d').fillStyle='#66aa33';source.getContext('2d').fillRect(0,0,640,480);
    editedId=core.uid('edited-chair');state.sources.set(editedId,{id:editedId,canvas:source});
    state.patches.set(editedId,{id:editedId,sourceId:editedId,groupId:chair.id,mask:chairMask,bbox:{x:160,y:120,w:180,h:210},maskPaths:core.maskPathsFromRaster(chairMask)});
    chair.patchIds.push(editedId);chair.active=editedId;core.refreshGroupFootprint(chair);
  }
  const desk=core.newGroup(shape(430,160,70,190),'Furniture');desk.name='Existing desk';desk.mapPrepared=true;
  const collection={id:'front-fixture-collection',name:'Furniture'};state.objectCollections=[collection];
  chair.collectionId=desk.collectionId=collection.id;
  const addCreated=(name,color,area)=>{
    const group=window.MosaicObjectCreateCut.create(shape(...area),name),patch=state.patches.get(group.active);
    const source=state.sources.get(patch.sourceId);source.canvas.getContext('2d').fillStyle=color;source.canvas.getContext('2d').fillRect(...area);
    patch.createObject=true;core.invalidateDisplayedMask(patch,{geometryChanged:false});core.refreshGroupFootprint(group);return group;
  };
  const blue=addCreated('Created blue','#3366ee',[110,100,310,280]);
  const red=addCreated('Created red','#ee3344',[260,180,130,140]);
  core.render();
  const before=core.composeApprovedCanvas(),beforePixels=before.getContext('2d').getImageData(0,0,640,480).data;
  const otherGroups=[desk,blue,red],otherState=JSON.stringify(otherGroups.map(g=>[g.id,g.createdStackOrder,g.frontStackOrder,g.objectBehind,g.active,g.collectionId]));
  const selectedMask=core.groupMaskCrop(chair).mask;
  core.selectGroupMask(chair,{showOutline:true});core.showQuickPrompt(null,true,false);
  const button=document.getElementById('bringObjectToFrontBtn')||document.getElementById('bringCreatedToFrontBtn');
  assert(button&&!button.hidden,'The selected original object cannot be brought in front');
  button.click();
  const after=core.composeApprovedCanvas(),afterPixels=after.getContext('2d').getImageData(0,0,640,480).data;
  assert(pixel(after,280,250)===(edited?'102,170,51,255':'189,120,44,255'),'Selected original object stayed behind a created object');
  assert(pixel(after,220,190)==='51,102,238,255','A hole in the original object was filled with background');
  assert(pixel(after,370,220)==='238,51,68,255','The surrounding image rectangle was brought forward');
  const maskPixels=chairMask.getContext('2d').getImageData(0,0,640,480).data;
  for(let i=0;i<maskPixels.length;i+=4)if(!maskPixels[i+3])for(let c=0;c<4;c++)
    assert(beforePixels[i+c]===afterPixels[i+c],'Pixels outside the selected object changed at '+((i/4)%640)+','+Math.floor(i/4/640)+': '+beforePixels.slice(i,i+4)+' -> '+afterPixels.slice(i,i+4));
  assert(JSON.stringify(otherGroups.map(g=>[g.id,g.createdStackOrder,g.frontStackOrder,g.objectBehind,g.active,g.collectionId]))===otherState,'Other objects or collection members were raised');
  assert(core.groupMaskCrop(chair).mask===selectedMask,'Bring to front changed the selected object mask');
  assert(window.MosaicObjectMap.hitTest({x:280,y:250})===chair,'Pointer does not pick the raised original object');
  assert(window.MosaicObjectMap.hitTest({x:220,y:190})===blue,'Pointer ignores the hole in the raised object');
  checks.push('Only the selected original object renders above created objects, preserving holes and surrounding pixels');
  checks.push('Other members of the same collection retain their depth and pixels');
  checks.push('Pointer selection matches the raised object and its mask holes');
  if(edited){
    await core.chooseGroupOption(chair,null,{showOutline:true});
    assert(pixel(core.composeApprovedCanvas(),280,250)==='189,120,44,255','Original appearance lost its foreground position');
    await core.chooseGroupOption(chair,editedId,{showOutline:true});
    assert(pixel(core.composeApprovedCanvas(),280,250)==='102,170,51,255','Edited appearance lost its foreground position');
    checks.push('Switching between Original and an edited Option preserves the selected object depth');
  }
  document.getElementById('undoBtn').click();
  assert(core.composeApprovedCanvas().toDataURL()===before.toDataURL(),'Undo did not restore the exact composition');
  document.getElementById('redoBtn').click();
  assert(core.composeApprovedCanvas().toDataURL()===after.toDataURL(),'Redo did not restore the original object in front');
  core.selectGroupMask(red,{showOutline:true});core.showQuickPrompt(null,true,false);
  (document.getElementById('bringObjectToFrontBtn')||document.getElementById('bringCreatedToFrontBtn')).click();
  assert(pixel(core.composeApprovedCanvas(),280,250)==='238,51,68,255','A created object cannot move back in front of the original');
  checks.push('Undo, Redo and subsequent Bring to front actions keep a consistent object order');
  core.selectGroupMask(chair,{showOutline:true});core.showQuickPrompt(null,true,false);
  (document.getElementById('bringObjectToFrontBtn')||document.getElementById('bringCreatedToFrontBtn')).click();
  const expected=core.composeApprovedCanvas().toDataURL(),saved=await window.MosaicProjects.buildProjectData();
  const originalAuth=window.MosaicAuth.request;
  window.MosaicAuth.request=async()=>{throw Error('No AI calls in this fixture')};
  try{
    assert(await window.MosaicProjects.loadProjectFile(new File([JSON.stringify(saved)],'front.moz'),{recovery:true}),'Project failed to reload');
    assert(core.composeApprovedCanvas().toDataURL()===expected,'Project reload lost the original foreground object');
  }finally{window.MosaicAuth.request=originalAuth}
  checks.push('Save and Load preserve the raised original object and exact composition');
  return {passed:checks.length,checks};
};

window.runNativeObjectFrontChecks=()=>window.runObjectFrontChecks(true);
window.runEditedObjectFrontChecks=()=>window.runObjectFrontChecks(true,true);
