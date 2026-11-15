import test from 'node:test';
import assert from 'node:assert/strict';
import {matchRevealedIdentity,partitionRevealed} from '../reveal-ownership.mjs';
const bits=(...ranges)=>Uint8Array.from({length:200},(_,i)=>+ranges.some(([a,b])=>i>=a&&i<b));
test('new pixels follow the matching instance rather than another table with the same label',()=>{
  const exposed=bits([80,120]),fresh=bits([0,120]);
  const known=[{id:'left-table',mask:bits([0,80])},{id:'right-table',mask:bits([130,180])}];
  assert.equal(matchRevealedIdentity(fresh,exposed,known).id,'left-table');
  assert.equal(matchRevealedIdentity(fresh,exposed,known,'right-table'),null);
  assert.equal(matchRevealedIdentity(fresh,exposed,[known[0],{id:'duplicate',mask:bits([0,75])}]),null);
  assert.equal(matchRevealedIdentity(bits([80,120]),exposed,known),null);
});
test('overlapping boundaries and uncovered gaps remain unresolved, independent of candidate order',()=>{
  const exposed=bits([50,150]),table={groupId:'table',mask:bits([0,100])},wall={groupId:'wall',mask:bits([90,140])};
  const result=partitionRevealed(exposed,[table,wall]);
  assert.deepEqual(result.assignments[0].mask,bits([50,90]));
  assert.deepEqual(result.assignments[1].mask,bits([100,140]));
  assert.deepEqual(result.unresolved,bits([90,100],[140,150]));
  assert.deepEqual(partitionRevealed(exposed,[wall,table]).unresolved,result.unresolved);
  assert.deepEqual(partitionRevealed(exposed,[]).unresolved,exposed);
});
