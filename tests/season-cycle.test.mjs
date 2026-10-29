import assert from 'node:assert/strict';
import {test} from 'node:test';
import {normalizeSeasonSettings,loadSeasonSettings,sampleSeasonCycle} from '../dist/season-cycle.js';

const config=normalizeSeasonSettings();
const weights=['spring','summer','autumn','winter'];
const weather=['rain','rainbow','snow','leaves','cloudiness','wetness','wind'];
const continuous=[...weights,'blossom',...weather];

test('configuration falls back independently and bounds time, phase and intensity',()=>{
  for(const value of [undefined,null,[],false,'winter',{}])assert.deepEqual(normalizeSeasonSettings(value),config);
  assert.deepEqual(normalizeSeasonSettings({enabled:false,durationSeconds:0,startPhase:2,weatherEnabled:false,weatherIntensity:9}),{
    enabled:false,durationSeconds:60,startPhase:1,weatherEnabled:false,weatherIntensity:1.5,
  });
  assert.deepEqual(normalizeSeasonSettings({durationSeconds:Infinity,startPhase:NaN,weatherIntensity:'1'}),config);
  const bounded=normalizeSeasonSettings({durationSeconds:99999,startPhase:-1,weatherIntensity:-2});
  assert.equal(bounded.durationSeconds,3600);assert.equal(bounded.startPhase,0);assert.equal(bounded.weatherIntensity,0);
});

test('four seasons have pure representative stages and weights always sum to one',()=>{
  for(const [phase,season] of [[.08,'spring'],[.33,'summer'],[.58,'autumn'],[.83,'winter']]){
    const state=sampleSeasonCycle(phase*240,config);
    assert.equal(state.label,season);assert.equal(state[season],1);
  }
  const out={};
  for(let seconds=-240;seconds<480;seconds+=.17){
    assert.equal(sampleSeasonCycle(seconds,config,out),out);
    assert.ok(Math.abs(weights.reduce((sum,key)=>sum+out[key],0)-1)<1e-12);
    for(const key of ['phase',...continuous])assert.ok(Number.isFinite(out[key])&&out[key]>=0&&out[key]<=1,`${key} must be finite and in range`);
  }
});

test('all seasonal and weather values repeat and meet smoothly across every boundary',()=>{
  for(const phase of [0,.045,.065,.08,.11,.116,.127,.133,.135,.15,.19,.196,.205,.212,.232,.25,.30,.335,.36,.366,.382,.388,.39,.445,.451,.455,.467,.487,.5,.55,.625,.66,.705,.735,.75,.805,.865,.90,.935,.955,.975,.983,1]){
    const at=sampleSeasonCycle(phase*240,config);
    const before=sampleSeasonCycle(phase*240-.0001,config);
    const after=sampleSeasonCycle(phase*240+.0001,config);
    const next=sampleSeasonCycle((phase+3)*240,config);
    for(const key of continuous){
      assert.ok(Math.abs(before[key]-after[key])<.0002,`${key} jumps at phase ${phase}`);
      assert.ok(Math.abs(at[key]-next[key])<1e-10,`${key} must repeat`);
    }
  }
  for(const seconds of [NaN,Infinity,-Infinity])assert.deepEqual(sampleSeasonCycle(seconds,config),sampleSeasonCycle(0,config));
  assert.deepEqual(sampleSeasonCycle(10,null),sampleSeasonCycle(10,config));
});

test('spring flowers open gradually, bloom fully and fade independently of weather',()=>{
  const bloom=phase=>sampleSeasonCycle(phase*config.durationSeconds,config).blossom;
  assert.equal(bloom(0),0);
  assert.ok(bloom(.02)>0&&bloom(.02)<bloom(.04));
  assert.ok(bloom(.04)<bloom(.065));
  for(const phase of [.065,.08,.12,.19])assert.equal(bloom(phase),1);
  assert.ok(bloom(.20)<bloom(.19)&&bloom(.20)>bloom(.22));
  assert.ok(bloom(.22)>bloom(.24)&&bloom(.24)>0);
  for(const phase of [.25,.33,.58,.83,.98])assert.equal(bloom(phase),0);
  for(const phase of [.02,.08,.20,.24]){
    for(const settings of [{...config,weatherEnabled:false},{...config,weatherIntensity:0}]){
      assert.equal(sampleSeasonCycle(phase*config.durationSeconds,settings).blossom,bloom(phase));
    }
  }
  assert.equal(sampleSeasonCycle(0,{...config,startPhase:.08,enabled:false}).blossom,0);
});

test('rain, falling leaves and snow each have visible peaks separated by clear intervals',()=>{
  const spring=sampleSeasonCycle(.06*240,config),summer=sampleSeasonCycle(.32*240,config);
  const autumn=sampleSeasonCycle(.58*240,config),winter=sampleSeasonCycle(.84*240,config);
  assert.ok(spring.rain>.4&&spring.rain<summer.rain);
  assert.ok(summer.rain>.9);assert.ok(autumn.leaves>.9);assert.ok(winter.snow>.85);
  for(let phase=0;phase<1;phase+=.001){
    const state=sampleSeasonCycle(phase*240,config);
    assert.ok(['rain','snow','leaves'].filter(key=>state[key]>.01).length<=1,'particle types must not compete');
  }
  for(const phase of [.001,.251,.501,.751]){
    const state=sampleSeasonCycle(phase*240,config);
    for(const key of ['rain','snow','leaves','cloudiness','wetness'])assert.equal(state[key],0,`${key} must clear at ${phase}`);
  }
  const afterRain=sampleSeasonCycle(.12*240,config);
  assert.equal(afterRain.rain,0);assert.ok(afterRain.wetness>0,'wet ground should outlast the rain');
});

test('rainbows appear only after showers, fade before new rain and respect weather switches',()=>{
  const sample=(phase,settings=config)=>sampleSeasonCycle(phase*240,settings);
  for(let phase=0;phase<1;phase+=.0005){
    const state=sample(phase);
    if(state.rain>0)assert.equal(state.rainbow,0,'rain and a clearing rainbow must not overlap');
  }
  for(const [phase,minimum] of [[.12,.6],[.20,.5],[.372,.9],[.457,.8]]){
    const state=sample(phase);
    assert.equal(state.rain,0);assert.ok(state.rainbow>minimum,'even a light shower leaves a visible rainbow');
    for(const settings of [{...config,enabled:false},{...config,weatherEnabled:false},{...config,weatherIntensity:0}]){
      assert.equal(sample(phase,settings).rainbow,0);
    }
    assert.ok(sample(phase,{...config,weatherIntensity:.25}).rainbow<state.rainbow);
    assert.ok(sample(phase,{...config,weatherIntensity:1.5}).rainbow<=1);
  }
  assert.equal(sample(.112).rainbow,0,'the sky gets a brief dry pause before a rainbow appears');
  assert.ok(sample(.116).rainbow>0&&sample(.116).rainbow<sample(.12).rainbow,'rainbow gradually emerges after clearing');
  assert.ok(sample(.131).rainbow>0&&sample(.131).rainbow<sample(.12).rainbow,'short clear gaps fade before the following shower');
  assert.ok(sample(.224).rainbow>0&&sample(.224).rainbow<sample(.212).rainbow,'long clear gaps also fade naturally');
  for(const phase of [0,.02,.134,.24,.26,.389,.49,.58,.83,.99]){
    assert.equal(sample(phase).rainbow,0,'a long clear sky or a non-rain season has no persistent rainbow');
  }
  const dryStart={...config,startPhase:.372};
  for(const elapsed of [0,1,2,3])assert.equal(sampleSeasonCycle(elapsed,dryStart).rainbow,0,'starting in a clear sky cannot imply a shower already happened');
  assert.ok(sampleSeasonCycle((.457-.372)*240,dryStart).rainbow>.8,'the next actual shower can produce a rainbow');
  const rainyStart={...config,startPhase:.32};
  assert.ok(sampleSeasonCycle((.372-.32)*240,rainyStart).rainbow>.9,'starting during rain counts once that shower ends');
});

test('disabling weather preserves seasons while zero intensity removes weather',()=>{
  for(const phase of [.06,.32,.58,.84,.97]){
    const normal=sampleSeasonCycle(phase*240,config);
    for(const settings of [{...config,weatherEnabled:false},{...config,weatherIntensity:0}]){
      const state=sampleSeasonCycle(phase*240,settings);
      for(const key of weights)assert.equal(state[key],normal[key]);
      for(const key of weather)assert.equal(state[key],0);
    }
  }
  const disabled=sampleSeasonCycle(999,{...config,enabled:false,startPhase:.84});
  assert.equal(disabled.phase,0);assert.equal(disabled.spring,1);
  for(const key of weather)assert.equal(disabled[key],0);
  assert.deepEqual(sampleSeasonCycle(0,{...config,startPhase:1}),sampleSeasonCycle(0,config));
  assert.equal(sampleSeasonCycle(.32*240,{...config,weatherIntensity:1.5}).rain,1);
});

test('loading reads uncached JSON and safely recovers from missing or broken files',async()=>{
  const originalFetch=globalThis.fetch,originalWarn=console.warn;
  console.warn=()=>{};
  try {
    globalThis.fetch=async (url,options)=>{
      assert.equal(url,'./season-config.json');assert.equal(options.cache,'no-store');
      return {ok:true,json:async()=>({durationSeconds:90,startPhase:.5,weatherEnabled:false})};
    };
    assert.deepEqual(await loadSeasonSettings(),{...config,durationSeconds:90,startPhase:.5,weatherEnabled:false});
    globalThis.fetch=async()=>({ok:false,status:404});
    assert.deepEqual(await loadSeasonSettings(),config);
    globalThis.fetch=async()=>({ok:true,json:async()=>{throw new SyntaxError('invalid');}});
    assert.deepEqual(await loadSeasonSettings(),config);
  } finally {globalThis.fetch=originalFetch;console.warn=originalWarn;}
});
