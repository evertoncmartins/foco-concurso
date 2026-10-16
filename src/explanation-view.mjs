import {icon} from './icons.mjs';
import {questionSourceDetails} from './question-origin.mjs';
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

const paragraphs=value=>String(value??'').split(/\r?\n\s*\r?\n/).filter(s=>s.trim()).map(s=>`<p>${escape(s.trim())}</p>`).join('');
function safeReference(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}}
export function questionFeedbackView(q,answer){
  const correct=answer===q.correctOption,outcome=correct?'Resposta correta. Bom trabalho!':answer?'Resposta incorreta. Vamos revisar.':'Questão não respondida.';
  const complete=q.optionExplanations&&q.options.every(o=>typeof q.optionExplanations[o.id]==='string'&&q.optionExplanations[o.id].trim());
  const url=safeReference(q.reference?.url),legal=q.fundamentoLegal;
  return `<section class="feedback ${answer&&!correct?'wrong':''}" aria-label="Feedback da questão">
    <header class="feedback-result"><span class="feedback-kicker">Resultado</span><div class="feedback-title" role="status">${icon(correct?'check':answer?'x':'clock',19)}${outcome}</div><p class="answer-line">${answer?`Sua resposta: <strong>${escape(answer)}</strong>. `:''}Alternativa correta: <strong>${escape(q.correctOption)}</strong>.</p></header>
    <section class="feedback-section"><h3>Explicação</h3>${explanationView(q.explanation,q.options)}</section>
    ${complete?`<section class="feedback-section"><h3>Análise das alternativas</h3><p class="feedback-analysis-note">A classificação considera a alternativa que atende ao enunciado.</p><ol class="feedback-options" aria-label="Justificativa de cada alternativa">${q.options.map(o=>{
      const right=o.id===q.correctOption,selected=o.id===answer;
      return `<li class="feedback-option ${right?'is-correct':'is-incorrect'} ${selected?'is-selected':''}"><div class="feedback-option-heading"><strong>Alternativa ${escape(o.id)}</strong><span class="feedback-option-verdict">${icon(right?'check':'x',13)}${right?'Correta':'Incorreta'}</span>${selected?'<span class="feedback-selected">Sua resposta</span>':''}</div><p class="feedback-option-text">${escape(o.text)}</p>${paragraphs(q.optionExplanations[o.id])}</li>`;
    }).join('')}</ol></section>`:''}
    ${legal||q.reference?`<section class="feedback-section feedback-legal"><h3>${legal?'Fundamentação legal':'Referência'}</h3>${legal?paragraphs(legal):''}${q.reference?`<p class="feedback-reference-label">${escape(q.reference.label)}</p>${url?`<a class="feedback-law-link" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${legal?'Consultar legislação':'Consultar fonte'} ${icon('arrow',13)}</a>`:''}`:''}</section>`:''}
    ${questionSourceDetails(q,{includeLegal:false})}
  </section>`;
}
