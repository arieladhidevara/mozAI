const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('api/ai/object-intent.js','utf8');
test('Create resolves only the requested noun while existing object edits keep their original instructions',async()=>{
  let sent;
  const context={module:{exports:{}},require(name){if(name==='../../lib/provider-telemetry')return {observedFetch:(_req,_op,_model,...args)=>context.fetch(...args)};assert.equal(name,'../../lib/auth');return {guard:async()=>true,loadApiKey:async()=>true,send:(res,status,body)=>{res.status=status;res.body=body}}},AbortController,setTimeout,clearTimeout,
    fetch:async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({output_text:JSON.stringify({kind:'object',label:'person',confidence:.98,geometry:'change',behind:[],targets:[{label:'person',box:[100,100,800,900]}]})})}}};
  vm.runInNewContext(source,context);
  for(const createObject of [true,false]){
    const res={};await context.module.exports({body:{image:'data:image/jpeg;base64,AAAA',prompt:'orang duduk',createObject}},res);
    assert.equal(res.status,200);assert.equal(res.body.label,'person');
    const instructions=sent.input[0].content[0].text;
    if(createObject){assert.match(instructions,/person ONLY, with NO chair/);assert.match(instructions,/foreground subject\(s\) explicitly requested/);assert.match(instructions,/ANY object class/);assert.match(instructions,/SAM labels MUST omit poses/);assert.match(sent.text.format.schema.properties.targets.items.properties.label.description,/CATEGORY noun only/)}
    else assert.match(instructions,/SINGLE existing object/);
  }
});

test('Create accepts arbitrary named subjects and distinct instances, with validated spatial bounds',()=>{
  const {validateCreateIntent}=require('../api/ai/object-intent');
  const base={kind:'object',label:'requested objects',confidence:.95,geometry:'change',behind:[]};
  const targets=[{label:'vase',box:[50,100,200,800]},{label:'dog',box:[300,300,800,900]},{label:'chair',box:[500,100,950,950]}];
  assert.deepEqual(validateCreateIntent({...base,targets}).targets,targets);
  assert.throws(()=>validateCreateIntent({...base,targets:[]}),/subjects/);
  assert.throws(()=>validateCreateIntent({...base,targets:[{label:'vase',box:[800,0,200,500]}]}),/bounds/);
});
