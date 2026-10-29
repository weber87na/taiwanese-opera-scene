import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createWeatherParticles} from '../dist/weather-particles.js';
import {normalizeSeasonSettings,sampleSeasonCycle} from '../dist/season-cycle.js';
import {sampleDayCycle} from '../dist/day-cycle.js';
import {isRiverPoint} from '../dist/river-layout.js';

const config=normalizeSeasonSettings();
const terrain=(x,z)=>x*.01+z*.02;
const meshes=weather=>weather.group.children.filter(child=>child.isMesh);
const layer=(weather,name)=>weather.group.getObjectByName(`GPU ${name}`);
const season=(phase,settings=config)=>sampleSeasonCycle(phase*settings.durationSeconds,settings);
const spread=values=>Math.max(...values)-Math.min(...values);

test('weather keeps batched world-space anchors, terrain heights and depth occlusion',t=>{
  assert.throws(()=>createWeatherParticles(),TypeError);
  const weather=createWeatherParticles(terrain);t.after(()=>weather.dispose());
  assert.equal(meshes(weather).length,4,'weather stays in four instanced batches');
  assert.equal(layer(weather,'rain').geometry.instanceCount,1600,'rain population is unchanged');
  assert.equal(layer(weather,'ripples').geometry.instanceCount,120,'ripple population is unchanged');
  for(const mesh of meshes(weather)){
    const geometry=mesh.geometry,origin=geometry.getAttribute('origin');
    assert.equal(geometry.isInstancedBufferGeometry,true);
    assert.equal(origin.count,geometry.instanceCount);
    assert.equal(mesh.material.depthTest,true,'scenery must hide particles behind terrain and roofs');
    assert.equal(mesh.material.depthWrite,false,'transparent weather must not occlude other ink');
    assert.equal(mesh.frustumCulled,false,'shader-moved particles must remain available around the full set');
    const quadrants=new Set();
    for(let i=0;i<origin.count;i++){
      const x=origin.getX(i),y=origin.getY(i),z=origin.getZ(i);
      assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z));
      assert.ok(Math.abs(y-terrain(x,z))<1e-5,'anchors must use terrain at their fixed world coordinates');
      quadrants.add(`${x<0}:${z<0}`);
    }
    assert.equal(quadrants.size,4,'weather surrounds the set for 360-degree camera movement');
  }
});

test('every snow and leaf shape has its own varied size, falling speed and rotation',t=>{
  const weather=createWeatherParticles(terrain);t.after(()=>weather.dispose());
  assert.deepEqual(weather.group.userData.shapeNames.snow,['powder','fluff','broken-brush','thin-flake']);
  for(const name of ['snow','leaves']){
    const geometry=layer(weather,name).geometry;
    const variation=geometry.getAttribute('variation'),particle=geometry.getAttribute('particle');
    assert.ok(variation?.isInstancedBufferAttribute,`${name} variation must be stored per instance`);
    assert.equal(variation.itemSize,4);assert.equal(variation.count,geometry.instanceCount);
    // Contract: variation.x is one of four shape families, variation.z is the
    // rotation seed; particle.y/z retain falling speed and size respectively.
    const families=Array.from({length:4},()=>({sizes:[],speeds:[],spins:[]}));
    for(let i=0;i<variation.count;i++){
      const shape=variation.getX(i);
      assert.ok(Number.isInteger(shape)&&shape>=0&&shape<families.length,`${name} has a valid shape family`);
      for(const value of [variation.getY(i),variation.getZ(i),variation.getW(i)]){
        assert.ok(Number.isFinite(value)&&value>=0&&value<=1,`${name} variation seeds are normalized`);
      }
      const size=particle.getZ(i),speed=particle.getY(i);
      assert.ok(size>0&&Number.isFinite(size));assert.ok(speed>0&&Number.isFinite(speed));
      families[shape].sizes.push(size);families[shape].speeds.push(speed);families[shape].spins.push(variation.getZ(i));
    }
    for(const [shape,family] of families.entries()){
      assert.ok(family.sizes.length>=10,`${name} shape ${shape} needs a visible population`);
      assert.ok(spread(family.sizes)>.2,`${name} shape ${shape} must not repeat one size`);
      assert.ok(spread(family.speeds)>.3,`${name} shape ${shape} must not fall in lockstep`);
      assert.ok(spread(family.spins)>.4,`${name} shape ${shape} must not repeat one rotation`);
    }
  }
});

test('ink drops and ground blooms share world endpoints and lifecycle data without adding batches',t=>{
  const weather=createWeatherParticles(terrain);t.after(()=>weather.dispose());
  const rain=layer(weather,'rain').geometry,ripples=layer(weather,'ripples').geometry;
  const inkCount=weather.group.userData.inkDropCount;
  assert.equal(inkCount,120);assert.equal(meshes(weather).length,4);
  assert.equal(weather.group.userData.foregroundInkDropCount,40);
  assert.equal(inkCount,ripples.instanceCount,'each visible bloom must have one falling drop');
  for(let i=0;i<inkCount;i++){
    assert.equal(rain.getAttribute('variation').getX(i),5,'only the paired subset uses the loaded ink tip');
    for(const attributeName of ['origin','particle','inkTiming']){
      const rainData=rain.getAttribute(attributeName),impactData=ripples.getAttribute(attributeName);
      assert.equal(rainData.itemSize,impactData.itemSize);
      for(let component=0;component<rainData.itemSize;component++){
        const offset=i*rainData.itemSize+component;
        assert.equal(rainData.array[offset],impactData.array[offset],`${attributeName} component ${component} must match at impact ${i}`);
      }
    }
    assert.ok(rain.getAttribute('particle').getY(i)>=23,'ground blooms must use fall speed, not their former unrelated ripple clock');
    const timing=rain.getAttribute('inkTiming'),fallSeconds=timing.getX(i),soakSeconds=timing.getY(i);
    assert.ok(Math.abs(fallSeconds*rain.getAttribute('particle').getY(i)-76)<.00001,'drop reaches the shared endpoint at its declared impact time');
    assert.ok(soakSeconds>=2.2&&soakSeconds<=2.8,'paper absorption stays visible for seconds, independent of the fall speed');
    assert.ok(fallSeconds+soakSeconds<6.2,'each paired field is recycled within a bounded lifetime');
  }
  for(let i=inkCount;i<rain.instanceCount;i++)assert.ok(rain.getAttribute('variation').getX(i)<4,'ordinary rain remains the majority');
  const anchors=ripples.getAttribute('origin');
  for(let i=0;i<40;i++){
    const x=anchors.getX(i),z=anchors.getZ(i);
    assert.ok(x>=-58&&x<=58&&z>=14&&z<=65,'stage-facing ink accents stay on foreground ground');
    assert.equal(isRiverPoint(x,z,3),false,'ground blooms must not sit below river water');
    assert.ok(Math.hypot(x+13,z-10)>=6.5&&Math.hypot(x-15,z-13)>=6.5,'leave the campfires clear');
  }
});

test('only current weather appears and intro, clear periods and disabled weather hide every batch',t=>{
  const weather=createWeatherParticles(terrain);t.after(()=>weather.dispose());
  const visibleNames=()=>meshes(weather).filter(mesh=>mesh.visible).map(mesh=>mesh.name).sort();
  assert.equal(weather.group.visible,false);
  for(const [phase,names] of [[.32,['rain','ripples']],[.58,['leaves']],[.84,['snow']]]){
    weather.update(season(phase),sampleDayCycle(78),phase*240,1,1);
    assert.equal(weather.group.visible,true);
    assert.deepEqual(visibleNames(),names.map(name=>`GPU ${name}`).sort());
  }
  for(const [state,strength,opacity] of [
    [season(.84),0,1],[season(.84),1,0],[season(.251),1,1],
    [season(.84,{...config,weatherEnabled:false}),1,1],
    [season(.84,{...config,weatherIntensity:0}),1,1],
    [season(.84,{...config,enabled:false}),1,1],
  ]){
    weather.update(state,sampleDayCycle(0),40,strength,opacity);
    assert.equal(weather.group.visible,false);
    assert.deepEqual(visibleNames(),[],'previous weather must not remain visible');
  }
});

test('large colour blooms follow nine terrain samples across their complete fixed footprint',t=>{
  const curvedTerrain=(x,z)=>.03*x+.02*z+.002*x*x+.001*z*z;
  const weather=createWeatherParticles(curvedTerrain);t.after(()=>weather.dispose());
  const geometry=layer(weather,'ripples').geometry;
  const origin=geometry.getAttribute('origin'),particle=geometry.getAttribute('particle');
  assert.equal(geometry.getAttribute('position').count,9,'one shared 3 by 3 grid bends each large wash onto terrain');
  assert.equal(geometry.index.count,24,'the expanded wash stays in a single eight-triangle instanced surface');
  for(let i=0;i<geometry.instanceCount;i++){
    const radius=4.8+particle.getZ(i)*1.7;
    assert.ok(radius>=5.1&&radius<=6.5,'colour washes are large enough to read in the stage-wide view');
    for(let row=0;row<3;row++){
      const heights=geometry.getAttribute(`inkGround${row}`);
      assert.equal(heights.count,geometry.instanceCount);
      for(let column=0;column<3;column++){
        const expected=curvedTerrain(origin.getX(i)+(column-1)*radius,origin.getZ(i)+(row-1)*radius);
        assert.ok(Math.abs(heights.array[i*3+column]-expected)<.00002,'all corners and centre use terrain samples, not a tangent-plane extrapolation');
      }
    }
  }
});

test('seasons and day lighting update uniforms while all world anchors and GPU buffers are reused',t=>{
  let terrainSamples=0;
  const weather=createWeatherParticles((x,z)=>{terrainSamples++;return terrain(x,z);});
  t.after(()=>weather.dispose());
  const sampledAtBuild=terrainSamples,initialMeshes=[...meshes(weather)];
  const snapshots=initialMeshes.map(mesh=>({
    mesh,geometry:mesh.geometry,material:mesh.material,index:mesh.geometry.index,
    position:mesh.position.clone(),quaternion:mesh.quaternion.clone(),scale:mesh.scale.clone(),
    attributes:Object.entries(mesh.geometry.attributes).map(([name,attribute])=>({name,attribute,array:attribute.array,values:attribute.array.slice()})),
  }));
  const state={},day={};
  for(let frame=0;frame<300;frame++){
    const elapsed=frame*2;
    weather.update(sampleSeasonCycle(elapsed,config,state),sampleDayCycle(elapsed,undefined,day),elapsed,1,1);
  }
  assert.equal(terrainSamples,sampledAtBuild,'animation must not rebuild terrain samples');
  assert.deepEqual(meshes(weather),initialMeshes);
  for(const snapshot of snapshots){
    assert.equal(snapshot.mesh.geometry,snapshot.geometry);assert.equal(snapshot.mesh.material,snapshot.material);
    assert.equal(snapshot.geometry.index,snapshot.index);
    assert.ok(snapshot.mesh.position.equals(snapshot.position));
    assert.ok(snapshot.mesh.quaternion.equals(snapshot.quaternion));
    assert.ok(snapshot.mesh.scale.equals(snapshot.scale));
    for(const {name,attribute,array,values} of snapshot.attributes){
      assert.equal(snapshot.geometry.getAttribute(name),attribute);
      assert.equal(attribute.array,array);assert.deepEqual(array,values,`${name} must stay uploaded and unchanged`);
    }
    assert.equal(snapshot.material.uniforms.time.value,598);
    assert.equal(snapshot.material.uniforms.night.value,day.night);
  }
});

test('disposing weather releases every allocated geometry and material exactly once',()=>{
  const weather=createWeatherParticles(terrain),events=new Map();
  for(const mesh of meshes(weather))for(const resource of [mesh.geometry,mesh.material]){
    if(events.has(resource))continue;
    events.set(resource,0);
    resource.addEventListener('dispose',()=>events.set(resource,events.get(resource)+1));
  }
  weather.dispose();
  assert.ok(events.size>0);
  for(const count of events.values())assert.equal(count,1);
});
