const escape=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// The downloadable model is the only source of the guide's complete example.
export function jsonExample(html,model){
  const marker='<!-- FOCO_JSON_EXAMPLE -->';
  if(html.split(marker).length!==2)throw new Error('O guia deve conter um único marcador FOCO_JSON_EXAMPLE.');
  const code=JSON.stringify(model,null,2).replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(?:true|false|null|\d+)\b/g,(value,string,key)=>`<span class="${string?key?'json-key':'json-string':'json-number'}">${escape(value)}</span>`);
  return html.replace(marker,code);
}
