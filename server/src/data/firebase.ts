import admin from 'firebase-admin';
import { env } from '../config/env';

let app: admin.app.App | null = null;

/** Inicializa (uma única vez) o Firebase Admin SDK. */
export function getFirebaseApp(): admin.app.App {
  if (app) return app;
  if (admin.apps.length && admin.apps[0]) {
    app = admin.apps[0]!;
    return app;
  }

  const options: admin.AppOptions = {};
  if (env.firebase.serviceAccount) {
    options.credential = admin.credential.cert(
      env.firebase.serviceAccount as admin.ServiceAccount,
    );
  } else if (!env.firebase.usingEmulator) {
    options.credential = admin.credential.applicationDefault();
  }
  if (env.firebase.projectId) options.projectId = env.firebase.projectId;
  if (env.firebase.storageBucket) options.storageBucket = env.firebase.storageBucket;

  app = admin.initializeApp(options);
  return app;
}

export function getDb(): admin.firestore.Firestore {
  const db = getFirebaseApp().firestore();
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // settings() só pode ser chamado antes do primeiro uso — ignore em hot-reload
  }
  return db;
}

export function getAuth(): admin.auth.Auth {
  return getFirebaseApp().auth();
}

export function getBucket(): ReturnType<admin.storage.Storage['bucket']> {
  const storage = getFirebaseApp().storage();
  return env.firebase.storageBucket ? storage.bucket(env.firebase.storageBucket) : storage.bucket();
}

export { admin };
