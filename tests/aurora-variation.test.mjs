import assert from 'node:assert/strict';
import {test} from 'node:test';
import {sampleAuroraVariation} from '../dist/day-sky.js';

test('aurora cycles through three distinct forms with continuous, bounded crossfades',()=>{
  for(const [time,form] of [[0,'curtain'],[24,'ribbon'],[48,'corona']])assert.equal(sampleAuroraVariation(time)[form],1);
  const out={};
  for(let time=-72;time<144;time+=.13){
    assert.equal(sampleAuroraVariation(time,out),out);
    assert.ok(Math.abs(out.curtain+out.ribbon+out.corona-1)<1e-12);
    for(const value of Object.values(out))assert.ok(value>=0&&value<=1);
  }
  for(const time of [0,13.2,24,37.2,48,61.2,72]){
    const before=sampleAuroraVariation(time-.0001),after=sampleAuroraVariation(time+.0001),next=sampleAuroraVariation(time+72);
    for(const key of ['curtain','ribbon','corona']){
      assert.ok(Math.abs(before[key]-after[key])<.0001);
      assert.ok(Math.abs(next[key]-sampleAuroraVariation(time)[key])<1e-12);
    }
  }
});
