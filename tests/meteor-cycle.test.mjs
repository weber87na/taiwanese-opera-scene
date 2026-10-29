import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import {createDaySky,sampleMeteor} from '../dist/day-sky.js';
import {sampleDayCycle} from '../dist/day-cycle.js';

test('meteors are sparse continuous events on unit world directions with tangent tails',()=>{
  const out={};let active=0,quiet=0;
  let prior=sampleMeteor(-.01,1);
  for(let time=0;time<160;time+=.01){
    assert.equal(sampleMeteor(time,1,out),out);
    for(const value of Object.values(out))assert.ok(Number.isFinite(value));
    assert.ok(out.opacity>=0&&out.opacity<=1);
    assert.ok(out.tailLength>=0&&out.tailLength<=.17);
    assert.ok(Math.abs(Math.hypot(out.x,out.y,out.z)-1)<1e-12);
    assert.ok(Math.abs(Math.hypot(out.tx,out.ty,out.tz)-1)<1e-12);
    assert.ok(Math.abs(out.x*out.tx+out.y*out.ty+out.z*out.tz)<1e-12);
    assert.ok(out.y>.15,'paths stay above the horizon');
    assert.ok(out.ty<0,'the head travels downwards');
    assert.ok(Math.abs(out.opacity-prior.opacity)<.15,'birth and fade have no visible jump');
    if(out.opacity>.01)active++;else quiet++;
    prior={...out};
  }
  assert.ok(active>1000,'there are visible events');
  assert.ok(quiet>active*3,'long quiet intervals separate the meteors');
});

test('daylight and invalid night values hide meteors; a repeated scene time freezes their pose',()=>{
  let visibleTime=0;
  for(let time=0;time<9.7;time+=.02)if(sampleMeteor(time,1).opacity>.8){visibleTime=time;break;}
  assert.ok(visibleTime>0);
  for(const night of [0,.3,.48,NaN,Infinity])assert.equal(sampleMeteor(visibleTime,night).opacity,0);
  assert.ok(sampleMeteor(visibleTime,.7).opacity<sampleMeteor(visibleTime,1).opacity);
  const paused=sampleMeteor(visibleTime,1);
  assert.deepEqual(sampleMeteor(visibleTime,1),paused);
  for(const time of [NaN,Infinity,-Infinity])assert.deepEqual(sampleMeteor(time),sampleMeteor(0));
});

test('repeated sky updates reuse the depth-tested celestial batch and uniform objects',t=>{
  const sky=createDaySky();t.after(()=>sky.dispose());
  const camera=new THREE.PerspectiveCamera(47,16/9,.5,800);
  camera.position.set(27,15,72);camera.lookAt(0,9,-16);camera.updateMatrixWorld(true);
  const celestial=sky.mesh.children[1],geometry=celestial.geometry,material=celestial.material;
  const uniforms=material.uniforms,head=uniforms.meteorHead.value,trail=uniforms.meteorTrail.value,shape=uniforms.meteorShape.value;
  const night=sampleDayCycle(78);
  for(let time=0;time<120;time+=.25){
    sky.setDayCycle(night,1,camera,time);
    const expected=sampleMeteor(time,night.night);
    assert.equal(uniforms.meteorTrail.value.w,expected.opacity);
    assert.equal(uniforms.meteorHead.value.x,expected.x);
    assert.equal(uniforms.meteorShape.value.x,expected.tailLength);
  }
  assert.equal(sky.mesh.children.length,2,'no extra fullscreen batch for meteors');
  assert.equal(celestial.material,material);assert.equal(celestial.geometry,geometry);
  assert.equal(uniforms.meteorHead.value,head);assert.equal(uniforms.meteorTrail.value,trail);assert.equal(uniforms.meteorShape.value,shape);
  assert.equal(material.depthTest,true);assert.equal(material.depthWrite,false);
  sky.setDayCycle(night,0,camera,2);assert.equal(celestial.visible,false,'introduction hides celestial effects');
});
