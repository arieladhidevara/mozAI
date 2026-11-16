window.runPromptSearchChecks=async function(){
 const core=window.MosaicCore,{state,makeCanvas}=core,checks=[],assert=(v,m)=>{if(!v)throw Error(m)};
 document.querySelector('.guide-skip')?.click();document.getElementById('apiKeyDialog')?.close();
 const image=makeCanvas(800,600);image.getContext('2d').fillStyle='#9b8877';image.getContext('2d').fillRect(0,0,800,600);state.reference=image;core.setMaster(image,'Prompt refinements',false);
 const add=(name,x)=>{const mask=makeCanvas(800,600);mask.getContext('2d').fillRect(x,160,70,130);const g=core.newGroup(mask,'Furniture');g.name=name;g.manualName=true;g.mapPrepared=true;return g};
 const cabinet=add('Oak cabinet',320),chair=add('Lounge chair',520);
 state.objectCollections=[{id:'lounge',name:'Living room'}];chair.collectionId='lounge';
 for(let i=0;i<7;i++){const id='prompt-refine-'+i;state.sources.set(id,{id,canvas:image});state.patches.set(id,{id,sourceId:id,groupId:cabinet.id,mask:core.groupMask(cabinet),bbox:cabinet.area,name:'Finish '+i});cabinet.patchIds.push(id)}
 core.renderGroups();core.selectGroupMask(cabinet);core.showQuickPrompt(null,true,false);
 document.querySelector('[data-mobile-tab=ai]')?.click();
 await new Promise(r=>setTimeout(r,100));
 const form=document.getElementById('quickAreaPromptForm'),button=document.getElementById('quickPromptMore'),panel=document.getElementById('quickPromptMorePanel'),mobile=Boolean(form.closest('#mobileEditPane'));
 if(!mobile){const v=document.getElementById('viewport').getBoundingClientRect();form.style.left=(v.left+20)+'px';form.style.top=(v.top+110)+'px'}
 const before=form.getBoundingClientRect();button.click();await new Promise(r=>requestAnimationFrame(r));
 const open=form.getBoundingClientRect(),side=panel.getBoundingClientRect();
 assert(button.textContent==='Less','More did not become Less');assert(Math.abs(open.width-before.width)<1,'Main prompt width changed');
 assert(Math.abs(open.left-before.left)<1&&Math.abs(open.top-before.top)<1,'Prompt jumped despite available space');
 assert(Math.abs(side.left-open.right)<2,'Right panel detached: '+JSON.stringify({left:open.left,right:open.right,sideLeft:side.left,sideRight:side.right,style:panel.style.cssText,computed:getComputedStyle(panel).left}));assert(side.height<=open.height+3,'Right panel grows below main surface');
 assert(getComputedStyle(panel).overflowY==='auto','Panel cannot scroll vertically');
 button.click();assert(button.textContent==='More'&&panel.hidden,'Less did not collapse panel');checks.push('Stable More/Less toggle, unchanged main width/position, attached scrolling right panel');
 if(!mobile){
  const v=document.getElementById('viewport').getBoundingClientRect();form.style.left=(v.right-before.width-10)+'px';const edge=form.getBoundingClientRect();button.click();await new Promise(r=>requestAnimationFrame(r));
  assert(form.getBoundingClientRect().left<edge.left,'Prompt did not move left at right edge');assert(panel.getBoundingClientRect().right<=v.right-9,'More escaped viewport');assert(Math.abs(form.getBoundingClientRect().top-edge.top)<1,'Edge adjustment changed vertical position');button.click();checks.push('Only the right-edge case shifts the prompt left');
 }
 document.querySelector('[data-mobile-tab=groups]')?.click();
 const search=document.getElementById('groupSearch'),visible=()=>[...document.querySelectorAll('#groupList .region-group')].filter(n=>!n.hidden).map(n=>n.dataset.group);
 search.value='cabinet';search.dispatchEvent(new Event('input',{bubbles:true}));assert(visible().length===1&&visible()[0]===cabinet.id,'Object search failed');
 search.value='living room';search.dispatchEvent(new Event('input',{bubbles:true}));assert(visible().length===1&&visible()[0]===chair.id,'Group-name search failed');
 search.value='not-found';search.dispatchEvent(new Event('input',{bubbles:true}));assert(visible().length===0&&document.getElementById('groupSearchStatus').textContent.includes('No matching'),'Missing empty-search state');
 search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));assert(visible().length===2&&state.groups.length===2,'Search changed stored objects');checks.push('Search matches objects and group names, handles no results, and restores the list');
 for(const icon of document.querySelectorAll('#tools .tool svg,#tools .tool .tool-glyph')){
  if(icon.closest('.navigation-toolset')||!icon.getClientRects().length)continue;
  const b=icon.closest('button').getBoundingClientRect(),i=icon.getBoundingClientRect();
  assert(Math.abs(i.left+i.width/2-b.left-b.width/2)<1.5&&Math.abs(i.top+i.height/2-b.top-b.height/2)<1.5,'Tool icon is off-center');
 }
 checks.push('Selection, Create and Edit symbols are centered in their hover boxes');
 core.selectGroupMask(cabinet);core.showQuickPrompt(null,true,false);document.querySelector('[data-mobile-tab=ai]')?.click();button.click();return {passed:checks.length,checks};
};
