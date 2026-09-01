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
  /** Recarrega o perfil; `null` quando a sessão não é mais válida. */
  refreshProfile: () => Promise<AdminProfile | null>;
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

  const loadProfile = useCallback(async (): Promise<AdminProfile | null> => {
    try {
      const profile = await api.get<AdminProfile>('/api/auth/me');
      setAdmin(profile);
      return profile;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setAdmin(null);
        devToken.current = null;
        localStorage.removeItem(DEV_TOKEN_KEY);
        // 403 é "conta sem acesso ao painel": quem chamou precisa mostrar isso.
        // Engolir o erro devolvia o usuário à tela de login sem explicação.
        if (error.status === 403) throw error;
        return null;
      }
      throw error;
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
        try {
          await loadProfile();
        } catch (error) {
          setAdmin(null);
          // Autenticado no Firebase mas barrado pelo painel: encerra a sessão,
          // senão cada renovação de token repete o 403 num ciclo silencioso.
          if (error instanceof ApiError && error.status === 403) {
            const { signOut: firebaseSignOut } = await import('firebase/auth');
            await firebaseSignOut(getFirebaseAuth()).catch(() => undefined);
          }
        }
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
        const { signInWithEmailAndPassword, signOut: firebaseSignOut } = await import('firebase/auth');
        await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
        try {
          const profile = await loadProfile();
          if (!profile) throw new Error('Não foi possível carregar seu perfil. Tente novamente.');
        } catch (error) {
          await firebaseSignOut(getFirebaseAuth()).catch(() => undefined);
          throw error;
        }
        return;
      }
      const result = await api.post<{ token: string }>(
        '/api/auth/dev-login',
        { email, password },
        { auth: false },
      );
      devToken.current = result.token;
      localStorage.setItem(DEV_TOKEN_KEY, result.token);
      const profile = await loadProfile();
      if (!profile) throw new Error('Não foi possível carregar seu perfil. Tente novamente.');
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
