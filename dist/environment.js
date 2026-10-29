import * as THREE from './vendor/three.module.js';
import {riverCenterX as riverX,riverHalfWidth,riverHeight,riverExtent,isRiverPoint,RIVER_START_Z,RIVER_END_Z} from './river-layout.js';

// Entirely procedural geometry: no image textures, billboards or imported models.
// Village origin is at y=0; the open centre is deliberately level for the set.
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, v) => THREE.MathUtils.smoothstep(v, a, b);
const mix = THREE.MathUtils.lerp;
const peaks = [
  [-64,-99,48,29,35], [-103,-141,51,36,44], [-25,-161,47,31,40],
  [29,-179,52,31,39], [70,-118,53,30,37], [119,-76,43,38,47],
  [-125,-28,39,36,41], [-115,62,48,34,38], [-66,130,44,35,34],
  [-17,166,49,32,35], [41,147,51,30,38], [91,111,43,34,37],
  [141,22,31,33,46], [-155,137,42,37,38], [130,175,40,37,40],
];

function hash(x,z) {
  const n = Math.sin(x*127.1 + z*311.7)*43758.5453123;
  return n-Math.floor(n);
}
function noise(x,z) {
  const ix=Math.floor(x), iz=Math.floor(z), fx=x-ix, fz=z-iz;
  const u=fx*fx*(3-2*fx), v=fz*fz*(3-2*fz);
  return mix(mix(hash(ix,iz),hash(ix+1,iz),u),mix(hash(ix,iz+1),hash(ix+1,iz+1),u),v);
}
function fbm(x,z) {
  return noise(x,z)*0.54 + noise(x*2.07+19,z*2.07-8)*0.28 + noise(x*4.13-7,z*4.13+25)*0.13 + noise(x*8.11+31,z*8.11)*0.05;
}
function terrainHeight(x,z) {
  const wx=x+(noise(x*0.024,z*0.024)-0.5)*15;
  const wz=z+(noise(x*0.027+41,z*0.027)-0.5)*12;
  let mountain=0;
  for (const [cx,cz,h,sx,sz] of peaks) {
    const q=((wx-cx)/sx)**2+((wz-cz)/sz)**2;
    mountain=Math.max(mountain,h*Math.exp(-q*1.55));
  }
  const ridge = 0.79+fbm(x*0.079,z*0.079)*0.4;
  let height = mountain*ridge + (fbm(x*0.045+6,z*0.045)-0.45)*2.4;
  // A broad flat court and the two camera positions remain unobstructed.
  const side = smooth(30,46,Math.abs(x));
  const end = smooth(68,101,z) + (1-smooth(-108,-76,z));
  const landMask=clamp(Math.max(side,end),0,1);
  height=mix(0.025*(Math.sin(x*.21)+Math.cos(z*.17)),height,landMask);
  // A wider flat bed allows the full water brush and its glints to clear the
  // coarse depth mesh. The long bank blend cuts a continuous mountain valley.
  const halfWidth=riverHalfWidth(z);
  // In the upstream mountains, let the valley climb over a broad foothill.
  // Keeping the short lowland bank there would shear a tall peak into a wall.
  const foothill=1-smooth(-68,-38,z),bankReach=9+17*foothill;
  const channel=(1-smooth(halfWidth+2.3,halfWidth+bankReach,Math.abs(x-riverX(z))))*riverExtent(z);
  height=mix(height,riverHeight(z)-1.25,channel);
  return height;
}

function makeSurfaceMaterial(color, roughness=0.96) {
  const material=new THREE.MeshStandardMaterial({ color, roughness, metalness:0, vertexColors:true });
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vTerrainP;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvTerrainP=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader='varying vec3 vTerrainP;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',
      `#include <color_fragment>
       float grain = sin(vTerrainP.x*8.9+sin(vTerrainP.z*6.3))*sin(vTerrainP.z*10.7+vTerrainP.y*4.0);
       float veins = sin(vTerrainP.x*0.85 + vTerrainP.y*2.2 + sin(vTerrainP.z*1.55));
       diffuseColor.rgb *= 0.94 + grain*0.045 + veins*0.035;`);
  };
  material.customProgramCacheKey=()=> 'mountain-procedural-surface-v1';
  return material;
}

export function createEnvironment({depthOnly=false}={}) {
  const group=new THREE.Group();
  group.name='Procedural mountain valley';
  let seed=734193;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const range=(a,b)=>mix(a,b,random());
  const transform=new THREE.Object3D();
  const tint=new THREE.Color();

  const groundGeometry=new THREE.PlaneGeometry(340,420,depthOnly?112:168,depthOnly?128:160);
  groundGeometry.rotateX(-Math.PI/2);
  groundGeometry.translate(0,0,-10);
  const positions=groundGeometry.attributes.position;
  const colors=new Float32Array(positions.count*3);
  const soil=new THREE.Color('#8d785b');
  const foliage=new THREE.Color('#455344');
  const rock=new THREE.Color('#807e70');
  const scree=new THREE.Color('#8b8a7b');
  const damp=new THREE.Color('#777c72');
  for(let i=0;i<positions.count;i++) {
    const x=positions.getX(i),z=positions.getZ(i),h=terrainHeight(x,z);
    positions.setY(i,h);
    if(depthOnly)continue;
    const dx=(terrainHeight(x+.8,z)-terrainHeight(x-.8,z))/1.6;
    const dz=(terrainHeight(x,z+.8)-terrainHeight(x,z-.8))/1.6;
    const slope=Math.sqrt(dx*dx+dz*dz);
    const vegetation=smooth(1.5,9,h)*(1-smooth(.65,1.7,slope));
    tint.copy(soil).lerp(foliage,vegetation*.88);
    tint.lerp(rock,smooth(.65,1.65,slope)*.77);
    tint.lerp(scree,smooth(32,55,h)*.42);
    const riverGravel=(1-smooth(riverHalfWidth(z),riverHalfWidth(z)+9,Math.abs(x-riverX(z))))*riverExtent(z);
    tint.lerp(damp,riverGravel*.77);
    tint.multiplyScalar(.88+fbm(x*.18,z*.18)*.26);
    colors[i*3]=tint.r;colors[i*3+1]=tint.g;colors[i*3+2]=tint.b;
  }
  groundGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  groundGeometry.computeVertexNormals();
  const ground=new THREE.Mesh(groundGeometry,makeSurfaceMaterial('#ffffff'));
  ground.name='Continuous mountain terrain';
  ground.receiveShadow=true;
  group.add(ground);
  // The ink renderer only needs the terrain silhouette for depth occlusion.
  // Skip all invisible trees, stones, water shaders and decorative instances.
  if(depthOnly)return {group,groundHeight:terrainHeight,update(){}};

  // Low irregular rock forms use a shared small mesh, instanced across the scene.
  const stoneGeometry=new THREE.IcosahedronGeometry(1,1);
  const stoneP=stoneGeometry.attributes.position;
  const stoneColors=new Float32Array(stoneP.count*3);
  for(let i=0;i<stoneP.count;i++) {
    const x=stoneP.getX(i),y=stoneP.getY(i),z=stoneP.getZ(i);
    const lump=.84+noise(x*3.7+3,z*3.7+12)*.27;
    stoneP.setXYZ(i,x*lump,y*(.73+noise(x*2,z*2)*.2),z*lump);
    const shade=.84+noise(x*9+18,y*7+z)*.2;
    stoneColors.set([shade,shade,shade],i*3);
  }
  stoneGeometry.setAttribute('color',new THREE.BufferAttribute(stoneColors,3));
  stoneGeometry.computeVertexNormals();
  const stoneMaterial=makeSurfaceMaterial('#777b72');
  const stones=new THREE.InstancedMesh(stoneGeometry,stoneMaterial,86);
  stones.name='Riverbank and hillside rocks';
  stones.receiveShadow=true; stones.castShadow=true;
  for(let i=0;i<86;i++) {
    let x,z;
    if(i<35){z=range(RIVER_START_Z+12,RIVER_END_Z-8);x=riverX(z)+(random()>.5?1:-1)*(riverHalfWidth(z)+range(2.5,7.5));}
    else{x=(random()>.5?1:-1)*range(35,77);z=range(-76,90);}
    const size=range(.45,2.1);
    transform.position.set(x,terrainHeight(x,z)+size*.18,z);
    transform.rotation.set(range(-.25,.25),range(0,Math.PI*2),range(-.25,.25));
    transform.scale.set(size*range(.9,1.7),size*range(.6,1),size*range(.8,1.4));
    transform.updateMatrix();stones.setMatrixAt(i,transform.matrix);
    tint.set('#8a8b7e').multiplyScalar(range(.78,1.15));stones.setColorAt(i,tint);
  }
  group.add(stones);

  const trunkGeometry=new THREE.CylinderGeometry(.07,.13,1,7,1);
  const trunkMaterial=new THREE.MeshStandardMaterial({color:'#5b4a37',roughness:1});
  const foliageGeometry=new THREE.ConeGeometry(1,1,10,3);
  const fp=foliageGeometry.attributes.position;
  const foliageColors=new Float32Array(fp.count*3);
  for(let i=0;i<fp.count;i++) {
    let x=fp.getX(i),y=fp.getY(i),z=fp.getZ(i);
    const wave=1+(noise(x*6+10,z*6-17)-.5)*.27;
    const droop=(noise(x*11+5,z*11)-.5)*.08*(.5-y);
    fp.setXYZ(i,x*wave,y+droop,z*wave);
    const brightness=.8+(y+.5)*.32+noise(x*13,z*13)*.11;
    foliageColors.set([brightness,brightness,brightness],i*3);
  }
  foliageGeometry.setAttribute('color',new THREE.BufferAttribute(foliageColors,3));
  foliageGeometry.computeVertexNormals();
  const treeCount=101;
  const trunks=new THREE.InstancedMesh(trunkGeometry,trunkMaterial,treeCount);
  const treeMaterial=new THREE.MeshStandardMaterial({color:'#3e5142',vertexColors:true,roughness:1});
  const crowns=new THREE.InstancedMesh(foliageGeometry,treeMaterial,treeCount*3);
  trunks.name='Pine trunks';crowns.name='Layered irregular pine crowns';
  trunks.castShadow=true;crowns.castShadow=true;crowns.receiveShadow=true;
  const treePositions=[];
  for(let i=0;i<treeCount;i++) {
    let x,z;
    if(i<49){x=(random()>.5?1:-1)*range(37,80);z=range(-80,85);}
    else{x=range(-110,110);z=random()>.5?range(99,172):range(-174,-109);}
    if(isRiverPoint(x,z,3))x=riverX(z)+riverHalfWidth(z)+6;
    const y=terrainHeight(x,z),height=range(4,8.5),width=range(1.25,2.2),turn=range(0,6.28);
    treePositions.push([x,y,z]);
    transform.position.set(x,y+height*.38,z);transform.rotation.set(0,turn,range(-.025,.025));
    transform.scale.set(width*.9,height*.77,width*.9);transform.updateMatrix();trunks.setMatrixAt(i,transform.matrix);
    for(let k=0;k<3;k++) {
      const fraction=k/3, crownHeight=height*(.42-fraction*.06),crownWidth=width*(1-fraction*.68);
      transform.position.set(x+Math.sin(turn)*fraction*.15,y+height*(.47+fraction*.61),z+Math.cos(turn)*fraction*.15);
      transform.rotation.set(0,turn+k*.8,range(-.02,.02));
      transform.scale.set(crownWidth,crownHeight,crownWidth*range(.85,1.05));transform.updateMatrix();
      crowns.setMatrixAt(i*3+k,transform.matrix);
      tint.set('#73806a').multiplyScalar(range(.75,1.1));crowns.setColorAt(i*3+k,tint);
    }
  }
  group.add(trunks,crowns);

  const shrubs=new THREE.InstancedMesh(stoneGeometry,new THREE.MeshStandardMaterial({color:'#4f5f42',roughness:1,vertexColors:true}),74);
  shrubs.name='Low hillside shrubs';shrubs.receiveShadow=true;shrubs.castShadow=true;
  for(let i=0;i<74;i++) {
    const [tx,ty,tz]=treePositions[i%treePositions.length];
    const x=tx+range(-5,5),z=tz+range(-5,5),size=range(.6,1.8);
    transform.position.set(x,terrainHeight(x,z)+size*.23,z);transform.rotation.set(0,range(0,6.28),0);
    transform.scale.set(size,size*range(.55,.85),size*range(.7,1.3));transform.updateMatrix();shrubs.setMatrixAt(i,transform.matrix);
    tint.set('#83906a').multiplyScalar(range(.75,1.1));shrubs.setColorAt(i,tint);
  }
  group.add(shrubs);

  const pebbles=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:'#8b8271',roughness:1}),116);
  pebbles.name='Small ground stones';pebbles.receiveShadow=true;
  for(let i=0;i<116;i++) {
    const x=(random()>.5?1:-1)*range(18,44),z=range(-72,77),s=range(.08,.34);
    transform.position.set(x,terrainHeight(x,z)+s*.3,z);transform.rotation.set(range(-.4,.4),range(0,6.28),0);
    transform.scale.set(s*1.6,s*.55,s);transform.updateMatrix();pebbles.setMatrixAt(i,transform.matrix);
  }
  group.add(pebbles);

  // Water follows the same widened valley as the visible ink representation.
  const riverPositions=[],riverUV=[],riverIndices=[];
  const riverSegments=150;
  for(let i=0;i<=riverSegments;i++) {
    const z=mix(RIVER_START_Z,RIVER_END_Z,i/riverSegments),centre=riverX(z),halfWidth=riverHalfWidth(z);
    for(let side=0;side<2;side++) {
      riverPositions.push(centre+(side===0?-halfWidth:halfWidth),riverHeight(z),z);
      riverUV.push(side,i/riverSegments);
    }
    if(i<riverSegments){const n=i*2;riverIndices.push(n,n+2,n+1,n+1,n+2,n+3);}
  }
  const riverGeometry=new THREE.BufferGeometry();
  riverGeometry.setAttribute('position',new THREE.Float32BufferAttribute(riverPositions,3));
  riverGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(riverUV,2));riverGeometry.setIndex(riverIndices);riverGeometry.computeVertexNormals();
  const riverMaterial=new THREE.ShaderMaterial({
    transparent:false,side:THREE.DoubleSide,fog:true,
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{time:{value:0},mood:{value:0}}]),
    vertexShader:`
      #include <fog_pars_vertex>
      varying vec2 vUv; varying vec3 vWorld;
      void main(){ vUv=uv; vWorld=(modelMatrix*vec4(position,1.)).xyz;
        vec4 mvPosition=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:`
      #include <fog_pars_fragment>
      uniform float time;uniform float mood;varying vec2 vUv;varying vec3 vWorld;
      void main(){
        float a=sin(vWorld.z*4.7-time*.62+sin(vWorld.x*6.2+time*.21));
        float b=sin(vWorld.z*9.6-time*.9+vWorld.x*3.1);
        float shimmer=pow(max(0.,a*b),9.);
        vec3 water=mix(vec3(.20,.34,.32),vec3(.19,.28,.32),mood);
        float edge=smoothstep(.32,.49,abs(vUv.x-.5));
        water=mix(water,vec3(.35,.40,.35),edge*.65);
        water+=shimmer*.2+vec3(.02,.035,.035)*a;
        gl_FragColor=vec4(water,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  });
  const river=new THREE.Mesh(riverGeometry,riverMaterial);river.name='Procedural flowing river';group.add(river);

  return {
    group,
    groundHeight:terrainHeight,
    update(time,mood=0) {
      riverMaterial.uniforms.time.value=time;
      riverMaterial.uniforms.mood.value=clamp(mood,0,1);
    },
  };
}
