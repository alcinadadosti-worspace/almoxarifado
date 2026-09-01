import { motion } from 'framer-motion';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Wordmark } from '@/components/brand/Wordmark';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { MonogramStage } from '@/three/MonogramStage';

export default function Login() {
  const { admin, loading, signIn, mode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /* Em modo de desenvolvimento já sugerimos as credenciais do .env. */
  // Só na montagem. Se dependesse de `email`, o campo voltaria a se preencher
  // sozinho toda vez que o usuário o apagasse.
  useEffect(() => {
    if (mode === 'dev') setEmail((current) => current || 'logisticavdpenedo@cpalcina.com');
  }, [mode]);

  if (!loading && admin) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from.startsWith('/app') ? from : '/app'} replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from.startsWith('/app') ? from : '/app', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) setError(caught.message);
      else if (caught instanceof Error && /auth\/(too-many-requests)/.test(caught.message))
        setError('Muitas tentativas. Aguarde alguns minutos e tente de novo.');
      else if (caught instanceof Error && caught.message.includes('auth/'))
        setError('E-mail ou senha inválidos.');
      else if (caught instanceof Error && caught.message) setError(caught.message);
      else setError('Não foi possível entrar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* ------------------------------------------------------ formulário */}
      <div className="relative z-10 flex flex-col justify-between bg-ink-950 px-5 py-8 sm:px-10 lg:px-16">
        <Wordmark />

        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto w-full max-w-sm py-16"
        >
          <p className="label-eyebrow">Painel do almoxarifado</p>
          <h1 className="mt-4 font-display text-4xl font-light leading-tight text-bone-50">
            Bem-vindo(a) de volta.
          </h1>
          <p className="mt-3 text-[0.86rem] leading-relaxed text-bone-100/45">
            Acesso restrito à equipe de almoxarifado e RH do Grupo Alcina Maria.
          </p>

          <form onSubmit={handleSubmit} className="mt-10 space-y-4">
            <Input
              label="E-mail"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="logisticavdpenedo@cpalcina.com"
            />
            <Input
              label="Senha"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />

            {error ? (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-[0.8rem] text-red-200"
              >
                {error}
              </motion.p>
            ) : null}

            <Button type="submit" full size="lg" loading={submitting} className="mt-2">
              Entrar
            </Button>
          </form>

          {mode === 'dev' ? (
            <div className="mt-8 rounded-xl border border-gold-400/25 bg-gold-400/[0.06] px-4 py-3">
              <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-gold-300">
                Modo desenvolvimento
              </p>
              <p className="mt-1.5 text-[0.78rem] leading-relaxed text-bone-100/55">
                O Firebase Auth ainda não está configurado. Use as credenciais de
                <code className="mx-1 rounded bg-ink-800 px-1.5 py-0.5 text-[0.72rem] text-gold-200">
                  server/.env
                </code>
                (padrão: senha <strong className="text-gold-200">almoxarifado</strong>).
              </p>
            </div>
          ) : null}

          <Link
            to="/"
            className="mt-8 inline-flex items-center gap-2 text-[0.76rem] uppercase tracking-widest text-bone-100/35 transition-colors hover:text-gold-200"
          >
            <span aria-hidden>←</span> Voltar ao início
          </Link>
        </motion.div>

        <p className="text-[0.66rem] uppercase tracking-widest text-bone-100/25">
          CNPJ 14.750.618/0001-83
        </p>
      </div>

      {/* ------------------------------------------------------------ cena */}
      <div className="relative hidden overflow-hidden bg-ink-vignette lg:block">
        <MonogramStage className="absolute inset-0 h-full w-full" quality="hero" particles={260} />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_0%_50%,rgba(8,8,10,.95)_0%,transparent_60%)]"
        />
        <div className="absolute bottom-12 left-12 right-12">
          <div className="hairline-gold" />
          <p className="mt-6 max-w-sm font-display text-2xl font-light italic leading-snug text-bone-100/70">
            “Zelar pela guarda e conservação” deixa de ser uma frase no papel e vira um
            registro com data, hora e assinatura.
          </p>
        </div>
      </div>
    </main>
  );
}
