window.runEarlyUIChecks=async function(){
 const c=window.MosaicCore,{state,makeCanvas,overlay}=c,checks=[],assert=(v,m)=>{if(!v)throw Error(m)};
 const base=makeCanvas(800,600);base.getContext('2d').fillStyle='#998877';base.getContext('2d').fillRect(0,0,800,600);state.reference=base;c.setMaster(base,'Early users UI',false);
 for(let i=0;i<25;i++){const m=makeCanvas(800,600);m.getContext('2d').fillRect(i*20,80,16,150);const g=c.newGroup(m,'Furniture');g.name='Object '+i;g.manualName=true;g.mapPrepared=true;}
 const g=state.groups.at(-1);g.name='Selected cabinet';
 for(let i=0;i<9;i++){const id='ui-option-'+i;state.sources.set(id,{id,canvas:base});state.patches.set(id,{id,sourceId:id,groupId:g.id,mask:c.groupMask(g),bbox:g.area,name:'Finish '+i,maskPaths:[]});g.patchIds.push(id)}
 c.renderGroups();c.selectGroupMask(g,{showOutline:true});c.showQuickPrompt(null,true,false);
 await new Promise(r=>setTimeout(r,100));
 assert(document.getElementById('quickPromptObjectName').textContent==='Selected cabinet','Object title missing');
 const rail=document.querySelector('#quickGroupOptions .quick-option-list');assert(rail&&rail.scrollWidth>rail.clientWidth,'Options do not scroll horizontally');
 assert(!document.querySelector('#groupList [data-action="bring-object-to-front"]'),'Sidebar still contains Bring to front');
 document.getElementById('quickPromptMore').click();assert(!document.getElementById('quickPromptMorePanel').hidden&&document.getElementById('quickEditMode'),'More did not reveal edit dropdown');
 document.getElementById('quickPromptMore').click();checks.push('Named prompt, Generate beside input, horizontally scrolling options and More controls');
 const row=document.querySelector('.region-group[data-group="'+g.id+'"]');assert(row.classList.contains('object-focused'),'Selected object missing sidebar highlight');
 const list=document.getElementById('groupList'),rb=row.querySelector('.group-head').getBoundingClientRect(),lb=list.getBoundingClientRect();assert(rb.top>=lb.top-2&&rb.bottom<=lb.bottom+2,'Selected object was not scrolled into view');checks.push('Canvas selection highlights and scrolls the selected sidebar object');
 c.hideQuickPrompt();const dock=document.querySelector('.canvas-corner-actions'),before=dock.getBoundingClientRect(),v=document.getElementById('viewport'),b=v.getBoundingClientRect();
 for(let i=0;i<6;i++)v.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-400,clientX:b.left+b.width/2,clientY:b.top+b.height/2}));
 assert(state.zoom>4,'Zoom still limited to 4x');
 const fixed=dock.getBoundingClientRect();assert(Math.abs(fixed.left-before.left)<1&&Math.abs(fixed.top-before.top)<1,'Fit/Compare moved during zoom');
 v.scrollLeft=0;v.scrollTop=0;let image=overlay.getBoundingClientRect();assert(image.left>=b.left&&image.top>=b.top,'Top/left image edges cannot be reached');
 v.scrollLeft=v.scrollWidth;v.scrollTop=v.scrollHeight;image=overlay.getBoundingClientRect();assert(image.right<=b.right+1&&image.bottom<=b.bottom+1,'Bottom/right edges cannot be reached');
 document.getElementById('zoomValue').click();assert(state.zoom===state.fitZoom,'Fit did not reset zoom');checks.push('Zoom beyond 4x, fixed Fit/Compare, all four image edges reachable, Fit reset');
 c.selectGroupMask(g);c.showQuickPrompt(null,true,false);return {passed:checks.length,checks};
};
