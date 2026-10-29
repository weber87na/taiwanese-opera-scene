const defaults=Object.freeze({enabled:true,durationSeconds:120,startPhase:0});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const smooth=(start,end,value)=>{const t=clamp((value-start)/(end-start),0,1);return t*t*(3-2*t);};

// Directions use azimuth 0 toward world -Z and positive azimuth toward +X.
// Hidden parts of the orbits return behind the horizon before the next rise.
const sunPath=[
  [0,.29,-.55],[.23,.30,.02],[.34,.21,.12],[.42,.09,.20],
  [.50,-.20,.28],[.68,-.35,0],[.82,-.20,-.78],
  [.88,.02,-.77],[.95,.20,-.66],[1,.29,-.55],
];
const moonPath=[
  [0,-.25,.50],[.34,-.25,-.75],[.46,.05,-.55],[.58,.27,-.35],
  [.72,.28,.10],[.82,.18,.20],[.90,-.12,.55],[1,-.25,.50],
];
// One painted phase per performance night. The shape changes only while the
// moon is below the horizon, and repeats after eight complete day/night loops.
const moonPhases=[.12,.25,.38,.50,.62,.75,.88,.04];
const moonNames=['蛾眉月','上弦月','盈凸月','滿月','虧凸月','下弦月','殘月','新眉月'];

export function normalizeDayCycleSettings(value={}) {
  const input=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  return {
    enabled:input.enabled!==false,
    durationSeconds:Number.isFinite(input.durationSeconds)?clamp(input.durationSeconds,30,1800):defaults.durationSeconds,
    startPhase:Number.isFinite(input.startPhase)?clamp(input.startPhase,0,1):defaults.startPhase,
  };
}

export async function loadDayCycleSettings() {
  try {
    const response=await fetch('./day-cycle-config.json',{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return normalizeDayCycleSettings(await response.json());
  } catch(error) {
    console.warn('日夜循環設定讀取失敗，使用預設120秒循環。',error);
    return normalizeDayCycleSettings();
  }
}

function orbit(path,phase,out,altitudeKey,azimuthKey) {
  let i=1;
  while(i<path.length-1&&phase>path[i][0])i++;
  const a=path[i-1],b=path[i],t=smooth(a[0],b[0],phase);
  out[altitudeKey]=a[1]+(b[1]-a[1])*t;
  out[azimuthKey]=a[2]+(b[2]-a[2])*t;
}

/** Stateless sampling. Reuse `out` in the render loop to avoid frame allocations.
 * Pass only scene elapsed seconds: the introduction and hidden-tab time are
 * intentionally excluded by the caller. Disabled cycles stay in daylight.
 */
export function sampleDayCycle(seconds,settings=defaults,out={}) {
  const duration=Number.isFinite(settings?.durationSeconds)?clamp(settings.durationSeconds,30,1800):defaults.durationSeconds;
  const start=Number.isFinite(settings?.startPhase)?clamp(settings.startPhase,0,1):0;
  const elapsed=Number.isFinite(seconds)?seconds:0;
  const phase=settings?.enabled===false?0:((elapsed/duration+start)%1+1)%1;
  out.phase=phase;
  out.label=phase<.25?'day':phase<.48?'sunset':phase<.83?'night':'dawn';
  out.night=smooth(.37,.54,phase)*(1-smooth(.81,.98,phase));
  out.daylight=1-out.night;
  out.sunset=smooth(.22,.34,phase)*(1-smooth(.43,.54,phase));
  out.dawn=smooth(.80,.90,phase)*(1-smooth(.95,1,phase));
  const cycle=settings?.enabled===false?0:Math.floor(elapsed/duration+start%1);
  const moonIndex=((cycle%moonPhases.length)+moonPhases.length)%moonPhases.length;
  out.moonPhase=moonPhases[moonIndex];
  out.moonIllumination=(1-Math.cos(out.moonPhase*Math.PI*2))*.5;
  out.moonPhaseName=moonNames[moonIndex];
  orbit(sunPath,phase,out,'sunAltitude','sunAzimuth');
  orbit(moonPath,phase,out,'moonAltitude','moonAzimuth');
  return out;
}
