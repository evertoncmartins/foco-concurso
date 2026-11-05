// Separate assertion lists at display time. Imported statements,
// exports and progress keep their original text; the caller still escapes HTML.
// Reviewed transcription fixes also apply to saved question snapshots. They
// affect presentation only; question identities, selections and grades stay intact.
const copyCorrections=new Map([
  ['históricopolíticos','histórico-políticos'],['afrobrasileira','afro-brasileira'],
  ['didáticoescolar','didático-escolar'],['pósgraduação','pós-graduação'],
  ['sulamericano','sul-americano'],['vincularse','vincular-se'],
  ['efetuandose','efetuando-se'],['percebese','percebe-se'],
  ['etecnológica','e Tecnológica'],['eadultos','e Adultos'],['averificação','a verificação'],
  ['dimensções','dimensões'],['poderção','poderão'],['intituições','instituições'],
  ['tecnoloógica','tecnológica'],['cientificos','científicos'],['beneficios','benefícios'],
  ['juridica','jurídica'],['presidéncias','presidências'],['propedéuticos','propedêuticos'],['nivel','nível']
]);
const copyPattern=new RegExp(`(?<![\\p{L}])(?:${[...copyCorrections.keys()].join('|')})(?![\\p{L}])`,'giu');
export function formatQuestionText(value){
  return String(value??'').replace(copyPattern,word=>{
    let corrected=copyCorrections.get(word.toLocaleLowerCase('pt-BR'));
    if(word===word.toLocaleUpperCase('pt-BR'))return corrected.toLocaleUpperCase('pt-BR');
    if(word[0]===word[0].toLocaleUpperCase('pt-BR'))corrected=corrected[0].toLocaleUpperCase('pt-BR')+corrected.slice(1);
    return corrected;
  }).replace(/(?<!\p{L})Ile(?=\s+[IVXLCDM]+\b)/gu,'II e')
    .replace(/\|l(?=\s*[,;–—-])/g,'II')
    .replace(/(?<!\p{L})(pós|afro|didático|histórico|científico)-\s+(?=\p{L})/giu,'$1-')
    .replace(/(\p{L})-\s+(se|lhe|lhes|lo|la|los|las)(?!\p{L})/giu,'$1-$2')
    .replace(/sdo detentores/g,'são detentores').replace(/empresa publica/g,'empresa pública')
    .replace(/seus diretos e pautados/g,'seus direitos e pautados')
    .replace(/(finalidades:\s*)la consolidação/giu,'$1I. a consolidação')
    .replace(/([;.]\s+)(II|III|IV)\s+(?=a\s+preparação|o\s+aprimoramento|a\s+compreensão)/g,'$1$2. ')
    .replace(/nº\s+º(?=\s*\d)/g,'nº');
}
const closingPromptSource=String.raw`(?:Considerando\s+(?:essas?|estas?|as?|os?)\s+(?:afirmativas|assertivas|proposições|itens|critérios|enunciados)\b|Após\s+a\s+análise\b|Diante\s+d(?:as?|os?)\s+(?:afirmativas|assertivas|proposições|itens)\b|Com\s+base\s+n(?:as?|os?)\s+(?:afirmativas|assertivas|proposições|itens)\b|Sobre\s+as\s+(?:alternativas|afirmativas)\b|Assinale\b|Marque\b|Selecione\b|Escolha\b|Aponte\b|Quais\b|Qual\s+(?:das?|dos?|é|sequência)(?=\s|$)|(?:Est(?:á(?:\(ão\))?|ão)|É|São)\s+(?:in)?corret[oa](?:\(s\)|s)?(?=\s*(?:[,.:;]|apenas\b|somente\b|as?\b|os?\b|afirmar\b))|A\s+(?:sequência|ordem)\s+(?:correta|incorreta)\b|Usando\s+como\s+referência\b)`;
const closingPromptAtStart=new RegExp(`^${closingPromptSource}`,'iu');
function separateClosingPrompt(text){
  const markers=[...romanAssertions(text),...parenthesisAssertions(text)].sort((a,b)=>a.index-b.index);
  if(!markers.length)return text;
  const offset=markers.at(-1).end,tail=text.slice(offset);
  const pattern=new RegExp(`(?:[.!?;:]|\\n)\\s*(${closingPromptSource})`,'giu');
  for(const match of tail.matchAll(pattern)){
    const start=match.index+match[0].length-match[1].length;
    if(!/[\p{L}\p{N}]/u.test(tail.slice(0,start)))continue;
    return text.slice(0,offset+start).trimEnd()+'\n\n'+tail.slice(start);
  }
  return text;
}
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
function parenthesisAssertions(text){
  // Dots and slashes occur inside otherwise empty answer boxes in PDF imports.
  // Keep those characters; recognize a list from its prose and context instead
  // of treating every pair of parentheses as an assertion boundary.
  const candidates=[...text.matchAll(/\([^\S\n]*[./]?[^\S\n]*\)/g)],markers=[];
  for(const [index,match] of candidates.entries()){
    const end=match.index+match[0].length,before=text.slice(0,match.index);
    const numbered=before.match(/(?:^|[.!?;:\n])([^\S\n]*([IVXLCDM]+)[.)\-–—:,]?[^\S\n]*)$/u);
    const prefix=numbered&&romanValue(numbered[2])?numbered[1]:'';
    if(!prefix&&/[\p{L}\p{N}_]/u.test(text[match.index-1]||''))continue; // f(), g(), etc.
    const body=text.slice(end,candidates[index+1]?.index??text.length).trimStart();
    if(!/^[\p{L}\p{N}“"'<]/u.test(body)||!/[\p{L}]/u.test(body))continue;
    // A response box at the end of an item belongs to that item, not the next.
    if(/^(?:[IVXLCDM]+[.)\-–—:]|\d+[.)])\s/u.test(body)||closingPromptAtStart.test(body))continue;
    const start=prefix?match.index-prefix.trimStart().length:match.index;
    markers.push({index:start,end});
  }
  if(markers.length<2)return [];
  const before=text.slice(0,markers[0].index).trimEnd();
  const listContext=/(?:afirmativ|assertiv|sentenças?|proposições|julgue|verdadeir|fals|preencha|relacione|associe|itens\s+(?:abaixo|a seguir))/iu.test(before);
  const otherContext=/(?:express(?:ão|ões)|equaç(?:ão|ões)|fórmulas?|funç(?:ão|ões)|citaç(?:ão|ões)|referências?\s+(?:legais|bibliográficas)|símbolos?|operadores?)\b/iu.test(before);
  let quoted=false;
  for(const quote of before.match(/[“”"]/g)||[]){if(quote==='“')quoted=true;else if(quote==='”')quoted=false;else quoted=!quoted;}
  if(quoted||otherContext&&!listContext)return [];
  const boundary=!before||/[.!?:;]$/.test(before)||/(?:^|\n)[^\S\n]*$/.test(text.slice(0,markers[0].index));
  return listContext||boundary?markers:[];
}
function normalizeLineFlow(text){
  // Blank lines are paragraphs. A single PDF line ending is usually just a
  // fixed-width wrap; let the browser wrap that sentence to the available width.
  return text.split(/(\n[^\S\n]*\n(?:[^\S\n]*\n)*)/).map((part,index)=>{
    if(index%2)return '\n\n';
    return part.replace(/[^\S\n]*\n[^\S\n]*/g,(space,offset)=>{
      const next=part.slice(offset+space.length);
      if(/^(?:\d{1,3}[.)]|[a-hA-H][.)]|[•●–—-])[^\S\n]+/.test(next))return '\n';
      if(closingPromptAtStart.test(next))return '\n\n';
      if(part.slice(0,offset).trimEnd().endsWith(':')&&/^(?:\([IVXLCDM]+\)|[IVXLCDM]+[^\S\n]*[.)\-–—:])/.test(next))return '\n\n';
      return ' ';
    });
  }).join('').replace(/[^\S\n]+(?=\n|$)/g,'');
}
export function formatQuestionStatement(value){
  const text=formatQuestionText(value).replace(/\r\n?/g,'\n'),parts=[];
  const starts=new Map(romanAssertions(text).map(marker=>[marker.index,marker]));
  // A combined label such as "II. ()" stays together on the same line.
  for(const marker of parenthesisAssertions(text))starts.set(marker.index,marker);
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
  return separateClosingPrompt(normalizeLineFlow(parts.join('')));
}
