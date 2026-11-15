// First-visit guidance stays outside the image/export composition.
const $=selector=>document.querySelector(selector);
let overlay=null,index=0,completed=false,previousFocus=null,key=null;
const steps=[
  {target:'#welcomeStart',fallback:'#projectMenu',title:'Start with an image',text:'Upload an image to start editing. You can also open a saved .moz project from the project menu.'},
  {target:'.selection-toolset',title:'Select an object or an area',text:'Click an object on the canvas, or use the dashed Line, Square and Circle tools. Add and Subtract let you refine your selection.'},
  {target:'.create-toolset',title:'Create something new',text:'Draw a placement area with the Create tools, then describe the object you want to add.'},
  {target:'#quickAreaPromptForm:not(.hidden)',fallback:'.selection-toolset',title:'Edit your selection',text:'Selecting an object opens its prompt. Describe a material or color, press Generate, then compare your options. More contains Shape and Bring to front.'},
  {target:'#groupsPanel',fallback:'#mobileBottomTabs',title:'Manage objects and options',text:'Your objects and their saved options appear here. Selecting an object on the canvas also highlights it in this list.'},
  {target:'#chatPanel',fallback:'#mobileBottomTabs',title:'Ask your AI Assistant',text:'Ask for design advice or discuss changes. You stay in control of which image edits to generate.'},
  {target:'#exportBtn',title:'Save your work',text:'Save image exports your current composition. Use the project menu to save an editable .moz project with your objects and options.'}
];
function visible(node){return Boolean(node&&node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden')}
function close(){
  completed=true;try{localStorage.setItem(key,'done')}catch{}
  overlay?.remove();overlay=null;window.removeEventListener('resize',position);document.removeEventListener('keydown',keyboard,true);
  previousFocus?.focus?.({preventScroll:true});
}
function target(){const step=steps[index];const first=$(step.target);return visible(first)?first:$(step.fallback||'#tools')||$('#viewport')}
function position(){
  if(!overlay)return;
  const node=target(),rect=node.getBoundingClientRect(),ring=overlay.querySelector('.moz-guide-ring'),card=overlay.querySelector('.moz-guide-card');
  const left=Math.max(6,rect.left-5),top=Math.max(6,rect.top-5),right=Math.min(innerWidth-6,rect.right+5),bottom=Math.min(innerHeight-6,rect.bottom+5);
  Object.assign(ring.style,{left:left+'px',top:top+'px',width:Math.max(1,right-left)+'px',height:Math.max(1,bottom-top)+'px'});
  const box=card.getBoundingClientRect();
  const x=Math.max(12,Math.min(left,innerWidth-box.width-12));
  const y=bottom+12+box.height<innerHeight?bottom+12:Math.max(12,top-box.height-12);
  card.style.left=x+'px';card.style.top=Math.min(y,Math.max(12,innerHeight-box.height-12))+'px';
}
function render(){
  const step=steps[index];overlay.querySelector('h2').textContent=step.title;overlay.querySelector('p').textContent=step.text;
  overlay.querySelector('.moz-guide-count').textContent=(index+1)+' of '+steps.length;
  overlay.querySelector('.guide-back').hidden=index===0;overlay.querySelector('.guide-next').textContent=index===steps.length-1?'Get started':'Next';
  const node=target();node.scrollIntoView?.({block:'nearest',inline:'nearest'});position();overlay.querySelector('.guide-next').focus({preventScroll:true});
}
function keyboard(event){
  if(!overlay)return;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close()}
  if(event.key==='Tab'){
    const buttons=[...overlay.querySelectorAll('button')].filter(visible),at=buttons.indexOf(document.activeElement);
    event.preventDefault();event.stopImmediatePropagation();buttons[(at+(event.shiftKey?-1:1)+buttons.length)%buttons.length].focus();
  }
}
function start(){
  if(overlay||completed)return;
  previousFocus=document.activeElement;overlay=document.createElement('div');overlay.className='moz-guide-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','mozGuideTitle');
  overlay.innerHTML='<div class="moz-guide-ring"></div><section class="moz-guide-card"><span class="moz-guide-count"></span><h2 id="mozGuideTitle"></h2><p></p><div class="moz-guide-actions"><button type="button" class="guide-skip">Skip</button><button type="button" class="guide-back">Back</button><button type="button" class="guide-next">Next</button></div></section>';
  overlay.querySelector('.guide-skip').onclick=close;overlay.querySelector('.guide-back').onclick=()=>{index=Math.max(0,index-1);render()};
  overlay.querySelector('.guide-next').onclick=()=>{if(index===steps.length-1)close();else{index++;render()}};
  document.body.append(overlay);document.addEventListener('keydown',keyboard,true);window.addEventListener('resize',position);render();
}
async function check(){
  await window.MosaicAccount?.ready();
  key='mozai.guide.v1:'+(window.MosaicAccount?.current()?.id||'guest');
  try{if(localStorage.getItem(key)==='done')return}catch{}
  function attempt(){
    if(completed||overlay)return;
    if(visible($('#app'))&&!$('dialog[open]')){start();return}
    setTimeout(attempt,500);
  }
  attempt();
}
void check();
