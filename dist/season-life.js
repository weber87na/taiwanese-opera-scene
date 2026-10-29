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
      float wingBias=part*(.12+origin.w*.09);
      float flap=.15+1.11*(.5+.5*sin(time*traits.z+phase+wingBias));
      float bank=sin(clock+phase)*.17;
      vec3 offset;
      if(abs(part)>.5){
        float angle=flap+part*bank+wingBias*.35;
        float span=position.x*(.91+part*(origin.w-.5)*.13);
        offset=right*(part*span*cos(angle))+vec3(0.0,span*sin(angle),0.0)
          +forward*(position.y*.78+position.x*wingBias*.24);
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
    float inkNoise(vec2 p){
      vec2 cell=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
      return mix(mix(hash(cell),hash(cell+vec2(1.0,0.0)),f.x),
        mix(hash(cell+vec2(0.0,1.0)),hash(cell+1.0),f.x),f.y);
    }
  `;
  const butterflyFragment=`
    ${commonFragment}
    float washNoise(vec2 p){
      return inkNoise(p)*.58+inkNoise(p*2.13+8.7)*.28+inkNoise(p*4.31-3.4)*.14;
    }
    float draggedBrush(vec2 p,vec2 root,vec2 tip,float width,float bend,float edgeWarp){
      vec2 axis=tip-root;float reach=length(axis);axis/=reach;
      vec2 delta=p-root;
      float t=dot(delta,axis)/reach;
      float side=dot(delta,vec2(-axis.y,axis.x));
      float along=clamp(t,0.0,1.0);
      float pressure=pow(max(.001,sin(along*3.14159)),.55)*(.53+.47*along);
      float centre=sin(along*3.14159)*bend+sin(along*6.2)*bend*.27;
      side-=centre;
      float edge=abs(side)-width*pressure*(1.0+side*.75);
      return max(edge,max(-t,t-1.0)*reach)+edgeWarp;
    }
    void main(){
      vec2 p=vLocal;float coverage;vec3 pigment;
      float seed=hash(vec2(vSeed*47.0+vPart*13.17,3.71));
      float wet=washNoise(p*4.0+seed*37.0);
      float water=washNoise(p*8.3+vec2(seed*19.0,14.6));
      float aa=max(.008,length(fwidth(p))*.65);
      if(abs(vPart)<.5){
        p.x*=1.6;
        float bend=.23*sin(p.y*3.7+vSeed*7.0)+.075*sin(p.y*8.3+vSeed*17.0);
        float width=(.29+.16*inkNoise(vec2(p.y*5.0,vSeed*27.0)))
          *pow(max(.0,1.0-pow((p.y+.045)/.41,2.0)),.72);
        float edge=max(abs(p.x-bend)-width,abs(p.y+.045)-.41)+(water-.5)*.13;
        float loaded=1.0-smoothstep(-.08,.13+aa,edge);
        float seep=1.0-smoothstep(.0,.26+aa,edge);
        coverage=(loaded*.86+seep*(1.0-loaded)*.23)*(.74+.26*wet);
        coverage*=1.0-smoothstep(.37,.47,abs(p.y+.045));
        float headX=.23*sin(.35*3.7+vSeed*7.0)+.075*sin(.35*8.3+vSeed*17.0);
        float head=1.0-smoothstep(.48,1.19,length((p-vec2(headX,.36))/vec2(.24,.072))+(water-.5)*.25);
        float t=clamp((p.y-.38)/.26,0.0,1.0);
        float antenna=0.0;
        for(int side=-1;side<=1;side+=2){
          float turn=float(side);
          float curve=headX+turn*(.08+t*t*.69)+sin(t*3.14159)*.09;
          float line=1.0-smoothstep(.018,.047+aa*.30,abs(p.x-curve));
          antenna=max(antenna,line*smoothstep(.38,.42,p.y)*(1.0-smoothstep(.59,.66,p.y)));
        }
        coverage=max(coverage,max(head*.85,antenna*.29));
        pigment=mix(vec3(.035,.040,.032),vec3(.24,.22,.17),water*.65);
        pigment=mix(pigment,vec3(.025,.035,.03),head*.6);
      }else{
        vec2 seep=vec2(wet-.5,water-.5)*.14;
        float edgeWarp=(wet-.5)*.11+(water-.5)*.055;
        coverage=0.0;float loadedInk=0.0,pooledInk=0.0,liftedPaper=0.0;
        // A wing is suggested by loose overlapping brush drags, not bounded
        // by one closed outline. Each side has different strokes and ink load.
        for(int i=0;i<5;i++){
          float n=float(i);
          float a=hash(vec2(seed*71.0,n+3.0));
          float b=hash(vec2(seed*113.0,n+9.0));
          float upper=1.0-step(1.5,n);
          vec2 root=vec2(.015+b*.075,-.10+a*.14);
          vec2 tip=vec2(.46+a*.28,mix(-.28-b*.43,.35+b*.43,upper));
          float width=mix(.13,.17,upper)+b*.13;
          if(vKind<.5){width*=1.17;tip.y*=.88;}
          if(vKind>1.5){tip.x+=.045;tip.y*=.94;}
          if(i==1||i==3){tip.x*=.77;tip.y*=.86;width*=.81;}
          if(i==4){tip=vec2(.42+a*.15,-.05+b*.18);width=.10+b*.07;}
          float localWater=inkNoise((p+seep)*6.0+vec2(n*4.31,seed*41.0));
          float edge=draggedBrush(p+seep,root,tip,width,(a-.5)*.22,edgeWarp+(localWater-.5)*.045);
          float body=1.0-smoothstep(-.035-aa,.035+b*.037+aa,edge);
          float bloom=(1.0-smoothstep(.015,.15+aa,edge))*.19;
          float lift=smoothstep(.47,.76,localWater)*smoothstep(.30,.72,wet);
          float load=.64+a*.29;
          if(i==1||i==3)load*=.64;
          float drag=body*load*(1.0-lift*.66)+bloom*(1.0-body);
          coverage=1.0-(1.0-coverage)*(1.0-drag);
          loadedInk+=body*(.21+a*.33)*(1.0-lift*.76);
          pooledInk+=body*smoothstep(-.09,.055,edge)*smoothstep(.32,.66,localWater)*.45;
          liftedPaper=max(liftedPaper,lift*body);
        }
        if(vKind>.5&&vKind<1.5){
          float edge=draggedBrush(p+seep*.35,vec2(.25,-.28),vec2(.31+seed*.12,-.76-seed*.12),.035,-.07,edgeWarp*.26);
          float tail=1.0-smoothstep(-.014,.042+aa,edge);
          coverage=1.0-(1.0-coverage)*(1.0-tail*.57);loadedInk+=tail*.25;
        }
        vec3 tint=vec3(.68,.68,.62);
        if(vKind>.5)tint=vec3(.68,.48,.22);
        if(vKind>1.5)tint=vec3(.22,.40,.44);
        float rootInk=(1.0-smoothstep(.07,.36,p.x))*(.42+.58*water);
        float density=clamp(loadedInk*.74+pooledInk*.58+rootInk*.26,0.0,.91);
        pigment=mix(mix(tint,vec3(.96,.92,.82),.24),vec3(.075,.11,.105)+tint*.17,density);
        pigment=mix(pigment,vec3(.94,.91,.83),liftedPaper*.42);
      }
      pigment=mix(pigment,pigment*vec3(1.10,.79,.61),twilight*.48);
      pigment=mix(pigment,pigment*vec3(.27,.37,.54),night);
      float grain=.97+.03*inkNoise(p*37.0+vSeed*27.0);
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
        const corners=side===0?[[-.16,-.82],[.16,-.82],[.16,.86],[-.16,.86]]:[[0,-1],[1,-1],[1,1],[0,1]];
        corners.forEach(([x,y])=>{positions.push(x,y,0);uvs.push(side===0?x/.16:x,y);parts.push(side);});
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
