import * as THREE from './vendor/three.module.js';
import {createEnvironment} from './environment.js';
import {createFortress} from './fortress.js';
import {createDrawingReveal} from './reveal.js';
import {createInkCredits,releaseInkGlyphCache} from './ink-credits.js';
import {loadIntroSettings} from './intro-settings.js';
import {createIntroTimeline} from './intro-timeline.js';
import {createStoryIntro} from './story-intro.js';
import {createInkTransition} from './ink-transition.js';
import {loadDayCycleSettings,sampleDayCycle} from './day-cycle.js';
import {loadSeasonSettings,sampleSeasonCycle} from './season-cycle.js';
import {CAMERA_SHOTS,createCameraDirector} from './camera-director.js';
import {createInkMarmot} from './ink-marmot.js';
import {createMarmotVideo} from './marmot-video.js';

const $=id=>document.getElementById(id);
const stage=$('stage'),canvas=$('scene-canvas'),app=$('app');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const smooth=(a,b,v)=>THREE.MathUtils.smoothstep(v,a,b),clamp=THREE.MathUtils.clamp;
const TAU=Math.PI*2,MAX_DRAWING_PIXELS=2100000;
const MIN_ZOOM=.65,MAX_ZOOM=2.6;
let introTiming,introDuration=17000,creditDuration=0,storyDuration=0;
let credits,story,inkTransition,creditProgress=0,creditTime=-1,storyTime=-1;
const cues=Object.fromEntries(CAMERA_SHOTS.map(shot=>[shot.id,shot]));
const cameraDirector=createCameraDirector();
let marmotCue=null;
let cue='outside',ready=false,playing=false,progress=0,motion=!reduced;
let timeline=0,drawingProgress=0;
let pendingAutoplay=true;
let resumeIntroOnShow=false;
let reveal,frame=0,lastFrame=0,elapsed=0,playStart=0,playFrom=0;
let orbit=0,orbitTarget=0,dragging=false,dragX=0,dragTimeline=0,dragOrbit=0;
const orbitKeys=new Set();
let zoom=1,zoomTarget=1;
let dayCycleSettings,seasonSettings,dayElapsed=0;
const dayState={},seasonState={};
let switchStart=0,switchPending=null,switchChanged=false,mood=0,introGeneration=0;
let renderScale=1,effectivePixelRatio=1,performanceFrames=0,performanceMs=0,fastWindows=0,smoothedFrameMs=0;
let statsAt=0,uiAt=0,renderedFrames=0,bufferWidth=0,bufferHeight=0,bufferRatio=0;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
renderer.shadowMap.enabled=false;renderer.autoClear=false;
renderer.info.autoReset=false;
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2('#aebdc0',.0065);
const camera=new THREE.PerspectiveCamera(47,16/9,.5,800),openingCamera=camera.clone(),endingCamera=camera.clone();
const target=new THREE.Vector3(),world=new THREE.Group();world.name='Live three-dimensional theatrical scenery';scene.add(world);
const environment=createEnvironment({depthOnly:true}),fortress=createFortress();world.add(environment.group,fortress.group);
const inkScene=new THREE.Scene(), paperColor=new THREE.Color('#ffffff');
const marmot=createInkMarmot(environment.groundHeight);inkScene.add(marmot.group);
const marmotVideo=createMarmotVideo(app,finishMarmotCue);
// Invisible depth only: the rear wall/roof strokes must not show through the
// front brushwork. No scaffold colour, lighting or solid surfaces are displayed.
const inkDepthScene=new THREE.Scene();
const depthMaterial=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
const depthFortress=fortress.group.clone(true);
depthFortress.traverse(o=>{if(o.isMesh){o.visible=!o.userData.noInk&&!o.material?.isShaderMaterial;o.material=depthMaterial;}});
inkDepthScene.add(depthFortress);
const depthGround=environment.group.getObjectByName('Continuous mountain terrain').clone();depthGround.material=depthMaterial;inkDepthScene.add(depthGround);

function setTimeline(value){
  timeline=clamp(value,0,1);
  const milliseconds=timeline*introDuration;
  const sample=introTiming.sample(milliseconds);
  creditTime=sample.creditTime;storyTime=sample.storyTime;
  creditProgress=creditDuration?clamp(creditTime/creditDuration,0,1):1;
  drawingProgress=sample.drawingProgress;progress=sample.rotationProgress;
}
function creditsActive(){return creditDuration>0&&creditTime>0&&creditTime<creditDuration;}
function storyActive(){return storyDuration>0&&storyTime>0&&storyTime<storyDuration;}
function introPhase(){return drawingProgress<1?'drawing':progress<1?'rotation':timeline<1?'presentation':'scene';}
function setCameraForCue(id,destination=endingCamera){destination.position.fromArray(cues[id].position);destination.lookAt(new THREE.Vector3().fromArray(cues[id].target));destination.updateMatrixWorld(true);}
function setOpeningCamera(){const pivot=new THREE.Vector3().fromArray(cues[cue].target),offset=endingCamera.position.clone().sub(pivot);offset.applyAxisAngle(new THREE.Vector3(0,1,0),THREE.MathUtils.degToRad(62));openingCamera.position.copy(pivot).add(offset);openingCamera.lookAt(pivot);openingCamera.updateMatrixWorld(true);}
function setCamera(p,dt=0){
  if(p>=1){
    const pose=cameraDirector.update(dt,motion,orbit,environment.groundHeight);
    camera.position.fromArray(pose.position);target.fromArray(pose.target);
    camera.lookAt(target);camera.updateMatrixWorld(true);return;
  }
  target.fromArray(cues[cue].target);
  const offset=endingCamera.position.clone().sub(target);
  offset.applyAxisAngle(new THREE.Vector3(0,1,0),p<1?THREE.MathUtils.degToRad(62)*(1-smooth(.04,.89,p)):orbit%TAU);
  camera.position.copy(target).add(offset);
  // All-angle orbit clears the surrounding terrain instead of going underground.
  camera.position.y+=smooth(.83,1,p)*Math.max(0,environment.groundHeight(camera.position.x,camera.position.z)+8-camera.position.y);
  camera.lookAt(target);camera.updateMatrixWorld(true);
}
async function prepareIntro(reset=true){
  const generation=++introGeneration;ready=false;playing=false;lastFrame=0;$('intro').disabled=true;
  stopKeyboardOrbit();
  if(reset){finishMarmotCue();cue='outside';cameraDirector.select(1,{immediate:true});cameraDirector.select(0);orbit=orbitTarget=0;$('orbit').value='0';zoom=zoomTarget=1;camera.zoom=1;camera.updateProjectionMatrix();dayElapsed=0;}
  setCameraForCue(cue);setOpeningCamera();
  if(reveal){
    // Replaying or changing viewpoint only repositions the paper-space source.
    // The world-space brush geometry remains uploaded and is reused throughout.
    reveal.setOpeningCamera(openingCamera);
  }else{
    const next=await createDrawingReveal(world,openingCamera,endingCamera,environment.groundHeight);
    if(generation!==introGeneration){next.dispose();return;}
    reveal=next;inkScene.add(reveal.group);
  }
  canvas.dataset.inkSegments=String(reveal.count);
  reveal.setResolution?.(canvas.width,canvas.height);
  if(reset)setTimeline(0);ready=true;$('intro').disabled=false;$('progress').disabled=false;updateUI();requestFrame();
}
function updateUI(){
  const label=storyActive()?'故事題名與簡介':creditsActive()?'旋轉成景・水墨題字':drawingProgress<1?'塗鴉逐筆繪製':progress<.12?'紙上塗鴉':progress<.52?'線條走進空間':progress<.91?'筆畫組成穆柯寨':cues[cue].label;
  if($('phase').textContent!==label)$('phase').textContent=label;
  $('cue-note').textContent=cues[cue].note;$('progress').value=String(Math.round(timeline*1000));$('progress').setAttribute('aria-valuetext',`${Math.round(timeline*100)}%，${label}`);
  $('intro').textContent=playing?'暫停成景':timeline>=1?'重播塗鴉成景':'播放塗鴉成景';
  $('motion').textContent=motion?'暫停風景':'繼續風景';$('motion').setAttribute('aria-pressed',String(!motion));
  for(const id of Object.keys(cues)){$(`cue-${id}`)?.setAttribute('aria-pressed',String(id===cue));$(`cue-${id}`)?.classList.toggle('is-active',id===cue);}
  Object.assign(canvas.dataset,{progress:progress.toFixed(3),creditProgress:creditProgress.toFixed(3),creditsVisible:String(creditsActive()),creditTime:Math.round(creditTime).toString(),storyVisible:String(storyActive()),storyTime:Math.round(storyTime).toString(),drawingProgress:drawingProgress.toFixed(3),introPhase:introPhase(),timeline:timeline.toFixed(3),cue,playing:String(playing),orbitDegrees:THREE.MathUtils.radToDeg(orbit).toFixed(1)});
}
function resize(){
  const rect=stage.getBoundingClientRect();
  const width=Math.max(1,Math.round(rect.width)),height=Math.max(1,Math.round(rect.height));
  // The adaptive scale stays within 0.7–1.0 of a pixel-budgeted base resolution.
  // On very large displays the pixel budget can require a base ratio below 0.7.
  const baseRatio=Math.min(devicePixelRatio||1,1.25,Math.sqrt(MAX_DRAWING_PIXELS/(width*height)));
  effectivePixelRatio=baseRatio*renderScale;
  if(width!==bufferWidth||height!==bufferHeight||effectivePixelRatio!==bufferRatio){
    renderer.setDrawingBufferSize(width,height,effectivePixelRatio);bufferWidth=width;bufferHeight=height;bufferRatio=effectivePixelRatio;
  }
  reveal?.setResolution?.(canvas.width,canvas.height);
  Object.assign(canvas.dataset,{renderScale:renderScale.toFixed(2),pixelRatio:effectivePixelRatio.toFixed(3),drawingPixels:String(canvas.width*canvas.height)});
  // Keep the composed 16:9 projection; the canvas stretches to the full viewport without cropping.
  for(const c of [camera,openingCamera,endingCamera]){c.aspect=16/9;c.updateProjectionMatrix();}requestFrame();
}
function samplePerformance(frameMs){
  if(frameMs<=0)return;
  smoothedFrameMs=smoothedFrameMs?THREE.MathUtils.lerp(smoothedFrameMs,frameMs,.12):frameMs;
  if(!document.hasFocus()||document.hidden)return;
  performanceMs+=frameMs;performanceFrames++;
  if(performanceFrames<120)return;
  const fps=performanceFrames*1000/performanceMs;let nextScale=renderScale;
  if(fps<40){nextScale=Math.max(.7,Math.round((renderScale-.1)*10)/10);fastWindows=0;}
  else if(fps>57){if(++fastWindows>=3){nextScale=Math.min(1,Math.round((renderScale+.1)*10)/10);fastWindows=0;}}
  else fastWindows=0;
  performanceFrames=0;performanceMs=0;
  if(nextScale!==renderScale){renderScale=nextScale;resize();}
}
function requestFrame(){if(!frame&&ready&&!document.hidden)frame=requestAnimationFrame(render);}
function render(now){
  frame=0;if(!ready||document.hidden)return;
  const frameMs=lastFrame?now-lastFrame:0,dt=Math.min(.05,frameMs/1000);lastFrame=now;if(motion)elapsed+=dt;
  if(playing){setTimeline(playFrom+(now-playStart)/introDuration);if(timeline>=1)playing=false;if(now-uiAt>100||!playing){updateUI();uiAt=now;}}
  let curtain=1;
  if(switchPending){const t=(now-switchStart)/1100;curtain=t<.5?1-smooth(0,.5,t):smooth(.5,1,t);
    if(t>=.5&&!switchChanged){cue=switchPending;setTimeline(1);playing=false;orbit=orbitTarget=0;$('orbit').value='0';setCameraForCue(cue);switchChanged=true;curtain=0;updateUI();prepareIntro(false).then(()=>{switchStart=performance.now()-550;requestFrame();}).catch(showError);}
    if(t>=1){switchPending=null;curtain=1;}
  }
  mood=THREE.MathUtils.lerp(mood,cues[cue].mood,1-Math.exp(-dt*2));
  // Keyboard orbit follows the same continuous angle as a mouse drag. Ignore
  // OS key-repeat frequency: held keys advance at a fixed, gentle speed.
  if(progress>=.999&&!switchPending&&!dragging){
    const direction=Number(orbitKeys.has('ArrowRight'))-Number(orbitKeys.has('ArrowLeft'));
    orbitTarget+=THREE.MathUtils.degToRad(36)*direction*dt;
  }
  if(Math.abs(orbitTarget-orbit)>.00001){
    orbit=reduced?orbitTarget:THREE.MathUtils.lerp(orbit,orbitTarget,1-Math.exp(-dt*18));
    if(Math.abs(orbitTarget-orbit)<.00005)orbit=orbitTarget;
  }
  // Optical zoom leaves the safe orbit path intact and needs no geometry work.
  if(Math.abs(zoomTarget-zoom)>.0001){
    zoom=reduced?zoomTarget:THREE.MathUtils.lerp(zoom,zoomTarget,1-Math.exp(-dt*14));
    if(Math.abs(zoomTarget-zoom)<.001)zoom=zoomTarget;
    camera.zoom=zoom;camera.updateProjectionMatrix();
  }
  setCamera(progress,dt);
  if(marmotCue?.phase==='running'){
    if(motion)marmotCue.seconds+=dt;
    const run=marmot.update(marmotCue.seconds,camera,1);
    if(run.done){marmotCue.phase='video';motion=false;marmotVideo.show();updateUI();}
  }
  // Begin at the completed scenery. Pausing motion or hiding the page pauses
  // this clock as well; cue changes preserve it and an intro replay resets it.
  if(timeline>=1&&motion&&!switchPending)dayElapsed+=frameMs/1000;
  sampleDayCycle(dayElapsed,dayCycleSettings,dayState);
  sampleSeasonCycle(dayElapsed,seasonSettings,seasonState);
  reveal?.setDayCycle(dayState,smooth(.84,1,progress),camera,elapsed);
  reveal?.setSeason(seasonState,dayState,seasonSettings.enabled?smooth(.84,1,progress):0,dayElapsed);
  // The scaffold is never rendered. The finished scene remains entirely ink.
  renderer.info.reset();
  renderer.setClearColor(paperColor,1);renderer.clear();
  if(progress>=.83)renderer.render(inkDepthScene,camera);
  credits?.update(creditTime);
  story?.update(storyTime);
  inkTransition?.update(timeline>=1?-1:timeline*introDuration);
  canvas.dataset.inkFlowVisible=String(inkTransition?.mesh.visible===true);
  const presentationEnd=storyDuration?introTiming.storyStartMs+storyDuration:introTiming.creditStartMs+creditDuration;
  const milliseconds=timeline*introDuration;
  const reading=creditDuration||storyDuration?smooth(introTiming.creditStartMs-200,introTiming.creditStartMs+450,milliseconds)*(1-smooth(presentationEnd-600,presentationEnd+400,milliseconds)):0;
  // Keep the rotating sketch present, but quieter behind the ink typography.
  const sceneryOpacity=curtain*THREE.MathUtils.lerp(1,.38,reading);
  if(reveal){reveal.update(progress,elapsed,mood+seasonState.wind*.35,sceneryOpacity,drawingProgress);renderer.render(inkScene,camera);}
  samplePerformance(frameMs);
  renderedFrames++;
  const keepRendering=ready&&(playing||motion||switchPending||cameraDirector.moving||orbitKeys.size>0||Math.abs(orbitTarget-orbit)>.00001||Math.abs(mood-cues[cue].mood)>.002||Math.abs(zoomTarget-zoom)>.0001);
  if(now-statsAt>200||!keepRendering)Object.assign(canvas.dataset,{season:seasonState.label,seasonPhase:seasonState.phase.toFixed(4),seasonDuration:String(seasonSettings.durationSeconds),blossom:seasonState.blossom.toFixed(3),rainbow:seasonState.rainbow.toFixed(3),rain:seasonState.rain.toFixed(3),snow:seasonState.snow.toFixed(3),leaves:seasonState.leaves.toFixed(3)});
  if(now-statsAt>200||!keepRendering)Object.assign(canvas.dataset,{dayCyclePhase:dayState.phase.toFixed(4),dayCycleStage:dayState.label,dayCycleSeconds:dayElapsed.toFixed(2),sceneMotionSeconds:elapsed.toFixed(2),dayCycleDuration:String(dayCycleSettings.durationSeconds),dayCycleActive:String(dayCycleSettings.enabled&&timeline>=1&&motion&&!switchPending)});
  if(now-statsAt>200||!keepRendering){statsAt=now;Object.assign(canvas.dataset,{cameraMode:String(cameraDirector.mode),cameraPosition:camera.position.toArray().map(v=>v.toFixed(2)).join(','),marmotCue:marmotCue?.phase||'idle',marmotSeconds:(marmotCue?.seconds||0).toFixed(2),rendered:'true',focused:String(document.hasFocus()),pageVisible:String(!document.hidden),frameCount:String(renderedFrames),frameMs:smoothedFrameMs.toFixed(2),fps:smoothedFrameMs?(1000/smoothedFrameMs).toFixed(1):'0',drawCalls:String(renderer.info.render.calls),triangles:String(renderer.info.render.triangles),renderScale:renderScale.toFixed(2),orbitDegrees:THREE.MathUtils.radToDeg(orbit).toFixed(1),zoom:zoom.toFixed(3),zoomTarget:zoomTarget.toFixed(3)});}
  if(keepRendering)requestFrame();else lastFrame=0;
}
async function toggleIntro(){pendingAutoplay=false;if(!ready||switchPending)return;if(playing){playing=false;updateUI();return;}if(timeline>=1)await prepareIntro();playFrom=timeline;playStart=performance.now();playing=true;updateUI();requestFrame();}
function chooseCue(id){const index=CAMERA_SHOTS.findIndex(shot=>shot.id===id);if(index>=0)chooseCamera(index+1);}
function chooseCamera(number){
  if(!ready)return;finishMarmotCue();pendingAutoplay=false;playing=false;switchPending=null;stopKeyboardOrbit();
  cameraDirector.hold(orbit);orbit=orbitTarget=0;zoomTarget=1;
  if(number>0)cue=CAMERA_SHOTS[number-1].id;
  cameraDirector.select(number);if(timeline<1)setTimeline(1);
  $('orbit').value='0';updateUI();requestFrame();
}
function holdCamera(){cameraDirector.hold();}
function startMarmotCue(){
  if(!ready||marmotCue)return;
  marmotCue={phase:'running',seconds:0,previousCamera:cameraDirector.snapshot(),previousOrbit:orbit,previousZoom:zoom,previousZoomTarget:zoomTarget,previousMotion:motion,previousCue:cue};
  pendingAutoplay=false;playing=false;switchPending=null;dragging=false;stopKeyboardOrbit();setTimeline(1);
  cue='outside';cameraDirector.select(1,{immediate:true});orbit=orbitTarget=0;zoom=zoomTarget=1;camera.zoom=1;camera.updateProjectionMatrix();
  motion=true;marmot.start();marmotVideo.prepare();lastFrame=0;updateUI();requestFrame();
}
function finishMarmotCue(){
  if(!marmotCue)return;const previous=marmotCue;marmotCue=null;
  marmot.reset();marmotVideo.close();cue=previous.previousCue;motion=previous.previousMotion;
  cameraDirector.restore(previous.previousCamera);orbit=orbitTarget=previous.previousOrbit;
  zoom=previous.previousZoom;zoomTarget=previous.previousZoomTarget;camera.zoom=zoom;camera.updateProjectionMatrix();
  lastFrame=0;if(ready){updateUI();requestFrame();}
}
function scrub(value){pendingAutoplay=false;playing=false;setTimeline(value);switchPending=null;updateUI();requestFrame();}
function scheduleAutoplay(){setTimeout(()=>{if(pendingAutoplay&&ready&&!document.hidden){pendingAutoplay=false;playFrom=timeline;playStart=performance.now();playing=true;updateUI();requestFrame();}},700);}
function cleanView(){app.classList.toggle('performance');document.body.classList.toggle('performance',app.classList.contains('performance'));resize();}
function stopKeyboardOrbit(){orbitKeys.clear();orbitTarget=orbit;}
$('intro').addEventListener('click',toggleIntro);$('progress').addEventListener('input',()=>scrub(Number($('progress').value)/1000));
$('orbit').addEventListener('input',()=>{holdCamera();stopKeyboardOrbit();orbit=orbitTarget=Number($('orbit').value)/100*TAU;requestFrame();});
$('motion').addEventListener('click',()=>{motion=!motion;updateUI();requestFrame();});
$('reset-view').addEventListener('click',()=>chooseCamera(1));$('clean').addEventListener('click',cleanView);
for(const id of Object.keys(cues))$(`cue-${id}`)?.addEventListener('click',()=>chooseCue(id));
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else{await app.requestFullscreen();if(!app.classList.contains('performance'))cleanView();}}catch{$('error').textContent='無法啟用全螢幕，可改用瀏覽器的 F11 全螢幕。';$('error').hidden=false;}});
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement){app.classList.remove('performance');document.body.classList.remove('performance');}resize();});
document.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.target.matches('textarea,select,[contenteditable="true"],input:not([type="range"])'))return;
  const cueKey=/^(Digit|Numpad)[0-5]$/.test(e.code)?e.code.slice(-1):e.key;
  const zoomIn=e.key==='+'||e.key==='='||e.code==='NumpadAdd';
  const zoomOut=e.key==='-'||e.key==='_'||e.code==='NumpadSubtract';
  if(e.key==='Escape'&&marmotCue){e.preventDefault();finishMarmotCue();return;}
  if(zoomIn||zoomOut){e.preventDefault();if(ready&&!switchPending&&!marmotCue){holdCamera();zoomTarget=clamp(zoomTarget*(zoomIn?1.08:1/1.08),MIN_ZOOM,MAX_ZOOM);requestFrame();}}
  else if(['0','1','2','3','4','5'].includes(cueKey)){e.preventDefault();if(!e.repeat)chooseCamera(Number(cueKey));}
  else if(e.code==='KeyQ'||e.key.toLowerCase()==='q'){e.preventDefault();if(!e.repeat)startMarmotCue();}
  else if(e.code==='KeyF'||e.key.toLowerCase()==='f'){e.preventDefault();$('fullscreen').click();}
  else if(e.code==='KeyP'||e.key.toLowerCase()==='p'){motion=!motion;updateUI();requestFrame();}
  else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();if(ready&&progress>=.999&&!switchPending&&!marmotCue&&!dragging&&!e.repeat&&!orbitKeys.has(e.key)){holdCamera();orbitKeys.add(e.key);orbitTarget+=THREE.MathUtils.degToRad(e.key==='ArrowLeft'?-1:1);requestFrame();}}
  else if(e.code==='Space'&&!e.target.matches('button,a,input')){e.preventDefault();toggleIntro();}
  else if(e.key==='Escape'&&app.classList.contains('performance'))cleanView();});
document.addEventListener('keyup',e=>{if(orbitKeys.delete(e.key))requestFrame();});
stage.addEventListener('pointerdown',e=>{if(!ready||switchPending||marmotCue||e.button>0||!e.isPrimary)return;holdCamera();stopKeyboardOrbit();pendingAutoplay=false;dragging=true;dragX=e.clientX;dragTimeline=timeline;dragOrbit=orbit;playing=false;stage.setPointerCapture(e.pointerId);updateUI();});
stage.addEventListener('pointermove',e=>{if(!dragging||marmotCue)return;const delta=(e.clientX-dragX)/stage.getBoundingClientRect().width;
  if(dragTimeline<1)scrub(dragTimeline+delta*1.5);else{orbit=orbitTarget=dragOrbit+delta*TAU;requestFrame();}});
for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,()=>{dragging=false;});
stage.addEventListener('dblclick',toggleIntro);
stage.addEventListener('wheel',e=>{
  // Preserve browser Ctrl/Command-wheel zoom; regular wheels control the scene.
  if(e.ctrlKey||e.metaKey)return;
  e.preventDefault();if(!ready||switchPending||marmotCue)return;holdCamera();
  const unit=e.deltaMode===1?16:e.deltaMode===2?stage.clientHeight:1;
  const delta=clamp(e.deltaY*unit,-240,240);
  zoomTarget=clamp(zoomTarget*Math.exp(-delta*.0016),MIN_ZOOM,MAX_ZOOM);
  requestFrame();
},{passive:false});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){stopKeyboardOrbit();resumeIntroOnShow=playing;playing=false;if(frame)cancelAnimationFrame(frame);frame=0;updateUI();}
  else{lastFrame=0;if(resumeIntroOnShow){playFrom=timeline;playStart=performance.now();playing=true;resumeIntroOnShow=false;updateUI();}requestFrame();if(pendingAutoplay)scheduleAutoplay();}
});
function resetPerformanceWindow(){performanceFrames=0;performanceMs=0;fastWindows=0;lastFrame=0;}
window.addEventListener('focus',resetPerformanceWindow);window.addEventListener('blur',resetPerformanceWindow);document.addEventListener('visibilitychange',resetPerformanceWindow);
window.addEventListener('blur',stopKeyboardOrbit);
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;$('error').textContent='圖形連線已中斷，重新整理即可恢復舞台。';$('error').hidden=false;});
async function initialize(){try{
  const [settings,cycleSettings,seasons]=await Promise.all([loadIntroSettings(),loadDayCycleSettings(),loadSeasonSettings(),marmot.loadAppearance()]);
  dayCycleSettings=cycleSettings;seasonSettings=seasons;
  credits=await createInkCredits(settings);inkScene.add(credits.mesh);
  story=await createStoryIntro(settings.story,settings);inkScene.add(story.mesh);
  releaseInkGlyphCache();
  Object.assign(canvas.dataset,{textRenderer:credits.mesh.userData.inkCredits?.renderer||story.mesh.userData.inkCredits?.renderer||'none',calligrapher:credits.mesh.userData.inkCredits?.calligrapher||'',creditBrushBuildMs:String(Math.round(credits.mesh.userData.inkCredits?.buildMs||0)),storyBrushBuildMs:String(Math.round(story.mesh.userData.inkCredits?.buildMs||0)),brushStrokeCount:String((credits.mesh.userData.inkCredits?.strokeCount||0)+(story.mesh.userData.inkCredits?.strokeCount||0))});
  creditDuration=Math.round(credits.durationMs);storyDuration=Math.round(story.durationMs);
  introTiming=createIntroTimeline({drawingMs:Math.round(settings.drawingSeconds*1000),rotationMs:Math.round(settings.rotationSeconds*1000),creditsMs:creditDuration,storyMs:storyDuration,showAtRotation:settings.showAtRotation,storyGapMs:Math.round(settings.storyGapSeconds*1000)});
  introDuration=introTiming.durationMs;
  inkTransition=createInkTransition({startMs:introTiming.creditStartMs,storyStartMs:introTiming.storyStartMs,endMs:storyDuration?introTiming.storyStartMs+storyDuration:introTiming.creditStartMs+creditDuration,hasCredits:creditDuration>0,hasStory:storyDuration>0,intensity:settings.splashEnabled?settings.splashIntensity:0,accentColor:settings.splashAccentColor,accentAmount:settings.splashAccentAmount});
  inkScene.add(inkTransition.mesh);
  setCameraForCue(cue);setOpeningCamera();resize();await prepareIntro();
  app.classList.add('is-ready');new ResizeObserver(resize).observe(stage);resize();updateUI();requestFrame();if(pendingAutoplay)scheduleAutoplay();
}catch(error){showError(error);}}
function showError(error){console.error(error);$('loading').hidden=true;$('error').hidden=false;$('error').textContent='舞台載入失敗，請使用支援 WebGL 2 的瀏覽器重新整理。';}
initialize();
