/* Geometry editing builds a full-frame RGB candidate and applies only validated
   pixels. It deliberately never asks a generative model for an object-ID image.
   Materials keep using the existing cropped editing workflow. */
import './premium.js';
import './object-map.js';
import {calculateMaskDelta} from './geometry-mask.mjs';
import {matchRevealedIdentity,partitionRevealed} from './reveal-ownership.mjs';
import './object-reconstruction.js';

const core=window.MosaicCore;
const {state,canvas,makeCanvas,toast,render,renderGroups}=core;
const $=id=>document.getElementById(id);
const clone=input=>{const out=makeCanvas(input.width,input.height);out.getContext('2d').drawImage(input,0,0);return out;};
let mode='material',processing=false,review=null;
const promptForm=$('quickAreaPromptForm'),input=$('quickAreaPromptInput');
const switcher=document.createElement('div');
switcher.className='geometry-mode-switcher';
switcher.setAttribute('role','group');
switcher.setAttribute('aria-label','Edit mode');
switcher.innerHTML='<label>Edit <select id="quickEditMode"><option value="material">Material</option><option value="shape">Shape</option></select></label><button type="button" id="geometryRemoveBtn" title="Remove the selected object">Remove object</button>';
$('quickPromptMorePanel').append(switcher);
$('quickEditMode').addEventListener('change',event=>setMode(event.target.value));
$('quickPromptMore').addEventListener('click',()=>{const panel=$('quickPromptMorePanel');panel.hidden=!panel.hidden;promptForm.classList.toggle('more-open',!panel.hidden);$('quickPromptMore').setAttribute('aria-expanded',String(!panel.hidden));core.showQuickPrompt(state.lastCanvasPointer,true,false);});
const modeHint=document.createElement('p');
modeHint.className='geometry-mode-hint';
switcher.after(modeHint);
function isFreshCreate(){
  const group=state.groups.find(g=>g.id===state.draftGroupId||g.patchIds.includes(state.selectionTargetPatchId));
  return Boolean(group?.createdLocally&&!group.createdViaAI);
}
function syncPromptMode(){
  const create=isFreshCreate();
  if(create)mode='material';
  switcher.hidden=create;
  modeHint.hidden=create;
  if(create){
    input.placeholder='Describe the new object…';
    for(const button of switcher.querySelectorAll('[data-geometry-mode]')){
      const active=button.dataset.geometryMode==='material';
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    }
  }else setMode(mode);
}
function setMode(next){
  mode=next==='shape'?'shape':'material';$('quickEditMode').value=mode;
  for(const button of switcher.querySelectorAll('[data-geometry-mode]')){
    const active=button.dataset.geometryMode===mode;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  }
  input.placeholder=mode==='shape'?'Describe the new object shape or size…':'Change material, finish or color…';
  modeHint.textContent=mode==='shape'?'Shape edit · SAM detects changed geometry':'Material edit · original mask kept';
  modeHint.hidden=false;
}
switcher.addEventListener('click',event=>{
  if(isFreshCreate())return;
  const button=event.target.closest('[data-geometry-mode]');
  if(button){setMode(button.dataset.geometryMode);input.focus({preventScroll:true});}
});
setMode('material');

function maskPixels(mask){
  return mask.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height).data;
}
function rasterFromBits(bits){
  const out=makeCanvas(canvas.width,canvas.height),ctx=out.getContext('2d'),frame=ctx.createImageData(canvas.width,canvas.height);
  for(let p=0;p<bits.length;p++)if(bits[p])frame.data.fill(255,p*4,p*4+4);
  ctx.putImageData(frame,0,0);return out;
}
function binary(mask){
  const pixels=maskPixels(mask),result=new Uint8Array(canvas.width*canvas.height);
  for(let p=0;p<result.length;p++)result[p]=pixels[p*4+3]>128?1:0;
  return result;
}
function operationMasks(oldMask,newMask,operation){
  const old=binary(oldMask),fresh=newMask?binary(newMask):new Uint8Array(old.length);
  const {union,revealed,unionCount:count,oldCount,newCount,revealedCount}=calculateMaskDelta(old,fresh);
  if(!count)throw Error('The selected object mask is empty.');
  if(operation!=='remove'&&(!newCount||newCount>old.length*.78||newCount<Math.max(20,oldCount*.015)))
    throw Error('SAM did not return a reliable new object outline. No changes were applied.');
  const region=rasterFromBits(union),reveal=rasterFromBits(revealed);
  // Small edge allowance includes antialiasing and nearby contact shadows.
  const padded=makeCanvas(canvas.width,canvas.height),ctx=padded.getContext('2d');
  ctx.filter='blur(4px)';ctx.drawImage(region,0,0);ctx.filter='none';
  ctx.globalCompositeOperation='source-over';ctx.drawImage(region,0,0);
  return {region,padded,reveal,oldCount,newCount,revealedCount};
}
function promptLabel(group){
  let label=(group?.objectLabel||group?.objectName||group?.name||group?.category||'').trim();
  label=label.replace(/\s*[·#]\s*\d+.*$/,'').replace(/\s+\d+$/,'').trim();
  if(!label||/^(region|other|object)$/i.test(label))return null;
  return label.slice(0,80);
}
function chooseGroup(mask){
  const parts=window.MosaicObjectMap?.partsForSelection(mask)||[];
  if(parts.length>1)throw Error('Shape/Remove currently supports one object. Use Material or merge the objects first.');
  const part=parts[0];
  return state.groups.find(g=>g.id===state.draftGroupId||g.patchIds.includes(state.selectionTargetPatchId))||
    (part&&state.groups.find(g=>g.objectMapObjectKey===part.objectKey&&g.objectMapKey===part.mapKey))||
    core.matchingGroup(mask,.55)||null;
}
async function samMask(image,label,oldMask){
  const max=896,scale=Math.min(1,max/Math.max(canvas.width,canvas.height));
  const w=Math.max(1,Math.round(canvas.width*scale)),h=Math.max(1,Math.round(canvas.height*scale));
  const frame=makeCanvas(w,h);frame.getContext('2d').drawImage(image,0,0,w,h);
  const oldBox=core.exactMaskBoundingBox(oldMask);
  if(!oldBox)throw Error('Select an object first.');
  // Broad guidance allows an object to grow beyond its previous silhouette.
  const margin=Math.max(48,Math.max(oldBox.w,oldBox.h)*.75);
  const x1=Math.max(0,(oldBox.x-margin)*scale),y1=Math.max(0,(oldBox.y-margin)*scale);
  const x2=Math.min(w,(oldBox.x+oldBox.w+margin)*scale),y2=Math.min(h,(oldBox.y+oldBox.h+margin)*scale);
  const reply=await window.MosaicAccount.request('/api/ai/sam3',{
    method:'POST',body:{mode:'object',image:frame.toDataURL('image/jpeg',.83),width:w,height:h,label,box:[x1,y1,Math.max(x1+1,x2),Math.max(y1+1,y2)]}
  });
  if(typeof reply.mask!=='string'||!reply.mask.startsWith('data:image/png;base64,'))throw Error('SAM returned no valid mask.');
  const img=await new Promise((resolve,reject)=>{
    const value=new Image();value.onload=()=>resolve(value);value.onerror=()=>reject(Error('Cannot decode SAM mask.'));value.src=reply.mask;
  });
  if(img.width!==w||img.height!==h)throw Error('SAM mask dimensions differ from the generated image.');
  const scaled=makeCanvas(canvas.width,canvas.height),ctx=scaled.getContext('2d');
  ctx.imageSmoothingEnabled=false;ctx.drawImage(img,0,0,canvas.width,canvas.height);
  return scaled;
}

// Lightweight translation alignment, evaluated ONLY outside the selected object.
// The app always protects existing pixels outside the approved change region.
// A full perspective homography is a separate CV enhancement, not assumed here.
function alignTranslation(before,after,oldMask){
  const max=256,scale=Math.min(1,max/Math.max(canvas.width,canvas.height)),w=Math.max(32,Math.round(canvas.width*scale)),h=Math.max(32,Math.round(canvas.height*scale));
  const resize=source=>{const c=makeCanvas(w,h);c.getContext('2d').drawImage(source,0,0,w,h);return c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;};
  const a=resize(before),b=resize(after),m=resize(oldMask),grid=4,shifts=7;
  const luminance=(d,i)=>.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];
  const grad=(d,x,y)=>{
    const i=(y*w+x)*4;
    return Math.abs(luminance(d,i+4)-luminance(d,i-4))+Math.abs(luminance(d,i+4*w)-luminance(d,i-4*w));
  };
  let best={dx:0,dy:0,error:Infinity,samples:0},baseline=Infinity;
  for(let dy=-shifts;dy<=shifts;dy++)for(let dx=-shifts;dx<=shifts;dx++){
    let error=0,n=0;
    for(let y=shifts+2;y<h-shifts-2;y+=grid)for(let x=shifts+2;x<w-shifts-2;x+=grid){
      if(m[(y*w+x)*4+3]>10)continue;
      if(m[((y+dy)*w+x+dx)*4+3]>10)continue;
      const ga=grad(a,x,y),gb=grad(b,x+dx,y+dy);
      if(ga+gb<24)continue;
      error+=Math.min(255,Math.abs(ga-gb));n++;
    }
    if(n<25)continue;
    const value=error/n;
    if(!dx&&!dy)baseline=value;
    if(value<best.error)best={dx,dy,error:value,samples:n};
  }
  const approved=Number.isFinite(best.error)&&best.samples>=25&&best.error<baseline*.82;
  if(!approved)return {image:after,offset:{x:0,y:0},status:'Protected composition · alignment not required or inconclusive'};
  const shiftX=-best.dx/scale,shiftY=-best.dy/scale;
  const shifted=makeCanvas(canvas.width,canvas.height),ctx=shifted.getContext('2d');
  ctx.drawImage(before,0,0);ctx.drawImage(after,shiftX,shiftY);
  return {image:shifted,offset:{x:shiftX,y:shiftY},status:'Automatic translation alignment'};
}
function compositedResult(before,generated,changeMask){
  const result=clone(before),clip=clone(generated),x=clip.getContext('2d');
  x.globalCompositeOperation='destination-in';x.drawImage(changeMask,0,0);
  result.getContext('2d').drawImage(clip,0,0);
  return result;
}
// Vision supplies category words and candidate instances; SAM supplies boundaries.
// Identity is verified against unchanged pixels, never just the category name.
async function matchRevealedOwners(image,revealedMask,excludedGroup,before,isCurrent){
  const exposed=binary(revealedMask),revealCount=exposed.reduce((a,b)=>a+b,0);
  if(revealCount<20)return {assignments:[],unresolved:revealedMask,analysisFailed:false};
  const known=state.groups.filter(g=>g!==excludedGroup&&!g.createdLocally&&!g.createdViaAI&&!g.mergedInto&&!g.objectRemoved&&!g.cutArchived&&!g.objectMapBatch&&!g.reconstructionHidden)
    .map(group=>({group,id:group.id,label:promptLabel(group),mask:core.groupMask(group)}))
    .filter(o=>core.exactMaskBoundingBox(o.mask)).map(o=>({...o,bits:binary(o.mask)}));
  const b=core.exactMaskBoundingBox(revealedMask),pad=Math.max(96,Math.max(b.w,b.h)*.6);
  const crop={x:Math.max(0,Math.floor(b.x-pad)),y:Math.max(0,Math.floor(b.y-pad))};
  crop.w=Math.min(canvas.width,Math.ceil(b.x+b.w+pad))-crop.x;
  crop.h=Math.min(canvas.height,Math.ceil(b.y+b.h+pad))-crop.y;
  const scale=Math.min(1,768/Math.max(crop.w,crop.h)),w=Math.max(1,Math.round(crop.w*scale)),h=Math.max(1,Math.round(crop.h*scale));
  const preview=(source,mask=false)=>{
    const frame=makeCanvas(w,h),ctx=frame.getContext('2d');
    if(mask){ctx.fillStyle='#000';ctx.fillRect(0,0,w,h)}
    ctx.drawImage(source,crop.x,crop.y,crop.w,crop.h,0,0,w,h);
    return frame.toDataURL(mask?'image/png':'image/jpeg',.85);
  };
  const normalized=box=>[box.x-crop.x,box.y-crop.y,box.x+box.w-crop.x,box.y+box.h-crop.y]
    .map((v,i)=>Math.round(Math.max(0,Math.min(1000,v/(i%2?crop.h:crop.w)*1000))));
  const nearby=known.filter(o=>{const box=core.exactMaskBoundingBox(o.mask);return box.x<crop.x+crop.w&&box.y<crop.y+crop.h&&box.x+box.w>crop.x&&box.y+box.h>crop.y});
  let targets=[],analysisFailed=false;
  try{
    toast('Identifying newly revealed objects...');
    const answer=await window.MosaicAuth.request('/api/ai/reveal-context',{
      before:preview(before),image:preview(image),mask:preview(revealedMask,true),
      objects:nearby.slice(0,64).map(o=>({id:o.id,label:o.label||'object',box:normalized(core.exactMaskBoundingBox(o.mask))}))
    });
    if(!Array.isArray(answer.targets)||answer.targets.length>6)throw Error('Invalid revealed labels');
    targets=answer.targets.filter(t=>t.confidence>=.8&&typeof t.label==='string'&&t.label.trim()&&t.label.length<=80&&Array.isArray(t.box)&&t.box.length===4&&t.box.every(n=>Number.isFinite(n)&&n>=0&&n<=1000)&&t.box[2]>t.box[0]&&t.box[3]>t.box[1]&&(!t.existingId||nearby.some(o=>o.id===t.existingId)));
  }catch{analysisFailed=true;
    // Recognition failure can still verify known labels; it must not invent a new owner.
    targets=nearby.filter(o=>o.label).slice(0,3).map(o=>({label:o.label,existingId:o.id,confidence:.8}));
  }
  const candidates=[],seen=new Set();
  for(const target of targets){
    if(!isCurrent())throw Error('Project changed while identifying revealed objects.');
    const owner=known.find(o=>o.id===target.existingId);
    let guidance=owner?.mask||revealedMask;
    if(target.box){
      guidance=makeCanvas(canvas.width,canvas.height);const ctx=guidance.getContext('2d');ctx.fillStyle='#fff';
      ctx.fillRect(crop.x+target.box[0]/1000*crop.w,crop.y+target.box[1]/1000*crop.h,(target.box[2]-target.box[0])/1000*crop.w,(target.box[3]-target.box[1])/1000*crop.h);
    }
    try{
      toast('Finding '+target.label+' boundaries...');
      const mask=await samMask(image,target.label,guidance),fresh=binary(mask);
      if(!isCurrent())throw Error('Project changed while finding boundaries.');
      const match=matchRevealedIdentity(fresh,exposed,known.map(o=>({id:o.id,mask:o.bits})),target.existingId||'');
      let groupId=match?.id||null;
      if(!groupId){
        // A proposed existing identity that fails verification stays unresolved.
        if(target.existingId||analysisFailed||target.confidence<.85)continue;
        // Partial agreement with an existing object is ambiguous, not a new instance.
        const overlapsKnown=known.some(o=>{let both=0;for(let i=0;i<fresh.length;i++)if(!exposed[i]&&fresh[i]&&o.bits[i])both++;return both>=20});
        if(overlapsKnown)continue;
      }
      const key=groupId||target.label+':'+(target.box||[]).join(',');
      if(seen.has(key))continue;seen.add(key);
      candidates.push({groupId,label:target.label,confidence:Math.min(target.confidence,match?.retained||1),mask:fresh});
    }catch(error){
      if(error?.code==='SAM3_QUOTA'||error?.status===429){analysisFailed=true;break;}
      analysisFailed=true;
    }
  }
  const partition=partitionRevealed(exposed,candidates);
  return {assignments:partition.assignments.map(a=>({...a,mask:rasterFromBits(a.mask)})),unresolved:rasterFromBits(partition.unresolved),analysisFailed};
}
function accumulateRevealedPixels(event,before,aligned){
  state.objectReconstruction??={version:1,events:[]};
  state.objectReconstruction.objects??={};
  state.objectReconstruction.occlusions??=[];
  for(const match of event.assignments||[]){
    const group=state.groups.find(g=>g.id===match.groupId);
    if(!group)continue;
    const key=group.id+':'+(group.geometryVersion||0);
    let record=state.objectReconstruction.objects[key];
    if(!record){
      const originalMask=clone(core.groupMask(group));
      const texture=clone(before),x=texture.getContext('2d');
      x.globalCompositeOperation='destination-in';x.drawImage(originalMask,0,0);
      record={groupId:group.id,geometryVersion:group.geometryVersion||0,texture,coverage:originalMask,patches:0};
      state.objectReconstruction.objects[key]=record;
    }
    const patch=clone(aligned),ctx=patch.getContext('2d');
    ctx.globalCompositeOperation='destination-in';ctx.drawImage(match.mask,0,0);
    record.texture.getContext('2d').drawImage(patch,0,0);
    record.coverage.getContext('2d').drawImage(match.mask,0,0);
    record.patches++;
    state.objectReconstruction.occlusions.push({
      frontId:event.groupId,backId:group.id,sourceEvent:event.id,
      region:clone(match.mask),confidence:match.confidence
    });
  }
}

const previewLayer=document.createElement('canvas');
previewLayer.id='geometryPreviewLayer';previewLayer.className='geometry-preview-layer';previewLayer.hidden=true;
$('canvasWrap').append(previewLayer);
const reviewBar=document.createElement('div');
reviewBar.id='geometryReviewBar';reviewBar.className='geometry-review-bar';reviewBar.hidden=true;
reviewBar.innerHTML='<span id="geometryReviewStatus"></span><button type="button" id="geometryDiscard">Discard</button><button type="button" id="geometryApply">Apply shape edit</button>';
$('viewport').append(reviewBar);
function closeReview(){
  review=null;previewLayer.hidden=true;reviewBar.hidden=true;
  previewLayer.getContext('2d').clearRect(0,0,previewLayer.width,previewLayer.height);
}
function showReview(result,status,operation){
  previewLayer.width=canvas.width;previewLayer.height=canvas.height;
  previewLayer.getContext('2d').drawImage(result,0,0);
  previewLayer.hidden=false;reviewBar.hidden=false;
  $('geometryReviewStatus').textContent=status;
  $('geometryApply').textContent=operation==='remove'?'Apply removal':'Apply shape edit';
}
function commit(){
  if(!review)return;
  const item=review;
  if(!item.isCurrent()){closeReview();toast('Project changed. Generate the shape again.');return;}
  const undo=window.MosaicReconstruction.snapshot();
  const group=item.group||core.newGroup(item.oldMask,item.label||'Region');
  if(!group.objectOriginal){
    // Preserve the native silhouette before the removal patch adds edge padding.
    const original=group.maskCrop?makeCanvas(canvas.width,canvas.height):clone(group.footprint||item.oldMask);
    if(group.maskCrop)original.getContext('2d').drawImage(group.maskCrop.mask,group.maskCrop.x,group.maskCrop.y);
    const appearance=clone(state.master),ctx=appearance.getContext('2d');
    ctx.globalCompositeOperation='destination-in';ctx.drawImage(original,0,0);
    group.objectOriginal={mask:original,appearance,repairs:[]};
  }
  group.objectId=group.objectId||group.id;
  if(item.label&&!group.objectLabel)group.objectLabel=item.label;
  const sourceId=core.uid('geometry_source'),patchId=core.uid('geometry_patch'),mask=clone(item.masks.padded);
  state.sources.set(sourceId,{id:sourceId,name:(item.operation==='remove'?'Removed ':'Shape edited ')+(item.label||'object'),canvas:clone(item.aligned)});
  const paths=core.maskPathsFromRaster(mask);
  const patch={
    id:patchId,sourceId,groupId:group.id,mask,bbox:core.exactMaskBoundingBox(mask),
    maskPaths:paths,maskPoints:paths.flat(),prompt:item.prompt,
    name:item.operation==='remove'?'Removed '+(item.label||'object'):core.optionNameFromPrompt(item.prompt,'New shape'),
    manualName:true,editMode:item.operation,geometryObjectMask:item.newMask?clone(item.newMask):null,
    geometryPreviousMask:clone(item.oldMask),geometryRevealedMask:clone(item.masks.reveal),
    objectId:group.objectId,objectLabel:item.label,objectMaskUncertain:false
  };
  state.patches.set(patchId,patch);group.patchIds.push(patchId);group.active=patchId;
  group.objectRemoved=item.operation==='remove';group.geometryVersion=(group.geometryVersion||0)+1;
  core.refreshGroupFootprint(group);
  // Retain the RGB evidence, its source, and the portion of the previous object
  // that was uncovered. Ownership is deliberately unresolved until verified.
  state.objectReconstruction??={version:1,events:[]};
  const reconstructionEvent={
    id:core.uid('reconstruction'),groupId:group.id,patchId,sourceId,
    operation:item.operation,geometryVersion:group.geometryVersion,
    oldMask:clone(item.oldMask),newMask:item.newMask?clone(item.newMask):null,
    revealedMask:clone(item.masks.reveal),
    revealedRGB:(()=>{const c=clone(item.aligned),x=c.getContext('2d');x.globalCompositeOperation='destination-in';x.drawImage(item.masks.reveal,0,0);return c;})(),
    cameraOffset:item.offset,ownershipVersion:item.operation==='remove'?3:2,ownership:item.assignments.length?(core.exactMaskBoundingBox(item.unresolved)?'partially-matched':'matched'):'unassigned',
    unresolvedMask:clone(item.unresolved),
    assignments:item.assignments.map(a=>({...a,mask:clone(a.mask)})),
    createdAt:new Date().toISOString()
  };
  for(const assignment of reconstructionEvent.assignments){
    let owner=state.groups.find(g=>g.id===assignment.groupId);
    if(!owner){
      owner=core.newGroup(assignment.mask,core.categoryFromText(assignment.label));
      owner.name=assignment.label;owner.objectName=assignment.label;owner.objectLabel=assignment.label;owner.manualName=true;
      owner.reconstructionEventId=reconstructionEvent.id;
      assignment.groupId=owner.id;
    }
    owner.reconstructionExpanded=true;
  }
  state.objectReconstruction.events.push(reconstructionEvent);
  accumulateRevealedPixels(reconstructionEvent,item.before,item.aligned);
  core.invalidateDisplayedMask(patch);
  window.MosaicReconstruction.sync();
  state.undo.push({type:'object-reconstruction',value:undo});core.trimUndo();state.redo=[];
  window.MosaicRecovery?.markChanged?.();
  closeReview();renderGroups();render();
  if(item.operation==='remove')core.resetSelection();
  else core.selectGroupMask(group,{showOutline:false});
  toast('Edit applied. Previous options and newly revealed pixels are retained in the .moz project.');
}
// A Create result is an independent RGBA foreground layer. Removing it
// needs no background reconstruction: the accepted scene already exists
// underneath. Keep the earlier cutout Options intact for one-click restore.
function removeCreatedCutout(){
  const group=state.groups.find(g=>g.id===state.draftGroupId||
    g.patchIds.includes(state.selectionTargetPatchId));
  if(!group?.createdLocally)return false;
  if(state.busy||state.pendingSourceId||state.editingPatchId){
    toast('Finish the current edit before removing this cutout.');return true;
  }
  if(processing||review){
    toast('Finish the current preview first.');return true;
  }
  const current=state.patches.get(group.active);
  if(!current||current.generating||current.awaitingResult){
    toast('Finish generating the cutout first.');return true;
  }
  if(current.localCutoutRemoval){
    toast('This cutout is already removed. Choose another Option to restore it.');return true;
  }
  let removed=group.patchIds.map(id=>state.patches.get(id)).find(p=>p?.localCutoutRemoval);
  if(!removed){
    const id=core.uid('remove_cutout');
    // Empty alpha; no new RGB source, image generation, SAM, or ownership work.
    // Reuse the existing source reference only for Option bookkeeping.
    removed={
      id,groupId:group.id,sourceId:current.sourceId,
      mask:makeCanvas(1,1),bbox:{...current.bbox},
      maskPaths:[],maskPoints:[],name:'Removed',manualName:true,
      editMode:'remove',localCutoutRemoval:true,objectId:group.objectId||group.id,
      createdAt:new Date().toISOString()
    };
    state.patches.set(id,removed);group.patchIds.push(id);
  }
  group.active=removed.id;
  group.objectRemoved=true;
  // Geometry, pixels and masks beneath this foreground never changed.
  // Just invalidate click picking; do NOT recalculate a Group footprint.
  window.MosaicObjectMap?.invalidateHitIndex?.();
  core.resetSelection();
  renderGroups();render();
  window.MosaicDiskCache?.schedule?.();
  toast('Cutout removed. Choose an earlier Option to restore it.');
  return true;
}
$('geometryDiscard').addEventListener('click',()=>{closeReview();toast('Shape preview discarded.');});
$('geometryApply').addEventListener('click',commit);
async function generate(prompt,files=[],operation='shape'){
  if(operation==='remove'&&removeCreatedCutout())return;
  if(processing){toast('A shape edit is already generating.');return;}
  if(review){toast('Apply or discard the current preview first.');return;}
  if(!state.master||!core.selectionBounds()){toast('Select one object first.');return;}
  core.ensureSelectionMask();
  if(state.pendingSourceId||state.editingPatchId){toast('Finish the pending import or mask edit first.');return;}
  const oldMask=clone(state.selectionMask),generation=state.selectionGeneration,master=state.master;
  const sceneStamp=()=>JSON.stringify(state.groups.map(g=>[g.id,g.active,g.objectRemoved,g.geometryVersion,g.frontStackOrder,g.createdStackOrder]));
  const submittedScene=sceneStamp();
  const isCurrent=()=>generation===state.selectionGeneration&&state.master===master&&sceneStamp()===submittedScene;
  let group,label;
  try{group=chooseGroup(oldMask);label=promptLabel(group);
    if(operation==='shape'&&!label)throw Error('Name or select a recognized object before Shape editing so SAM can identify it.');
  }catch(error){toast(error.message);return;}
  const snapshot=core.materialEditSnapshot([{groupId:group?.id,mask:oldMask}]);
  const before=snapshot.image;
  processing=true;const submit=promptForm.querySelector('[type="submit"]');
  if(submit)submit.disabled=true;
  try{
    const task=operation==='remove'?'Remove the selected '+(label||'object')+' completely. Reconstruct all newly visible background surfaces naturally, matching existing material, structure, perspective and light.':
      prompt;
    const fullPrompt='OBJECT GEOMETRY EDIT: '+task+' Keep the camera, focal length, perspective, room structure, framing and ALL unselected objects unchanged. Render the ENTIRE image at the same viewpoint and resolve any background exposed by the edit. Do not create colored masks or labels.';
    toast(operation==='remove'?'Removing object in full image…':'Generating full-image shape edit…');
    const generated=operation==='remove'?await window.MosaicPremium.generateRemoval(task,oldMask,group?.id,files):await window.MosaicPremium.generateComposition(fullPrompt,files,before,null,{editIntent:operation,targetLabel:label});
    if(!isCurrent()){toast('The project changed during generation; result discarded.');return;}
    const alignedResult=alignTranslation(before,generated,oldMask);
    let newMask=null;
    if(operation==='shape')newMask=await samMask(alignedResult.image,label,oldMask);
    if(!isCurrent()){toast('The project changed during segmentation; result discarded.');return;}
    const masks=operationMasks(oldMask,newMask,operation);
    const {assignments,unresolved,analysisFailed}=operation==='remove'?{assignments:[],unresolved:clone(masks.reveal),analysisFailed:false}:await matchRevealedOwners(alignedResult.image,masks.reveal,group,before,isCurrent);
    if(!isCurrent()){toast('Project changed while matching surfaces.');return;}
    const result=compositedResult(core.composeApprovedCanvas(),alignedResult.image,masks.padded);
    // Restore omitted foreground layers in the preview using their exact visible pixels.
    for(const id of snapshot.excludedGroupIds){const g=state.groups.find(g=>g.id===id),p=state.patches.get(g?.active),source=state.sources.get(p?.sourceId);if(p&&source)core.drawPatch(result.getContext('2d'),p,source)}
    review={generation,master,isCurrent,oldMask,newMask,group,label,prompt:task,operation,masks,aligned:alignedResult.image,offset:alignedResult.offset,result,assignments,unresolved,analysisFailed,before};
    showReview(result,alignedResult.status+' · '+(operation==='remove'?'Removed area retained / use Select Add to assign parts': 'SAM outline validated'),operation);
    toast('Review the new image, then Apply or Discard.');
  }catch(error){toast('Shape edit: '+(error?.message||'Unable to generate. Original image is unchanged.'));}
  finally{processing=false;if(submit)submit.disabled=false;}
}
$('geometryRemoveBtn').addEventListener('click',()=>void generate('',window.MosaicPremium.getReferenceFiles?.('quick')||[],'remove'));
window.addEventListener('mosaic:projectloaded',()=>{closeReview();setMode('material')});
window.MosaicGeometryEdit={generate,syncPromptMode,getMode:()=>isFreshCreate()?'material':mode,setMode,discard:closeReview};
