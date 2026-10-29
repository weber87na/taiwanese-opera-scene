import * as THREE from './vendor/three.module.js';
import {RIVER_START_Z,RIVER_END_Z,RIVER_GLSL,riverCenterX,riverHalfWidth,riverHeight} from './river-layout.js';

const clamp01=n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));

/** Small luminous washes and sparks belong to the water surface, rather than
 * a screen overlay. Every patch follows the same channel used by terrain/ink. */
export function createBlueTears(){
  const ribbons=120,sparks=260,count=ribbons+sparks;
  const geometry=new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));
  geometry.setIndex([0,1,2,0,2,3]);geometry.instanceCount=count;
  const origins=new Float32Array(count*4),shapes=new Float32Array(count*4);
  let seed=927341;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const range=(a,b)=>a+(b-a)*random();
  for(let i=0;i<count;i++){
    const ribbon=i<ribbons;
    const z=ribbon?RIVER_START_Z+14+(i%40)/39*(RIVER_END_Z-RIVER_START_Z-28):range(RIVER_START_Z+12,RIVER_END_Z-12);
    const lane=ribbon?(Math.floor(i/40)-1)*.70+range(-.035,.035):range(-.87,.87);
    const halfLength=ribbon?range(2.8,6):range(.16,.40);
    const halfWidth=ribbon?range(.10,.20):range(.035,.075);
    origins.set([z,lane,random(),halfLength],i*4);
    shapes.set([halfWidth,ribbon?0:1,range(.55,1),random()],i*4);
  }
  geometry.setAttribute('origin',new THREE.InstancedBufferAttribute(origins,4));
  geometry.setAttribute('shape',new THREE.InstancedBufferAttribute(shapes,4));
  const uniforms={time:{value:0},power:{value:0},opacity:{value:1}};
  const material=new THREE.ShaderMaterial({name:'Blue tears on the river',uniforms,
    transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
    vertexShader:`
      attribute vec4 origin,shape;
      varying vec2 vLocal,vWater;
      varying float vSeed,vKind,vAlpha,vPhase;
      ${RIVER_GLSL}
      void main(){
        vLocal=position.xy;vSeed=origin.z;vKind=shape.y;vPhase=shape.w;
        float z=origin.x+position.y*origin.w;
        float lateral=origin.y+position.x*shape.x;
        float x=riverCenterX(z)+lateral*riverHalfWidth(z);
        vec4 eye=modelViewMatrix*vec4(x,riverHeight(z)+.12,z,1.0);
        vWater=vec2(x,z);
        vAlpha=riverExtent(z)*shape.z*smoothstep(3.0,11.0,-eye.z);
        gl_Position=projectionMatrix*eye;
      }
    `,
    fragmentShader:`
      uniform float time,power,opacity;
      varying vec2 vLocal,vWater;
      varying float vSeed,vKind,vAlpha,vPhase;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        vec2 p=vLocal;
        float pulse=.22+.78*pow(.5+.5*sin(time*(.56+vPhase*.32)+vSeed*31.0),3.0);
        float coverage,core;
        if(vKind<.5){
          float bend=.20*sin(p.y*5.0+vSeed*17.0+time*.30);
          float distanceToWave=abs(p.x-bend);
          core=exp(-distanceToWave*17.0);
          float haze=exp(-distanceToWave*distanceToWave*9.0);
          float stream=.40+.60*pow(.5+.5*sin(vWater.y*1.1-time*.85+vSeed*18.0),3.0);
          float ends=smoothstep(-1.0,-.62,p.y)*(1.0-smoothstep(.56,1.0,p.y));
          coverage=(core*.95+haze*.42)*stream*ends*(.55+.45*pulse);
        }else{
          float radius=length(p);
          core=1.0-smoothstep(.045,.25,radius);
          float halo=exp(-radius*radius*6.0);
          coverage=(core+halo*.46)*(.25+.75*pulse);
        }
        float grain=.83+.17*hash(floor(vWater*18.0));
        float alpha=min(.92,coverage*vAlpha*power*opacity*grain*1.9);
        if(alpha<.003)discard;
        vec3 blue=mix(vec3(.008,.32,.92),vec3(.20,.86,1.0),core*.85);
        gl_FragColor=vec4(blue,alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh=new THREE.Mesh(geometry,material);mesh.name='River blue bioluminescence';mesh.frustumCulled=false;mesh.renderOrder=5.3;
  const group=new THREE.Group();group.name='Night river blue tears';group.add(mesh);group.visible=false;
  group.userData.patchCount=count;
  return{
    group,
    update(season,day,time,strength,opacity=1){
      const night=THREE.MathUtils.smoothstep(clamp01(day?.night),.22,.86);
      uniforms.power.value=night*(1-clamp01(season?.winter)*.72)*(1-clamp01(season?.rain)*.45)*clamp01(strength);
      uniforms.opacity.value=clamp01(opacity);uniforms.time.value=Number.isFinite(time)?time:0;
      group.visible=uniforms.power.value*uniforms.opacity.value>.002;
    },
    // Useful to inspect the authored surface without reconstructing the GPU data.
    waterPoint(z,lateral){return [riverCenterX(z)+lateral*riverHalfWidth(z),riverHeight(z)+.12,z];},
    dispose(){geometry.dispose();material.dispose();},
  };
}
