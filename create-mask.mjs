// Remove small detached mask islands without eroding hair, fingers or real holes.
export function cleanCreateMask(alpha,width,height){
  if(width<1||height<1||alpha.length!==width*height)throw Error('Invalid Create mask dimensions.');
  const labels=new Int32Array(alpha.length),queue=new Int32Array(alpha.length),sizes=[0];
  let largest=0;
  for(let seed=0;seed<alpha.length;seed++){
    if(alpha[seed]<128||labels[seed])continue;
    const id=sizes.length;let head=0,tail=1;queue[0]=seed;labels[seed]=id;
    while(head<tail){
      const i=queue[head++],x=i%width,y=Math.floor(i/width);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=x+dx,ny=y+dy;
        if(nx<0||ny<0||nx>=width||ny>=height)continue;
        const next=ny*width+nx;
        if(alpha[next]<128||labels[next])continue;
        labels[next]=id;queue[tail++]=next;
      }
    }
    sizes.push(tail);largest=Math.max(largest,tail);
  }
  const minimum=Math.max(6,Math.ceil(largest*.0015)),result=new Uint8Array(alpha.length);
  for(let i=0;i<result.length;i++)if(labels[i]&&sizes[labels[i]]>=minimum)result[i]=255;
  return result;
}

// Limit existing opacity; never paint new RGB, fill holes, or make PNG edges opaque.
export function intersectCreateAlpha(rgba,mask,minCoverage=.08){
  if(rgba.length!==mask.length*4)throw Error('Invalid Create alpha dimensions.');
  const pixels=new Uint8ClampedArray(rgba);let before=0,after=0,selected=0,supported=0;
  for(let i=0;i<mask.length;i++){
    if(rgba[i*4+3]>=8)before++;
    if(mask[i]>=128){selected++;if(rgba[i*4+3]>=8)supported++}
    pixels[i*4+3]=Math.min(rgba[i*4+3],mask[i]);
    if(pixels[i*4+3]>=8)after++;
  }
  if(after<16||after/Math.max(1,before)<minCoverage||supported/Math.max(1,selected)<.55)
    throw Error('SAM 3 did not find a reliable foreground subject.');
  return {pixels,coverage:after/Math.max(1,before)};
}
