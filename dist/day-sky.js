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

// A paper wash and a separate, depth-tested celestial layer. The existing
// terrain/fortress depth pass masks stars and discs behind the painted hills.
// Rays live in world space, so orbiting the scene also turns through the sky.
export function createDaySky(){
  const geometry=new THREE.PlaneGeometry(2,2);
  const uniforms={
    progress:{value:0},opacity:{value:1},strength:{value:0},time:{value:0},
    light:{value:new THREE.Vector4(1,0,0,0)},
    sunDirection:{value:new THREE.Vector3()},moonDirection:{value:new THREE.Vector3()},
    inverseProjection:{value:new THREE.Matrix4()},cameraRotation:{value:new THREE.Matrix3()},
    seasons:{value:new THREE.Vector4(1,0,0,0)},weather:{value:new THREE.Vector4()},seasonStrength:{value:0},
    rainbowAmount:{value:0},auroraMix:{value:new THREE.Vector3(1,0,0)},
  };
  const auroraState={};
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
        float horizon=exp(-pow((ray.y-.08)*6.0,2.0));
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
    name:'Ink sun moon stars aurora and after-rain rainbow',transparent:true,depthTest:true,depthWrite:false,
    uniforms,vertexShader,fragmentShader:`
      varying vec2 vUv;varying vec3 vRay;
      uniform vec4 light,weather;uniform float strength,opacity,time,seasonStrength,rainbowAmount;
      uniform vec3 sunDirection,moonDirection,auroraMix;
      ${noise}
      vec4 curtainAurora(vec3 ray){
        float azimuth=atan(ray.x,-ray.z),altitude=asin(clamp(ray.y,-1.0,1.0));
        float drift=time*.028;
        vec3 ink=vec3(0.0);float coverage=0.0;
        // Two layered curtains, with a luminous lower hem and loose vertical
        // fibres. Integer azimuth frequencies join seamlessly through 360°.
        for(int layer=0;layer<2;layer++){
          float index=float(layer),phase=index*2.37;
          float folds=sin(azimuth*3.0+drift+phase)*.037
            +sin(azimuth*7.0-drift*.73+phase)*.016;
          float hem=.105+index*.065+folds;
          float height=altitude-hem;
          float reach=.23+.065*sin(azimuth*2.0+drift*.46+phase);
          float rise=smoothstep(-.018,.016,height);
          float veil=rise*exp(-max(0.0,height)*8.3)
            *(1.0-smoothstep(reach*.62,reach,height));
          float threads=azimuth*126.0+sin(azimuth*9.0-drift*.8+phase)*5.0;
          float fibres=.48+.32*pow(.5+.5*sin(threads+phase),3.0)
            +.20*pow(.5+.5*sin(azimuth*211.0+drift*.4+phase),5.0);
          float pools=.52+.48*smoothstep(-.75,.85,sin(azimuth*2.0-drift*.32+phase));
          float rim=exp(-abs(height)*85.0)*.21;
          float grain=.86+.14*noise(ray.xz*48.0+vec2(drift*.13,ray.y*37.0));
          float breathing=.86+.14*sin(drift*.61+phase);
          float alpha=clamp((veil*fibres*.62+rim)*pools*grain*breathing,0.0,.62);
          alpha*=layer==0?1.0:.67;
          vec3 green=mix(vec3(.16,.79,.48),vec3(.10,.66,.69),index);
          vec3 colour=mix(green,vec3(.43,.25,.66),smoothstep(.035,.22,height)*.72);
          colour+=vec3(.11,.15,.075)*exp(-abs(height)*65.0);
          ink=colour*alpha+ink*(1.0-alpha);
          coverage=alpha+coverage*(1.0-alpha);
        }
        return vec4(ink,coverage);
      }
      vec4 ribbonAurora(vec3 ray){
        float azimuth=atan(ray.x,-ray.z),altitude=asin(clamp(ray.y,-1.0,1.0));
        float drift=time*.035;
        vec3 ink=vec3(0.0);float coverage=0.0;
        // Broad braided brush ribbons replace the curtain's vertical fringe.
        // Every azimuth wave has an integer frequency, including fine threads.
        for(int layer=0;layer<2;layer++){
          float index=float(layer),phase=index*2.6;
          float path=.21+index*.075+sin(azimuth*2.0+drift+phase)*.064
            +sin(azimuth*5.0-drift*.63+phase)*.025;
          float width=.022+.013*(.5+.5*sin(azimuth*3.0+drift*.47+phase));
          float d=(altitude-path)/width;
          float body=exp(-d*d*.72);
          float edge=exp(-(d+.53)*(d+.53)*9.0)*.23;
          float threads=.76+.24*sin(d*5.5+sin(azimuth*11.0-drift)*1.2);
          float pools=.50+.50*smoothstep(-.65,.88,sin(azimuth*3.0-drift*.35+phase));
          float alpha=clamp((body*threads*.45+edge)*pools*(1.0-index*.25),0.0,.58);
          vec3 colour=mix(vec3(.17,.70,.80),vec3(.57,.29,.77),smoothstep(-1.1,1.1,d));
          colour=mix(colour,vec3(.33,.82,.62),index*.38);
          ink=colour*alpha+ink*(1.0-alpha);coverage=alpha+coverage*(1.0-alpha);
        }
        return vec4(ink,coverage);
      }
      vec4 coronaAurora(vec3 ray){
        float azimuth=atan(ray.x,-ray.z),altitude=asin(clamp(ray.y,-1.0,1.0));
        float drift=time*.024;
        // Three soft fans surround the valley. The wrapped local angle and
        // direction-space grain keep their joins continuous behind the camera.
        float angle=(azimuth+.35-drift*.18)*3.0;
        float local=atan(sin(angle),cos(angle))/3.0;
        float height=max(.0,altitude-.035),spread=.085+height*.78;
        float fan=exp(-local*local/(spread*spread));
        float veil=smoothstep(.025,.13,altitude)*(1.0-smoothstep(.30,.64,altitude));
        float rayAngle=atan(local,height+.075);
        float rays=pow(max(0.0,cos(rayAngle*41.0+sin(height*7.0-drift)*.7)),8.0);
        float mist=noise(ray.xz*9.0+vec2(drift*.21,altitude*17.0));
        float breathing=.80+.20*sin(drift*.7+sin(azimuth*3.0));
        float alpha=fan*veil*(.14+.29*rays+.15*mist)*breathing;
        vec3 colour=mix(vec3(.68,.26,.49),vec3(.42,.34,.78),smoothstep(.04,.24,altitude));
        colour=mix(colour,vec3(.24,.64,.73),smoothstep(.22,.53,altitude)*.65);
        return vec4(colour*alpha,alpha);
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
        float band=(.420-angle)/.038;
        float softBand=smoothstep(-.035,.085,band)*(1.0-smoothstep(.91,1.035,band));
        float paperGrain=.87+.13*noise(ray.xz*74.0+ray.y*17.0);
        float alpha=softBand*amount*.29*paperGrain*smoothstep(.015,.10,ray.y);
        vec3 colour=mix(rainbowPigment(clamp(band,0.0,1.0)),vec3(.88,.91,.92),.23);
        return vec4(colour*alpha,alpha);
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
        float moonHalo=exp(-moonDist*moonDist/.0035)*.15;
        float moonVisible=light.z*smoothstep(-.03,.06,moonDirection.y);
        float moonAlpha=max(moonDisc*.97,moonHalo)*moonVisible;
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
      direction(uniforms.sunDirection.value,state.sunAltitude,state.sunAzimuth);
      direction(uniforms.moonDirection.value,state.moonAltitude,state.moonAzimuth);
      uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
      uniforms.cameraRotation.value.setFromMatrix4(camera.matrixWorld);
      celestial.visible=strength>.001;
    },
    update(progress,opacity){uniforms.progress.value=progress;uniforms.opacity.value=opacity;},
    dispose(){geometry.dispose();washMaterial.dispose();celestialMaterial.dispose();},
  };
}
