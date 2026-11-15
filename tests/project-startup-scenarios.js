// Run only in the isolated browser with the project-startup-check data namespace.
window.runProjectStartupChecks=async function(){
  const core=window.MosaicCore,{state,makeCanvas}=core,$=id=>document.getElementById(id),checks=[];
  const assert=(ok,message)=>{if(!ok)throw Error(message)};
  const wait=async fn=>{for(let i=0;i<250;i++){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error('Timed out waiting for project startup')};
  await wait(()=>window.MosaicRecovery?.status().ready);
  $('apiKeyDialog').close();
  assert(!state.master&&!state.reference,'Startup opened a project without a user choice');
  assert(!$('welcome').classList.contains('hidden')&&$('welcomeDescription').textContent.includes('Load project'),'Start screen does not explain loading projects');
  checks.push('Startup stays empty and explains Load project in the existing project menu');

  const input=$('projectOpenInput'),click=input.click,confirm=window.confirm;
  let pickers=0,confirmations=0;
  input.click=()=>{pickers++};window.confirm=()=>{confirmations++;return true};
  try{
    $('projectMenu').open=true;$('openProjectBtn').click();
    assert(pickers===1&&!state.reference&&!state.master,'Load project required a Base or opened the canvas before choosing a file');
    checks.push('Existing dropdown opens the project file picker directly without an image');
    const frame=makeCanvas(32,24);frame.getContext('2d').fillStyle='#468b62';frame.getContext('2d').fillRect(0,0,32,24);
    const data={format:'MOSAIC_PROJECT',version:1,images:[{id:0,data:frame.toDataURL()}],
      state:{reference:{$canvas:0},rawBase:{$canvas:0},sources:{$map:[]},patches:{$map:[]},groups:[],projectTitle:'Saved studio',projectTitleManual:true},
      premium:window.MosaicPremium.exportProjectState(),queue:[],ui:{projectName:'Saved studio'}};
    const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(data)],'Saved_studio.moz',{type:'application/json'}));
    input.files=transfer.files;input.dispatchEvent(new Event('change'));
    await wait(()=>Boolean(state.master)&&!$('openProjectBtn').disabled);
    assert(state.reference.toDataURL()===frame.toDataURL()&&$('projectName').textContent==='Saved studio','Saved project did not restore its Base and name');
    assert(confirmations===0&&$('welcome').classList.contains('hidden'),'Opening from empty startup incorrectly asked to replace an existing image');
    checks.push('Choosing a .moz file restores its Base and enters the canvas without a prior upload');

    const mask=makeCanvas(32,24);mask.getContext('2d').fillStyle='#fff';mask.getContext('2d').fillRect(4,4,12,12);
    const group=core.newGroup(mask,'Furniture');group.name='Saved chair';core.renderGroups();
    const snapshot=await window.MosaicProjects.buildProjectData();
    const actor=window.MosaicAccount.current(),owner=actor?.id?'user:'+actor.id:'guest';
    await new Promise((resolve,reject)=>{
      const request=indexedDB.open('mozai-local-recovery-v1',1);
      request.onsuccess=()=>{
        const db=request.result,tx=db.transaction('workspaces','readwrite'),now=Date.now();
        tx.objectStore('workspaces').put({blob:new Blob([JSON.stringify(snapshot)],{type:'application/json'}),updatedAt:now,expiresAt:now+86400000,saved:true,version:1},owner);
        tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error);
      };request.onerror=()=>reject(request.error);
    });
    checks.push('Saved a real project snapshot with editable object masks for the reload check');
  }finally{input.click=click;window.confirm=confirm}
  return {passed:checks.length,checks};
};

window.runProjectRecoveryStartupChecks=async function(){
  const core=window.MosaicCore,{state}=core,$=id=>document.getElementById(id),checks=[];
  const assert=(ok,message)=>{if(!ok)throw Error(message)};
  const wait=async fn=>{for(let i=0;i<250;i++){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error('Timed out waiting for recovery startup')};
  await wait(()=>window.MosaicRecovery?.status().ready);
  $('apiKeyDialog').close();
  assert(!state.master&&!state.reference&&!$('projectLoadDialog').open,'Recovery opened a project or dialog automatically on reload');
  assert(!$('welcome').classList.contains('hidden'),'Recovery skipped the start screen');
  checks.push('Reload with a saved recovery still shows the empty start screen');

  $('projectMenu').open=true;$('openProjectBtn').click();
  assert($('projectLoadDialog').open&&!state.master,'Load project did not offer an explicit recovery choice');
  const dialog=$('projectLoadDialog'),rect=dialog.getBoundingClientRect();
  assert(rect.left>=0&&rect.right<=innerWidth+1&&dialog.scrollWidth<=dialog.clientWidth+1,'Load project choices overflow the viewport');
  dialog.querySelector('[data-close-dialog]').click();
  assert(!dialog.open&&!state.master,'Cancel unexpectedly opened the previous project');
  checks.push('Load project offers recovery only on click, fits the viewport, and supports Cancel');

  const input=$('projectOpenInput'),click=input.click;let pickers=0;input.click=()=>{pickers++};
  try{
    $('openProjectBtn').click();$('projectLoadFileBtn').click();
    assert(pickers===1&&!dialog.open&&!state.master,'Choose project file restored the previous session');
  }finally{input.click=click}
  checks.push('Choosing a project file keeps the previous session unopened');

  $('openProjectBtn').click();$('projectRestoreBtn').click();
  await wait(()=>Boolean(state.master)&&!$('openProjectBtn').disabled);
  assert($('projectName').textContent==='Saved studio'&&state.groups.some(group=>group.name==='Saved chair'),'Explicit recovery lost the name or editable objects');
  assert(state.reference.width===32&&state.reference.height===24&&$('welcome').classList.contains('hidden'),'Explicit recovery did not restore the canvas');
  checks.push('Restore last session explicitly restores the project name, Base and editable object masks');
  return {passed:checks.length,checks};
};
