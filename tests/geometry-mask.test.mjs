import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateMaskDelta,structuralLines,fitPerspectiveLines,projectPoint,estimatePerspective,perspectivePixels,unwarpQuadPixels,warpQuadPixels} from '../geometry-mask.mjs';

test('shape grows: expanded pixels are occlusions, not revealed background',()=>{
  const a=Uint8Array.from([0,1,1,0,0]);
  const b=Uint8Array.from([1,1,1,0,0]);
  const d=calculateMaskDelta(a,b);
  assert.deepEqual([...d.added],[1,0,0,0,0]);
  assert.equal(d.addedCount,1);assert.equal(d.revealedCount,0);
  assert.equal(d.oldCount,2);assert.equal(d.newCount,3);
});
test('shape shrinks: former object pixels become background candidates',()=>{
  const d=calculateMaskDelta(Uint8Array.from([0,1,1,1]),Uint8Array.from([0,1,0,0]));
  assert.deepEqual([...d.revealed],[0,0,1,1]);
  assert.deepEqual([...d.union],[0,1,1,1]);assert.equal(d.revealedCount,2);
});
test('remove: every old visible pixel becomes a revealed background candidate',()=>{
  const d=calculateMaskDelta(Uint8Array.from([1,0,1]),new Uint8Array(3));
  assert.equal(d.revealedCount,2);assert.equal(d.newCount,0);
});
test('moving object produces both newly covered and newly revealed regions',()=>{
  const d=calculateMaskDelta(Uint8Array.from([1,1,0,0]),Uint8Array.from([0,0,1,1]));
  assert.equal(d.addedCount,2);assert.equal(d.revealedCount,2);assert.equal(d.iou,0);
});
test('rejects unmatched image dimensions',()=>{
  assert.throws(()=>calculateMaskDelta(new Uint8Array(3),new Uint8Array(2)),TypeError);
});



const rect=(width,height,x0,y0,w,h)=>{
  const mask=new Uint8Array(width*height);
  for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++)mask[y*width+x]=1;
  return mask;
};
const line=(p,q)=>{
  const length=Math.hypot(q.x-p.x,q.y-p.y),nx=(q.y-p.y)/length,ny=(p.x-q.x)/length;
  return {p,q,nx,ny,rho:nx*p.x+ny*p.y,length};
};
const box={x:20,y:20,w:200,h:160},frame={x:120,y:100,scale:200};
const corners=[{x:30,y:30},{x:210,y:30},{x:210,y:170},{x:30,y:170}];
const pairsFor=matrix=>corners.map((p,i)=>{
  const q=corners[(i+1)%4];
  return {target:line(p,q),source:line(projectPoint(matrix,p,frame),projectPoint(matrix,q,frame))};
});
test('four structural edges yield one small projective correction',()=>{
  const matrix=[1.012,.005,.008,-.003,.99,.005,.012,-.006,1],fit=fitPerspectiveLines(pairsFor(matrix),box);
  assert.equal(fit.approved,true,fit.reason);
  for(const p of [...corners,{x:120,y:100}]){
    const actual=projectPoint(fit.matrix,p,fit.frame),expected=projectPoint(matrix,p,frame);
    assert.ok(Math.hypot(actual.x-expected.x,actual.y-expected.y)<1e-5);
  }
  const a=projectPoint(fit.matrix,{x:40,y:80},fit.frame),b=projectPoint(fit.matrix,{x:100,y:80},fit.frame),c=projectPoint(fit.matrix,{x:190,y:80},fit.frame);
  assert.ok(Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))<1e-5,'a straight texture line must remain straight');
});
test('large drift, stretching and inconsistent edges never trigger an automatic warp',()=>{
  for(const matrix of [[1,0,.09,0,1,0,0,0,1],[1.18,0,0,0,1,0,0,0,1],[1,.12,0,0,1,0,0,0,1]]){
    const fit=fitPerspectiveLines(pairsFor(matrix),box);assert.equal(fit.approved,false);assert.equal(fit.reason,'perspective-correction-too-large');
  }
  const pairs=pairsFor([1,0,.01,0,1,.01,0,0,1]);
  pairs.push({target:line({x:90,y:30},{x:90,y:170}),source:line({x:86,y:30},{x:86,y:170})});
  assert.equal(fitPerspectiveLines(pairs,box).approved,false,'conflicting planes should keep original RGB');
});
test('flat walls, too few edges, parallel edges and already aligned lines stay untouched',()=>{
  assert.equal(fitPerspectiveLines(pairsFor([1,0,0,0,1,0,0,0,1]),box).reason,'structural-lines-already-aligned');
  assert.equal(fitPerspectiveLines(pairsFor([1,0,.01,0,1,0,0,0,1]).slice(0,2),box).reason,'insufficient-structural-lines');
  const parallel=[30,60,100,150].map(x=>({target:line({x,y:30},{x,y:170}),source:line({x:x+2,y:30},{x:x+2,y:170})}));
  assert.equal(fitPerspectiveLines(parallel,box).approved,false);
});
function scene({shift=0,noise=false,wavy=false,flat=false}={}){
  const width=240,height=200,mask=rect(width,height,30,30,180,140),before=new Uint8ClampedArray(width*height*4),after=before.slice();
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const inside=x>=30&&x<210&&y>=30&&y<170,offset=wavy?Math.round(Math.sin(y*.22)*9):shift;
    const changed=x>=30+offset&&x<210+offset&&y>=30+shift&&y<170+shift;
    const a=flat?180:inside?210:35,b=flat?125:changed?125+(noise?(x*13+y*7)%15:0):35;
    const i=(y*width+x)*4;before.set([a,a,a,255],i);after.set([b,b,b,255],i);
  }
  return {before,after,mask,width,height};
}
test('image edges align a slightly shifted wall despite a new material and fine texture',()=>{
  const input=scene({shift:2,noise:true}),original=input.mask.slice();
  const fit=estimatePerspective(input);assert.equal(fit.approved,true,JSON.stringify(fit));
  assert.ok(fit.matchedLines>=4);assert.ok(fit.displacement<5);
  assert.deepEqual(input.mask,original);
});
test('changing a silhouette or wall texture alone cannot pull the mask contour',()=>{
  for(const input of [scene({flat:true,noise:true}),scene({noise:true}),scene({wavy:true})]){
    const original=input.mask.slice(),fit=estimatePerspective(input);
    assert.equal(fit.approved,false,JSON.stringify(fit));assert.deepEqual(input.mask,original);
  }
});
test('mask holes and irregular boundaries are not alignment control points',()=>{
  const input=scene({noise:true});
  for(let y=70;y<130;y++)for(let x=80;x<125;x++)input.mask[y*input.width+x]=0;
  for(let y=30;y<170;y++)for(let x=205-Math.round(Math.sin(y*.4)*4);x<210;x++)input.mask[y*input.width+x]=0;
  assert.equal(estimatePerspective(input).approved,false);
});
test('projective sampling preserves outside pixels and exact old mask, with no new alpha holes',()=>{
  const input=scene({shift:2}),fit=estimatePerspective(input);assert.ok(fit.approved);
  const original=input.mask.slice(),image=input.after.slice();
  const result=perspectivePixels(input.after,input.mask,input.width,input.height,fit);
  assert.ok(result);
  for(let i=0;i<input.mask.length;i++){
    assert.equal(result[i*4+3],255);
    if(!input.mask[i])assert.deepEqual(result.slice(i*4,i*4+4),image.slice(i*4,i*4+4));
  }
  assert.deepEqual(input.mask,original);assert.deepEqual(input.after,image);
  const ix=(100*input.width+31)*4;assert.ok(result[ix]>110&&result[ix]<140,'wall edge returns to the original position');
});
test('correction requiring pixels outside the image is declined instead of stretching an edge',()=>{
  const input=scene(),mask=new Uint8Array(input.width*input.height).fill(1);
  const fit=fitPerspectiveLines(pairsFor([1,0,.01,0,1,0,0,0,1]),box);assert.ok(fit.approved);
  assert.equal(perspectivePixels(input.after,mask,input.width,input.height,fit),null);
});

test('invalid projection coordinates cannot silently turn RGB into opaque black',()=>{
  const input=scene();
  for(const value of [NaN,Infinity,-Infinity]){
    const fit={matrix:[1,0,value,0,1,0,0,0,1],frame:{x:0,y:0,scale:1}};
    assert.equal(perspectivePixels(input.after,input.mask,input.width,input.height,fit),null);
  }
  const singular={matrix:[1,0,0,0,1,0,0,0,1],frame:{x:0,y:0,scale:0}};
  assert.equal(perspectivePixels(input.after,input.mask,input.width,input.height,singular),null);
});

test('bilinear quad identity preserves every pixel and alpha hole',()=>{
  const w=20,h=16,data=new Uint8ClampedArray(w*h*4),quad=[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}],box={x:0,y:0,w,h};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x<8||x>11||y<6||y>9)data.set([100+x,80+y,40,255],(y*w+x)*4);
  assert.deepEqual(unwarpQuadPixels(data,w,h,quad,box),data);
  assert.deepEqual(warpQuadPixels(data,w,h,box,quad,box),data);
});
test('transparent black texels do not darken the interpolated object color',()=>{
  const data=new Uint8ClampedArray([200,100,50,255,0,0,0,0]);
  const quad=[{x:0,y:0},{x:2,y:0},{x:2,y:1},{x:0,y:1}];
  assert.deepEqual([...unwarpQuadPixels(data,2,1,quad,{x:0,y:0,w:1,h:1})],[200,100,50,128]);
});
test('skewed quad sampling preserves constant semitransparent color without seams',()=>{
  const w=32,h=24,data=new Uint8ClampedArray(w*h*4);for(let i=0;i<data.length;i+=4)data.set([200,120,60,102],i);
  const quad=[{x:4,y:3},{x:28,y:2},{x:29,y:22},{x:3,y:21}],box={x:0,y:0,w:16,h:12};
  const restored=unwarpQuadPixels(data,w,h,quad,box);
  for(let i=0;i<restored.length;i+=4)assert.deepEqual([...restored.slice(i,i+4)],[200,120,60,102]);
  const output=warpQuadPixels(data,w,h,{x:4,y:4,w:24,h:16},quad,{x:0,y:0,w,h});
  assert.deepEqual([...output.slice((12*w+16)*4,(12*w+16)*4+4)],[200,120,60,102]);
});
test('invalid quad data is rejected without allocating an opaque black result',()=>{
  const quad=[{x:0,y:0},{x:8,y:0},{x:8,y:8},{x:0,y:8}],box={x:0,y:0,w:8,h:8};
  assert.throws(()=>unwarpQuadPixels(new Uint8Array(4),8,8,quad,box),/Invalid quad/);
  assert.throws(()=>warpQuadPixels(new Uint8Array(256),8,8,box,quad.map(p=>({x:p.x,y:NaN})),box),/Invalid quad/);
});
