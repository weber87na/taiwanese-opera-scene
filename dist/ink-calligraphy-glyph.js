/** Convert a loaded local calligraphy face into ink and connected reveal maps.
 * Alpha is the original font raster: neither dilation nor synthetic scratches
 * alter the calligrapher's thick strokes, fine ligatures, or dry-brush gaps.
 * Call document.fonts.load() before using this synchronous factory.
 */
let scratchCanvas, scratchContext;

export function createCalligraphyGlyph(character,fontFamily,size=224){
  const n=Math.max(32,Math.min(512,Math.round(Number(size)||224))),count=n*n;
  if(!scratchCanvas){
    scratchCanvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(n,n):document.createElement('canvas');
    scratchContext=scratchCanvas.getContext('2d',{willReadFrequently:true});
  }
  if(!scratchContext)throw new Error('Canvas 2D is required to rasterise local calligraphy.');
  if(scratchCanvas.width!==n)scratchCanvas.width=n;
  if(scratchCanvas.height!==n)scratchCanvas.height=n;
  const ctx=scratchContext;
  ctx.clearRect(0,0,n,n);ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillStyle='#000';
  const text=String(character??''),family=String(fontFamily||'serif');
  let fontSize=n*.79;ctx.font=`${fontSize}px ${family}`;
  let metrics=ctx.measureText(text);
  const bounds=m=>({left:m.actualBoundingBoxLeft||0,right:m.actualBoundingBoxRight||m.width||fontSize,
    ascent:m.actualBoundingBoxAscent||fontSize*.8,descent:m.actualBoundingBoxDescent||0});
  let b=bounds(metrics);
  const fit=Math.min(1,n*.83/Math.max(1,b.left+b.right),n*.83/Math.max(1,b.ascent+b.descent));
  if(fit<1){fontSize*=fit;ctx.font=`${fontSize}px ${family}`;metrics=ctx.measureText(text);b=bounds(metrics);}
  ctx.fillText(text,n*.5+(b.left-b.right)*.5,n*.5+(b.ascent-b.descent)*.5);
  const rgba=ctx.getImageData(0,0,n,n).data;
  const alpha=new Uint8Array(count),core=new Uint8Array(count),birth=new Float32Array(count);
  birth.fill(1);
  const skeleton=new Uint8Array(count),painted=[];
  for(let i=0;i<count;i++){
    alpha[i]=rgba[i*4+3];
    if(alpha[i]>24){skeleton[i]=1;painted.push(i);}
  }
  if(!painted.length)return {alpha,birth,blur:new Uint8Array(count),core};

  // Zhang-Suen thinning preserves junctions and closed counters. This is a
  // centreline for animation, never a replacement outline for the font.
  const removed=new Uint32Array(painted.length);
  for(let iteration=0;iteration<64;iteration++){
    let changed=0;
    for(let phase=0;phase<2;phase++){
      let length=0;
      for(let k=0;k<painted.length;k++){
        const i=painted[k];if(!skeleton[i])continue;
        const x=i%n;if(x===0||x===n-1||i<n||i>=count-n)continue;
        const p2=skeleton[i-n],p3=skeleton[i-n+1],p4=skeleton[i+1],p5=skeleton[i+n+1];
        const p6=skeleton[i+n],p7=skeleton[i+n-1],p8=skeleton[i-1],p9=skeleton[i-n-1];
        const neighbours=p2+p3+p4+p5+p6+p7+p8+p9;
        if(neighbours<2||neighbours>6)continue;
        const transitions=(1-p2)*p3+(1-p3)*p4+(1-p4)*p5+(1-p5)*p6+
          (1-p6)*p7+(1-p7)*p8+(1-p8)*p9+(1-p9)*p2;
        if(transitions!==1)continue;
        if(phase===0?(p2*p4*p6||p4*p6*p8):(p2*p4*p8||p2*p6*p8))continue;
        removed[length++]=i;
      }
      for(let k=0;k<length;k++)skeleton[removed[k]]=0;
      changed+=length;
    }
    if(!changed)break;
  }

  const dx=[1,1,0,-1,-1,-1,0,1],dy=[0,1,1,1,0,-1,-1,-1];
  const offsets=dx.map((x,k)=>x+dy[k]*n),seen=new Uint8Array(count),queue=new Uint32Array(count);
  const components=[];
  // Find connected brush paths, choosing a nearby tip as each path's origin.
  for(const origin of painted){
    if(!skeleton[origin]||seen[origin])continue;
    let head=0,tail=0;queue[tail++]=origin;seen[origin]=1;
    let start=origin,best=Infinity,fallback=origin,fallbackScore=Infinity;
    while(head<tail){
      const i=queue[head++],x=i%n,y=(i/n)|0;let degree=0;
      const score=y*.86+x*.42;
      if(score<fallbackScore){fallback=i;fallbackScore=score;}
      for(let k=0;k<8;k++){
        const xx=x+dx[k],yy=y+dy[k];if(xx<0||yy<0||xx>=n||yy>=n)continue;
        const next=i+offsets[k];if(!skeleton[next])continue;
        degree++;if(!seen[next]){seen[next]=1;queue[tail++]=next;}
      }
      if(degree<=1&&score<best){start=i;best=score;}
    }
    if(best===Infinity)start=fallback;
    components.push({start,score:fallbackScore});
  }
  components.sort((a,b)=>a.score-b.score);seen.fill(0);
  const order=[],stack=[];
  for(const component of components){
    const start=component.start;seen[start]=1;order.push(start);stack.push({i:start,vx:1,vy:0});
    while(stack.length){
      const previous=stack[stack.length-1],i=previous.i,x=i%n,y=(i/n)|0;
      let chosen=-1,rank=-Infinity;
      for(let k=0;k<8;k++){
        const xx=x+dx[k],yy=y+dy[k];if(xx<0||yy<0||xx>=n||yy>=n)continue;
        const next=i+offsets[k];if(!skeleton[next]||seen[next])continue;
        const length=k%2?Math.SQRT2:1;
        const score=(dx[k]*previous.vx+dy[k]*previous.vy)/length+dy[k]*.045+dx[k]*.015;
        if(score>rank){rank=score;chosen=k;}
      }
      if(chosen<0){stack.pop();continue;}
      const next=i+offsets[chosen],length=chosen%2?Math.SQRT2:1;
      seen[next]=1;order.push(next);stack.push({i:next,vx:dx[chosen]/length,vy:dy[chosen]/length});
    }
  }
  const arrivalScale=.975/Math.max(1,order.length-1);
  let head=0,tail=0;seen.fill(0);
  for(let k=0;k<order.length;k++){const i=order[k];birth[i]=k*arrivalScale;seen[i]=1;queue[tail++]=i;}
  // First propagate through actual ink, so a neighbouring stroke cannot steal
  // the arrival time of a thick brush belly across a white counter.
  while(head<tail){
    const i=queue[head++],x=i%n,y=(i/n)|0;
    for(let k=0;k<8;k++){
      const xx=x+dx[k],yy=y+dy[k];if(xx<0||yy<0||xx>=n||yy>=n)continue;
      const next=i+offsets[k];if(seen[next]||!alpha[next])continue;
      seen[next]=1;birth[next]=birth[i];queue[tail++]=next;
    }
  }
  // Then extend nearest arrival into wet margins and tiny disconnected ink
  // grains. A single bounded flood also gives the GPU safe values outside ink.
  head=0;
  while(head<tail){
    const i=queue[head++],x=i%n,y=(i/n)|0;
    for(let k=0;k<8;k++){
      const xx=x+dx[k],yy=y+dy[k];if(xx<0||yy<0||xx>=n||yy>=n)continue;
      const next=i+offsets[k];if(seen[next])continue;
      seen[next]=1;birth[next]=birth[i];queue[tail++]=next;
    }
  }

  // The dense pigment channel is a one-pixel erosion of the untouched raster.
  // It keeps natural ligatures and hairline cracks intact in the alpha channel.
  for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++){
    const i=y*n+x;let inner=alpha[i];
    for(let k=0;k<8;k++)inner=Math.min(inner,alpha[i+offsets[k]]);
    core[i]=inner;
  }
  const workA=new Float32Array(count),workB=new Float32Array(count);
  function box(source,dest,r,horizontal){
    const divisor=r*2+1;
    for(let row=0;row<n;row++){
      let sum=0;for(let k=0;k<=r;k++)sum+=source[horizontal?row*n+k:k*n+row];
      for(let col=0;col<n;col++){
        dest[horizontal?row*n+col:col*n+row]=sum/divisor;
        const incoming=col+r+1,outgoing=col-r;
        if(incoming<n)sum+=source[horizontal?row*n+incoming:incoming*n+row];
        if(outgoing>=0)sum-=source[horizontal?row*n+outgoing:outgoing*n+row];
      }
    }
  }
  const radius=Math.max(1,Math.round(n/224*2));
  box(alpha,workA,radius,true);box(workA,workB,radius,false);
  box(workB,workA,1,true);box(workA,workB,1,false);
  const blur=new Uint8Array(count);for(let i=0;i<count;i++)blur[i]=Math.round(workB[i]);
  return {alpha,birth,blur,core};
}
