const tourWait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,25))}throw Error('Guide timed out')};
window.runFirstGuideChecks=async function(){
 document.getElementById('apiKeyDialog')?.close();
 const assert=(v,m)=>{if(!v)throw Error(m)};
 await tourWait(()=>document.querySelector('.moz-guide-overlay'));
 assert(document.querySelector('#mozGuideTitle').textContent==='Start with an image','Guide did not start at upload');
 document.querySelector('.guide-next').click();assert(document.querySelector('#mozGuideTitle').textContent==='Select an object or an area','Next failed');
 document.querySelector('.guide-back').click();assert(document.querySelector('#mozGuideTitle').textContent==='Start with an image','Back failed');
 document.querySelector('.guide-skip').click();assert(!document.querySelector('.moz-guide-overlay'),'Skip failed');
 const key='mozai.guide.v1:'+window.MosaicAccount.current().id;assert(localStorage.getItem(key)==='done','Skip was not persisted');
 return {passed:4,checks:['First visit shows guide','Next highlights the next area','Back returns to previous step','Skip persists completion']};
};
window.runReturningGuideChecks=async function(){
 await new Promise(r=>setTimeout(r,1000));
 if(document.querySelector('.moz-guide-overlay'))throw Error('Guide reappeared after Skip and reload');
 if(document.querySelector('#welcomeStart strong').textContent!=='Upload an Image')throw Error('Upload label regressed');
 if(document.querySelector('.assistant-heading').textContent.includes('Gemini'))throw Error('Provider badge remains');
 return {passed:3,checks:['Guide stays dismissed after reload','Welcome says Upload an Image','Assistant provider badge is absent']};
};
window.prepareFreshGuide=async function(){localStorage.removeItem('mozai.guide.v1:'+window.MosaicAccount.current().id);return {prepared:true}};
window.runCompleteGuideChecks=async function(){
 document.getElementById('apiKeyDialog')?.close();await tourWait(()=>document.querySelector('.moz-guide-overlay'));
 let count=0;while(document.querySelector('.moz-guide-overlay')){document.querySelector('.guide-next').click();if(++count>10)throw Error('Guide never completes')}
 if(count!==7)throw Error('Guide skipped steps');
 if(localStorage.getItem('mozai.guide.v1:'+window.MosaicAccount.current().id)!=='done')throw Error('Completion not persisted');
 return {passed:2,checks:['All seven guided steps can be completed','Completion persists without AI calls']};
};
window.runCompactPromptChecks=async function(){
 const c=window.MosaicCore,{state,makeCanvas}=c,base=makeCanvas(800,600);base.getContext('2d').fillRect(0,0,800,600);state.reference=base;c.setMaster(base,'Compact prompt',false);
 const m=makeCanvas(800,600);m.getContext('2d').fillRect(320,180,80,130);const g=c.newGroup(m,'Furniture');g.name='Cabinet';g.manualName=true;g.mapPrepared=true;
 for(let i=0;i<6;i++){const id='compact-'+i;state.sources.set(id,{id,canvas:base});state.patches.set(id,{id,groupId:g.id,sourceId:id,mask:m,bbox:{x:320,y:180,w:80,h:130},name:'Finish '+i});g.patchIds.push(id)}
 c.selectGroupMask(g);c.showQuickPrompt(null,true,false);
 const form=document.getElementById('quickAreaPromptForm');await tourWait(()=>form.getBoundingClientRect().width>0);
 const before=form.getBoundingClientRect();
 if(before.width>322||before.height>210)throw Error('Prompt is still too large: '+before.width+' x '+before.height);
 document.getElementById('quickPromptMore').click();await new Promise(r=>requestAnimationFrame(r));
 const after=form.getBoundingClientRect(),panel=document.getElementById('quickPromptMorePanel'),p=panel.getBoundingClientRect();
 if(after.width<=before.width||p.left<=after.left||p.right>after.right+1)throw Error('More is not attached inside the right side: '+JSON.stringify({before:{x:before.x,w:before.width},after:{x:after.x,w:after.width},panel:{x:p.x,w:p.width},display:getComputedStyle(form).display,parent:form.parentElement.id}));
 if(getComputedStyle(panel).position!=='static'||getComputedStyle(panel).boxShadow!=='none')throw Error('More still behaves as a detached popover');
 return {passed:3,checks:['Prompt is compact','More extends the same surface to the right','Attached controls stay inside the prompt']};
};
