// Uniformly resize the displayed quad around the opposite box corner. The same
// quad maps source RGB and mask, including an already skewed Create cutout.
export function resizeCreatedQuad(quad,index,start,pointer,width,height){
  const xs=quad.map(p=>p.x),ys=quad.map(p=>p.y),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  const box=[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}];
  const anchor=box[(index+2)%4],handle=box[index],vx=handle.x-anchor.x,vy=handle.y-anchor.y;
  const tx=handle.x+pointer.x-start.x-anchor.x,ty=handle.y+pointer.y-start.y-anchor.y;
  let maximum=32;
  for(const point of quad){
    const dx=point.x-anchor.x,dy=point.y-anchor.y;
    if(dx>0)maximum=Math.min(maximum,(width-anchor.x)/dx);else if(dx<0)maximum=Math.min(maximum,-anchor.x/dx);
    if(dy>0)maximum=Math.min(maximum,(height-anchor.y)/dy);else if(dy<0)maximum=Math.min(maximum,-anchor.y/dy);
  }
  const scale=Math.max(.01,Math.min(maximum,(tx*vx+ty*vy)/Math.max(1,vx*vx+vy*vy)));
  return quad.map(point=>({x:anchor.x+(point.x-anchor.x)*scale,y:anchor.y+(point.y-anchor.y)*scale}));
}
