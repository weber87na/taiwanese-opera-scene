import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createBlueTears} from '../dist/blue-tears.js';
import {riverCenterX,riverHalfWidth,riverHeight,isRiverPoint} from '../dist/river-layout.js';

test('blue tears stay on the shared river surface, including both banks and the mountain reach',t=>{
  const effect=createBlueTears();t.after(()=>effect.dispose());
  const geometry=effect.group.children[0].geometry;
  const origins=geometry.getAttribute('origin'),shapes=geometry.getAttribute('shape');
  assert.ok(geometry.instanceCount>250);
  let upstream=0,downstream=0;
  for(let i=0;i<origins.count;i++){
    if(origins.getX(i)<-100)upstream++;
    if(origins.getX(i)>60)downstream++;
    for(const u of [-1,0,1])for(const v of [-1,0,1]){
      const z=origins.getX(i)+v*origins.getW(i);
      const lateral=origins.getY(i)+u*shapes.getX(i);
      const point=effect.waterPoint(z,lateral);
      assert.equal(point[0],riverCenterX(z)+lateral*riverHalfWidth(z));
      assert.equal(point[1],riverHeight(z)+.12);
      assert.ok(isRiverPoint(point[0],z),'water glow cannot spill onto the bank');
    }
  }
  assert.ok(upstream>30&&downstream>30);
});

test('water glow appears at night and obeys reveal, opacity and winter attenuation',t=>{
  const effect=createBlueTears();t.after(()=>effect.dispose());
  const state={winter:0,rain:0},night={night:1};
  assert.equal(effect.group.visible,false);
  effect.update(state,{night:0},10,1);assert.equal(effect.group.visible,false);
  effect.update(state,night,10,1);assert.equal(effect.group.visible,true);
  const power=effect.group.children[0].material.uniforms.power.value;
  effect.update({...state,winter:1},night,10,1);
  assert.ok(effect.group.children[0].material.uniforms.power.value<power);
  effect.update(state,night,10,0);assert.equal(effect.group.visible,false);
  effect.update(state,night,10,1,0);assert.equal(effect.group.visible,false);
});

test('blue tears reuse world anchors across animation and dispose their resources',()=>{
  const effect=createBlueTears(),mesh=effect.group.children[0];
  const geometry=mesh.geometry,material=mesh.material,anchor=geometry.getAttribute('origin');
  const values=anchor.array.slice();
  for(let frame=0;frame<100;frame++)effect.update({winter:0,rain:0},{night:1},frame,1);
  assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);
  assert.equal(geometry.getAttribute('origin'),anchor);assert.deepEqual(anchor.array,values);
  assert.equal(material.depthTest,true);assert.equal(material.depthWrite,false);
  let disposed=0;geometry.addEventListener('dispose',()=>disposed++);material.addEventListener('dispose',()=>disposed++);
  effect.dispose();assert.equal(disposed,2);
});
