import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {createEnvironment} from '../dist/environment.js';
import {isFlowerSiteAllowed} from '../dist/flower-layout.js';
import {createSeasonLife} from '../dist/season-life.js';
import {sampleSeasonCycle,normalizeSeasonSettings} from '../dist/season-cycle.js';
import {sampleDayCycle} from '../dist/day-cycle.js';

const environment=createEnvironment({depthOnly:true}),groundHeight=environment.groundHeight;
const config=normalizeSeasonSettings();
const season=(phase,settings=config)=>sampleSeasonCycle(phase*240,settings);
const day=sampleDayCycle(0),night=sampleDayCycle(78);
const named=(life,name)=>life.group.children.find(mesh=>mesh.name===`GPU ${name}`);
after(()=>{
  const resources=new Set();
  environment.group.traverse(object=>{
    if(object.geometry)resources.add(object.geometry);
    for(const material of [object.material].flat())if(material)resources.add(material);
  });
  for(const resource of resources)resource.dispose();
});

test('insects are distributed around real flower beds with safe, elevated flight anchors',t=>{
  const life=createSeasonLife(groundHeight);t.after(()=>life.dispose());
  assert.equal(life.group.children.length,2,'many insects should remain only two draw calls');
  for(const mesh of life.group.children){
    const butterfly=mesh.name==='GPU butterflies',geometry=mesh.geometry;
    const origins=geometry.getAttribute('origin'),flight=geometry.getAttribute('flight'),traits=geometry.getAttribute('traits');
    assert.equal(geometry.instanceCount,butterfly?6:128);
    assert.equal(mesh.material.depthTest,true);assert.equal(mesh.material.depthWrite,false);
    let frontLeft=0,frontRight=0;
    const sizes=new Set(),speeds=new Set(),forms=new Set();
    for(let i=0;i<geometry.instanceCount;i++){
      const x=origins.getX(i),y=origins.getY(i),z=origins.getZ(i);
      assert.ok([x,y,z,origins.getW(i)].every(Number.isFinite));
      assert.equal(isFlowerSiteAllowed(x,z,groundHeight),true,'insects gather on dry ground outside protected architecture');
      assert.ok(!(Math.abs(x)<8&&z>-29&&z<61),'keep the performance approach clear');
      assert.ok(y-groundHeight(x,z)>(butterfly?3.3:1.3));
      assert.ok(Math.hypot(x+13,z-10)>5&&Math.hypot(x-15,z-13)>5,'do not duplicate sparks in the campfires');
      if(z>12&&z<63){if(x<0)frontLeft++;else frontRight++;}
      sizes.add(traits.getY(i).toFixed(3));speeds.add(flight.getY(i).toFixed(3));forms.add(traits.getX(i));
    }
    assert.ok(frontLeft>=geometry.instanceCount*.25&&frontRight>=geometry.instanceCount*.25,'both foreground sides need insects');
    const variety=Math.min(geometry.instanceCount,16);
    assert.ok(sizes.size>=variety&&speeds.size>=variety,'flight groups need internal size and speed variation');
    if(butterfly){
      assert.deepEqual([...forms].sort(),[0,1,2]);
      assert.deepEqual([...new Set(geometry.getAttribute('part').array)].sort(),[-1,0,1],'paired wings and body are distinct geometry');
    }
  }
  assert.throws(()=>createSeasonLife(null),TypeError);
});

test('butterflies appear in spring and summer daylight, fireflies only in summer nights',t=>{
  const life=createSeasonLife(groundHeight);t.after(()=>life.dispose());
  const butterflies=named(life,'butterflies'),fireflies=named(life,'fireflies');
  assert.equal(life.group.visible,false,'the opening drawing must start empty');
  for(const [phase,lighting,wantButterflies,wantFireflies] of [
    [.12,day,true,false],[.26,day,true,false],[.26,night,false,true],[.12,night,false,false],
    [.58,day,false,false],[.58,night,false,false],[.84,day,false,false],[.84,night,false,false],
  ]){
    life.update(season(phase),lighting,10,1);
    assert.equal(butterflies.visible,wantButterflies);assert.equal(fireflies.visible,wantFireflies);
    assert.equal(life.group.visible,wantButterflies||wantFireflies);
  }
  for(const [strength,opacity] of [[0,1],[1,0]]){
    life.update(season(.26),night,10,strength,opacity);assert.equal(life.group.visible,false);
  }
  life.update(undefined,undefined,NaN,1);assert.equal(life.group.visible,false);
});

test('rain suppresses flying insects while disabling weather preserves their season',t=>{
  const life=createSeasonLife(groundHeight);t.after(()=>life.dispose());
  const rainy=season(.32),dry=season(.32,{...config,weatherEnabled:false});
  for(const [name,lighting] of [['butterflies',day],['fireflies',night]]){
    const mesh=named(life,name);
    life.update(dry,lighting,20,1);
    const dryAmount=mesh.material.uniforms.opacity.value;
    assert.ok(dryAmount>.9);
    life.update(rainy,lighting,20,1);
    assert.ok(mesh.material.uniforms.opacity.value<dryAmount*.25,'heavy rain drives most insects under cover');
    life.update(season(.32,{...config,weatherIntensity:0}),lighting,20,1);
    assert.equal(mesh.material.uniforms.opacity.value,dryAmount);
  }
});

test('flight and wing animation reuse GPU buffers and never resample terrain per frame',t=>{
  let terrainCalls=0;
  const life=createSeasonLife((x,z)=>{terrainCalls++;return groundHeight(x,z);});t.after(()=>life.dispose());
  const initialCalls=terrainCalls;
  const saved=life.group.children.map(mesh=>({mesh,geometry:mesh.geometry,material:mesh.material,
    attributes:Object.entries(mesh.geometry.attributes).map(([name,attribute])=>({name,attribute,array:attribute.array,contents:attribute.array.slice()}))}));
  const seasonOut={},dayOut={};
  for(let frame=0;frame<240;frame++){
    const time=frame*2;
    life.update(sampleSeasonCycle(time,config,seasonOut),sampleDayCycle(time,undefined,dayOut),time,1);
  }
  assert.equal(terrainCalls,initialCalls);
  for(const {mesh,geometry,material,attributes} of saved){
    assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);
    for(const {name,attribute,array,contents} of attributes){
      assert.equal(geometry.getAttribute(name),attribute);assert.equal(attribute.array,array);assert.deepEqual(array,contents);
    }
  }
  // The caller freezes shared time when P is pressed or the tab is hidden.
  const summer=season(.26);
  life.update(summer,night,13.7,1);
  life.update(summer,night,13.7,1);
  for(const mesh of life.group.children)assert.equal(mesh.material.uniforms.time.value,13.7);
});

test('disposing the seasonal insects releases each geometry and material once',()=>{
  const life=createSeasonLife(groundHeight),events=new Map();
  for(const mesh of life.group.children)for(const resource of [mesh.geometry,mesh.material]){
    events.set(resource,0);resource.addEventListener('dispose',()=>events.set(resource,events.get(resource)+1));
  }
  life.dispose();assert.equal(events.size,4);
  for(const count of events.values())assert.equal(count,1);
});
