import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {createEnvironment} from '../dist/environment.js';
import {createFlowerLayout, isFlowerSiteAllowed} from '../dist/flower-layout.js';
import {createSpringFlowers} from '../dist/spring-flowers.js';
import {normalizeSeasonSettings, sampleSeasonCycle} from '../dist/season-cycle.js';
import {sampleDayCycle} from '../dist/day-cycle.js';
import {riverCenterX,riverHalfWidth,RIVER_START_Z,RIVER_END_Z} from '../dist/river-layout.js';

const environment=createEnvironment({depthOnly:true});
const {groundHeight}=environment;
const plants=createFlowerLayout(groundHeight);
const config=normalizeSeasonSettings();
const season=(phase,settings=config)=>sampleSeasonCycle(phase*settings.durationSeconds,settings);
const meshes=flowers=>flowers.group.children.filter(child=>child.isMesh);
after(()=>{
  const resources=new Set();
  environment.group.traverse(object=>{
    if(object.geometry)resources.add(object.geometry);
    for(const material of [object.material].flat())if(material)resources.add(material);
  });
  for(const resource of resources)resource.dispose();
});

test('flower anchors are deterministic, finite and fixed to the actual landscape',()=>{
  assert.ok(plants.length>=1200&&plants.length<=1800,'a full spring landscape needs many flowers');
  assert.deepEqual(createFlowerLayout(groundHeight),plants);
  const colours=new Array(5).fill(0);
  let earliest=1,latest=0;
  for(const plant of plants){
    for(const value of Object.values(plant))assert.ok(Number.isFinite(value));
    assert.equal(plant.y,groundHeight(plant.x,plant.z)+.48,'stem anchors must follow the terrain');
    assert.ok(plant.height>=1&&plant.height<=2.4);
    assert.ok(plant.size>=.35&&plant.size<=1,'flower crowns must remain landscape scale');
    for(const key of ['seed','palette','opening'])assert.ok(plant[key]>=0&&plant[key]<=1);
    colours[Math.min(4,Math.floor(plant.palette*5))]++;
    earliest=Math.min(earliest,plant.opening);latest=Math.max(latest,plant.opening);
  }
  for(const count of colours)assert.ok(count>100,'all five flower colour families need visible populations');
  assert.ok(latest-earliest>.5,'several flower beds should open in separate waves');
  assert.throws(()=>createFlowerLayout(),TypeError);
});

test('flowers preserve the gate approach, architecture, fire clearings and dry ground',()=>{
  // Independently use the architecture dimensions from fortress.js rather than
  // accepting the layout's own site predicate as the only source of truth.
  const footprints=[
    [-45.4,45.4,-18.5,-13.5],[-14,14,-22.2,-9.8],
    [-40,-28,-22.85,-12.15],[28,40,-22.85,-12.15],
    [-38.5,-21.5,-49.5,-36.5],[20,40,-49.5,-36.5],
    [-12.5,12.5,-93,-79],
  ];
  for(const {x,z} of plants){
    assert.ok(!(Math.abs(x)<=8&&z>=-12&&z<=60),'keep the central walkway empty');
    assert.ok(!footprints.some(([left,right,back,front])=>x>=left&&x<=right&&z>=back&&z<=front),'no flowers on a building footprint');
    assert.ok(Math.hypot(x+13,z-10)>=5&&Math.hypot(x-15,z-13)>=5,'clear both campfires');
    if(z>=RIVER_START_Z&&z<=RIVER_END_Z)assert.ok(Math.abs(x-riverCenterX(z))>=riverHalfWidth(z)+2.5,'no flowers in the expanded river or its immediate banks');
    const dx=(groundHeight(x+.8,z)-groundHeight(x-.8,z))/1.6;
    const dz=(groundHeight(x,z+.8)-groundHeight(x,z-.8))/1.6;
    assert.ok(Math.hypot(dx,dz)<=1,'flowers should occupy gentle slopes');
    assert.equal(isFlowerSiteAllowed(x,z,groundHeight),true);
  }
  for(const [x,z] of [[0,35],[0,-16],[-34,-17.5],[30,-43],[-30,-43],[0,-86],[-13,10],[15,13],[54,0]]){
    assert.equal(isFlowerSiteAllowed(x,z,groundHeight),false,`protected site ${x},${z}`);
  }
  assert.equal(isFlowerSiteAllowed(70,70,x=>x*2),false,'reject steep replacement terrain');
  assert.equal(isFlowerSiteAllowed(70,70,()=>NaN),false);
  assert.equal(isFlowerSiteAllowed(NaN,70,groundHeight),false);
});

test('flower beds fill both foreground banks and remain present around the whole set',()=>{
  for(const side of [-1,1]){
    assert.ok(plants.filter(p=>p.x*side>8&&p.z>18&&p.z<60).length>300,'both foreground sides need a substantial flower bed');
    for(const front of [-1,1]){
      assert.ok(plants.filter(p=>p.x*side>20&&p.z*front>24).length>100,'every view quadrant needs flowers');
    }
  }
  assert.ok(plants.filter(p=>p.z>60).length>100,'flowers continue behind the opening camera');
  assert.ok(plants.filter(p=>p.z<-24).length>250,'flowers continue behind the fortress');
  assert.ok(plants.filter(p=>Math.abs(p.x)>45).length>300,'foothill beds surround the main composition');
});

test('spring flowers only appear after scene reveal and hide outside spring or at zero opacity',t=>{
  const flowers=createSpringFlowers(groundHeight);t.after(()=>flowers.dispose());
  const spring=season(.08),day=sampleDayCycle(0);
  assert.equal(flowers.group.visible,false,'initial paper drawing must stay empty');
  for(const [state,strength,opacity] of [[spring,0,1],[spring,1,0],[season(.33),1,1],[season(.58),1,1],[season(.83),1,1]]){
    flowers.update(state,day,20,strength,opacity);
    assert.equal(flowers.group.visible,false);
  }
  flowers.update(spring,day,20,1,1);
  assert.equal(flowers.group.visible,true);
  for(const mesh of meshes(flowers))assert.ok(mesh.material.uniforms.opacity.value>0);
  flowers.update(undefined,undefined,NaN,1);
  assert.equal(flowers.group.visible,false,'missing season state must not flash flowers');
});

test('flower growth survives disabled weather and responds to both seasonal and day cycles',t=>{
  const flowers=createSpringFlowers(groundHeight);t.after(()=>flowers.dispose());
  for(const settings of [config,{...config,weatherEnabled:false},{...config,weatherIntensity:0}]){
    const spring=season(.08,settings);
    for(const phase of [0,.34,.65,.9]){
      const day=sampleDayCycle(phase*120);
      flowers.update(spring,day,phase*120,1,1);
      assert.equal(flowers.group.visible,true,'full spring bloom continues through the night and clear weather');
      for(const mesh of meshes(flowers)){
        assert.equal(mesh.material.uniforms.bloom.value,1);
        assert.equal(mesh.material.uniforms.night.value,day.night);
      }
    }
  }
  flowers.update(season(.02),sampleDayCycle(0),4.8,1,1);
  for(const mesh of meshes(flowers))assert.ok(mesh.material.uniforms.bloom.value>0&&mesh.material.uniforms.bloom.value<1,'early spring starts with opening buds');
});

test('seasonal animation reuses all GPU geometry and buffers without rebuilding flower positions',t=>{
  const flowers=createSpringFlowers(groundHeight);t.after(()=>flowers.dispose());
  const initialMeshes=[...meshes(flowers)];
  assert.ok(initialMeshes.length>0&&initialMeshes.length<=3,'flower count must not become one draw call per plant');
  const snapshots=initialMeshes.map(mesh=>({
    mesh,geometry:mesh.geometry,material:mesh.material,index:mesh.geometry.index,
    attributes:Object.entries(mesh.geometry.attributes).map(([name,attribute])=>({name,attribute,array:attribute.array,values:attribute.array.slice()})),
  }));
  for(const snapshot of snapshots)assert.equal(snapshot.geometry.instanceCount,plants.length);
  const state={},day={};
  for(let frame=0;frame<240;frame++){
    const elapsed=frame*2;
    flowers.update(sampleSeasonCycle(elapsed,config,state),sampleDayCycle(elapsed,undefined,day),elapsed,1,1);
  }
  assert.deepEqual(meshes(flowers),initialMeshes);
  for(const snapshot of snapshots){
    assert.equal(snapshot.mesh.geometry,snapshot.geometry);assert.equal(snapshot.mesh.material,snapshot.material);
    assert.equal(snapshot.geometry.index,snapshot.index);
    for(const {name,attribute,array,values} of snapshot.attributes){
      assert.equal(snapshot.geometry.getAttribute(name),attribute);
      assert.equal(snapshot.geometry.getAttribute(name).array,array);
      assert.deepEqual(array,values,'wind and bloom must animate on the GPU, without changing the planted layout');
    }
  }
});

test('disposing flowers releases each allocated geometry and material exactly once',()=>{
  const flowers=createSpringFlowers(groundHeight),events=new Map();
  for(const mesh of meshes(flowers))for(const resource of [mesh.geometry,mesh.material]){
    if(events.has(resource))continue;
    events.set(resource,0);
    resource.addEventListener('dispose',()=>events.set(resource,events.get(resource)+1));
  }
  assert.ok(events.size>0);
  flowers.dispose();
  for(const count of events.values())assert.equal(count,1);
});
