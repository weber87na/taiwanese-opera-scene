import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createMarmotAppearance,sampleMarmotFrame,MARMOT_ATLAS_URL} from '../dist/marmot-appearance.js';

test('painted run frames freeze on the supplied clock and settle into the upright reference pose',()=>{
  assert.deepEqual([0,.09,.18,.27,.36].map(sampleMarmotFrame),[0,1,2,3,0]);
  for(let time=0;time<2.78;time+=.013){
    const frame=sampleMarmotFrame(time);assert.ok(frame>=0&&frame<4);assert.equal(frame,sampleMarmotFrame(time));
  }
  assert.equal(sampleMarmotFrame(2.9),4);assert.equal(sampleMarmotFrame(3.1),5);assert.equal(sampleMarmotFrame(3.65),5);
  assert.equal(sampleMarmotFrame(NaN),0);
});
test('atlas loads once, replaces its transparent placeholder and releases both texture lifetimes',async()=>{
  const uniforms={},appearance=createMarmotAppearance(uniforms),atlas=new THREE.Texture();
  let calls=0,placeholderDisposals=0,atlasDisposals=0;
  uniforms.atlas.value.addEventListener('dispose',()=>placeholderDisposals++);
  atlas.addEventListener('dispose',()=>atlasDisposals++);
  const loader={async loadAsync(url){calls++;assert.equal(url,MARMOT_ATLAS_URL);return atlas;}};
  await Promise.all([appearance.load(loader),appearance.load(loader)]);
  assert.equal(calls,1);assert.equal(placeholderDisposals,1);assert.equal(uniforms.atlas.value,atlas);
  assert.equal(atlas.colorSpace,THREE.SRGBColorSpace);
  appearance.dispose();appearance.dispose();assert.equal(atlasDisposals,1);
});
test('disposing while an atlas is in flight cannot leave an orphaned GPU texture',async()=>{
  const appearance=createMarmotAppearance({}),atlas=new THREE.Texture();let release,disposals=0;
  atlas.addEventListener('dispose',()=>disposals++);
  const pending=appearance.load({loadAsync:()=>new Promise(resolve=>release=resolve)});
  appearance.dispose();release(atlas);await pending;assert.equal(disposals,1);
});
