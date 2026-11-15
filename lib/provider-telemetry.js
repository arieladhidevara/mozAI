'use strict';
const store=require('./data-store');
const numeric=value=>Number.isSafeInteger(value)&&value>=0?value:null;
function details(value,depth=0){
  if(depth>3||!value||typeof value!=='object'||Array.isArray(value))return null;
  return Object.fromEntries(Object.entries(value).filter(([key,v])=>/^[a-z_]{1,60}$/.test(key)&&(numeric(v)!==null||v&&typeof v==='object')).map(([key,v])=>[key,numeric(v)??details(v,depth+1)]));
}
function tokens(usage){
  const input=numeric(usage?.input_tokens??usage?.total_input_tokens),output=numeric(usage?.output_tokens??usage?.total_output_tokens);
  return {input_tokens:input,output_tokens:output,total_tokens:numeric(usage?.total_tokens)??(input!==null&&output!==null?input+output:null),estimated_cost_usd:null};
}
async function measure(req,operation,model,work){
  if(!req?.account)return work();
  let record;const started=Date.now();
  try{record=await store.startGeneration(req.account,{projectId:req.body?.projectId,operation,model,quality:'low',preserveOriginalGeometry:true})}
  catch{console.error('[mozAI:telemetry_unavailable]',operation)}
  async function finish(values){if(record)try{await store.finishGeneration(req.account,record.id,{duration_ms:Date.now()-started,...values})}catch{console.error('[mozAI:telemetry_finish_failed]',operation)}}
  try{
    const result=await work();
    let usage=result?.usage,status='success';
    if(typeof result?.clone==='function'){
      const data=await result.clone().json().catch(()=>({}));usage=data.usage;status=result.ok?'success':'failed';
    }
    await finish({status,...tokens(usage),usage_details:details(usage),error_code:status==='failed'?'PROVIDER_HTTP_ERROR':null});return result;
  }catch(error){await finish({status:'failed',error_code:/^[A-Z0-9_]{1,80}$/.test(error.code||'')?error.code:error.name==='AbortError'?'TIMEOUT':'PROVIDER_ERROR'});throw error}
}
function observedFetch(req,operation,model,...args){return measure(req,operation,model,()=>fetch(...args))}
module.exports={measure,observedFetch,tokens,details};
