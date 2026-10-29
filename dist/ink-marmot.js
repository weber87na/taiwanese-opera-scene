import * as THREE from './vendor/three.module.js';
import {createMarmotAppearance,sampleMarmotFrame} from './marmot-appearance.js';

export const MARMOT_DURATION=4.05;
export const MARMOT_FADE_START=3.80;
export const MARMOT_TRAVEL_SECONDS=2.78;
const SAMPLES=160,SCALE=6.2;
const clamp01=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));

/** A curving route through the open approach, ending in front of the gate. */
export function sampleMarmotRoute(progress,out={}){
  const t=clamp01(progress),s=1-t;
  out.x=0-15*s*s*s-24*s*s*t-3*s*t*t;
  out.z=45*s*s*s+99*s*s*t+51*s*t*t-8*t*t*t;
  out.dx=21*s*s+42*s*t+3*t*t;
  out.dz=-36*s*s-96*s*t-75*t*t;
  return out;
}

/** One temporary ink animal, driven only by the caller's elapsed cue time.
 * The route's ground heights and two reusable GPU batches are built once. */
export function createInkMarmot(groundHeight){
  if(typeof groundHeight!=='function')throw new TypeError('Ink marmot requires a ground-height sampler.');
  const group=new THREE.Group();group.name='Running ink marmot cue';group.visible=false;
  group.userData.duration=MARMOT_DURATION;group.userData.species='marmot';
  const heights=new Float32Array(SAMPLES+1),route={};
  for(let i=0;i<=SAMPLES;i++){
    sampleMarmotRoute(i/SAMPLES,route);
    const y=groundHeight(route.x,route.z);
    if(!Number.isFinite(y))throw new TypeError('Marmot route requires finite terrain heights.');
    heights[i]=y;
  }
  const uniforms={time:{value:0},opacity:{value:0},anchor:{value:new THREE.Vector3()},
    facing:{value:1},hop:{value:0},scale:{value:SCALE},direction:{value:new THREE.Vector2(0,-1)}};

  const noise=`
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
  `;
  const appearance=createMarmotAppearance(uniforms);
  const {geometry,material}=appearance;
  const animal=new THREE.Mesh(geometry,material);animal.name='Running wet-ink marmot';animal.frustumCulled=false;animal.renderOrder=7.2;group.add(animal);
  const shadowGeometry=new THREE.PlaneGeometry(1,1);
  const shadowMaterial=new THREE.ShaderMaterial({name:'Marmot loose ground ink contact',uniforms,
    transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
    vertexShader:`uniform vec3 anchor;uniform vec2 direction;varying vec2 vLocal;
      void main(){vLocal=position.xy;vec2 right=vec2(-direction.y,direction.x);
        vec2 plane=right*position.x*3.6+direction*position.y*4.2;
        vec3 p=anchor+vec3(plane.x,.028,plane.y);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
    fragmentShader:`uniform float opacity,hop;varying vec2 vLocal;${noise}
      void main(){float r=length(vLocal*vec2(1.0,1.2));float n=noise(vLocal*19.0);
        float a=(1.0-smoothstep(.18,.51+(n-.5)*.08,r))*(.12+.10*n)*opacity*(1.0-hop*.55);
        if(a<.002)discard;gl_FragColor=vec4(.07,.075,.06,a);
        #include <colorspace_fragment>
      }`,
  });
  const shadow=new THREE.Mesh(shadowGeometry,shadowMaterial);shadow.name='Marmot ink contact';shadow.frustumCulled=false;shadow.renderOrder=7.1;group.add(shadow);
  let started=false;
  const result={active:false,done:false,progress:0};
  return {group,duration:MARMOT_DURATION,loadAppearance:appearance.load,
    start(){started=true;result.active=true;result.done=false;result.progress=0;group.visible=false;uniforms.time.value=0;uniforms.opacity.value=0;return result;},
    reset(){started=false;result.active=false;result.done=false;result.progress=0;group.visible=false;uniforms.time.value=0;uniforms.opacity.value=0;uniforms.hop.value=0;return result;},
    update(seconds,camera,opacity=1){
      if(!started)return result;
      const time=Math.max(0,Number.isFinite(seconds)?seconds:0);
      result.progress=clamp01(time/MARMOT_DURATION);result.done=time>=MARMOT_DURATION;result.active=!result.done;
      if(result.done){group.visible=false;uniforms.opacity.value=0;return result;}
      const travel=clamp01(time/MARMOT_TRAVEL_SECONDS);
      // Ease the last part of the approach to a stop before the animal rises.
      const braking=.14,brake=clamp01((travel-(1-braking))/braking);
      const progress=(travel-.5*braking*brake*brake)/(1-.5*braking);
      sampleMarmotRoute(progress,route);
      const index=progress*SAMPLES,lo=Math.floor(index),hi=Math.min(SAMPLES,lo+1);
      const y=heights[lo]+(heights[hi]-heights[lo])*(index-lo);
      uniforms.anchor.value.set(route.x,y+.035,route.z);
      const routeLength=Math.hypot(route.dx,route.dz);
      uniforms.direction.value.set(route.dx/routeLength,route.dz/routeLength);
      if(camera?.matrixWorld){
        const matrix=camera.matrixWorld.elements;
        uniforms.facing.value=route.dx*matrix[0]+route.dz*matrix[2]>=0?1:-1;
      }
      uniforms.time.value=time;uniforms.atlasFrame.value=sampleMarmotFrame(time);
      // The painted gait supplies the leg motion; keep supporting feet grounded.
      uniforms.hop.value=0;
      uniforms.opacity.value=clamp01(opacity)*THREE.MathUtils.smoothstep(time,0,.10)
        *(1-THREE.MathUtils.smoothstep(time,MARMOT_FADE_START,MARMOT_DURATION));
      group.visible=uniforms.opacity.value>.001;
      return result;
    },
    dispose(){appearance.dispose();shadowGeometry.dispose();shadowMaterial.dispose();},
  };
}
