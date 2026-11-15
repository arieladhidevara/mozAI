import {cleanCreateMask} from './create-mask.mjs';
self.onmessage=async({data})=>{
  try{
    let alpha=data.alpha;
    if(data.mask){
      const bytes=Uint8Array.from(atob(data.mask.split(',')[1]),value=>value.charCodeAt(0));
      const image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
      if(image.width!==data.width||image.height!==data.height)throw Error('SAM 3 mask dimensions differ from the Create crop.');
      const canvas=new OffscreenCanvas(data.width,data.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);image.close();
      const pixels=ctx.getImageData(0,0,data.width,data.height).data;alpha=new Uint8Array(data.width*data.height);
      for(let i=0;i<alpha.length;i++)alpha[i]=pixels[i*4+3];
    }
    const mask=cleanCreateMask(alpha,data.width,data.height);
    self.postMessage({mask},[mask.buffer]);
  }catch(error){self.postMessage({error:error.message})}
};
