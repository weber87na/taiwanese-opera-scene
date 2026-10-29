import * as THREE from './vendor/three.module.js';

export const MARMOT_ATLAS_URL='./assets/marmot-ink-atlas-v4.png';
// Four quadruped poses, a rise at the gate, then a two-foot standing pose.
export function sampleMarmotFrame(seconds){
  const time=Math.max(0,Number.isFinite(seconds)?seconds:0);
  return time<2.78?Math.floor(time*12)%4:time<3.04?4:5;
}

export function createMarmotAppearance(uniforms){
  const placeholder=new THREE.DataTexture(new Uint8Array([0,0,0,0]),1,1);
  placeholder.needsUpdate=true;
  const atlasUniform={value:placeholder};
  uniforms.atlas=atlasUniform;uniforms.atlasFrame={value:0};
  // Align each painted pose to its lowest opaque foot without stretching it.
  // The texture retains one shared pixel/world scale throughout the run.
  uniforms.groundPivot={value:new Float32Array([135,128,130,145,84,80].map(v=>v/512))};
  const geometry=new THREE.PlaneGeometry(1,1);
  const material=new THREE.ShaderMaterial({name:'Marmot ochre and wet-ink atlas',uniforms,
    transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
    vertexShader:`
      uniform vec3 anchor;uniform float facing,hop,scale,atlasFrame,groundPivot[6];
      varying vec2 vUv;
      void main(){
        vUv=uv;
        vec3 right=normalize(vec3(viewMatrix[0][0],0.0,viewMatrix[2][0]));
        float height=uv.y-groundPivot[int(atlasFrame)];
        vec3 p=anchor+right*position.x*scale*facing+vec3(0.0,height*scale+hop,0.0);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
      }`,
    fragmentShader:`
      uniform sampler2D atlas;uniform float atlasFrame,opacity;
      varying vec2 vUv;
      void main(){
        vec2 cell=vec2(mod(atlasFrame,3.0),1.0-floor(atlasFrame/3.0));
        vec2 atlasUv=(clamp(vUv,vec2(.001),vec2(.999))+cell)/vec2(3.0,2.0);
        vec4 fur=texture2D(atlas,atlasUv);
        if(fur.a<=.06275)discard;
        gl_FragColor=vec4(fur.rgb,smoothstep(.06275,.80,fur.a)*opacity);
        #include <colorspace_fragment>
      }`,
  });
  let pending=null,disposed=false;
  function load(loader=new THREE.TextureLoader()){
    if(pending)return pending;
    pending=loader.loadAsync(MARMOT_ATLAS_URL).then(texture=>{
      if(disposed){texture.dispose();return;}
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
      texture.generateMipmaps=true;texture.needsUpdate=true;
      atlasUniform.value.dispose();atlasUniform.value=texture;
    }).catch(error=>{pending=null;throw error;});
    return pending;
  }
  function dispose(){if(disposed)return;disposed=true;geometry.dispose();material.dispose();atlasUniform.value.dispose();}
  return {geometry,material,load,dispose};
}
