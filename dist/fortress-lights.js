import * as THREE from './vendor/three.module.js';

// Shared with the brush shader: fronts and backs sit outside the authored wall
// faces, below the real eaves in fortress.js / sketch-fortress.js.
export const FORTRESS_LIGHTS=Object.freeze([
  {position:[-21,9.1,-12.95],normal:[0,0,1],scale:.95},
  {position:[21,9.1,-12.95],normal:[0,0,1],scale:.95},
  {position:[-21,9.1,-19.15],normal:[0,0,-1],scale:.95},
  {position:[21,9.1,-19.15],normal:[0,0,-1],scale:.95},
  {position:[-34,16.55,-11.95],normal:[0,0,1],scale:1.10},
  {position:[34,17.35,-11.95],normal:[0,0,1],scale:1.10},
  {position:[-34,16.55,-23.05],normal:[0,0,-1],scale:1.10},
  {position:[34,17.35,-23.05],normal:[0,0,-1],scale:1.10},
  {position:[-7.5,16.35,-10.95],normal:[0,0,1],scale:1.08},
  {position:[7.5,16.35,-10.95],normal:[0,0,1],scale:1.08},
  {position:[-7.5,16.35,-21.05],normal:[0,0,-1],scale:1.08},
  {position:[7.5,16.35,-21.05],normal:[0,0,-1],scale:1.08},
  {position:[-7.55,5.85,-11.75],normal:[0,0,1],scale:.80},
  {position:[7.55,5.85,-11.75],normal:[0,0,1],scale:.80},
].map(light=>Object.freeze({...light,position:Object.freeze(light.position),normal:Object.freeze(light.normal)})));

export function fortressLightLevel(state){
  return THREE.MathUtils.smoothstep(Math.max(state.night||0,(state.sunset||0)*.65),.05,.85);
}

// World-space brush ribbons make an open ribbed paper lantern, not a luminous
// solid sphere. A second shared batch supplies small depth-tested ink-wash halos.
export function createFortressLights(){
  const positions=[],uvs=[],kinds=[],phases=[],indices=[];
  const haloPositions=[],haloCorners=[],haloScales=[],haloPhases=[],haloIndices=[];
  function ribbon(points,width,side,kind,phase){
    const first=positions.length/3;
    points.forEach((p,i)=>{
      for(const sign of [-1,1]){
        positions.push(p[0]+side[0]*width*sign,p[1]+side[1]*width*sign,p[2]+side[2]*width*sign);
        uvs.push(sign,i/Math.max(1,points.length-1));kinds.push(kind);phases.push(phase);
      }
      if(i<points.length-1){const a=first+i*2;indices.push(a,a+1,a+2,a+2,a+1,a+3);}
    });
  }
  for(let index=0;index<FORTRESS_LIGHTS.length;index++){
    const {position:center,scale}=FORTRESS_LIGHTS[index],phase=index*1.37;
    const point=(x,y,z)=>[center[0]+x*scale,center[1]+y*scale,center[2]+z*scale];
    // Eight separated amber strokes retain white-space gaps and ink ribs.
    for(let rib=0;rib<8;rib++){
      const angle=rib*Math.PI/4,cos=Math.cos(angle),sin=Math.sin(angle);
      const points=Array.from({length:9},(_,i)=>{
        const t=i/8,r=.23+.14*Math.sin(t*Math.PI);
        return point(cos*r,-.48+t*.96,sin*r);
      });
      ribbon(points,.085*scale,[-sin,0,cos],1,phase);
      ribbon(points,.016*scale,[-sin,0,cos],0,phase);
    }
    for(const y of [-.50,.50]){
      const points=Array.from({length:17},(_,i)=>{const angle=i*Math.PI/8;return point(Math.cos(angle)*.245,y,Math.sin(angle)*.245);});
      ribbon(points,.032*scale,[0,1,0],0,phase);
    }
    ribbon([point(0,.53,0),point(.015,.75,0),point(0,1.04,0)],.022*scale,[1,0,0],0,phase);
    for(const offset of [-.10,0,.10])ribbon([point(offset,-.51,0),point(offset*.85,-.69,.01),point(offset+.025,-.85,.01)],.017*scale,[1,0,0],0,phase);
    for(const side of [[1,0,0],[0,0,1]])ribbon([point(0,-.31,0),point(.015,0,.015),point(0,.30,0)],.105*scale,side,2,phase);
    const first=haloPositions.length/3;
    for(const corner of [[-1,-1],[1,-1],[-1,1],[1,1]]){
      haloPositions.push(...center);haloCorners.push(...corner);haloScales.push(scale);haloPhases.push(phase);
    }
    haloIndices.push(first,first+1,first+2,first+2,first+1,first+3);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setAttribute('lampKind',new THREE.Float32BufferAttribute(kinds,1));
  geometry.setAttribute('lampPhase',new THREE.Float32BufferAttribute(phases,1));geometry.setIndex(indices);
  const uniforms={time:{value:0},power:{value:0},strength:{value:0},opacity:{value:1}};
  const material=new THREE.ShaderMaterial({
    name:'Hand-painted warm fortress lanterns',uniforms,transparent:true,depthTest:true,depthWrite:false,
    side:THREE.DoubleSide,forceSinglePass:true,
    vertexShader:`attribute float lampKind,lampPhase;varying vec2 vUv;varying float vKind,vPhase;
      void main(){vUv=uv;vKind=lampKind;vPhase=lampPhase;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`uniform float time,power,strength,opacity;varying vec2 vUv;varying float vKind,vPhase;
      void main(){
        float grain=.84+.16*sin(vUv.y*67.0+vPhase)*sin(vUv.x*21.0+vUv.y*9.0);
        float edge=1.0-smoothstep(.62,1.0,abs(vUv.x)+sin(vUv.y*47.0+vPhase)*.055);
        float flicker=.91+.055*sin(time*4.7+vPhase)+.035*sin(time*8.3-vPhase*.6);
        vec3 colour=vec3(.045,.018,.008);float alpha=edge*.85;
        if(vKind>.5){
          colour=vKind>1.5?vec3(1.0,.74,.27):vec3(.92,.37,.045);
          colour*=flicker;alpha*=power*grain*(vKind>1.5?.98:.78);
        }else{colour=mix(colour,vec3(.14,.055,.012),power*.65);alpha*=.68+.32*power;}
        gl_FragColor=vec4(colour,alpha*strength*opacity);
        #include <colorspace_fragment>
      }`,
  });
  const haloGeometry=new THREE.BufferGeometry();
  haloGeometry.setAttribute('position',new THREE.Float32BufferAttribute(haloPositions,3));
  haloGeometry.setAttribute('corner',new THREE.Float32BufferAttribute(haloCorners,2));
  haloGeometry.setAttribute('lampScale',new THREE.Float32BufferAttribute(haloScales,1));
  haloGeometry.setAttribute('lampPhase',new THREE.Float32BufferAttribute(haloPhases,1));haloGeometry.setIndex(haloIndices);
  const haloMaterial=new THREE.ShaderMaterial({
    name:'Small depth-tested lantern ink washes',uniforms,transparent:true,depthTest:true,depthWrite:false,
    side:THREE.DoubleSide,forceSinglePass:true,
    vertexShader:`attribute vec2 corner;attribute float lampScale,lampPhase;varying vec2 vUv;varying float vPhase;
      void main(){vec4 p=modelViewMatrix*vec4(position,1.0);p.xy+=corner*vec2(1.35,1.55)*lampScale;vUv=corner;vPhase=lampPhase;gl_Position=projectionMatrix*p;}`,
    fragmentShader:`uniform float time,power,strength,opacity;varying vec2 vUv;varying float vPhase;
      void main(){
        float r=dot(vUv,vUv),edge=1.0-smoothstep(.52,1.0,r);
        float wash=exp(-r*3.7)*edge*(.87+.13*sin(vUv.y*22.0+sin(vUv.x*9.0)+vPhase));
        float flicker=.91+.055*sin(time*4.7+vPhase)+.035*sin(time*8.3-vPhase*.6);
        gl_FragColor=vec4(vec3(1.0,.52,.11),wash*.16*power*flicker*strength*opacity);
        #include <colorspace_fragment>
      }`,
  });
  const lanterns=new THREE.Mesh(geometry,material),halos=new THREE.Mesh(haloGeometry,haloMaterial);
  lanterns.frustumCulled=halos.frustumCulled=false;lanterns.renderOrder=7;halos.renderOrder=6;
  const group=new THREE.Group();group.name='Warm lanterns on fortress walls and towers';group.add(halos,lanterns);group.visible=false;
  return{group,
    update(dayState,time,strength,opacity=1){
      uniforms.time.value=time;uniforms.power.value=fortressLightLevel(dayState);
      uniforms.strength.value=THREE.MathUtils.clamp(strength,0,1);uniforms.opacity.value=THREE.MathUtils.clamp(opacity,0,1);
      group.visible=strength>.001&&opacity>.001;halos.visible=uniforms.power.value>.001;
    },
    dispose(){geometry.dispose();haloGeometry.dispose();material.dispose();haloMaterial.dispose();},
  };
}
