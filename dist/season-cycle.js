const defaults=Object.freeze({enabled:true,durationSeconds:240,startPhase:0,weatherEnabled:true,weatherIntensity:1});
const names=['spring','summer','autumn','winter'];
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const smooth=(start,end,value)=>{const t=clamp((value-start)/(end-start),0,1);return t*t*(3-2*t);};
const pulse=(phase,start,rise,fall,end)=>smooth(start,rise,phase)*(1-smooth(fall,end,phase));

// [start, full strength, begin clearing, clear, amount]. Each season contains
// separate weather spells and clear intervals rather than constant particles.
const rainSpells=[
  [.025,.045,.075,.110,.42],[.135,.150,.165,.190,.30],
  [.275,.300,.335,.360,.95],[.390,.405,.420,.445,.78],
];
const leafSpells=[[.525,.550,.625,.660,.95],[.685,.700,.715,.735,.55]];
const snowSpells=[[.775,.805,.865,.900,.90],[.920,.935,.955,.975,.65]];

export function normalizeSeasonSettings(value={}) {
  const input=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  return {
    enabled:input.enabled!==false,
    durationSeconds:Number.isFinite(input.durationSeconds)?clamp(input.durationSeconds,60,3600):defaults.durationSeconds,
    startPhase:Number.isFinite(input.startPhase)?clamp(input.startPhase,0,1):defaults.startPhase,
    weatherEnabled:input.weatherEnabled!==false,
    weatherIntensity:Number.isFinite(input.weatherIntensity)?clamp(input.weatherIntensity,0,1.5):defaults.weatherIntensity,
  };
}

export async function loadSeasonSettings() {
  try {
    const response=await fetch('./season-config.json',{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return normalizeSeasonSettings(await response.json());
  } catch(error) {
    console.warn('四季設定讀取失敗，使用預設240秒循環。',error);
    return normalizeSeasonSettings();
  }
}

function spells(phase,list,lead=0,tail=0) {
  let result=0;
  for(let i=0;i<list.length;i++){
    const event=list[i];
    result+=pulse(phase,event[0]-lead,event[1],event[2]+tail,event[3]+tail)*event[4];
  }
  return result;
}

function clearingRainbow(phase,intensity,cycleTime,startPhase) {
  if(intensity<=0)return 0;
  let result=0;
  for(let i=0;i<rainSpells.length;i++){
    const event=rainSpells[i],clear=event[3];
    // The viewer must actually pass through the shower in this playback.
    // Starting/replaying directly in a dry phase must not invent earlier rain.
    const clearedAt=Math.floor(cycleTime-clear)+clear;
    if(clearedAt<=startPhase||cycleTime<clearedAt)continue;
    const nextRain=i+1<rainSpells.length?rainSpells[i+1][0]:rainSpells[0][0]+1;
    // A short clear interval must fade before the next shower, rather than
    // abruptly cutting off an otherwise ten-second rainbow as rain resumes.
    const end=Math.min(clear+.042,nextRain-.002);
    const appear=clear+.004;
    const fall=Math.min(clear+.022,end-.006),rise=Math.min(clear+.010,fall);
    result+=pulse(phase,appear,rise,fall,end)*Math.sqrt(event[4]*intensity);
  }
  return clamp(result,0,1);
}

/** Stateless, cyclic sampling. Reuse `out` on each frame; the caller supplies
 * completed-scene elapsed time and sets visual strength to 0 when disabled.
 */
export function sampleSeasonCycle(seconds,settings=defaults,out={}) {
  const duration=Number.isFinite(settings?.durationSeconds)?clamp(settings.durationSeconds,60,3600):defaults.durationSeconds;
  const start=Number.isFinite(settings?.startPhase)?clamp(settings.startPhase,0,1):0;
  const elapsed=Number.isFinite(seconds)?seconds:0;
  const phase=settings?.enabled===false?0:((elapsed/duration+start)%1+1)%1;
  const quarter=phase*4,index=Math.floor(quarter),blend=smooth(.82,1,quarter-index);
  out.phase=phase;out.label=names[index];
  out.spring=0;out.summer=0;out.autumn=0;out.winter=0;
  out[names[index]]=1-blend;out[names[(index+1)%4]]=blend;
  // Flowers open through early spring, stay in full bloom, then fade before
  // summer. This seasonal growth is independent of rain/snow being enabled.
  out.blossom=settings?.enabled===false?0:out.spring*pulse(phase,0,.065,.19,.25);
  const weatherOn=settings?.enabled!==false&&settings?.weatherEnabled!==false;
  const intensity=weatherOn?(Number.isFinite(settings?.weatherIntensity)?clamp(settings.weatherIntensity,0,1.5):1):0;
  out.rain=clamp(spells(phase,rainSpells)*intensity,0,1);
  out.rainbow=out.rain>0?0:clearingRainbow(phase,intensity,start+elapsed/duration,start);
  out.snow=clamp(spells(phase,snowSpells)*out.winter*intensity,0,1);
  out.leaves=clamp(spells(phase,leafSpells)*out.autumn*intensity,0,1);
  // Clouds gather shortly before precipitation; wet pigment lingers briefly
  // after rain. Both reach zero before the next season's main weather spell.
  out.cloudiness=clamp((spells(phase,rainSpells,.012,.012)*.9+spells(phase,snowSpells,.012,.008)*.55)*intensity,0,1);
  out.wetness=clamp(spells(phase,rainSpells,0,.025)*intensity+out.snow*.12,0,1);
  const gust=.82+.18*Math.sin(phase*Math.PI*12);
  out.wind=clamp(.12*intensity+Math.max(out.rain*.65,out.snow*.30,out.leaves*.85)*gust,0,1);
  return out;
}
