// One river description drives the carved terrain, painted currents, flowers,
// and water effects. The downstream bend opens a little toward the stage left.
export const RIVER_START_Z=-172;
export const RIVER_END_Z=124;
const clamp01=value=>Math.max(0,Math.min(1,value));
const smooth=(a,b,value)=>{const t=clamp01((value-a)/(b-a));return t*t*(3-2*t);};

export function riverCenterX(z){
  return 56+Math.sin(z*.026)*3+Math.sin(z*.055)*1.2
    +42*(1-smooth(-124,-52,z))-17*smooth(10,77,z);
}
export function riverHalfWidth(z){
  return 7.4+1.5*smooth(8,70,z)-1.7*(1-smooth(-150,-65,z))+.30*Math.sin(z*.06);
}
export const riverHeight=z=>-.24+z*.0008;
// The bed continues beyond the visible brush endpoints, preventing a raised
// cross-river cap from hiding the first/last water strokes and floating glints.
export function riverExtent(z){
  return smooth(RIVER_START_Z-14,RIVER_START_Z-2,z)*(1-smooth(RIVER_END_Z+2,RIVER_END_Z+14,z));
}
export function isRiverPoint(x,z,margin=0){
  return Number.isFinite(x)&&Number.isFinite(z)&&riverExtent(z)>.05
    &&Math.abs(x-riverCenterX(z))<=Math.max(0,riverHalfWidth(z)+margin);
}

// Keep GPU advection in exactly the same channel, including the widened bend.
export const RIVER_GLSL=`
  float riverCenterX(float z){return 56.0+sin(z*.026)*3.0+sin(z*.055)*1.2
    +42.0*(1.0-smoothstep(-124.0,-52.0,z))-17.0*smoothstep(10.0,77.0,z);}
  float riverHalfWidth(float z){return 7.4+1.5*smoothstep(8.0,70.0,z)
    -1.7*(1.0-smoothstep(-150.0,-65.0,z))+.30*sin(z*.06);}
  float riverHeight(float z){return -.24+z*.0008;}
  float riverExtent(float z){return smoothstep(-186.0,-174.0,z)*(1.0-smoothstep(126.0,138.0,z));}
`;
