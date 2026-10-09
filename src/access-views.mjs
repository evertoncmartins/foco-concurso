import {icon} from './icons.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const googleMark='<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.5-.1-2.9-.4-4.3H24v8.2h11c-.5 2.7-2 5-4.2 6.5v5.4h6.8c4-3.7 6-9.1 6-15.8z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.8-5.3c-1.8 1.2-4 1.9-6.7 1.9-5.2 0-9.5-3.5-11.1-8.1H6v5.5A20 20 0 0 0 24 44z"/><path fill="#FBBC05" d="M12.9 27.6a12 12 0 0 1 0-7.2v-5.5H6a20 20 0 0 0 0 18.2z"/><path fill="#EA4335" d="M24 12.3c3 0 5.6 1 7.7 3l5.8-5.8A20 20 0 0 0 6 14.9l6.9 5.5c1.6-4.6 5.9-8.1 11.1-8.1z"/></svg>';
export function loginView({ready,busy,error,theme}){
  return `<main class="entry-page" id="main">
    <div class="entry-toolbar"><button class="icon-btn" data-action="toggle-theme" aria-label="${theme==='dark'?'Ativar tema claro':'Ativar tema escuro'}">${icon(theme==='dark'?'sun':'moon',20)}</button></div>
    <div class="entry-layout"><section class="entry-card" aria-labelledby="entry-title">
      <div class="entry-identity"><span class="brand-mark" aria-hidden="true">f.</span><h1 id="entry-title">foco</h1></div>
      <p class="entry-description">Entre para continuar seus estudos.</p>
      <button class="google-button" data-action="login" aria-busy="${!!busy}" ${!ready||busy?'disabled':''}>${googleMark}<span>${busy?'Entrando…':'Continuar com Google'}</span></button>
      ${error?`<p class="entry-error" role="alert">${esc(error)}</p>`:''}
      ${!ready?'<p class="entry-error" role="status">O responsável pela plataforma precisa concluir a configuração do acesso Google.</p>':''}
      ${!ready?`<details class="admin-setup"><summary>Configuração do responsável</summary><form id="oauth-preview-form"><div class="field"><label for="oauth-preview">ID público OAuth Google</label><input id="oauth-preview" name="clientId" placeholder="…apps.googleusercontent.com" required><small>Configuração local para validar a integração. Para todos os usuários, configure o mesmo ID na publicação.</small></div><button class="btn small" type="submit">Configurar neste navegador</button><p class="setting-note"><a href="./docs/LOGIN_GOOGLE.md" target="_blank" rel="noopener">Guia de ativação</a></p></form></details>`:''}
    </section></div>
  </main>`;
}
export function folderView(profile,config,connected){
  return `<div class="folder-onboarding"><div class="onboarding-symbol">${icon('cloud',28)}</div><span class="eyebrow">SEU PROGRESSO, ONDE VOCÊ ESTIVER</span><h1>Onde seus estudos<br>vão ficar?</h1><p>Olá, ${esc(profile.name.split(' ')[0])}. Escolha uma pasta do seu Google Drive para guardar suas questões e seu progresso.</p><form id="folder-form" class="card"><div class="field"><label for="folder-link">Link da sua pasta do Google Drive</label><input id="folder-link" name="folderId" value="${esc(config.folderId)}" placeholder="https://drive.google.com/drive/folders/…" required><small>A conta ${esc(profile.email)} precisa ter permissão para adicionar arquivos à pasta.</small></div><div id="folder-error" class="form-error" role="alert"></div><button class="btn primary" type="submit">${icon('cloud',16)} Conectar minha pasta ${icon('arrow',16)}</button><p class="setting-note">Os bancos JSON existentes serão importados. O histórico será salvo em arquivos identificados pela sua conta. Sua escolha de pasta ficará salva na conta Google para os próximos dispositivos.</p></form><button class="btn ghost" data-action="skip-folder">Agora não, estudar neste dispositivo</button></div>`;
}
