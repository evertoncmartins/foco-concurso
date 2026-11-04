// Separate assertion lists at display time. Imported statements,
// exports and progress keep their original text; the caller still escapes HTML.
function romanValue(value){
  if(!/^(?=[IVXLCDM]+$)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(value))return 0;
  const digits={I:1,V:5,X:10,L:50,C:100,D:500,M:1000};
  return [...value].reduce((total,digit,index)=>total+(digits[digit]<digits[value[index+1]]?-digits[digit]:digits[digit]),0);
}
function romanAssertions(text){
  const markers=[],candidates=[...text.matchAll(/(?<![\p{L}\p{N}_])(?:\(([IVXLCDM]+)\)|([IVXLCDM]+)[^\S\r\n]*[.,)\-–—:])(?=\s*\S)/gu)];
  for(const [index,match] of candidates.entries()){
    const value=romanValue(match[1]||match[2]);
    const body=text.slice(match.index+match[0].length,candidates[index+1]?.index??text.length).trim();
    if(!/[\p{L}\p{N}]/u.test(body)||/^(?:e|ou)[\s,;]*$/iu.test(body))continue;
    // References such as "inciso II." are prose, even inside an assertion.
    if(!value||/(?:incisos?|capítulos?|títulos?|anexos?|seç(?:ão|ões)|artigos?)\s+$/iu.test(text.slice(0,match.index)))continue;
    markers.push({index:match.index,end:match.index+match[0].length,value});
  }
  // A sequence distinguishes assertion labels from isolated Roman references.
  return markers.filter((marker,i)=>markers[i-1]?.value===marker.value-1||markers[i+1]?.value===marker.value+1);
}
function normalizeLineFlow(text){
  // Blank lines are paragraphs. A single PDF line ending is usually just a
  // fixed-width wrap; let the browser wrap that sentence to the available width.
  return text.split(/(\n[^\S\n]*\n(?:[^\S\n]*\n)*)/).map((part,index)=>{
    if(index%2)return '\n\n';
    return part.replace(/[^\S\n]*\n[^\S\n]*/g,(space,offset)=>{
      const next=part.slice(offset+space.length);
      if(/^(?:\d{1,3}[.)]|[a-hA-H][.)]|[•●–—-])[^\S\n]+/.test(next))return '\n';
      if(/^(?:Assinale\b|Marque\b|Selecione\b|Quais\b|Qual (?:das?|dos?|é)(?=\s|$)|Considerando (?:essas?|estas?|as?|os?)\b|Estão\b|Está correto\b|É correto\b|Após a análise\b|Diante das? (?:afirmativas|assertivas)\b)/u.test(next))return '\n\n';
      if(part.slice(0,offset).trimEnd().endsWith(':')&&/^(?:\([IVXLCDM]+\)|[IVXLCDM]+[^\S\n]*[.)\-–—:])/.test(next))return '\n\n';
      return ' ';
    });
  }).join('').replace(/[^\S\n]+(?=\n|$)/g,'');
}
export function formatQuestionStatement(value){
  const text=String(value??'').replace(/\r\n?/g,'\n'),parts=[];
  const starts=new Map([...text.matchAll(/\([^\S\n]*\)/g)].map(marker=>[marker.index,{index:marker.index,end:marker.index+marker[0].length}]));
  for(const marker of romanAssertions(text))starts.set(marker.index,marker);
  let end=0;
  for(const marker of [...starts.values()].sort((a,b)=>a.index-b.index)){
    const prefix=text.slice(end,marker.index).trimEnd();
    parts.push(prefix);
    if(end||prefix)parts.push('\n\n');
    parts.push(text.slice(marker.index,marker.end),' ');
    end=marker.end;
    // Always separate the label from its text, including compact OCR such as I.a.
    while(end<text.length&&/\s/.test(text[end]))end++;
  }
  parts.push(text.slice(end));
  return normalizeLineFlow(parts.join(''));
}
