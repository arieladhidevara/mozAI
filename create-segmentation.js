import {alphaBounds} from './create-alpha.mjs';
import {intersectCreateAlpha} from './create-mask.mjs';

async function cleanOffThread(mask,width,height){
  const worker=new Worker(new URL('./create-mask-worker.mjs',import.meta.url),{type:'module'});
  let timer;
  try{return await new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('Create mask cleanup timed out.')),15000);
    worker.onmessage=({data})=>data.error?reject(Error(data.error)):resolve(data.mask);
    worker.onerror=()=>reject(Error('Create mask cleanup worker failed.'));
    worker.postMessage({mask,width,height});
  })}finally{clearTimeout(timer);worker.terminate()}
}

async function refineOne(image,label,{request,makeCanvas,box,multiple=false}){
  if(!label?.trim()||label.length>80)throw Error('No clear Create subject was identified.');
  const scale=Math.min(1,1024/Math.max(image.width,image.height));
  const width=Math.max(1,Math.round(image.width*scale)),height=Math.max(1,Math.round(image.height*scale));
  const preview=makeCanvas(width,height),ctx=preview.getContext('2d');
  // JPEG is used only for SAM inference, never as the saved foreground source.
  ctx.fillStyle='#dddddd';ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);
  const original=image.getContext('2d',{willReadFrequently:true}).getImageData(0,0,image.width,image.height);
  // Soft cast shadows must not enlarge the SAM guidance to the whole crop.
  const bounds=alphaBounds(original.data,image.width,image.height,96);
  if(!bounds)throw Error('Create returned no foreground subject.');
  const sx=width/image.width,sy=height/image.height;
  const answer=await request('/api/ai/sam3',{method:'POST',body:{mode:'object',image:preview.toDataURL('image/jpeg',.9),width,height,label,
    box:box?box.map((n,i)=>n/1000*(i%2?height:width)):[bounds.x*sx,bounds.y*sy,(bounds.x+bounds.width)*sx,(bounds.y+bounds.height)*sy]}});
  if(typeof answer.mask!=='string'||!/^data:image\/png;base64,/.test(answer.mask)||answer.mask.length>4000000)throw Error('Invalid SAM 3 Create mask.');
  const clean=await cleanOffThread(answer.mask,width,height);
  const frame=ctx.createImageData(width,height);
  let area=0;for(const value of clean)if(value)area++;
  if(area<16||area>clean.length*.985)throw Error('SAM 3 returned an empty or whole-image Create mask.');
  for(let i=0;i<clean.length;i++){frame.data[i*4]=frame.data[i*4+1]=frame.data[i*4+2]=255;frame.data[i*4+3]=clean[i]}
  ctx.putImageData(frame,0,0);
  // Bilinear upscaling plus a subpixel feather avoids hard low-resolution stairs.
  const smooth=makeCanvas(image.width,image.height),soft=smooth.getContext('2d',{willReadFrequently:true});
  soft.imageSmoothingEnabled=true;soft.imageSmoothingQuality='high';soft.filter='blur(0.65px)';
  soft.drawImage(preview,0,0,image.width,image.height);
  const values=soft.getImageData(0,0,image.width,image.height).data,fullAlpha=new Uint8Array(image.width*image.height);
  for(let i=0;i<fullAlpha.length;i++)fullAlpha[i]=values[i*4+3];
  const result=intersectCreateAlpha(original.data,fullAlpha,multiple?.001:.08);
  original.data.set(result.pixels);
  const output=makeCanvas(image.width,image.height);output.getContext('2d').putImageData(original,0,0);
  return {image:output,coverage:result.coverage,label};
}

export async function refineCreateCutout(image,subjects,options){
  const targets=typeof subjects==='string'?[{label:subjects}]:subjects;
  if(!Array.isArray(targets)||!targets.length||targets.length>6)throw Error('No clear requested subjects were found.');
  if(targets.length===1)return refineOne(image,targets[0].label,{...options,box:targets[0].box});
  const original=image.getContext('2d',{willReadFrequently:true}).getImageData(0,0,image.width,image.height);
  const union=new Uint8Array(image.width*image.height);
  for(let index=0;index<targets.length;index++){
    options.onProgress?.(index+1,targets.length,targets[index].label);
    const part=await refineOne(image,targets[index].label,{...options,box:targets[index].box,multiple:true});
    const pixels=part.image.getContext('2d').getImageData(0,0,image.width,image.height).data;
    for(let i=0;i<union.length;i++)union[i]=Math.max(union[i],pixels[i*4+3]);
  }
  const result=intersectCreateAlpha(original.data,union);original.data.set(result.pixels);
  const output=options.makeCanvas(image.width,image.height);output.getContext('2d').putImageData(original,0,0);
  return {image:output,coverage:result.coverage,label:targets.map(t=>t.label).join(', ')};
}
