import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createMarmotVideo,MARMOT_VIDEO_SRC,MARMOT_VIDEO_URL} from '../dist/marmot-video.js';

const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};

function harness(t){
  const saved={document:globalThis.document,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
  const timers=new Map(),videos=[],playQueue=[];let now=0,timerId=0;
  class Element{
    constructor(tag){this.tagName=tag;this.children=[];this.hidden=false;this.style={};this.dataset={};this.events=new Map();this.attributes={};}
    set innerHTML(html){
      this.html=html;this.queries={
        '.marmot-player-slot':new Element('div'),'.marmot-video-message':new Element('div'),
      };
      const message=this.queries['.marmot-video-message'];message.hidden=true;
      message.queries={p:new Element('p'),button:new Element('button')};
    }
    querySelector(selector){return this.queries?.[selector]||null;}
    append(element){this.children.push(element);element.parent=this;}
    replaceChildren(...elements){this.children=elements;for(const element of elements)element.parent=this;}
    setAttribute(name,value){this.attributes[name]=value;}
    removeAttribute(name){delete this.attributes[name];if(name==='src')this.src='';}
    addEventListener(type,callback){if(!this.events.has(type))this.events.set(type,[]);this.events.get(type).push(callback);}
    emit(type){for(const callback of this.events.get(type)||[])callback({target:this});}
    click(){this.emit('click');}
    focus(){this.focused=true;}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
  }
  class Video extends Element{
    constructor(){super('video');this.paused=true;this.currentTime=0;this.readyState=0;this.playCalls=0;this.pauseCalls=0;this.loadCalls=0;}
    load(){this.loadCalls++;}
    pause(){this.paused=true;this.pauseCalls++;}
    play(){
      this.playCalls++;
      const behavior=playQueue.shift();
      if(behavior instanceof Error)return Promise.reject(behavior);
      if(behavior)return behavior.then(()=>{this.paused=false;this.emit('playing');});
      this.paused=false;this.emit('playing');return Promise.resolve();
    }
  }
  globalThis.document={createElement(tag){if(tag==='video'){const video=new Video();videos.push(video);return video;}return new Element(tag);}};
  globalThis.setTimeout=(callback,delay)=>{const id=++timerId;timers.set(id,{callback,at:now+delay});return id;};
  globalThis.clearTimeout=id=>timers.delete(id);
  const container=new Element('main');let closed=0;
  const api=createMarmotVideo(container,()=>closed++),overlay=container.children[0];
  const message=overlay.querySelector('.marmot-video-message'),button=message.querySelector('button');
  function tick(milliseconds){
    const end=now+milliseconds;
    while(true){
      const due=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!due)break;now=due[1].at;timers.delete(due[0]);due[1].callback();
    }
    now=end;
  }
  t.after(()=>{api.dispose();globalThis.document=saved.document;globalThis.setTimeout=saved.setTimeout;globalThis.clearTimeout=saved.clearTimeout;});
  return {api,overlay,message,button,container,videos,playQueue,tick,timers,
    get text(){return message.querySelector('p').textContent;},get closed(){return closed;}};
}

test('prepare preloads the local MP4 silently and show starts audible contained playback',async t=>{
  const h=harness(t);h.api.prepare();h.api.prepare();
  assert.equal(h.videos.length,1,'prepare reuses its pending video');
  const video=h.videos[0];
  assert.equal(video.src,MARMOT_VIDEO_SRC);assert.equal(video.preload,'auto');assert.equal(video.playsInline,true);
  assert.equal(video.playCalls,0,'preloading must never start sound during the run');
  assert.equal(video.paused,true);assert.equal(h.api.visible,false);
  assert.equal(video.style.objectFit,'contain');assert.equal(video.style.width,'100%');assert.equal(video.style.height,'100%');
  assert.ok(h.overlay.html.includes(MARMOT_VIDEO_URL),'source link remains an optional fallback');
  video.readyState=2;video.emit('loadeddata');
  h.api.show();await flush();
  assert.equal(video.playCalls,1);assert.equal(video.muted,false);assert.equal(video.volume,1);
  assert.equal(h.api.visible,true);assert.equal(h.message.hidden,true);assert.equal(h.timers.size,0);
});

test('rejected delayed autoplay exposes a gesture-driven play button',async t=>{
  const h=harness(t),denied=new Error('User activation required');denied.name='NotAllowedError';
  h.playQueue.push(denied);h.api.show();await flush();
  assert.equal(h.message.hidden,false);assert.equal(h.button.hidden,false);
  assert.match(h.text,/點一下開始播放/);
  assert.equal(h.videos[0].playCalls,1);
  h.button.click();await flush();
  assert.equal(h.videos[0].playCalls,2);assert.equal(h.message.hidden,true);assert.equal(h.timers.size,0);
});

test('a missing asset during preload is retained on show and retry creates fresh local media',async t=>{
  const h=harness(t);h.api.prepare();const missing=h.videos[0];
  missing.emit('error');assert.equal(h.api.visible,false);
  h.api.show();await flush();
  assert.match(h.text,/本機影片載入失敗/);assert.equal(h.message.hidden,false);
  assert.equal(h.button.textContent,'重試載入');assert.equal(missing.playCalls,0);
  h.tick(30000);assert.match(h.text,/本機影片載入失敗/,'no old timer overwrites the specific error');
  h.button.click();await flush();
  assert.equal(h.videos.length,2);assert.equal(h.videos[1].src,MARMOT_VIDEO_SRC);
  assert.equal(h.videos[1].playCalls,1);assert.equal(missing.src,'');assert.equal(missing.paused,true);
  assert.equal(h.message.hidden,true);
});

test('preload timeout exposes retry and a later media error cancels a pending play watchdog',async t=>{
  const h=harness(t);h.api.prepare();h.tick(15000);h.api.show();
  assert.match(h.text,/本機影片載入失敗/);assert.equal(h.button.textContent,'重試載入');
  let reject;
  h.playQueue.push(new Promise((resolve,rejectPromise)=>{reject=rejectPromise;}));
  h.button.click();
  const video=h.videos[1];video.emit('error');
  const errorMessage=h.text;h.tick(20000);reject(new Error('aborted after missing file'));await flush();
  assert.equal(h.text,errorMessage);assert.equal(h.button.textContent,'重試載入');assert.equal(h.timers.size,0);
});

test('ended closes once, stops and rewinds, and another Q can replay from the beginning',async t=>{
  const h=harness(t);h.api.show();await flush();const first=h.videos[0];first.currentTime=12.7;
  first.emit('ended');
  assert.equal(h.closed,1);assert.equal(h.api.visible,false);assert.equal(first.paused,true);assert.equal(first.currentTime,0);
  assert.equal(first.src,'');assert.equal(h.overlay.querySelector('.marmot-player-slot').children.length,0);
  h.api.close();assert.equal(h.closed,1,'recursive root close is harmless');
  h.api.prepare();assert.equal(h.videos[1].playCalls,0);h.api.show();await flush();
  assert.equal(h.videos[1].currentTime,0);assert.equal(h.videos[1].playCalls,1);assert.equal(h.api.visible,true);
});

test('close invalidates old media events and late play completion without disturbing a new cue',async t=>{
  const h=harness(t);let resolve;
  h.playQueue.push(new Promise(resolvePromise=>{resolve=resolvePromise;}));
  h.api.show();const previous=h.videos[0];previous.currentTime=3;
  h.api.close();h.api.show();await flush();const current=h.videos[1];
  previous.emit('error');previous.emit('ended');previous.emit('loadeddata');
  resolve();await flush();
  assert.equal(h.api.visible,true);assert.equal(h.closed,1);assert.equal(h.message.hidden,true);
  assert.equal(previous.paused,true,'an old play promise cannot restart hidden audio');
  assert.equal(current.paused,false);assert.equal(current.playCalls,1);assert.equal(h.timers.size,0);
});
