import React, { useRef, useState } from "react";
import { concertsOf, type Entry } from "../../shared/model/concert.ts";
import { etichetta } from "../../shared/labels.ts";
import { baricentro } from "../../shared/lib/derive.ts";
import { sortKey } from "../../shared/lib/dates.ts";
import { useData } from "../filters/FilterContext.tsx";
import { useDataset, useForma, usePlanned } from "../profile/ProfileContext.tsx";
import { Icon } from "../ui/Icon.tsx";
import { useTitoloSezione } from "./sezioni.tsx";

/* ============================================================
   MAP CONFIG — the Mapbox public token (starts with "pk.") comes from
   VITE_MAPBOX_TOKEN, inlined at build time; it is restricted by URL in the
   Mapbox account. Mapbox GL JS is loaded lazily from the CDN inside an
   effect, so the server only ever renders the same-size placeholder.
   ============================================================ */
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

/** Un elemento con classe e testo (mai HTML): i mattoni del popup della mappa. */
function el(tag:string,className:string,text?:string){
  const n=document.createElement(tag);
  n.className=className;
  if(text!==undefined) n.textContent=text;
  return n;
}

// framing used both for the initial map view and for the "Adatta" button
const MAP_FIT_OPTS={padding:60,maxZoom:11};
// last-resort view when the profile has no venue at all: northern Italy
const MAP_CENTER_VUOTA:[number,number]=[9.6,45.0];

/** Il titolo della card ("Dove sono andato", secondo la forma del profilo, o quello scelto nel layout). */
function useTitoloMappa(){
  return useTitoloSezione(etichetta("secMappa",useForma()));
}

export function MapCard(){
  const DATA=useData();
  const isPlanned=usePlanned();
  const {venueCoords:VENUE_COORDS,cityCoords:CITY_COORDS}=useDataset();
  const ref=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<any>(null);
  const popRef=useRef<any>(null);
  const [mode]=useState("venue"); // venue only
  const hasToken = MAPBOX_TOKEN && MAPBOX_TOKEN.indexOf("pk.")===0;
  const titolo=useTitoloMappa();

  // Build GeoJSON for the current mode
  const buildGeo=React.useCallback((m:string)=>{
    const coords = m==="venue"?VENUE_COORDS:CITY_COORDS;
    const keyOf = (d:Entry)=> m==="venue"?d.venue:d.city;
    const counts:Record<string,number>={};
    DATA.forEach(d=>{const k=keyOf(d);counts[k]=(counts[k]||0)+1;});
    const features=Object.keys(counts).map(k=>{
      const c=coords[k];
      if(!c) return null;
      const sample=DATA.find(d=>keyOf(d)===k);
      const group=DATA.filter(d=>keyOf(d)===k);
      const planned=group.filter(isPlanned).length;
      const attended=group.length-planned;
      // primary = dominant type, secondary = the other (only meaningful when mixed)
      const mixed = planned>0 && attended>0;
      const total = group.length;
      // Fixed roles: attended (amber) is always the inner disc, planned (teal)
      // is always the outer ring. When a venue has no attended shows the whole
      // marker is teal; with no planned shows it's the usual amber disc.
      const onlyPlanned = planned>0 && attended===0;
      // equal-RADIUS split: inner amber radius = attended share of the total
      const attendedShare = total ? attended/total : 1;
      const innerFactor = mixed ? Math.min(attendedShare, 0.78) : 1;
      // the marker count is per-event (a festival is one venue visit), but the
      // popup lists the concerts, so a festival contributes each of its acts
      const items=group
        .sort((a,b)=>sortKey(b)-sortKey(a))
        .flatMap(concertsOf)
        .map(c=>({artist:c.artist,year:c.y,planned:isPlanned(c)}));
      return {type:"Feature",geometry:{type:"Point",coordinates:c},
        properties:{name:k, city:m==="venue"?sample!.city:k, count:counts[k],
          attended, planned, mixed, onlyPlanned, attendedShare, innerFactor,
          items:JSON.stringify(items)}};
    }).filter(Boolean);
    return {type:"FeatureCollection",features};
  },[DATA,isPlanned,VENUE_COORDS,CITY_COORDS]);

  // Bounds around every plotted marker — shared by "Adatta" and the initial
  // view, so the map opens on exactly what that button restores.
  const dataBounds=React.useCallback((m:string)=>{
    if(!window.mapboxgl) return null;
    const geo=buildGeo(m);
    if(!geo.features.length) return null;
    const b=new mapboxgl.LngLatBounds();
    geo.features.forEach((f:any)=>b.extend(f.geometry.coordinates));
    return b;
  },[buildGeo]);

  const fitToData=React.useCallback(()=>{
    const map=mapRef.current; if(!map) return;
    const b=dataBounds(mode);
    if(b) map.fitBounds(b,{...MAP_FIT_OPTS,duration:700});
  },[dataBounds,mode]);

  // Custom paint tinting applied to a vector basemap (see map.on('load'))

  // false on the server and in the first client render alike (no hydration
  // mismatch); the effect below flips it once the library is there
  const [mapboxReady,setMapboxReady]=useState(false);
  const [loadError,setLoadError]=useState(false);

  // Ensure the Mapbox GL library is present; load it lazily if the CDN <script> didn't take.
  React.useEffect(()=>{
    if(!hasToken) return;
    if(window.mapboxgl){ setMapboxReady(true); return; }
    const VER="3.9.3";
    if(!document.querySelector('link[data-mapbox-css]')){
      const l=document.createElement("link");
      l.rel="stylesheet"; l.href=`https://api.mapbox.com/mapbox-gl-js/v${VER}/mapbox-gl.css`;
      l.setAttribute("data-mapbox-css","1"); document.head.appendChild(l);
    }
    let s=document.querySelector('script[data-mapbox-js]') as HTMLScriptElement|null;
    const onLoad=()=>{ if(window.mapboxgl) setMapboxReady(true); else setLoadError(true); };
    if(s){ s.addEventListener("load",onLoad); s.addEventListener("error",()=>setLoadError(true)); }
    else{
      s=document.createElement("script");
      s.src=`https://api.mapbox.com/mapbox-gl-js/v${VER}/mapbox-gl.js`;
      s.async=true; s.setAttribute("data-mapbox-js","1");
      s.addEventListener("load",onLoad);
      s.addEventListener("error",()=>setLoadError(true));
      document.head.appendChild(s);
    }
    return ()=>{ if(s){ s.removeEventListener("load",onLoad); } };
  },[hasToken]);

  React.useEffect(()=>{
    if(!hasToken || !mapboxReady || !ref.current) return;
    if(!window.mapboxgl){ setLoadError(true); return; }
    mapboxgl.accessToken=MAPBOX_TOKEN;
    // Open already framed on every venue (same view as "Adatta"); when the
    // filters leave nothing to frame, it centres on the profile's venues
    // (their barycentre, PIANO §1.33), and on northern Italy with none at all.
    const initBounds=dataBounds(mode);
    const center=baricentro(VENUE_COORDS)??MAP_CENTER_VUOTA;
    const map=new mapboxgl.Map({
      container:ref.current,
      style:"mapbox://styles/mapbox/dark-v11",
      ...(initBounds?{bounds:initBounds,fitBoundsOptions:MAP_FIT_OPTS}:{center,zoom:5.4}),
      attributionControl:true,
      // Don't hijack page scrolling: zoom needs Ctrl/Cmd+scroll on desktop and
      // two fingers on touch; a plain swipe/scroll over the map scrolls the page.
      cooperativeGestures:true,
      locale:{
        "ScrollZoomBlocker.CtrlMessage":"Usa Ctrl + scroll per zoomare la mappa",
        "ScrollZoomBlocker.CmdMessage":"Usa ⌘ + scroll per zoomare la mappa",
        "TouchPanBlocker.Message":"Usa due dita per muovere la mappa",
      },
    });
    mapRef.current=map;
    map.addControl(new mapboxgl.NavigationControl({showCompass:false}),"top-right");

    const css=getComputedStyle(document.documentElement);
    const bg=css.getPropertyValue("--bg").trim()||"#0a0a0b";
    const bg2=css.getPropertyValue("--bg-2").trim()||"#0d0d0f";
    const panel=css.getPropertyValue("--panel").trim()||"#101013";
    const amber=css.getPropertyValue("--lamp").trim()||"#d9a441";
    const teal=css.getPropertyValue("--planned").trim()||"#4bb3c4";
    const line=css.getPropertyValue("--line-2").trim()||"#2b2b32";
    const text=css.getPropertyValue("--text").trim()||"#e9e7e3";
    const muted=css.getPropertyValue("--muted").trim()||"#85838c";

    map.on("load",()=>{
      // Re-tint the dark basemap toward the stage palette
      const setIf=(id:string,prop:string,val:any)=>{ if(map.getLayer(id)){ try{map.setPaintProperty(id,prop,val);}catch(e){} } };
      const layers=map.getStyle().layers||[];
      layers.forEach((l:any)=>{
        if(l.type==="background") setIf(l.id,"background-color",bg);
        if(l.id.includes("water")) setIf(l.id,"fill-color",bg2);
        if(l.id.includes("land")&&l.type==="fill") setIf(l.id,"fill-color",bg);
        if(l.type==="fill"&&(l.id.includes("landuse")||l.id.includes("park"))) { setIf(l.id,"fill-color",panel); setIf(l.id,"fill-opacity",.5); }
        if(l.type==="line"&&l.id.includes("road")) { setIf(l.id,"line-color",line); setIf(l.id,"line-opacity",.5); }
        if(l.type==="symbol") { setIf(l.id,"text-color",muted); setIf(l.id,"text-halo-color",bg); setIf(l.id,"text-halo-width",1.2); }
      });

      map.addSource("concerts",{type:"geojson",data:buildGeo("venue"),
        cluster:true, clusterRadius:38, clusterMaxZoom:14,
        clusterProperties:{
          attendedSum:["+",["get","attended"]],
          plannedSum:["+",["get","planned"]],
        }});

      // ---- Clustered points: same attended/planned split as single venues,
      // aggregated over all events in the cluster. Outer disc is teal when the
      // cluster contains any planned show; an inner amber disc carves out the
      // attended share by radius, leaving a teal "in programma" outer ring. ----
      const clMixed=["all",[">",["get","attendedSum"],0],[">",["get","plannedSum"],0]];
      const clOnlyPlanned=["all",["==",["get","attendedSum"],0],[">",["get","plannedSum"],0]];
      const clBaseR=["interpolate",["linear"],["get","point_count"],2,11,5,16,10,22];
      // inner amber radius = baseR · (attendedSum / point_count), but capped so a
      // teal "in programma" ring is always visible when the cluster is mixed.
      const clShare=["/",["get","attendedSum"],["max",["get","point_count"],1]];
      const clInnerR=["*",clBaseR,["min",clShare,0.78]];
      map.addLayer({
        id:"cl-glow",type:"circle",source:"concerts",
        filter:["has","point_count"],
        paint:{
          "circle-radius":["interpolate",["linear"],["get","point_count"],2,16,5,24,10,34],
          "circle-color":["case",clOnlyPlanned,teal,["case",clMixed,teal,amber]],
          "circle-opacity":.1,"circle-blur":1,
        }
      });
      map.addLayer({
        id:"clusters",type:"circle",source:"concerts",
        filter:["has","point_count"],
        paint:{
          "circle-radius":clBaseR,
          "circle-color":["case",["any",clMixed,clOnlyPlanned],teal,amber],
          "circle-opacity":.78,
          "circle-stroke-color":bg,
          "circle-stroke-width":["case",clMixed,0,1.5],
        }
      });
      map.addLayer({
        id:"cluster-inner",type:"circle",source:"concerts",
        filter:clMixed,
        paint:{
          "circle-radius":clInnerR,
          "circle-color":amber,"circle-opacity":.78,
        }
      });
      map.addLayer({
        id:"cluster-count",type:"symbol",source:"concerts",
        filter:["has","point_count"],
        layout:{
          "text-field":["to-string",["+",["get","attendedSum"],["get","plannedSum"]]],
          "text-size":["interpolate",["linear"],["get","point_count"],2,10,10,13],
          "text-font":["DIN Pro Bold","Arial Unicode MS Bold"],
          "text-allow-overlap":true,
        },
        paint:{"text-color":bg,"text-halo-color":["case",["any",clMixed,clOnlyPlanned],teal,amber],"text-halo-width":.3}
      });

      map.addLayer({
        id:"c-glow",type:"circle",source:"concerts",
        filter:["!",["has","point_count"]],
        paint:{
          "circle-radius":["interpolate",["linear"],["get","count"],1,14,2,16,4,21,8,30],
          "circle-color":["case",["get","onlyPlanned"],teal,
            ["case",["get","mixed"],teal,amber]],
          "circle-opacity":.1,
          "circle-blur":1,
        }
      });
      // Shared base radius for a marker (the full/outer disc)
      const baseR=["interpolate",["linear"],["get","count"],1,8,2,10,4,13,8,19];
      // Outer disc = planned (teal) whenever the venue has any upcoming show,
      // otherwise the usual attended (amber) disc. The inner amber disc on top
      // carves out the attended share by radius, leaving a teal outer ring.
      map.addLayer({
        id:"c-circles",type:"circle",source:"concerts",
        filter:["!",["has","point_count"]],
        paint:{
          "circle-radius":baseR,
          "circle-color":["case",["any",["get","mixed"],["get","onlyPlanned"]],teal,amber],
          "circle-opacity":.7,
          // thin bg separator only on pure markers; mixed ones get their edge
          // from the inner disc sitting inside the outer one
          "circle-stroke-color":bg,
          "circle-stroke-width":["case",["get","mixed"],0,1.5],
        }
      });
      // Inner disc (mixed only): always amber (attended), radius = baseR·attendedShare
      // (equal-radius split) so the teal outer ring width tracks the planned share.
      map.addLayer({
        id:"c-inner",type:"circle",source:"concerts",
        filter:["all",["!",["has","point_count"]],["get","mixed"]],
        paint:{
          "circle-radius":["*",baseR,["get","innerFactor"]],
          "circle-color":amber,
          "circle-opacity":.78,
        }
      });
      map.addLayer({
        id:"c-labels",type:"symbol",source:"concerts",
        filter:["!",["has","point_count"]],
        layout:{
          "text-field":["get","count"],
          "text-size":["interpolate",["linear"],["get","count"],1,10,8,12],
          "text-font":["DIN Pro Bold","Arial Unicode MS Bold"],
          "text-allow-overlap":true,
        },
        paint:{"text-color":bg,"text-halo-color":["case",["any",["get","mixed"],["get","onlyPlanned"]],teal,amber],"text-halo-width":.3}
      });

      // Popups
      const pop=new mapboxgl.Popup({offset:14,className:"mappop",closeButton:true});
      popRef.current=pop;
      map.on("click","c-circles",(e:any)=>{
        const f=e.features[0],p=f.properties;
        const isVenue = mode==="venue";
        let items:any[]=[];
        try{ items=JSON.parse(p.items||"[]"); }catch(_){}
        // nodi DOM con textContent, mai setHTML: nomi di venue e artisti sono
        // dati degli utenti e non devono poter iniettare markup (PIANO §4.7)
        const root=document.createElement("div");
        root.append(
          el("div","pv-name",String(p.name??"")),
          el("div","pv-meta",isVenue?String(p.city??""):"Città"),
        );
        const list=el("div","pv-list");
        for(const it of items){
          const row=el("div","pv-item");
          row.append(el("span","pv-art",String(it.artist??"")),el("span","pv-yr "+(it.planned?"pv-yr-pl":"pv-yr-past"),String(it.year??"")));
          list.append(row);
        }
        root.append(list);
        pop.setLngLat(f.geometry.coordinates)
           .setDOMContent(root)
           .addTo(map);
      });
      map.on("mouseenter","c-circles",()=>map.getCanvas().style.cursor="pointer");
      map.on("mouseleave","c-circles",()=>map.getCanvas().style.cursor="");

      // Click a cluster to zoom in and expand it
      map.on("click","clusters",(e:any)=>{
        const f=map.queryRenderedFeatures(e.point,{layers:["clusters"]})[0];
        if(!f) return;
        const id=f.properties.cluster_id;
        const src=map.getSource("concerts");
        src.getClusterExpansionZoom(id,(err:any,zoom:any)=>{
          if(err) return;
          map.easeTo({center:f.geometry.coordinates,zoom,duration:500});
        });
      });
      map.on("mouseenter","clusters",()=>map.getCanvas().style.cursor="pointer");
      map.on("mouseleave","clusters",()=>map.getCanvas().style.cursor="");
    });

    return ()=>{ map.remove(); mapRef.current=null; };
  },[hasToken,mapboxReady]);

  // Update data on mode change
  React.useEffect(()=>{
    const map=mapRef.current;
    if(!map||!map.getSource||!map.isStyleLoaded()) {
      if(map){ map.once("idle",()=>{ const s=map.getSource("concerts"); if(s) s.setData(buildGeo(mode)); }); }
      return;
    }
    const s=map.getSource("concerts");
    if(s) s.setData(buildGeo(mode));
    if(popRef.current) popRef.current.remove();
  },[mode,buildGeo]);

  return (
    <section className="panel full">
      <div className="paneltop">
        <div>
          <h2><Icon name="map" size={22} className="h2ic"/>{titolo}</h2>
        </div>
      </div>
      <div className="mapwrap">
        <div ref={ref} style={{position:"absolute",inset:0}}></div>
        {hasToken && mapboxReady && !loadError && DATA.some(isPlanned) && (
          <div className="mapnote">
            <span style={{display:"inline-flex",alignItems:"center",gap:7}}>
              <span style={{width:12,height:12,borderRadius:"50%",background:"var(--lamp)",flexShrink:0}}></span>
              Già visti
            </span>
            <span style={{display:"inline-flex",alignItems:"center",gap:7}}>
              <span style={{width:12,height:12,borderRadius:"50%",background:"var(--planned)",flexShrink:0}}></span>
              In programma
            </span>
          </div>
        )}
        {hasToken && mapboxReady && !loadError && (
          <button className="mapfit" onClick={fitToData} title="Adatta alla mappa">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8V5a2 2 0 0 1 2-2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/></svg>
            Adatta
          </button>
        )}
        {hasToken && !mapboxReady && !loadError && (
          <div className="maptokenwarn">
            <div style={{fontFamily:"'Fraunces',serif",fontSize:"1rem",color:"var(--muted)"}}>Carico la mappa…</div>
          </div>
        )}
        {hasToken && loadError && (
          <div className="maptokenwarn">
            <div>
              <div style={{fontFamily:"'Fraunces',serif",fontWeight:500,fontSize:"1.2rem",marginBottom:10}}>Mappa non disponibile</div>
              <p className="desc" style={{maxWidth:"42ch",margin:"0 auto"}}>Non riesco a caricare la libreria Mapbox GL (api.mapbox.com). Controlla la connessione o eventuali blocchi di rete, poi ricarica la pagina.</p>
            </div>
          </div>
        )}
        {!hasToken && (
          <div className="maptokenwarn">
            <div>
              <div style={{fontFamily:"'Fraunces',serif",fontWeight:500,fontSize:"1.2rem",marginBottom:10}}>Manca il token Mapbox</div>
              <p className="desc" style={{maxWidth:"40ch",margin:"0 auto"}}>Incolla il tuo token pubblico Mapbox (inizia con <code>pk.</code>) nella costante <code>MAPBOX_TOKEN</code> in cima allo script. È gratuito su account.mapbox.com.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function MapError(){
  const titolo=useTitoloMappa();
  return (
    <section className="panel full">
      <h2><Icon name="map" size={22} className="h2ic"/>{titolo}</h2>
      <p className="desc" style={{margin:0}}>La mappa non è riuscita a caricarsi. Ricarica la pagina; il resto della dashboard funziona normalmente.</p>
    </section>
  );
}

export class MapBoundary extends React.Component<any,{err:boolean}>{
  constructor(p:any){super(p);this.state={err:false};}
  static getDerivedStateFromError(){return {err:true};}
  componentDidCatch(e:any){console.error("Map error:",e);}
  render(){
    if(this.state.err) return <MapError/>;
    return this.props.children;
  }
}

