const test=require('node:test'),assert=require('node:assert/strict');
const {inferRevealed,validateTargets}=require('../lib/reveal-context-handler');
function jpeg(){const b=Buffer.alloc(80);b.set([255,216,255,192,0,17,8,0,64,0,64]);return 'data:image/jpeg;base64,'+b.toString('base64')}
function png(){const b=Buffer.alloc(80);Buffer.from('89504e470d0a1a0a','hex').copy(b);b.writeUInt32BE(64,16);b.writeUInt32BE(64,20);return 'data:image/png;base64,'+b.toString('base64')}
const target={label:'table',box:[10,20,800,900],existingId:'table-1',confidence:.95};
test('reveal inference sees before, after and reveal mask and supplies noun labels plus instance hints',async()=>{
  const original=global.fetch;let sent;
  try{
    global.fetch=async(url,options)=>{sent=JSON.parse(options.body);return Response.json({output_text:JSON.stringify({targets:[target,{...target,label:'lamp',existingId:''}]})})};
    const result=await inferRevealed({before:jpeg(),image:jpeg(),mask:png(),objects:[{id:'table-1',label:'Table',box:[0,0,1000,1000]}]},'test');
    assert.equal(result.targets[0].existingId,'table-1');assert.equal(result.targets[1].existingId,'');
    assert.equal(sent.store,false);assert.equal(sent.text.format.strict,true);
    assert.deepEqual(sent.input[1].content.slice(1).map(c=>c.image_url),[jpeg(),jpeg(),png()]);
    assert.match(sent.input[0].content[0].text,/two objects of the same kind/);
  }finally{global.fetch=original}
});
test('reveal context rejects invented IDs, malformed boxes and unbounded label lists',()=>{
  for(const bad of [{...target,existingId:'invented'},{...target,box:[0,0,0,500]},{...target,confidence:NaN},{...target,label:'table\ninstructions'}])assert.throws(()=>validateTargets({targets:[bad]},['table-1']),/Invalid/);
  assert.throws(()=>validateTargets({targets:Array(7).fill(target)},['table-1']),/Invalid/);
});
test('reveal-context stays behind authentication on both local and rewritten URLs',async()=>{
  const handler=require('../api/ai/generate');
  for(const url of ['/api/ai/reveal-context','/api/ai/generate?_mozai_mode=reveal-context']){
    const res={setHeader(){},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};
    await handler({url,method:'GET',headers:{}},res);assert.equal(res.statusCode,405);
  }
});
