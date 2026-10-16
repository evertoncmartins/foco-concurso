for(const button of document.querySelectorAll('[data-copy-target]')){
  button.addEventListener('click',async()=>{
    const content=document.getElementById(button.dataset.copyTarget),status=document.getElementById('copy-status');
    if(!content)return;
    try{
      await navigator.clipboard.writeText(content.textContent);
      button.textContent='Copiado!';
      if(status)status.textContent=button.dataset.copyLabel==='Copiar JSON'?'Modelo JSON copiado.':'Sugestão de pedido copiada.';
      setTimeout(()=>{button.textContent=button.dataset.copyLabel;},2500);
    }catch{if(status)status.textContent='Selecione o texto e use a opção Copiar do seu dispositivo.';}
  });
}
