import { AnimatePresence, motion } from 'framer-motion';
import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { MonogramMark } from './components/brand/MonogramMark';
import { Cursor } from './components/ui/Cursor';
import { useAuth } from './lib/auth';
import { usePrefersReducedMotion } from './lib/device';

/* Cada rota é um chunk próprio: quem abre o link de assinatura pelo celular
   nunca baixa o painel administrativo. */
const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const Accept = lazy(() => import('./pages/Accept'));
const NotFound = lazy(() => import('./pages/NotFound'));
const AdminShell = lazy(() => import('./pages/admin/AdminShell'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Materials = lazy(() => import('./pages/admin/Materials'));
const MaterialEditor = lazy(() => import('./pages/admin/MaterialEditor'));
const Employees = lazy(() => import('./pages/admin/Employees'));
const Deliveries = lazy(() => import('./pages/admin/Deliveries'));
const DeliveryNew = lazy(() => import('./pages/admin/DeliveryNew'));
const DeliveryDetail = lazy(() => import('./pages/admin/DeliveryDetail'));
const Movements = lazy(() => import('./pages/admin/Movements'));
const SettingsPage = lazy(() => import('./pages/admin/Settings'));

/* ------------------------------------------------------------ carregando */

export function BrandLoader({ label = 'Carregando' }: { label?: string }) {
  return (
    <div className="grid min-h-[60dvh] w-full place-items-center">
      <div className="flex flex-col items-center gap-5">
        <div className="relative">
          <span
            aria-hidden
            className="absolute inset-0 animate-pulse-ring rounded-full border border-gold-400/40"
          />
          <MonogramMark className="h-11 w-11 animate-float" />
        </div>
        <p className="label-eyebrow">{label}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- rota protegida */

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { admin, loading } = useAuth();
  const location = useLocation();

  if (loading) return <BrandLoader label="Verificando acesso" />;
  if (!admin) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/* ---------------------------------------------------- transição de página */

function PageShell({ children }: { children: React.ReactNode }) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Cortina dourada que atravessa a tela a cada navegação. */
function RouteCurtain({ routeKey }: { routeKey: string }) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return null;

  return (
    <motion.div
      key={routeKey}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[150] origin-left bg-gold-gradient"
      initial={{ scaleX: 0, opacity: 0.9 }}
      animate={{ scaleX: [0, 1, 1], opacity: [0.9, 0.9, 0], transformOrigin: ['0% 50%', '0% 50%', '100% 50%'] }}
      transition={{ duration: 0.85, times: [0, 0.45, 1], ease: [0.16, 1, 0.3, 1] }}
    />
  );
}

/* --------------------------------------------------------------------- */

export function App() {
  const location = useLocation();

  /* A página pública do colaborador usa a superfície clara. */
  useEffect(() => {
    const light = location.pathname.startsWith('/aceite');
    document.body.dataset.surface = light ? 'light' : 'dark';
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', light ? '#F6F3EC' : '#0A0A0C');
  }, [location.pathname]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  return (
    <>
      <Cursor />
      <AnimatePresence mode="wait" initial={false}>
        <RouteCurtain key={`curtain-${location.pathname}`} routeKey={location.pathname} />
      </AnimatePresence>

      <Suspense fallback={<BrandLoader />}>
        <AnimatePresence mode="wait" initial={false}>
          <Routes location={location} key={location.pathname}>
            <Route
              path="/"
              element={
                <PageShell>
                  <Landing />
                </PageShell>
              }
            />
            <Route
              path="/login"
              element={
                <PageShell>
                  <Login />
                </PageShell>
              }
            />
            <Route
              path="/aceite/:token"
              element={
                <PageShell>
                  <Accept />
                </PageShell>
              }
            />

            <Route
              path="/app"
              element={
                <RequireAuth>
                  <AdminShell />
                </RequireAuth>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="materiais" element={<Materials />} />
              <Route path="materiais/novo" element={<MaterialEditor />} />
              <Route path="materiais/:id" element={<MaterialEditor />} />
              <Route path="colaboradores" element={<Employees />} />
              <Route path="entregas" element={<Deliveries />} />
              <Route path="entregas/nova" element={<DeliveryNew />} />
              <Route path="entregas/:id" element={<DeliveryDetail />} />
              <Route path="movimentacoes" element={<Movements />} />
              <Route path="configuracoes" element={<SettingsPage />} />
            </Route>

            <Route
              path="*"
              element={
                <PageShell>
                  <NotFound />
                </PageShell>
              }
            />
          </Routes>
        </AnimatePresence>
      </Suspense>
    </>
  );
}
