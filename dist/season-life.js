import * as THREE from './vendor/three.module.js';
import {createFlowerLayout,isFlowerSiteAllowed} from './flower-layout.js';

const COUNTS={butterflies:6,fireflies:128};
const clamp01=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));

/** Flower-bed insects stay in a small, prevalidated volume. Their paired
 * wings, flight paths and individual flashes animate entirely on the GPU. */
export function createSeasonLife(groundHeight){
  if(typeof groundHeight!=='function')throw new TypeError('Seasonal insects require a ground-height sampler.');
  const group=new THREE.Group();group.name='Spring summer butterflies and summer night fireflies';group.visible=false;
  group.userData.insectCounts={...COUNTS};group.userData.butterflyKinds=['white-round','yellow-swallowtail','blue-scalloped'];
  let seed=0x2d73ce19;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const range=(a,b)=>a+(b-a)*random();
  const plants=createFlowerLayout(groundHeight);
  function clearVolume(plant,radius){
    if(!isFlowerSiteAllowed(plant.x,plant.z,groundHeight))return false;
    for(let i=0;i<8;i++){
      const angle=i*Math.PI/4;
      if(!isFlowerSiteAllowed(plant.x+Math.cos(angle)*radius,plant.z+Math.sin(angle)*radius,groundHeight))return false;
    }
    return true;
  }
  const butterflySites=plants.filter(plant=>clearVolume(plant,3.5));
  const fireflySites=plants.filter(plant=>clearVolume(plant,1.5));
  const layers=[];
  const flightVertex=`
    attribute vec4 origin,flight,traits;
    uniform float time;
    varying vec2 vLocal;varying float vSeed,vKind,vFade,vPart;
    vec3 flightCentre(float kind){
      float phase=origin.w*6.2831853,clock=time*flight.y;
      vec2 shift;
      if(kind<.5){
        shift=vec2(sin(clock+phase)*flight.x,cos(clock*.73+phase)*flight.x*.68);
        shift+=vec2(sin(clock*2.13+phase),cos(clock*1.67-phase))*.22;
      }else{
        shift=vec2(sin(clock+phase)*flight.x,cos(clock*.81+phase)*flight.x*.70);
        shift+=vec2(sin(clock*1.83-phase),cos(clock*1.53+phase))*.10;
      }
      float bob=kind<.5?sin(clock*1.7+phase)*.60+sin(clock*3.3-phase)*.16:
        sin(clock*.89+phase)*.31+cos(clock*1.91-phase)*.12;
      return origin.xyz+vec3(shift.x,bob,shift.y);
    }
    void finishVertex(vec4 eye){
      vSeed=origin.w;vKind=traits.x;
      vFade=smoothstep(3.0,10.0,-eye.z)*(1.0-smoothstep(145.0,240.0,-eye.z));
      gl_Position=projectionMatrix*eye;
    }
  `;
  const butterflyVertex=`
    ${flightVertex}
    attribute float part;
    void main(){
      vLocal=uv;vPart=part;
      float phase=origin.w*6.2831853,clock=time*flight.y;
      vec3 centre=flightCentre(0.0);
      vec4 centreEye=modelViewMatrix*vec4(centre,1.0);
      vec2 velocity=vec2(cos(clock+phase),-.73*sin(clock*.73+phase)*.68);
      float heading=atan(velocity.x,velocity.y)+sin(clock*.6+phase)*.16;
      vec3 forward=vec3(sin(heading),0.0,cos(heading));
      vec3 right=vec3(cos(heading),0.0,-sin(heading));
      // Both wings rotate around their own roots. This is real world-space
      // folding, so a side view sees a different silhouette from a top view.
      float flap=.15+1.11*(.5+.5*sin(time*traits.z+phase));
      float bank=sin(clock+phase)*.17;
      vec3 offset;
      if(abs(part)>.5){
        float angle=flap+part*bank;
        offset=right*(part*position.x*cos(angle))+vec3(0.0,position.x*sin(angle),0.0)
          +forward*position.y*.78;
      }else{
        offset=right*position.x+forward*position.y*.78;
      }
      // Keep foreground butterflies as small accents even when optical zoom
      // brings a bed close to the camera. A view-angle cap also keeps wings
      // from turning into large screen-facing motifs at the near plane.
      float visibleSize=min(traits.y,max(0.0,-centreEye.z)*.032/max(.1,projectionMatrix[1][1]));
      offset*=visibleSize;
      finishVertex(modelViewMatrix*vec4(centre+offset,1.0));
      vFade*=smoothstep(8.0,18.0,-centreEye.z);
    }
  `;
  const fireflyVertex=`
    ${flightVertex}
    void main(){
      vLocal=position.xy;vPart=0.0;
      vec4 eye=modelViewMatrix*vec4(flightCentre(1.0),1.0);
      eye.xy+=position.xy*traits.y;
      finishVertex(eye);
    }
  `;
  const commonFragment=`
    uniform float opacity,time,night,twilight;
    varying vec2 vLocal;varying float vSeed,vKind,vFade,vPart;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float ellipse(vec2 p,vec2 centre,vec2 radius){
      return 1.0-smoothstep(.80,1.0,length((p-centre)/radius));
    }
  `;
  const butterflyFragment=`
    ${commonFragment}
    void main(){
      vec2 p=vLocal;float coverage;vec3 pigment;
      if(abs(vPart)<.5){
        coverage=ellipse(p,vec2(0.0,-.04),vec2(.85,.83));
        pigment=vec3(.055,.045,.025);
      }else{
        float upper,lower;
        if(vKind<.5){
          upper=ellipse(p,vec2(.46,.30),vec2(.50,.62));
          lower=ellipse(p,vec2(.33,-.43),vec2(.34,.43));
          pigment=mix(vec3(.96,.91,.81),vec3(.91,.61,.68),vSeed*.30);
        }else if(vKind<1.5){
          upper=ellipse(p,vec2(.43,.32),vec2(.53,.62));
          lower=ellipse(p,vec2(.29,-.40),vec2(.30,.44));
          lower=max(lower,ellipse(p,vec2(.36,-.75),vec2(.07,.23)));
          pigment=vec3(.95,.73,.19);
        }else{
          vec2 scallop=p+vec2(sin(p.y*20.0)*.022,0.0);
          upper=ellipse(scallop,vec2(.45,.29),vec2(.50,.63));
          lower=ellipse(scallop,vec2(.32,-.42),vec2(.33,.43));
          pigment=vec3(.23,.63,.80);
        }
        coverage=max(upper,lower);
        float edge=1.0-smoothstep(.35,.88,coverage);
        float vein=pow(.5+.5*sin(atan(p.y+.13,max(.02,p.x))*9.0+vSeed),16.0)
          *smoothstep(.10,.27,p.x);
        pigment=mix(pigment,vec3(.12,.12,.09),edge*.62+vein*.13);
        float eyeSpot=ellipse(p,vec2(.62,.38),vec2(.085,.13));
        float lowerSpot=ellipse(p,vec2(.40,-.43),vec2(.065,.09));
        pigment=mix(pigment,vec3(.14,.16,.15),eyeSpot*(vKind<.5?.64:.86)+lowerSpot*.55);
        if(vKind>1.5){
          float pale=ellipse(p,vec2(.56,.43),vec2(.028,.05));
          pigment=mix(pigment,vec3(.91,.90,.76),pale*.9);
        }
      }
      pigment=mix(pigment,pigment*vec3(1.10,.79,.61),twilight*.48);
      pigment=mix(pigment,pigment*vec3(.27,.37,.54),night);
      float grain=.86+.14*hash(floor(p*44.0+vSeed*27.0));
      float alpha=coverage*opacity*vFade*grain;
      if(alpha<.004)discard;
      gl_FragColor=vec4(pigment,alpha);
      #include <colorspace_fragment>
    }
  `;
  const fireflyFragment=`
    ${commonFragment}
    void main(){
      float radius=dot(vLocal,vLocal);
      float phase=vSeed*39.0;
      float pulse=pow(.5+.5*sin(time*(.85+vSeed*.90)+phase),4.0);
      pulse*=.70+.30*(.5+.5*sin(time*.31+phase));
      float core=exp(-radius*47.0),halo=exp(-radius*5.8)*(1.0-smoothstep(.65,1.0,radius));
      float alpha=(core*.96+halo*.22)*(.12+.88*pulse)*opacity*vFade;
      if(alpha<.003)discard;
      vec3 colour=mix(vec3(.55,.82,.075),vec3(1.0,.95,.38),core);
      colour=mix(colour,vec3(.95,.70,.12),vSeed*.22);
      gl_FragColor=vec4(colour,alpha);
      #include <colorspace_fragment>
    }
  `;

  function createLayer(name,sites,count){
    const butterfly=name==='butterflies',geometry=new THREE.InstancedBufferGeometry();
    if(butterfly){
      const positions=[],uvs=[],parts=[],indices=[];
      for(const side of [-1,1,0]){
        const base=positions.length/3;
        const corners=side===0?[[-.10,-.82],[.10,-.82],[.10,.86],[-.10,.86]]:[[0,-1],[1,-1],[1,1],[0,1]];
        corners.forEach(([x,y])=>{positions.push(x,y,0);uvs.push(side===0?x/.10:x,y);parts.push(side);});
        indices.push(base,base+1,base+2,base,base+2,base+3);
      }
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
      geometry.setAttribute('part',new THREE.Float32BufferAttribute(parts,1));geometry.setIndex(indices);
    }else{
      geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));
      geometry.setIndex([0,1,2,0,2,3]);
    }
    const countActual=sites.length?count:0;
    geometry.instanceCount=countActual;
    const origins=new Float32Array(countActual*4),flights=new Float32Array(countActual*4),traits=new Float32Array(countActual*4);
    const frontLeft=sites.filter(p=>p.x<0&&p.z>12&&p.z<63);
    const frontRight=sites.filter(p=>p.x>0&&p.z>12&&p.z<63);
    for(let i=0;i<countActual;i++){
      const foreground=i<countActual*.65;
      let pool=foreground?(i%2?frontLeft:frontRight):sites;
      if(!pool.length)pool=sites;
      const plant=pool[Math.floor(random()*pool.length)];
      const radius=butterfly?range(1.35,2.7):range(.38,1.05);
      let floor=groundHeight(plant.x,plant.z);
      for(let j=0;j<8;j++)floor=Math.max(floor,groundHeight(plant.x+Math.cos(j*Math.PI/4)*(radius+.3),plant.z+Math.sin(j*Math.PI/4)*(radius+.3)));
      const height=butterfly?range(3.4,7.0):range(1.35,3.6);
      origins.set([plant.x,floor+height,plant.z,random()],i*4);
      flights.set([radius,butterfly?range(.37,.71):range(.24,.54),height,random()],i*4);
      traits.set([butterfly?i%3:0,butterfly?range(.42,.70):range(.28,.43),butterfly?range(12,19):range(.8,1.6),random()],i*4);
    }
    geometry.setAttribute('origin',new THREE.InstancedBufferAttribute(origins,4));
    geometry.setAttribute('flight',new THREE.InstancedBufferAttribute(flights,4));
    geometry.setAttribute('traits',new THREE.InstancedBufferAttribute(traits,4));
    const uniforms={time:{value:0},opacity:{value:0},night:{value:0},twilight:{value:0}};
    const material=new THREE.ShaderMaterial({name:`Seasonal ${name}`,uniforms,
      vertexShader:butterfly?butterflyVertex:fireflyVertex,fragmentShader:butterfly?butterflyFragment:fireflyFragment,
      transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true});
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`GPU ${name}`;mesh.frustumCulled=false;mesh.visible=false;mesh.renderOrder=butterfly?5.5:6.5;
    group.add(mesh);layers.push({name,mesh,geometry,material,uniforms});
  }
  createLayer('butterflies',butterflySites,COUNTS.butterflies);
  createLayer('fireflies',fireflySites,COUNTS.fireflies);
  return{
    group,
    update(state,dayState,time,strength,opacity=1){
      const alpha=clamp01(strength)*clamp01(opacity),night=clamp01(dayState?.night),rain=clamp01(state?.rain);
      const butterflyAmount=clamp01(clamp01(state?.spring)+clamp01(state?.summer))
        *(1-THREE.MathUtils.smoothstep(night,.25,.85))*(1-rain*.92);
      const fireflyAmount=clamp01(state?.summer)*THREE.MathUtils.smoothstep(night,.28,.85)*(1-rain*.86);
      group.visible=false;
      for(const layer of layers){
        const amount=layer.name==='butterflies'?butterflyAmount:fireflyAmount;
        layer.uniforms.time.value=Number.isFinite(time)?time:0;
        layer.uniforms.opacity.value=alpha*amount;layer.uniforms.night.value=night;
        layer.uniforms.twilight.value=Math.max(clamp01(dayState?.sunset),clamp01(dayState?.dawn)*.65);
        layer.mesh.visible=alpha*amount>.002&&layer.geometry.instanceCount>0;
        group.visible=group.visible||layer.mesh.visible;
      }
    },
    dispose(){for(const layer of layers){layer.geometry.dispose();layer.material.dispose();}}
  };
}
