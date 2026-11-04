// Separate assertion lists at display time. Imported statements,
// exports and progress keep their original text; the caller still escapes HTML.
function romanValue(value){
  if(!/^(?=[IVXLCDM]+$)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(value))return 0;
  const digits={I:1,V:5,X:10,L:50,C:100,D:500,M:1000};
  return [...value].reduce((total,digit,index)=>total+(digits[digit]<digits[value[index+1]]?-digits[digit]:digits[digit]),0);
}
function romanAssertions(text){
  const markers=[],candidates=[...text.matchAll(/(?<![\p{L}\p{N}_])(?:\(([IVXLCDM]+)\)|([IVXLCDM]+)[^\S\r\n]*[.)\-–—:])(?=\s*\S)/gu)];
  for(const [index,match] of candidates.entries()){
    const value=romanValue(match[1]||match[2]);
    const body=text.slice(match.index+match[0].length,candidates[index+1]?.index??text.length).trim();
    if(!/[\p{L}\p{N}]/u.test(body)||/^(?:e|ou)[\s,;]*$/iu.test(body))continue;
    // References such as "inciso II." are prose, even inside an assertion.
    if(!value||/(?:incisos?|capítulos?|títulos?|anexos?|seç(?:ão|ões)|artigos?)\s+$/iu.test(text.slice(0,match.index)))continue;
    markers.push({index:match.index,value});
  }
  // A sequence distinguishes assertion labels from isolated Roman references.
  return markers.filter((marker,i)=>markers[i-1]?.value===marker.value-1||markers[i+1]?.value===marker.value+1);
}
export function formatQuestionStatement(value){
  const text=String(value??''),parts=[];
  const starts=new Set([...text.matchAll(/\([^\S\r\n]*\)/g)].map(marker=>marker.index));
  for(const marker of romanAssertions(text))starts.add(marker.index);
  let end=0;
  for(const start of [...starts].sort((a,b)=>a-b)){
    const prefix=text.slice(end,start).trimEnd();
    parts.push(prefix);
    if(end||prefix)parts.push('\n\n');
    end=start;
  }
  parts.push(text.slice(end));
  return parts.join('');
}
