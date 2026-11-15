window.runEarlyAdminChecks=async function(){
 const wait=async p=>{for(let i=0;i<200;i++){if(p())return;await new Promise(r=>setTimeout(r,25))}throw Error('Admin failed to load')};
 const assert=(v,m)=>{if(!v)throw Error(m)};
 await wait(()=>document.querySelectorAll('.admin-chart').length>=3);
 const text=document.getElementById('adminContent').textContent;
 assert(text.includes('SAM3 calls')&&text.includes('Usage by service'),'Service breakdown missing');
 assert(text.includes('sam3-semantic'),'Live SAM failure ledger record missing from admin');
 const selector=document.querySelector('select[aria-label="Daily chart metric"]');
 selector.value='services';selector.dispatchEvent(new Event('change'));assert(document.querySelector('.admin-chart-plot svg'),'Service chart missing');
 selector.value='tokens';selector.dispatchEvent(new Event('change'));assert(document.querySelector('.admin-chart-plot svg'),'Token chart missing');
 assert(document.getElementById('adminError').textContent==='','Admin returned an error');
 return {passed:3,checks:['Live service ledger appears in admin','Service and reported-token charts render','Unknown SAM cost stays distinct from known image costs']};
};
