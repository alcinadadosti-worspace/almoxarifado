import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** Sem chaves configuradas a UI cai no login de desenvolvimento da API. */
export const firebaseEnabled = Boolean(config.apiKey && config.authDomain && config.projectId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (!firebaseEnabled) throw new Error('Firebase Auth não configurado.');
  if (!auth) {
    app = app ?? initializeApp(config as Required<typeof config>);
    auth = getAuth(app);
    auth.languageCode = 'pt-BR';
  }
  return auth;
}
