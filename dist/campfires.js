// Ink-and-pigment campfires outside the gate. GPU motion uses wind 6 (flame),
// wind 7 (ember), and wind 8 (rising broken smoke strokes).
export function campfireStrokes(groundHeight) {
  if(typeof groundHeight!=='function') throw new TypeError('A groundHeight sampler is required');
  const strokes=[];
  const fires=[[-13,10,5.04,2.275],[15,13,5.84,2.795]];
  let seed=491783;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const range=(a,b)=>a+(b-a)*random();
  const sample=(count,fn)=>Array.from({length:count},(_,i)=>fn(i/(count-1),i));
  const surface=(x,z,lift=.45)=>[x,groundHeight(x,z)+Math.max(.45,lift),z];
  function add(points,color,weight,kind,extra={}) {
    strokes.push({points,color,weight,kind,opacity:.96,wash:false,...extra});
  }

  fires.forEach(([cx,cz,height,width],fireIndex)=>{
    const baseY=groundHeight(cx,cz)+.45;
    const anchor=[cx,baseY,cz];
    // Three crossed split logs, with uneven secondary edges and small end marks.
    for(let log=0;log<3;log++) {
      const a=log*Math.PI/3+fireIndex*.22+.15;
      const halfLength=width*range(.52,.66);
      const vx=Math.cos(a),vz=Math.sin(a);
      for(let edge=0;edge<2;edge++) {
        const offset=(edge-.5)*.15;
        add(sample(5,t=>{
          const u=(t*2-1)*halfLength;
          const x=cx+vx*u-vz*offset,z=cz+vz*u+vx*offset;
          const p=surface(x,z,.49+log*.07);
          p[1]+=Math.sin(t*4.8+log)*.025;
          return p;
        }),edge?0x9b6b38:0x684126,edge?1.2:2.1,'campfire-split-wood');
      }
      const ex=cx+vx*halfLength,ez=cz+vz*halfLength;
      add([surface(ex-vz*.11,ez+vx*.11,.5+log*.07),surface(ex+vz*.11,ez-vx*.11,.5+log*.07)],
        0x4f3829,1.15,'campfire-log-end');
    }
    // The stone ring has gaps and different-sized stones, rather than a clean torus.
    for(let stone=0;stone<9;stone++) {
      const a=stone*Math.PI*2/9+range(-.055,.055);
      const radius=width*range(.68,.76);
      const x=cx+Math.cos(a)*radius,z=cz+Math.sin(a)*radius;
      const size=range(.14,.24),phase=range(0,6.28);
      add(sample(7,t=>{
        const angle=t*Math.PI*1.88;
        const r=size*(.88+Math.sin(angle*3+phase)*.14);
        const px=x+Math.cos(angle)*r,pz=z+Math.sin(angle)*r*.7;
        const p=surface(px,pz,.46);
        p[1]+=Math.max(0,Math.sin(angle))*size*.65;
        return p;
      }),stone%3?0x5c6252:0x8f7753,1.25,'campfire-stone-ring', {opacity:.92});
    }

    // Tongues occupy four radial planes. The fire has depth from every azimuth,
    // without a camera-facing image, filled polygon, or luminous solid model.
    for(let plane=0;plane<4;plane++) {
      const a=plane*Math.PI/2+fireIndex*.31;
      const vx=Math.cos(a),vz=Math.sin(a);
      for(let tongue=0;tongue<3;tongue++) {
        const lateral=(tongue-1)*width*.19;
        const tongueHeight=height*(tongue===1?1:range(.65,.88));
        const phase=fireIndex*2.8+plane*1.21+tongue*.67;
        const tilt=range(-.17,.17)*width;
        const points=sample(9,t=>{
          const bend=Math.sin(t*Math.PI)*width*(tongue===1?.15:.21)
            +Math.sin(t*Math.PI*2+phase)*width*.045*(1-t)+tilt*t*t;
          const sideways=lateral*(1-t*.75)+bend;
          const depth=Math.sin(t*Math.PI+phase)*width*.075*(1-t);
          return [cx+vx*sideways-vz*depth,baseY+.17+t*tongueHeight,cz+vz*sideways+vx*depth];
        });
        const motion={wind:6,motionAnchor:[...anchor],motionPhase:phase,motionScale:range(.8,1.18)};
        const pigment=tongue===1?0xf5be52:tongue===0?0xdc672e:0x9e3828;
        add(points,pigment,3.0,'campfire-flame-pigment',{
          ...motion,wash:true,worldWidth:tongue===1?range(.325,.507):range(.546,.845),opacity:tongue===1?.9:.84
        });
        // A narrow coloured ink spine remains visible through the moving wash.
        add(points.map((p,j)=>[p[0]+vx*.018*Math.sin(j),p[1]+.015,p[2]+vz*.018*Math.sin(j)]),
          tongue===1?0xffd875:0xe88a36,range(1.6,2.5),'campfire-flame-ink',{
            ...motion,motionAnchor:[...anchor],opacity:.95
          });
      }
    }
    for(let ember=0;ember<6;ember++) {
      const a=range(0,Math.PI*2),r=range(.08,width*.25);
      const px=cx+Math.cos(a)*r,pz=cz+Math.sin(a)*r;
      const py=baseY+height*range(.68,1.17),length=range(.09,.19);
      add(sample(4,t=>[px+t*.035,py+t*length,pz+Math.sin(t*3)*.025]),
        ember%2?0xf5be52:0xdc672e,range(1.1,1.6),'campfire-rising-ember',{
          wind:7,motionAnchor:[...anchor],motionPhase:fireIndex*2.7+ember*1.047,
          motionScale:range(.72,1.18),opacity:.87
        });
    }
    // Open grey-ink curls rise in staggered lifecycles. No smoke billboard,
    // filled cloud mesh, or per-frame CPU point update is required.
    for(let plume=0;plume<6;plume++) {
      const turn=plume*1.39+fireIndex*.83;
      const start=height*range(.78,1.02);
      const curlRadius=range(.32,.72),length=range(1.6,2.8);
      const points=sample(11,t=>{
        const angle=turn+t*Math.PI*1.18;
        const radius=curlRadius*(.55+t*.75);
        return [cx+Math.cos(angle)*radius,baseY+start+t*length,cz+Math.sin(angle)*radius*.82];
      });
      add(points,plume%2?0x505b53:0x62695d,range(2.0,2.55),'campfire-smoke-curl',{
        wind:8,motionAnchor:[...anchor],motionPhase:plume*.161+fireIndex*.37,
        motionScale:range(.82,1.13),opacity:range(.66,.8)
      });
    }
    for(let broken=0;broken<3;broken++) {
      const a=range(0,6.28),radius=range(.35,.65),start=height*range(.94,1.15);
      add(sample(5,t=>[
        cx+Math.cos(a)*radius+t*.13,
        baseY+start+t*.55,
        cz+Math.sin(a)*radius+Math.sin(t*3+a)*.08
      ]),0x60685d,1.65,'campfire-smoke-broken',{
        wind:8,motionAnchor:[...anchor],motionPhase:broken*.29+fireIndex*.43+.12,
        motionScale:range(.8,1.15),opacity:.62
      });
    }
  });
  return strokes.sort((a,b)=>Number(b.wash)-Number(a.wash));
}
