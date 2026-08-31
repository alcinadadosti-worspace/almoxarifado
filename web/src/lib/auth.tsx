import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AdminProfile } from '@/types/domain';
import { ApiError, api, setTokenProvider } from './api';
import { firebaseEnabled, getFirebaseAuth } from './firebase';

const DEV_TOKEN_KEY = 'acqua.almoxarifado.token';

interface AuthContextValue {
  admin: AdminProfile | null;
  loading: boolean;
  mode: 'firebase' | 'dev';
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const devToken = useRef<string | null>(
    typeof localStorage !== 'undefined' ? localStorage.getItem(DEV_TOKEN_KEY) : null,
  );

  const mode: 'firebase' | 'dev' = firebaseEnabled ? 'firebase' : 'dev';

  /* O cliente HTTP pergunta o token a cada requisição autenticada. */
  useEffect(() => {
    setTokenProvider(async () => {
      if (firebaseEnabled) {
        const user = getFirebaseAuth().currentUser;
        return user ? user.getIdToken() : null;
      }
      return devToken.current;
    });
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      setAdmin(await api.get<AdminProfile>('/api/auth/me'));
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setAdmin(null);
        devToken.current = null;
        localStorage.removeItem(DEV_TOKEN_KEY);
      } else {
        throw error;
      }
    }
  }, []);

  /* Sessão inicial */
  useEffect(() => {
    let active = true;

    if (firebaseEnabled) {
      const unsubscribe = getFirebaseAuth().onIdTokenChanged(async (user) => {
        if (!active) return;
        if (!user) {
          setAdmin(null);
          setLoading(false);
          return;
        }
        await loadProfile().catch(() => setAdmin(null));
        if (active) setLoading(false);
      });
      return () => {
        active = false;
        unsubscribe();
      };
    }

    (async () => {
      if (devToken.current) await loadProfile().catch(() => setAdmin(null));
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [loadProfile]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (firebaseEnabled) {
        const { signInWithEmailAndPassword } = await import('firebase/auth');
        await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
        await loadProfile();
        return;
      }
      const result = await api.post<{ token: string }>(
        '/api/auth/dev-login',
        { email, password },
        { auth: false },
      );
      devToken.current = result.token;
      localStorage.setItem(DEV_TOKEN_KEY, result.token);
      await loadProfile();
    },
    [loadProfile],
  );

  const signOut = useCallback(async () => {
    if (firebaseEnabled) {
      const { signOut: firebaseSignOut } = await import('firebase/auth');
      await firebaseSignOut(getFirebaseAuth());
    }
    devToken.current = null;
    localStorage.removeItem(DEV_TOKEN_KEY);
    setAdmin(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ admin, loading, mode, signIn, signOut, refreshProfile: loadProfile }),
    [admin, loading, mode, signIn, signOut, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return context;
}
