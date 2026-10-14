// Separate empty-parenthesis assertions at display time. Imported statements,
// exports and progress keep their original text; the caller still escapes HTML.
export function formatQuestionStatement(value){
  const text=String(value??''),parts=[];
  let end=0;
  for(const marker of text.matchAll(/\([^\S\r\n]*\)/g)){
    const prefix=text.slice(end,marker.index).trimEnd();
    parts.push(prefix);
    if(end||prefix)parts.push('\n\n');
    parts.push(marker[0]);
    end=marker.index+marker[0].length;
  }
  parts.push(text.slice(end));
  return parts.join('');
}
