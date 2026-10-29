import * as THREE from './vendor/three.module.js';
import {FORTRESS_LIGHTS,fortressLightLevel} from './fortress-lights.js';
import {RIVER_GLSL,RIVER_START_Z,RIVER_END_Z} from './river-layout.js';

// Shared lamp positions generate fixed shader instructions once, never per frame.
const fortressLampShader=FORTRESS_LIGHTS.map(({position,normal,scale},index)=>{
  const vector=values=>`vec3(${values.map(value=>Number(value).toFixed(3)).join(',')})`;
  return `{vec3 offset=vWorld-${vector(position)};float falloff=max(0.0,1.0-dot(offset,offset)/${(18*scale*scale).toFixed(3)});
    float face=smoothstep(-2.0,-.55,dot(offset,${vector(normal)}));
    lamps+=falloff*falloff*face*(.94+.06*sin(time*4.7+${(index*1.37).toFixed(3)}));}`;
}).join('\n');

// Camera-facing ribbons keep ink legible at venue resolution. Each ribbon is a
// continuous hand-drawn path; there are no hardware one-pixel WebGL lines.
export function createBrushLayer(strokes, sourcePoint, wash=false) {
  const positions=[],destinations=[],previous=[],next=[],colors=[],inks=[],sides=[],seeds=[],widths=[],worldWidths=[],alphas=[],winds=[],along=[],surfaces=[],anchors=[],motionParams=[],indices=[];
  const ink=new THREE.Color(),color=new THREE.Color();
  // Classify authored strokes, never their colour: vermilion architecture,
  // brass chains, fire and flags must not turn into autumn foliage.
  function surfaceType(kind=''){
    if(/^(pine-canopy-pigment|pine-bough-ink|pine-needle-touch|grove-underbrush|underbrush-ink|moss-ink-touch|grass-ink|foreground-scrub-pigment|foreground-scrub-ink|foreground-grass|foreground-moss)$/.test(kind))return 1;
    if(/^(mountain-mineral-foundation|layered-mineral-pigment|broken-ink-stain|ridge-mineral-light|open-mountain-crest|hemp-fibre-cun|split-dry-fibre|axe-cut-cun|ground-rock-ink|rock-crease|foreground-wet-rock|foreground-rock-cun)$/.test(kind))return 2;
    if(/^(ochre-earth-scumble|broken-earth-path|path-dry-ink|riverbank-ink)$/.test(kind))return 3;
    if(/^(roof-mineral|short-tile-ridge|swept-eave|eave-gold|hip-eave|ridge-curl|roof-ridge|ridge-light|coping-top|wall-coping|lantern-cap)$/.test(kind))return 4;
    if(/^(river-colour-current|water-ink)$/.test(kind))return 5;
    if(/^campfire-(flame|rising-ember|smoke)/.test(kind))return 6;
    if(/^(horizontal-cloud-wash|vapour-ink)$/.test(kind))return 7;
    if(/^(moss-bloom|moss-dots)$/.test(kind))return 8;
    if(/^flag|^pine-(trunk|branch)$/.test(kind))return 9;
    return 0;
  }
  let vertex=0;
  for(const stroke of strokes){
    const points=stroke.points;if(points.length<2)continue;
    const src=sourcePoint(stroke),seed=src.seed;
    const surface=surfaceType(stroke.kind);
    color.set(stroke.color);ink.setRGB(src.r,src.g,src.b,THREE.SRGBColorSpace);
    for(let i=0;i<points.length;i++){
      const t=i/(points.length-1),p=points[i],prev=points[Math.max(0,i-1)],after=points[Math.min(points.length-1,i+1)];
      for(const side of [-1,1]){
        positions.push(src.position.x+src.right.x*t*.12,src.position.y+src.right.y*t*.12,src.position.z+src.right.z*t*.12);
        const edge=side===-1?0:1;
        destinations.push(...(stroke.ribbonEdges?stroke.ribbonEdges[i][edge]:p));
        previous.push(...(stroke.ribbonEdges?stroke.ribbonEdges[Math.max(0,i-1)][edge]:prev));
        next.push(...(stroke.ribbonEdges?stroke.ribbonEdges[Math.min(points.length-1,i+1)][edge]:after));
        colors.push(color.r,color.g,color.b);inks.push(ink.r,ink.g,ink.b);
        sides.push(side);seeds.push(seed);along.push(t);winds.push(stroke.wind||0);surfaces.push(surface);
        widths.push(wash?stroke.weight||25:(stroke.weight||1)*2.5);
        worldWidths.push(stroke.ribbonEdges?-1:stroke.worldWidth||0);
        anchors.push(...(stroke.motionAnchor||[0,0,0]));motionParams.push(stroke.motionPhase||0,stroke.motionScale||1);
        alphas.push(stroke.opacity??(wash?.35:.92));
      }
      if(i<points.length-1){const j=vertex+i*2;indices.push(j,j+1,j+2,j+2,j+1,j+3);}
    }
    vertex+=points.length*2;
  }
  const geometry=new THREE.BufferGeometry();
  for(const [name,array,size] of [['position',positions,3],['destination',destinations,3],['previousPoint',previous,3],['nextPoint',next,3],['finalColor',colors,3],['inkColor',inks,3]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(array,size));
  // Pack scalars into two slots to stay below WebGL's vertex-attribute limit.
  const brushData=new Float32Array(sides.length*4),inkData=new Float32Array(sides.length*4);
  for(let i=0;i<sides.length;i++){brushData.set([sides[i],seeds[i],widths[i],worldWidths[i]],i*4);inkData.set([alphas[i],winds[i],along[i],surfaces[i]],i*4);}
  geometry.setAttribute('brushData',new THREE.BufferAttribute(brushData,4));geometry.setAttribute('inkData',new THREE.BufferAttribute(inkData,4));
  geometry.setIndex(indices);
  geometry.setAttribute('motionAnchor',new THREE.Float32BufferAttribute(anchors,3));geometry.setAttribute('motionParams',new THREE.Float32BufferAttribute(motionParams,2));
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,
    uniforms:{progress:{value:0},time:{value:0},mood:{value:0},opacity:{value:1},resolution:{value:new THREE.Vector2(1920,1080)},wash:{value:wash?1:0},sourceTransform:{value:new THREE.Matrix4()},
      cycleStrength:{value:0},cycleLight:{value:new THREE.Vector4(1,0,0,0)},fortressLampPower:{value:0},
      seasonStrength:{value:0},seasonWeights:{value:new THREE.Vector4(1,0,0,0)},
      seasonWeather:{value:new THREE.Vector4()},seasonExtra:{value:new THREE.Vector2()},
      sunDirection:{value:new THREE.Vector3(-.5,.3,-.81).normalize()},moonDirection:{value:new THREE.Vector3(-.3,.3,-.9).normalize()}},
    vertexShader:`attribute vec3 destination,previousPoint,nextPoint,finalColor,inkColor,motionAnchor;attribute vec2 motionParams;
    attribute vec4 brushData,inkData;
    #define side brushData.x
    #define seed brushData.y
    #define brushWidth brushData.z
    #define worldWidth brushData.w
    #define brushAlpha inkData.x
    #define windKind inkData.y
    #define along inkData.z
    #define surfaceType inkData.w
    uniform float progress,time,mood,wash;uniform vec2 resolution;uniform mat4 sourceTransform;
    varying vec3 vInk,vWorld;varying float vSide,vAlpha,vSeed,vAlong,vKind,vLife,vSurface;
    ${RIVER_GLSL}
    vec3 orbitY(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(c*p.x-s*p.z,p.y,s*p.x+c*p.z);}
    vec3 drift(vec3 p,float t){
      if(windKind>.5&&windKind<1.5){
        float freeEdge=clamp(length(p.xz-motionAnchor.xz)/3.7,0.0,1.0);
        float wave=p.x*2.3-time*(2.4+mood*.6)+motionParams.x;
        p.z+=(sin(wave)*.52+sin(wave*1.7)*.16)*freeEdge*t;
        p.y+=cos(wave*.83)*.19*freeEdge*t;
      }
      if(windKind>1.5&&windKind<2.5){p=orbitY(p,time*.006*t);p.y+=sin(time*.15+p.x*.02)*.35*t;}
      if(windKind>2.5&&windKind<3.5)p.y+=sin(time*1.4+p.z*.7)*.035*t;
      if(windKind>3.5&&windKind<4.5){
        float wing=clamp(abs(p.x-motionAnchor.x)/max(.5,motionParams.y),0.0,1.5);
        p.y+=sin(time*4.3+motionParams.x)*wing*.72*t;
        p=orbitY(p,time*.018*t);p.y+=sin(time*.55+motionParams.x)*.35*t;
      }
      if(windKind>4.5&&windKind<5.5){
        float shift=mod(motionAnchor.z-(${RIVER_START_Z.toFixed(1)})+time*1.7,${(RIVER_END_Z-RIVER_START_Z).toFixed(1)})-(motionAnchor.z-(${RIVER_START_Z.toFixed(1)}));
        float z=p.z+shift,lane=(p.x-riverCenterX(p.z))/riverHalfWidth(p.z);
        p.x=mix(p.x,riverCenterX(z)+lane*riverHalfWidth(z),t);
        p.y+=((riverHeight(z)-riverHeight(p.z))+sin(time*2.3+z)*.045)*t;p.z=mix(p.z,z,t);
      }
      if(windKind>5.5&&windKind<6.5){
        float height=max(0.0,p.y-motionAnchor.y),rise=clamp(height/6.0,0.0,1.0),phase=motionParams.x;
        float rooted=smoothstep(.25,1.1,height);
        float lick=sin(time*5.9-rise*8.0+phase)*.55+sin(time*10.3+rise*5.0-phase)*.16;
        p.x+=lick*rise*rooted*motionParams.y*t;
        p.z+=(cos(time*5.1-rise*7.0+phase)*.40+sin(time*8.7+phase)*.12)*rise*rooted*motionParams.y*t;
        p.y+=(sin(time*7.3+phase+rise*3.0)*.55+sin(time*11.1-phase)*.20)*rise*rooted*t;
      }
      if(windKind>6.5&&windKind<7.5){
        float life=fract(time*.4*motionParams.y+motionParams.x);
        p.y+=(life*4.0-1.0)*t;
        p.x+=sin(time*.9+motionParams.x)*life*.55*t;
        p.z+=cos(time*.7+motionParams.x)*life*.35*t;
      }
      if(windKind>7.5&&windKind<8.5){
        float life=fract(time*.13*motionParams.y+motionParams.x);
        vec3 local=p-motionAnchor;
        p.y+=life*7.5*t;
        p.x+=(clamp(local.x,-3.0,3.0)*life*.55+sin(time*.63+motionParams.x*6.28+local.y*.35)*life*.9)*t;
        p.z+=(clamp(local.z,-3.0,3.0)*life*.55+cos(time*.51+motionParams.x*6.28+local.y*.29)*life*.62)*t;
      }
      return p;
    }
    void main(){
      float t=smoothstep(.08,.83,progress),bow=sin(t*3.14159265);
      vec3 arc=vec3(sin(seed)*5.0,cos(seed*1.3)*3.0+3.0,sin(seed*.9)*7.0)*bow;
      vec3 source=(sourceTransform*vec4(position,1.0)).xyz;
      vec3 p=drift(mix(source,destination,t)+arc,t);
      vec3 before=drift(mix(source,previousPoint,t)+arc,t);
      vec3 after=drift(mix(source,nextPoint,t)+arc,t);
      vec4 clip=projectionMatrix*modelViewMatrix*vec4(p,1.0);
      vec4 c0=projectionMatrix*modelViewMatrix*vec4(before,1.0);
      vec4 c1=projectionMatrix*modelViewMatrix*vec4(after,1.0);
      vec2 tangent=(c1.xy/max(c1.w,.1)-c0.xy/max(c0.w,.1))*resolution;
      tangent=length(tangent)<.001?vec2(1.0,0.0):normalize(tangent);
      vec2 normal=vec2(-tangent.y,tangent.x);
      float pressure=.78+.17*sin(along*13.0+seed)+.05*sin(along*37.0+seed*2.0);
      float scale=resolution.y/1080.0;
      float pigmentWidth=worldWidth<0.0?0.0:worldWidth>0.0?min(200.0*scale,worldWidth*projectionMatrix[1][1]*resolution.y/(2.0*max(2.0,clip.w))):brushWidth*scale;
      float width=mix(.8*scale,pigmentWidth,smoothstep(.14,.78,progress))*pressure;
      clip.xy+=normal*side*width/resolution*clip.w;
      clip.z-=.00008*clip.w;
      gl_Position=clip;
      vInk=mix(inkColor,finalColor,smoothstep(.12,.68,progress));
      vAlpha=brushAlpha*step(.5,clip.w);vSide=side;vAlong=along;vSeed=seed;
      vWorld=p;vKind=windKind;vSurface=surfaceType;vLife=fract(time*(windKind>7.5&&windKind<8.5?.13:.4)*motionParams.y+motionParams.x);
    }`,
    fragmentShader:`uniform float progress,opacity,wash,time,cycleStrength,fortressLampPower;
    uniform vec4 cycleLight;uniform vec3 sunDirection,moonDirection;
    uniform float seasonStrength;uniform vec4 seasonWeights,seasonWeather;uniform vec2 seasonExtra;
    varying vec3 vInk,vWorld;varying float vSide,vAlpha,vSeed,vAlong,vKind,vLife,vSurface;
    float grain(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    vec3 seasonPigment(vec3 pigment){
      if(seasonStrength<.0001)return pigment;
      vec3 colour=pigment;
      float spring=seasonWeights.x,summer=seasonWeights.y,autumn=seasonWeights.z,winter=seasonWeights.w;
      float rain=seasonWeather.x,snow=seasonWeather.y,cloudiness=seasonWeather.z,wetness=seasonWeather.w;
      float snowPatch=.5+.24*sin(vWorld.x*.17+sin(vWorld.z*.09)*2.0)+.20*sin(vWorld.z*.23+vWorld.y*.18);
      float luminosity=dot(pigment,vec3(.2126,.7152,.0722));
      bool foliage=(vSurface>.5&&vSurface<1.5)||(vSurface>7.5&&vSurface<8.5);
      if(foliage){
        vec3 fresh=pigment*vec3(.84,1.23,.72)+vec3(.026,.053,.007)*wash;
        vec3 lush=pigment*vec3(.64,.90,.72);
        float leafVariety=.5+.5*sin(vWorld.x*.20+vWorld.z*.13+vSeed*.65);
        vec3 autumnWash=mix(vec3(.62,.23,.025),vec3(.32,.046,.014),leafVariety);
        vec3 autumnInk=pigment*vec3(1.60,.64,.30)+vec3(.025,.005,.001);
        vec3 gold=mix(autumnInk,autumnWash,wash*.88);
        vec3 dormant=mix(pigment,vec3(luminosity)*vec3(.72,.88,1.04),.74)*.85;
        colour=mix(colour,fresh,spring*.84);
        colour=mix(colour,lush,summer*.88);
        colour=mix(colour,gold,autumn*.96);
        colour=mix(colour,dormant,winter*.86);
      }else if(vSurface>1.5&&vSurface<2.5){
        // Mineral slopes warm gently; only actual foliage receives vivid gold.
        vec3 warm=colour*vec3(1.16,.91,.65)+vec3(.039,.012,.002)*wash;
        colour=mix(colour,warm,autumn*.65);
        colour=mix(colour,colour*vec3(.88,1.05,.91),spring*.26+summer*.17);
        colour=mix(colour,vec3(luminosity)*vec3(.72,.90,1.08),winter*.48);
      }
      float cover=0.0;
      if(vSurface>1.5&&vSurface<2.5){
        // Continuous world-space deposits keep the hidden terrain triangles
        // from appearing as hard snow facets; higher ridges collect more snow.
        float ridge=smoothstep(7.0,37.0,vWorld.y);
        cover=smoothstep(.20,.74,snowPatch+ridge*.26)*(.45+.55*ridge)*mix(.055,.96,wash);
      }else if(vSurface>2.5&&vSurface<3.5){
        cover=smoothstep(.26,.77,snowPatch)*mix(.025,.78,wash);
      }else if(vSurface>3.5&&vSurface<4.5){
        // Only roof/coping kinds enter this branch, never vertical wall washes.
        cover=(.62+.38*smoothstep(.20,.72,snowPatch))*mix(.24,.94,wash);
      }else if(vSurface>.5&&vSurface<1.5){
        float boughTop=.5+.5*sin(vWorld.y*1.7+vAlong*3.0);
        cover=smoothstep(.42,.83,snowPatch)*boughTop*mix(.08,.65,wash);
      }
      float accumulation=winter*(.68+.32*snow);
      vec3 snowInk=vec3(.78,.85,.89)*(.93+.07*sin(vWorld.x*.7+vWorld.z*.53));
      colour=mix(colour,snowInk,cover*accumulation);
      if(vSurface<5.5||vSurface>7.5){
        colour*=1.0-wetness*.25;
        if(vSurface>2.5&&vSurface<3.5||vSurface>4.5&&vSurface<5.5){
          float reflection=pow(.5+.5*sin(vWorld.z*1.7+vWorld.x*.7-time*(2.0+rain)),10.0);
          colour+=vec3(.025,.047,.062)*wetness*reflection*mix(.25,1.0,wash);
        }
      }
      if(vSurface>6.5&&vSurface<7.5){
        colour=mix(colour,vec3(luminosity)*vec3(.73,.81,.92),cloudiness*.7);
        colour*=1.0-cloudiness*.28;
      }
      return mix(pigment,colour,seasonStrength*smoothstep(.84,1.0,progress));
    }
    vec3 lightPigment(vec3 pigment){
      float night=cycleLight.z,twilight=max(cycleLight.y,cycleLight.w*.72);
      // Wide terrain washes have a real surface normal. Thin ink paths have
      // zero-area world positions, so use a stable landscape-facing fallback.
      vec3 areaNormal=cross(dFdx(vWorld),dFdy(vWorld));
      float areaLength=length(areaNormal);
      vec3 normal=areaLength>.00001?areaNormal/areaLength:normalize(vec3(sin(vWorld.x*.023)*.4,1.0,cos(vWorld.z*.019)*.3));
      float sunSide=.36+.64*abs(dot(normal,sunDirection));
      float moonSide=.32+.68*abs(dot(normal,moonDirection));
      float heightLight=smoothstep(0.0,32.0,vWorld.y);
      vec3 day= pigment*(.85+.15*sunSide);
      vec3 warm=day*vec3(1.24,.78,.53)+vec3(.045,.014,.003)*sunSide*(.3+.7*wash);
      day=mix(day,warm,twilight*.86);
      // Keep ink and mineral washes readable on the indigo night paper.
      vec3 moon= pigment*vec3(.34,.50,.76)*( .58+.42*moonSide )
        +vec3(.009,.019,.033)*( .5+.5*moonSide )*(.65+.35*wash);
      moon+=vec3(.008,.016,.026)*heightLight*moonSide;
      vec3 lit=mix(day,moon,night);
      if(vKind>1.5&&vKind<2.5){
        vec3 cloud=vec3(.095,.14,.21)*( .72+.28*moonSide );
        lit=mix(lit,cloud,night*.70);
      }
      if((vKind>2.5&&vKind<3.5)||(vKind>4.5&&vKind<5.5)){
        float glint=pow(.5+.5*sin(vWorld.z*.8+vWorld.x*.25-time*1.8),8.0);
        lit+=vec3(.018,.035,.055)*night*glint;
        lit+=vec3(.09,.035,.008)*twilight*glint;
      }
      // These are the two existing fire anchors in campfires.js. Only nearby
      // low surfaces catch their warm reflected light; geometry stays reused.
      vec2 fireA=vWorld.xz-vec2(-13.0,10.0),fireB=vWorld.xz-vec2(15.0,13.0);
      float pulseA=.88+.12*sin(time*7.3)+.055*sin(time*11.1);
      float pulseB=.88+.12*sin(time*7.3+2.8)+.055*sin(time*11.1-2.8);
      float fire=(exp(-dot(fireA,fireA)/85.0)*pulseA+exp(-dot(fireB,fireB)/100.0)*pulseB)
        *exp(-max(0.0,vWorld.y-.5)*.23);
      lit+=vec3(.23,.066,.012)*fire*(night+.22*twilight)*(.45+.55*wash);
      // Restrict reflected lamp light to nearby architecture/roof/attached moss.
      // No work for daylight, mountains, foliage, flags, water or ground chains.
      if(fortressLampPower>.001&&vWorld.y>3.0&&(vSurface<.5||(vSurface>3.5&&vSurface<4.5)||(vSurface>7.5&&vSurface<8.5))){
        float lamps=0.0;
        ${fortressLampShader}
        lit+=vec3(.31,.105,.020)*min(lamps,1.5)*fortressLampPower*(.38+.62*wash);
      }
      // Flame and ember pigments emit their own light throughout the night.
      if(vKind>5.5&&vKind<7.5)lit=pigment*(1.0+night*.24)+vec3(.055,.018,.002)*night;
      return mix(pigment,lit,cycleStrength*smoothstep(.83,1.0,progress));
    }
    void main(){
      float tooth=sin(vAlong*63.0+vSeed+sin(vSide*11.0))*sin(vAlong*157.0-vSeed)*.07;
      float edge=abs(vSide)+tooth+sin(vAlong*29.0-vSeed)*.08;
      float tip=smoothstep(0.0,.055,vAlong)*(1.0-smoothstep(.91,1.0,vAlong));
      float coverage=(1.0-smoothstep(mix(.65,.36,wash),1.0,edge))*mix(mix(.7,.08,wash),1.0,tip);
      float fibers=.79+.21*grain(floor(gl_FragCoord.xy*.7));
      float dry=1.0-smoothstep(.72,.98,sin(vSide*29.0+vSeed)*sin(vAlong*89.0+vSeed))*.21;
      float fade=wash>.5?smoothstep(.79,.98,progress):smoothstep(.035,.14,progress);
      vec3 pigment=vInk*(.90+.10*abs(vSide));
      if(vKind>2.5&&vKind<3.5){float flow=sin(vWorld.z*.95-time*2.2+sin(vWorld.x*2.4));pigment*=.86+.14*flow;}
      if(vKind>4.5&&vKind<5.5){coverage*=smoothstep(${RIVER_START_Z.toFixed(1)},${(RIVER_START_Z+7).toFixed(1)},vWorld.z)*(1.0-smoothstep(${(RIVER_END_Z-7).toFixed(1)},${RIVER_END_Z.toFixed(1)},vWorld.z));pigment*=1.05+.17*sin(vWorld.z*2.0-time*3.2);}
      if(vKind>5.5&&vKind<6.5){float flicker=.82+.18*sin(time*14.0+vSeed+vWorld.y*2.4);coverage*=flicker;pigment*=1.14+.21*sin(time*8.1+vSeed);}
      if(vKind>6.5&&vKind<7.5){coverage*=smoothstep(0.0,.12,vLife)*(1.0-smoothstep(.65,1.0,vLife));pigment*=1.2;}
      if(vKind>7.5&&vKind<8.5){
        coverage*=smoothstep(0.0,.1,vLife)*(1.0-smoothstep(.42,1.0,vLife));
        coverage*=.8+.2*sin(vAlong*18.0+vSeed+time*.3);
        pigment*=1.0+.16*vLife;
      }
      pigment=lightPigment(seasonPigment(pigment));
      gl_FragColor=vec4(pigment,coverage*fibers*dry*vAlpha*opacity*fade);
      #include <colorspace_fragment>
    }`});
  material.forceSinglePass=true;
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=wash?1:3;
  return{mesh,
    setSourceTransform(matrix){material.uniforms.sourceTransform.value.copy(matrix);},
    setResolution(w,h){material.uniforms.resolution.value.set(w,h);},
    setSeason(state,strength=1){
      const uniforms=material.uniforms;
      uniforms.seasonStrength.value=THREE.MathUtils.clamp(strength,0,1);
      uniforms.seasonWeights.value.set(state.spring,state.summer,state.autumn,state.winter);
      uniforms.seasonWeather.value.set(state.rain,state.snow,state.cloudiness,state.wetness);
      uniforms.seasonExtra.value.set(state.leaves,state.wind);
    },
    setDayCycle(state,strength=1){
      const uniforms=material.uniforms;
      uniforms.cycleStrength.value=THREE.MathUtils.clamp(strength,0,1);
      uniforms.cycleLight.value.set(state.daylight,state.sunset,state.night,state.dawn);
      uniforms.fortressLampPower.value=fortressLightLevel(state);
      const sunCos=Math.cos(state.sunAltitude),moonCos=Math.cos(state.moonAltitude);
      uniforms.sunDirection.value.set(Math.sin(state.sunAzimuth)*sunCos,Math.sin(state.sunAltitude),-Math.cos(state.sunAzimuth)*sunCos);
      uniforms.moonDirection.value.set(Math.sin(state.moonAzimuth)*moonCos,Math.sin(state.moonAltitude),-Math.cos(state.moonAzimuth)*moonCos);
    },
    update(progress,time,mood,opacity){material.uniforms.progress.value=progress;material.uniforms.time.value=time;material.uniforms.mood.value=mood;material.uniforms.opacity.value=opacity;mesh.visible=wash?progress>.79:progress>.025;},
    dispose(){geometry.dispose();material.dispose();}
  };
}
