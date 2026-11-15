// Reconstruction evidence remains reversible. Only an active edit contributes
// ownership; restoring the removed object also withdraws its revealed pixels.
const core=window.MosaicCore,{state,canvas,makeCanvas}=core;
let revision=0;
const maskCache=new WeakMap();
const cropCache=new WeakMap(),textureCache=new WeakMap(),thumbnailCache=new WeakMap();
const copy=source=>{const c=makeCanvas(source.width,source.height);c.getContext('2d').drawImage(source,0,0);return c};
function active(event){return state.groups.some(g=>g.id===event.groupId&&g.active===event.patchId)&&event.enabled!==false}
function events(){return (state.objectReconstruction?.events||[]).filter(e=>e.ownershipVersion>=2)}
function removedEvent(group){return events().find(e=>e.ownershipVersion===3&&e.operation==='remove'&&e.groupId===group?.id&&active(e))}
function isRemovedRegion(group){return Boolean(removedEvent(group))}
function remaining(event){
  const mask=copy(event.revealedMask),ctx=mask.getContext('2d');ctx.globalCompositeOperation='destination-out';
  for(const assignment of event.assignments||[])ctx.drawImage(assignment.mask,0,0);
  return mask;
}
function visible(group){return !group.reconstructionEventId||events().some(e=>e.id===group.reconstructionEventId&&active(e))}
function related(group){return events().flatMap(event=>(event.assignments||[]).filter(a=>a.groupId===group.id).map(a=>({event,mask:a.mask})))}
function expandMask(group,base){
  if(!visible(group))return makeCanvas(canvas.width,canvas.height);
  const retained=removedEvent(group);if(retained)return retained.unresolvedMask||remaining(retained);
  if(state.patches.get(group.active)?.editMode==='remove')return base;
  const additions=related(group);if(!additions.length)return base;
  const stamp=revision+':'+events().filter(active).map(e=>e.id).join(',');
  const cached=maskCache.get(group);if(cached?.base===base&&cached.stamp===stamp)return cached.mask;
  const result=copy(base),ctx=result.getContext('2d');
  const patch=state.patches.get(group.active);
  for(const {event,mask} of additions){
    if(active(event)&&patch?.reconstructionEvents?.includes(event.id))continue;
    ctx.globalCompositeOperation=active(event)?'source-over':'destination-out';ctx.drawImage(mask,0,0);
  }
  maskCache.set(group,{base,stamp,mask:result});return result;
}
function crop(group){
  if(!isRemovedRegion(group)&&!group.reconstructionEventId&&!related(group).length)return null;
  const patch=state.patches.get(group.active),key=revision+':'+group.active+':'+JSON.stringify(patch?.corners);
  const saved=cropCache.get(group);
  if(saved?.key===key&&saved.patchMask===patch?.mask&&saved.footprint===group.footprint&&saved.nativeCrop===group.maskCrop)return saved.crop;
  const mask=core.groupMask(group),b=core.exactMaskBoundingBox(mask);if(!b)return {mask:makeCanvas(1,1),x:0,y:0};
  const cached=maskCache.get(group);if(cached?.crop)return cached.crop;
  const local=makeCanvas(b.w,b.h);local.getContext('2d').drawImage(mask,-b.x,-b.y);
  const result={mask:local,x:b.x,y:b.y};if(cached)cached.crop=result;
  cropCache.set(group,{key,patchMask:patch?.mask,footprint:group.footprint,nativeCrop:group.maskCrop,crop:result});return result;
}
function drawBase(target,groups){
  for(const event of events())if(active(event)&&groups.some(g=>g.id===event.groupId)){
    if(event.operation==='shape'){target.drawImage(event.revealedRGB,0,0);continue;}
    const patch=state.patches.get(event.patchId),source=state.sources.get(event.sourceId);
    if(patch&&source)core.drawPatch(target,patch,source);
  }
}
function drawGroup(target,group){
  if(group.objectRemoved)return;
  for(const {event,mask} of related(group))if(active(event)){
    let layer=textureCache.get(mask);
    if(!layer){layer=copy(event.revealedRGB);const ctx=layer.getContext('2d');ctx.globalCompositeOperation='destination-in';ctx.drawImage(mask,0,0);textureCache.set(mask,layer)}
    target.drawImage(layer,0,0);
  }
}
function drawOption(target,group,patch,source){
  const inactive=related(group).filter(({event})=>!active(event));
  const shape=patch.geometryObjectMask&&events().some(e=>e.patchId===patch.id&&e.operation==='shape');
  if(!inactive.length&&!shape)return false;
  const layer=makeCanvas(canvas.width,canvas.height);core.drawPatch(layer.getContext('2d'),patch,source);
  const ctx=layer.getContext('2d');
  if(shape){ctx.globalCompositeOperation='destination-in';ctx.drawImage(patch.geometryObjectMask,0,0)}
  ctx.globalCompositeOperation='destination-out';for(const {mask} of inactive)ctx.drawImage(mask,0,0);
  target.drawImage(layer,0,0);return true;
}
function sync(){
  revision++;
  for(const group of state.groups){
    group.reconstructionHidden=!visible(group);
    if(isRemovedRegion(group)){
      if(!group.removedOriginalName){group.removedOriginalName=group.name||'Object';group.removedOriginalManualName=group.manualName}
      group.name='Removed';group.manualName=true;
    }else if(group.removedOriginalName){
      group.name=group.removedOriginalName;group.manualName=group.removedOriginalManualName;
      delete group.removedOriginalName;delete group.removedOriginalManualName;
    }
    if(isRemovedRegion(group)||group.reconstructionEventId||related(group).length)group.area=core.exactMaskBoundingBox(core.groupMask(group));
  }
  window.MosaicObjectMap?.invalidateHitIndex?.();
}
function claim(group,selection){
  if(!group||group.objectRemoved||group.mergedInto||group.cutArchived||group.objectMapBatch||!selection||!state.groups.includes(group))return false;
  const transfers=[];
  for(const event of events())if(event.ownershipVersion===3&&event.operation==='remove'&&active(event)){
    const mask=remaining(event),ctx=mask.getContext('2d');ctx.globalCompositeOperation='destination-in';ctx.drawImage(selection,0,0);
    if(core.exactMaskBoundingBox(mask))transfers.push({event,mask});
  }
  if(!transfers.length)return false;
  const before=snapshot();
  const replacements=new Map(transfers.map(({event,mask})=>{
    const assignments=(event.assignments||[]).map(a=>({...a})),previous=assignments.find(a=>a.groupId===group.id);
    if(previous){previous.mask=copy(previous.mask);previous.mask.getContext('2d').drawImage(mask,0,0)}
    else assignments.push({groupId:group.id,mask,confidence:1,manual:true});
    const next={...event,assignments,ownership:'manual'};next.unresolvedMask=remaining(next);
    return [event.id,next];
  }));
  state.objectReconstruction={...state.objectReconstruction,events:state.objectReconstruction.events.map(e=>replacements.get(e.id)||e)};
  group.reconstructionExpanded=true;
  sync();state.undo.push({type:'object-reconstruction',value:before});core.trimUndo();state.redo=[];
  window.MosaicRecovery?.markChanged?.();return true;
}
function invalidate(groupId){
  const group=state.groups.find(g=>g.id===groupId);
  if(group){maskCache.delete(group);cropCache.delete(group);thumbnailCache.delete(group)}
}
function thumbnail(group){
  const saved=thumbnailCache.get(group);if(saved?.revision===revision)return saved.url;
  const mask=core.groupMask(group),bounds=core.exactMaskBoundingBox(mask);if(!bounds)return '';
  const image=copy(state.master);drawGroup(image.getContext('2d'),group);
  image.getContext('2d').globalCompositeOperation='destination-in';image.getContext('2d').drawImage(mask,0,0);
  const scale=Math.min(1,96/Math.max(bounds.w,bounds.h)),thumb=makeCanvas(Math.max(1,Math.ceil(bounds.w*scale)),Math.max(1,Math.ceil(bounds.h*scale)));
  thumb.getContext('2d').drawImage(image,bounds.x,bounds.y,bounds.w,bounds.h,0,0,thumb.width,thumb.height);
  const url=thumb.toDataURL('image/png');thumbnailCache.set(group,{revision,url});return url;
}
function snapshot(){return {groups:state.groups.map(g=>({...g,patchIds:[...g.patchIds]})),patches:new Map(state.patches),sources:new Map(state.sources),reconstruction:state.objectReconstruction?{...state.objectReconstruction,events:[...state.objectReconstruction.events]}:null}}
function restoreHistory(entry,to){
  if(entry.type!=='object-reconstruction')return false;
  to.push({type:entry.type,value:snapshot()});
  Object.assign(state,{groups:entry.value.groups,patches:entry.value.patches,sources:entry.value.sources,objectReconstruction:entry.value.reconstruction});
  sync();core.resetSelection();window.MosaicRecovery?.markChanged?.();return true;
}
window.addEventListener('mosaic:projectloaded',sync);
window.MosaicReconstruction={expandMask,crop,drawBase,drawGroup,drawOption,sync,snapshot,restoreHistory,invalidate,thumbnail,
  isRemovedRegion,claim,activeIds:()=>events().filter(active).map(e=>e.id)};
