/* One inexpensive vision request per contact sheet, not per object.
 * IDs refer to cleaned, spatially separated instances, not palette colors.
 */
import {CATEGORIES} from './object-map-utils.mjs';

export const INSTANCE_LABELS_PER_SHEET=24;
export const MAX_INSTANCE_LABEL_SHEETS=8;

export function instanceLabelPages(entries,perSheet=INSTANCE_LABELS_PER_SHEET,maxSheets=MAX_INSTANCE_LABEL_SHEETS){
  const selected=(entries||[]).filter(e=>Number.isInteger(e?.id)&&e.id>0&&e.box&&e.area>0)
    .sort((a,b)=>b.area-a.area||a.id-b.id).slice(0,Math.max(1,perSheet)*Math.max(1,maxSheets));
  const pages=[];
  for(let i=0;i<selected.length;i+=perSheet)pages.push(selected.slice(i,i+perSheet));
  return pages;
}

export function applyInstanceLabels(map,records,allowedIds){
  const allowed=new Set(allowedIds),byId=new Map(map.entries.map(entry=>[entry.id,entry])),changed=[],seen=new Set();
  for(const row of Array.isArray(records)?records:[]){
    const id=row?.id,entry=byId.get(id);
    if(!Number.isInteger(id)||!allowed.has(id)||!entry||seen.has(id))continue;
    seen.add(id);
    const label=String(row.label||'').replace(/[\r\n\t\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().slice(0,72);
    if(!label||/^(?:unnamed(?: object)?|object|region|other)\s*\d*$/i.test(label))continue;
    const category=CATEGORIES.includes(row.category)?row.category:entry.category;
    const group=String(row.group||'').replace(/[\r\n\t\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().slice(0,60);
    entry.label=label;entry.category=category;entry.suggestedGroup=group;
    changed.push(entry);
  }
  if(changed.length)map.labelsAvailable=true;
  return changed;
}

export function makeInstanceContactSheet({source,raster,entries,labels,makeCanvas}){
  const columns=4,tileW=256,tileH=192,imageW=230,imageH=145;
  const sheet=makeCanvas(columns*tileW,Math.ceil(entries.length/columns)*tileH),ctx=sheet.getContext('2d');
  const mw=raster.width,mh=raster.height,sw=source.width,sh=source.height;
  if(!mw||!mh||!sw||!sh||labels.length!==mw*mh)throw Error('Invalid instance map for labeling.');
  ctx.fillStyle='#f3f4f6';ctx.fillRect(0,0,sheet.width,sheet.height);
  for(let i=0;i<entries.length;i++){
    const entry=entries[i],col=i%columns,row=Math.floor(i/columns),left=col*tileW,top=row*tileH;
    ctx.fillStyle='#ffffff';ctx.fillRect(left+3,top+3,tileW-6,tileH-6);
    ctx.fillStyle='#16161d';ctx.font='bold 18px Arial, sans-serif';
    ctx.fillText('OBJECT ID '+entry.id,left+12,top+24);
    const bx=entry.box.x*sw/mw,by=entry.box.y*sh/mh,bw=entry.box.w*sw/mw,bh=entry.box.h*sh/mh;
    const padX=Math.max(sw*.015,bw*.24),padY=Math.max(sh*.015,bh*.24);
    const sx=Math.max(0,Math.floor(bx-padX)),sy=Math.max(0,Math.floor(by-padY));
    const right=Math.min(sw,Math.ceil(bx+bw+padX)),bottom=Math.min(sh,Math.ceil(by+bh+padY));
    const cropW=Math.max(1,right-sx),cropH=Math.max(1,bottom-sy);
    const scale=Math.min(imageW/cropW,imageH/cropH);
    const dw=Math.max(1,Math.round(cropW*scale)),dh=Math.max(1,Math.round(cropH*scale));
    const dx=left+Math.floor((tileW-dw)/2),dy=top+32+Math.floor((imageH-dh)/2);
    ctx.drawImage(source,sx,sy,cropW,cropH,dx,dy,dw,dh);
    // Keep the target recognizable in full color. Dim every other instance
    // without creating individual full-resolution RGBA cutouts in memory.
    const mask=ctx.createImageData(dw,dh);
    for(let y=0;y<dh;y++){
      const mapY=Math.min(mh-1,Math.floor((sy+(y+.5)*cropH/dh)*mh/sh));
      for(let x=0;x<dw;x++){
        const mapX=Math.min(mw-1,Math.floor((sx+(x+.5)*cropW/dw)*mw/sw));
        if(labels[mapY*mw+mapX]===entry.id)continue;
        const p=(y*dw+x)*4;mask.data[p]=17;mask.data[p+1]=19;mask.data[p+2]=29;mask.data[p+3]=174;
      }
    }
    ctx.putImageData(mask,dx,dy);
    ctx.strokeStyle='#d7d8dc';ctx.lineWidth=1;ctx.strokeRect(left+5,top+31,tileW-10,imageH+2);
  }
  return sheet;
}
