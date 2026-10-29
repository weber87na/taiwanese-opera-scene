import * as THREE from './vendor/three.module.js';

import {createBrushGlyph} from './ink-glyph-brush.js';
import {loadInkStrokeData} from './ink-stroke-data.js';
import {createCalligraphyGlyph} from './ink-calligraphy-glyph.js';
import {loadCalligraphyFace} from './calligraphy-face.js';

const CELL=224;
const glyphCache=new Map();
export function releaseInkGlyphCache(){glyphCache.clear();}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const characters=(text,max)=>Array.from(String(text??'').trim()).slice(0,max);

export async function createInkCredits(config={}) {
  const started=performance.now();
  // Optional reusable vertical layout. x/y are glyph-centre coordinates in
  // height-normalised clip space (x is divided by aspect in the shader).
  // lineHeight is an absolute step, and units is each glyph's writing-time weight.
  const useBlocks=Array.isArray(config.blocks);
  const blocks=useBlocks?config.blocks.slice(0,12).map(block=>{
    const size=clamp(number(block?.size,.15),.025,.65);
    return {
      text:characters(String(block?.text??'').replace(/[\r\n]/g,''),40),
      x:number(block?.x,0),y:number(block?.y,.5),size,
      lineHeight:clamp(number(block?.lineHeight,size*.96),size*.55,size*2.5),
      units:clamp(number(block?.units,1),.1,10),
    };
  }).filter(block=>block.text.length):[];
  const defaultCredits=[{role:'製作人',name:'土撥鼠哥'},{role:'主演',name:'南方薪傳'}];
  const entries=(Array.isArray(config.credits)?config.credits:defaultCredits).slice(0,4).map(item=>({
    role:characters(item?.role,6),name:characters(item?.name,8),
  })).filter(item=>item.role.length||item.name.length);
  const enabled=config.enabled!==false&&(useBlocks?blocks.length>0:entries.length>0);
  const writingMs=Math.round(clamp(number(config.writingSeconds,4.4),.25,30)*1000);
  const holdMs=Math.round(clamp(number(config.holdSeconds,1.2),0,30)*1000);
  const fadeMs=Math.round(clamp(number(config.fadeSeconds,1),.1,15)*1000);
  const durationMs=enabled?Math.round(writingMs+holdMs+fadeMs):0;
  if(!enabled){
    const geometry=new THREE.BufferGeometry(),material=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthTest:false,depthWrite:false});
    const mesh=new THREE.Mesh(geometry,material);mesh.name='Disabled ink credits';mesh.visible=false;
    mesh.renderOrder=100;mesh.frustumCulled=false;
    return {mesh,durationMs:0,update(){mesh.visible=false;},dispose(){geometry.dispose();material.dispose();}};
  }
  const unique=[...new Set(useBlocks?blocks.flatMap(block=>block.text):entries.flatMap(entry=>[...entry.role,...entry.name]))];
  let face,records,missing=[];
  if(config.letteringStyle!=='procedural'){
    try{face=await loadCalligraphyFace();missing=unique.filter(character=>!face.characters.has(character));}
    catch(error){console.warn('行書載入失敗，使用程序毛筆筆畫。',error);}
  }
  if(!face)({records,missing}=await loadInkStrokeData(unique));
  if(missing.length){
    // Never silently substitute a conventional font or omit part of a credit.
    // Preserve the scene if a future custom character is outside the local library.
    console.warn(`水墨字庫缺字 ${missing.join(' ')}；此段題字暫停顯示，場景照常播放。`);
    const disabled=await createInkCredits({enabled:false});
    disabled.mesh.userData.inkCredits={renderer:'stroke-brush',missingCharacters:missing};
    return disabled;
  }
  const columns=Math.max(1,Math.ceil(Math.sqrt(unique.length))),rows=Math.max(1,Math.ceil(unique.length/columns));
  const atlasWidth=columns*CELL,atlasHeight=rows*CELL;
  const pixels=new Uint8Array(atlasWidth*atlasHeight*4),glyphs=new Map();
  for(let index=0;index<unique.length;index++){
    const character=unique[index];
    const key=`${face?.family||'procedural'}:${character}`;
    if(!glyphCache.has(key))glyphCache.set(key,face?createCalligraphyGlyph(character,face.family,CELL):createBrushGlyph(character,records.get(character),CELL));
    const {alpha,birth,blur,core}=glyphCache.get(key);
    const column=index%columns,row=(index/columns)|0;
    for(let y=0;y<CELL;y++)for(let x=0;x<CELL;x++){
      const source=y*CELL+x,destination=((atlasHeight-1-(row*CELL+y))*atlasWidth+column*CELL+x)*4;
      pixels[destination]=alpha[source];pixels[destination+1]=Math.round(clamp(birth[source],0,1)*255);
      pixels[destination+2]=blur[source];pixels[destination+3]=core[source];
    }
    glyphs.set(unique[index],[column/columns,1-(row+1)/rows,1/columns,1/rows]);
    // Build once without per-glyph timers: hidden/occluded Chrome tabs throttle
    // timers to one second, turning a sub-second atlas build into a long delay.
  }
  const atlas=new THREE.DataTexture(pixels,atlasWidth,atlasHeight,THREE.RGBAFormat,THREE.UnsignedByteType);
  atlas.name='Procedural brush deposit / stroke arrival / wet spread / ink core';atlas.colorSpace=THREE.NoColorSpace;
  atlas.flipY=false;atlas.generateMipmaps=false;atlas.minFilter=THREE.LinearFilter;atlas.magFilter=THREE.LinearFilter;atlas.needsUpdate=true;
  const positions=[],uvs=[],cells=[],starts=[],durations=[],seeds=[],expressions=[];
  const totalUnits=(useBlocks?blocks.reduce((sum,block)=>sum+block.text.length*block.units,0):
    entries.reduce((sum,entry)=>sum+entry.role.length*.65+entry.name.length,0))||1;
  let elapsedUnits=0,letterIndex=0;
  function letter(character,x,y,size,units){
    const rect=glyphs.get(character);if(!rect)return;
    if(/[，。、；：！？]/u.test(character)){x+=size*.20;y+=size*.20;}
    const corners=[[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]];
    const start=elapsedUnits/totalUnits*writingMs,duration=units/totalUnits*writingMs;
    const variation=k=>{const v=Math.sin((letterIndex+1)*12.9898+k*78.233)*43758.5453;return (v-Math.floor(v))*2-1;};
    const smallBody=useBlocks&&size<.18;
    const glyphSize=size*(1+variation(1)*(smallBody?.035:.09));
    const angle=variation(2)*(smallBody?1.4:4)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
    const jitterX=variation(3)*size*(smallBody?.025:.065),jitterY=variation(4)*size*(smallBody?.018:.04);
    for(const [u,v] of corners){
      const px=(u-.5)*glyphSize,py=(v-.5)*glyphSize;
      positions.push(x+jitterX+c*px-s*py,y+jitterY+s*px+c*py,0);uvs.push(u,v);cells.push(...rect);
      starts.push(start);durations.push(duration);seeds.push(letterIndex*3.71+1.3);
      expressions.push(size>.23?1:.3);
    }
    elapsedUnits+=units;letterIndex++;
  }
  if(useBlocks){
    for(const block of blocks)block.text.forEach((character,i)=>letter(character,block.x,block.y-i*block.lineHeight,block.size,block.units));
  }else{
    const fontScale=clamp(number(config.fontScale,1.15),.8,1.35);
    const span=entries.length===2?.76:entries.length===3?1.25:1.48;
    entries.forEach((entry,index)=>{
      const centre=entries.length===1?0:span/2-index*span/(entries.length-1);
      const nameSize=Math.min(.29*fontScale,1.4/(Math.max(1,entry.name.length)*1.04));
      const pitch=nameSize*.96,top=(entry.name.length-1)*pitch/2;
      const roleSize=Math.min(.112*fontScale,nameSize*.56,1.12/Math.max(1,entry.role.length));
      const x=centre*(16/9),roleX=x+nameSize*.72;
      entry.role.forEach((character,i)=>letter(character,roleX,top+nameSize*.2-i*roleSize*1.04,roleSize,.65));
      entry.name.forEach((character,i)=>letter(character,x,top-i*pitch,nameSize,1));
    });
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setAttribute('cell',new THREE.Float32BufferAttribute(cells,4));
  geometry.setAttribute('startTime',new THREE.Float32BufferAttribute(starts,1));
  geometry.setAttribute('writeDuration',new THREE.Float32BufferAttribute(durations,1));
  geometry.setAttribute('seed',new THREE.Float32BufferAttribute(seeds,1));
  geometry.setAttribute('expression',new THREE.Float32BufferAttribute(expressions,1));
  const requestedInk=new THREE.Color();try{requestedInk.set(config.inkColor||'#101010');}catch{requestedInk.set('#101010');}
  // Preserve density preference while keeping the actual pigment neutral deep ink.
  const inkLevel=Math.min(.0025,(requestedInk.r*.2126+requestedInk.g*.7152+requestedInk.b*.0722)*.3);
  const ink=new THREE.Color().setRGB(inkLevel,inkLevel,inkLevel);
  const material=new THREE.ShaderMaterial({
    name:'Pressure-painted stroke ink',transparent:true,depthTest:false,depthWrite:false,
    side:THREE.DoubleSide,forceSinglePass:true,toneMapped:false,
    uniforms:{atlas:{value:atlas},timeMs:{value:0},exitProgress:{value:0},aspect:{value:16/9},inkColor:{value:ink}},
    vertexShader:`
      attribute vec4 cell;attribute float startTime,writeDuration,seed,expression;
      uniform float timeMs,exitProgress,aspect;
      varying vec2 vGlyphUv;varying vec4 vCell;varying float vProgress,vAge,vSeed,vWriteMs,vExpression;
      void main(){
        vGlyphUv=uv;vCell=cell;vSeed=seed;vExpression=expression;
        vProgress=(timeMs-startTime)/max(writeDuration,1.0);vAge=timeMs-startTime;vWriteMs=writeDuration;
        vec2 p=position.xy;
        p+=vec2(sin(seed)*.014,cos(seed*.7)*.018)*exitProgress*exitProgress;
        gl_Position=vec4(p.x/max(aspect,.5),p.y,0.0,1.0);
      }`,
    fragmentShader:`
      uniform sampler2D atlas;uniform float exitProgress;uniform vec3 inkColor;
      varying vec2 vGlyphUv;varying vec4 vCell;varying float vProgress,vAge,vSeed,vWriteMs,vExpression;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float softNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      void main(){
        if(vProgress<=0.0)discard;
        vec2 pixel=vGlyphUv*224.;
        vec4 data=texture2D(atlas,vCell.xy+clamp(vGlyphUv,.001,.999)*vCell.zw);
        vec2 edgeFlow=vec2(softNoise(pixel*.13+vSeed),softNoise(pixel*.15+vSeed+19.))-0.5;
        vec2 uv=vGlyphUv+edgeFlow*(2.7+vExpression*1.5+exitProgress*3.1)/224.;
        uv+=vec2(sin(vGlyphUv.y*17.+vSeed),cos(vGlyphUv.x*14.+vSeed))*.008*exitProgress;
        vec4 ragged=texture2D(atlas,vCell.xy+clamp(uv,.001,.999)*vCell.zw);
        float progress=clamp(vProgress,0.,1.);
        float arrival=mix(data.g,ragged.g,.3);
        float reveal=smoothstep(arrival-.018,arrival+.05,progress);
        reveal=mix(reveal,1.0,step(.999,progress));
        float localAge=max(0.,(vProgress-arrival)*vWriteMs*.001);
        float spread=smoothstep(.015,1.65,localAge);
        float settling=smoothstep(.18,1.25,localAge);
        float fresh=1.-smoothstep(.04,.85,localAge);
        float coverage=mix(data.r,ragged.r,.68);
        float spine=mix(data.a,ragged.a,.38);
        // Separate real thickened paint from the original ink spine. Dark loaded
        // centres transition to a more dilute shoulder and then outward wet ink.
        vec2 pigmentDrift=vec2(vAge*.000085,-vAge*.00004);
        float inkCloud=softNoise(vGlyphUv*vec2(7.5,9.5)+vSeed+pigmentDrift);
        float pool=smoothstep(.45,.83,softNoise(vGlyphUv*12.5+vSeed*.5));
        float coreDensity=mix(.70,.995,inkCloud);
        coreDensity=mix(coreDensity,1.,pool*.72+fresh*.2);
        float shoulderDensity=.48+.24*inkCloud+.16*fresh;
        float density=mix(shoulderDensity,coreDensity,smoothstep(.1,.92,spine));
        // A few broad, broken dry gaps in thick strokes; no all-over thin scratches.
        float dryPatch=softNoise(vGlyphUv*vec2(19.,10.)+vSeed*1.7);
        float interior=smoothstep(.8,.97,data.b)*smoothstep(.65,.95,spine);
        float flyWhite=smoothstep(.76,.94,dryPatch)*interior*.43*settling;
        float tooth=smoothstep(.88,.995,hash(floor(pixel*1.3)+vSeed))*.035*settling;
        float body=coverage*reveal*density*(1.-flyWhite-tooth);
        float wetMask=mix(data.b,ragged.b,.65);
        float wetEdge=max(0.,wetMask-coverage*.48);
        float wet=wetEdge*spread*(.96+vExpression*.45+.14*fresh+exitProgress*.16)*(.58+.42*inkCloud);
        float alpha=max(body,wet);
        // Water blooms split the loaded pigment into irregular islands on exit.
        float field=softNoise(vGlyphUv*10.5+vSeed)*.79+dryPatch*.13;
        float erosion=smoothstep(field*.79+.055,field*.79+.22,exitProgress);
        alpha*=1.0-erosion;
        alpha*=1.0-smoothstep(.94,1.,exitProgress);
        if(alpha<.002)discard;
        gl_FragColor=vec4(inkColor,alpha);
        #include <colorspace_fragment>
      }`,
  });
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Vertical ink opening credits';
  mesh.renderOrder=100;mesh.frustumCulled=false;mesh.visible=false;
  mesh.userData.inkCredits={glyphCount:unique.length,letterCount:letterIndex,atlasSize:[atlasWidth,atlasHeight],renderer:face?'calligraphy-ink':'stroke-brush',calligrapher:face?'青柳衡山':'',strokeCount:face?0:unique.reduce((sum,ch)=>sum+records.get(ch).medians.length,0),buildMs:performance.now()-started};
  function update(milliseconds){
    const time=Number.isFinite(milliseconds)?milliseconds:0;
    mesh.visible=enabled&&time>0&&time<durationMs;
    material.uniforms.timeMs.value=Math.max(0,time);
    material.uniforms.exitProgress.value=clamp((time-writingMs-holdMs)/fadeMs,0,1);
  }
  function dispose(){geometry.dispose();material.dispose();atlas.dispose();}
  return {mesh,durationMs,update,dispose};
}
