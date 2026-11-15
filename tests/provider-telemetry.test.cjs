const test=require('node:test'),assert=require('node:assert/strict');
const {tokens,measure}=require('../lib/provider-telemetry');
test('provider tokens remain exact and absent usage remains unknown',()=>{
 assert.deepEqual(tokens({input_tokens:123,output_tokens:45}),{input_tokens:123,output_tokens:45,total_tokens:168,estimated_cost_usd:null});
 assert.equal(tokens().total_tokens,null);assert.equal(tokens({total_tokens:0}).total_tokens,0);
});
test('SAM usage records one request, duration and quota failure without invented tokens or cost',async()=>{
 const store=require('../lib/data-store'),oldStart=store.startGeneration,oldFinish=store.finishGeneration,records=[];
 store.startGeneration=async(_a,v)=>{records.push(v);return {id:'test'}};store.finishGeneration=async(_a,_id,v)=>records.push(v);
 try{await assert.rejects(measure({account:{id:'a'},body:{}},'sam3','sam3-semantic',async()=>{throw Object.assign(Error('quota'),{code:'SAM3_QUOTA'})}));assert.equal(records[0].operation,'sam3');assert.equal(records[1].status,'failed');assert.equal(records[1].error_code,'SAM3_QUOTA');assert(!('total_tokens' in records[1]));}
 finally{store.startGeneration=oldStart;store.finishGeneration=oldFinish}
});
test('supporting service calls never spend image-generation demo credits',async t=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{randomUUID}=require('node:crypto');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mozai-service-credits-')),file=path.join(dir,'data.json');
 t.after(async()=>{await fs.unlink(file);await fs.rmdir(dir)});
 const store=require('../lib/data-store').createStore(file),actor={id:randomUUID(),auth:'development',environment:'development',role:'admin'};
 for(const operation of ['sam3','chat','classify']){const row=await store.startGeneration(actor,{operation,model:'service',quality:'low',preserveOriginalGeometry:true});await store.finishGeneration(actor,row.id,{status:'success'})}
 assert.equal((await store.demoCredits(actor)).used,0);
 const image=await store.startGeneration(actor,{operation:'edit',model:'image',quality:'medium',preserveOriginalGeometry:true});await store.finishGeneration(actor,image.id,{status:'success'});
 assert.equal((await store.demoCredits(actor)).used,require('../demo-credits').costs.medium);
});
