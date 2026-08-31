import { Router } from 'express';
import { SETTINGS_ID, collections, getSettings } from '../../data';
import { settingsSchema } from '../../domain/schemas';
import { notificationStatus } from '../../services/notifications';
import { requireAdmin } from '../auth';
import { asyncRoute } from '../errors';

export const settingsRouter = Router();
settingsRouter.use(requireAdmin);

settingsRouter.get(
  '/',
  asyncRoute(async (_req, res) => {
    res.json({ settings: await getSettings(), notifications: notificationStatus() });
  }),
);

settingsRouter.put(
  '/',
  asyncRoute(async (req, res) => {
    const input = settingsSchema.parse(req.body);
    const current = await getSettings();
    const settings = {
      ...current,
      ...input,
      id: SETTINGS_ID,
      slackAdminChannel: input.slackAdminChannel || undefined,
      updatedAt: new Date().toISOString(),
    };
    await collections.settings.set(settings);
    res.json({ settings });
  }),
);
