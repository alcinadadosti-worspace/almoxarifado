import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type Express, type Request } from 'express';
import { credentialIssues, env } from './config/env';
import { datastore, getSettings } from './data';
import { authRouter } from './http/routes/auth';
import { dashboardRouter } from './http/routes/dashboard';
import { deliveriesRouter } from './http/routes/deliveries';
import { employeesRouter } from './http/routes/employees';
import { filesRouter } from './http/routes/files';
import { materialsRouter } from './http/routes/materials';
import { movementsRouter } from './http/routes/movements';
import { publicRouter } from './http/routes/public';
import { settingsRouter } from './http/routes/settings';
import { errorHandler } from './http/errors';
import { notificationStatus } from './services/notifications';
import { storage } from './services/storage';
import { createSlackRouter } from './slack/bolt';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  // CORS vale só para a API. Arquivos estáticos ficam de fora de propósito:
  // o `<script type="module" crossorigin>` que o Vite gera manda o header
  // `Origin` até em requisições ao próprio site, e uma origem não reconhecida
  // aqui derrubaria o carregamento do frontend inteiro.
  app.use(
    '/api',
    cors((incoming, callback) => {
      // O tipo do pacote `cors` é mínimo; aqui é sempre uma request do Express.
      const req = incoming as Request;
      const origin = req.headers.origin;
      const sameOrigin = origin === `${req.protocol}://${req.get('host')}`;
      const allowed =
        !origin || !env.isProduction || sameOrigin || env.corsOrigins.includes(origin);

      // Origem desconhecida: apenas omitimos os cabeçalhos e deixamos o
      // navegador barrar. Responder com erro viraria um 500 enganoso.
      callback(null, { origin: allowed, credentials: false });
    }),
  );

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // O Bolt precisa do corpo cru para validar a assinatura do Slack: monta-se
  // antes do parser de JSON e é o único trecho fora dele.
  const slackRouter = createSlackRouter();
  if (slackRouter) app.use('/api/slack', slackRouter);

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/slack')) return next();
    return express.json({ limit: '8mb' })(req, res, next);
  });

  /* ------------------------------------------------------------ status */
  app.get('/api/health', async (_req, res) => {
    const settings = await getSettings().catch(() => null);
    res.json({
      ok: true,
      service: 'acqua-almoxarifado',
      time: new Date().toISOString(),
      dataDriver: datastore.driver,
      storageDriver: storage.driver,
      notifications: notificationStatus(settings ?? undefined),
      slackRoutes: Boolean(slackRouter),
      devAuth: env.allowDevAuth && !env.isProduction,
      firebaseConfigured: env.firebase.available,
      // vazio quando esta tudo certo; explica a queda para o driver local
      credentialIssues: env.firebase.available ? [] : credentialIssues,
      company: settings?.company.name ?? null,
    });
  });

  /* ------------------------------------------------------------- rotas */
  app.use('/api/auth', authRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/materials', materialsRouter);
  app.use('/api/employees', employeesRouter);
  app.use('/api/deliveries', deliveriesRouter);
  app.use('/api/movements', movementsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/files', filesRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada.', code: 'not_found' });
  });

  /* ------------------------------------- frontend em produção (1 domínio) */
  // Servir o build do Vite aqui garante que o link do colaborador use o mesmo
  // domínio da aplicação, como exige o fluxo de aceite.
  // Procuramos nos dois pontos de partida possíveis (raiz do repo ou server/),
  // porque hospedagens diferentes chamam `npm start` de lugares diferentes.
  const webDist = [
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(process.cwd(), 'web/dist'),
    path.resolve(__dirname, '../../web/dist'),
  ].find((candidate) => fs.existsSync(candidate));

  if (webDist) {
    app.use(
      express.static(webDist, {
        index: false,
        maxAge: '1h',
        setHeaders(res, filePath) {
          if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    app.get('*', (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
