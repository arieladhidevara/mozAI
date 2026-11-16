import test from 'node:test';
import assert from 'node:assert/strict';
import {alphaBounds,planCreateAlphaCrop,planCreatePlacement} from '../create-alpha.mjs';

test('Create PNG alpha is the only source of the object boundary',()=>{
  const w=32,h=24,pixels=new Uint8ClampedArray(w*h*4);
  pixels[(6*w+7)*4+3]=255;
  pixels[(7*w+8)*4+3]=150;
  pixels[(9*w+12)*4+3]=7; // very soft shadow is not solid geometry
  assert.deepEqual(alphaBounds(pixels,w,h,8),{x:7,y:6,width:2,height:2});
  assert.deepEqual(alphaBounds(pixels,w,h,1),{x:7,y:6,width:6,height:4});
  const before=pixels.slice();
  const plan=planCreateAlphaCrop(pixels,w,h,{x:100,y:200,w,h});
  assert.deepEqual(plan.bbox,{x:107,y:206,w:2,h:2});
  assert.deepEqual(pixels,before,'crop planning must not mutate the generated PNG');
});

test('Create mask and RGBA source stay cropped with correct world coordinates',()=>{
  const w=100,h=80,pixels=new Uint8ClampedArray(w*h*4);
  for(let y=26;y<51;y++)for(let x=30;x<43;x++)pixels[(y*w+x)*4+3]=255;
  pixels[(52*w+36)*4+3]=35; // soft contact shadow remains in crop
  const region={x:520,y:310,w,h};
  const plan=planCreateAlphaCrop(pixels,w,h,region);
  assert.deepEqual(plan.localBox,{x:30,y:26,width:13,height:27});
  assert.deepEqual(plan.bbox,{x:550,y:336,w:13,h:27});
  assert.deepEqual(plan.sourceRect,{x:6,y:2,w:61,h:75});
  assert.deepEqual(plan.sourceCrop,{x:526,y:312,width:61,height:75});
  assert.ok(plan.sourceRect.w<region.w&&plan.sourceRect.h<region.h);
  assert.equal(pixels[(52*w+36)*4+3],35,'source alpha must not be changed by planning');
});
test('Create crop clamps source margins and refuses mismatched canvas dimensions',()=>{
  const w=40,h=30,pixels=new Uint8ClampedArray(w*h*4);
  pixels[(0*w+0)*4+3]=255;pixels[(29*w+39)*4+3]=255;
  const plan=planCreateAlphaCrop(pixels,w,h,{x:22,y:40,w,h});
  assert.deepEqual(plan.sourceRect,{x:0,y:0,w:40,h:30});
  assert.deepEqual(plan.sourceCrop,{x:22,y:40,width:40,height:30});
  assert.equal(planCreateAlphaCrop(new Uint8ClampedArray(w*h*4),w,h,{x:0,y:0,w,h}),null);
  assert.throws(()=>planCreateAlphaCrop(pixels,w,h,{x:0,y:0,w:41,h}),/dimensions/);
});

test('oversized Create fits its original box uniformly without cropping',()=>{
  const alpha={x:20,y:10,width:300,height:180},region={x:40,y:50},target={x:180,y:140,w:120,h:150};
  const plan=planCreatePlacement(alpha,region,target),d=plan.destination;
  assert.equal(plan.scale,.4);assert.equal(d.w,120);assert.equal(d.h,72);
  assert.equal(d.w/d.h,alpha.width/alpha.height);assert.deepEqual(plan.source,alpha);
  assert(d.x>=target.x&&d.y>=target.y&&d.x+Math.ceil(d.w)<=target.x+target.w&&d.y+Math.ceil(d.h)<=target.y+target.h);
});
test('small Create stays at its existing size and location; misplaced output shifts into the box',()=>{
  const target={x:100,y:100,w:200,h:160},region={x:80,y:80};
  const within=planCreatePlacement({x:40,y:40,width:50,height:60},region,target);
  assert.equal(within.scale,1);assert.equal(within.changed,false);
  const outside=planCreatePlacement({x:0,y:0,width:50,height:60},region,target);
  assert.equal(outside.scale,1);assert.deepEqual(outside.destination,{x:100,y:100,w:50,h:60});
});
test('tall and wide silhouettes at every scene edge retain proportions and fit',()=>{
  for(const target of [{x:0,y:0,w:50,h:30},{x:750,y:570,w:50,h:30}])for(const size of [[400,40],[40,400],[300,300]]){
    const plan=planCreatePlacement({x:0,y:0,width:size[0],height:size[1]},{x:0,y:0},target),d=plan.destination;
    assert(plan.scale<=1);assert(Math.abs(d.w/d.h-size[0]/size[1])<1e-10);
    assert(d.x>=target.x&&d.y>=target.y&&d.x+Math.ceil(d.w)<=target.x+target.w&&d.y+Math.ceil(d.h)<=target.y+target.h);
  }
});
