const stages={
  profile:[10,'Preparando seu perfil'],
  folder:[20,'Localizando sua pasta'],
  access:[30,'Conferindo o acesso ao Drive'],
  history:[35,'Restaurando seu histórico'],
  upload:[76,'Sincronizando o progresso'],
  banks:[80,'Recuperando seus bancos'],
  ready:[100,'Tudo pronto']
};
export function restoreProgress(previous,{stage,completed=0,total=0}){
  const [base,message]=stages[stage]||stages.profile;
  const done=Math.max(0,Number(completed)||0),count=Math.max(0,Number(total)||0);
  const fraction=count?Math.min(1,done/count):1;
  const value=stage==='history'?base+40*fraction:stage==='banks'?base+16*fraction:base;
  return {state:'loading',percent:Math.max(previous?.percent||0,Math.round(value)),message,
    detail:['history','banks'].includes(stage)&&count?`${Math.min(done,count)} de ${count} arquivos processados`:
      stage==='folder'?'Recuperando a pasta vinculada à sua conta Google.':
      stage==='ready'?'Seus estudos estão prontos para continuar.':'Aguarde enquanto preparamos seus estudos.'};
}
