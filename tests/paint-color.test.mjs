import test from 'node:test';
import assert from 'node:assert/strict';
import {paintPixels} from '../paint-color.mjs';
const luminance=(data,i)=>.3*data[i]+.59*data[i+1]+.11*data[i+2];
test('paint retains ordered shadows, surface detail and highlights instead of a flat fill',()=>{
  const pixels=new Uint8ClampedArray([20,20,20,255,60,60,60,255,120,120,120,255,180,180,180,255,240,240,240,255]);
  const painted=paintPixels(pixels,'#cf3030');
  const tones=[0,4,8,12,16].map(i=>luminance(painted,i));
  for(let i=1;i<tones.length;i++)assert.ok(tones[i]>tones[i-1]+4);
  assert.ok(painted[8]>painted[9]*2,'midtones should use the red hue');
  assert.ok(Math.abs(painted[8]-207)<=2&&Math.abs(painted[9]-48)<=2,'median surface should match chosen paint');
  assert.equal(pixels[8],120,'input RGB remains immutable');
});
test('paint preserves soft alpha and leaves unselected or transparent pixels byte-identical',()=>{
  const input=new Uint8ClampedArray([30,80,110,255,100,120,90,86,180,140,90,0,40,80,120,255]);
  const mask=new Uint8ClampedArray([255,255,255,255,255,255,255,40,255,255,255,255,0,0,0,0]);
  const out=paintPixels(input,'#2e8854',mask);
  for(const i of [3,7,11,15])assert.equal(out[i],input[i]);
  assert.deepEqual(out.slice(8),input.slice(8));
  assert.notDeepEqual(out.slice(4,7),input.slice(4,7));
});
test('black and white paint still retain surface contrast',()=>{
  const input=new Uint8ClampedArray([30,30,30,255,110,110,110,255,230,230,230,255]);
  for(const color of ['#000000','#ffffff']){
    const out=paintPixels(input,color);
    assert.ok(out[0]<out[4]&&out[4]<out[8]);
    assert.equal(out[0],out[1]);assert.equal(out[4],out[5]);
  }
});
test('empty masks and invalid color inputs are handled without corrupting pixels',()=>{
  const input=new Uint8ClampedArray([1,2,3,255]);
  assert.deepEqual(paintPixels(input,'#ff0000',new Uint8ClampedArray(4)),input);
  assert.throws(()=>paintPixels(input,'red'),/valid paint color/);
  assert.throws(()=>paintPixels(input,'#ff0000',new Uint8ClampedArray(8)),/dimensions/);
});
