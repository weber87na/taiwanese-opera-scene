import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewServer} from '../server.mjs';

test('local MP4 supports playback, HEAD metadata and seek byte ranges',async()=>{
  const server=createPreviewServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/assets/marmot.mp4`;
  try{
    const head=await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-type'),'video/mp4');
    const size=Number(head.headers.get('content-length'));assert.ok(size>100000);assert.equal((await head.arrayBuffer()).byteLength,0);
    const first=await fetch(url,{headers:{Range:'bytes=0-31'}});assert.equal(first.status,206);
    assert.equal(first.headers.get('content-range'),`bytes 0-31/${size}`);assert.equal((await first.arrayBuffer()).byteLength,32);
    const suffix=await fetch(url,{headers:{Range:'bytes=-64'}});assert.equal(suffix.status,206);assert.equal((await suffix.arrayBuffer()).byteLength,64);
    const invalid=await fetch(url,{headers:{Range:`bytes=${size}-`}});assert.equal(invalid.status,416);
    const traversal=await fetch(url.replace('/assets/marmot.mp4','/%2e%2e%5cserver.mjs'));assert.equal(traversal.status,403);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
