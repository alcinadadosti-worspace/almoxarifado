import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { MonogramMark } from '@/components/brand/MonogramMark';
import { Wordmark } from '@/components/brand/Wordmark';
import {
  IconActivity,
  IconLayers,
  IconLogout,
  IconMenu,
  IconPlus,
  IconSettings,
  IconSignature,
  IconStock,
  IconUsers,
  IconX,
} from '@/components/icons';
import { ButtonLink } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { useAuth } from '@/lib/auth';

const NAV = [
  { to: '/app', label: 'Estoque', icon: IconStock, end: true },
  { to: '/app/materiais', label: 'Materiais', icon: IconLayers },
  { to: '/app/entregas', label: 'Entregas', icon: IconSignature },
  { to: '/app/colaboradores', label: 'Colaboradores', icon: IconUsers },
  { to: '/app/movimentacoes', label: 'Movimentações', icon: IconActivity },
  { to: '/app/configuracoes', label: 'Configurações', icon: IconSettings },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              // Com o cursor nativo no painel, o hover precisa se sustentar sozinho:
              // fundo perceptível, texto claro e o ícone ganhando o dourado.
              'group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[0.84rem] font-medium transition-colors duration-200',
              isActive
                ? 'bg-white/[0.07] text-bone-50'
                : 'text-bone-100/50 hover:bg-white/[0.05] hover:text-bone-50',
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={cn(
                  'absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-gold-gradient transition-all duration-500 ease-premium',
                  isActive ? 'opacity-100' : 'opacity-0',
                )}
              />
              <item.icon
                className={cn(
                  'transition-colors duration-300',
                  isActive ? 'text-gold-300' : 'text-bone-100/35 group-hover:text-gold-300/70',
                )}
              />
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function AdminFooter() {
  const { admin, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="mt-auto pt-6">
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-gold-400/30 bg-gold-400/[0.08]">
            <MonogramMark className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.78rem] font-semibold text-bone-50">
              {admin?.name ?? 'Representante'}
            </p>
            <p className="truncate text-[0.68rem] text-bone-100/35">{admin?.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            await signOut();
            navigate('/login', { replace: true });
          }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.07] py-2 text-[0.72rem] font-semibold uppercase tracking-wider text-bone-100/45 transition-colors hover:border-white/20 hover:text-bone-100"
        >
          <IconLogout width={14} height={14} />
          Sair
        </button>
      </div>
    </div>
  );
}

export default function AdminShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  return (
    <div className="relative min-h-dvh bg-ink-950 text-bone-100">
      {/* brilho ambiente dourado no topo */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[420px] bg-[radial-gradient(70%_100%_at_50%_0%,rgba(201,160,80,.10)_0%,transparent_70%)]"
      />

      {/* ------------------------------------------------- sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[266px] flex-col border-r border-white/[0.06] bg-ink-950/85 px-5 py-6 backdrop-blur-xl lg:flex">
        <Wordmark />
        <div className="my-7 h-px w-full bg-white/[0.06]" />
        <NavItems />
        <div className="mt-6">
          <ButtonLink to="/app/entregas/nova" full size="sm" icon={<IconPlus width={15} height={15} />}>
            Nova entrega
          </ButtonLink>
        </div>
        <AdminFooter />
      </aside>

      {/* --------------------------------------------------- topo (mobile) */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-white/[0.06] bg-ink-950/90 px-5 py-3.5 backdrop-blur-xl lg:hidden">
        <Wordmark />
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menu"
          className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-bone-100/70"
        >
          <IconMenu />
        </button>
      </header>

      <AnimatePresence>
        {drawerOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="absolute inset-0 bg-ink-950/80 backdrop-blur-md"
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="absolute inset-y-0 right-0 flex w-[85%] max-w-xs flex-col border-l border-white/[0.07] bg-ink-900 px-5 py-6"
            >
              <div className="flex items-center justify-between">
                <Wordmark />
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Fechar menu"
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-bone-100/60"
                >
                  <IconX width={15} height={15} />
                </button>
              </div>
              <div className="my-6 h-px w-full bg-white/[0.06]" />
              <NavItems onNavigate={() => setDrawerOpen(false)} />
              <div className="mt-6">
                <ButtonLink to="/app/entregas/nova" full size="sm" icon={<IconPlus width={15} height={15} />}>
                  Nova entrega
                </ButtonLink>
              </div>
              <AdminFooter />
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>

      {/* ---------------------------------------------------------- conteúdo */}
      <div className="relative z-10 lg:pl-[266px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 sm:py-10"
          >
            <Outlet />
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  );
}
