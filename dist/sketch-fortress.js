/** Complete 360-degree mineral-colour brushwork. No images or visible fill planes.
 * worldWidth is the full brush width in world units. Short overlapping washes,
 * broken ink, rubbing and moss replace ruled masonry and wireframe outlines. */
export function fortressStrokes() {
  const strokes=[];
  const C={ink:0x203a35,dry:0x4c5748,teal:0x296e63,jade:0x58886c,blue:0x2a5d73,
    deep:0x25564e,lightJade:0x8baa78,ochre:0xb68b55,gold:0xc7a66b,cream:0xd3ba87,
    earth:0x927650,moss:0x52745b,wood:0x714b34,red:0xa94632,redDark:0x7d372b,
    redLight:0xc46642,brass:0xc5a45c};
  let seed=492186;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const range=(a,b)=>a+(b-a)*random();
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const add=(points,color=C.ink,weight=1.4,kind='architecture',opacity=.86,worldWidth=0)=>{
    if(points.length>1)strokes.push({points,color,weight,kind,opacity,...(worldWidth>0?{wash:true,worldWidth}:{})});
  };
  const wash=(points,color,width,kind,opacity=.72)=>add(points,color,30,kind,opacity,width);
  const broken=(a,b,color=C.ink,weight=1.8,kind='broken-ink',opacity=.91,pieces=2)=>{
    for(let k=0;k<pieces;k++){
      const ta=k/pieces+(k?range(.012,.035):0),tb=(k+1)/pieces-(k<pieces-1?range(.015,.035):0);
      const p=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
      const pa=p(ta),pb=p(tb),pm=p((ta+tb)/2);pm[1]+=range(-.055,.055);
      add([pa,pm,pb],color,weight,kind,opacity);
    }
  };
  const face=(cx,cz,ux,uz)=>(u,y)=>[cx+u*ux,y,cz+u*uz];

  function paintWall(P,width,y0,y1,{edge=true,detail=1}={}) {
    const h=y1-y0,half=width/2;
    const nx=Math.max(2,Math.ceil(width/2.05)),ny=Math.max(2,Math.ceil(h/1.5));
    // Interlocking diagonal dabs: no full-width horizontal wash bands.
    for(let row=0;row<ny;row++)for(let col=0;col<nx;col++){
      const u=-half+(col+.5+range(-.22,.22))*width/nx,y=y0+(row+.5+range(-.19,.19))*h/ny;
      const dx=range(.8,1.6),dy=range(-.65,.65);
      const left=clamp(u-dx,-half+.05,half-.05),right=clamp(u+dx,-half+.05,half-.05);
      const pigment=[C.gold,C.ochre,C.cream,C.gold][Math.floor(random()*4)];
      wash([P(left,clamp(y-dy,y0+.08,y1-.08)),P(u+range(-.15,.15),y+range(-.14,.14)),P(right,clamp(y+dy,y0+.08,y1-.08))],
        pigment,Math.min(range(2.2,3.0),h*.75),'wall-pigment',range(.68,.83));
    }
    for(let i=0;i<Math.round(width*h*.11*detail);i++){
      const u=range(-half+.12,half-.7),y=range(y0+.12,y1-.25),len=range(.22,1.0);
      add([P(u,y+.15),P(u+len*.37,y+range(-.02,.07)),P(u+len,y-.12)],random()>.32?C.dry:C.earth,range(.85,1.5),'wall-rubbing',range(.35,.62));
      if(i%4===0)wash([P(u,y),P(u+.4,y-.35)],C.earth,range(.3,.65),'weathered-ochre',.3);
    }
    for(let i=0;i<Math.max(2,Math.round(width*.15*detail));i++){
      const u=range(-half+.3,half-.6),y=range(y0+.8,y1-.25),s=random()>.5?1:-1;
      add([P(u,y),P(u+s*.17,y-.24),P(u+s*.11,y-.5),P(u+s*.42,y-.78)],C.ink,1.05,'wall-crack',.71);
      if(i%2===0)add([P(u+s*.17,y-.24),P(u-s*.18,y-.4)],C.dry,1.1,'wall-crack',.61);
    }
    for(let i=0;i<Math.max(2,Math.round(width*.22));i++){
      const u=range(-half+.3,half-.3),y=y0+range(.15,1.0);
      wash([P(u-.22,y-.07),P(u+.18,y+.13)],C.moss,range(.5,1.0),'moss-bloom',.54);
      for(let j=0;j<3;j++){
        const q=u+range(-.45,.45),v=y+range(-.1,.3);
        add([P(q,v),P(q+range(.04,.13),v+range(.03,.12))],j===1?C.teal:C.deep,range(1.2,2.2),'moss-dots',.73);
      }
    }
    if(edge){
      broken(P(-half,y1+.04),P(half,y1+.04),C.ink,2.3,'wall-coping',.94,Math.max(2,Math.ceil(width/11)));
      for(const side of [-1,1])broken(P(side*half,y0+.2),P(side*half,y1),C.ink,2.05,'wall-end',.88,2);
    }
  }

  function paintRoof(cx,base,cz,width,depth,rise,curl=.65){
    const hx=width/2,hz=depth/2,ridge=Math.max(.3,hx-hz*.88);
    const height=(x,z)=>{
      const d=Math.min(1,Math.max(Math.abs(z)/hz,(Math.abs(x)-ridge)/(hx-ridge)));
      return base+rise*Math.pow(1-d,1.4)+curl*Math.pow(d,7)+Math.pow(Math.abs(x)/hx,5)*Math.pow(Math.abs(z)/hz,5)*curl*.8;
    };
    const p=(x,z,offset=.52)=>[cx+x,height(x,z)+offset,cz+z];
    const nx=Math.ceil(width/1.85),nz=Math.ceil(depth/1.55);
    // The complete curved hip surface gets irregular pigment, including side faces.
    for(let row=0;row<nz;row++)for(let col=0;col<nx;col++){
      const x=clamp(-hx+(col+.5+range(-.22,.22))*width/nx,-hx+.1,hx-.1);
      const z=clamp(-hz+(row+.5+range(-.24,.24))*depth/nz,-hz+.1,hz-.1);
      const angle=range(-1.15,1.15),len=range(1.0,1.85),dx=Math.cos(angle)*len,dz=Math.sin(angle)*len;
      const a=[clamp(x-dx,-hx+.02,hx-.02),clamp(z-dz,-hz+.02,hz-.02)];
      const b=[clamp(x+dx,-hx+.02,hx-.02),clamp(z+dz,-hz+.02,hz-.02)];
      const colour=[C.teal,C.deep,C.jade,C.blue,C.teal][Math.floor(random()*5)];
      wash([p(...a),p(x+range(-.1,.1),z+range(-.1,.1),.57),p(...b)],colour,range(2.0,2.95),'roof-mineral',range(.69,.84));
    }
    for(let i=0;i<Math.round(width*depth*.08);i++){
      const x=range(-hx+.25,hx-.25),z=range(-hz+.2,hz-.2),direction=z<0?-1:1;
      const stop=clamp(z+direction*range(.55,1.25),-hz+.03,hz-.03);
      add([p(x,z,.65),p(x+range(-.07,.07),(z+stop)/2,.67),p(x+.04,stop,.65)],i%4===0?C.lightJade:C.ink,i%4===0?1.1:1.45,'short-tile-ridge',i%4===0?.67:.75);
    }
    for(const side of [-1,1]){
      for(let chunk=0;chunk<3;chunk++){
        const pts=[];for(let k=0;k<=5;k++)pts.push(p(-hx+width*(chunk+(k/5)*.96)/3,side*hz,.45));
        add(pts,C.ink,2.5,'swept-eave',.97);
        if(chunk!==1)add(pts.map(([x,y,z])=>[x,y+.16,z]),C.gold,1.3,'eave-gold',.74);
      }
      const hip=[];for(let k=0;k<=8;k++)hip.push(p(side*hx,-hz+depth*k/8,.47));
      add(hip,C.ink,2.35,'hip-eave',.93);
      add([[cx+side*(ridge-.4),base+rise+.43,cz],[cx+side*(ridge+.12),base+rise+.48,cz],
        [cx+side*(ridge+.66),base+rise+.87,cz],[cx+side*(ridge+.86),base+rise+1.01,cz]],C.ink,2.4,'ridge-curl',.96);
    }
    broken([cx-ridge,base+rise+.47,cz],[cx+ridge,base+rise+.47,cz],C.deep,2.5,'roof-ridge',.96,2);
    broken([cx-ridge+.2,base+rise+.59,cz],[cx+ridge-.2,base+rise+.59,cz],C.gold,1.25,'ridge-light',.72,2);
  }

  function timber(P,width,floor,top,posts){
    const h=top-floor;
    for(const y of [floor+.15,floor+.95,top-.18]){
      const n=Math.ceil(width/3.4);
      for(let i=0;i<n;i++){
        const a=-width/2+i*width/n,b=-width/2+(i+1.08)*width/n;
        wash([P(a,y),P((a+b)/2,y+range(-.05,.05)),P(Math.min(width/2,b),y)],y>top-1?C.wood:C.red,y>top-1?.6:.45,'timber-pigment',.87);
      }
      broken(P(-width/2,y+.17),P(width/2,y+.17),C.ink,1.9,'timber-beam',.92,3);
    }
    for(const x of posts){
      wash([P(x,floor-.22),P(x+.04,floor+h*.44),P(x,top)],C.red,.84,'vermilion-column',.89);
      wash([P(x-.15,floor+.08),P(x-.1,top-.1)],C.redLight,.24,'column-light',.48);
      broken(P(x+.27,floor-.2),P(x+.27,top),C.ink,2.0,'column-ink',.9,2);
      for(let tier=0;tier<3;tier++){
        const y=top-.3-tier*.31,w=1.02-tier*.22;
        wash([P(x-w,y),P(x,y-.08),P(x+w,y)],tier===1?C.gold:C.red,.29,'bracket-colour',.79);
        add([P(x-w,y+.06),P(x-w*.45,y-.12),P(x+w*.5,y-.1),P(x+w,y+.09)],C.ink,1.65,'dougong',.9);
      }
      for(const side of [-1,1])add([P(x,top-1.6),P(x+side*.4,top-1.22),P(x+side*.83,top-.69),P(x+side*1.3,top-.39)],C.ink,1.7,'bracket-sweep',.9);
    }
    for(let x=-width/2+.4;x<width/2-.2;x+=range(1.1,1.55))broken(P(x,floor+.19),P(x+range(-.04,.04),floor+.91),C.wood,1.35,'baluster',.85,1);
  }

  for(const z of [-13.61,-18.38])for(const [a,b] of [[-45,-6],[6,45]])paintWall(face((a+b)/2,z,1,0),b-a,.1,9.64);
  for(const z of [-12.6,-19.05])paintWall(face(0,z,1,0),13.6,10.07,12.27,{detail:.65});
  for(const x of [-45.35,45.35])paintWall(face(x,-16,0,1),3.9,.1,9.7,{detail:.7});
  for(const x of [-5.49,5.49])paintWall(face(x,-16,0,1),3.9,.1,10.0,{detail:.65});
  for(const side of [-1,1])for(let i=0;i<13;i++){
    const x=side*(7+i*2.95);
    wash([[x,10.22,-17.5],[x+side*1.45,10.25,-16.1],[x+side*2.8,10.23,-14.45]],C.gold,2.2,'coping-top',.79);
  }
  // Four-sided merlons keep the same colour when passing around the rampart.
  for(const side of [-1,1])for(let x=6.5;x<45;x+=3.4){
    const cx=side*(x+.8);
    for(const z of [-13.66,-15.44]){
      wash([[cx-.65,10.1,z],[cx+.03,10.75,z],[cx+.65,10.45,z]],C.cream,1.45,'battlement-pigment',.84);
      add([[cx-.78,10.2,z],[cx-.8,11.26,z],[cx+.76,11.26,z]],C.ink,1.9,'battlement-ink',.91);
    }
    for(const sign of [-1,1])wash([[cx+sign*1.1,10.1,-15.13],[cx+sign*1.1,10.8,-14.57],[cx+sign*1.1,10.36,-13.98]],C.ochre,1.1,'battlement-side',.82);
  }

  for(const z of [-11.85,-20.15])timber(face(0,z,1,0),23,12.8,17.6,[-10,-5,0,5,10]);
  for(const x of [-10.66,10.66])timber(face(x,-16,0,1),7.2,12.8,17.6,[-3.5,3.5]);
  for(const z of [-13.37,-18.63]){
    const P=face(0,z,1,0);
    for(let x=-6.6;x<6.5;x+=1.9)wash([P(x,19.81),P(x+.7,20.58),P(x+1.65,20.08)],C.redDark,1.55,'upper-storey',.82);
    broken(P(-7,20.95),P(7,20.95),C.ink,2,'upper-beam',.93,3);
  }
  for(const x of [-7.35,7.35])wash([[x,19.8,-17.9],[x,20.62,-16],[x,19.95,-14.1]],C.redDark,1.7,'upper-storey-side',.84);
  paintRoof(0,17.8,-16,28,12.4,3.1,.75);paintRoof(0,21,-16,17.5,7,1.7,.45);
  for(const z of [-11.3,-20.7]){
    for(let i=0;i<4;i++)wash([[-3.45+i*1.8,14.6,z],[-2.7+i*1.8,15.4,z],[-3.15+i*1.8,16.03,z]],C.redDark,1.8,'panel-colour',.87);
    broken([-3.8,16.4,z],[3.8,16.4,z],C.brass,1.9,'panel-gold',.94,2);
    broken([-3.8,14.3,z],[3.8,14.3,z],C.brass,1.6,'panel-gold',.86,2);
    for(const side of [-1,1])add([[side*3.8,14.3,z],[side*3.8,16.4,z],[side*3.34,16.4,z]],C.brass,1.7,'panel-end',.9);
  }

  for(const [cx,elevation] of [[-34,.5],[34,1.3]]){
    for(const z of [-12.97,-21.73])paintWall(face(cx,z,1,0),8.4,elevation+.1,elevation+12.4);
    for(const x of [cx-4.53,cx+4.53])paintWall(face(x,-17.5,0,1),7.8,elevation+.1,elevation+12.4);
    for(const z of [-12.98,-22.02])timber(face(cx,z,1,0),9.5,elevation+12.85,elevation+17.5,[-3.8,3.8]);
    for(const x of [cx-4.46,cx+4.46])timber(face(x,-17.5,0,1),8.2,elevation+12.85,elevation+17.5,[-3.3,3.3]);
    paintRoof(cx,17.7+elevation,-17.5,12,10.7,3.3,.65);
  }
  for(const [x,z,w,d,h] of [[-30,-43,15,11,8],[30,-43,18,11,9],[0,-86,23,12,11]]){
    const bw=w-2,bd=d-2;
    for(const side of [-1,1]){
      const P=face(x,z+side*(bd/2+.34),1,0);paintWall(P,bw,.1,h,{detail:.6});
      paintWall(face(x+side*(bw/2+.34),z,0,1),bd,.1,h,{detail:.55});
      for(let dx=-bw/2+1;dx<bw/2;dx+=3.2){
        wash([P(dx,.2),P(dx+.03,h*.5),P(dx,h-.15)],C.red,.6,'hall-post',.84);
        broken(P(dx+.2,.15),P(dx+.2,h),C.ink,1.6,'hall-post-ink',.85,2);
      }
      for(let dx=-bw/2+2;dx<bw/2-1;dx+=4.4){
        wash([P(dx-.55,h*.5),P(dx+.04,h*.7),P(dx+.6,h*.54)],C.deep,1.25,'hall-window',.78);
        broken(P(dx-.66,h*.76),P(dx+.67,h*.76),C.wood,1.45,'window-lintel',.83,1);
      }
    }
    paintRoof(x,h,z,w+2,d+2,3.1,.6);
  }

  for(const side of [-1,1]){
    const angle=-side*1.24,c=Math.cos(angle),s=Math.sin(angle);
    const at=(u,y,v)=>[side*5.8+c*u+s*v,y,-15.3-s*u+c*v];
    for(const v of [-.55,.55]){
      for(let row=0;row<5;row++)for(let col=0;col<3;col++){
        const u=-side*(.9+col*1.8+range(-.14,.14)),y=.95+row*1.8;
        wash([at(u-side*.55,y-.65,v),at(u,y+.1,v),at(u+side*.5,y+.65,v)],col===1?C.redDark:C.red,2.05,'door-pigment',.86);
      }
      for(const u of [0,-side*5.6])broken(at(u,0,v),at(u,9.3,v),C.ink,2.25,'door-edge',.95,3);
      for(const y of [1.3,4.8,8.1]){
        broken(at(-side*.1,y,v),at(-side*5.5,y,v),C.ink,2.2,'door-brace',.93,2);
        for(const u of [-side*.65,-side*2.8,-side*4.95])add([at(u-.06,y-.06,v),at(u+.06,y+.06,v)],C.brass,2.1,'door-stud',.95);
      }
      for(let i=0;i<8;i++){
        const u=-side*range(.35,5.25),y=range(.9,7.5);
        add([at(u,y-.5,v),at(u-.06,y-.13,v),at(u+.05,y+.24,v),at(u,y+.73,v)],i%3===0?C.gold:C.wood,1.05,'wood-grain',.65);
      }
    }
    const u=-side*5.85;wash([at(u,.2,-.16),at(u,4.7,0),at(u,9.1,.16)],C.wood,.5,'door-endgrain',.85);
  }

  function flag(x,y,z,scale,phase){
    const theta=-.2+phase*.17,c=Math.cos(theta),s=Math.sin(theta),w=3.9*scale;
    const at=(u,v)=>{
      const t=u/w,fold=(Math.sin(u*2.8+phase)*.2+Math.sin(u*5.3+v+phase)*.08)*t*.8;
      return[x+c*u+s*fold,y+7.6*scale+v-t*.13-t*t*.17,z-s*u+c*fold];
    };
    for(const [ox,oz] of [[.29,0],[-.29,0],[0,.29],[0,-.29]])
      broken([x+ox,y,z+oz],[x+ox,y+9.7*scale,z+oz],C.wood,1.4,'flagpole',.84,2);
    for(let row=0;row<3;row++)for(let col=0;col<3;col++){
      const u=w*(col+.5)/3,v=(-.85+row*.83)*scale;
      wash([at(Math.max(.03,u-w*.2),v-.2*scale),at(u,v+.13*scale),at(Math.min(w,u+w*.2),v+.2*scale)],row===0?C.redDark:C.red,1.12*scale,'flag-vermilion',.89);
    }
    for(const v of [-1.35,1.35]){
      const pts=[];for(let i=0;i<=6;i++)pts.push(at(w*i/6,v*scale));add(pts,C.redDark,2.1,'flag-edge',.95);
      const gold=[];for(let i=0;i<=5;i++)gold.push(at(w*i/5,(v>0?v-.16:v+.16)*scale));add(gold,C.brass,1.4,'flag-gold',.88);
    }
    add([at(w,1.35*scale),at(w,.1),at(w,-1.35*scale)],C.redDark,1.9,'flag-tip',.92);
    const mid=w*.47,hw=w*.21,hh=.82*scale;
    add([at(mid-hw,0),at(mid,hh),at(mid+hw,0),at(mid,-hh),at(mid-hw,0)],C.brass,1.5,'flag-ornament',.9);
  }
  flag(-15,0,-11.5,1.15,0);flag(15,0,-11.5,1.15,1.4);
  flag(-34,20.4,-17.5,.72,2.8);flag(34,21.2,-17.5,.72,4.1);
  flag(-24,9.8,-16,.67,1);flag(24,9.8,-16,.67,3.2);
  for(const side of [-1,1]){
    for(let i=0;i<10;i++){
      const x=side*(18+i*.32),z=-9+i*2.2,top=3.15+Math.sin(i)*.1;
      for(const [ox,oz] of [[.34,0],[-.34,0],[0,.34],[0,-.34]]){
        wash([[x+ox,.15,z+oz],[x+ox+.02,1.6,z+oz],[x+ox,top,z+oz]],C.wood,.3,'fence-post',.76);
        broken([x+ox,0,z+oz],[x+ox,top,z+oz],C.ink,1.25,'fence-ink',.8,2);
      }
      if(i<9)for(const y of [.8,1.95]){
        const end=[side*(18+(i+1)*.32),y+.28,-9+(i+1)*2.2];
        wash([[x,y+.28,z],end],C.wood,.28,'fence-rail',.73);add([[x,y+.34,z],end],C.ink,1.3,'fence-rail-ink',.81);
      }
    }
    const x=side*7.55,z=-11.75,pts=[];
    for(let i=0;i<=10;i++){const a=i*Math.PI/5;pts.push([x+Math.cos(a)*.44,5.85+Math.sin(a)*.62,z]);}
    wash([[x,5.35,z],[x+.04,5.86,z],[x,6.34,z]],C.brass,.7,'lantern-colour',.85);
    add(pts,C.ink,1.7,'lantern-ink',.9);add([[x-.48,6.47,z],[x+.48,6.47,z]],C.ink,1.9,'lantern-cap',.93);
  }
  return strokes;
}
