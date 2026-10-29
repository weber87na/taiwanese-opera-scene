import * as THREE from './vendor/three.module.js';
import {createFlowerLayout} from './flower-layout.js';

const clamp01=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));

/** Rooted, world-space flower beds. Two fixed instanced batches share their
 * anchors and wind: stems stay attached to the ground as each bud opens. */
export function createSpringFlowers(groundHeight){
  const plants=createFlowerLayout(groundHeight);
  const group=new THREE.Group();group.name='Spring ink flower beds';group.visible=false;
  group.userData.plantCount=plants.length;
  const origins=new Float32Array(plants.length*4),shapes=new Float32Array(plants.length*4);
  plants.forEach((plant,i)=>{
    origins.set([plant.x,plant.y,plant.z,plant.seed],i*4);
    shapes.set([plant.height,plant.size,Math.min(4,Math.floor(plant.palette*5)),plant.opening],i*4);
  });
  const uniforms={time:{value:0},bloom:{value:0},wind:{value:0},opacity:{value:0},night:{value:0},twilight:{value:0}};
  const commonVertex=`
    attribute vec4 origin,shape;
    uniform float time,bloom,wind;
    varying vec2 vLocal;
    varying float vSeed,vPalette,vOpen,vFade;
    vec3 sway(float t){
      float phase=origin.w*31.4159;
      return vec3(sin(time*.86+phase)*(.10+wind*.24)+sin(time*.37+phase)*.05,0.0,
        cos(time*.69+phase)*(.045+wind*.10))*t*t;
    }
    void flowerVaryings(vec4 eye){
      vSeed=origin.w;vPalette=shape.z;
      vOpen=smoothstep(shape.w,min(1.0,shape.w+.52),bloom);
      vFade=smoothstep(2.0,8.0,-eye.z)*(1.0-smoothstep(180.0,280.0,-eye.z));
    }
  `;
  const stemVertex=`
    ${commonVertex}
    void main(){
      vLocal=position.xy;
      vec3 right=normalize(vec3(viewMatrix[0][0],0.0,viewMatrix[2][0]));
      vec3 p=origin.xyz+vec3(0.0,shape.x*position.y,0.0)+sway(position.y);
      p+=right*position.x*shape.y*.85;
      vec4 eye=modelViewMatrix*vec4(p,1.0);
      flowerVaryings(eye);gl_Position=projectionMatrix*eye;
    }
  `;
  const blossomVertex=`
    ${commonVertex}
    void main(){
      vLocal=position.xy;
      vec4 eye=modelViewMatrix*vec4(origin.xyz+vec3(0.0,shape.x,0.0)+sway(1.0),1.0);
      flowerVaryings(eye);
      float turn=origin.w*6.2831853+sin(time*.7+origin.w*18.0)*.06;
      float c=cos(turn),s=sin(turn);
      vec2 petal=position.xy*vec2(1.0,.72+.25*fract(origin.w*7.0));
      eye.xy+=mat2(c,-s,s,c)*petal*shape.y*(.20+.80*vOpen);
      gl_Position=projectionMatrix*eye;
    }
  `;
  const commonFragment=`
    uniform float opacity,night,twilight;
    varying vec2 vLocal;
    varying float vSeed,vPalette,vOpen,vFade;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    vec3 litPigment(vec3 pigment){
      pigment=mix(pigment,pigment*vec3(1.13,.79,.58)+vec3(.035,.012,0.0),twilight*.50);
      return mix(pigment,pigment*vec3(.20,.29,.46)+vec3(.006,.012,.025),night*.92);
    }
    void paint(vec3 pigment,float coverage){
      float grain=.83+.17*hash(floor(vLocal*47.0+vSeed*33.0));
      float alpha=coverage*opacity*vFade*grain;
      if(alpha<.004)discard;
      gl_FragColor=vec4(litPigment(pigment),alpha);
    }
  `;
  const stemFragment=`
    ${commonFragment}
    float leaf(vec2 p,float turn){
      float c=cos(turn),s=sin(turn);p=mat2(c,-s,s,c)*p;
      float edge=length(p/vec2(.31,.095));
      return 1.0-smoothstep(.65,1.0,edge);
    }
    void main(){
      vec2 p=vLocal;
      float curve=.035*sin(p.y*5.0+vSeed*6.0)*(1.0-p.y);
      float width=.022+.013*(1.0-p.y),aa=max(.009,fwidth(p.x));
      float stalk=1.0-smoothstep(width,width+aa,abs(p.x-curve));
      float blades=max(leaf(p-vec2(-.23,.40),.50),leaf(p-vec2(.23,.64),-.48));
      blades=max(blades,leaf(p-vec2(.21,.22),-.36)*.78);
      float coverage=max(stalk*.82,blades*.65)*smoothstep(0.0,.06,p.y);
      vec3 pigment=mix(vec3(.075,.21,.09),vec3(.18,.35,.11),blades);
      paint(pigment,coverage);
      #include <colorspace_fragment>
    }
  `;
  const blossomFragment=`
    ${commonFragment}
    void main(){
      vec2 p=vLocal;float radius=length(p),angle=atan(p.y,p.x);
      float petals=vPalette>3.5?7.0:vPalette>1.5&&vPalette<2.5?8.0:5.0;
      float petalWave=.5+.5*cos(angle*petals);
      float rim=.57+.25*pow(petalWave,.52);
      rim+=.018*sin(angle*19.0+vSeed*27.0)+.012*sin(angle*31.0);
      rim=mix(.62,rim,vOpen);
      float aa=max(.018,fwidth(radius)*.8);
      float coverage=1.0-smoothstep(rim-.065-aa,rim+aa,radius);
      vec3 colour=vec3(.81,.19,.34);
      if(vPalette>.5)colour=vec3(.64,.065,.14);
      if(vPalette>1.5)colour=vec3(.98,.75,.26);
      if(vPalette>2.5)colour=vec3(.46,.25,.65);
      if(vPalette>3.5)colour=vec3(.97,.94,.79);
      float wash=.72+.28*smoothstep(.12,.76,radius);
      vec3 pigment=colour*wash;
      float inkEdge=smoothstep(rim-.09,rim,radius);
      pigment=mix(pigment,colour*.45,inkEdge*.38);
      // Fine radial veins and broken pigment pools retain the painted style.
      float veins=pow(.5+.5*cos(angle*petals*2.0+.2*sin(radius*17.0)),12.0);
      pigment*=1.0-veins*smoothstep(.16,.35,radius)*(1.0-smoothstep(.46,.72,radius))*.17;
      float heart=1.0-smoothstep(.13,.22,radius);
      vec3 gold=mix(vec3(.55,.29,.035),vec3(.93,.60,.10),hash(floor(p*40.0+vSeed*23.0)));
      pigment=mix(pigment,gold,heart*vOpen);
      pigment=mix(vec3(.20,.32,.10),pigment,.28+.72*vOpen);
      paint(pigment,coverage*.94);
      #include <colorspace_fragment>
    }
  `;
  const resources=[];
  for(const [name,stem] of [['Flower stems',true],['Opening blossoms',false]]){
    const geometry=new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(stem?[-1,0,0,1,0,0,1,1,0,-1,1,0]:[-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));
    geometry.setIndex([0,1,2,0,2,3]);geometry.instanceCount=plants.length;
    geometry.setAttribute('origin',new THREE.InstancedBufferAttribute(origins,4));
    geometry.setAttribute('shape',new THREE.InstancedBufferAttribute(shapes,4));
    const material=new THREE.ShaderMaterial({name,uniforms,
      vertexShader:stem?stemVertex:blossomVertex,fragmentShader:stem?stemFragment:blossomFragment,
      transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true});
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.frustumCulled=false;mesh.renderOrder=stem?5:5.1;
    group.add(mesh);resources.push({geometry,material});
  }
  return{
    group,
    update(state,dayState,time,strength,opacity=1){
      const alpha=clamp01(state?.spring)*clamp01(strength)*clamp01(opacity);
      group.visible=alpha>.002;
      uniforms.time.value=Number.isFinite(time)?time:0;
      uniforms.bloom.value=clamp01(state?.blossom);uniforms.wind.value=clamp01(state?.wind);
      uniforms.opacity.value=alpha;uniforms.night.value=clamp01(dayState?.night);
      uniforms.twilight.value=Math.max(clamp01(dayState?.sunset),clamp01(dayState?.dawn)*.65);
    },
    dispose(){for(const resource of resources){resource.geometry.dispose();resource.material.dispose();}}
  };
}
