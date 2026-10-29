import * as THREE from './vendor/three.module.js';
import {isRiverPoint,riverHeight} from './river-layout.js';

const COUNTS={rain:1600,snow:650,leaves:180,ripples:120};
const clamp01=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));

/** Fixed world-space particle fields. Only shader uniforms change per frame;
 * the existing terrain/building depth pass provides occlusion in every view.
 */
export function createWeatherParticles(groundHeight){
  if(typeof groundHeight!=='function')throw new TypeError('Weather requires a ground-height sampler.');
  const group=new THREE.Group();group.name='Ink rain snow leaves and rain ripples';group.visible=false;
  group.userData.particleCounts={...COUNTS};
  group.userData.inkDropCount=COUNTS.ripples;
  group.userData.shapeNames={snow:['powder','fluff','broken-brush','thin-flake'],leaves:['willow','ovate','ginkgo','maple']};
  let seed=20261109;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const range=(a,b)=>a+(b-a)*random();
  const layers=[];
  const inkPalette=`
    vec3 colourInk(float choice){
      float index=mod(floor(choice),6.0);
      if(index<.5)return vec3(.015,.66,.78);
      if(index<1.5)return vec3(.045,.19,.92);
      if(index<2.5)return vec3(.52,.075,.83);
      if(index<3.5)return vec3(.94,.075,.035);
      if(index<4.5)return vec3(1.0,.61,.025);
      return vec3(.018,.68,.39);
    }
  `;
  const commonVertex=`
    attribute vec4 origin,particle,groundPatch;
    attribute vec2 inkTiming;
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
      // Paired ink drops reserve a separate 2.2–2.8-second soaking interval
      // after impact, instead of rushing a bloom through a fraction of a fall.
      float inkDrop=kind<.5?step(4.5,variation.x):0.0;
      float inkClock=fract(time/max(.001,inkTiming.x+inkTiming.y)+particle.x)*(inkTiming.x+inkTiming.y);
      float fallAge=mix(age,clamp(inkClock/max(.001,inkTiming.x),0.0,1.0),inkDrop);
      float phase=origin.w*6.2831853;
      vec2 shift;
      if(kind<.5){
        shift=vec2((age-.5)*(2.0+wind*8.0),sin(time*.3+phase)*.3);
        if(inkDrop>.5)shift=vec2((fallAge-1.0)*(2.0+wind*5.0),sin(phase+fallAge*3.0)*.35*(1.0-fallAge));
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
      if(inkDrop>.5){
        // Exact endpoint height avoids an interpolated terrain patch leaving
        // the drop suspended above its own splash on curved ground.
        float groundLevel=mix(groundAt(shift),origin.y,smoothstep(.72,1.0,fallAge));
        center.y=groundLevel+.4+span*(1.0-fallAge);
      }
      vec4 eye=modelViewMatrix*vec4(center,1.0);
      vec2 offset;
      if(kind<.5){
        vec2 fall=(viewMatrix*vec4((2.0+wind*mix(8.0,5.0,inkDrop))/span,-1.0,0.0,0.0)).xy;
        fall=length(fall)>.001?normalize(fall):vec2(0.0,-1.0);
        vec2 side=vec2(-fall.y,fall.x);
        // Preserve a thin readable stroke at middle/far distances without
        // making the close drops wider or extending their original length.
        float halfWidth=max(.025+.018*particle.z,max(0.0,-eye.z)*.00065);
        float halfLength=.55+.55*particle.z;
        if(inkDrop>.5){
          halfWidth=max(.1275+.15*particle.z,max(0.0,-eye.z)*.001275);
          halfWidth=min(halfWidth,max(0.0,-eye.z)*.0045);
          halfLength=min(.94+particle.z*.86,max(0.0,-eye.z)*.022);
        }
        offset=side*position.x*halfWidth+fall*position.y*halfLength;
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
      if(inkDrop>.5)edge=smoothstep(0.0,.06,inkClock)*(1.0-smoothstep(inkTiming.x-.018,inkTiming.x,inkClock));
      float density=smoothstep(particle.w-.055,particle.w+.055,intensity);
      vAlpha=edge*density*smoothstep(5.0,14.0,-eye.z)*(1.0-smoothstep(230.0,340.0,-eye.z));
    }
  `;
  const fallingFragment=`
    uniform float kind,opacity,night,twilight;
    varying vec4 vVariation;
    varying vec2 vLocal;varying float vAlpha,vSeed,vAge;
    ${inkPalette}
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float inkNoise(vec2 p){
      vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+1.0),f.x),f.y);
    }
    // A pressure-loaded curved brush stroke, not an ellipse or radial stamp.
    // Several unequal strokes make each silhouette; broad pools and torn gaps
    // alter its structure before the fine paper tooth is applied.
    float brushStroke(vec2 p,vec2 a,vec2 bend,vec2 b,float width,float seed){
      float distance=9.0;
      vec2 previous=a;
      for(int stepIndex=1;stepIndex<=5;stepIndex++){
        float t=float(stepIndex)/5.0;
        vec2 next=mix(mix(a,bend,t),mix(bend,b,t),t);
        vec2 segment=next-previous;
        float along=clamp(dot(p-previous,segment)/max(.0001,dot(segment,segment)),0.0,1.0);
        float pressureT=(float(stepIndex-1)+along)/5.0;
        float pressure=.10+.90*pow(max(.0,sin(pressureT*3.14159265)),.67);
        pressure*=.80+.28*sin(pressureT*5.3+seed*9.0);
        distance=min(distance,length(p-mix(previous,next,along))/max(.01,width*pressure));
        previous=next;
      }
      float feather=(inkNoise(p*12.0+seed*41.0)-.5)*.30;
      return 1.0-smoothstep(.66,1.24,distance+feather);
    }
    void main(){
      vec2 q=vLocal;float coverage;vec3 pigment;
      if(kind<.5){
        coverage=(1.0-smoothstep(.15,1.0,abs(q.x)))*(1.0-smoothstep(.30,1.0,abs(q.y)));
        coverage*=.40+.045*night;
        pigment=mix(vec3(.46,.60,.68),vec3(.36,.50,.67),night);
        pigment=mix(pigment,vec3(.58,.43,.32),twilight*.18);
        if(vVariation.x>4.5){
          // Loaded brush tip followed by a thinning, broken thread. Broad
          // pigment pools and feathered edges matter more than fine grain.
          float drift=(inkNoise(vec2(q.y*4.0,vSeed*39.0))-.5)*.18;
          vec2 head=vec2((q.x-drift)/(.66+.10*sin(q.y*11.0+vSeed*19.0)),(q.y-.38)/.39);
          float edgeNoise=inkNoise(q*7.0+vSeed*43.0);
          float headRadius=length(head)+(edgeNoise-.5)*.23;
          float wetHead=1.0-smoothstep(.58,1.10,headRadius);
          float wetRim=(1.0-smoothstep(.80,1.42,headRadius))*.18;
          float threadWidth=mix(.035,.28,smoothstep(-.86,.32,q.y));
          float thread=(1.0-smoothstep(threadWidth,threadWidth+.14,abs(q.x-drift)));
          thread*=smoothstep(-.96,-.72,q.y)*(1.0-smoothstep(.30,.46,q.y));
          float fibres=.72+.28*inkNoise(vec2(q.x*19.0,q.y*3.0)+vSeed*55.0);
          coverage=max(wetHead*.84+wetRim,thread*.62)*fibres;
          float pool=inkNoise(q*3.5+vSeed*17.0);
          vec3 loaded=colourInk(vSeed*6.0);
          pigment=mix(loaded*.26,loaded,.30+pool*.48);
          pigment=mix(pigment,pigment*1.16+vec3(.015,.025,.04),night*.50);
          pigment=mix(pigment,pigment*vec3(1.07,.96,.85),twilight*.18);
        }
      }else if(kind<1.5){
        float form=vVariation.x,seed=vSeed*17.0;
        vec2 p=q+vec2(inkNoise(q*2.1+seed)-.5,inkNoise(q*2.8-seed+4.7)-.5)*.29;
        float broad=inkNoise(q*3.0+seed),fibre=inkNoise(q*vec2(17.0,5.0)-seed);
        float snow=0.0;
        if(form<.5){
          // An almost dry touch leaves an uneven loose grain of white.
          snow=brushStroke(p,vec2(-.32,-.27),vec2(-.12,.29),vec2(.34,.25),.39,seed);
          snow*=.70+.30*broad;
        }else if(form<1.5){
          // Loose wet tufts merge with unequal shoulders and open gaps.
          snow=brushStroke(p,vec2(-.62,-.34),vec2(-.52,.40),vec2(.29,.63),.44,seed);
          snow=max(snow,brushStroke(p,vec2(-.18,-.67),vec2(.52,-.36),vec2(.51,.26),.32,seed+2.1)*.88);
        }else if(form<2.5){
          // A broken oblique brush drag, with broad missing paper channels.
          snow=brushStroke(p,vec2(-.58,-.66),vec2(-.49,.30),vec2(.56,.63),.37,seed);
          snow=max(snow,brushStroke(p,vec2(.02,-.46),vec2(.52,-.14),vec2(.66,.37),.15,seed+1.3)*.71);
          float gap=smoothstep(.43,.65,inkNoise(vec2(q.x*9.0+q.y*3.0,q.y*2.3)+seed));
          snow*=1.0-gap*.80;
        }else{
          // Thin torn flake: one broad slanted wash, with a pale curled edge.
          snow=brushStroke(p,vec2(-.69,-.21),vec2(-.17,.56),vec2(.64,.34),.43,seed);
          snow=max(snow,brushStroke(p,vec2(-.37,-.47),vec2(.31,-.42),vec2(.56,.24),.17,seed+3.4)*.72);
          snow*=.44+.56*smoothstep(.16,.72,broad);
        }
        coverage=snow*(.70+.21*broad)*(.80+.20*fibre);
        // Snow is reserved paper white with dilute ink caught at one edge.
        float diluteEdge=(1.0-smoothstep(.16,.80,snow))*(.45+.55*broad);
        pigment=mix(vec3(.94,.95,.93),vec3(.60,.66,.68),diluteEdge*.63);
        pigment=mix(pigment,pigment*vec3(.64,.75,.89),night*.70);
        pigment=mix(pigment,pigment*vec3(1.03,.91,.80),twilight*.24);
      }else{
        float form=vVariation.x,leaf=0.0,seed=vSeed*13.0;
        vec2 p=q+vec2(inkNoise(q*2.7+seed)-.5,inkNoise(q*2.2-seed+8.1)-.5)*.25;
        float pool=inkNoise(q*2.5+seed),fibres=inkNoise(q*vec2(13.0,3.7)+seed*7.0);
        float stalk=brushStroke(p,vec2(-.16,-.94),vec2(-.12,-.64),vec2(.02,-.37),.035,seed);
        float spine=brushStroke(p,vec2(-.11,-.77),vec2(.13,-.14),vec2(.19,.66),.032,seed+2.0);
        if(form<.5){
          // A single hooked willow stroke, one side loaded and one running dry.
          leaf=brushStroke(p,vec2(-.23,-.87),vec2(-.36,.29),vec2(.39,.87),.37,seed);
          leaf=max(leaf,brushStroke(p,vec2(-.06,-.57),vec2(.30,-.08),vec2(.22,.53),.16,seed+1.8)*.69);
        }else if(form<1.5){
          // Broad leaf assembled from two unequal sweeps, never mirrored.
          leaf=brushStroke(p,vec2(-.11,-.78),vec2(-.75,.19),vec2(.21,.79),.48,seed);
          leaf=max(leaf,brushStroke(p,vec2(-.01,-.61),vec2(.71,-.12),vec2(.21,.67),.36,seed+1.1)*.88);
        }else if(form<2.5){
          // Ginkgo suggested by a folded pair of spreading brush shoulders.
          // Their unequal tips and dry split replace a compass-drawn fan.
          leaf=brushStroke(p,vec2(-.09,-.68),vec2(-.64,.06),vec2(-.54,.64),.42,seed);
          leaf=max(leaf,brushStroke(p,vec2(-.08,-.60),vec2(.37,.05),vec2(.71,.45),.48,seed+2.5)*.90);
          leaf=max(leaf,brushStroke(p,vec2(-.12,-.49),vec2(-.03,-.01),vec2(.10,.48),.21,seed+4.2)*.74);
        }else{
          // Three expressive jagged maple lobes at unequal angles and lengths.
          leaf=brushStroke(p,vec2(-.12,-.66),vec2(-.24,.14),vec2(.16,.87),.36,seed);
          leaf=max(leaf,brushStroke(p,vec2(-.07,-.44),vec2(-.48,.14),vec2(-.83,.27),.29,seed+1.7)*.91);
          leaf=max(leaf,brushStroke(p,vec2(.01,-.42),vec2(.62,-.03),vec2(.68,.53),.33,seed+3.1)*.82);
          leaf=max(leaf,brushStroke(p,vec2(-.04,-.43),vec2(.36,-.48),vec2(.57,-.31),.16,seed+4.9)*.73);
        }
        float torn=smoothstep(.48,.73,inkNoise(q*vec2(5.5,3.1)+seed*3.0));
        float dry=smoothstep(.57,.77,fibres)*smoothstep(.08,.55,p.y+.40)*.70;
        leaf*=1.0-torn*.68-dry*.31;
        coverage=max(leaf,stalk)*(.70+.27*pool);
        float hue=vVariation.y;
        pigment=hue<.25?vec3(.71,.41,.045):hue<.50?vec3(.64,.20,.018):hue<.75?vec3(.41,.060,.014):vec3(.25,.105,.025);
        pigment=mix(pigment*.44,pigment*1.13,smoothstep(.17,.77,pool));
        float gathered=(1.0-smoothstep(.14,.76,leaf))*(.30+.70*pool);
        pigment=mix(pigment,vec3(.09,.070,.033),gathered*.47);
        pigment*=1.0-spine*(.20+.42*pool)*leaf;
        pigment=mix(pigment,pigment*vec3(.48,.60,.79)+vec3(.012,.018,.025),night);
      }
      float tooth=kind<.5&&vVariation.x<4.5?.82+.18*hash(floor(gl_FragCoord.xy)):.88+.12*hash(floor(q*41.0+vSeed*23.0));
      float alpha=coverage*vAlpha*opacity*tooth;
      if(alpha<.003)discard;
      gl_FragColor=vec4(pigment,alpha);
      #include <colorspace_fragment>
    }
  `;
  const rippleVertex=`
    ${commonVertex}
    attribute vec3 inkGround0,inkGround1,inkGround2;
    void main(){
      float cycle=fract(time/(inkTiming.x+inkTiming.y)+particle.x)*(inkTiming.x+inkTiming.y);
      float age=clamp((cycle-inkTiming.x)/inkTiming.y,0.0,1.0);vAge=age;vSeed=origin.w;vLocal=position.xy;
      // Keep the paper coordinate fixed while the pigment front moves through
      // it. The larger wash follows nine pre-sampled terrain vertices instead
      // of a large tangent-plane card that would cut into hills and banks.
      float radius=4.8+particle.z*1.7;
      vec2 shift=position.xy*radius;
      vec3 row=position.y<-.5?inkGround0:position.y>.5?inkGround2:inkGround1;
      float terrain=position.x<-.5?row.x:position.x>.5?row.z:row.y;
      vec3 center=vec3(origin.x+shift.x,terrain+.43,origin.z+shift.y);
      vec4 eye=modelViewMatrix*vec4(center,1.0);gl_Position=projectionMatrix*eye;
      vAlpha=smoothstep(0.0,.012,age)*(1.0-smoothstep(.78,1.0,age));
      vAlpha*=smoothstep(particle.w-.055,particle.w+.055,intensity)*smoothstep(5.0,14.0,-eye.z)*(1.0-smoothstep(230.0,340.0,-eye.z));
    }
  `;
  const rippleFragment=`
    uniform float opacity,night,twilight;
    varying vec2 vLocal;varying float vAlpha,vSeed,vAge;
    ${inkPalette}
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float inkNoise(vec2 p){
      vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+1.0),f.x),f.y);
    }
    void main(){
      vec2 p=vLocal;
      float seed=vSeed*31.0;
      float pool=inkNoise(p*3.9+seed),feather=inkNoise(p*15.0-seed);
      float colourPool=inkNoise(p*2.5+vec2(seed+7.0,-seed));
      float mainColour=floor(vSeed*6.0),secondColour=mainColour+1.0+floor(fract(vSeed*13.7)*4.0);
      vec3 pigment=mix(colourInk(mainColour),colourInk(secondColour),smoothstep(.27,.73,colourPool));
      vec2 warped=p+vec2(inkNoise(p*3.1+seed+2.0)-.5,inkNoise(p*2.7-seed+9.0)-.5)*.24;
      float distance=length(warped*vec2(1.0,.83));
      float spread=smoothstep(.012,.76,vAge);
      float front=.10+pow(spread,.64)*.59;
      float wetDistance=distance+(pool-.5)*.13+(feather-.5)*.046;
      float soaked=1.0-smoothstep(front-.085,front+.11,wetDistance);
      float heart=(1.0-smoothstep(.055,.23,wetDistance))*(1.0-smoothstep(.07,.53,vAge));
      float branches=0.0;
      // Unequal capillary runs creep ahead of the wash. Their bends, widths
      // and arrival times differ, so no concentric ring or radial stamp forms.
      for(int branch=0;branch<6;branch++){
        float id=float(branch),r=hash(vec2(seed,id+5.0));
        float angle=hash(vec2(id+9.0,seed+3.0))*6.2831853;
        vec2 direction=vec2(cos(angle),sin(angle)),side=vec2(-direction.y,direction.x);
        float along=dot(warped,direction),across=dot(warped,side);
        float reach=smoothstep(.012+r*.10,.46+r*.28,vAge)*(.56+r*.33);
        float bend=sin(along*(5.0+r*6.0)+r*8.0)*along*(.12+r*.14);
        float width=(.095+r*.065)*(1.0-.49*clamp(along/.90,0.0,1.0));
        float run=1.0-smoothstep(width*.42,width+.060,abs(across-bend)+(feather-.5)*.040);
        run*=smoothstep(-.02,.06,along)*(1.0-smoothstep(reach-.045,reach+.06,along));
        branches=max(branches,run*(.71+r*.27));
        vec3 streamColour=colourInk(mainColour+id+1.0);
        float mixedEdge=.64+.25*inkNoise(vec2(along*5.0,across*6.0)+seed+id*3.0);
        pigment=mix(pigment,streamColour,run*mixedEdge);
      }
      float frontDistance=(wetDistance-front+.035)/.074;
      float irregularFront=exp(-frontDistance*frontDistance)*(.12+.17*pool);
      float settled=max(soaked*(.67+.24*pool),branches*.88);
      settled*=1.0-smoothstep(.60,.98,vAge)*.36;
      float coverage=settled+heart*.57+irregularFront*(1.0-smoothstep(.72,.98,vAge));
      float alpha=min(.97,coverage*vAlpha*opacity*(.92+.08*feather));
      if(alpha<.003)discard;
      // Pigment stays saturated against the night ground. It is painted colour,
      // not additive light, and overlapping flows still mix through wet edges.
      pigment*=.72+.28*pool;
      pigment=mix(pigment,colourInk(mainColour)*.29,heart*.65);
      pigment=mix(pigment,min(vec3(1.0),pigment*1.22+vec3(.012,.020,.035)),night*.72);
      pigment=mix(pigment,pigment*vec3(1.05,.98,.90),twilight*.14);
      gl_FragColor=vec4(pigment,alpha);
      #include <colorspace_fragment>
    }
  `;

  function createLayer(name,count,kind){
    const geometry=new THREE.InstancedBufferGeometry();
    const ripple=kind===3;
    if(ripple){
      const grid=[],indices=[];
      for(let z=0;z<3;z++)for(let x=0;x<3;x++)grid.push(x-1,z-1,0);
      for(let z=0;z<2;z++)for(let x=0;x<2;x++){
        const start=z*3+x;indices.push(start,start+1,start+4,start,start+4,start+3);
      }
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(grid,3));geometry.setIndex(indices);
    }else{
      geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));
      geometry.setIndex([0,1,2,0,2,3]);
    }
    geometry.instanceCount=count;
    const origins=new Float32Array(count*4),particles=new Float32Array(count*4),patches=new Float32Array(count*4),variations=new Float32Array(count*4);
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
    geometry.setAttribute('inkTiming',new THREE.InstancedBufferAttribute(new Float32Array(count*2),2));
    const uniforms={time:{value:0},intensity:{value:0},wind:{value:0},kind:{value:kind},opacity:{value:0},night:{value:0},twilight:{value:0}};
    const material=new THREE.ShaderMaterial({name:`Watercolour ${name}`,uniforms,
      vertexShader:ripple?rippleVertex:fallingVertex,fragmentShader:ripple?rippleFragment:fallingFragment,
      transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true});
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`GPU ${name}`;mesh.frustumCulled=false;mesh.renderOrder=ripple?5:6;
    mesh.visible=false;group.add(mesh);layers.push({name,mesh,geometry,material,uniforms});
  }
  createLayer('rain',COUNTS.rain,0);createLayer('snow',COUNTS.snow,1);
  createLayer('leaves',COUNTS.leaves,2);createLayer('ripples',COUNTS.ripples,3);
  // Pair the ink subset with existing ground instances once at construction.
  // The same position, seed, speed, density and size drive both shaders; no
  // particle objects, terrain queries or buffer uploads are needed per frame.
  const rainGeometry=layers[0].geometry,rippleGeometry=layers[3].geometry;
  const rainOrigin=rainGeometry.getAttribute('origin'),rainParticle=rainGeometry.getAttribute('particle');
  const rainPatch=rainGeometry.getAttribute('groundPatch'),rainVariation=rainGeometry.getAttribute('variation');
  const rainTiming=rainGeometry.getAttribute('inkTiming'),rippleTiming=rippleGeometry.getAttribute('inkTiming');
  const rippleOrigin=rippleGeometry.getAttribute('origin'),rippleParticle=rippleGeometry.getAttribute('particle');
  const ripplePatch=rippleGeometry.getAttribute('groundPatch');
  let foregroundInkDropCount=0;
  // Give the stage-facing view a dependable small population without changing
  // ordinary rain or the all-around distribution of the other 80 ink pairs.
  // Sampling is done after all fields are built, preserving their random data.
  for(let i=0;i<40;i++){
    for(let attempt=0;attempt<48;attempt++){
      const x=range(-58,58),z=range(14,65),y=groundHeight(x,z);
      if(!Number.isFinite(y)||isRiverPoint(x,z,6.5))continue;
      if(isRiverPoint(x,z,10)&&y<riverHeight(z)+.5)continue;
      if(Math.hypot(x+13,z-10)<6.5||Math.hypot(x-15,z-13)<6.5)continue;
      const dx=(groundHeight(x+2,z)-groundHeight(x-2,z))/4;
      const dz=(groundHeight(x,z+2)-groundHeight(x,z-2))/4;
      if(!Number.isFinite(dx)||!Number.isFinite(dz)||Math.hypot(dx,dz)>.40)continue;
      rippleOrigin.setXYZW(i,x,y,z,rippleOrigin.getW(i));
      ripplePatch.setXYZW(i,dx,dz,0,0);
      foregroundInkDropCount++;break;
    }
  }
  group.userData.foregroundInkDropCount=foregroundInkDropCount;
  for(let i=0;i<COUNTS.ripples;i++){
    const x=rippleOrigin.getX(i),z=rippleOrigin.getZ(i);
    rainOrigin.setXYZW(i,x,rippleOrigin.getY(i),z,rippleOrigin.getW(i));
    // Retain the rain's fall speed but share the impact site's density/size.
    rippleParticle.setY(i,rainParticle.getY(i));
    rainParticle.setXYZW(i,rippleParticle.getX(i),rippleParticle.getY(i),rippleParticle.getZ(i),rippleParticle.getW(i));
    rainPatch.setXYZW(i,groundHeight(x-8,z-8),groundHeight(x+8,z-8),groundHeight(x-8,z+8),groundHeight(x+8,z+8));
    rainVariation.setX(i,5);
    const fallSeconds=76/rainParticle.getY(i),soakSeconds=2.2+rippleOrigin.getW(i)*.6;
    rainTiming.setXY(i,fallSeconds,soakSeconds);rippleTiming.setXY(i,fallSeconds,soakSeconds);
  }
  for(let row=0;row<3;row++){
    const heights=new Float32Array(COUNTS.ripples*3);
    for(let i=0;i<COUNTS.ripples;i++){
      const radius=4.8+rippleParticle.getZ(i)*1.7;
      const x=rippleOrigin.getX(i),z=rippleOrigin.getZ(i);
      for(let column=0;column<3;column++)heights[i*3+column]=groundHeight(x+(column-1)*radius,z+(row-1)*radius);
    }
    rippleGeometry.setAttribute(`inkGround${row}`,new THREE.InstancedBufferAttribute(heights,3));
  }
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
