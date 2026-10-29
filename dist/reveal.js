import * as THREE from './vendor/three.module.js';
import {landscapeStrokes} from './sketch-landscape.js';
import {fortressStrokes} from './sketch-fortress.js';
import {skyBirdStrokes} from './sky-birds.js';
import {groundChainStrokes} from './ground-chains.js';
import {campfireStrokes} from './campfires.js';
import {createOpeningPaper} from './opening-drawing.js';
import {createBrushLayer} from './brush-strokes.js';
import {createDaySky} from './day-sky.js';
import {createWeatherParticles} from './weather-particles.js';
import {createSpringFlowers} from './spring-flowers.js';
import {createFortressLights} from './fortress-lights.js';
import {createSeasonLife} from './season-life.js';
import {createBlueTears} from './blue-tears.js';

// The only bitmap is the original opening drawing. All final scenery is
// hand-composed calligraphic brushwork in three-dimensional space.
export async function createDrawingReveal(world, openingCamera, finalCamera, groundHeight) {
  const texture=await new THREE.TextureLoader().loadAsync('./assets/doodle.png');
  texture.colorSpace=THREE.SRGBColorSpace;
  const image=texture.image;
  const scratch=document.createElement('canvas');
  scratch.width=image.width;scratch.height=image.height;
  const ctx=scratch.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,image.width,image.height).data;
  const buckets=Array.from({length:4},()=>Array.from({length:16},()=>[])),all=[];
  for(let y=0;y<image.height-1;y+=2)for(let x=0;x<image.width-1;x++){
    const i=(y*image.width+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    if(Math.min(r,g,b)>220)continue;
    const category=b>r+20?1:g>r+15?0:r>b+15?2:3;
    const point={x:x/image.width,y:y/image.height,r:r/255,g:g/255,b:b/255};
    buckets[category][Math.min(15,Math.floor(point.x*16))].push(point);all.push(point);
  }
  const group=new THREE.Group();group.name='Drawing becoming real scene edges';
  const forward=new THREE.Vector3();openingCamera.getWorldDirection(forward);
  const right=new THREE.Vector3().setFromMatrixColumn(openingCamera.matrixWorld,0);
  const up=new THREE.Vector3().setFromMatrixColumn(openingCamera.matrixWorld,1);
  // Fill the fixed stage composition on both axes. The paper and the sampled
  // stroke origins share this frame so the drawing flows into the 3D reveal.
  const distance=50,height=2*distance*Math.tan(THREE.MathUtils.degToRad(openingCamera.fov/2));
  const width=height*openingCamera.aspect;
  const center=openingCamera.position.clone().addScaledVector(forward,distance);
  const sourceCameraInverse=openingCamera.matrixWorld.clone().invert(),sourceTransform=new THREE.Matrix4();
  const openingPaper=createOpeningPaper(texture,width,height),paper=openingPaper.mesh;
  const sourceBounds=openingPaper.sourceBounds;
  paper.position.copy(center);paper.quaternion.copy(openingCamera.quaternion);paper.renderOrder=2;group.add(paper);
  let randomSeed=84119;
  const random=()=>{randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0;return randomSeed/4294967296;};
  // Hand-composed brushwork only. Keeping all directions is essential for 360°
  // orbit; do not bake the first camera's frustum into the destination geometry.
  finalCamera.updateMatrixWorld(true);
  const midpoint=new THREE.Vector3();
  const categoryPools=buckets.map(b=>b.flat());
  function sourcePoint(stroke){
    midpoint.fromArray(stroke.points[Math.floor(stroke.points.length/2)]).project(finalCamera);
    const category=/river|water/.test(stroke.kind)?1:/structure|fortress|roof|gate|wall|flag|wood|door|beam|stone|chain|campfire/.test(stroke.kind)?2:0;
    const column=THREE.MathUtils.clamp(Math.floor((midpoint.x*.5+.5)*16),0,15);
    let pool=buckets[category][column];if(!pool.length)pool=categoryPools[category];if(!pool.length)pool=all;
    const point=pool[Math.floor(random()*pool.length)];
    const x=(point.x-sourceBounds.left)/sourceBounds.width,y=(point.y-sourceBounds.top)/sourceBounds.height;
    return{...point,position:center.clone().addScaledVector(right,(x-.5)*width).addScaledVector(up,(.5-y)*height),right,seed:random()*30};
  }
  const terrain=[...landscapeStrokes(groundHeight),...groundChainStrokes(groundHeight),...campfireStrokes(groundHeight),...skyBirdStrokes()],structure=fortressStrokes(),layers=[];
  // Broad mineral strokes follow the mountain surface on BOTH brush edges.
  // A screen-facing wide line would sink its far edge into steep terrain and
  // leave bare streaks after the depth pass. These are paint ribbons, not a fill.
  terrain.forEach((stroke,k)=>{
    if(!stroke.wash||!stroke.worldWidth||!/mineral|ink-stain|earth-scumble|river-colour/.test(stroke.kind))return;
    stroke.ribbonEdges=stroke.points.map((p,i,points)=>{
      const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz)||1;
      const pressure=.83+.14*Math.sin(i*.77+k)+.03*Math.sin(i*2.1);
      const half=stroke.worldWidth*.5*pressure,lift=Math.max(.5,p[1]-groundHeight(p[0],p[2]));
      return [-1,1].map(side=>{const x=p[0]-dz/length*half*side,z=p[2]+dx/length*half*side;return[x,groundHeight(x,z)+lift,z];});
    });
  });
  for(const strokes of [terrain,structure])for(const wash of [true,false]){
    const list=strokes.filter(s=>!!s.wash===wash).map(s=>{
      const middle=s.points[Math.floor(s.points.length/2)];
      const depth=new THREE.Vector3().fromArray(middle).applyMatrix4(finalCamera.matrixWorldInverse).z;
      const wind=s.wind||(/cloud|vapour/.test(s.kind)?2:s.kind==='water-ink'?5:/river-colour/.test(s.kind)?3:/^flag-/.test(s.kind)?1:0);
      if(wind===1){
        const poles=[[-15,0,-11.5],[15,0,-11.5],[-34,20.4,-17.5],[34,21.2,-17.5],[-24,9.8,-16],[24,9.8,-16]];
        let closest=0,distance=Infinity;for(let j=0;j<poles.length;j++){const p=poles[j],d=Math.hypot(middle[0]-p[0],middle[1]-p[1]-9,middle[2]-p[2]);if(d<distance){distance=d;closest=j;}}
        return{...s,depth,wind,motionAnchor:poles[closest],motionPhase:closest*1.37};
      }
      if(wind===5)return{...s,depth,wind,motionAnchor:middle};
      return{...s,depth,wind};
    });
    list.sort((a,b)=>Number(!/foundation/.test(a.kind))-Number(!/foundation/.test(b.kind))||a.depth-b.depth);
    // Finish both pigment passes before ink. The depth prepass already hides
    // rear scenery; foreground smoke must not be painted over by the wall wash.
    const layer=createBrushLayer(list,sourcePoint,wash);
    layer.mesh.renderOrder=wash?(strokes===terrain?1:2):(strokes===terrain?4:3);
    group.add(layer.mesh);layers.push(layer);
  }
  // Original drawing stays above the first moving strokes, then disappears.
  paper.renderOrder=10;
  const pigment=createDaySky();group.add(pigment.mesh);
  const weather=createWeatherParticles(groundHeight);group.add(weather.group);
  const flowers=createSpringFlowers(groundHeight);group.add(flowers.group);
  const fortressLights=createFortressLights();group.add(fortressLights.group);
  const life=createSeasonLife(groundHeight);group.add(life.group);
  const blueTears=createBlueTears();group.add(blueTears.group);
  let weatherState=null,weatherDay=null,weatherStrength=0,weatherTime=0;
  let lightingState=null,lightingStrength=0,lightingTime=0;
  return{group,count:[...terrain,...structure].reduce((sum,s)=>sum+s.points.length-1,0),
    setOpeningCamera(nextCamera){
      nextCamera.updateMatrixWorld(true);
      sourceTransform.multiplyMatrices(nextCamera.matrixWorld,sourceCameraInverse);
      for(const layer of layers)layer.setSourceTransform(sourceTransform);
      nextCamera.getWorldDirection(forward);
      paper.position.copy(nextCamera.position).addScaledVector(forward,distance);paper.quaternion.copy(nextCamera.quaternion);
    },
    setResolution(w,h){for(const layer of layers)layer.setResolution(w,h);},
    setDayCycle(state,strength,camera,time){
      for(const layer of layers)layer.setDayCycle(state,strength);
      pigment.setDayCycle(state,strength,camera,time);
      lightingState=state;lightingStrength=strength;lightingTime=time;
    },
    setSeason(state,dayState,strength,time){
      for(const layer of layers)layer.setSeason(state,strength);
      pigment.setSeason(state,strength);
      weatherState=state;weatherDay=dayState;weatherStrength=strength;weatherTime=time;
    },
    update(p,time=0,mood=0,opacity=1,drawingProgress=1){
      for(const layer of layers)layer.update(p,time,mood,opacity);pigment.update(p,opacity);
      if(weatherState){
        weather.update(weatherState,weatherDay,weatherTime,weatherStrength,opacity);
        flowers.update(weatherState,weatherDay,weatherTime,weatherStrength,opacity);
        life.update(weatherState,weatherDay,weatherTime,weatherStrength,opacity);
        blueTears.update(weatherState,weatherDay,weatherTime,lightingStrength,opacity);
      }
      if(lightingState)fortressLights.update(lightingState,lightingTime,lightingStrength,opacity);
      openingPaper.update(drawingProgress,p,opacity);
    },
    dispose(){for(const layer of layers)layer.dispose();life.dispose();blueTears.dispose();fortressLights.dispose();flowers.dispose();weather.dispose();pigment.dispose();openingPaper.dispose();texture.dispose();}
  };
}
