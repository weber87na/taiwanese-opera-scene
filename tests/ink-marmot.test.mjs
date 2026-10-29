import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import {createEnvironment} from '../dist/environment.js';
import {isRiverPoint} from '../dist/river-layout.js';
import {createInkMarmot,sampleMarmotRoute,MARMOT_DURATION,MARMOT_TRAVEL_SECONDS,MARMOT_FADE_START} from '../dist/ink-marmot.js';

const environment=createEnvironment({depthOnly:true}),terrain=environment.groundHeight;
after(()=>environment.group.traverse(object=>{object.geometry?.dispose();for(const material of [object.material].flat())material?.dispose();}));
const camera=new THREE.PerspectiveCamera(47,16/9,.5,800);
camera.position.set(27,15,72);camera.lookAt(0,9,-16);camera.updateMatrixWorld(true);

test('the run approaches the open gate on dry ground and clears both large campfires',()=>{
  assert.deepEqual(sampleMarmotRoute(0),{x:-15,z:45,dx:21,dz:-36});
  assert.deepEqual(sampleMarmotRoute(1),{x:0,z:-8,dx:3,dz:-75});
  const out={};let previousZ=Infinity;
  for(let p=0;p<=1;p+=.002){
    assert.equal(sampleMarmotRoute(p,out),out);
    assert.ok(out.z<previousZ);previousZ=out.z;
    assert.ok(out.dx>0&&out.dz<0);
    assert.equal(isRiverPoint(out.x,out.z,4),false);
    assert.ok(Math.hypot(out.x+13,out.z-10)>9,'body and tail clear the left fire');
    assert.ok(Math.hypot(out.x-15,out.z-13)>9,'body and tail clear the right fire');
    assert.ok(out.z>=-8&&Math.abs(out.x)<=15,'route stays outside the fortress front wall');
    assert.ok(Number.isFinite(terrain(out.x,out.z)));
  }
  for(const value of [NaN,Infinity,undefined,-20])assert.deepEqual(sampleMarmotRoute(value),sampleMarmotRoute(0));
});

test('the explicit start, supplied cue clock, arrival fade and reset are deterministic',t=>{
  const marmot=createInkMarmot(terrain);t.after(()=>marmot.dispose());
  assert.equal(marmot.duration,MARMOT_DURATION);assert.equal(marmot.group.visible,false);
  assert.deepEqual(marmot.update(1,camera),{active:false,done:false,progress:0});
  const started=marmot.start();assert.equal(started.active,true);
  const uniforms=marmot.group.children[0].material.uniforms;
  assert.equal(marmot.update(.15,camera),started,'update reuses the cue result object');
  assert.equal(marmot.group.visible,true);assert.equal(uniforms.opacity.value,1);
  marmot.update(1.25,camera);
  const pose={anchor:uniforms.anchor.value.clone(),hop:uniforms.hop.value,time:uniforms.time.value,facing:uniforms.facing.value};
  marmot.update(1.25,camera);
  assert.ok(uniforms.anchor.value.equals(pose.anchor));assert.equal(uniforms.hop.value,pose.hop);
  assert.equal(uniforms.time.value,pose.time);assert.equal(uniforms.facing.value,pose.facing);
  const arrivalPositions=[-.12,-.08,-.04,0].map(offset=>{
    marmot.update(MARMOT_TRAVEL_SECONDS+offset,camera);return uniforms.anchor.value.clone();
  });
  assert.ok(arrivalPositions[2].distanceTo(arrivalPositions[3])<arrivalPositions[0].distanceTo(arrivalPositions[1])*.5,'the last steps slow down before rising at the gate');
  marmot.update(MARMOT_TRAVEL_SECONDS,camera);
  assert.equal(uniforms.anchor.value.x,0);assert.equal(uniforms.anchor.value.z,-8);assert.equal(uniforms.hop.value,0);
  marmot.update(3.7,camera);assert.equal(uniforms.opacity.value,1,'upright pose remains clearly visible before dissolving');
  assert.equal(uniforms.atlasFrame.value,5);
  marmot.update((MARMOT_DURATION+MARMOT_FADE_START)/2,camera);
  assert.ok(uniforms.opacity.value>.4&&uniforms.opacity.value<.6,'arrival dissolves before media handoff');
  assert.deepEqual(marmot.update(MARMOT_DURATION,camera),{active:false,done:true,progress:1});
  assert.equal(marmot.group.visible,false);assert.equal(uniforms.opacity.value,0);
  marmot.reset();assert.deepEqual(marmot.update(10,camera),{active:false,done:false,progress:0});
  marmot.start();marmot.update(.15,camera);assert.equal(marmot.group.visible,true,'Q can replay after reset');
});

test('run interpolation remains grounded without rebuilding buffers or resampling terrain',t=>{
  let samples=0;
  const marmot=createInkMarmot((x,z)=>{samples++;return terrain(x,z);});t.after(()=>marmot.dispose());
  const builtSamples=samples;
  assert.equal(marmot.group.children.length,2,'animal and ground ink stay two fixed batches');
  const snapshots=marmot.group.children.map(mesh=>({mesh,geometry:mesh.geometry,material:mesh.material,
    attributes:Object.entries(mesh.geometry.attributes).map(([name,attribute])=>({name,attribute,array:attribute.array,copy:attribute.array.slice()}))}));
  marmot.start();
  for(let time=0;time<MARMOT_DURATION;time+=.007){
    marmot.update(time,camera);
    const uniforms=marmot.group.children[0].material.uniforms,anchor=uniforms.anchor.value;
    assert.ok(Math.abs(anchor.y-.035-terrain(anchor.x,anchor.z))<.002,'precomputed heights accurately follow the actual path');
    assert.equal(uniforms.hop.value,0,'supporting feet remain on the terrain throughout the four-legged gait');
  }
  assert.equal(samples,builtSamples);
  for(const {mesh,geometry,material,attributes} of snapshots){
    assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);
    assert.equal(material.depthTest,true);assert.equal(material.depthWrite,false);assert.equal(mesh.frustumCulled,false);
    for(const {name,attribute,array,copy} of attributes){
      assert.equal(geometry.getAttribute(name),attribute);assert.equal(attribute.array,array);assert.deepEqual(array,copy);
    }
  }
});

test('invalid samplers fail clearly and every allocated resource is released',()=>{
  assert.throws(()=>createInkMarmot(),TypeError);assert.throws(()=>createInkMarmot(()=>NaN),TypeError);
  const marmot=createInkMarmot(terrain),counts=[];
  for(const mesh of marmot.group.children)for(const resource of [mesh.geometry,mesh.material]){
    const index=counts.length;counts.push(0);resource.addEventListener('dispose',()=>counts[index]++);
  }
  marmot.dispose();assert.deepEqual(counts,[1,1,1,1]);
});
