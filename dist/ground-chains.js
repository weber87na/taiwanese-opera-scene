/** Interlocking ink-chain links laid along three continuous ground paths.
 * Rings alternate between nearly flat and tilted planes. There are no models,
 * image textures or physical shadow objects; only dark and light brush strokes.
 */
export function groundChainStrokes(groundHeight = () => 0) {
  const strokes = [];
  const linkScale = 0.45;
  const paths = [
    { points: [[-26,29],[-20,26.5],[-12,29],[-5,33.6],[2.6,33.1],[8,29.4]], maxLinks: 41 },
    { points: [[14,19],[19.5,21],[25.4,26.4],[29,32.5],[26.5,35.6],[23.6,33.9],[25.2,31.1],[28,32.2],[27.3,34.1]], maxLinks: 39 },
    { points: [[-10.5,-45.3],[-5.6,-47],[.1,-45.9],[6.5,-42.4]], maxLinks: 19 },
  ];
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const ground = (x,z) => {
    const y = groundHeight(x,z);
    return Number.isFinite(y) ? y : 0;
  };

  function samplePath(control) {
    const samples = [];
    // Catmull-Rom curves, sampled densely before arc-length spacing.
    for (let i=0;i<control.length-1;i++) {
      const p0=control[Math.max(0,i-1)],p1=control[i];
      const p2=control[i+1],p3=control[Math.min(control.length-1,i+2)];
      for (let j=0;j<24;j++) {
        const t=j/24,t2=t*t,t3=t2*t;
        const coordinate = axis => .5*((2*p1[axis])+(-p0[axis]+p2[axis])*t+
          (2*p0[axis]-5*p1[axis]+4*p2[axis]-p3[axis])*t2+
          (-p0[axis]+3*p1[axis]-3*p2[axis]+p3[axis])*t3);
        samples.push([coordinate(0),coordinate(1)]);
      }
    }
    samples.push(control[control.length-1].slice());
    const distances=[0];
    for(let i=1;i<samples.length;i++)distances.push(distances[i-1]+Math.hypot(samples[i][0]-samples[i-1][0],samples[i][1]-samples[i-1][1]));
    const total=distances[distances.length-1];
    function at(distance) {
      const d=clamp(distance,0,total);
      let lo=0,hi=distances.length-1;
      while(lo+1<hi){const middle=(lo+hi)>>1;if(distances[middle]<d)lo=middle;else hi=middle;}
      const t=(d-distances[lo])/Math.max(.00001,distances[hi]-distances[lo]);
      return [samples[lo][0]+(samples[hi][0]-samples[lo][0])*t,samples[lo][1]+(samples[hi][1]-samples[lo][1])*t];
    }
    return {total,at};
  }

  paths.forEach((path,pathIndex)=>{
    const curve=samplePath(path.points);
    // Preserve the full existing paths while reducing rings and spacing together.
    // maxLinks describes the old spacing; it is not a cap on the smaller links.
    const originalCount=Math.min(path.maxLinks,Math.max(2,Math.round(curve.total/.97)+1));
    const originalPitch=curve.total/(originalCount-1);
    const count=Math.ceil((originalCount-1)/linkScale)+1;
    const pitch=curve.total/(count-1);
    // Link length exceeds pitch, so successive ellipses visibly interlock.
    const majorRadius=clamp(originalPitch*.66,.57,.7)*linkScale;
    for(let link=0;link<count;link++) {
      const distance=link*pitch;
      const centre=curve.at(distance),before=curve.at(distance-.2),after=curve.at(distance+.2);
      let tx=after[0]-before[0],tz=after[1]-before[1];
      const length=Math.hypot(tx,tz)||1;tx/=length;tz/=length;
      const nx=-tz,nz=tx;
      const tilted=(link+pathIndex)%2===1;
      const tilt=tilted?1.11+Math.sin(link*.91)*.09:.12+Math.sin(link*.67)*.04;
      const minorRadius=(.31+Math.sin(link*1.37+pathIndex)*.025)*linkScale;
      const c=Math.cos(tilt),s=Math.sin(tilt);
      const centreLift=.49+minorRadius*Math.abs(s);
      function ringPoint(angle,highlight=false) {
        const along=Math.cos(angle)*majorRadius;
        const across=Math.sin(angle)*minorRadius;
        const x=centre[0]+tx*along+nx*across*c;
        const z=centre[1]+tz*along+nz*across*c;
        const y=ground(x,z)+centreLift+across*s+(highlight?.026:0);
        return [x,y,z];
      }
      const points=[];
      for(let i=0;i<=12;i++)points.push(ringPoint(i*Math.PI/6));
      strokes.push({
        points,color:tilted?0x333c39:0x42473e,
        weight:tilted?1.3:1.2,kind:'ground-chain',opacity:.95,
      });
      // Sparse worn highlights keep the smaller openings readable and avoid
      // increasing highlight density along the unchanged length of chain.
      if(link%3===0) {
        const start=tilted?.12*Math.PI:.82*Math.PI;
        strokes.push({
          points:[ringPoint(start,true),ringPoint(start+.19*Math.PI,true),ringPoint(start+.38*Math.PI,true)],
          color:link%4===0?0xa38b66:0x9b9682,
          weight:.9,kind:'chain-worn-highlight',opacity:.64,
        });
      }
    }
  });
  return strokes;
}
