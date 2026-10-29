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
    float inkNoise(vec2 p){
      vec2 cell=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
      return mix(mix(hash(cell),hash(cell+vec2(1.0,0.0)),f.x),
        mix(hash(cell+vec2(0.0,1.0)),hash(cell+1.0),f.x),f.y);
    }
    vec3 litPigment(vec3 pigment){
      pigment=mix(pigment,pigment*vec3(1.13,.79,.58)+vec3(.035,.012,0.0),twilight*.50);
      return mix(pigment,pigment*vec3(.20,.29,.46)+vec3(.006,.012,.025),night*.92);
    }
    void paint(vec3 pigment,float coverage){
      float grain=.96+.04*inkNoise(vLocal*39.0+vSeed*33.0);
      float alpha=coverage*opacity*vFade*grain;
      if(alpha<.004)discard;
      gl_FragColor=vec4(litPigment(pigment),alpha);
    }
  `;
  const stemFragment=`
    ${commonFragment}
    float leaf(vec2 p,float turn){
      float c=cos(turn),s=sin(turn);p=mat2(c,-s,s,c)*p;
      float t=clamp((p.x+.34)/.68,0.0,1.0);
      float bend=.04*sin(t*3.14159+vSeed*3.0);
      float width=.10*pow(max(0.0,sin(t*3.14159)),.8);
      float edge=max(abs(p.y-bend)-width,abs(p.x)-.34);
      edge+=(inkNoise(p*26.0+vSeed*19.0)-.5)*.035;
      return 1.0-smoothstep(-.012,.035,edge);
    }
    void main(){
      vec2 p=vLocal;
      float curve=.035*sin(p.y*5.0+vSeed*6.0)*(1.0-p.y);
      float width=(.022+.013*(1.0-p.y))*(.80+.20*sin(p.y*17.0+vSeed*27.0)),aa=max(.009,fwidth(p.x));
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
    float washNoise(vec2 p){
      return inkNoise(p)*.58+inkNoise(p*2.13+8.7)*.28+inkNoise(p*4.31-3.4)*.14;
    }
    void main(){
      vec2 p=vLocal;
      float seed=hash(vec2(vSeed*83.0,2.17));
      float sideView=smoothstep(.36,.88,hash(vec2(vSeed*37.0,7.31)));
      vec2 heart=vec2((seed-.5)*.28,-sideView*.19+(vSeed-.5)*.12);
      float wet=washNoise(p*3.9+vSeed*37.0);
      float water=washNoise(p*7.0+vec2(19.0,vSeed*29.0));
      vec2 seep=vec2(wet-.5,water-.5)*.14;
      float aa=max(.009,length(fwidth(p))*.65);
      float coverage=0.0,layeredInk=0.0,pooledInk=0.0,openPaper=0.0;
      float dabs=4.0+floor(hash(vec2(vSeed*91.0,3.0))*4.0);
      // An off-centre cluster of unequal wet dabs: no petal slots, shared
      // radial root, or rotational symmetry. Some flowers face partly aside.
      for(int i=0;i<8;i++){
        float index=float(i);
        if(index>=dabs)continue;
        float a=hash(vec2(index+3.0,vSeed*71.0));
        float b=hash(vec2(index+13.0,vSeed*113.0));
        float cSeed=hash(vec2(index+29.0,vSeed*43.0));
        float bearing=index*2.3999632+(a-.5)*1.70+seed*4.0;
        vec2 centre=vec2(cos(bearing),sin(bearing))*(.16+b*.25);
        centre.y=centre.y*(1.0-sideView*.57)+sideView*.16;
        centre+=heart*.48;
        float turn=bearing*.46+(cSeed-.5)*2.4;
        float c=cos(turn),s=sin(turn);
        vec2 q=mat2(c,-s,s,c)*(p-centre+seep);
        q.y+=q.x*q.x*(a-.5)*1.0;
        vec2 brushSize=vec2(.22+a*.19,.14+cSeed*.18);
        brushSize.y*=1.0-sideView*.20;
        float shape=length(q/brushSize);
        float localWater=inkNoise(q*7.0+vec2(index*3.17,vSeed*53.0));
        shape+=(localWater-.5)*.58+(water-.5)*.21;
        float softness=.15+cSeed*.25;
        float loaded=1.0-smoothstep(.66-aa,1.02+softness+aa,shape);
        float bloom=(1.0-smoothstep(.72,1.58+aa,shape))*.20;
        float lift=smoothstep(.51,.78,localWater)*smoothstep(.40,.77,wet);
        float load=.42+a*.43;
        float dab=loaded*load*(1.0-lift*.62)+bloom*(1.0-loaded);
        coverage=1.0-(1.0-coverage)*(1.0-dab);
        layeredInk+=loaded*(.13+cSeed*.26)*(1.0-lift*.70);
        pooledInk+=loaded*smoothstep(.40,1.10,shape)*smoothstep(.32,.67,localWater)*.35;
        openPaper=max(openPaper,lift*loaded);
      }
      vec2 bud=p+seep-vec2((seed-.5)*.17,.015);
      float budEdge=length(bud/vec2(.31,.48))+(water-.5)*.36;
      float budCoverage=1.0-smoothstep(.65,1.18,budEdge);
      coverage=mix(budCoverage*.83,coverage,smoothstep(.06,.73,vOpen));
      vec3 colour=vec3(.73,.19,.28);
      if(vPalette>.5)colour=vec3(.55,.075,.12);
      if(vPalette>1.5)colour=vec3(.88,.65,.23);
      if(vPalette>2.5)colour=vec3(.39,.24,.49);
      if(vPalette>3.5)colour=vec3(.90,.86,.68);
      float density=clamp(layeredInk*.63+pooledInk*.46+wet*.17,0.0,.90);
      vec3 pigment=mix(mix(colour,vec3(.98,.94,.85),.40),colour*.40,density);
      pigment=mix(pigment,vec3(.96,.92,.82),openPaper*.43);
      // Broken, displaced stamens read as a flower without a circular badge.
      float stamens=0.0;
      for(int i=0;i<3;i++){
        float n=float(i),a=hash(vec2(n+5.0,vSeed*67.0));
        vec2 dotCentre=heart+vec2((a-.5)*.19,(hash(vec2(n+18.0,vSeed*43.0))-.5)*.14);
        float d=length((p-dotCentre+seep*.3)/vec2(.052+a*.026,.043+a*.018));
        stamens=max(stamens,1.0-smoothstep(.46,1.25,d+(water-.5)*.50));
      }
      vec3 gold=mix(vec3(.16,.11,.06),vec3(.60,.34,.10),water);
      pigment=mix(pigment,gold,stamens*vOpen*.84);
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
