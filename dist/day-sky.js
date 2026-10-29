import * as THREE from './vendor/three.module.js';

/** Crossfade three aurora forms on the existing pausable scene clock. */
export function sampleAuroraVariation(seconds,out={}){
  const time=Number.isFinite(seconds)?seconds:0;
  const phase=((time/72)%1+1)%1,part=phase*3,index=Math.floor(part);
  const blend=THREE.MathUtils.smoothstep(part-index,.55,1);
  out.curtain=0;out.ribbon=0;out.corona=0;
  const current=index===0?'curtain':index===1?'ribbon':'corona';
  const next=index===0?'ribbon':index===1?'corona':'curtain';
  out[current]=1-blend;out[next]=blend;
  return out;
}

// A brief brush of light, followed by a long quiet interval. Sample the scene
// clock, never wall time: pause, hidden tabs and replay share the sky's clock.
const meteorDirections=[-.68,.15,1.85,-.22,-2.65,-.86,2.75,-1.55];
export function sampleMeteor(seconds,night=1,out={}){
  const time=Number.isFinite(seconds)?seconds:0;
  const event=Math.floor(time/9.7),age=time-event*9.7;
  const seed=((Math.sin(event*71.17+13.4)*43758.5453)%1+1)%1;
  const start=1.1+seed*1.5,duration=1.45+seed*.55;
  const progress=THREE.MathUtils.clamp((age-start)/duration,0,1);
  const directionIndex=((event%meteorDirections.length)+meteorDirections.length)%meteorDirections.length;
  const azimuth=meteorDirections[directionIndex]+progress*(.32+seed*.12);
  const altitude=.29+seed*.035-progress*(.10+seed*.035);
  const c=Math.cos(altitude),s=Math.sin(altitude),a=Math.sin(azimuth),b=Math.cos(azimuth);
  out.x=c*a;out.y=s;out.z=-c*b;
  // The derivative of the spherical path supplies a stable world-space tail.
  const da=.32+seed*.12,dh=-.10-seed*.035;
  const tx=c*b*da-s*a*dh,ty=c*dh,tz=c*a*da+s*b*dh;
  const length=Math.hypot(tx,ty,tz);
  out.tx=tx/length;out.ty=ty/length;out.tz=tz/length;
  out.opacity=THREE.MathUtils.smoothstep(progress,0,.10)*(1-THREE.MathUtils.smoothstep(progress,.63,1))
    *THREE.MathUtils.smoothstep(Number.isFinite(night)?night:0,.48,.92);
  out.tailLength=(.12+seed*.045)*THREE.MathUtils.smoothstep(progress,0,.25);
  out.seed=seed;
  return out;
}

// A paper wash and a separate, depth-tested celestial layer. The existing
// terrain/fortress depth pass masks stars and discs behind the painted hills.
// Rays live in world space, so orbiting the scene also turns through the sky.
export function createDaySky(){
  const geometry=new THREE.PlaneGeometry(2,2);
  const uniforms={
    progress:{value:0},opacity:{value:1},strength:{value:0},time:{value:0},
    light:{value:new THREE.Vector4(1,0,0,0)},
    sunDirection:{value:new THREE.Vector3()},moonDirection:{value:new THREE.Vector3()},
    lunarLight:{value:new THREE.Vector2(0,1)},lunarIllumination:{value:1},
    inverseProjection:{value:new THREE.Matrix4()},cameraRotation:{value:new THREE.Matrix3()},
    seasons:{value:new THREE.Vector4(1,0,0,0)},weather:{value:new THREE.Vector4()},seasonStrength:{value:0},
    rainbowAmount:{value:0},auroraMix:{value:new THREE.Vector3(1,0,0)},
    meteorHead:{value:new THREE.Vector3()},meteorTrail:{value:new THREE.Vector4()},meteorShape:{value:new THREE.Vector2()},
  };
  const auroraState={},meteorState={};
  const vertexShader=`
    varying vec2 vUv;varying vec3 vRay;
    uniform mat4 inverseProjection;uniform mat3 cameraRotation;
    void main(){
      vUv=uv;vRay=cameraRotation*(inverseProjection*vec4(position.xy,1.0,1.0)).xyz;
      gl_Position=vec4(position.xy,.99999,1.0);
    }`;
  const noise=`
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){
      vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
    }
    float paper(vec2 p){return noise(p)*.55+noise(p*2.03)*.3+noise(p*4.1)*.15;}
  `;
  const washMaterial=new THREE.ShaderMaterial({
    name:'Watercolour daylight sunset night and dawn',depthTest:false,depthWrite:false,
    uniforms,vertexShader,fragmentShader:`
      varying vec2 vUv;varying vec3 vRay;
      uniform float progress,opacity,strength,time,seasonStrength;uniform vec4 light,seasons,weather;
      uniform vec3 sunDirection,moonDirection;
      ${noise}
      void main(){
        vec3 ray=normalize(vRay);
        float y=vUv.y,wave=sin(vUv.x*9.0+y*13.0)*.025+sin(vUv.x*22.0-y*8.0)*.012;
        vec3 oldGround=vec3(.67,.54,.32),oldHaze=vec3(.64,.76,.66),oldSky=vec3(.81,.73,.49);
        vec3 original=mix(oldGround,oldHaze,smoothstep(.22,.54,y+wave));
        original=mix(original,oldSky,smoothstep(.62,1.0,y+wave));
        // During the long drawing/lettering intro, skip all sky lighting work.
        if(strength<.0001){
          original+=sin(y*50.0+sin(vUv.x*7.0)*1.4)*.012+(hash(floor(gl_FragCoord.xy))-.5)*.025;
          gl_FragColor=vec4(mix(vec3(1.0),original,smoothstep(.12,.82,progress)*opacity),1.0);
          return;
        }
        vec3 seasonGround=vec3(.59,.63,.40)*seasons.x+vec3(.53,.56,.32)*seasons.y+vec3(.68,.45,.25)*seasons.z+vec3(.77,.81,.83)*seasons.w;
        vec3 seasonHaze=vec3(.72,.81,.70)*seasons.x+vec3(.62,.77,.75)*seasons.y+vec3(.78,.71,.58)*seasons.z+vec3(.79,.85,.88)*seasons.w;
        vec3 seasonSky=vec3(.59,.77,.84)*seasons.x+vec3(.39,.66,.81)*seasons.y+vec3(.61,.69,.78)*seasons.z+vec3(.64,.73,.83)*seasons.w;
        vec3 dayGround=mix(vec3(.65,.57,.37),seasonGround,seasonStrength);
        vec3 dayHaze=mix(vec3(.68,.79,.76),seasonHaze,seasonStrength);
        vec3 daySky=mix(vec3(.53,.72,.84),seasonSky,seasonStrength);
        float winter=seasons.w*seasonStrength,cloud=weather.x*seasonStrength;
        vec3 ground=mix(dayGround,mix(vec3(.028,.046,.080),vec3(.12,.17,.24),winter*.85),light.z);
        vec3 haze=mix(dayHaze,mix(vec3(.065,.115,.19),vec3(.16,.22,.31),winter*.65),light.z);
        vec3 sky=mix(daySky,vec3(.014,.027,.065),light.z);
        ground=mix(ground,vec3(.36,.23,.23),light.y*.85);
        haze=mix(haze,vec3(.94,.43,.23),light.y*.9);
        sky=mix(sky,vec3(.30,.22,.38),light.y*.85);
        ground=mix(ground,vec3(.41,.41,.35),light.w*.6);
        haze=mix(haze,vec3(.82,.62,.53),light.w*.8);
        sky=mix(sky,vec3(.43,.51,.69),light.w*.75);
        vec3 colour=mix(ground,haze,smoothstep(.20,.58,y+wave));
        colour=mix(colour,sky,smoothstep(.57,1.0,y+wave));
        float sunGlow=pow(max(0.0,dot(ray,sunDirection)),24.0);
        float moonGlow=pow(max(0.0,dot(ray,moonDirection)),45.0);
        float sunAbove=smoothstep(-.06,.08,sunDirection.y);
        colour+=vec3(.27,.115,.025)*sunGlow*light.y*sunAbove*(1.0-cloud*.85);
        colour+=vec3(.06,.085,.13)*moonGlow*light.z*(1.0-cloud*.75);
        // Long horizontal pigment veils suggest lit cloud edges, not lens flare.
        float veil=paper(vec2(vUv.x*7.0+time*.002,y*32.0));
        float horizonDistance=(ray.y-.08)*6.0;
        float horizon=exp(-horizonDistance*horizonDistance);
        colour+=vec3(.12,.055,.025)*smoothstep(.42,.7,veil)*horizon*light.y;
        vec3 overcast=mix(vec3(.35,.42,.47),vec3(.028,.046,.079),light.z);
        overcast+=vec3(.075,.085,.095)*(1.0-y)*mix(1.0,.2,light.z);
        overcast+=vec3(.055,.065,.075)*(veil-.45)*mix(1.0,.35,light.z);
        colour=mix(colour,overcast,cloud*.72);
        // Snow catches the soft overcast light; rain leaves a cool dark ground.
        colour+=vec3(.04,.047,.055)*winter*(1.0-smoothstep(.2,.65,y))*(1.0-light.z*.8);
        colour*=1.0-weather.y*seasonStrength*.08*(1.0-smoothstep(.2,.6,y));
        colour=mix(original,colour,strength);
        float grain=(hash(floor(gl_FragCoord.xy))-.5)*.021;
        colour+=(sin(y*50.0+sin(vUv.x*7.0)*1.4)*.009+grain)*mix(1.0,.25,light.z*strength);
        colour=mix(vec3(1.0),colour,smoothstep(.12,.82,progress)*opacity);
        gl_FragColor=vec4(colour,1.0);
      }`,
  });
  const celestialMaterial=new THREE.ShaderMaterial({
    name:'Ink sun moon stars aurora meteors and after-rain rainbow',transparent:true,depthTest:true,depthWrite:false,
    uniforms,vertexShader,fragmentShader:`
      varying vec2 vUv;varying vec3 vRay;
      uniform vec4 light,weather;uniform float strength,opacity,time,seasonStrength,rainbowAmount;
      uniform vec3 sunDirection,moonDirection,auroraMix,meteorHead;
      uniform vec2 lunarLight;uniform float lunarIllumination;
      uniform vec4 meteorTrail;uniform vec2 meteorShape;
      ${noise}
      vec3 auroraPigment(float phase){
        float p=fract(phase)*6.0;
        vec3 jade=vec3(.16,.78,.48),cyan=vec3(.12,.69,.77),blue=vec3(.22,.40,.83);
        vec3 violet=vec3(.60,.31,.82),rose=vec3(.84,.30,.55),gold=vec3(.87,.72,.39);
        if(p<1.0)return mix(jade,cyan,smoothstep(.0,1.0,p));
        if(p<2.0)return mix(cyan,blue,smoothstep(.0,1.0,p-1.0));
        if(p<3.0)return mix(blue,violet,smoothstep(.0,1.0,p-2.0));
        if(p<4.0)return mix(violet,rose,smoothstep(.0,1.0,p-3.0));
        if(p<5.0)return mix(rose,gold,smoothstep(.0,1.0,p-4.0));
        return mix(gold,jade,smoothstep(.0,1.0,p-5.0));
      }
      vec2 auroraFlow(vec2 ring,float drift,float layer){
        // Sampling the circular world direction, rather than an unwrapped
        // azimuth, keeps irregular washes continuous across the 360° seam.
        vec2 p=ring*vec2(3.8,4.3)+vec2(drift*.32,-drift*.21)+layer*vec2(4.7,9.3);
        vec2 wet=vec2(noise(p*.72+3.1),noise(p*.67-7.4));
        return p+(wet-.5)*1.75;
      }
      vec3 auroraWashColour(vec2 ring,vec2 flow,float height,float layer,float water){
        float hue=time*.008+ring.x*.29+ring.y*.33+height*.82+noise(flow*.73)*.71+layer*.17;
        vec3 colour=auroraPigment(hue);
        // Different pigment pools coexist; no uniformly coloured strip or
        // mechanically stacked rainbow. Warm dilute ink appears in wet seams.
        float gold=smoothstep(.62,.83,noise(flow*1.43+height*6.1));
        colour=mix(colour,vec3(.83,.74,.48),gold*.45);
        return colour*(.78+.27*water);
      }
      vec4 curtainAurora(vec3 ray){
        float altitude=asin(clamp(ray.y,-1.0,1.0));vec2 ring=ray.xz/max(.001,length(ray.xz));
        float drift=time*.028;
        vec3 ink=vec3(0.0);float coverage=0.0;
        // Uneven wet veils with broad loaded sections, open paper and lost
        // edges. Vertically stretched noise replaces every periodic thread.
        for(int layer=0;layer<2;layer++){
          float index=float(layer);vec2 flow=auroraFlow(ring,drift,index);
          float hem=.10+index*.076+(noise(flow*.74)-.5)*.13;
          float height=altitude-hem;
          float water=paper(flow*1.27+height*vec2(2.4,4.8));
          float reach=.16+.25*noise(flow*.91+17.3);
          float lostEdge=(noise(flow*2.73+height*9.0)-.5)*.052;
          float veil=smoothstep(-.045,.035,height+lostEdge)
            *(1.0-smoothstep(reach*.42,reach,height+lostEdge));
          float folds=paper(flow*vec2(2.6,2.1)+height*vec2(1.8,2.7)+vec2(drift*.07,0.0));
          float loaded=smoothstep(.28,.69,folds);
          float broken=smoothstep(.24,.66,noise(flow*.92+vec2(5.3,height*3.0)));
          float wash=veil*(.13+loaded*.56)*(.28+.72*broken);
          float poolDistance=(height+lostEdge)/(.025+water*.035);
          float pool=exp(-poolDistance*poolDistance)
            *smoothstep(.41,.72,water)*.24;
          float alpha=clamp((wash+pool)*(.77+.23*water)*(1.0-index*.21),0.0,.68);
          vec3 colour=auroraWashColour(ring,flow,height,index,water);
          ink=colour*alpha+ink*(1.0-alpha);
          coverage=alpha+coverage*(1.0-alpha);
        }
        return vec4(ink,coverage);
      }
      vec4 ribbonAurora(vec3 ray){
        float altitude=asin(clamp(ray.y,-1.0,1.0));vec2 ring=ray.xz/max(.001,length(ray.xz));
        float drift=time*.035;
        vec3 ink=vec3(0.0);float coverage=0.0;
        // Broad, skewed ink sweeps carry unequal pressure and long missing
        // sections, so even their centres never become parallel clean arcs.
        for(int layer=0;layer<3;layer++){
          float index=float(layer);vec2 flow=auroraFlow(ring,drift,index+2.4);
          float path=.15+index*.079+(noise(flow*.62)-.5)*.21;
          path+=(noise(flow*1.67+8.4)-.5)*.048;
          float width=.019+.068*noise(flow*.83-9.7);
          float water=paper(flow*1.64+altitude*vec2(3.6,11.0));
          float edgeWarp=(noise(flow*2.37+altitude*15.0)-.5)*.038;
          float d=(altitude-path+edgeWarp)/width;
          float loaded=exp(-d*d*.75);
          float bleed=exp(-d*d*.24)*.15;
          float gaps=smoothstep(.29,.68,noise(flow*.94+vec2(3.1,altitude*2.0)));
          float broken=.15+.85*gaps;
          float poolDistance=(d+.45+water*.65)*1.8;
          float pooling=exp(-poolDistance*poolDistance)*smoothstep(.37,.74,water)*.23;
          float alpha=clamp((loaded*(.34+water*.31)+bleed+pooling)*broken*(1.0-index*.16),0.0,.66);
          vec3 colour=auroraWashColour(ring,flow,altitude-path,index+.8,water);
          ink=colour*alpha+ink*(1.0-alpha);coverage=alpha+coverage*(1.0-alpha);
        }
        return vec4(ink,coverage);
      }
      vec4 coronaAurora(vec3 ray){
        float altitude=asin(clamp(ray.y,-1.0,1.0));vec2 ring=ray.xz/max(.001,length(ray.xz));
        float drift=time*.024;
        vec3 ink=vec3(0.0);float coverage=0.0;
        // Three unequally placed, bent rising ink clouds replace the repeated
        // fan and its evenly spaced rays. No angular stripe function remains.
        for(int layer=0;layer<3;layer++){
          float index=float(layer);vec2 flow=auroraFlow(ring,drift,index+5.8);
          float centre=layer==0?-.48:layer==1?.86:-2.15;
          centre+=(noise(vec2(drift*.19,index*3.7))-.5)*.26;
          vec2 forward=vec2(sin(centre),-cos(centre)),side=vec2(cos(centre),sin(centre));
          float across=atan(dot(ring,side),dot(ring,forward));
          float water=paper(flow*1.13+altitude*vec2(3.4,8.1));
          float lift=altitude-.045-index*.018;
          float bend=lift*(.38-index*.31)+(noise(flow*.69+altitude*4.3)-.5)*.20;
          float breadth=.19+lift*(.45+index*.12)+noise(flow*.77+13.0)*.28;
          float bodyDistance=(across-bend)/max(.12,breadth);
          float body=exp(-bodyDistance*bodyDistance*1.7);
          float reach=.36+noise(flow*.56+6.3)*.34;
          float ragged=(noise(flow*2.39+altitude*14.0)-.5)*.10;
          float plume=smoothstep(-.025,.085,lift+ragged)*(1.0-smoothstep(reach*.48,reach,lift+ragged));
          float cloud=paper(flow*1.72+altitude*vec2(1.7,6.2));
          float loaded=smoothstep(.27,.69,cloud);
          float openings=smoothstep(.25,.63,noise(flow*.97+altitude*vec2(3.2,-2.3)));
          float alpha=body*plume*(.13+loaded*.55)*(.27+.73*openings);
          vec3 colour=auroraWashColour(ring,flow,lift,index+1.6,water);
          ink=colour*alpha+ink*(1.0-alpha);coverage=alpha+coverage*(1.0-alpha);
        }
        return vec4(ink,coverage);
      }
      vec4 aurora(vec3 ray){
        float night=smoothstep(.35,.95,light.z);
        if(night<.001||ray.y<.015)return vec4(0.0);
        vec4 lightInk=vec4(0.0);
        if(auroraMix.x>.001)lightInk+=curtainAurora(ray)*auroraMix.x;
        if(auroraMix.y>.001)lightInk+=ribbonAurora(ray)*auroraMix.y;
        if(auroraMix.z>.001)lightInk+=coronaAurora(ray)*auroraMix.z;
        // A convex mix of premultiplied layers preserves brightness while forms
        // dissolve into each other. Moon and stars are composed over this later.
        return lightInk*night*smoothstep(.015,.08,ray.y);
      }
      vec3 rainbowPigment(float t){
        if(t<.18)return mix(vec3(.94,.22,.20),vec3(.98,.57,.16),t/.18);
        if(t<.36)return mix(vec3(.98,.57,.16),vec3(.94,.86,.28),(t-.18)/.18);
        if(t<.55)return mix(vec3(.94,.86,.28),vec3(.25,.73,.43),(t-.36)/.19);
        if(t<.73)return mix(vec3(.25,.73,.43),vec3(.19,.59,.82),(t-.55)/.18);
        return mix(vec3(.19,.59,.82),vec3(.55,.30,.72),(t-.73)/.27);
      }
      vec4 afterRainRainbow(vec3 ray){
        float sunlight=(1.0-smoothstep(.08,.72,light.z))*smoothstep(-.015,.075,sunDirection.y);
        float amount=rainbowAmount*seasonStrength*sunlight;
        if(amount<.001||ray.y<.015)return vec4(0.0);
        // A broad arch behind the mountain range, anchored to a world sky
        // direction. Optical zoom and orbit use the same ray as stars/aurora.
        vec3 centre=normalize(vec3(-.27,-.085,-.96));
        float angle=acos(clamp(dot(ray,centre),-1.0,1.0));
        // Brush pressure varies along the arch; pigment is swept through a
        // broad wet stroke instead of six perfectly spaced concentric bands.
        vec3 right=normalize(cross(centre,vec3(0.0,1.0,0.0)));
        vec3 up=normalize(cross(right,centre));
        float sweep=atan(dot(ray,up),dot(ray,right));
        float pressure=.78+.22*sin(sweep*3.0+.8)+.12*sin(sweep*7.0-1.1);
        float bend=sin(sweep*5.0)*.0045+sin(sweep*11.0+.6)*.0024;
        float wet=noise(vec2(sweep*8.0,angle*63.0));
        float edgeNoise=noise(vec2(sweep*25.0,angle*185.0));
        float band=(.419+bend-angle)/(.048*pressure);
        float warped=band+(wet-.5)*.38+(edgeNoise-.5)*.11;
        float body=smoothstep(-.13,.16,warped)*(1.0-smoothstep(.83,1.15,warped));
        float bleed=smoothstep(-.42,.08,warped)*(1.0-smoothstep(.94,1.43,warped))*.12;
        float loading=.67+.33*noise(vec2(sweep*3.4+.8,2.3));
        // Broken, long fibres follow the stroke. Broad dry pockets are visible
        // at stage distance without turning the rainbow into a dotted texture.
        // A few broad fibre gaps survive a 720p stage preview; microscopic
        // grain alone disappears when this distant arch occupies 20 pixels.
        float fibres=noise(vec2(sweep*3.0,band*8.5+sin(sweep*4.0)*.6));
        float bristles=.38+.62*smoothstep(.20,.67,fibres);
        float dry=smoothstep(.45,.68,noise(vec2(sweep*9.0+.7,band*1.8+1.9)));
        float scrapeDistance=(warped-(.31+.09*sin(sweep*5.0)))/.068;
        float scrape=exp(-scrapeDistance*scrapeDistance)
          *smoothstep(.27,.65,noise(vec2(sweep*4.2,6.3)));
        float coverage=body*(1.0-dry*.91)*bristles*(1.0-scrape*.76)
          +bleed*(1.0-dry*.82);
        float alpha=coverage*loading*amount*.31*smoothstep(.015,.10,ray.y);
        float dye=clamp(warped+(noise(vec2(sweep*4.5,band*2.2))-.5)*.19,0.0,1.0);
        vec3 colour=mix(rainbowPigment(dye),vec3(.87,.89,.88),.31);
        colour*=.90+.10*wet;
        return vec4(colour*alpha,alpha);
      }
      vec4 meteor(vec3 ray){
        if(meteorTrail.w<.001||ray.y<.02)return vec4(0.0);
        vec3 delta=ray-meteorHead;
        float along=-dot(delta,meteorTrail.xyz);
        vec3 normal=normalize(cross(meteorHead,meteorTrail.xyz));
        float across=dot(delta,normal);
        float trailLength=max(.0001,meteorShape.x),t=clamp(along/trailLength,0.0,1.0);
        if(dot(ray,meteorHead)<.975||along<-.012||along>trailLength+.015||abs(across)>.014)return vec4(0.0);
        float aa=max(.00022,fwidth(across));
        float seed=meteorShape.y*31.0;
        float water=noise(vec2(along*94.0+seed,across*870.0+seed));
        float pressure=.53+.75*noise(vec2(along*57.0+seed,2.7));
        float width=mix(.0022,.00048,t)*pressure;
        // A slightly bent, pressure-loaded brush leaves pools, missing ink and
        // two soft stray fibres. No rigid beam or perfectly circular light tip.
        float drift=(sin(t*4.5+seed)*.0020+sin(t*10.0-seed)*.00055)*t;
        float brushDistance=abs(across+drift)+(water-.5)*width*.82;
        float line=1.0-smoothstep(width*.28,width+aa,brushDistance);
        float broken=mix(.06,1.0,smoothstep(.25,.62,noise(vec2(along*69.0+seed,8.2))));
        float tail=line*pow(1.0-t,1.10)*smoothstep(-.002,.005,along)*broken*(.48+.52*water);
        float wash=(1.0-smoothstep(width*.40,width*2.7+aa,brushDistance))*.19
          *pow(1.0-t,1.5)*smoothstep(-.002,.009,along)*broken;
        float bristles=0.0;
        for(int fibre=0;fibre<2;fibre++){
          float n=float(fibre),side=n<.5?-1.0:1.0;
          float offset=side*(.0012+.0023*t)*sin(t*2.4+n*.8);
          float strand=1.0-smoothstep(.00012,.00055+aa,abs(across+drift+offset));
          bristles+=strand*smoothstep(.17,.34,t)*(1.0-smoothstep(.55,.94,t))
            *smoothstep(.32,.72,noise(vec2(t*11.0+seed,n+5.0)))*.17;
        }
        vec2 headShape=vec2(along/.0035,across/.0019);
        float head=1.0-smoothstep(.34,1.25,length(headShape)+(water-.5)*.36);
        float alpha=min(.93,tail*.80+wash+bristles+head*.82)*meteorTrail.w;
        vec3 pigment=mix(vec3(.40,.53,.61),vec3(.91,.91,.79),max(head,1.0-t)*.78+water*.12);
        return vec4(pigment*alpha,alpha);
      }
      void main(){
        vec3 ray=normalize(vRay);vec4 northernLights=aurora(ray);
        vec3 colour=northernLights.rgb;float alpha=northernLights.a;
        vec4 rainbow=afterRainRainbow(ray);
        colour=rainbow.rgb+colour*(1.0-rainbow.a);alpha=rainbow.a+alpha*(1.0-rainbow.a);
        float sunDist=sqrt(max(0.0,2.0*(1.0-dot(ray,sunDirection))));
        float radius=mix(.022,.032,light.y);
        float sunRim=radius*(1.0+(paper(ray.xz*410.0)-.5)*.075);
        float sunDisc=1.0-smoothstep(sunRim-.0012,sunRim+.0006,sunDist);
        float sunHalo=exp(-sunDist*sunDist/(radius*radius*7.0))*.22;
        float sunVisible=smoothstep(-.045,.025,sunDirection.y)*(1.0-smoothstep(.65,1.0,light.z));
        float sunAlpha=max(sunDisc*.95,sunHalo)*sunVisible;
        vec3 sunColour=mix(vec3(1.0,.90,.59),vec3(1.0,.30,.075),light.y);
        sunColour*=.94+.06*paper(ray.xy*620.0);
        colour=mix(colour,sunColour,sunAlpha);alpha=sunAlpha+alpha*(1.0-sunAlpha);
        float moonDist=sqrt(max(0.0,2.0*(1.0-dot(ray,moonDirection))));
        float moonRim=.024*(1.0+(paper(ray.xz*530.0)-.5)*.035);
        float moonDisc=1.0-smoothstep(moonRim-.0007,moonRim+.0007,moonDist);
        // Project the moon onto its own world-space tangent frame. The lit
        // hemisphere gives a true crescent/half/gibbous silhouette, with a
        // soft pigment boundary rather than a shaded solid sphere.
        vec3 moonRight=normalize(cross(moonDirection,vec3(0.0,1.0,0.0)));
        vec3 moonUp=normalize(cross(moonRight,moonDirection));
        vec2 moonLocal=vec2(dot(ray,moonRight),dot(ray,moonUp))/.024;
        float moonDepth=sqrt(max(0.0,1.0-dot(moonLocal,moonLocal)));
        float terminator=moonLocal.x*lunarLight.x+moonDepth*lunarLight.y;
        terminator+=(paper(moonLocal*17.0)-.5)*.045;
        float litMoon=smoothstep(-.035,.035,terminator)*moonDisc;
        vec2 haloCentre=vec2(lunarLight.x*.32*(1.0-lunarIllumination),0.0);
        float haloDistance=length(moonLocal-haloCentre)*.024;
        float moonHalo=exp(-haloDistance*haloDistance/.0021)*(.018+.070*lunarIllumination);
        float moonVisible=light.z*smoothstep(-.03,.06,moonDirection.y);
        float moonAlpha=max(litMoon*.97,moonHalo)*moonVisible;
        vec3 moonColour=vec3(.79,.88,.96)*(.77+.23*paper(ray.xy*250.0+ray.z*91.0));
        colour=mix(colour,moonColour,moonAlpha);alpha=moonAlpha+alpha*(1.0-moonAlpha);
        // Two sparse spherical grids avoid screen-fixed stars when orbiting.
        vec2 sphere=vec2(atan(ray.x,-ray.z)/6.2831853+.5,asin(clamp(ray.y,-1.0,1.0))/3.14159265+.5);
        vec2 grid=sphere*vec2(420.0,210.0),cell=floor(grid);
        float seed=hash(cell),selected=step(.93,seed);
        vec2 offset=vec2(hash(cell+7.0),hash(cell+29.0))*.68+.16;
        float dist=length(fract(grid)-offset),size=mix(.025,.075,hash(cell+43.0));
        float starCore=1.0-smoothstep(size*.35,size,dist);
        float starHalo=exp(-dist*dist/(size*size*6.0))*.18;
        float twinkle=.74+.26*sin(time*(.55+hash(cell+79.0)*.7)+seed*57.0);
        float stars=max(starCore,starHalo)*selected*twinkle*smoothstep(.24,.9,light.z);
        stars*=smoothstep(.025,.12,ray.y)*(1.0-moonDisc)*(1.0-sunDisc);
        vec3 starColour=mix(vec3(.68,.80,1.0),vec3(1.0,.89,.69),hash(cell+19.0));
        colour=mix(colour,starColour,stars);alpha=stars+alpha*(1.0-stars);
        vec4 shootingStar=meteor(ray);
        colour=shootingStar.rgb+colour*(1.0-shootingStar.a);alpha=shootingStar.a+alpha*(1.0-shootingStar.a);
        if(alpha<.001)discard;
        // Colours above are composed as premultiplied layers; unpremultiply
        // once for Three's normal alpha blending against the paper wash.
        float cloud=clamp(weather.x*seasonStrength,0.0,1.0);
        gl_FragColor=vec4(colour/max(alpha,.001),alpha*strength*opacity*pow(1.0-cloud,2.0));
      }`,
  });
  const mesh=new THREE.Mesh(geometry,washMaterial);mesh.frustumCulled=false;mesh.renderOrder=-10;
  const celestial=new THREE.Mesh(geometry,celestialMaterial);celestial.frustumCulled=false;celestial.renderOrder=-9;
  celestial.visible=false;
  const group=new THREE.Group();group.name='Continuous painted day and night sky';group.add(mesh,celestial);
  const direction=(target,altitude,azimuth)=>target.set(Math.cos(altitude)*Math.sin(azimuth),Math.sin(altitude),-Math.cos(altitude)*Math.cos(azimuth));
  return{
    mesh:group,
    setSeason(state,strength){
      uniforms.seasons.value.set(state.spring,state.summer,state.autumn,state.winter);
      uniforms.weather.value.set(state.cloudiness,state.wetness,state.snow,state.wind);
      uniforms.seasonStrength.value=strength;
      uniforms.rainbowAmount.value=THREE.MathUtils.clamp(state.rainbow||0,0,1);
    },
    setDayCycle(state,strength,camera,time){
      uniforms.light.value.set(state.daylight,state.sunset,state.night,state.dawn);
      uniforms.strength.value=strength;uniforms.time.value=time;
      sampleAuroraVariation(time,auroraState);
      uniforms.auroraMix.value.set(auroraState.curtain,auroraState.ribbon,auroraState.corona);
      sampleMeteor(time,state.night,meteorState);
      uniforms.meteorHead.value.set(meteorState.x,meteorState.y,meteorState.z);
      uniforms.meteorTrail.value.set(meteorState.tx,meteorState.ty,meteorState.tz,meteorState.opacity);
      uniforms.meteorShape.value.set(meteorState.tailLength,meteorState.seed);
      direction(uniforms.sunDirection.value,state.sunAltitude,state.sunAzimuth);
      direction(uniforms.moonDirection.value,state.moonAltitude,state.moonAzimuth);
      const lunarPhase=Number.isFinite(state.moonPhase)?state.moonPhase:.5;
      const lunarAngle=lunarPhase*Math.PI*2;
      uniforms.lunarLight.value.set(Math.sin(lunarAngle),-Math.cos(lunarAngle));
      uniforms.lunarIllumination.value=(1-Math.cos(lunarAngle))*.5;
      uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
      uniforms.cameraRotation.value.setFromMatrix4(camera.matrixWorld);
      celestial.visible=strength>.001;
    },
    update(progress,opacity){uniforms.progress.value=progress;uniforms.opacity.value=opacity;},
    dispose(){geometry.dispose();washMaterial.dispose();celestialMaterial.dispose();},
  };
}
