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

// Percentages describe completed steps, never elapsed time or upload bytes.
export function resetSaveProgress(previous,{stage='local',completed=0,total=0}={}){
  const count=Math.max(0,Number(total)||0),done=Math.max(0,Number(completed)||0);
  const steps={
    local:[10,'Salvando o reinício neste dispositivo','Sua conta, preferências e bancos de questões serão mantidos.'],
    history:[20+45*(count?Math.min(1,done/count):1),'Conferindo o progresso no Drive',count?`${Math.min(done,count)} de ${count} arquivos conferidos`:'Conferência dos arquivos concluída.'],
    upload:[80,'Salvando e conferindo no Google Drive','Aguarde a confirmação do envio para continuar.'],
    ready:[100,'Reinício sincronizado','Tudo pronto para começar seus estudos do zero.']
  };
  const [percent,message,detail]=steps[stage]||steps.local;
  return {state:'loading',percent:Math.max(previous?.percent||0,Math.round(percent)),message,detail};
}
