import test from 'node:test';
import assert from 'node:assert/strict';
import {instanceLabelPages,applyInstanceLabels,makeInstanceContactSheet} from '../object-instance-labels.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {normalizeObjects}=require('../lib/object-instance-label-handler');

const objects=Array.from({length:53},(_,i)=>({
  id:i+1,area:53-i,box:{x:10+(i%6),y:20,w:8,h:8},colorId:2,label:'Object '+(i+1),category:'Other'
}));

test('53 physical instances are labeled in three small contact sheets, not 53 API calls',()=>{
  const pages=instanceLabelPages(objects);
  assert.deepEqual(pages.map(x=>x.length),[24,24,5]);
  assert.equal(new Set(pages.flat().map(x=>x.id)).size,53);
  assert.deepEqual(instanceLabelPages(objects.slice(0,2)).map(x=>x.length),[2]);
  assert.equal(instanceLabelPages([],24).length,0);
});

test('each instance gets an independent semantic label even with a shared color ID',()=>{
  const map={entries:objects.slice(0,3).map(x=>({...x})),labelsAvailable:false};
  const changed=applyInstanceLabels(map,[
    {id:1,label:'Left lounge chair',category:'Furniture',group:'Lounge'},
    {id:2,label:'Right lounge chair',category:'Furniture',group:'Lounge'},
    {id:99,label:'Fabric sofa',category:'Furniture',group:''},
    {id:1,label:'Duplicate label',category:'Door',group:''}
  ],[1,2,3]);
  assert.equal(changed.length,2);
  assert.equal(map.entries[0].label,'Left lounge chair');
  assert.equal(map.entries[1].label,'Right lounge chair');
  assert.equal(map.entries[2].label,'Object 3');
  assert.equal(map.labelsAvailable,true);
  assert.equal(map.entries[0].colorId,map.entries[1].colorId);
});

test('invalid and generic model labels leave previous identities untouched',()=>{
  const map={entries:[{id:7,label:'Door 1',category:'Door'}],labelsAvailable:false};
  assert.deepEqual(applyInstanceLabels(map,[{id:7,label:'Object 7',category:'Other',group:''}],[7]),[]);
  assert.equal(map.entries[0].label,'Door 1');
  assert.deepEqual(applyInstanceLabels(map,[{id:7,label:'Rear stair door',category:'Bad',group:''}],[2]),[]);
  assert.equal(map.entries[0].category,'Door');
});

test('server filters unexpected object IDs, duplicates, unsafe labels and categories',()=>{
  const rows=normalizeObjects([
    {id:1,label:'  Lounge chair  ',category:'Furniture',group:' Lounge   area '},
    {id:1,label:'Duplicate',category:'Wall',group:'x'},
    {id:12,label:'Unauthorized',category:'Furniture',group:''},
    {id:2,label:'Wall',category:'FakeCategory',group:'Entry'}
  ],[1,2]);
  assert.deepEqual(rows,[
    {id:1,label:'Lounge chair',category:'Furniture',group:'Lounge area'},
    {id:2,label:'Wall',category:'Other',group:'Entry'}
  ]);
});

test('contact sheet dims surrounding pixels but keeps the actual object visible',()=>{
  const sheets=[],captions=[],overlays=[];
  const makeCanvas=(width,height)=>{
    const canvas={width,height};
    canvas.getContext=()=>({
      fillRect(){},strokeRect(){},
      fillText(t){captions.push(t)},
      drawImage(){},
      createImageData(w,h){return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)}},
      putImageData(image){overlays.push(image)}
    });
    sheets.push(canvas);return canvas;
  };
  const labels=new Uint32Array(16);
  labels[5]=1;labels[6]=1;labels[9]=1;labels[10]=1;
  const result=makeInstanceContactSheet({
    source:{width:40,height:40},raster:{width:4,height:4},labels,
    entries:[{id:1,box:{x:1,y:1,w:2,h:2},area:4}],makeCanvas
  });
  assert.equal(result.width,1024);
  assert.equal(result.height,192);
  assert.deepEqual(captions,['OBJECT ID 1']);
  assert.equal(overlays.length,1);
  const alpha=Array.from(overlays[0].data).filter((_,i)=>i%4===3);
  assert(alpha.some(a=>a===0)&&alpha.some(a=>a>0),'Target should be transparent in dimming overlay, surroundings darkened');
});
