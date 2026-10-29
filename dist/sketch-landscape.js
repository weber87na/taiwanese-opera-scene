// Chinese green-and-blue landscape, entirely editable 3D brush paths.
// worldWidth is a brush width in scene units; weight remains the pen-width hint.
import {riverCenterX,riverHalfWidth,riverHeight,isRiverPoint,RIVER_START_Z,RIVER_END_Z} from './river-layout.js';
const PEAKS=[
 [-64,-99,48,29,35],[-103,-141,51,36,44],[-25,-161,47,31,40],
 [29,-179,52,31,39],[70,-118,53,30,37],[119,-76,43,38,47],
 [-125,-28,39,36,41],[-115,62,48,34,38],[-66,130,44,35,34],
 [-17,166,49,32,35],[41,147,51,30,38],[91,111,43,34,37],
 [141,22,31,33,46],[-155,137,42,37,38],[130,175,40,37,40]
];
export function landscapeStrokes(groundHeight){
 if(typeof groundHeight!=='function')throw new TypeError('A groundHeight sampler is required');
 const strokes=[];
 const C={ink:0x173e36,inkBlue:0x204f58,pine:0x204d34,bark:0x754422,
  malachite:0x166a45,deepGreen:0x18583f,jade:0x56833e,
  azurite:0x185d78,farBlue:0x327b84,ochre:0x9f722d,
  gold:0xc1943b,soil:0xa07a3c,water:0x167b8b,foam:0x76b1a1,
  cloud:0x6e9c91,stone:0x5b6650};
 let seed=183771;
 const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const mix=(a,b,t)=>a+(b-a)*t,range=(a,b)=>mix(a,b,rnd());
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const sample=(n,fn)=>Array.from({length:n},(_,i)=>fn(i/(n-1),i));
 // Surface ink clears the terrain mask by at least 0.4 world units.
 const surface=(x,z,lift=.42)=>[x,groundHeight(x,z)+Math.max(.4,lift),z];
 function add(points,color,weight=1,kind='landscape',opacity=.94,wash=false,worldWidth){
  if(points.length<2)return;
  const s={points,color,weight,kind,opacity,wash};
  if(worldWidth!==undefined)s.worldWidth=worldWidth;
  strokes.push(s);
 }
 const wash=(points,color,width,kind,opacity=.64)=>add(points,color,clamp(width*7,18,74),kind,opacity,true,width);

 // Follow the actual downhill field from many shelves, not one radial summit.
 function slopeStroke(x,z,length,count,phase,sideDrift=0,lift=.43){
  const points=[],step=length/(count-1);
  let oldDx=Math.cos(phase),oldDz=Math.sin(phase);
  for(let j=0;j<count;j++){
   const t=j/(count-1);points.push(surface(x,z,lift));
   const gx=groundHeight(x+.8,z)-groundHeight(x-.8,z);
   const gz=groundHeight(x,z+.8)-groundHeight(x,z-.8);
   const norm=Math.hypot(gx,gz);
   let dx=norm>.02?-gx/norm:oldDx,dz=norm>.02?-gz/norm:oldDz;
   const bend=sideDrift+Math.sin(t*5.5+phase)*.27+Math.sin(t*13.2+phase)*.055;
   const vx=dx*Math.cos(bend)-dz*Math.sin(bend),vz=dx*Math.sin(bend)+dz*Math.cos(bend);
   dx=oldDx*.25+vx*.75;dz=oldDz*.25+vz*.75;
   const vlen=Math.hypot(dx,dz)||1;oldDx=dx/vlen;oldDz=dz/vlen;
   x+=oldDx*step;z+=oldDz*step;
  }
  return points;
 }
 // Mineral underpainting traverses the entire hillside before the vertical cun
 // and broken ink. An independent seed preserves every existing scenery stroke.
 let foundationSeed=53281;
 const foundationRandom=()=>{foundationSeed=(Math.imul(foundationSeed,1664525)+1013904223)>>>0;return foundationSeed/4294967296;};
 PEAKS.forEach(([cx,cz,h,sx,sz],index)=>{
  for(let row=0;row<13;row++){
   const depth=(row/12*1.8-.9)*sz;
   const phase=index*1.37+row*.81;
   const wander=.55+foundationRandom()*1.05;
   const points=sample(15,t=>{
    const x=cx+(t*2-1)*sx;
    const z=cz+depth+Math.sin(t*5.2+phase)*wander+Math.sin(t*10.7+phase)*.22;
    return surface(x,z,.8);
   });
   const pigment=row%3===0?C.azurite:row%3===1?C.malachite:C.jade;
   wash(points,pigment,6+foundationRandom()*2,'mountain-mineral-foundation',.48+foundationRandom()*.14);
  }
 });

 PEAKS.forEach(([cx,cz,h,sx,sz],index)=>{
  const far=Math.hypot(cx,cz)>155,phase=index*1.937;
  const colours=far?[C.azurite,C.farBlue,C.malachite,C.azurite]:[C.deepGreen,C.malachite,C.azurite,C.jade];
  // Interlocking wet pigment has unequal starts, lengths, pressure and bends.
  for(let k=0;k<30;k++){
   const col=k%6,row=Math.floor(k/6);
   const x=cx+((col+range(.12,.88))/6-.5)*sx*1.62;
   const z=cz+((row+range(.12,.88))/5-.5)*sz*1.52;
   const path=slopeStroke(x,z,range(10,22),12,phase+k*.91,range(-.38,.38));
   wash(path,colours[k%4],range(4.1,8.7),'layered-mineral-pigment',far?range(.52,.65):range(.61,.78));
  }
  for(let k=0;k<10;k++){
   const path=slopeStroke(cx+range(-.66,.66)*sx,cz+range(-.64,.64)*sz,range(5,12),9,phase+k*1.7,range(-.65,.65),.48);
   wash(path,k%3?C.deepGreen:C.inkBlue,range(1.7,3.8),'broken-ink-stain',range(.44,.62));
  }
  // Open ridge gestures, with no concentric elevation rings.
  for(let orientation=0;orientation<2;orientation++){
   const shift=range(-.17,.17);
   add(sample(31,t=>{
    const u=t*2-1;
    return surface(cx+(orientation?shift+Math.sin(t*5+phase)*.06:u)*sx,
     cz+(orientation?u:shift+Math.sin(t*5+phase)*.06)*sz,.63);
   }),far?C.inkBlue:C.ink,orientation?1.25:1.8,'open-mountain-crest',.88);
  }
  // 披麻皴: wavering fibres in broken clusters.
  for(let k=0;k<23;k++){
   const path=slopeStroke(cx+range(-.72,.72)*sx,cz+range(-.7,.7)*sz,range(5.5,15),10,phase+k*.7,range(-.22,.22),.7);
   add(path,k%4?C.ink:C.ochre,range(.85,1.9),'hemp-fibre-cun',range(.72,.95));
   if(k%3===0)add(path.map((p,j)=>surface(p[0]+.34+Math.sin(j*.8)*.09,p[2]+.18,.73)),C.inkBlue,.72,'split-dry-fibre',.66);
  }
  // 斧劈皴: hooked and wedge-like strokes, never polygon faces.
  for(let k=0;k<14;k++){
   const x=cx+range(-.78,.78)*sx,z=cz+range(-.76,.76)*sz;
   const dx=range(-2.4,2.4),dz=range(-3.1,3.1),hook=range(-.7,.7);
   add(sample(6,t=>surface(x+dx*t+Math.sin(t*Math.PI)*hook,z+dz*t+t*t*.45,.76)),
    k%4?C.ink:C.ochre,range(1.25,2.35),'axe-cut-cun',range(.78,.98));
  }
  // 破墨點苔: dark touches scattered on uneven rock ledges.
  for(let k=0;k<39;k++){
   const x=cx+range(-.82,.82)*sx,z=cz+(k%3-1)*sz*.34+range(-1.5,1.5);
   const length=range(.35,1.15),bend=range(-.45,.45);
   add(sample(4,t=>surface(x+t*length,z+Math.sin(t*Math.PI)*bend,.78)),k%5?C.pine:C.gold,range(1.2,2.5),'moss-ink-touch',.94);
  }
  for(let k=0;k<3;k++){
   const path=slopeStroke(cx+range(-.25,.25)*sx,cz+range(-.25,.25)*sz,range(5,10),8,phase+k,.2,.6);
   wash(path,k?C.jade:C.gold,range(1.25,2.7),'ridge-mineral-light',.46);
  }
 });

 // Open layered bough gestures replace cones and complete cloud-shaped rings.
 function pine(x,z,height,width,turn){
  const base=groundHeight(x,z)+.46,leanX=Math.cos(turn)*height*.12,leanZ=Math.sin(turn)*height*.09;
  for(let side of [-1,1])add(sample(11,t=>[
   x+leanX*t*t+Math.sin(t*4.5)*.15+side*(1-t)*width*.055,
   base+t*height,z+leanZ*t*t+Math.sin(t*3.3+turn)*.13
  ]),C.bark,side===1?1.5:.95,'pine-trunk',.96);
  for(let layer=0;layer<4;layer++){
   const t=.39+layer*.17,tx=x+leanX*t*t,ty=base+height*t,tz=z+leanZ*t*t;
   const a=turn+layer*2.15,spread=width*(1.24-layer*.16);
   const bx=tx+Math.cos(a)*spread*.48,bz=tz+Math.sin(a)*spread*.48;
   add(sample(7,u=>[mix(tx,bx,u),ty+Math.sin(u*Math.PI)*.18+u*.25,mix(tz,bz,u)]),C.bark,1.2,'pine-branch',.94);
   const tangent=[Math.cos(a),Math.sin(a)];
   for(let pass=0;pass<2;pass++){
    const points=sample(10,u=>{
     const d=(u*2-1)*spread,scallop=Math.sin(u*19+layer)*.12+Math.sin(u*31+a)*.055;
     return [bx+tangent[0]*d,ty+.3+scallop+Math.sin(u*Math.PI)*spread*.16+pass*.23,
      bz+tangent[1]*d+Math.sin(u*5+a)*spread*.25];
    });
    if(!pass)wash(points,layer%2?C.malachite:C.deepGreen,range(1.25,2.55),'pine-canopy-pigment',.72);
    else add(points,C.pine,1.45,'pine-bough-ink',.94);
   }
   for(let needle=0;needle<3;needle++){
    const d=(needle-1)*spread*.65,px=bx+tangent[0]*d,pz=bz+tangent[1]*d;
    add(sample(5,u=>[px+u*.32,ty+.4+Math.sin(u*4)*.13-u*.16,pz+u*.22]),C.pine,range(.8,1.35),'pine-needle-touch',.92);
   }
  }
 }
 const GROVES=[[-44,-53],[-57,-4],[-46,48],[42,-54],[46,4],[43,57],
  [-77,-105],[-32,-124],[35,-128],[83,-87],[-74,103],[-24,116],
  [29,112],[79,95],[-120,25],[118,24]];
 GROVES.forEach(([gx,gz],index)=>{
  for(let i=0;i<5;i++){
   const x=gx+range(-6.5,6.5),z=gz+range(-7,7);
   if(Math.abs(x)<28&&z>-73&&z<65)continue;
   if(isRiverPoint(x,z,2.5))continue;
   pine(x,z,range(5.1,9.8),range(1.65,2.85),index*.74+range(-.8,.8));
  }
  for(let i=0;i<4;i++){
   const x=gx+range(-9,9),z=gz+range(-9,9),y=groundHeight(x,z)+.48;
   if(isRiverPoint(x,z,2))continue;
   const size=range(1.5,3),a=range(0,6.28);
   for(let pass=0;pass<2;pass++){
    const points=sample(10,t=>[x+(t*2-1)*size,
     y+.3+Math.sin(t*Math.PI)*size*.43+Math.sin(t*23+a)*.12+pass*.2,
     z+Math.sin(t*4+a)*size*.4]);
    if(!pass)wash(points,i%2?C.jade:C.malachite,range(1.1,2.2),'grove-underbrush',.65);
    else add(points,C.pine,1.1,'underbrush-ink',.86);
   }
  }
 });

 const riverSpan=RIVER_END_Z-RIVER_START_Z,sections=16;
 for(let section=0;section<sections;section++){
  const z0=RIVER_START_Z+section*riverSpan/sections;
  for(let lane=-2;lane<=2;lane++){
   const points=sample(16,t=>{
    const z=Math.min(RIVER_END_Z,z0+t*(riverSpan/sections+1.5));
    const x=riverCenterX(z)+lane*.39*riverHalfWidth(z)+Math.sin(t*5+section)*.10;
    return [x,riverHeight(z)+.03,z];
   });
   // Explicit flat water ribbons prevent the reveal builder from draping the
   // broad current onto the cut bed or up a steep mountain bank.
   add(points,lane===0?C.foam:lane===-2?C.azurite:C.water,32,'river-colour-current',lane===0?.48:.67,true);
   strokes[strokes.length-1].ribbonEdges=points.map((p,index)=>{
    const hw=riverHalfWidth(p[2]),centre=riverCenterX(p[2]);
    const half=hw*.265*(.91+.09*Math.sin(index*.73+section+lane));
    return [-1,1].map(side=>[clamp(p[0]+side*half,centre-hw,centre+hw),p[1],p[2]]);
   });
  }
 }
 for(let side of [-1,1])for(let section=0;section<8;section++){
  const z0=RIVER_START_Z+section*riverSpan/8;
  add(sample(22,t=>{
   const z=z0+t*riverSpan/8,x=riverCenterX(z)+side*(riverHalfWidth(z)+.4+Math.sin(z*.11)*.15);
   return [x,Math.max(groundHeight(x,z)+.5,riverHeight(z)+.07),z];
  }),C.ochre,1.3,'riverbank-ink',.85);
 }
 for(let i=0;i<130;i++){
  const z=range(RIVER_START_Z+2,RIVER_END_Z-4),lane=range(-.85,.85),length=range(1.0,3.8);
  add(sample(6,t=>{
   const zz=z+t*length;
   return [riverCenterX(zz)+lane*riverHalfWidth(zz)+Math.sin(t*4)*.12,riverHeight(zz)+.06,zz];
  }),i%4?C.water:C.foam,range(.85,1.6),'water-ink',.82);
 }

 // Broken ochre scumbling is naturally scaled with perspective.
 for(let i=0;i<84;i++){
  const x=range(-86,86),z=range(-88,102),length=range(5,13),a=range(-.5,.5);
  wash(sample(10,t=>surface(x+t*length,z+Math.sin(t*5+a)*1.1+t*a,.44)),
   i%3?C.soil:C.ochre,range(2.2,5.6),'ochre-earth-scumble',Math.abs(x)<24?.27:.43);
 }
 for(let i=0;i<105;i++){
  const centre=i%7===0,x=centre?range(-17,17):(i%2?1:-1)*range(19,82);
  const z=range(-87,100),y=groundHeight(x,z)+.52,size=range(.28,1.3),a=range(0,6.28);
  add(sample(8,t=>{
   const u=t*Math.PI*1.75,r=size*(.9+.1*Math.sin(u*3+a));
   return [x+Math.cos(u)*r,y+Math.max(0,Math.sin(u))*r*.7,z+Math.sin(u)*r*.48];
  }),C.stone,range(.9,1.55),'ground-rock-ink',.9);
  add(sample(4,t=>[x-size*.3+t*size*.6,y+size*.4+Math.sin(t*3+a)*size*.13,z+size*.05]),C.ochre,.9,'rock-crease',.84);
 }
 for(let i=0;i<92;i++){
  const centre=i%8===0,x=centre?range(-17,17):(i%2?1:-1)*range(18,70);
  const z=range(-78,81),y=groundHeight(x,z)+.5,height=range(.28,.9),a=range(0,6.28);
  for(let blade=0;blade<3;blade++)add(sample(5,t=>[
   x+((blade-1)*.3+Math.cos(a)*.13)*t*t,y+Math.sin(t*1.35)*height,z+Math.sin(a+blade)*t*.25
  ]),blade===1?C.pine:C.ochre,range(.85,1.15),'grass-ink',.86);
 }

 // Open horizontal vapour gestures encircle the 360-degree valley.
 // No enclosed ovals, cartoon puffs or solid sky background layers.
 for(let cluster=0;cluster<12;cluster++){
  const a=cluster*Math.PI/6+range(-.1,.1),radius=range(177,203);
  const cx=Math.cos(a)*radius,cz=Math.sin(a)*radius,tx=-Math.sin(a),tz=Math.cos(a);
  const cy=range(58,76),length=range(37,68);
  for(let layer=0;layer<3;layer++){
   const points=sample(21,t=>{
    const u=(t-.5)*length*(1-layer*.13),rise=Math.sin(t*4.9+cluster)+Math.sin(t*9.1+layer)*.32;
    return [cx+tx*u,cy+layer*1.65+rise,cz+tz*u+Math.sin(t*4)*1.8];
   });
   wash(points,layer?0x98b7a2:C.cloud,range(2,4.8),'horizontal-cloud-wash',layer?.38:.47);
   if(layer<2)add(points.map((p,j)=>[p[0],p[1]+.24+Math.sin(j*.8)*.08,p[2]]),C.cloud,.95,'vapour-ink',.6);
  }
 }
 // Asymmetric low foreground framing for both the inside and outside cues.
 // These clustered wet-ink rocks and scrub never rise into the gateway opening.
 const FOREGROUND=[[-23,26,2.4],[18,38,2.1],[28,22,1.65],[-12,41,1.45],
  [-25,-57,2.25],[20,-48,1.8],[28,-64,1.65],[-11,-63,1.3]];
 FOREGROUND.forEach(([cx,cz,size],index)=>{
  const cy=groundHeight(cx,cz)+.51,phase=index*1.47;
  // Broad, low stone forms are built from overlapping curved brush gestures.
  for(let pass=0;pass<3;pass++){
   const points=sample(9,t=>{
    const u=(t*2-1)*size;
    return [cx+u,cy+Math.sin(t*Math.PI)*size*(.55-pass*.11)+Math.sin(t*9+phase)*.09,
     cz+Math.sin(t*3.2+phase)*size*.34+pass*.23];
   });
   wash(points,pass===0?0x355a4d:pass===1?C.inkBlue:C.ochre,
    size*(.62-pass*.12),'foreground-wet-rock',pass===2?.44:.71);
   add(points.map((p,j)=>[p[0],p[1]+.08+Math.sin(j*1.7)*.04,p[2]]),
    pass===2?C.ochre:C.ink,pass===0?1.65:1.1,'foreground-rock-cun',.91);
  }
  // A rough little shrub sits off-centre, rather than on top of every rock.
  const bx=cx+(index%2?1:-1)*size*.85,bz=cz+size*.35;
  const by=groundHeight(bx,bz)+.52;
  for(let pass=0;pass<3;pass++){
   const points=sample(11,t=>[
    bx+(t*2-1)*size*.72,
    by+Math.sin(t*Math.PI)*size*.48+Math.sin(t*24+phase)*size*.065+pass*.12,
    bz+Math.sin(t*5+phase)*size*.25
   ]);
   if(pass<2)wash(points,pass?C.jade:C.deepGreen,size*.61,'foreground-scrub-pigment',.67);
   add(points,C.pine,pass===1?1.35:1.0,'foreground-scrub-ink',.92);
  }
  // Uneven grass clumps and a few broken moss dabs tie the group to the earth.
  for(let tuft=0;tuft<6;tuft++){
   const x=cx+range(-1.4,1.4)*size,z=cz+range(-1,1)*size;
   const y=groundHeight(x,z)+.5,height=range(.4,.85);
   for(let blade=0;blade<3;blade++)add(sample(5,t=>[
    x+(blade-1)*.31*t*t,y+Math.sin(t*1.45)*height,z+Math.sin(phase+blade)*.25*t
   ]),blade===1?C.pine:C.ochre,range(.9,1.35),'foreground-grass',.9);
  }
  for(let dab=0;dab<8;dab++){
   const x=cx+range(-1.1,1.1)*size,z=cz+range(-.7,.7)*size;
   const length=range(.22,.6);
   add(sample(4,t=>surface(x+t*length,z+Math.sin(t*3+phase)*.08,.64)),
    dab%3?C.pine:C.gold,range(1.4,2.2),'foreground-moss',.95);
  }
 });

 // Broken ochre gestures turn toward the gate. Gaps and irregular spacing keep
 // these as earthen paths, with no paving grid or symmetric straight borders.
 for(let trail=0;trail<4;trail++){
  const inside=trail>=2,side=trail%2?1:-1;
  const startZ=inside?-69:49,endZ=inside?-24:-7;
  const startX=side*(trail%2?19:25),endX=side*(trail%2?6.5:8.5);
  for(let piece=0;piece<6;piece++){
   const t0=piece/6+range(.008,.035),extent=range(.075,.12);
   const points=sample(8,u=>{
    const t=t0+u*extent;
    const x=mix(startX,endX,t)+Math.sin(t*5.1+trail)*2.8;
    const z=mix(startZ,endZ,t)+Math.sin(t*11+trail)*.42;
    return surface(x,z,.56);
   });
   wash(points,piece%3?C.ochre:C.soil,range(.75,1.45),'broken-earth-path',.53);
   if(piece%2===0)add(points,C.bark,1.0,'path-dry-ink',.69);
  }
 }
 // A branch, grass tuft or stone may extend sideways onto a steeper patch.
 // Re-check its final coordinates so the hidden terrain cannot cut its base off.
 for(const s of strokes){
  if(s.kind==='horizontal-cloud-wash'||s.kind==='vapour-ink')continue;
  if(s.kind==='river-colour-current'||s.kind==='water-ink')continue;
  for(const p of s.points)p[1]=Math.max(p[1],groundHeight(p[0],p[2])+.4);
 }
 // Split only the low portion of a brush path that enters the stream. A long
 // mountain wash may begin at the river and climb an entire peak; removing the
 // whole path there would erase the mountain's pigment along with its foot.
 const clipped=[];
 for(const stroke of strokes){
  if(/river|water|cloud|vapour/.test(stroke.kind)){clipped.push(stroke);continue;}
  const submerged=p=>isRiverPoint(p[0],p[2],(stroke.worldWidth||0)*.48)&&p[1]<riverHeight(p[2])+1.0;
  if(!stroke.points.some(submerged)){clipped.push(stroke);continue;}
  let points=[];
  const finish=()=>{if(points.length>1)clipped.push({...stroke,points});points=[];};
  for(const point of stroke.points){if(submerged(point))finish();else points.push(point);}
  finish();
 }
 return clipped.sort((a,b)=>Number(b.wash)-Number(a.wash));
}
