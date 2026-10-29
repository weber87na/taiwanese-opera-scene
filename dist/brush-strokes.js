import * as THREE from './vendor/three.module.js';

// Camera-facing ribbons keep ink legible at venue resolution. Each ribbon is a
// continuous hand-drawn path; there are no hardware one-pixel WebGL lines.
export function createBrushLayer(strokes, sourcePoint, wash=false) {
  const positions=[],destinations=[],previous=[],next=[],colors=[],inks=[],sides=[],seeds=[],widths=[],worldWidths=[],alphas=[],winds=[],along=[],anchors=[],motionParams=[],indices=[];
  const ink=new THREE.Color(),color=new THREE.Color();
  let vertex=0;
  for(const stroke of strokes){
    const points=stroke.points;if(points.length<2)continue;
    const src=sourcePoint(stroke),seed=src.seed;
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
        sides.push(side);seeds.push(seed);along.push(t);winds.push(stroke.wind||0);
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
  const brushData=new Float32Array(sides.length*4),inkData=new Float32Array(sides.length*3);
  for(let i=0;i<sides.length;i++){brushData.set([sides[i],seeds[i],widths[i],worldWidths[i]],i*4);inkData.set([alphas[i],winds[i],along[i]],i*3);}
  geometry.setAttribute('brushData',new THREE.BufferAttribute(brushData,4));geometry.setAttribute('inkData',new THREE.BufferAttribute(inkData,3));
  geometry.setIndex(indices);
  geometry.setAttribute('motionAnchor',new THREE.Float32BufferAttribute(anchors,3));geometry.setAttribute('motionParams',new THREE.Float32BufferAttribute(motionParams,2));
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,
    uniforms:{progress:{value:0},time:{value:0},mood:{value:0},opacity:{value:1},resolution:{value:new THREE.Vector2(1920,1080)},wash:{value:wash?1:0},sourceTransform:{value:new THREE.Matrix4()}},
    vertexShader:`attribute vec3 destination,previousPoint,nextPoint,finalColor,inkColor,motionAnchor;attribute vec2 motionParams;
    attribute vec4 brushData;attribute vec3 inkData;
    #define side brushData.x
    #define seed brushData.y
    #define brushWidth brushData.z
    #define worldWidth brushData.w
    #define brushAlpha inkData.x
    #define windKind inkData.y
    #define along inkData.z
    uniform float progress,time,mood,wash;uniform vec2 resolution;uniform mat4 sourceTransform;
    varying vec3 vInk,vWorld;varying float vSide,vAlpha,vSeed,vAlong,vKind,vLife;
    float riverX(float z){return 54.0+sin(z*.035)*5.0+sin(z*.069)*1.8;}
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
        float shift=mod(motionAnchor.z+72.0+time*1.7,171.0)-(motionAnchor.z+72.0);
        float z=p.z+shift,x=riverX(z)-riverX(p.z);
        p.x+=x*t;p.z=mix(p.z,z,t);p.y+=sin(time*2.3+p.z)*.045*t;
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
      vWorld=p;vKind=windKind;vLife=fract(time*(windKind>7.5&&windKind<8.5?.13:.4)*motionParams.y+motionParams.x);
    }`,
    fragmentShader:`uniform float progress,opacity,wash,time;varying vec3 vInk,vWorld;varying float vSide,vAlpha,vSeed,vAlong,vKind,vLife;
    float grain(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
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
      if(vKind>4.5&&vKind<5.5){coverage*=smoothstep(-72.0,-67.0,vWorld.z)*(1.0-smoothstep(94.0,99.0,vWorld.z));pigment*=1.05+.17*sin(vWorld.z*2.0-time*3.2);}
      if(vKind>5.5&&vKind<6.5){float flicker=.82+.18*sin(time*14.0+vSeed+vWorld.y*2.4);coverage*=flicker;pigment*=1.14+.21*sin(time*8.1+vSeed);}
      if(vKind>6.5&&vKind<7.5){coverage*=smoothstep(0.0,.12,vLife)*(1.0-smoothstep(.65,1.0,vLife));pigment*=1.2;}
      if(vKind>7.5&&vKind<8.5){
        coverage*=smoothstep(0.0,.1,vLife)*(1.0-smoothstep(.42,1.0,vLife));
        coverage*=.8+.2*sin(vAlong*18.0+vSeed+time*.3);
        pigment*=1.0+.16*vLife;
      }
      gl_FragColor=vec4(pigment,coverage*fibers*dry*vAlpha*opacity*fade);
      #include <colorspace_fragment>
    }`});
  material.forceSinglePass=true;
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=wash?1:3;
  return{mesh,
    setSourceTransform(matrix){material.uniforms.sourceTransform.value.copy(matrix);},
    setResolution(w,h){material.uniforms.resolution.value.set(w,h);},
    update(progress,time,mood,opacity){material.uniforms.progress.value=progress;material.uniforms.time.value=time;material.uniforms.mood.value=mood;material.uniforms.opacity.value=opacity;mesh.visible=wash?progress>.79:progress>.025;},
    dispose(){geometry.dispose();material.dispose();}
  };
}

// Procedural pigment on paper, not a background image. It gives the entire
// stage a warm coloured ground beneath the separate three-dimensional strokes.
export function createPigmentGround(){
  const geometry=new THREE.PlaneGeometry(2,2);
  const material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{progress:{value:0},opacity:{value:1}},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,.999,1.0);}`,
    fragmentShader:`varying vec2 vUv;uniform float progress,opacity;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    void main(){
      float y=vUv.y,wave=sin(vUv.x*9.0+y*13.0)*.025+sin(vUv.x*22.0-y*8.0)*.012;
      vec3 ground=vec3(.67,.54,.32),haze=vec3(.64,.76,.66),sky=vec3(.81,.73,.49);
      vec3 c=mix(ground,haze,smoothstep(.22,.54,y+wave));
      c=mix(c,sky,smoothstep(.62,1.0,y+wave));
      c+=sin(y*50.0+sin(vUv.x*7.0)*1.4)*.012+(hash(floor(gl_FragCoord.xy))-.5)*.025;
      c=mix(vec3(1.0),c,smoothstep(.12,.82,progress)*opacity);
      gl_FragColor=vec4(c,1.0);
    }`});
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=-10;
  return{mesh,update(p,opacity){material.uniforms.progress.value=p;material.uniforms.opacity.value=opacity;},dispose(){geometry.dispose();material.dispose();}};
}
