import {createInkCredits} from './ink-credits.js';

const DEFAULT_TITLE='陣前招親';
const DEFAULT_SYNOPSIS='楊家小將楊宗保為破天門陣，到穆柯寨意取降龍木，被寨主之女穆桂英所擒。後來，穆桂英主動提親，兩人因此結為夫婦，並共破天門陣。';
// Read top to bottom, then right to left. Keep names and meaningful phrases
// together instead of cutting this short narrative into equal character counts.
const DEFAULT_COLUMNS=[
  '楊家小將楊宗保','為破天門陣，','到穆柯寨','意取降龍木，','被寨主之女',
  '穆桂英所擒。','後來，穆桂英','主動提親，','兩人因此結為夫婦，','並共破天門陣。',
];
const END_PUNCTUATION=new Set(Array.from('，。、；：！？）》」』】〕〉,.!?;:)]}'));
const OPEN_PUNCTUATION=new Set(Array.from('（《「『【〔〈([{'));
const text=(value,fallback)=>typeof value==='string'?value:fallback;
const numeric=(value,fallback)=>Number.isFinite(value)?value:fallback;
const displayText=(value,removePunctuation)=>{
  const compact=value.replace(/\p{White_Space}/gu,'');
  return removePunctuation?compact.replace(/\p{P}/gu,''):compact;
};

// Balanced columns favour complete clauses, keep closing punctuation off the
// next column's head, and never remove a character to make the layout fit.
function splitSynopsis(characters,count){
  const length=characters.length;
  if(!length)return [];
  const wordBoundaries=new Set([0,length]);
  if(typeof Intl?.Segmenter==='function'){
    let offset=0;
    for(const {segment} of new Intl.Segmenter('zh-Hant',{granularity:'word'}).segment(characters.join(''))){
      offset+=Array.from(segment).length;wordBoundaries.add(offset);
    }
  }
  const target=length/count,maxPerColumn=40;
  const costs=Array.from({length:count+1},()=>new Float64Array(length+1).fill(Infinity));
  const previous=Array.from({length:count+1},()=>new Int16Array(length+1).fill(-1));
  costs[0][0]=0;
  for(let column=1;column<=count;column++){
    for(let end=column;end<=length-(count-column);end++){
      for(let start=Math.max(column-1,end-maxPerColumn);start<end;start++){
        if(!Number.isFinite(costs[column-1][start]))continue;
        const used=end-start;
        let cost=(used-target)**2;
        if(end<length){
          cost+=END_PUNCTUATION.has(characters[end-1])?0:8;
          if(wordBoundaries.size>2&&!wordBoundaries.has(end))cost+=40;
          if(END_PUNCTUATION.has(characters[end]))cost+=10000;
          if(OPEN_PUNCTUATION.has(characters[end-1]))cost+=10000;
        }
        if(used<target*.45)cost+=25;
        cost+=costs[column-1][start];
        if(cost<costs[column][end]){costs[column][end]=cost;previous[column][end]=start;}
      }
    }
  }
  const columns=[];let end=length;
  for(let column=count;column>0;column--){
    const start=previous[column][end];
    if(start<0)throw new Error('The complete synopsis cannot fit the story columns.');
    columns.unshift(characters.slice(start,end).join(''));end=start;
  }
  return columns;
}

function storyColumns(settings,synopsis,removePunctuation){
  let rejectedColumnsReason='';
  if(Array.isArray(settings.columns)){
    const requested=settings.columns;
    if(!requested.length||requested.length>10||requested.some(column=>typeof column!=='string')){
      rejectedColumnsReason='columns must contain 1–10 nonempty strings';
    }else{
      const columns=requested.map(column=>displayText(column,removePunctuation));
      if(columns.some(column=>!column||Array.from(column).length>40)){
        rejectedColumnsReason='each column must contain 1–40 displayed characters';
      }else if(columns.join('')!==synopsis){
        rejectedColumnsReason='columns must reproduce the complete synopsis in order';
      }else return {columns,layoutMode:'configured',rejectedColumnsReason};
    }
  }
  if(synopsis===displayText(DEFAULT_SYNOPSIS,removePunctuation)){
    return {columns:DEFAULT_COLUMNS.map(column=>displayText(column,removePunctuation)),layoutMode:'authored',rejectedColumnsReason};
  }
  const characters=Array.from(synopsis);
  const count=characters.length?Math.min(10,Math.ceil(characters.length/8)):0;
  return {columns:splitSynopsis(characters,count),layoutMode:'automatic',rejectedColumnsReason};
}

/** Preserve the editable source while laying out every visible story character. */
export async function createStoryIntro(config={},baseConfig={}){
  const settings=config&&typeof config==='object'?config:{};
  const rawTitle=text(settings.title,DEFAULT_TITLE),rawSynopsis=text(settings.synopsis,DEFAULT_SYNOPSIS);
  const removePunctuation=settings.removePunctuation===true;
  const fontScale=Math.max(.5,Math.min(2.5,numeric(settings.fontScale,1.45)));
  const title=displayText(rawTitle,removePunctuation),synopsis=displayText(rawSynopsis,removePunctuation);
  const titleCharacters=Array.from(title),synopsisCharacters=Array.from(synopsis);
  // Fail explicitly for direct callers outside the supported configuration;
  // never silently shorten a title or sentence inside this layout module.
  if(titleCharacters.length>12)throw new RangeError('Story titles support at most 12 characters; the supplied title was not truncated.');
  if(synopsisCharacters.length>240)throw new RangeError('Story synopses support at most 240 characters; the supplied synopsis was not truncated.');

  const blocks=[];
  const titleColumns=titleCharacters.length>6?2:titleCharacters.length?1:0;
  const titleRows=titleColumns?Math.ceil(titleCharacters.length/titleColumns):0;
  const titleSize=titleColumns?Math.min(titleColumns===1?.33:.253,1.48/(1.10*(titleRows-1)+1)):0;
  for(let index=0;index<titleColumns;index++){
    const column=titleCharacters.slice(index*titleRows,(index+1)*titleRows);
    const lineHeight=titleSize*1.10;
    blocks.push({text:column.join(''),x:titleColumns===1?1.25:1.45-index*.36,
      y:(column.length-1)*lineHeight/2+.015,size:titleSize,lineHeight,units:6});
  }

  const {columns,layoutMode,rejectedColumnsReason}=storyColumns(settings,synopsis,removePunctuation);
  const longestColumn=columns.reduce((longest,column)=>Math.max(longest,Array.from(column).length),0);
  const right=titleColumns ? .67 : 1.45,left=titleColumns ? -1.52 : -1.45;
  const columnWidth=columns.length>1?(right-left)/(columns.length-1):.6;
  const synopsisSize=longestColumn?Math.min(.122*fontScale,columnWidth*.78,1.64/(1.04*(longestColumn-1)+1)):0;
  columns.forEach((column,index)=>{
    const x=columns.length===1?(left+right)/2:right-index*(right-left)/(columns.length-1);
    blocks.push({text:column,x,y:.82-synopsisSize/2,size:synopsisSize,lineHeight:synopsisSize*1.04,units:1});
  });

  const animation=await createInkCredits({
    enabled:settings.enabled!==false&&blocks.length>0,
    inkColor:baseConfig?.inkColor,
    letteringStyle:baseConfig?.letteringStyle,
    writingSeconds:numeric(settings.writingSeconds,6),holdSeconds:numeric(settings.holdSeconds,10),
    fadeSeconds:numeric(settings.fadeSeconds,1.3),blocks,
  });
  animation.mesh.name='Vertical ink story title and complete synopsis';
  animation.mesh.userData.storyIntro={
    title,synopsis,rawTitle,rawSynopsis,displayTitle:title,displayText:synopsis,removePunctuation,fontScale,
    titleCharacters:titleCharacters.length,synopsisCharacters:synopsisCharacters.length,
    titleColumns,synopsisColumns:columns.length,titleSize,synopsisSize,columns,layoutMode,rejectedColumnsReason,
    completeTextPreserved:columns.join('')===synopsis,punctuationPlacement:'upper-right',
    recommendedSynopsisLimit:100,smallText:synopsisCharacters.length>100,
  };
  return animation;
}
