// Recolor RGB while keeping the object's tonal detail and its original alpha.
// A monotonic luminance curve maps the median surface tone to the chosen paint;
// chroma is gamut-compressed around that luminance, never channel-clipped flat.
export function paintPixels(rgba,hex,mask=null){
  if(!/^#[0-9a-f]{6}$/i.test(hex))throw Error('Choose a valid paint color.');
  if(rgba.length%4||mask&&mask.length!==rgba.length)throw Error('Paint mask dimensions do not match.');
  const out=new Uint8ClampedArray(rgba),hist=new Float64Array(256);
  const color=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  const lum=c=>.3*c[0]+.59*c[1]+.11*c[2];
  const target=Math.max(.015,Math.min(.985,lum(color)));
  let total=0;
  for(let i=0;i<rgba.length;i+=4){
    const weight=rgba[i+3]*(mask?mask[i+3]/255:1);
    if(!weight)continue;
    hist[Math.round(.3*rgba[i]+.59*rgba[i+1]+.11*rgba[i+2])]+=weight;total+=weight;
  }
  if(!total)return out;
  let sum=0,median=128;
  for(let i=0;i<256;i++){sum+=hist[i];if(sum>=total/2){median=i;break}}
  const anchor=Math.max(1/255,Math.min(254/255,median/255));
  const gain=target*(1-anchor)/(anchor*(1-target)),chroma=color.map(v=>v-lum(color));
  for(let i=0;i<rgba.length;i+=4){
    if(!rgba[i+3]||mask&&!mask[i+3])continue;
    const original=(.3*rgba[i]+.59*rgba[i+1]+.11*rgba[i+2])/255;
    const light=original*gain/(1-original+original*gain);
    let saturation=1;
    for(const c of chroma)if(c>0)saturation=Math.min(saturation,(1-light)/c);else if(c<0)saturation=Math.min(saturation,light/-c);
    for(let c=0;c<3;c++)out[i+c]=Math.round(255*(light+chroma[c]*saturation));
  }
  return out;
}
