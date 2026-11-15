// A semantic label proposes an instance; visible mask agreement verifies it.
export function matchRevealedIdentity(fresh,exposed,known,hintedId=''){
  const scores=known.map(({id,mask})=>{
    let old=0,predicted=0,both=0;
    for(let i=0;i<fresh.length;i++)if(!exposed[i]){old+=!!mask[i];predicted+=!!fresh[i];both+=!!(mask[i]&&fresh[i]);}
    return {id,score:both/Math.max(1,old+predicted-both),retained:both/Math.max(1,old),both};
  }).sort((a,b)=>b.score-a.score);
  const best=scores[0],runner=scores[1];
  if(!best||best.both<20||best.retained<.65||best.score<.5||runner&&best.score-runner.score<.15||hintedId&&best.id!==hintedId)return null;
  return best;
}
export function partitionRevealed(exposed,candidates){
  const counts=new Uint8Array(exposed.length);
  for(const {mask} of candidates)for(let i=0;i<counts.length;i++)if(exposed[i]&&mask[i])counts[i]++;
  const assignments=candidates.map(candidate=>({...candidate,mask:Uint8Array.from(exposed,(v,i)=>+(v&&counts[i]===1&&candidate.mask[i]))}));
  const unresolved=Uint8Array.from(exposed,(v,i)=>+(v&&counts[i]!==1));
  return {assignments:assignments.filter(a=>a.mask.some(Boolean)),unresolved};
}
