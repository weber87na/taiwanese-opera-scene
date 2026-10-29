const defaults={
  enabled:true,letteringStyle:'calligraphy',inkColor:'#151413',fontScale:1.15,
  showAtRotation:.28,writingSeconds:4.4,holdSeconds:1.2,fadeSeconds:1,drawingSeconds:6,rotationSeconds:11,
  storyGapSeconds:.6,splashIntensity:1,splashAccentColor:'#a83224',splashAccentAmount:.22,
  credits:[{role:'製作人',name:'土撥鼠哥'},{role:'主演',name:'南方薪傳'}]
};
const storyDefaults={
  enabled:true,title:'陣前招親',removePunctuation:false,fontScale:1.45,
  synopsis:'楊家小將楊宗保為破天門陣，到穆柯寨意取降龍木，被寨主之女穆桂英所擒。後來，穆桂英主動提親，兩人因此結為夫婦，並共破天門陣。',
  writingSeconds:6,holdSeconds:10,fadeSeconds:1.3
};

// A malformed optional setting falls back independently, so one typo cannot
// prevent the stage from loading. Text is only painted, never parsed as HTML.
export function normalizeIntroSettings(value={}) {
  const input=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const number=(key,min,max)=>Number.isFinite(input[key])?Math.max(min,Math.min(max,input[key])):defaults[key];
  const text=(value,max)=>typeof value==='string'?Array.from(value.trim()).slice(0,max).join(''):'';
  const credits=Array.isArray(input.credits)?input.credits.slice(0,4).map(item=>({role:text(item?.role,6),name:text(item?.name,8)})).filter(item=>item.name):defaults.credits.map(item=>({...item}));
  const storyInput=input.story&&typeof input.story==='object'?input.story:{};
  const storyNumber=(key,min,max)=>Number.isFinite(storyInput[key])?Math.max(min,Math.min(max,storyInput[key])):storyDefaults[key];
  const story={
    enabled:storyInput.enabled!==false,
    removePunctuation:storyInput.removePunctuation===true,fontScale:storyNumber('fontScale',.8,1.8),
    title:typeof storyInput.title==='string'?text(storyInput.title,12):storyDefaults.title,
    synopsis:typeof storyInput.synopsis==='string'?text(storyInput.synopsis,240):storyDefaults.synopsis,
    columns:Array.isArray(storyInput.columns)?storyInput.columns.slice(0,10).map(column=>text(column,40)).filter(Boolean):undefined,
    writingSeconds:storyNumber('writingSeconds',1,30),holdSeconds:storyNumber('holdSeconds',0,60),fadeSeconds:storyNumber('fadeSeconds',.3,5)
  };
  story.enabled=story.enabled&&!!(story.title||story.synopsis);
  return {
    enabled:input.enabled!==false&&credits.length>0,
    letteringStyle:input.letteringStyle==='procedural'?'procedural':'calligraphy',
    inkColor:typeof input.inkColor==='string'&&/^#[0-9a-f]{6}$/i.test(input.inkColor)?input.inkColor:defaults.inkColor,
    fontScale:number('fontScale',.8,1.35),
    showAtRotation:number('showAtRotation',0,1),
    storyGapSeconds:number('storyGapSeconds',0,5),splashEnabled:input.splashEnabled!==false,splashIntensity:number('splashIntensity',0,1.5),story,
    splashAccentColor:typeof input.splashAccentColor==='string'&&/^#[0-9a-f]{6}$/i.test(input.splashAccentColor)?input.splashAccentColor:defaults.splashAccentColor,
    splashAccentAmount:number('splashAccentAmount',0,.5),
    writingSeconds:number('writingSeconds',1,20),holdSeconds:number('holdSeconds',0,20),fadeSeconds:number('fadeSeconds',.3,5),
    drawingSeconds:number('drawingSeconds',2,30),rotationSeconds:number('rotationSeconds',3,30),credits
  };
}

export async function loadIntroSettings() {
  try {
    const response=await fetch('./intro-config.json',{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return normalizeIntroSettings(await response.json());
  } catch(error) {
    console.warn('片頭設定讀取失敗，使用預設文字與時間。',error);
    return normalizeIntroSettings();
  }
}
