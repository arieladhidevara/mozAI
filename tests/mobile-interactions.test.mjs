import test from 'node:test';
import assert from 'node:assert/strict';
import {createMobilePinch} from '../mobile-pinch.mjs';
import {readFileSync} from 'node:fs';

function touch(type,id,x=0,y=0,target={}){
  return {pointerType:'touch',type,pointerId:id,clientX:x,clientY:y,target};
}

test('single-finger canvas selection remains available until a two-finger pinch begins',()=>{
  const calls=[],gesture=createMobilePinch({
    enabled:()=>true,onStart:v=>calls.push(['start',v]),onMove:v=>calls.push(['move',v]),onEnd:()=>calls.push(['end'])
  });
  assert.equal(gesture.handle(touch('pointerdown',1,0,0)),false);
  assert.equal(gesture.handle(touch('pointermove',1,20,0)),false);
  assert.deepEqual(calls,[]);
  assert.equal(gesture.handle(touch('pointerdown',2,120,0)),true);
  assert.equal(calls.length,1);
  assert.equal(calls[0][1].distance,100);
  assert.equal(calls[0][1].midpoint.x,70);
  assert.equal(gesture.handle(touch('pointermove',2,220,40)),true);
  assert.equal(calls[1][0],'move');
  assert.ok(calls[1][1].distance>100);
  assert.equal(gesture.handle(touch('pointerup',2,220,40)),true);
  assert.equal(calls[2][0],'end');
  assert.equal(gesture.handle(touch('pointermove',1,30,0)),true,'leftover pinch finger must not draw');
  assert.equal(gesture.handle(touch('pointerup',1,30,0)),true);
  assert.equal(gesture.handle(touch('pointerdown',3,10,10)),false,'next single touch should draw normally');
});

test('mouse, disabled canvas and form controls cannot accidentally start pinch',()=>{
  const calls=[];
  const gesture=createMobilePinch({enabled:()=>true,onStart:x=>calls.push(x),onMove(){},onEnd(){}});
  assert.equal(gesture.handle({...touch('pointerdown',1),pointerType:'mouse'}),false);
  assert.equal(gesture.handle(touch('pointerdown',1,0,0,{closest:()=>({})})),false);
  assert.equal(gesture.handle(touch('pointerdown',2,10,10)),false);
  assert.equal(calls.length,0);
  const off=createMobilePinch({enabled:()=>false,onStart:x=>calls.push(x),onMove(){},onEnd(){}});
  off.handle(touch('pointerdown',1));off.handle(touch('pointerdown',2));
  assert.equal(calls.length,0);
});

test('pinch cancellation releases gesture and resets pointer routing',()=>{
  let ends=0;
  const gesture=createMobilePinch({enabled:()=>true,onStart(){},onMove(){},onEnd(){ends++}});
  gesture.handle(touch('pointerdown',1));gesture.handle(touch('pointerdown',2,100));
  assert.equal(gesture.active,true);
  assert.equal(gesture.handle(touch('pointercancel',2)),true);
  assert.equal(ends,1);
  gesture.reset();
  assert.equal(gesture.active,false);
  assert.equal(ends,1);
});

test('mobile management selection shows overlay and empty clicks clear focused row',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const map=readFileSync(new URL('../object-map.js',import.meta.url),'utf8');
  const mobile=readFileSync(new URL('../workspace-mobile.js',import.meta.url),'utf8');
  assert.match(app,/if\(action==='focus'&&group\)\{hideQuickPrompt\(\);selectGroupMask\(group,\{showOutline:true\}\)/);
  assert.match(app,/function clearObjectSelection\(\)[\s\S]*state\.focusedGroupId=null/);
  assert.match(map,/core\.clearObjectSelection\?\.\(\)/);
  assert.match(mobile,/groupList\?\.addEventListener\('click',event=>/);
});

test('keyboard focus retains mobile composer and does not refit canvas on visual viewport resize',()=>{
  const mobile=readFileSync(new URL('../workspace-mobile.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../workspace-mobile.css',import.meta.url),'utf8');
  assert.match(mobile,/function keyboard\(\)/);
  assert.match(mobile,/viewport\?\.addEventListener\('resize',keyboard\)/);
  assert.match(mobile,/--moz-mobile-visible-bottom/);
  assert.match(mobile,/No fit\/recenter or canvas resize on keyboard-only changes/);
  assert.match(css,/html\.moz-keyboard-open #inspectorPanel>\.mobile-bottom-tabs/);
  assert.match(css,/html\.moz-keyboard-open #inspectorPanel\s*\{\s*position:fixed!important/);
  assert.match(css,/\.workspace \.canvas-viewport\{[\s\S]*touch-action:none!important/);
});
