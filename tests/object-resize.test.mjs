import test from 'node:test';
import assert from 'node:assert/strict';
import {resizeCreatedQuad} from '../object-resize.mjs';
const quad=[{x:100,y:80},{x:180,y:80},{x:180,y:200},{x:100,y:200}];
test('resize doubles both dimensions and keeps the opposite corner fixed',()=>{
  const out=resizeCreatedQuad(quad,2,{x:180,y:200},{x:260,y:320},600,500);
  assert.deepEqual(out,[{x:100,y:80},{x:260,y:80},{x:260,y:320},{x:100,y:320}]);
  assert.deepEqual(quad[2],{x:180,y:200},'source geometry stays immutable');
});
test('resize keeps a skewed quad proportional and clamps the entire layer to the scene',()=>{
  const input=[{x:100,y:80},{x:180,y:90},{x:170,y:200},{x:90,y:190}];
  const out=resizeCreatedQuad(input,2,{x:180,y:200},{x:900,y:900},400,320);
  assert.ok(out.every(p=>p.x>=0&&p.x<=400&&p.y>=0&&p.y<=320));
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  assert.ok(Math.abs(distance(out[0],out[1])/distance(input[0],input[1])-distance(out[1],out[2])/distance(input[1],input[2]))<1e-10);
});
test('dragging across the anchor cannot flip or collapse the mask',()=>{
  const out=resizeCreatedQuad(quad,2,{x:180,y:200},{x:0,y:0},600,500);
  assert.ok(out[1].x>out[0].x&&out[2].y>out[1].y);
});
