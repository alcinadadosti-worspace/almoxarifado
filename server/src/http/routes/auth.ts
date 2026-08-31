import { Router } from 'express';
import { env } from '../../config/env';
import { collections } from '../../data';
import { adminProfileSchema, devLoginSchema } from '../../domain/schemas';
import { decodeDataUrl, storage, storagePaths } from '../../services/storage';
import { createDevToken, currentAdmin, requireAdmin } from '../auth';
import { HttpError, asyncRoute } from '../errors';

export const authRouter = Router();

/**
 * Login de desenvolvimento (sem Firebase Auth). Existe para que a aplicação
 * seja demonstrável na primeira execução; some quando `ALLOW_DEV_AUTH=false`
 * ou em produção.
 */
authRouter.post(
  '/dev-login',
  asyncRoute(async (req, res) => {
    if (!env.allowDevAuth || env.isProduction) {
      throw HttpError.forbidden('Login de desenvolvimento desabilitado. Use o Firebase Auth.');
    }
    const { email, password } = devLoginSchema.parse(req.body);
    if (
      email.toLowerCase() !== env.devAdmin.email ||
      password !== env.devAdmin.password
    ) {
      throw HttpError.unauthorized('E-mail ou senha inválidos.');
    }

    const uid = 'dev-admin';
    const token = createDevToken({ uid, email: env.devAdmin.email, name: env.devAdmin.name });
    const profile = await collections.admins.get(uid);
    if (!profile) {
      await collections.admins.set({
        id: uid,
        uid,
        email: env.devAdmin.email,
        displayName: env.devAdmin.name,
        updatedAt: new Date().toISOString(),
      });
    }

    res.json({
      token,
      admin: { uid, email: env.devAdmin.email, name: env.devAdmin.name, dev: true },
    });
  }),
);

authRouter.get(
  '/me',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const admin = currentAdmin(req);
    const profile = await collections.admins.get(admin.uid);
    const savedSignatureUrl = profile?.savedSignaturePath
      ? await storage.signedUrl(profile.savedSignaturePath)
      : null;

    res.json({
      uid: admin.uid,
      email: admin.email,
      name: profile?.displayName ?? admin.name,
      dev: admin.dev,
      hasSavedSignature: Boolean(profile?.savedSignaturePath),
      savedSignatureUrl,
    });
  }),
);

/** Nome exibido no termo + assinatura salva/reutilizável do representante. */
authRouter.put(
  '/me',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const admin = currentAdmin(req);
    const input = adminProfileSchema.parse(req.body);
    const existing = await collections.admins.get(admin.uid);

    let savedSignaturePath = existing?.savedSignaturePath;
    if (input.clearSignature) {
      savedSignaturePath = undefined;
    } else if (input.signature) {
      const { buffer, contentType } = decodeDataUrl(input.signature);
      savedSignaturePath = storagePaths.savedAdminSignature(admin.uid);
      await storage.save(savedSignaturePath, buffer, contentType);
    }

    await collections.admins.set({
      id: admin.uid,
      uid: admin.uid,
      email: admin.email,
      displayName: input.displayName,
      savedSignaturePath,
      updatedAt: new Date().toISOString(),
    });

    res.json({
      uid: admin.uid,
      email: admin.email,
      name: input.displayName,
      dev: admin.dev,
      hasSavedSignature: Boolean(savedSignaturePath),
      savedSignatureUrl: savedSignaturePath ? await storage.signedUrl(savedSignaturePath) : null,
    });
  }),
);
