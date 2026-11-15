/* iPhone-first workspace: Groups and Assistant share a fixed-height dock.
   Editing tools remain on the canvas. Safari's keyboard only moves the composer. */
import './app.js';
const $=id=>document.getElementById(id);
const sidebar=$('inspectorPanel'),chat=$('compositionChat'),dock=chat?.parentElement;
if(!sidebar||!chat||!dock)throw Error('Mobile workspace requires Groups and AI Edit.');
const mobile=window.matchMedia('(max-width:850px)');
const tabs=['groups','ai'];
const nav=document.createElement('nav');
nav.id='mobileBottomTabs';nav.className='mobile-bottom-tabs';
nav.setAttribute('aria-label','Mobile workspace views');
nav.innerHTML=[
  '<button type="button" data-mobile-tab="groups" aria-selected="true">▤ <span>Groups</span></button>',
  '<button type="button" data-mobile-tab="ai" aria-selected="false">✧ <span>Assistant</span></button>'
].join('');
const editPane=document.createElement('section');
editPane.id='mobileEditPane';editPane.setAttribute('aria-label','AI Edit composer');
sidebar.prepend(nav);
sidebar.append(editPane);
let current='groups';
function activate(next){
  if(!tabs.includes(next))return;
  current=next;sidebar.dataset.mobileTab=current;
  for(const button of nav.querySelectorAll('[data-mobile-tab]')){
    const selected=button.dataset.mobileTab===current;
    button.setAttribute('aria-selected',String(selected));
    button.tabIndex=selected?0:-1;
  }
  if(current==='ai'&&mobile.matches)syncAssistantContext();
  if(current==='groups'&&mobile.matches){
    const focused=$('groupList')?.querySelector('.region-group.selected');
    focused?.scrollIntoView?.({block:'nearest',inline:'nearest'});
  }
}
nav.addEventListener('click',event=>{
  const button=event.target.closest('[data-mobile-tab]');
  if(button)activate(button.dataset.mobileTab);
});
nav.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
  event.preventDefault();
  const index=tabs.indexOf(current),step=event.key==='ArrowRight'?1:-1;
  const next=tabs[(index+step+tabs.length)%tabs.length];
  activate(next);nav.querySelector('[data-mobile-tab="'+next+'"]').focus();
});
function updateLayout(){
  if(mobile.matches){
    if(chat.parentElement!==editPane)editPane.append(chat);
    activate(current);
  }else{
    if(chat.parentElement!==dock)dock.append(chat);
    sidebar.removeAttribute('data-mobile-tab');
  }
}
mobile.addEventListener('change',updateLayout);updateLayout();
let touch=null;
sidebar.addEventListener('touchstart',event=>{
  if(!mobile.matches||event.touches.length!==1||
    event.target.closest('input,textarea,select,.group-list,.region-group,.group-options,.object-category-items'))return;
  const t=event.touches[0];touch={x:t.clientX,y:t.clientY};
},{passive:true});
sidebar.addEventListener('touchend',event=>{
  if(!touch||!mobile.matches||!event.changedTouches.length)return;
  const t=event.changedTouches[0],dx=t.clientX-touch.x,dy=t.clientY-touch.y;touch=null;
  if(Math.abs(dx)<55||Math.abs(dx)<Math.abs(dy)*1.3)return;
  const i=tabs.indexOf(current)+(dx<0?1:-1);
  if(i>=0&&i<tabs.length)activate(tabs[i]);
},{passive:true});
sidebar.addEventListener('touchcancel',()=>{touch=null},{passive:true});
// Keep the canvas height independent from Safari's visual viewport: only the
// composer moves when the software keyboard appears.
const viewport=window.visualViewport;
let restingHeight=window.innerHeight,restingWidth=window.innerWidth;
function composerInput(){
  const field=document.activeElement;
  return Boolean(field?.matches?.('input,textarea,[contenteditable=true]')&&editPane.contains(field));
}
function keyboard(){
  const root=document.documentElement;
  if(!mobile.matches){root.classList.remove('moz-keyboard-open');return}
  const vv=window.visualViewport,height=vv?.height||window.innerHeight,top=vv?.offsetTop||0;
  const isTyping=composerInput(),hidden=Math.max(0,restingHeight-(top+height));
  const open=Boolean(isTyping&&hidden>120);
  // Do not overwrite the baseline during keyboard-dismiss animation.
  if(!open&&!isTyping&&hidden<90)restingHeight=window.innerHeight;
  root.style.setProperty('--moz-mobile-screen-height',Math.round(restingHeight)+'px');
  root.style.setProperty('--moz-mobile-visible-bottom',Math.round(top+height)+'px');
  root.classList.toggle('moz-keyboard-open',open);
}
viewport?.addEventListener('resize',keyboard);
viewport?.addEventListener('scroll',keyboard);
editPane.addEventListener('focusin',event=>{
  if(!mobile.matches||!event.target.matches('input,textarea'))return;
  if(current!=='ai')activate('ai');
  requestAnimationFrame(keyboard);
});
editPane.addEventListener('focusout',()=>requestAnimationFrame(keyboard));
window.addEventListener('orientationchange',()=>{
  requestAnimationFrame(()=>{restingHeight=window.innerHeight;restingWidth=window.innerWidth;updateLayout();keyboard();window.MosaicCore?.updateZoomFit?.()});
});
window.MosaicMobile={activate,active:()=>current,isMobile:()=>mobile.matches};



/* Mobile v2: three fixed zones; contextual editor controls live in bottom dock.
   Preserve all existing desktop node handlers by moving, not cloning, elements. */
const mobileToolPane=document.createElement('section');
mobileToolPane.id='mobileToolPane';mobileToolPane.className='mobile-tool-pane';
mobileToolPane.setAttribute('aria-label','Editing tools');
const mobileToolModes=document.createElement('div');mobileToolModes.className='mobile-tool-modes';
const mobileToolActions=document.createElement('div');mobileToolActions.className='mobile-tool-actions';
const mobileViewActions=document.createElement('div');mobileViewActions.className='mobile-view-actions';
mobileToolPane.append(mobileViewActions,mobileToolModes,mobileToolActions);
const mobileSettingsPane=document.createElement('section');
mobileSettingsPane.id='mobileSettingsPane';mobileSettingsPane.className='mobile-settings-pane';
mobileSettingsPane.setAttribute('aria-label','Project and edit settings');
const mobileStatus=document.createElement('div');mobileStatus.className='mobile-status';mobileStatus.id='mobileStatus';
sidebar.append(mobileToolPane,mobileSettingsPane,mobileStatus);
const toolRow=$('tools'),rightControls=toolRow?.querySelector('.toolbar-right');
const selectionModes=toolRow?.querySelector('.selection-modes');
const brushContext=toolRow?.querySelector('.brush-context');
const viewportCanvas=$('viewport'),areaForm=$('quickAreaPromptForm');
const sourcePanel=$('sourceEditorPanel'),sources=$('inspectorPanel')?.querySelector('.sources-panel');
const settings=$('advancedSettings'),settingsFooter=$('harmonizeSidebarBtn')?.closest('.inspector-bottom');
const geometryReview=$('geometryReviewBar'),processing=$('processing'),toastMessage=$('toast');
const beforeButton=$('beforeBtn'),fitButton=$('zoomValue');
function restorePoint(node){return node?{node,parent:node.parentElement,next:node.nextSibling}:null;}
const restoreNodes=[toolRow,rightControls,selectionModes,brushContext,areaForm,
  sourcePanel,sources,settings,settingsFooter,geometryReview,processing,toastMessage,
  beforeButton,fitButton].map(restorePoint).filter(Boolean);
function restoreDesktopNodes(){
  for(const item of restoreNodes){
    const {node,parent,next}=item;
    if(!parent||node.parentElement===parent)continue;
    if(next?.parentElement===parent)parent.insertBefore(node,next);
    else parent.append(node);
  }
}
nav.innerHTML=[
  '<button type="button" data-mobile-tab="groups" aria-selected="true">▤ <span>Groups</span></button>',
  '<button type="button" data-mobile-tab="ai" aria-selected="false">✧ <span>Assistant</span></button>'
].join('');
function syncAssistantContext(){
  if(!mobile.matches||!areaForm)return;
  const s=window.MosaicCore?.state;
  const hasSelected=Boolean(s?.draftGroupId||s?.selectionGeometry||s?.objectSelectionParts?.length);
  if(hasSelected&&areaForm.classList.contains('hidden')&&current==='ai')
    window.MosaicCore?.showQuickPrompt?.(undefined,true,false);
  editPane.dataset.composer=areaForm.classList.contains('hidden')?'full':'area';
}
const contextNote=document.createElement('div');
contextNote.id='mobileAssistantContext';
contextNote.className='mobile-assistant-context';
contextNote.setAttribute('aria-live','polite');
contextNote.textContent='Editing entire image';
editPane.append(contextNote);
function mountMobileNodes(){
  if(!mobile.matches){
    restoreDesktopNodes();
    return;
  }
  if(areaForm)editPane.insertBefore(areaForm,chat);
  if(geometryReview)editPane.append(geometryReview);
  if(sources)mobileSettingsPane.append(sources);
  if(sourcePanel)mobileSettingsPane.append(sourcePanel);
  if(settings)mobileSettingsPane.append(settings);
  if(settingsFooter)mobileSettingsPane.append(settingsFooter);
  if(processing)mobileStatus.append(processing);
  if(toastMessage)mobileStatus.append(toastMessage);
}
mobile.addEventListener('change',mountMobileNodes);
mountMobileNodes();
activate('groups');
syncAssistantContext();
const areaWatch=new MutationObserver(()=>{
  if(!mobile.matches)return;
  editPane.dataset.composer=areaForm.classList.contains('hidden')?'full':'area';
  const group=window.MosaicCore?.state?.groups?.find(g=>g.id===window.MosaicCore?.state?.draftGroupId);
  contextNote.textContent=areaForm.classList.contains('hidden')?'Editing entire image':(group?.name||'Selected object');
});
areaWatch.observe(areaForm,{attributes:true,attributeFilter:['class']});
// Selection updates the available Assistant mode without switching the user's
// Groups tab or resizing the panel.
viewportCanvas.addEventListener('pointerup',()=>{
  if(mobile.matches&&current==='ai')requestAnimationFrame(syncAssistantContext);
});
// Keep native modal dialogs native: opening settings/help must not rearrange
// the two-tab mobile bottom panel.
function updateVisibleHeight(){
  if(!mobile.matches)return;
  if(window.innerWidth!==restingWidth&&!composerInput()){
    restingWidth=window.innerWidth;
    restingHeight=window.innerHeight;
    requestAnimationFrame(()=>window.MosaicCore?.updateZoomFit?.());
  }
  keyboard(); // No fit/recenter or canvas resize on keyboard-only changes.
}
window.visualViewport?.addEventListener('resize',updateVisibleHeight);
window.addEventListener('resize',updateVisibleHeight);
mobile.addEventListener('change',updateVisibleHeight);
updateVisibleHeight();
window.MosaicMobile={activate,active:()=>current,isMobile:()=>mobile.matches,
  openTools:()=>{if(mobile.matches)$('tools')?.scrollIntoView?.({block:'nearest'})},
  openGroups:()=>activate('groups'),openAI:()=>activate('ai'),expand:()=>{}};

const groupList=$('groupList');
// Tapping empty space in the Management sheet clears its focus and canvas preview.
// Group cards, options, category controls and text fields retain their own actions.
groupList?.addEventListener('click',event=>{
  if(!mobile.matches||event.target.closest('.region-group,.object-category-head,button,input,textarea,select,[data-region-action]'))return;
  window.MosaicCore?.clearObjectSelection?.();
});
selectionModes?.addEventListener('click',event=>{
  if(!mobile.matches)return;
  const button=event.target.closest('[data-mode]');
  if(button)window.MosaicCore?.setMode?.(button.dataset.mode);
});
