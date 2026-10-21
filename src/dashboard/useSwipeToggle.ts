import { useRef } from "react";
import type React from "react";

// Swipe support for cards with a view toggle: on touch devices a horizontal
// swipe on the card switches view (left = next tab, right = previous tab).
// Swipes that start inside horizontally-scrollable areas (e.g. the timeline
// track) are ignored so they keep scrolling normally.
export function useSwipeToggle(onPrev:()=>void,onNext:()=>void){
  const start=useRef<{x:number;y:number}|null>(null);
  const onTouchStart=(e:React.TouchEvent<HTMLElement>)=>{
    const tgt=e.target as Element;
    if(tgt.closest&&tgt.closest(".tlscroll,input,select,textarea")){start.current=null;return;}
    const t=e.touches[0];
    start.current={x:t.clientX,y:t.clientY};
  };
  const onTouchEnd=(e:React.TouchEvent<HTMLElement>)=>{
    if(!start.current)return;
    const t=e.changedTouches[0];
    const dx=t.clientX-start.current.x,dy=t.clientY-start.current.y;
    start.current=null;
    if(Math.abs(dx)>48&&Math.abs(dx)>Math.abs(dy)*1.5){ if(dx<0) onNext(); else onPrev(); }
  };
  return {onTouchStart,onTouchEnd};
}
