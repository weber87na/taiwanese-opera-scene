import * as THREE from './vendor/three.module.js';

const COUNTS={rain:1600,snow:650,leaves:180,ripples:120};
const clamp01=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));

/** Fixed world-space particle fields. Only shader uniforms change per frame;
 * the existing terrain/building depth pass provides occlusion in every view.
 */
export function createWeatherParticles(groundHeight){
  if(typeof groundHeight!=='function')throw new TypeError('Weather requires a ground-height sampler.');
  const group=new THREE.Group();group.name='Ink rain snow leaves and rain ripples';group.visible=false;
  group.userData.particleCounts={...COUNTS};
  group.userData.shapeNames={snow:['powder','fluff','stellar','dendrite'],leaves:['willow','ovate','ginkgo','maple']};
  let seed=20261109;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const range=(a,b)=>a+(b-a)*random();
  const layers=[];
  const commonVertex=`
    attribute vec4 origin,particle,groundPatch;
    uniform float time,intensity,wind;
    varying vec2 vLocal;varying float vAlpha,vSeed,vAge;
    float groundAt(vec2 shift){
      vec2 t=clamp(shift/16.0+.5,0.0,1.0);
      return mix(mix(groundPatch.x,groundPatch.y,t.x),mix(groundPatch.z,groundPatch.w,t.x),t.y);
    }
  `;
  const fallingVertex=`
    ${commonVertex}
    attribute vec4 variation;varying vec4 vVariation;
    uniform float kind;
    void main(){
      vLocal=position.xy;vSeed=origin.w;vVariation=variation;
      float span=kind<.5?76.0:kind<1.5?64.0:42.0;
      float age=fract(time*particle.y/span+particle.x);vAge=age;
      float phase=origin.w*6.2831853;
      vec2 shift;
      if(kind<.5){
        shift=vec2((age-.5)*(2.0+wind*8.0),sin(time*.3+phase)*.3);
      }else if(kind<1.5){
        float swayRate=.28+variation.w*.65,swayWidth=.65+variation.y*2.2;
        shift=vec2(sin(time*swayRate+phase)*swayWidth+(age-.5)*wind*7.0,
          cos(time*swayRate*.71+phase)*(.6+variation.z*1.5));
      }else{
        float swayRate=.32+variation.w*.92,swayWidth=1.2+variation.y*3.0;
        shift=vec2(sin(time*swayRate+phase)*swayWidth+(age-.5)*(3.0+wind*8.0),
          cos(time*swayRate*.73+phase)*(.7+variation.z*2.2));
      }
      vec3 center=vec3(origin.x+shift.x,groundAt(shift)+.4+span*(1.0-age),origin.z+shift.y);
      vec4 eye=modelViewMatrix*vec4(center,1.0);
      vec2 offset;
      if(kind<.5){
        vec2 fall=(viewMatrix*vec4((2.0+wind*8.0)/span,-1.0,0.0,0.0)).xy;
        fall=length(fall)>.001?normalize(fall):vec2(0.0,-1.0);
        vec2 side=vec2(-fall.y,fall.x);
        // Preserve a thin readable stroke at middle/far distances without
        // making the close drops wider or extending their original length.
        float halfWidth=max(.025+.018*particle.z,max(0.0,-eye.z)*.00065);
        offset=side*position.x*halfWidth+fall*position.y*(.55+.55*particle.z);
      }else if(kind<1.5){
        float rate=(.10+variation.z*.62)*(variation.y<.5?-1.0:1.0);
        float turn=time*rate+phase,c=cos(turn),s=sin(turn);
        float size=variation.x<.5?.10+.13*particle.z:variation.x<1.5?.20+.19*particle.z:.27+.23*particle.z;
        size=min(size,max(0.0,-eye.z)*.0075);
        vec2 aspect=vec2(.84+variation.y*.30,1.0);
        offset=mat2(c,-s,s,c)*position.xy*aspect*size;
      }else{
        float rate=(.25+variation.z*1.15)*(variation.y<.5?-1.0:1.0);
        float turn=time*rate+phase+sin(time*(.35+variation.w)*.7+phase)*.28,c=cos(turn),s=sin(turn);
        float fold=.28+.72*abs(cos(time*(.60+variation.w*1.7)+phase));
        vec2 local=position.xy*vec2(fold,1.0);
        vec2 size=variation.x<.5?vec2(.32,.72):variation.x<1.5?vec2(.56,.65):variation.x<2.5?vec2(.66,.61):vec2(.67,.70);
        size*=.65+.75*particle.z;size.x*=.82+variation.y*.36;
        size=min(size,vec2(max(0.0,-eye.z)*.012));
        offset=mat2(c,-s,s,c)*local*size;
      }
      eye.xy+=offset;
      gl_Position=projectionMatrix*eye;
      // Fade before recycling at the top/bottom, and suppress giant particles
      // crossing the near plane when the camera moves through this volume.
      float edge=kind<.5?smoothstep(0.0,.025,age)*(1.0-smoothstep(.97,1.0,age)):
        smoothstep(0.0,.055,age)*(1.0-smoothstep(.92,1.0,age));
      float density=smoothstep(particle.w-.055,particle.w+.055,intensity);
      vAlpha=edge*density*smoothstep(5.0,14.0,-eye.z)*(1.0-smoothstep(230.0,340.0,-eye.z));
    }
  `;
  const fallingFragment=`
    uniform float kind,opacity,night,twilight;
    varying vec4 vVariation;
    varying vec2 vLocal;varying float vAlpha,vSeed,vAge;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float inkSegment(vec2 p,vec2 a,vec2 b,float width){
      vec2 edge=b-a;float t=clamp(dot(p-a,edge)/max(.0001,dot(edge,edge)),0.0,1.0);
      return 1.0-smoothstep(width,width+.035,length(p-a-edge*t));
    }
    void main(){
      vec2 q=vLocal;float coverage;vec3 pigment;
      if(kind<.5){
        coverage=(1.0-smoothstep(.15,1.0,abs(q.x)))*(1.0-smoothstep(.30,1.0,abs(q.y)));
        coverage*=.40+.045*night;
        pigment=mix(vec3(.46,.60,.68),vec3(.36,.50,.67),night);
        pigment=mix(pigment,vec3(.58,.43,.32),twilight*.18);
      }else if(kind<1.5){
        float radius=length(q),angle=atan(q.y,q.x);
        float form=vVariation.x;
        if(form<.5){
          // Fine airborne powder: small, soft and uneven, without radial arms.
          float rim=.56+.065*sin(angle*5.0+vSeed*20.0);
          coverage=(1.0-smoothstep(.12,rim,radius))*.72;
        }else if(form<1.5){
          // Snow caught in loose, irregular clusters of several small flakes.
          float a=1.0-smoothstep(.17,.49,length(q-vec2(-.23,.13)));
          float b=1.0-smoothstep(.16,.46,length(q-vec2(.20,.23)));
          float c=1.0-smoothstep(.15,.43,length(q-vec2(.17,-.22)));
          float d=1.0-smoothstep(.12,.40,length(q-vec2(-.18,-.25)));
          coverage=max(max(a,b),max(c,d))*.78;
        }else{
          // Distinct simple six-arm stars and branched dendritic ice crystals.
          float crystal=1.0-smoothstep(.10,.20,radius);
          for(int arm=0;arm<6;arm++){
            float theta=float(arm)*1.04719755;
            vec2 direction=vec2(cos(theta),sin(theta)),side=vec2(-direction.y,direction.x);
            crystal=max(crystal,inkSegment(q,vec2(0.0),direction*.86,form<2.5?.078:.044));
            if(form>2.5){
              crystal=max(crystal,inkSegment(q,direction*.38,direction*.63+side*.20,.040));
              crystal=max(crystal,inkSegment(q,direction*.38,direction*.63-side*.20,.040));
              crystal=max(crystal,inkSegment(q,direction*.62,direction*.79+side*.13,.032));
              crystal=max(crystal,inkSegment(q,direction*.62,direction*.79-side*.13,.032));
            }
          }
          coverage=crystal*(form<2.5?.76:.70);
        }
        pigment=mix(vec3(.88,.92,.93),vec3(.43,.57,.76),night);
        pigment=mix(pigment,vec3(.93,.71,.50),twilight*.3);
      }else{
        float form=vVariation.x,leaf=0.0,veins=0.0;
        float stalk=inkSegment(q,vec2(0.0,-.95),vec2(0.0,-.53),.022);
        if(form<.5){
          // Willow: long taper with many short, oblique side veins.
          float halfWidth=.37*pow(max(0.0,1.0-q.y*q.y),.80);
          halfWidth*=.96+.04*sin(q.y*13.0+vSeed*20.0);
          leaf=(1.0-smoothstep(max(0.0,halfWidth-.055),halfWidth+.012,abs(q.x)))*(1.0-smoothstep(.88,.97,abs(q.y)));
          veins=inkSegment(q,vec2(0.0,-.86),vec2(.015,.85),.016);
          for(int vein=0;vein<4;vein++){
            float y=float(vein)*.36-.60;
            veins=max(veins,inkSegment(q,vec2(0.0,y),vec2(.30,y+.20),.009));
            veins=max(veins,inkSegment(q,vec2(0.0,y+.06),vec2(-.30,y+.24),.009));
          }
        }else if(form<1.5){
          // Broad ovate leaf: rounded shoulders, a pointed tip, branching veins.
          float ovalY=(q.y+.04)/.90;
          float halfWidth=.76*sqrt(max(0.0,1.0-ovalY*ovalY))*(.91-.23*q.y);
          halfWidth*=.97+.03*sin(q.y*22.0+vSeed*17.0);
          leaf=1.0-smoothstep(max(0.0,halfWidth-.07),halfWidth+.015,abs(q.x));
          leaf*=1.0-smoothstep(.84,.94,abs(q.y));
          veins=inkSegment(q,vec2(0.0,-.83),vec2(0.0,.84),.022);
          for(int vein=0;vein<3;vein++){
            float y=float(vein)*.42-.53;
            veins=max(veins,inkSegment(q,vec2(0.0,y),vec2(.60,y+.31),.014));
            veins=max(veins,inkSegment(q,vec2(0.0,y+.04),vec2(-.60,y+.34),.014));
          }
        }else if(form<2.5){
          // Ginkgo: a notched fan, with veins radiating from the narrow stem.
          vec2 fan=q-vec2(0.0,-.61);float radius=length(fan),angle=atan(fan.x,fan.y);
          float rim=1.20-.13*exp(-angle*angle/.024)+.025*sin(angle*17.0+vSeed*8.0);
          leaf=(1.0-smoothstep(rim-.055,rim+.018,radius))*(1.0-smoothstep(.86,.94,abs(angle)))*smoothstep(.06,.17,radius);
          veins=(1.0-smoothstep(.035,.13,abs(sin(angle*17.0))))*smoothstep(.10,.28,radius);
        }else{
          // Maple/palm: five deep lobes, serrated edges and five primary veins.
          vec2 palm=q-vec2(0.0,-.02);float radius=length(palm),angle=atan(palm.y,palm.x);
          float lobes=pow(max(0.0,cos(5.0*(angle-1.57079633))),2.3);
          float rim=.43+.40*lobes+.025*sin(angle*19.0+vSeed*13.0);
          leaf=1.0-smoothstep(rim-.055,rim+.015,radius);
          for(int vein=0;vein<5;vein++){
            float theta=float(vein)*1.25663706+1.57079633;
            veins=max(veins,inkSegment(q,vec2(0.0,-.11),vec2(cos(theta),sin(theta))*.75,.018));
          }
        }
        coverage=max(leaf,stalk)*.91;
        float hue=vVariation.y;
        pigment=hue<.25?vec3(.71,.41,.045):hue<.50?vec3(.64,.20,.018):hue<.75?vec3(.41,.060,.014):vec3(.25,.105,.025);
        pigment*=.83+.17*vSeed;
        pigment*=1.0-veins*leaf*.43;
        pigment=mix(pigment,pigment*vec3(.48,.60,.79)+vec3(.012,.018,.025),night);
      }
      float tooth=.82+.18*hash(floor(gl_FragCoord.xy));
      float alpha=coverage*vAlpha*opacity*tooth;
      if(alpha<.003)discard;
      gl_FragColor=vec4(pigment,alpha);
      #include <colorspace_fragment>
    }
  `;
  const rippleVertex=`
    ${commonVertex}
    void main(){
      float age=fract(time*(.7+particle.y*.02)+particle.x);vAge=age;vSeed=origin.w;vLocal=position.xy;
      float radius=(.16+age*.84)*(.50+particle.z*.65);
      vec2 shift=position.xy*radius;
      vec3 center=vec3(origin.x+shift.x,origin.y+.38+dot(shift,groundPatch.xy),origin.z+shift.y);
      vec4 eye=modelViewMatrix*vec4(center,1.0);gl_Position=projectionMatrix*eye;
      vAlpha=smoothstep(0.0,.10,age)*(1.0-smoothstep(.38,1.0,age));
      vAlpha*=smoothstep(particle.w-.07,particle.w+.07,intensity)*smoothstep(5.0,13.0,-eye.z);
    }
  `;
  const rippleFragment=`
    uniform float opacity,night,twilight;
    varying vec2 vLocal;varying float vAlpha,vSeed,vAge;
    void main(){
      float radius=length(vLocal),angle=atan(vLocal.y,vLocal.x);
      float wobble=sin(angle*7.0+vSeed*21.0)*.018;
      float ring=1.0-smoothstep(.035,.09,abs(radius-.78+wobble));
      ring+=.36*(1.0-smoothstep(.025,.065,abs(radius-.49+wobble)));
      float broken=.65+.35*sin(angle*4.0+vSeed*19.0);
      float alpha=ring*broken*vAlpha*opacity*.40;
      if(alpha<.003)discard;
      vec3 pigment=mix(vec3(.36,.50,.56),vec3(.29,.44,.63),night);
      pigment=mix(pigment,vec3(.56,.30,.13),twilight*.4);
      gl_FragColor=vec4(pigment,alpha);
      #include <colorspace_fragment>
    }
  `;

  function createLayer(name,count,kind){
    const geometry=new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));
    geometry.setIndex([0,1,2,0,2,3]);geometry.instanceCount=count;
    const origins=new Float32Array(count*4),particles=new Float32Array(count*4),patches=new Float32Array(count*4),variations=new Float32Array(count*4);
    const ripple=kind===3;
    for(let i=0;i<count;i++){
      const core=random()<.82;
      let x=range(core?-110:-170,core?110:170),z=range(core?-125:-200,core?125:200);
      let ground=groundHeight(x,z),dx=0,dz=0;
      if(ripple){
        for(let attempt=0;attempt<8;attempt++){
          dx=groundHeight(x+.5,z)-groundHeight(x-.5,z);dz=groundHeight(x,z+.5)-groundHeight(x,z-.5);
          if(Math.hypot(dx,dz)<.45)break;
          x=range(-90,90);z=range(-100,100);ground=groundHeight(x,z);
        }
        dx=groundHeight(x+.5,z)-groundHeight(x-.5,z);dz=groundHeight(x,z+.5)-groundHeight(x,z-.5);
        patches.set([dx,dz,0,0],i*4);
      }else{
        patches.set([groundHeight(x-8,z-8),groundHeight(x+8,z-8),groundHeight(x-8,z+8),groundHeight(x+8,z+8)],i*4);
      }
      origins.set([x,ground,z,random()],i*4);
      const speed=kind===0?range(23,36):kind===1?range(1.3,2.5):kind===2?range(2.0,3.7):range(0,1);
      particles.set([random(),speed,range(.2,1),range(.055,.945)],i*4);
      // Independent deterministic variation leaves the rain/ripple seeds and
      // positions untouched, and guarantees all four silhouettes are present.
      const varied=n=>{const value=Math.sin((i+1)*78.233+kind*19.17+n*37.71)*43758.5453;return value-Math.floor(value);};
      variations.set([i%4,varied(1),varied(2),varied(3)],i*4);
    }
    geometry.setAttribute('origin',new THREE.InstancedBufferAttribute(origins,4));
    geometry.setAttribute('particle',new THREE.InstancedBufferAttribute(particles,4));
    geometry.setAttribute('groundPatch',new THREE.InstancedBufferAttribute(patches,4));
    geometry.setAttribute('variation',new THREE.InstancedBufferAttribute(variations,4));
    const uniforms={time:{value:0},intensity:{value:0},wind:{value:0},kind:{value:kind},opacity:{value:0},night:{value:0},twilight:{value:0}};
    const material=new THREE.ShaderMaterial({name:`Watercolour ${name}`,uniforms,
      vertexShader:ripple?rippleVertex:fallingVertex,fragmentShader:ripple?rippleFragment:fallingFragment,
      transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true});
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`GPU ${name}`;mesh.frustumCulled=false;mesh.renderOrder=ripple?5:6;
    mesh.visible=false;group.add(mesh);layers.push({name,mesh,geometry,material,uniforms});
  }
  createLayer('rain',COUNTS.rain,0);createLayer('snow',COUNTS.snow,1);
  createLayer('leaves',COUNTS.leaves,2);createLayer('ripples',COUNTS.ripples,3);
  return{
    group,
    update(state,dayState,time,strength,opacity=1){
      const alpha=clamp01(strength)*clamp01(opacity),night=clamp01(dayState?.night);
      const twilight=Math.max(clamp01(dayState?.sunset),clamp01(dayState?.dawn)*.65);
      group.visible=alpha>.001&&(state.rain>.001||state.snow>.001||state.leaves>.001);
      for(const layer of layers){
        const density=clamp01(layer.name==='ripples'?state.rain:state[layer.name]);
        const uniforms=layer.uniforms;
        uniforms.time.value=Number.isFinite(time)?time:0;
        uniforms.intensity.value=density;uniforms.wind.value=clamp01(state.wind);
        uniforms.opacity.value=alpha*Math.sqrt(density);uniforms.night.value=night;uniforms.twilight.value=twilight;
        layer.mesh.visible=alpha>.001&&density>.001;
      }
    },
    dispose(){for(const layer of layers){layer.geometry.dispose();layer.material.dispose();}},
  };
}
