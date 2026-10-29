// Stroke centre-lines only. The brush builds its own silhouettes; no font,
// character outline, or text rasterizer is used by the title renderer.
const shards=new Map();
const directory=new URL('./assets/ink-strokes/',import.meta.url);
let defaults;
const dictionary=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const valid=record=>Array.isArray(record?.medians)&&record.medians.length>0&&
  record.medians.every(stroke=>Array.isArray(stroke)&&stroke.length>=2&&stroke.every(point=>
    Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)));

export async function loadInkStrokeData(characters){
  const unique=[...new Set(characters)];
  defaults??=fetch(new URL('defaults.json',directory)).then(response=>response.ok?response.json():{}).then(dictionary).catch(()=>({}));
  const common=await defaults;
  const keys=[...new Set(unique.filter(character=>!valid(common[character])).map(character=>
    `u${Math.floor(character.codePointAt(0)/256).toString(16).padStart(2,'0')}`))];
  await Promise.all(keys.map(key=>{
    if(!shards.has(key))shards.set(key,fetch(new URL(`${key}.json`,directory))
      .then(response=>{if(!response.ok)throw new Error(`筆畫資料 ${key}: HTTP ${response.status}`);return response.json();}).then(dictionary)
      .catch(error=>{console.warn(error.message);return {};}));
    return shards.get(key);
  }));
  const records=new Map(),missing=[];
  for(const character of unique){
    const key=`u${Math.floor(character.codePointAt(0)/256).toString(16).padStart(2,'0')}`;
    const record=valid(common[character])?common[character]:(await shards.get(key))?.[character];
    if(valid(record))records.set(character,record);else missing.push(character);
  }
  return {records,missing};
}
