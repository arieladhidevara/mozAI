import test from 'node:test';
import assert from 'node:assert/strict';
import {binary,signature,combine,overlap,gapWidth,validRepair,sceneOrder,matchFlatContext,isCreatedGroup,orderedSceneGroups,nextCreatedOrder,bringGroupToFront,isForegroundGroup,createdOccluderCandidates} from '../object-mask-utils.mjs';
test('alpha threshold, exact signatures and two-way matching distinguish nested objects',()=>{
  assert.deepEqual([...binary(Uint8Array.from([0,0,0,127,255,255,255,128]))],[0,1]);
  assert.notEqual(signature(Uint8Array.of(1,0,1)),signature(Uint8Array.of(1,1,0)));
  const big=Uint8Array.of(1,1,1,1),small=Uint8Array.of(0,1,0,0);
  assert.equal(overlap(big,small).twoWay,.25);
  assert.deepEqual([...combine(big,small,'subtract')],[1,0,1,1]);
});
test('gap width measures thickness rather than the length of a thin hole',()=>{
  const mask=new Uint8Array(100*100);for(let y=10;y<90;y++)for(let x=45;x<55;x++)mask[y*100+x]=1;
  assert.equal(gapWidth(mask,100,100),10);
});
test('repair validation rejects transparent output and severe boundary seams',()=>{
  const before=new Uint8ClampedArray(5*5*4).fill(255),mask=new Uint8Array(25);mask[12]=1;
  const bad=before.slice();bad.fill(0,48,52);assert.equal(validRepair(before,bad,mask,5,5),false);
  bad[51]=255;assert.equal(validRepair(before,bad,mask,5,5),false);
  assert.equal(validRepair(before,before,mask,5,5),true);
});
test('physical foreground survives later background edits; cycles terminate stably',()=>{
  const table={id:'table'},rug={id:'rug',objectBehind:['table']},wall={id:'wall',objectBehind:['rug','table']};
  assert.deepEqual(sceneOrder([table,rug,wall]).map(x=>x.id),['wall','rug','table']);
  table.objectBehind=['wall'];assert.equal(sceneOrder([table,rug,wall]).length,3);
});
test('flat texture calibration removes neural hue and contrast drift only inside holes',()=>{
  const rgba=new Uint8ClampedArray(8*8*4),holes=new Uint8Array(64);for(let i=0;i<64;i++)rgba.set([20,160,70,255],i*4);
  const output=rgba.slice();for(const i of [27,28,35,36]){holes[i]=1;output.set([i*5,10+i*3,200,255],i*4)}
  matchFlatContext(rgba,output,holes,8,8);for(let i=0;i<64;i++)for(let c=0;c<3;c++)assert.ok(Math.abs(output[i*4+c]-rgba[i*4+c])<4);
});

test('created object rank changes only the created plane, retaining original scene order and relations',()=>{
  const wall={id:'wall',objectBehind:['desk','red']},desk={id:'desk'};
  const red={id:'red',createdLocally:true,objectBehind:[]},blue={id:'blue',createdViaAI:true,objectBehind:['red']};
  const groups=[red,desk,blue,wall],original=structuredClone(groups);
  assert.deepEqual(orderedSceneGroups(groups).map(g=>g.id),['wall','desk','red','blue']);
  assert.equal(bringGroupToFront(groups,red),true);
  assert.deepEqual(orderedSceneGroups(groups).map(g=>g.id),['wall','desk','blue','red']);
  assert.deepEqual(groups.map(g=>g.id),original.map(g=>g.id));
  assert.deepEqual(wall,original[3]);assert.deepEqual(desk,original[1]);assert.deepEqual(blue,original[2]);
  assert.equal(bringGroupToFront(groups,{id:'wall'}),false,'cannot lift an object outside this project');
  assert.equal(bringGroupToFront(groups,red),false,'already at front is a no-op');
});

test('new, cut, archived and legacy Create layers retain a stable independent order',()=>{
  const old={id:'old',createdLocally:true,createdStackOrder:10};
  const cutA={id:'cut-a',createdLocally:true,createdStackOrder:10};
  const cutB={id:'cut-b',createdLocally:true,createdStackOrder:10};
  const legacy={id:'legacy',createdViaAI:true},archived={...old,id:'parent',cutArchived:true};
  const groups=[legacy,archived,old,cutA,cutB];
  assert.equal(isCreatedGroup({createdLocally:false}),false);
  assert.deepEqual(orderedSceneGroups(groups).map(g=>g.id),['legacy','old','cut-a','cut-b']);
  const next={id:'new',createdLocally:true,createdStackOrder:nextCreatedOrder(groups)};groups.push(next);
  assert.equal(orderedSceneGroups(groups).at(-1),next);
  assert.equal(bringGroupToFront(groups,archived),false);
  assert.equal(bringGroupToFront(groups,{id:'unknown',createdLocally:true}),false);
});

test('bringing one original forward raises only that identity, leaving collection siblings and scene relations intact',()=>{
  const chair={id:'chair',collectionId:'furniture',objectBehind:['desk']};
  const desk={id:'desk',collectionId:'furniture'},created={id:'created',createdLocally:true};
  const groups=[desk,created,chair],deskBefore=structuredClone(desk),createdBefore=structuredClone(created);
  assert.equal(bringGroupToFront(groups,chair),true);
  assert.equal(isCreatedGroup(chair),false,'lifting does not turn an original into a Create object');
  assert.equal(isForegroundGroup(chair),true);
  assert.deepEqual(orderedSceneGroups(groups).map(g=>g.id),['desk','created','chair']);
  assert.deepEqual(desk,deskBefore);assert.deepEqual(created,createdBefore);
  assert.deepEqual(chair.objectBehind,['desk']);
  assert.equal(bringGroupToFront(groups,chair),false,'already in front is a no-op');
  assert.equal(bringGroupToFront(groups,created),true);
  assert.deepEqual(orderedSceneGroups(groups).map(g=>g.id),['desk','chair','created']);
});

test('promoting an original preserves the relative order of all other scene objects',()=>{
  const a={id:'a',objectBehind:['b']},b={id:'b',objectBehind:['c']},c={id:'c'},d={id:'d'};
  const groups=[c,d,b,a,{id:'created',createdViaAI:true}];
  const fixedBefore=orderedSceneGroups(groups).filter(g=>!isCreatedGroup(g)&&g!==b);
  assert.equal(bringGroupToFront(groups,b),true);
  assert.deepEqual(orderedSceneGroups(groups).filter(g=>!isForegroundGroup(g)),fixedBefore);
  const newest={id:'newest',createdLocally:true,createdStackOrder:nextCreatedOrder(groups)};
  groups.push(newest);assert.equal(orderedSceneGroups(groups).at(-1),newest);
});

test('material snapshot candidates are only unselected Create layers above each specific target',()=>{
  const base={id:'base'},behind={id:'behind',createdLocally:true};
  const target={id:'target',createdViaAI:true},above={id:'above',createdLocally:true};
  const regular={id:'regular',frontStackOrder:100};
  const groups=[base,behind,target,above,regular];
  const candidates=createdOccluderCandidates(groups,['base','target','regular']);
  assert.deepEqual(candidates.map(item=>[item.group.id,item.targetIndices]),[['behind',[0]],['above',[0,1]]]);
  assert.deepEqual(createdOccluderCandidates(groups,['target']).map(item=>item.group.id),['above']);
  assert.deepEqual(createdOccluderCandidates(groups,['regular']),[],'Create layers below a raised original are not occluders');
});

test('material snapshot candidates exclude hidden and selected identities, with a safe original-plane fallback',()=>{
  const groups=[{id:'selected',createdLocally:true},{id:'removed',createdLocally:true,objectRemoved:true},
    {id:'cut-parent',createdLocally:true,cutArchived:true},{id:'merged',createdLocally:true,mergedInto:'selected'},
    {id:'visible',createdLocally:true}];
  assert.deepEqual(createdOccluderCandidates(groups,['selected']).map(item=>item.group.id),['visible']);
  assert.deepEqual(createdOccluderCandidates(groups,[null]).map(item=>item.group.id),['selected','visible']);
  assert.deepEqual(createdOccluderCandidates(groups,[]),[]);
});
