window.prepareRecoveryDialog=async function(){
  const core=window.MosaicCore,{state,makeCanvas}=core;
  await window.MosaicAccount.ready();
  const image=makeCanvas(400,260),ctx=image.getContext('2d');
  ctx.fillStyle='#d7cbbc';ctx.fillRect(0,0,400,260);ctx.fillStyle='#7b6d5d';ctx.fillRect(60,65,180,125);
  state.reference=image;core.setMaster(image,'Living room material study',false);
  const project=await window.MosaicProjects.buildProjectData();
  const user=window.MosaicAccount.current(),owner=user?.id?'user:'+user.id:'guest';
  await new Promise((resolve,reject)=>{
    const request=indexedDB.open('mozai-local-recovery-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('workspaces');request.onerror=reject;
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('workspaces','readwrite');
      tx.objectStore('workspaces').put({blob:new Blob([JSON.stringify(project)],{type:'application/json'}),
        name:'Living room material study',updatedAt:Date.now()-5*60000,expiresAt:Date.now()+3600000,saved:false,version:1},owner);
      tx.oncomplete=()=>{db.close();resolve()};tx.onerror=reject;
    };
  });
  return {prepared:true};
};
window.runRecoveryDialogChecks=async function(){
  const assert=(ok,message)=>{if(!ok)throw Error(message)},pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  for(let i=0;i<200;i++){if(window.MosaicRecovery?.status().ready)break;await pause(20)}
  const core=window.MosaicCore,dialog=document.getElementById('projectLoadDialog');
  assert(!core.state.master&&!dialog.open,'A previous session opened automatically');
  document.getElementById('openProjectBtn').click();
  assert(dialog.open,'Load project did not offer the saved session');
  assert(document.getElementById('projectRecoveryName').textContent==='Living room material study','Saved project name missing');
  assert(document.getElementById('projectRecoverySavedAt').textContent.startsWith('Saved '),'Saved time missing');
  const box=dialog.getBoundingClientRect(),first=document.getElementById('projectRestoreBtn').getBoundingClientRect(),second=document.getElementById('projectLoadFileBtn').getBoundingClientRect();
  assert(box.left>=8&&box.right<=innerWidth-8&&box.top>=8&&box.bottom<=innerHeight-8,'Recovery dialog overflows the screen');
  assert(first.bottom<second.top&&first.width>box.width*.75&&second.width===first.width,'Load choices are not stacked, equally sized cards');
  assert(dialog.scrollWidth<=dialog.clientWidth,'Dialog scrolls horizontally');
  document.querySelector('[data-close-dialog="projectLoadDialog"]').click();
  assert(!dialog.open&&!core.state.master,'Close changed the current workspace');
  document.getElementById('openProjectBtn').click();
  const input=document.getElementById('projectOpenInput'),click=input.click;let fileOpened=false;
  input.click=()=>{fileOpened=true};document.getElementById('projectLoadFileBtn').click();input.click=click;
  assert(fileOpened&&!dialog.open&&!core.state.master,'Open file restored or discarded the previous session');
  document.getElementById('openProjectBtn').click();
  assert(dialog.open,'Choosing a file discarded recovery');
  return {passed:3,checks:['Explicit Load project shows the saved name/time in a responsive dialog','Close leaves the workspace empty','File choice keeps the previous session available'],viewport:{width:innerWidth,height:innerHeight},dialog:{width:box.width,height:box.height}};
};
window.runRecoveryRestoreChecks=async function(){
  await window.runRecoveryDialogChecks();
  const account=window.MosaicAccount.request,auth=window.MosaicAuth.request;
  window.MosaicAccount.request=async(path,...args)=>path.startsWith('/api/ai/')?Promise.reject(Error('Fixture: no AI needed')):account(path,...args);
  window.MosaicAuth.request=async(path,...args)=>path.startsWith('/api/ai/')?Promise.reject(Error('Fixture: no AI needed')):auth(path,...args);
  try{
    if(!await window.MosaicRecovery.restoreRecovery())throw Error('Session did not restore');
    if(!window.MosaicCore.state.master||window.MosaicCore.canvas.width!==400)throw Error('Restored image is missing');
    if(document.getElementById('projectLoadDialog').open)throw Error('Restore left the dialog open');
    return {passed:1,checks:['Restore loads the real .moz snapshot and closes the dialog']};
  }finally{window.MosaicAccount.request=account;window.MosaicAuth.request=auth}
};
