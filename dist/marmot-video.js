export const MARMOT_VIDEO_ID='iL46oozvBCc';
export const MARMOT_VIDEO_URL=`https://www.youtube.com/shorts/${MARMOT_VIDEO_ID}`;
export const MARMOT_VIDEO_SRC='./assets/marmot.mp4';

export function createMarmotVideo(container,onClose){
  const overlay=document.createElement('section');overlay.id='marmot-video';overlay.hidden=true;
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','土撥鼠影片');
  overlay.setAttribute('tabindex','-1');
  overlay.innerHTML=`<div class="marmot-video-stage"><div class="marmot-player-slot"></div></div>
    <div class="marmot-video-message" role="status" hidden><p></p><button type="button">播放影片</button>
    <a href="${MARMOT_VIDEO_URL}" target="_blank" rel="noopener noreferrer">在 YouTube 播放</a></div>`;
  container.append(overlay);
  const slot=overlay.querySelector('.marmot-player-slot'),message=overlay.querySelector('.marmot-video-message');
  const playButton=message.querySelector('button');
  let video=null,failure=null,loadTimer=0,playTimer=0,generation=0,playAttempt=0,visible=false;
  function notice(text,retry=false){
    message.querySelector('p').textContent=text;playButton.hidden=false;
    playButton.textContent=retry?'重試載入':'播放影片';message.hidden=false;
  }
  function clearTimers(){clearTimeout(loadTimer);clearTimeout(playTimer);loadTimer=playTimer=0;}
  function failed(){
    clearTimers();playAttempt++;
    failure='本機影片載入失敗，請重試或開啟來源影片。';
    if(visible)notice(failure,true);
  }
  function releaseVideo(){
    generation++;playAttempt++;clearTimers();
    const previous=video;video=null;
    if(previous){
      previous.pause();
      try{previous.currentTime=0;}catch{}
      previous.removeAttribute('src');previous.load();
    }
    slot.replaceChildren();
  }
  function play(){
    if(!visible||!video||failure)return;
    const current=video,ownGeneration=generation,attempt=++playAttempt;
    message.hidden=true;current.muted=false;current.volume=1;
    clearTimeout(playTimer);
    playTimer=setTimeout(()=>{
      if(ownGeneration===generation&&attempt===playAttempt&&visible&&!failure)notice('影片尚未開始，請點一下播放。');
    },8000);
    const rejected=()=>{
      if(ownGeneration!==generation||attempt!==playAttempt||!visible||failure)return;
      clearTimeout(playTimer);playTimer=0;notice('點一下開始播放。');
    };
    try{
      const playing=current.play();
      Promise.resolve(playing).then(()=>{
        // A queued play request may settle after Esc or after the next Q cue.
        if(ownGeneration!==generation||!visible){current.pause();return;}
        if(attempt!==playAttempt||failure)return;
        clearTimeout(playTimer);playTimer=0;message.hidden=true;
      },rejected);
    }catch{rejected();}
  }
  function prepare(){
    if(video)return;
    failure=null;
    const ownGeneration=++generation,current=document.createElement('video');video=current;
    current.title='土撥鼠的美妙叫聲';current.preload='auto';current.playsInline=true;current.controls=true;
    current.muted=false;current.volume=1;
    Object.assign(current.style,{display:'block',width:'100%',height:'100%',objectFit:'contain',background:'#000'});
    const currentEvent=()=>ownGeneration===generation&&video===current;
    current.addEventListener('loadeddata',()=>{if(currentEvent()){clearTimeout(loadTimer);loadTimer=0;}});
    current.addEventListener('playing',()=>{
      if(!currentEvent()||!visible||failure){current.pause();return;}
      clearTimers();message.hidden=true;overlay.dataset.playerState='playing';
    });
    current.addEventListener('ended',()=>{if(currentEvent()&&visible)close();});
    current.addEventListener('error',()=>{if(currentEvent())failed();});
    loadTimer=setTimeout(()=>{if(currentEvent()&&current.readyState<2)failed();},15000);
    current.src=MARMOT_VIDEO_SRC;slot.replaceChildren(current);current.load();
  }
  function show(){
    visible=true;overlay.hidden=false;message.hidden=true;overlay.focus({preventScroll:true});
    if(!video)prepare();
    // A missing local asset can fail while the marmot is still running.
    if(failure)notice(failure,true);else play();
  }
  function close(){
    const wasVisible=visible;visible=false;releaseVideo();failure=null;
    overlay.hidden=true;message.hidden=true;overlay.dataset.playerState='idle';
    if(wasVisible)onClose?.();
  }
  playButton.addEventListener('click',()=>{
    if(!visible)return;
    if(failure){releaseVideo();failure=null;prepare();}
    play();
  });
  return {prepare,show,close,get visible(){return visible;},dispose(){close();overlay.remove();}};
}
