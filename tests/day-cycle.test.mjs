import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import {normalizeDayCycleSettings,loadDayCycleSettings,sampleDayCycle} from '../dist/day-cycle.js';

const config=normalizeDayCycleSettings();
const continuous=['daylight','sunset','night','dawn','sunAltitude','moonAltitude','sunAzimuth','moonAzimuth'];

test('invalid or partial configuration independently falls back or clamps',()=>{
  for(const input of [null,undefined,[],false,'120',{}])assert.deepEqual(normalizeDayCycleSettings(input),config);
  assert.deepEqual(normalizeDayCycleSettings({enabled:false,durationSeconds:0,startPhase:2}),{enabled:false,durationSeconds:30,startPhase:1});
  assert.deepEqual(normalizeDayCycleSettings({durationSeconds:Infinity,startPhase:NaN}),config);
  assert.equal(normalizeDayCycleSettings({durationSeconds:99999,startPhase:-2}).durationSeconds,1800);
  assert.equal(normalizeDayCycleSettings({startPhase:-2}).startPhase,0);
});

test('timeline follows day, sunset, night, dawn and repeats',()=>{
  for(const [phase,label] of [[0,'day'],[.3,'sunset'],[.65,'night'],[.9,'dawn']]){
    const expected=sampleDayCycle(phase*120,config);
    assert.equal(expected.label,label);
    for(const cycle of [-1,1,2,100]){
      const actual=sampleDayCycle((phase+cycle)*120,config);
      for(const key of continuous)assert.ok(Math.abs(expected[key]-actual[key])<1e-10,`${key} must repeat`);
    }
  }
  assert.equal(sampleDayCycle(0,config).daylight,1);
  assert.equal(sampleDayCycle(78,config).night,1);
  assert.ok(sampleDayCycle(40.8,config).sunset>.99);
  assert.ok(sampleDayCycle(108,config).dawn>.99);
});

test('all light values stay finite and within range, and scene output is reused',()=>{
  const out={};
  for(let seconds=-120;seconds<=240;seconds+=.13){
    assert.equal(sampleDayCycle(seconds,config,out),out);
    for(const key of ['phase','daylight','sunset','night','dawn']){
      assert.ok(Number.isFinite(out[key])&&out[key]>=0&&out[key]<=1,`${key} in range`);
    }
    for(const key of continuous)assert.ok(Number.isFinite(out[key]));
  }
  for(const seconds of [NaN,Infinity,-Infinity]){
    assert.deepEqual(sampleDayCycle(seconds,config),sampleDayCycle(0,config));
  }
  assert.deepEqual(sampleDayCycle(10,null),sampleDayCycle(10,config));
});

test('weights and celestial paths are continuous through segment joins and the loop seam',()=>{
  const joins=[0,.22,.23,.25,.34,.37,.42,.43,.46,.48,.50,.54,.58,.68,.72,.80,.81,.82,.83,.88,.90,.95,.98,1];
  for(const phase of joins){
    const before=sampleDayCycle(phase*120-.0001,config);
    const after=sampleDayCycle(phase*120+.0001,config);
    for(const key of continuous)assert.ok(Math.abs(before[key]-after[key])<.0001,`${key} jumps at ${phase}`);
  }
});

test('celestial bodies rise and sink while disabled cycles stay in daylight',()=>{
  assert.ok(sampleDayCycle(0,config).sunAltitude>0);
  assert.ok(sampleDayCycle(.65*120,config).sunAltitude<0);
  assert.ok(sampleDayCycle(.65*120,config).moonAltitude>0);
  assert.ok(sampleDayCycle(0,config).moonAltitude<0);
  const frozen=normalizeDayCycleSettings({enabled:false,startPhase:.65});
  assert.deepEqual(sampleDayCycle(1000,frozen),sampleDayCycle(0,config));
  assert.deepEqual(sampleDayCycle(0,{...config,startPhase:1}),sampleDayCycle(0,config));
});

test('day sun, sunset disc and night moon fit inside the default outside camera',()=>{
  const camera=new THREE.PerspectiveCamera(47,16/9,.5,800);
  camera.position.set(27,15,72);camera.lookAt(0,9,-16);camera.updateMatrixWorld(true);
  // Angular radii include the uneven painted rim and its antialiasing fringe.
  // Test the complete disc, so keeping only its centre barely on-screen fails.
  for(const [phase,body,radius] of [[0,'sun',.024],[.34,'sun',.035],[.65,'moon',.026]]){
    const state=sampleDayCycle(phase*config.durationSeconds,config);
    const altitude=state[`${body}Altitude`],azimuth=state[`${body}Azimuth`];
    const direction=new THREE.Vector3(Math.cos(altitude)*Math.sin(azimuth),Math.sin(altitude),-Math.cos(altitude)*Math.cos(azimuth));
    const tangent=new THREE.Vector3().crossVectors(direction,new THREE.Vector3(0,1,0)).normalize();
    const bitangent=new THREE.Vector3().crossVectors(direction,tangent).normalize();
    const project=ray=>ray.multiplyScalar(500).add(camera.position).project(camera);
    const assertInside=(point,label)=>{
      for(const axis of ['x','y','z'])assert.ok(point[axis]>=-1&&point[axis]<=1,`${body} at phase ${phase}: ${label} exceeds ${axis} frustum boundary (${point[axis]})`);
    };
    assertInside(project(direction.clone()),'centre');
    for(let i=0;i<64;i++){
      const angle=i/64*Math.PI*2;
      const ray=direction.clone().multiplyScalar(Math.cos(radius))
        .addScaledVector(tangent,Math.cos(angle)*Math.sin(radius))
        .addScaledVector(bitangent,Math.sin(angle)*Math.sin(radius));
      assertInside(project(ray),`rim ${i}`);
    }
  }
});

test('JSON fetch uses no-store and recovers from HTTP and malformed JSON failures',async()=>{
  const originalFetch=globalThis.fetch,originalWarn=console.warn;
  console.warn=()=>{};
  try {
    globalThis.fetch=async (url,options)=>{
      assert.equal(url,'./day-cycle-config.json');assert.equal(options.cache,'no-store');
      return {ok:true,json:async()=>({durationSeconds:90,startPhase:.5})};
    };
    assert.deepEqual(await loadDayCycleSettings(),{enabled:true,durationSeconds:90,startPhase:.5});
    globalThis.fetch=async()=>({ok:false,status:404});
    assert.deepEqual(await loadDayCycleSettings(),config);
    globalThis.fetch=async()=>({ok:true,json:async()=>{throw new SyntaxError('invalid');}});
    assert.deepEqual(await loadDayCycleSettings(),config);
  } finally {globalThis.fetch=originalFetch;console.warn=originalWarn;}
});
