import * as THREE from './vendor/three.module.js';

/** Three calligraphic gestures and a continuous, peripheral wet-ink current.
 * The shader synthesises ribbons, wet blooms and droplets; no image resources,
 * per-frame geometry work, or activity outside the presentation/event windows.
 */
export function createInkTransition({startMs=0,storyStartMs=0,endMs=0,hasCredits=true,hasStory=true,intensity=1,accentColor='#a83224',accentAmount=.22}={}) {
  const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
  const start=finite(startMs,0),story=finite(storyStartMs,start),end=finite(endMs,start);
  const strength=THREE.MathUtils.clamp(finite(intensity,1),0,1.5);
  const accent=new THREE.Color(accentColor);
  const accentStrength=THREE.MathUtils.clamp(finite(accentAmount,.22),0,1);
  const hasPresentation=Boolean(hasCredits||hasStory)&&end>start;
  const ambientStart=Math.max(0,start-400),ambientEnd=end+400;
  const events=[];
  if(hasCredits||hasStory)events.push({slot:0,start:Math.max(0,start-650),duration:1800});
  if(hasCredits&&hasStory)events.push({slot:1,start:Math.max(0,story-900),duration:2000});
  if(hasCredits||hasStory)events.push({slot:2,start:Math.max(0,end-1200),duration:2400});
  const phase=new THREE.Vector3(-1,-1,-1);
  const geometry=new THREE.PlaneGeometry(2,2);
  const material=new THREE.ShaderMaterial({
    name:'Chinese ink transition / three gestures',
    transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,
    forceSinglePass:true,toneMapped:false,
    uniforms:{phase:{value:phase},ambientPhase:{value:0},flowTime:{value:0},intensity:{value:strength},aspect:{value:16/9},accentColor:{value:accent},accentAmount:{value:accentStrength}},
    vertexShader:`
      varying vec2 vUv;
      void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}
    `,
    fragmentShader:`
      uniform vec3 phase,accentColor;uniform float intensity,aspect,accentAmount,ambientPhase,flowTime;
      varying vec2 vUv;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      vec2 hash2(vec2 p){return vec2(hash(p),hash(p+vec2(37.2,19.1)));}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
      float cloud(vec2 p){return noise(p)*.68+noise(p*2.13+17.7)*.32;}
      float pathY(float x,int event){
        if(event==0)return .66-.16*sin(x*2.0+.6);
        if(event==1)return -.64+.16*sin(x*2.1-.6);
        return -.12+.33*sin(x*1.22+.4);
      }
      vec2 splatCentre(int event){
        if(event==0)return vec2(-1.33,.62);
        if(event==1)return vec2(1.26,-.53);
        return vec2(-1.12,-.42);
      }
      vec2 ambientInk(vec2 p){
        // The moving domain deforms, joins and separates the pigment itself;
        // the effect does not depend on a whole-layer opacity oscillation.
        float time=flowTime;
        vec2 drift=vec2(-time*.105,time*.029);
        float flow=noise(p*vec2(2.25,3.1)+drift);
        float wet=cloud(p*4.4+drift*1.47+flow*.7);
        float grain=noise(p*28.0+drift*.36);
        float streamY=-.82+.074*sin(p.x*2.2+time*.43)+.037*sin(p.x*5.1-time*.27);
        float crossStream=p.y-streamY+(flow-.5)*.075;
        float width=.064+wet*.078;
        float edge=abs(crossStream)+(grain-.5)*.018;
        float body=1.0-smoothstep(width*.48,width*1.65,edge);
        float islands=smoothstep(.22,.54,flow);
        float filament=1.0-smoothstep(.006,.024,abs(crossStream+.038*sin(p.x*3.4-time*.56)+(wet-.5)*.065));
        float lower=(body*(.20+.10*wet)+filament*.11)*(.39+.61*islands);
        // Unequal pools wander around the corners instead of tracing a frame.
        vec2 left=vec2(-aspect+.16+.11*sin(time*.31),-.60+.18*sin(time*.23));
        vec2 right=vec2(aspect-.12-.10*cos(time*.27),-.25+.34*sin(time*.17+1.4));
        float poolDistance=min(length((p-left)/vec2(.43,.36)),length((p-right)/vec2(.34,.47)));
        poolDistance+=(wet-.5)*.37+(grain-.5)*.035;
        float pools=(1.0-smoothstep(.36,1.02,poolDistance))*(.21+.12*flow);
        float fringe=(1.0-smoothstep(.85,1.29,poolDistance))*.055;
        // Sparse droplets advect with the wet current; the field is bounded by
        // the same banks as the ink, so it never rains dots across the reading.
        vec2 q=p*9.0+drift*.78+vec2(flow*.22,0.0),cell=floor(q);
        vec2 jitter=hash2(cell+31.7);
        vec2 local=fract(q)-(.19+jitter*.62);
        float dropRadius=.045+jitter.x*.10;
        float dropDistance=length(local*vec2(1.0,1.0+jitter.y*.65))+(grain-.5)*.017;
        float droplet=(1.0-smoothstep(dropRadius*.67,dropRadius,dropDistance))*step(.87,hash(cell+67.1));
        float nearWet=max(1.0-smoothstep(.16,.32,abs(crossStream)),1.0-smoothstep(.9,1.38,poolDistance));
        float drops=droplet*nearWet*.28;
        float pigment=clamp(max(lower,pools+fringe)+drops,0.0,.43);
        float accentWidth=min(.96,accentAmount*1.22);
        float accentField=fract((p.x+time*.055)*1.12+flow*.54+.19);
        float redSweep=(1.0-smoothstep(accentWidth*.76,accentWidth+.0001,accentField))*step(.0001,accentAmount);
        float redDrop=step(1.0-accentAmount,hash(cell+94.3))*step(.0001,accentAmount);
        float redPigment=max(lower,pools+fringe)*redSweep+drops*redDrop;
        // A soft, irregular opening preserves text and the original sketch.
        float reserve=smoothstep(.91,1.16,length(p/vec2(1.34,.72)));
        float outerZone=max(1.0-smoothstep(-.68,-.46,p.y),smoothstep(aspect*.69,aspect*.82,abs(p.x)));
        return vec2(pigment,min(pigment,redPigment))*reserve*outerZone*ambientPhase;
      }
      vec2 inkGesture(vec2 p,float t,int event){
        if(t<=0.0||t>=1.0)return vec2(0.0);
        float direction=event==1?-1.0:1.0;
        float along=(p.x*direction+1.95)/3.9;
        float front=smoothstep(0.0,.64,t)*1.18-.04;
        float distanceToPath=abs(p.y-pathY(p.x,event));
        vec2 centre=splatCentre(event);
        vec2 relative=p-centre;
        float radius=length(relative/vec2(1.15,.78));
        // Cheap rejection precedes the detailed noise and droplet field.
        if((distanceToPath>.46||along>front+.09)&&radius>.82)return vec2(0.0);
        float seed=float(event)*13.71+2.6;
        float grain=cloud(p*12.0+seed);
        float soft=cloud(p*5.3+seed+29.0);
        float tooth=hash(floor(p*238.0)+seed);
        float width=.105+.065*soft+.018*sin(p.x*8.+seed);
        float capillary=smoothstep(.61,.83,grain)*smoothstep(.48,.78,soft)*.024;
        float irregularDistance=distanceToPath+(grain-.5)*.061+(tooth-.5)*.008-capillary;
        float reached=1.0-smoothstep(front-.055,front+.025,along);
        float begin=smoothstep(0.0,.09,t);
        // A defined granular ink boundary sits inside a much lighter wet fringe.
        float wash=(1.0-smoothstep(width*.9,width*1.58,irregularDistance))*.15;
        float core=1.0-smoothstep(width*.71,width*.71+.014,irregularDistance);
        // Anisotropic random fibres replace periodic sine-wave stripes. The
        // transverse warp, broken lengths and unequal thresholds vary every hair.
        float crossStroke=p.y-pathY(p.x,event);
        float rakeWarp=noise(vec2(p.x*3.2,seed))*3.4+soft*1.9;
        float rake=noise(vec2(p.x*6.8+seed,crossStroke*132.0+rakeWarp));
        float fibres=smoothstep(.64+.08*grain,.89,rake);
        float broken=1.0-fibres*smoothstep(.29,.73,soft)*.84;
        float dryGrain=1.0-smoothstep(.78,.98,tooth)*.23;
        float density=mix(.37,.86,smoothstep(.17,.82,grain));
        float ribbon=(wash+core*broken*dryGrain*density)*reached;
        // Vermilion sits in a few ragged brush passages, sharing the existing
        // fibres and wet edges. The event seed changes their placement; keeping
        // the reading oval clear also prevents a red wash behind the text.
        float accentOutside=smoothstep(.72,1.04,length(p/vec2(1.30,.70)));
        float accentWidth=min(.96,accentAmount*1.32);
        float accentField=fract((p.x*direction+2.0)*.81+noise(vec2(p.x*2.3,seed))*.43+crossStroke*.31+seed*.173);
        float brushAccent=(1.0-smoothstep(accentWidth*.77,accentWidth+.0001,accentField))*accentOutside*step(.0001,accentAmount);
        // A pooled splash has a ragged, fairly crisp edge and uneven drying;
        // its dilute outer wash stays smaller than the previous blur footprint.
        float bloomRadius=.09+.24*smoothstep(.02,.3,t);
        float bloomDistance=radius+(grain-.5)*.082+(tooth-.5)*.008-capillary*.7;
        float boundary=bloomRadius*(.78+.21*soft);
        float wetBloom=(1.0-smoothstep(bloomRadius*.88,bloomRadius*1.39,bloomDistance))*.19;
        float pooled=1.0-smoothstep(boundary-.008,boundary+.014,bloomDistance);
        float darkBloom=pooled*mix(.39,.88,smoothstep(.18,.82,soft))*dryGrain;
        float dryingEdge=(smoothstep(boundary-.025,boundary-.009,bloomDistance)-smoothstep(boundary+.002,boundary+.018,bloomDistance))*grain*.1;
        float bloom=(wetBloom+darkBloom+dryingEdge)*smoothstep(0.,.08,t);
        // Sparse cell droplets around the landing point, each appearing as the
        // outward splash front arrives. They do not populate the full screen.
        float drops=0.0;
        float redDrops=0.0;
        if(radius>.2&&radius<.82){
          vec2 q=relative*7.0,cell=floor(q),jitter=hash2(cell+seed);
          vec2 dropletLocal=fract(q)-(.18+jitter*.64);
          float dropRadius=.045+hash(cell+seed+8.5)*.13;
          float angle=jitter.y*6.2831853,cs=cos(angle),sn=sin(angle);
          vec2 rotated=vec2(cs*dropletLocal.x-sn*dropletLocal.y,sn*dropletLocal.x+cs*dropletLocal.y);
          rotated*=vec2(1.0+jitter.x*.85,1.0+jitter.y*.32);
          float fringe=noise(dropletLocal*31.0+cell*5.0+seed);
          float dropDistance=length(rotated)+(fringe-.5)*dropRadius*.4;
          float droplet=1.0-smoothstep(dropRadius*.83,dropRadius,dropDistance);
          droplet*=.73+.27*fringe;
          float sparse=step(.73,hash(cell+seed+57.));
          float splashBand=smoothstep(.21,.35,radius)*(1.0-smoothstep(.63,.81,radius));
          float splashReached=1.0-smoothstep(.08+t*2.2,.17+t*2.2,radius);
          drops=droplet*sparse*splashBand*splashReached*.87;
          // Entire selected droplets carry red pigment, rather than tinting
          // all of the black ink. Their irregular silhouettes are unchanged.
          float redDrop=step(1.0-accentAmount*1.12,hash(cell+seed+91.6))*step(.0001,accentAmount);
          redDrops=drops*redDrop*accentOutside;
        }
        // Ink erodes unevenly into little blooms rather than fading uniformly.
        float dryOut=smoothstep(.53,1.0,t);
        float erosion=smoothstep(soft*.65+.15,soft*.65+.4,dryOut);
        float pigment=max(ribbon,bloom)+drops;
        float redPigment=(ribbon>=bloom?ribbon*brushAccent:bloom*brushAccent*.38)+redDrops;
        float life=begin*(1.0-erosion)*(1.0-smoothstep(.96,1.0,t));
        return vec2(pigment,redPigment)*life;
      }
      void main(){
        vec2 p=(vUv-.5)*vec2(aspect*2.0,2.0);
        // Also reject completely empty areas before entering any ink field.
        float readingRadius=length(p/vec2(1.34,.72));
        bool ambientCandidate=ambientPhase>0.0&&readingRadius>.91&&(p.y<-.46||abs(p.x)>aspect*.69);
        bool candidate=ambientCandidate;
        for(int e=0;e<3;e++){
          float t=e==0?phase.x:(e==1?phase.y:phase.z);
          if(t<=0.0||t>=1.0)continue;
          float along=(p.x*(e==1?-1.0:1.0)+1.95)/3.9;
          float front=smoothstep(0.0,.64,t)*1.18-.04;
          if((abs(p.y-pathY(p.x,e))<.46&&along<front+.09)||length((p-splatCentre(e))/vec2(1.15,.78))<.82)candidate=true;
        }
        if(!candidate)discard;
        vec2 current=ambientCandidate?ambientInk(p):vec2(0.0);
        float ink=current.x;
        float redInk=current.y;
        for(int e=0;e<3;e++){
          float t=e==0?phase.x:(e==1?phase.y:phase.z);
          if(t>0.0&&t<1.0){
            vec2 next=inkGesture(p,t,e);
            float coverage=clamp(next.x,0.,.92);
            float redShare=next.x>.0001?clamp(next.y/next.x,0.,1.):0.;
            redInk=redInk*(1.0-coverage)+coverage*redShare;
            ink=1.0-(1.0-ink)*(1.0-coverage);
          }
        }
        // An oval reading reserve has no rectangular boundary or fixed panel.
        float reading=1.0-smoothstep(.75,1.2,length(p/vec2(1.38,.74)));
        float alpha=ink*(1.0-reading*.73)*intensity;
        if(alpha<.004)discard;
        float redShare=ink>.0001?clamp(redInk/ink,0.,1.):0.;
        vec3 redPigment=accentColor*mix(.78,1.08,cloud(p*7.0+6.1));
        gl_FragColor=vec4(mix(vec3(.0095,.010,.0095),redPigment,redShare),min(alpha,.88));
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='Calligraphic ink connecting transitions';mesh.renderOrder=80;
  mesh.frustumCulled=false;mesh.visible=false;
  mesh.userData.inkTransition={events:events.map(event=>({...event})),ambientWindow:hasPresentation?{start:ambientStart,end:ambientEnd}:null,intensity:strength,accentColor:`#${accent.getHexString()}`,accentAmount:accentStrength};
  function update(globalMs){
    const time=finite(globalMs,-1);phase.set(-1,-1,-1);
    const uniforms=material.uniforms;
    uniforms.ambientPhase.value=0;
    uniforms.flowTime.value=Math.max(0,time-start)/1000;
    let active=false;
    if(time>=0&&strength>0){
      if(hasPresentation&&time>ambientStart&&time<ambientEnd){
        const fadeIn=THREE.MathUtils.clamp((time-start+400)/400,0,1);
        const fadeOut=THREE.MathUtils.clamp((end+400-time)/400,0,1);
        uniforms.ambientPhase.value=fadeIn*fadeOut;
        active=uniforms.ambientPhase.value>0;
      }
      for(const event of events){
        if(time>event.start&&time<event.start+event.duration){
          phase.setComponent(event.slot,(time-event.start)/event.duration);active=true;
        }
      }
    }
    mesh.visible=active;
  }
  function dispose(){geometry.dispose();material.dispose();}
  return {mesh,update,dispose};
}
