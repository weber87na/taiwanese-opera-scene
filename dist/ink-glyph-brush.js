/** Procedural brush deposition from ordered 1024-unit stroke medians only.
 * No font, glyph outline, fillText, strokeText, or downloaded image is used.
 * Returned channels are top-down rasters ready for the shared ink atlas.
 */
export function createBrushGlyph(character,record,size=224) {
  const n=Math.max(32,Math.min(512,Math.round(size))),count=n*n;
  const alpha=new Uint8Array(count),core=new Uint8Array(count),birth=new Float32Array(count);
  birth.fill(1);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
  let seed=2166136261;
  for(const char of String(character))seed=Math.imul(seed^char.codePointAt(0),16777619)>>>0;
  const initialSeed=seed;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
  const paper=new Uint8Array(count);
  for(let i=0;i<count;i++)paper[i]=Math.floor(random()*256);
  const raw=(Array.isArray(record?.medians)?record.medians:[]).map(stroke=>
    (Array.isArray(stroke)?stroke:[]).filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]))).filter(stroke=>stroke.length);
  if(!raw.length)return {alpha,birth,blur:new Uint8Array(count),core};
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const stroke of raw)for(const [x,y] of stroke){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  const scale=n*.745/Math.max(maxX-minX,maxY-minY,700);
  const cx=(minX+maxX)/2,cy=(minY+maxY)/2,shear=(random()-.5)*.035;
  const paths=[];
  for(let si=0;si<raw.length;si++){
    const source=raw[si].map(([x,y])=>{
      const py=(cy-y)*scale+n*.5;
      return [(x-cx)*scale+n*.5+(py-n*.5)*shear,py];
    });
    if(source.length===1)source.push([source[0][0]+n*.009,source[0][1]+n*.024]);
    const points=[];
    for(let j=0;j<source.length-1;j++){
      const p0=source[Math.max(0,j-1)],p1=source[j],p2=source[j+1],p3=source[Math.min(source.length-1,j+2)];
      const steps=Math.max(2,Math.ceil(Math.hypot(p2[0]-p1[0],p2[1]-p1[1])/(n/224*.78)));
      for(let k=0;k<steps;k++){
        const t=k/steps,t2=t*t,t3=t2*t,h00=2*t3-3*t2+1,h10=t3-2*t2+t,h01=-2*t3+3*t2,h11=t3-t2;
        points.push([h00*p1[0]+h10*(p2[0]-p0[0])*.38+h01*p2[0]+h11*(p3[0]-p1[0])*.38,
          h00*p1[1]+h10*(p2[1]-p0[1])*.38+h01*p2[1]+h11*(p3[1]-p1[1])*.38]);
      }
    }
    points.push(source[source.length-1]);
    const lengths=[0];let length=0;
    for(let j=1;j<points.length;j++){length+=Math.hypot(points[j][0]-points[j-1][0],points[j][1]-points[j-1][1]);lengths.push(length);}
    const dx=points.at(-1)[0]-points[0][0],dy=points.at(-1)[1]-points[0][1];
    paths.push({points,lengths,length,dx,dy,variation:random(),dry:random()>.37,phase:random()*6.28,rotation:(random()-.5)*.025});
  }
  const total=paths.reduce((sum,p)=>sum+p.length+7,0);
  const baseWidth=n*.044/(1+Math.max(0,paths.length-10)*.019);
  let elapsed=0;
  paths.forEach((path,strokeIndex)=>{
    const {points,lengths,length,dx,dy}=path;
    const leftFalling=dx<-length*.25&&dy>length*.3;
    const rightFalling=dx>length*.3&&dy>length*.3;
    const vertical=Math.abs(dy)>Math.abs(dx)*1.7;
    const dot=length<n*.072;
    let lastTx=1,lastTy=0;
    for(let j=0;j<points.length;j++){
      const t=length?lengths[j]/length:0;
      const before=points[Math.max(0,j-1)],after=points[Math.min(points.length-1,j+1)];
      let tx=after[0]-before[0],ty=after[1]-before[1];const tl=Math.hypot(tx,ty)||1;tx/=tl;ty/=tl;
      const bend=clamp(1-(tx*lastTx+ty*lastTy),0,1);lastTx=tx;lastTy=ty;
      const entry=.12+.88*smooth(0,.12,t),exit=1-smooth(.77,1,t);
      let pressure=.075+entry*(.78+.29*Math.sin(Math.PI*t))*exit;
      if(leftFalling)pressure=.07+entry*(1.25-.78*t)*(1-smooth(.81,1,t));
      if(rightFalling)pressure=.065+entry*(.37+1.02*smooth(.05,.76,t))*(1-smooth(.77,1,t));
      if(dot)pressure=.09+Math.pow(Math.max(0,Math.sin(Math.PI*t)),.68)*1.3;
      pressure+=bend*.22;
      const belly=1+.38*Math.pow(Math.max(0,Math.sin(Math.PI*t)),.65);
      const width=baseWidth*pressure*belly*(vertical?1.12:1)*(.9+path.variation*.2)*(1+Math.sin(t*9+path.phase)*.085);
      const nibAngle=Math.atan2(ty,tx)+.34+Math.sin(t*2.7+path.phase)*.12;
      const cs=Math.cos(nibAngle),sn=Math.sin(nibAngle);
      const a=Math.max(.32,width*.72),b=Math.max(.25,width*.43);
      const jitter=Math.sin(t*5.2+path.phase)*Math.sin(Math.PI*t)*n*.004;
      const middle=points[Math.floor(points.length/2)],rx=points[j][0]-middle[0],ry=points[j][1]-middle[1];
      const tail=length>n*.22?n*.009*smooth(.88,1,t):0;
      const px=points[j][0]-ty*jitter-ry*path.rotation+tx*tail;
      const py=points[j][1]+tx*jitter+rx*path.rotation+ty*tail;
      const ex=Math.sqrt(a*a*cs*cs+b*b*sn*sn)+1.3,ey=Math.sqrt(a*a*sn*sn+b*b*cs*cs)+1.3;
      const x0=Math.max(0,Math.floor(px-ex)),x1=Math.min(n-1,Math.ceil(px+ex));
      const y0=Math.max(0,Math.floor(py-ey)),y1=Math.min(n-1,Math.ceil(py+ey));
      const time=Math.min(.992,(elapsed+t*(length+7))/total*.992);
      const wetDensity=clamp(.91+.12*path.variation+.07*Math.sin(t*6.4+path.phase),.75,1);
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
        const ox=x+.5-px,oy=y+.5-py;
        const u=(ox*cs+oy*sn)/a,v=(-ox*sn+oy*cs)/b;
        const q=u*u+v*v;if(q>1.23)continue;
        const index=y*n+x,grain=paper[index]/255;
        const rim=1.0+(grain-.5)*.10;
        let coverage=clamp((rim-q)*5.4,0,1);
        // Broken peripheral bristles add tiny deposits beyond the main nib.
        if(q>rim&&q<rim+.13&&grain>.9)coverage=Math.max(coverage,.13*(1-(q-rim)/.13));
        if(coverage<=0)continue;
        let dry=1;
        if(path.dry&&t>.20&&t<.95&&q<.86){
          // Two or three broad, broken hairs follow the nib, rather than a
          // uniform screen-space scratch pattern. The coherent gaps survive
          // reduction to stage captions while leaving the stroke readable.
          const across=(-ox*ty+oy*tx)/Math.max(1,width*.48);
          const fibers=path.variation>.5?3:2;
          for(let f=0;f<fibers;f++){
            const center=-.5+f*.43+.055*Math.sin(t*12+path.phase+f*2.1);
            const broken=Math.sin(t*(17+f*5)+path.phase+f*1.9)>.05;
            const gap=.09+.035*Math.sin(t*8+f+path.phase);
            if(broken&&Math.abs(across-center)<gap)dry=Math.min(dry,.14+.16*grain);
          }
        }
        const edgeDensity=.58+.42*clamp((1.03-q)*1.65,0,1);
        const tide=.9+.10*Math.sin(t*10+path.phase+v*2.2);
        const ink=coverage*wetDensity*edgeDensity*tide*(.94+.06*grain)*dry;
        const value=Math.round(ink*255);
        if(value>alpha[index])alpha[index]=value;
        const inner=Math.round(clamp((.67-q)*7,0,1)*wetDensity*tide*dry*255);
        if(inner>core[index])core[index]=Math.min(alpha[index],inner);
        if(value>0&&time<birth[index])birth[index]=time;
      }
    }
    elapsed+=length+7;
  });

  // Four linear-time box passes approximate a wet capillary blur. Keeping this
  // out of the frame loop makes a large caption set inexpensive to initialise.
  const workA=new Float32Array(count),workB=new Float32Array(count);
  function box(source,dest,r,horizontal){
    const divisor=r*2+1;
    for(let row=0;row<n;row++){
      let sum=0;
      for(let k=0;k<=r;k++)sum+=source[horizontal?row*n+k:k*n+row];
      for(let col=0;col<n;col++){
        dest[horizontal?row*n+col:col*n+row]=sum/divisor;
        const incoming=col+r+1,outgoing=col-r;
        if(incoming<n)sum+=source[horizontal?row*n+incoming:incoming*n+row];
        if(outgoing>=0)sum-=source[horizontal?row*n+outgoing:outgoing*n+row];
      }
    }
  }
  const r=Math.max(1,Math.round(n/224*3)),r2=Math.max(1,Math.round(n/224*2));
  box(alpha,workA,r,true);box(workA,workB,r,false);box(workB,workA,r2,true);box(workA,workB,r2,false);
  const blur=new Uint8Array(count);for(let i=0;i<count;i++)blur[i]=Math.round(workB[i]);
  // Carry the closest painted arrival time to its own wet halo; this preserves
  // ordered strokes while allowing the existing GPU shader to grow local bleed.
  const queue=new Uint32Array(count),distance=new Uint8Array(count);distance.fill(255);
  let head=0,tail=0;
  for(let i=0;i<count;i++)if(alpha[i]){distance[i]=0;queue[tail++]=i;}
  const dxs=[1,1,0,-1,-1,-1,0,1],dys=[0,1,1,1,0,-1,-1,-1],halo=r+r2+1;
  while(head<tail){
    const index=queue[head++];if(distance[index]>=halo)continue;
    const y=(index/n)|0,x=index-y*n;
    for(let k=0;k<8;k++){
      const xx=x+dxs[k],yy=y+dys[k];if(xx<0||yy<0||xx>=n||yy>=n)continue;
      const next=yy*n+xx;if(distance[next]!==255)continue;
      distance[next]=distance[index]+1;birth[next]=birth[index];queue[tail++]=next;
    }
  }
  return {alpha,birth,blur,core};
}
