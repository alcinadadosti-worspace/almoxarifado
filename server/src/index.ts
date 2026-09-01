import { createApp } from './app';
import { credentialIssues, env } from './config/env';
import { datastore } from './data';
import { notificationStatus } from './services/notifications';
import { storage } from './services/storage';

/**
 * Em produção, cair no driver local significa gravar em disco efêmero: a
 * hospedagem apaga tudo no próximo deploy. Melhor não subir do que aceitar
 * cadastros que vão desaparecer sem aviso.
 */
if (env.isProduction && datastore.driver === 'local' && env.dataDriverPreference !== 'local') {
  console.error('');
  console.error('  ✖  Sem credencial do Firebase — o servidor NÃO vai subir.');
  console.error('');
  console.error('     Em produção os dados precisam ir para o Firestore. Com o driver');
  console.error('     local, tudo o que for cadastrado some no próximo deploy.');
  console.error('');
  for (const issue of credentialIssues) console.error(`     · ${issue}`);
  console.error('');
  console.error('     Como resolver: defina FIREBASE_SERVICE_ACCOUNT com o JSON da conta');
  console.error('     de serviço em base64 (linha única). No PowerShell:');
  console.error('');
  console.error('       [Convert]::ToBase64String(');
  console.error('         [IO.File]::ReadAllBytes("server\\service-account.json")) | Set-Clipboard');
  console.error('');
  console.error('     Para rodar mesmo assim, sem persistência: DATA_DRIVER=local');
  console.error('');
  process.exit(1);
}

const app = createApp();

app.listen(env.port, () => {
  const notifications = notificationStatus();
  const line = (label: string, value: string) => `  ${label.padEnd(18, '.')} ${value}`;

  console.info('');
  console.info('  ACQUA Almoxarifado — Grupo Alcina Maria');
  console.info('  ──────────────────────────────────────');
  console.info(line('API', `http://localhost:${env.port}`));
  console.info(line('Frontend', env.appBaseUrl));
  console.info(line('Banco', datastore.driver === 'firestore' ? 'Firestore' : 'local (.data)'));
  const arquivos = {
    firebase: 'Firebase Storage',
    firestore: 'Firestore (colecao files)',
    local: 'local (.data/files)',
  }[storage.driver];
  console.info(line('Arquivos', arquivos));
  console.info(line('Slack', notifications.available ? 'ativo' : 'não configurado (link manual)'));
  if (env.allowDevAuth && !env.isProduction) {
    console.info(line('Login dev', `${env.devAdmin.email} / ${env.devAdmin.password}`));
  }
  // O link que o colaborador recebe é montado com APP_BASE_URL. Se ela não
  // apontar para o domínio real, o termo chega com um endereço que não existe.
  if (env.isProduction && /localhost|127\.0\.0\.1/.test(env.appBaseUrl)) {
    console.warn('');
    console.warn(`  ⚠  APP_BASE_URL está em ${env.appBaseUrl} com NODE_ENV=production.`);
    console.warn('     Os links de assinatura sairão apontando para esse endereço.');
  }
  if (datastore.driver === 'local') {
    console.info('');
    console.info('  ⚠  Sem credenciais do Firebase: rodando com o driver LOCAL de');
    console.info('     desenvolvimento. Configure server/.env antes de produção.');
  }
  console.info('');
});

const shutdown = (signal: string) => {
  console.info(`\n[server] ${signal} recebido — encerrando.`);
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
