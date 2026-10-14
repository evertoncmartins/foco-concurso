const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// A can also be a Portuguese article. Only a clear predicate identifies an
// unpunctuated A label; ambiguous prose stays untouched (e.g. "A acumulação").
const aPredicate=/^(?:(?:não|apenas|também|já|ainda|somente|só)\s+)*(?:é|são|era|foi|está|estão|estaria|seria|será|seriam|tem|teria|exige|exigem|inclui|exclui|confunde|contraria|antecipa|atribui|combina|corresponde|define|descreve|dispõe|erra|esquece|ignora|indica|inverte|inventa|limita|menciona|omite|permite|prevê|pressupõe|reproduz|resume|restringe|sintetiza|trata|troca|viola|afirma|apresenta|acerta|representa|considera|confirma|confere|nega|sugere|refere|se\s+refere)(?=$|[^\p{L}])/u;

function markers(text,options){
  const available=new Set(options.map(option=>option.id));
  const pattern=/(^|[.!?;]\s+|[\r\n][ \t]*)([Aa]lternativas?[ \t]+)?([A-H](?:[ \t]*(?:,[ \t]*|e[ \t]+|ou[ \t]+)[A-H])*)(?=$|[\s:),.\u2013\u2014-])/g;
  const found=[];
  for(const match of text.matchAll(pattern)){
    const letters=match[3].match(/[A-H]/g);
    if(!letters.every(letter=>available.has(letter)))continue;
    const end=match.index+match[0].length,tail=text.slice(end);
    const delimited=/^[ \t]*(?:[:)]|[.,](?=\s)|[\u2013\u2014-](?=\s))/.test(tail);
    const body=tail.trimStart();
    if(!match[2]&&!delimited&&letters.length===1){
      if(!/^\s/.test(tail)||!/^\p{L}/u.test(body))continue;
      if(letters[0]==='A'&&!aPredicate.test(body))continue;
    }
    found.push({start:match.index+match[1].length,end,prefix:match[2]||'',label:match[3]});
  }
  return found;
}

// Display-only formatting: the imported explanation, exports and progress are
// never rewritten. Escape every source fragment; do not accept HTML from JSON.
export function explanationView(value,options=[]){
  const text=String(value??''),labels=markers(text,options),paragraphs=[];
  const paragraph=html=>`<p class="explanation-paragraph">${html}</p>`;
  const plain=content=>{
    for(const part of content.split(/\r?\n[ \t]*\r?\n/))if(part.trim())paragraphs.push(paragraph(escape(part.trim())));
  };
  if(!labels.length)plain(text);
  else{
    plain(text.slice(0,labels[0].start));
    labels.forEach((label,index)=>{
      const heading=escape(label.prefix)+escape(label.label).replace(/[A-H]/g,letter=>`<strong class="explanation-letter">${letter}</strong>`);
      const content=text.slice(label.end,labels[index+1]?.start??text.length);
      const parts=content.split(/\r?\n[ \t]*\r?\n/);
      paragraphs.push(paragraph(heading+escape(parts[0].trimEnd())));
      for(const part of parts.slice(1))plain(part);
    });
  }
  return `<div class="feedback-explanation">${paragraphs.join('')}</div>`;
}
