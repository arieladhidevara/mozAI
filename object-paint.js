import {isCreatedGroup} from './object-mask-utils.mjs';
import {paintPixels} from './paint-color.mjs';
import './object-reconstruction.js';
const core=window.MosaicCore,{state,makeCanvas}=core;
const picker=document.getElementById('paintColor'),button=document.getElementById('paintTool');
let pending=false,menu=null,menuAnchor=null;
const controls=document.createElement('div');controls.className='object-color-controls';controls.hidden=true;
controls.innerHTML='<label><span class="color-slider-heading">Hue <output id="objectHueValue">0°</output></span><input id="objectHue" type="range" min="-180" max="180" step="1" value="0" aria-label="Object hue"></label><label><span class="color-slider-heading">Saturation <output id="objectSaturationValue">100%</output></span><input id="objectSaturation" type="range" min="0" max="200" step="1" value="100" aria-label="Object saturation"></label>';
document.getElementById('quickPromptMorePanel').prepend(controls);
const hue=document.getElementById('objectHue'),saturation=document.getElementById('objectSaturation');
const resizeButton=document.createElement('button');resizeButton.type='button';resizeButton.id='createdResizeBtn';resizeButton.className='btn btn-quiet compact';resizeButton.textContent='Resize';resizeButton.hidden=true;
document.getElementById('quickPromptMorePanel').append(resizeButton);
resizeButton.addEventListener('click',()=>core.startCreatedResize(selectedGroup()?.id));
const hover=document.createElement('canvas');hover.id='paintHoverOverlay';hover.className='paint-hover-overlay';hover.hidden=true;
hover.setAttribute('aria-hidden','true');document.getElementById('canvasWrap').append(hover);
let hoverTarget=null,hoverCrop=null,hoverColor=null,lastHoverPoint=null,hoverFrame=0;
let gesture=null,queuedAdjustment=null,adjustmentRunning=false,adjustmentFrame=0;
const copy=image=>{const out=makeCanvas(image.width,image.height);out.getContext('2d').drawImage(image,0,0);return out};
function available(group){
  const patch=state.patches.get(group?.active);
  return Boolean(state.master&&!state.busy&&!state.before&&!state.pendingSourceId&&!state.editingPatchId&&
    !window.MosaicSourceEditor?.isEditing()&&!window.MosaicPremium?.isPreviewing()&&
    group&&state.groups.includes(group)&&!group.objectRemoved&&!group.mergedInto&&!group.cutArchived&&!group.objectMapBatch&&
    !patch?.generating&&!patch?.awaitingResult&&!patch?.createCleanupPending);
}
async function prepare(group){
  if(!available(group))throw Error('Choose a finished object option first.');
  const patch=state.patches.get(group.active),source=patch&&state.sources.get(patch.sourceId);
  const master=state.master,active=group.active,version=core.groupChoiceVersion(group);
  if(patch&&!source)throw Error('This option has no image.');
  if(source&&!source.canvas)await window.MosaicDiskCache.ensure(source,'canvas');
  if(!available(group)||state.master!==master||group.active!==active||core.groupChoiceVersion(group)!==version)
    throw Error('Object changed. Click it again to paint.');
  // Ordinary options retain their source geometry, including skew and soft PNG alpha.
  if(patch&&(!group.reconstructionExpanded||patch.localBakedAppearance)){
    const prepared={...patch};
    if(patch.editMode==='shape'&&patch.geometryObjectMask)prepared.localShapeOrigin=patch.localShapeOrigin||patch.id;
    return {patch:prepared,source:{...source},active};
  }
  // Original and manually expanded objects are captured independently of foreground
  // Create layers, so another object's pixels can never be baked into this option.
  const mask=copy(core.groupMask(group)),bbox=core.exactMaskBoundingBox(mask);
  if(!bbox)throw Error('This object has no visible pixels.');
  const image=copy(state.master),ctx=image.getContext('2d');
  window.MosaicReconstruction.drawGroup(ctx,group);
  if(patch){
    if(!window.MosaicReconstruction.drawOption(ctx,group,patch,source))core.drawPatch(ctx,patch,source);
    window.MosaicObjects?.drawOptionRepairs(ctx,group,patch);
  }else window.MosaicObjects?.drawOriginal(ctx,group);
  return {active,patch:{mask,bbox,groupId:group.id,editMode:'material',localBakedAppearance:true,
    reconstructionEvents:window.MosaicReconstruction.activeIds()},source:core.compactOptionSource(image,bbox,4)};
}
function commit(group,patch,source,before,{adjustment=false,gestureKey=null}={}){
  state.sources.set(source.id,source);state.patches.set(patch.id,patch);
  if(!group.patchIds.includes(patch.id))group.patchIds=[...group.patchIds,patch.id];
  group.active=patch.id;group.objectRemoved=false;core.recordGroupChoice(group);
  core.invalidateDisplayedMask(patch,{geometryChanged:false});core.refreshGroupFootprint(group);
  window.MosaicReconstruction.sync();
  if(!gestureKey||state.undo.at(-1)?.gestureKey!==gestureKey)
    state.undo.push({type:'object-option',value:before,gestureKey});
  core.trimUndo();state.redo=[];
  state.expandedObjectId=group.id;state.expandedOptionId=patch.id;
  if(!adjustment||state.selectionTargetPatchId!==patch.id)core.selectGroupMask(group,{showOutline:false});
  core.renderGroups();core.render();
  if(!adjustment)core.showQuickPrompt(state.lastCanvasPointer,false,false);
  window.MosaicRecovery?.markChanged?.();window.MosaicDiskCache?.schedule?.();
}
async function duplicate(group){
  if(pending)return false;pending=true;
  try{
    const prepared=await prepare(group),before=window.MosaicReconstruction.snapshot({pinActiveSources:true});
    const id=core.uid('patch'),source={...prepared.source,id:core.uid('source'),name:'Copied option'};
    // The initial immutable image may be shared. Paint always creates a private RGB copy.
    const patch={...prepared.patch,id,groupId:group.id,sourceId:source.id,
      name:(prepared.patch.name||'Original')+' copy',manualName:true,localOption:true};
    delete patch.request;delete patch.generationRecord;delete patch.generating;
    commit(group,patch,source,before);core.toast('Option copied. Paint it or add a prompt.');return patch.id;
  }catch(error){core.toast(error.message);return false}finally{pending=false}
}
async function paint(group,color=picker.value){
  if(pending)return false;pending=true;
  try{
    const prepared=await prepare(group),before=window.MosaicReconstruction.snapshot({pinActiveSources:true});
    const source={...prepared.source,id:core.uid('source'),canvas:copy(prepared.source.canvas),name:'Paint '+color};
    delete source.canvasDiskKey;
    const ctx=source.canvas.getContext('2d',{willReadFrequently:true});
    if(prepared.patch.colorAdjustment){
      // Paint starts from the visible adjusted pixels and resets the old controls.
      ctx.clearRect(0,0,source.canvas.width,source.canvas.height);
      ctx.filter=adjustmentFilter(prepared.patch.colorAdjustment);ctx.drawImage(prepared.source.canvas,0,0);ctx.filter='none';
    }
    const pixels=ctx.getImageData(0,0,source.canvas.width,source.canvas.height);
    const mask=makeCanvas(source.canvas.width,source.canvas.height),mc=mask.getContext('2d');
    const paintMask=prepared.patch.geometryObjectMask||prepared.patch.mask;
    const maskOffset=prepared.patch.geometryObjectMask?null:prepared.patch.maskOffset;
    mc.drawImage(paintMask,(maskOffset?.x||0)-(source.crop?.x||0),(maskOffset?.y||0)-(source.crop?.y||0));
    pixels.data.set(paintPixels(pixels.data,color,mc.getImageData(0,0,mask.width,mask.height).data));ctx.putImageData(pixels,0,0);
    const id=prepared.active||core.uid('patch'),patch={...prepared.patch,id,groupId:group.id,sourceId:source.id,
      name:prepared.active?(prepared.patch.name||'Paint '+color):'Paint '+color,manualName:true,paintColor:color,localOption:true};
    delete patch.colorAdjustment;
    clearHover();commit(group,patch,source,before);core.toast('Paint applied to this option.');return id;
  }catch(error){core.toast(error.message);return false}finally{pending=false}
}
function paintAt(point){
  const group=window.MosaicObjectMap?.hitTest(point);
  if(!group){core.toast('Click an object to paint. Select an area first if it has no object mask.');return false}
  return paint(group);
}
function adjustmentFilter(value){return `hue-rotate(${value.hue}deg) saturate(${value.saturation}%)`}
async function adjust(group,hueValue,saturationValue,gestureKey=null){
  if(pending)return false;pending=true;
  try{
    const prepared=await prepare(group),before=window.MosaicReconstruction.snapshot({pinActiveSources:true});
    const value={hue:Math.max(-180,Math.min(180,Number(hueValue)||0)),saturation:Math.max(0,Math.min(200,Number(saturationValue)||0))};
    const id=prepared.active||core.uid('patch'),source={...prepared.source,id:prepared.source.id||core.uid('source')};
    const patch={...prepared.patch,id,groupId:group.id,sourceId:source.id,colorAdjustment:value,
      name:prepared.patch.name||'Color adjustment',manualName:true,localOption:true};
    commit(group,patch,source,before,{adjustment:true,gestureKey});return id;
  }catch(error){core.toast(error.message);return false}finally{pending=false}
}
function selectedGroup(){return state.groups.find(g=>g.id===state.draftGroupId||g.patchIds.includes(state.selectionTargetPatchId))}
function syncControls(group=selectedGroup()){
  if(controls.dataset.groupId!==(group?.id||'')){gesture=null;controls.dataset.groupId=group?.id||''}
  controls.hidden=!available(group)||Boolean(state.objectSelectionParts?.length>1);
  resizeButton.hidden=!isCreatedGroup(group)||!state.patches.get(group?.active)||!available(group)||Boolean(state.objectSelectionParts?.length>1);
  resizeButton.disabled=Boolean(state.patches.get(group?.active)?.localCutoutRemoval);
  const value=state.patches.get(group?.active)?.colorAdjustment||{hue:0,saturation:100};
  if(queuedAdjustment?.group!==group){hue.value=value.hue;saturation.value=value.saturation}
  document.getElementById('objectHueValue').textContent=hue.value+'°';
  document.getElementById('objectSaturationValue').textContent=saturation.value+'%';
}
function queueAdjustment(){
  const group=selectedGroup();if(!group)return;
  gesture??=core.uid('color_gesture');
  queuedAdjustment={group,hue:Number(hue.value),saturation:Number(saturation.value),gestureKey:gesture};
  document.getElementById('objectHueValue').textContent=hue.value+'°';
  document.getElementById('objectSaturationValue').textContent=saturation.value+'%';
  if(!adjustmentFrame)adjustmentFrame=requestAnimationFrame(()=>{adjustmentFrame=0;void drainAdjustments()});
}
async function drainAdjustments(){
  if(adjustmentRunning)return;adjustmentRunning=true;
  try{
    while(queuedAdjustment){
      const next=queuedAdjustment;queuedAdjustment=null;
      if(selectedGroup()!==next.group)continue;
      await adjust(next.group,next.hue,next.saturation,next.gestureKey);
    }
  }finally{adjustmentRunning=false}
}
for(const input of [hue,saturation]){
  input.addEventListener('pointerdown',()=>{gesture=core.uid('color_gesture')});
  input.addEventListener('input',queueAdjustment);
  input.addEventListener('change',()=>{queueAdjustment();gesture=null});
  input.addEventListener('pointercancel',()=>{gesture=null});
}
function clearHover(){
  if(hoverFrame)cancelAnimationFrame(hoverFrame);hoverFrame=0;
  hover.hidden=true;hoverTarget=null;hoverCrop=null;lastHoverPoint=null;
}
function validateHover(){
  if(state.tool!=='paint'||!available(hoverTarget))clearHover();
}
function hoverAt(point){
  if(state.tool!=='paint'){clearHover();return}
  const group=window.MosaicObjectMap?.hitTest(point);
  if(!available(group)){clearHover();return}
  const crop=core.groupMaskCrop(group);if(!crop?.mask){clearHover();return}
  lastHoverPoint=point;
  if(hoverTarget!==group||hoverCrop!==crop.mask||hoverColor!==picker.value){
    hover.width=crop.mask.width;hover.height=crop.mask.height;
    const ctx=hover.getContext('2d');ctx.fillStyle=picker.value;ctx.fillRect(0,0,hover.width,hover.height);
    ctx.globalCompositeOperation='destination-in';ctx.drawImage(crop.mask,0,0);
    hoverTarget=group;hoverCrop=crop.mask;hoverColor=picker.value;
  }
  hover.style.left=(100*crop.x/core.canvas.width)+'%';hover.style.top=(100*crop.y/core.canvas.height)+'%';
  hover.style.width=(100*crop.mask.width/core.canvas.width)+'%';hover.style.height=(100*crop.mask.height/core.canvas.height)+'%';
  hover.hidden=false;
}
const viewport=document.getElementById('viewport');
viewport.addEventListener('pointermove',event=>{
  if(event.pointerType==='touch'||event.target.closest('form,button,input,select')){clearHover();return}
  const rect=core.overlay.getBoundingClientRect();
  const point={x:(event.clientX-rect.left)/rect.width*core.canvas.width,y:(event.clientY-rect.top)/rect.height*core.canvas.height};
  if(hoverFrame)cancelAnimationFrame(hoverFrame);
  hoverFrame=requestAnimationFrame(()=>{hoverFrame=0;hoverAt(point)});
});
viewport.addEventListener('pointerleave',clearHover);
function closeMenu(){menu?.remove();menu=null;menuAnchor=null}
function showAddMenu(anchor,group){
  closeMenu();if(!available(group)){core.toast('Choose a finished object first.');return}
  menu=document.createElement('div');menu.className='add-option-menu';menu.setAttribute('role','group');menu.setAttribute('aria-label','Add option');
  const make=(title,detail,action)=>{
    const item=document.createElement('button');item.type='button';item.innerHTML='<strong></strong><small></small>';
    item.querySelector('strong').textContent=title;item.querySelector('small').textContent=detail;
    item.addEventListener('click',()=>{closeMenu();action()});menu.append(item);
  };
  make('Duplicate option','Copy current look · no AI',()=>void duplicate(group));
  make('Generate option','Describe a new look with AI',()=>{
    core.selectGroupMask(group,{showOutline:true});core.showQuickPrompt(state.lastCanvasPointer,true,true);
    window.MosaicMobile?.openAI();document.getElementById('quickAreaPromptInput').focus({preventScroll:true});
  });
  document.body.append(menu);const r=anchor.getBoundingClientRect(),height=menu.offsetHeight;
  menuAnchor=anchor;
  menu.style.left=Math.max(8,Math.min(innerWidth-menu.offsetWidth-8,r.left))+'px';
  menu.style.top=(r.bottom+height+8<innerHeight?r.bottom+5:Math.max(8,r.top-height-5))+'px';
  menu.querySelector('button').focus({preventScroll:true});
}
function outsideMenu(event){if(menu&&!menu.contains(event.target)&&!menuAnchor?.contains(event.target))closeMenu()}
for(const type of ['pointerdown','click','focusin'])document.addEventListener(type,outsideMenu,true);
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu()});
window.addEventListener('resize',closeMenu);document.addEventListener('scroll',closeMenu,true);
button.addEventListener('click',()=>picker.click());
picker.addEventListener('input',()=>{button.style.setProperty('--paint-color',picker.value);button.title='Paint '+picker.value+' · choose color, then click an object';if(lastHoverPoint)hoverAt(lastHoverPoint)});
picker.addEventListener('change',()=>core.selectTool('paint'));
window.MosaicPaint={paint,paintAt,duplicate,showAddMenu,adjust,syncControls,hoverAt,clearHover,validateHover};
