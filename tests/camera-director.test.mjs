import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMERA_SHOTS,createCameraDirector} from '../dist/camera-director.js';

test('five camera shots reach distinct near, far and inside world views',()=>{
  const director=createCameraDirector(),distances=[];
  for(let n=1;n<=5;n++){
    director.select(n,{immediate:true});const pose=director.update(0,false);
    for(let k=0;k<3;k++)assert.ok(Math.abs(pose.position[k]-CAMERA_SHOTS[n-1].position[k])<1e-8);
    distances.push(Math.hypot(pose.position[0],pose.position[2]+16));
  }
  assert.ok(Math.max(...distances)-Math.min(...distances)>35);
  assert.ok(director.pose.position[2]<-16);
  assert.equal(director.select(6),false);
});
test('auto camera varies orbit and distance, pauses exactly and resumes without a jump',()=>{
  const director=createCameraDirector(),pose=director.update(0),before=[...pose.position];
  for(let i=0;i<2000;i++)director.update(.05,true);
  assert.ok(Math.hypot(pose.position[0]-before[0],pose.position[2]-before[2])>60);
  const frozen=[...pose.position];for(let i=0;i<30;i++)director.update(.05,false);
  assert.deepEqual(pose.position,frozen);
  director.update(.05,true);assert.ok(Math.hypot(...pose.position.map((v,i)=>v-frozen[i]))<.3);
});
test('manual interruption holds the automatic pose and transitions avoid crossing the courtyard',()=>{
  const director=createCameraDirector();for(let i=0;i<100;i++)director.update(.05);
  director.hold();const before=[...director.pose.position];for(let i=0;i<20;i++)director.update(.05);
  assert.deepEqual(director.pose.position,before);
  director.select(5);const reused=director.pose;
  for(let i=0;i<150;i++){
    const pose=director.update(.05,false,0,()=>14);
    assert.equal(pose,reused);assert.ok(Math.hypot(pose.position[0]-pose.target[0],pose.position[2]-pose.target[2])>50);
    assert.ok(pose.position[1]>=22);
  }
});
test('temporary cue restores manual and automatic camera state exactly',()=>{
  for(const automatic of [false,true]){
    const director=createCameraDirector();for(let i=0;i<400;i++)director.update(.05);
    if(!automatic){director.select(5);for(let i=0;i<12;i++)director.update(.05);director.hold(.7);}
    const before=[...director.update(0,false).position],saved=director.snapshot();
    director.select(1,{immediate:true});director.update(.05);director.restore(saved);
    assert.deepEqual(director.update(0,false).position,before);
    assert.deepEqual(director.snapshot(),saved);
  }
});
