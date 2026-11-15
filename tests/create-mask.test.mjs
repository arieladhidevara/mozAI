import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanCreateMask,intersectCreateAlpha} from '../create-mask.mjs';

test('cleanup removes detached noise but preserves thin connected detail and real holes',()=>{
  const w=80,h=60,mask=new Uint8Array(w*h);
  for(let y=10;y<45;y++)for(let x=20;x<55;x++)mask[y*w+x]=255;
  for(let x=10;x<20;x++)mask[20*w+x]=255;
  mask[25*w+30]=0;mask[26*w+30]=0;
  mask[2*w+2]=255;mask[2*w+3]=255;
  const clean=cleanCreateMask(mask,w,h);
  assert.equal(clean[2*w+2],0);assert.equal(clean[20*w+10],255);
  assert.equal(clean[25*w+30],0);assert.equal(clean[26*w+30],0);
  assert.equal(mask[2*w+2],255);
});

test('semantic mask removes supporting furniture while keeping original antialias and RGB',()=>{
  const rgba=new Uint8ClampedArray(100*4),mask=new Uint8Array(100);
  for(let i=0;i<80;i++){rgba[i*4]=74;rgba[i*4+3]=255}
  mask.fill(255,0,40);rgba[3]=90;mask[1]=120;
  const result=intersectCreateAlpha(rgba,mask);
  assert.equal(result.pixels[3],90);assert.equal(result.pixels[7],120);
  assert.equal(result.pixels[60*4+3],0);assert.equal(result.pixels[60*4],74);
  assert.equal(rgba[60*4+3],255);assert.equal(result.coverage,.5);
});

test('unusable masks fail instead of returning an empty cutout',()=>{
  const rgba=new Uint8ClampedArray(100*4).fill(255);
  assert.throws(()=>intersectCreateAlpha(rgba,new Uint8Array(100)),/reliable/);
  assert.throws(()=>cleanCreateMask(new Uint8Array(10),3,4),/dimensions/);
});

test('background-dominated masks cannot punch noisy holes into the subject',()=>{
  const rgba=new Uint8ClampedArray(200*4),mask=new Uint8Array(200).fill(255);
  for(let i=0;i<40;i++)rgba[i*4+3]=255;
  mask.fill(0,0,20);
  assert.throws(()=>intersectCreateAlpha(rgba,mask),/reliable/);
});
