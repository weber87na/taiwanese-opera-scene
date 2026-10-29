import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {createEnvironment} from '../dist/environment.js';
import {landscapeStrokes} from '../dist/sketch-landscape.js';
import {riverCenterX,riverHalfWidth,riverHeight,riverExtent,isRiverPoint,RIVER_START_Z,RIVER_END_Z} from '../dist/river-layout.js';

const environment=createEnvironment({depthOnly:true});
const terrain=environment.group.getObjectByName('Continuous mountain terrain').geometry;
after(()=>environment.group.traverse(object=>{
  object.geometry?.dispose();
  for(const material of [object.material].flat())material?.dispose();
}));

// Interpolate the actual triangle grid used by the depth pass, not just the
// continuous sampler. Banks can otherwise mask water between terrain vertices.
function meshHeight(x,z){
  const p=terrain.attributes.position,columns=terrain.parameters.widthSegments,rows=terrain.parameters.heightSegments;
  const fx=(x+170)/340*columns,fz=(z+220)/420*rows;
  const ix=Math.floor(fx),iz=Math.floor(fz),u=fx-ix,v=fz-iz;
  const a=iz*(columns+1)+ix,b=a+columns+1,d=a+1,c=b+1;
  return u+v<=1?p.getY(a)+(p.getY(d)-p.getY(a))*u+(p.getY(b)-p.getY(a))*v
    :p.getY(c)+(p.getY(b)-p.getY(c))*(1-u)+(p.getY(d)-p.getY(c))*(1-v);
}

test('expanded river reaches the mountain valley and opens modestly left in the foreground',()=>{
  assert.ok(RIVER_START_Z<=-160&&RIVER_END_Z>=110);
  for(let z=RIVER_START_Z;z<=RIVER_END_Z;z+=1.7){
    assert.ok(riverHalfWidth(z)*2>10&&riverHalfWidth(z)*2<21);
    assert.equal(riverExtent(z),1);
    assert.equal(isRiverPoint(riverCenterX(z),z),true);
    assert.equal(isRiverPoint(riverCenterX(z)+riverHalfWidth(z)+1,z),false);
  }
  assert.ok(riverCenterX(-150)>85,'upstream heads into the far mountain valley');
  assert.ok(riverCenterX(50)-riverHalfWidth(50)<41,'foreground left bank expands left of its former narrow channel');
  for(const z of [-24,-16,-10])assert.ok(riverCenterX(z)-riverHalfWidth(z)>45.4,'main channel stays clear of the fortress wall');
  for(const [x,z] of [[0,30],[-13,10],[15,13],[0,-16]])assert.equal(isRiverPoint(x,z,3),false,'approach, gate and fires remain on dry ground');
});

test('the entire water width clears the real depth triangles including bends and distant banks',()=>{
  for(let z=RIVER_START_Z;z<=RIVER_END_Z;z+=1.7)for(const lane of [-1,-.8,-.4,0,.4,.8,1]){
    const x=riverCenterX(z)+lane*riverHalfWidth(z),water=riverHeight(z);
    assert.ok(water-environment.groundHeight(x,z)>1,'continuous bed remains below water');
    assert.ok(water-meshHeight(x,z)>.7,`depth triangle masks river at ${x}, ${z}`);
  }
  assert.equal(isRiverPoint(NaN,10),false);assert.equal(isRiverPoint(50,Infinity),false);
});

test('painted water spans the full river with flat ribbons and fine currents inside the shared banks',()=>{
  const strokes=landscapeStrokes(environment.groundHeight);
  const washes=strokes.filter(stroke=>stroke.kind==='river-colour-current');
  const ripples=strokes.filter(stroke=>stroke.kind==='water-ink');
  assert.ok(washes.length>=70&&ripples.length>=100,'expanded river retains layered paint and fine currents');
  let minZ=Infinity,maxZ=-Infinity;
  for(const wash of washes){
    assert.equal(wash.ribbonEdges.length,wash.points.length);
    for(const edge of wash.ribbonEdges)for(const [x,y,z] of edge){
      minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);
      assert.ok(Math.abs(y-riverHeight(z)-.03)<1e-10,'water ribbon remains flat across the cut channel');
      assert.ok(Math.abs(x-riverCenterX(z))<=riverHalfWidth(z)+1e-8,'water paint remains inside its banks');
      assert.ok(y>meshHeight(x,z)+.7,'water paint clears the actual depth mesh');
    }
  }
  assert.equal(minZ,RIVER_START_Z);assert.equal(maxZ,RIVER_END_Z);
  for(const stroke of ripples)for(const [x,y,z] of stroke.points){
    assert.ok(isRiverPoint(x,z));assert.ok(Math.abs(y-riverHeight(z)-.06)<1e-10);
  }
  // Regression: trimming a single low river crossing must not discard the
  // entire long pigment ribbon and leave the right-hand mountain empty.
  for(const [cx,cz] of [[70,-118],[119,-76]]){
    const mountainPigment=strokes.filter(stroke=>stroke.wash&&/mineral|ink-stain/.test(stroke.kind))
      .flatMap(stroke=>stroke.points).filter(([x,y,z])=>Math.abs(x-cx)<32&&Math.abs(z-cz)<32&&y>15);
    assert.ok(mountainPigment.length>200,'high mountain pigment survives trimming the low stream crossings');
  }
});
