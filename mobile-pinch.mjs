/* Touch-only two-finger gesture routing for the editor canvas.
 * Pointer Events keep fingers tracked even when the canvas is using Select.
 * Return true for events that must not fall through to drawing or selection.
 */
export function createMobilePinch({enabled,onStart,onMove,onEnd}){
  const contacts=new Map();
  let started=false,blocking=false;
  const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  return {
    handle(event){
      if(event.pointerType!=='touch')return false;
      const {type,pointerId,clientX,clientY}=event;
      if(type==='pointerdown'){
        if(!enabled()||event.target?.closest?.('form,button,input,textarea,select,[contenteditable="true"]'))return false;
        contacts.set(pointerId,{x:clientX,y:clientY});
        if(contacts.size===2&&!started){
          started=true;blocking=true;
          const [a,b]=[...contacts.values()];
          onStart({midpoint:midpoint(a,b),distance:Math.max(1,distance(a,b))});
        }
        return blocking;
      }
      if(type==='pointermove'){
        if(!contacts.has(pointerId))return blocking;
        contacts.set(pointerId,{x:clientX,y:clientY});
        if(started&&contacts.size>=2){
          const [a,b]=[...contacts.values()];
          onMove({midpoint:midpoint(a,b),distance:Math.max(1,distance(a,b))});
        }
        return blocking;
      }
      if(type==='pointerup'||type==='pointercancel'){
        const consumed=blocking;
        contacts.delete(pointerId);
        if(started&&contacts.size<2){started=false;onEnd();}
        if(!contacts.size)blocking=false;
        return consumed;
      }
      return blocking;
    },
    reset(){
      contacts.clear();
      if(started)onEnd();
      started=false;blocking=false;
    },
    get active(){return blocking}
  };
}
