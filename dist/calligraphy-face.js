const family='StageCalligraphy';
let ready;
export async function loadCalligraphyFace(){
  ready??=(async()=>{
    const response=await fetch('./assets/fonts/coverage.json');
    if(!response.ok)throw new Error('書法字庫字元表載入失敗');
    const coverage=await response.json();
    const characters=new Set(Array.from(coverage.characters||''));
    const face=new FontFace(family,'url("./assets/fonts/KouzanGyousho.woff2")');
    await face.load();document.fonts.add(face);
    await document.fonts.load(`176px "${family}"`,'陣前招親製作人土撥鼠哥主演南方薪傳');
    return {family:`"${family}"`,characters};
  })();
  return ready;
}
