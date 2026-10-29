// World-space camera poses. The opening drawing still uses the original view.
export const CAMERA_SHOTS=Object.freeze([
  {id:'outside',label:'寨外全景',note:'山寨、營火與河道全景',position:[27,15,72],target:[0,9,-16],mood:.28},
  {id:'gate',label:'寨門近景',note:'正門與雙層門樓',position:[5,13,38],target:[0,9,-16],mood:.28},
  {id:'left',label:'左側斜景',note:'左營火與寨牆縱深',position:[-59,23,52],target:[0,8,-18],mood:.5},
  {id:'river',label:'河岸高景',note:'右側河灣與山寨',position:[55,28,30],target:[0,9,-21],mood:.28},
  {id:'inside',label:'寨內回望',note:'寨內屋舍與門樓背面',position:[-25,26,-72],target:[0,9,-16],mood:0},
]);
const TAU=Math.PI*2;
const mix=(a,b,t)=>a+(b-a)*t;
const wrap=v=>Math.atan2(Math.sin(v),Math.cos(v));
function polar(shot,out){
  const dx=shot.position[0]-shot.target[0],dz=shot.position[2]-shot.target[2];
  Object.assign(out,{yaw:Math.atan2(dx,dz),radius:Math.hypot(dx,dz),height:shot.position[1]-shot.target[1],x:shot.target[0],y:shot.target[1],z:shot.target[2]});
  return out;
}
export function createCameraDirector(){
  const current=polar(CAMERA_SHOTS[0],{}),goal={...current};
  const pose={position:[...CAMERA_SHOTS[0].position],target:[...CAMERA_SHOTS[0].target],mode:0,moving:false};
  let mode=0,autoSeconds=0,autoYaw=current.yaw;
  function select(value,{immediate=false}={}){
    if(!Number.isInteger(value)||value<0||value>5)return false;
    mode=value;
    if(mode===0){autoSeconds=0;autoYaw=current.yaw;}
    else{polar(CAMERA_SHOTS[mode-1],goal);goal.yaw=current.yaw+wrap(goal.yaw-current.yaw);if(immediate)Object.assign(current,goal);}
    pose.mode=mode;
    return true;
  }
  function hold(orbit=0){current.yaw+=orbit;mode=-1;pose.mode='manual';Object.assign(goal,current);}
  function snapshot(){return {current:{...current},goal:{...goal},mode,autoSeconds,autoYaw};}
  function restore(saved){Object.assign(current,saved.current);Object.assign(goal,saved.goal);mode=saved.mode;autoSeconds=saved.autoSeconds;autoYaw=saved.autoYaw;pose.mode=mode<0?'manual':mode;pose.moving=false;}
  function update(delta=0,running=true,orbit=0,groundHeight=()=>0){
    const dt=Math.max(0,Math.min(.1,Number.isFinite(delta)?delta:0));
    if(mode===0&&running){
      autoSeconds+=dt;
      goal.yaw=autoYaw+autoSeconds*.021;
      goal.radius=91+17*Math.sin(autoSeconds*.038);
      goal.height=10+6*Math.sin(autoSeconds*.027);
      goal.x=0;goal.y=9;goal.z=-16;
    }
    const blend=1-Math.exp(-dt*(mode===0?.6:2.1));
    let remaining=0;
    // Fixed views may be selected while the scenery is paused; only the
    // deliberate view transition runs then. Auto travel freezes with P.
    if(mode!==0||running)for(const key of ['yaw','radius','height','x','y','z']){
      current[key]=mix(current[key],goal[key],blend);
      if(Math.abs(goal[key]-current[key])<.0001)current[key]=goal[key];
      remaining+=Math.abs(goal[key]-current[key]);
    }
    const angle=(current.yaw+orbit)%TAU;
    pose.target[0]=current.x;pose.target[1]=current.y;pose.target[2]=current.z;
    pose.position[0]=current.x+Math.sin(angle)*current.radius;
    pose.position[2]=current.z+Math.cos(angle)*current.radius;
    pose.position[1]=Math.max(current.y+current.height,groundHeight(pose.position[0],pose.position[2])+8);
    pose.mode=mode<0?'manual':mode;pose.moving=remaining>.001;
    return pose;
  }
  return {select,hold,snapshot,restore,update,pose,get mode(){return mode;},get moving(){return pose.moving;}};
}
