import * as THREE from './vendor/three.module.js';

/** Reveals the original pixels by tracing connected ink, with one arrival lookup.
 * The caller retains ownership of sourceTexture. All processing occurs once.
 */
export function createOpeningPaper(sourceTexture, width, height) {
  const started=performance.now();
  const source=sourceTexture.image;
  const pixelWidth=source?.naturalWidth||source?.videoWidth||source?.width;
  const pixelHeight=source?.naturalHeight||source?.videoHeight||source?.height;
  if(!pixelWidth||!pixelHeight)throw new Error('Opening drawing needs a loaded source texture.');
  const size=pixelWidth*pixelHeight;
  let rgba;
  if(source.data && source.data.length>=size*4)rgba=source.data;
  else {
    const canvas=document.createElement('canvas');
    canvas.width=pixelWidth;canvas.height=pixelHeight;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    if(!context)throw new Error('Unable to read the opening drawing pixels.');
    context.drawImage(source,0,0,pixelWidth,pixelHeight);
    rgba=context.getImageData(0,0,pixelWidth,pixelHeight).data;
  }
  const regions=new Uint8Array(size),counts=new Uint32Array(5);
  let left=pixelWidth,top=pixelHeight,right=-1,bottom=-1;
  for(let i=0;i<size;i++) {
    const offset=i*4,r=rgba[offset],g=rgba[offset+1],b=rgba[offset+2];
    if(Math.min(r,g,b)>=246 || rgba[offset+3]<8)continue;
    const y=(i/pixelWidth)|0,x=i-y*pixelWidth;
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    let region;
    if(g-r>8 && g-b>5)region=2; // green mountain ink
    else if(b-r>12 && b>=g-8)region=3; // blue river ink
    else if(r-b>9 && r-g>3)region=1; // ochre ground ink
    else {
      region=y<pixelHeight*.205 && x>pixelWidth*.35 ? 4 : 2;
    }
    regions[i]=region;counts[region]++;
  }
  // Remove only empty outer paper, retaining every visible ink pixel. The
  // reveal reuses these normalized bounds for its moving stroke origins.
  const sourceBounds=right<0?{left:0,top:0,width:1,height:1}:{
    left:left/pixelWidth,top:top/pixelHeight,
    width:(right-left+1)/pixelWidth,height:(bottom-top+1)/pixelHeight,
  };

  const arrivalPixels=new Uint8Array(size);arrivalPixels.fill(255);
  const stackSize=Math.max(1,...counts);
  const stack=new Uint32Array(stackSize),directions=new Uint8Array(stackSize);
  const dx=[1,1,0,-1,-1,-1,0,1],dy=[0,1,1,1,0,-1,-1,-1];
  const pushOrder=[4,-3,3,-2,2,-1,1,0];
  const phases=[[0,0],[0,.25],[.25,.52],[.52,.76],[.76,.992]];
  const flipRows=sourceTexture.flipY!==false;
  for(let region=1;region<=4;region++) {
    let rank=0;
    const [begin,end]=phases[region],denominator=Math.max(1,counts[region]-1);
    for(let seed=0;seed<size;seed++) {
      if(regions[seed]!==region)continue;
      // Depth-first traversal follows 8-neighbour ink. A straight continuation
      // takes priority; pending branches resume from already-painted junctions.
      let top=0;stack[top]=seed;directions[top]=0;top++;regions[seed]|=128;
      while(top>0) {
        top--;const index=stack[top],heading=directions[top];
        const y=(index/pixelWidth)|0,x=index-y*pixelWidth;
        const destination=flipRows?(pixelHeight-1-y)*pixelWidth+x:index;
        arrivalPixels[destination]=Math.min(253,Math.round((begin+(end-begin)*rank/denominator)*255));
        rank++;
        for(let k=0;k<8;k++) {
          const direction=(heading+pushOrder[k]+8)&7;
          const nx=x+dx[direction],ny=y+dy[direction];
          if(nx<0||nx>=pixelWidth||ny<0||ny>=pixelHeight)continue;
          const next=ny*pixelWidth+nx;
          if(regions[next]!==region)continue;
          regions[next]|=128;stack[top]=next;directions[top]=direction;top++;
        }
      }
    }
  }

  const arrival=new THREE.DataTexture(arrivalPixels,pixelWidth,pixelHeight,THREE.RedFormat,THREE.UnsignedByteType);
  arrival.name='Connected ink arrival times';
  arrival.minFilter=THREE.NearestFilter;arrival.magFilter=THREE.NearestFilter;
  arrival.generateMipmaps=false;arrival.flipY=false;arrival.unpackAlignment=1;
  arrival.colorSpace=THREE.NoColorSpace;arrival.needsUpdate=true;
  const material=new THREE.ShaderMaterial({
    name:'Original drawing with connected-stroke reveal',
    uniforms:{sourceMap:{value:sourceTexture},arrivalMap:{value:arrival},drawProgress:{value:0},opacity:{value:1}},
    transparent:true,depthWrite:false,side:THREE.DoubleSide,
    forceSinglePass:true,toneMapped:false,
    vertexShader:`
      varying vec2 vUv;
      void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
    `,
    fragmentShader:`
      uniform sampler2D sourceMap,arrivalMap;
      uniform float drawProgress,opacity;
      varying vec2 vUv;
      void main(){
        vec4 original=texture2D(sourceMap,vUv);
        float birth=texture2D(arrivalMap,vUv).r;
        float ink=smoothstep(birth,birth+0.006,drawProgress);
        ink=mix(ink,1.0,step(0.9999,drawProgress));
        gl_FragColor=vec4(mix(vec3(1.0),original.rgb,ink),original.a*opacity);
        #include <colorspace_fragment>
      }
    `,
  });
  const geometry=new THREE.PlaneGeometry(width,height);
  const uv=geometry.getAttribute('uv');
  const uvBottom=flipRows?1-sourceBounds.top-sourceBounds.height:sourceBounds.top;
  for(let i=0;i<uv.count;i++)uv.setXY(i,
    sourceBounds.left+uv.getX(i)*sourceBounds.width,
    uvBottom+uv.getY(i)*sourceBounds.height);
  uv.needsUpdate=true;
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='Progressively drawn original paper';mesh.renderOrder=10;
  mesh.userData.drawing={arrivalBuildMs:performance.now()-started,pixelCounts:Array.from(counts).slice(1),sourceSize:[pixelWidth,pixelHeight]};
  function update(drawProgress,rotationProgress,opacity=1) {
    const draw=THREE.MathUtils.clamp(drawProgress,0,1);
    const fade=1-THREE.MathUtils.smoothstep(rotationProgress,.035,.18);
    const alpha=THREE.MathUtils.clamp(opacity,0,1)*fade;
    material.uniforms.drawProgress.value=draw;
    material.uniforms.opacity.value=alpha;
    mesh.visible=alpha>.001;
  }
  function dispose() {geometry.dispose();material.dispose();arrival.dispose();}
  return {mesh,sourceBounds,update,dispose};
}
