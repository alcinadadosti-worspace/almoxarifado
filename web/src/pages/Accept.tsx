import { motion, useScroll, useSpring } from 'framer-motion';
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Confetti } from '@/components/Confetti';
import { MonogramMark } from '@/components/brand/MonogramMark';
import { SignaturePad, type SignaturePadHandle } from '@/components/SignaturePad';
import { IconCheck } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { MaskReveal, Reveal } from '@/components/ui/Reveal';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useCanRender3D } from '@/lib/device';
import { formatCpf, formatDateTime, formatLongDate, isValidCpf } from '@/lib/format';
import type { PublicDelivery, TermContent } from '@/types/domain';

const SealCanvas = lazy(() => import('@/three/SealCanvas'));

interface PublicResponse {
  delivery: PublicDelivery;
  term: TermContent;
}

/* --------------------------------------------------------------- estados */

function Centered({
  title,
  description,
  tone = 'gold',
}: {
  title: string;
  description: string;
  tone?: 'gold' | 'danger';
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bone-vignette px-6 text-center">
      <div className="max-w-md">
        <MonogramMark className="mx-auto h-14 w-14" />
        <h1
          className={cn(
            'mt-8 font-display text-3xl font-light',
            tone === 'danger' ? 'text-ink-900' : 'text-ink-900',
          )}
        >
          {title}
        </h1>
        <p className="mt-3 text-[0.92rem] leading-relaxed text-ink-400">{description}</p>
        <div className="mx-auto mt-8 h-px w-24 bg-gradient-to-r from-transparent via-gold-400 to-transparent" />
        <p className="mt-6 text-[0.68rem] uppercase tracking-widest text-ink-400/70">
          Grupo Alcina Maria
        </p>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------- concluído */

function SignedScreen({ delivery, celebrate }: { delivery: PublicDelivery; celebrate: boolean }) {
  const can3D = useCanRender3D();

  return (
    <main className="relative min-h-dvh overflow-hidden bg-bone-vignette">
      {celebrate ? <Confetti /> : null}

      <div className="relative mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-6 py-20 text-center">
        <div className="relative h-56 w-56 sm:h-72 sm:w-72">
          {/* o brilho do selo é CSS: o mesmo efeito do bloom, sem custo de GPU */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-[-18%] rounded-full bg-[radial-gradient(circle,rgba(246,231,193,.85)_0%,rgba(227,194,126,.45)_38%,rgba(201,160,80,.12)_62%,transparent_74%)] blur-xl"
          />

          {/* ondas de choque do carimbo */}
          {celebrate
            ? [0, 0.5].map((delay) => (
                <motion.span
                  key={delay}
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-full border border-gold-400/70"
                  initial={{ scale: 0.75, opacity: 0 }}
                  animate={{ scale: [0.75, 2.1], opacity: [0, 0.75, 0] }}
                  transition={{ duration: 1.7, delay: 0.5 + delay, ease: [0.16, 1, 0.3, 1] }}
                />
              ))
            : null}
          {can3D ? (
            <Suspense
              fallback={<MonogramMark className="absolute inset-[22%] h-[56%] w-[56%]" />}
            >
              <SealCanvas className="absolute inset-0" />
            </Suspense>
          ) : (
            <div className="grid h-full w-full place-items-center">
              <span className="grid h-32 w-32 place-items-center rounded-full border-2 border-gold-400/50 bg-gold-100/40">
                <MonogramMark className="h-16 w-16" />
              </span>
            </div>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="text-[0.62rem] font-semibold uppercase tracking-brand text-gold-700">
            Termo assinado
          </p>
          <h1 className="mt-5 font-display text-4xl font-light leading-tight text-ink-900 sm:text-5xl">
            Tudo certo,
            <br />
            <span className="gold-text italic">
              {(delivery.employee.fullName || '').split(' ')[0] || 'colaborador(a)'}.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-md text-[0.92rem] leading-relaxed text-ink-400">
            Sua assinatura foi registrada em{' '}
            <strong className="text-ink-700">{formatDateTime(delivery.signedAt)}</strong>. Uma via
            do termo fica arquivada com o almoxarifado do {delivery.company.name}.
          </p>
        </motion.div>

        <motion.ul
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.85 }}
          className="mt-10 w-full space-y-2 text-left"
        >
          {delivery.items.map((item) => (
            <li
              key={item.index}
              className="flex items-center gap-3 rounded-xl border border-ink-900/[0.08] bg-white/70 px-4 py-3"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-800">
                <IconCheck width={13} height={13} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.88rem] font-medium text-ink-900">
                  {item.name}
                  {item.variantKey ? ` — ${item.variantLabel} ${item.variantKey}` : ''}
                </span>
                <span className="block truncate text-[0.74rem] text-ink-400">
                  {[
                    item.quantityLabel,
                    item.conservation,
                    ...Object.entries(item.customValues).map(([key, value]) => `${key}: ${value}`),
                  ].join(' · ')}
                </span>
              </span>
            </li>
          ))}
        </motion.ul>

        <p className="mt-10 text-[0.68rem] uppercase tracking-widest text-ink-400/60">
          {delivery.company.name} · CNPJ {delivery.company.cnpj}
        </p>
      </div>
    </main>
  );
}

/* ----------------------------------------------------------------- página */

export default function Accept() {
  const { token } = useParams();
  const padRef = useRef<SignaturePadHandle>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<PublicResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState<{ title: string; description: string } | null>(null);

  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [role, setRole] = useState('');
  const [sector, setSector] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [justSigned, setJustSigned] = useState(false);

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 28, restDelta: 0.001 });

  /* -------------------------------------------------------------- carga */
  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      try {
        const response = await api.get<PublicResponse>(
          `/api/public/deliveries/${encodeURIComponent(token)}`,
          { auth: false },
        );
        if (!active) return;
        setState(response);
        setFullName(response.delivery.employee.fullName);
        setCpf(response.delivery.employee.cpf ? formatCpf(response.delivery.employee.cpf) : '');
        setRole(response.delivery.employee.role);
        setSector(response.delivery.employee.sector);
      } catch (error) {
        if (!active) return;
        const message =
          error instanceof ApiError && error.status === 404
            ? {
                title: 'Link não encontrado',
                description:
                  'Este endereço não corresponde a nenhum termo. Confira o link recebido ou peça um novo ao almoxarifado.',
              }
            : {
                title: 'Não foi possível abrir o termo',
                description:
                  error instanceof ApiError
                    ? error.message
                    : 'Verifique sua conexão e tente novamente.',
              };
        setFatal(message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const delivery = state?.delivery;
  const term = state?.term;

  const totals = useMemo(() => {
    if (!delivery) return { items: 0, units: 0 };
    return {
      items: delivery.items.length,
      units: delivery.items.reduce((sum, item) => sum + item.quantity, 0),
    };
  }, [delivery]);

  /* ------------------------------------------------------------- envio */
  const submit = async () => {
    if (!token) return;
    const nextErrors: Record<string, string> = {};
    if (fullName.trim().length < 3) nextErrors.fullName = 'Informe seu nome completo.';
    if (!isValidCpf(cpf)) nextErrors.cpf = 'CPF inválido.';
    if (!role.trim()) nextErrors.role = 'Informe seu cargo ou função.';
    if (!sector.trim()) nextErrors.sector = 'Informe seu setor ou unidade.';
    const signature = padRef.current?.toDataUrl();
    if (!signature) nextErrors.signature = 'Assine no quadro acima.';
    if (!accepted) nextErrors.accepted = 'É preciso aceitar os termos.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.post<{ delivery: PublicDelivery }>(
        `/api/public/deliveries/${encodeURIComponent(token)}/sign`,
        {
          fullName: fullName.trim(),
          cpf: cpf.replace(/\D+/g, ''),
          role: role.trim(),
          sector: sector.trim(),
          signature,
          accepted: true,
        },
        { auth: false },
      );
      setState((current) => (current ? { ...current, delivery: response.delivery } : current));
      setJustSigned(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Não foi possível registrar a assinatura.';
      setErrors({ submit: message });
      if (error instanceof ApiError && error.details) setErrors({ ...error.details, submit: message });
    } finally {
      setSubmitting(false);
    }
  };

  /* ------------------------------------------------------------ estados */

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bone-vignette">
        <div className="flex flex-col items-center gap-5">
          <span className="relative">
            <span
              aria-hidden
              className="absolute inset-0 animate-pulse-ring rounded-full border border-gold-400/50"
            />
            <MonogramMark className="h-12 w-12 animate-float" />
          </span>
          <p className="text-[0.62rem] font-semibold uppercase tracking-widest text-gold-700">
            Abrindo seu termo
          </p>
        </div>
      </main>
    );
  }

  if (fatal) return <Centered title={fatal.title} description={fatal.description} tone="danger" />;
  if (!delivery || !term) {
    return (
      <Centered
        title="Não foi possível abrir o termo"
        description="Recarregue a página. Se o problema continuar, peça um novo link ao almoxarifado."
        tone="danger"
      />
    );
  }

  if (delivery.signed) return <SignedScreen delivery={delivery} celebrate={justSigned} />;

  if (delivery.expired) {
    return (
      <Centered
        title="Este link expirou"
        description={`O prazo para assinatura terminou em ${formatDateTime(delivery.expiresAt)}. Peça ao almoxarifado do ${delivery.company.name} para enviar um novo link.`}
        tone="danger"
      />
    );
  }

  const inputProps = { surface: 'light' as const };

  return (
    <main className="relative min-h-dvh bg-bone-vignette pb-24">
      {/* progresso de leitura */}
      <motion.div
        style={{ scaleX: progress }}
        className="fixed inset-x-0 top-0 z-50 h-[3px] origin-left bg-gold-gradient"
      />

      {/* ------------------------------------------------------------ hero */}
      <header className="relative overflow-hidden px-6 pb-16 pt-16 text-center sm:pt-24">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-gold-200/25 blur-[110px]"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto w-fit"
        >
          <MonogramMark className="h-16 w-16 drop-shadow-[0_10px_30px_rgba(201,160,80,0.35)]" />
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.25 }}
          className="relative mt-7 text-[0.6rem] font-semibold uppercase tracking-brand text-gold-700"
        >
          {delivery.company.name}
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="relative mt-5 font-display text-[2.2rem] font-light leading-[1.08] text-ink-900 sm:text-5xl"
        >
          {delivery.employee.fullName ? (
            <>
              Olá, {delivery.employee.fullName.split(' ')[0]}.
              <br />
            </>
          ) : null}
          <span className="gold-text italic">Você está recebendo</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.55 }}
          className="relative mx-auto mt-5 max-w-md text-[0.92rem] leading-relaxed text-ink-400"
        >
          {totals.items} {totals.items === 1 ? 'item' : 'itens'} · {totals.units} unidades no total.
          Confira abaixo, confirme seus dados e assine — leva menos de um minuto.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.8 }}
          className="relative mx-auto mt-12 h-10 w-px overflow-hidden bg-ink-900/10"
        >
          <motion.span
            className="absolute inset-x-0 top-0 h-4 bg-gold-gradient"
            animate={{ y: ['-100%', '300%'] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>
      </header>

      {/* ----------------------------------------------------------- itens */}
      <section className="mx-auto max-w-2xl px-5 sm:px-6">
        <Reveal>
          <p className="text-[0.6rem] font-semibold uppercase tracking-widest text-gold-700">
            {term.sections.materials}
          </p>
          <div className="mt-3 h-px w-full bg-gradient-to-r from-gold-400/60 to-transparent" />
        </Reveal>

        <ul className="mt-7 space-y-3">
          {delivery.items.map((item, index) => (
            <MaskReveal as="li" key={item.index} delay={index * 0.14} className="rounded-2xl">
              <article className="surface-light group relative overflow-hidden p-5 sm:p-6">
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-[3px] bg-gold-gradient opacity-70"
                />
                <div className="flex items-start gap-4">
                  <span className="mt-0.5 font-mono text-[0.72rem] text-gold-700/70">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-[1.35rem] font-medium leading-snug text-ink-900">
                      {item.name}
                      {item.variantKey ? (
                        <span className="text-gold-700">
                          {' '}
                          — {item.variantLabel} {item.variantKey}
                        </span>
                      ) : null}
                    </h2>

                    <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 text-[0.82rem] sm:grid-cols-3">
                      {[
                        ['Marca/Modelo', [item.brand, item.model].filter(Boolean).join(' / ') || '—'],
                        ['Quantidade', item.quantityLabel],
                        ['Conservação', item.conservation],
                        ...Object.entries(item.customValues),
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-[0.6rem] font-semibold uppercase tracking-wider text-ink-400">
                            {label}
                          </dt>
                          <dd className="mt-1 font-medium text-ink-800">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              </article>
            </MaskReveal>
          ))}
        </ul>
      </section>

      {/* ------------------------------------------------------- seus dados */}
      <section ref={formRef} className="mx-auto mt-20 max-w-2xl px-5 sm:px-6">
        <Reveal>
          <p className="text-[0.6rem] font-semibold uppercase tracking-widest text-gold-700">
            {term.sections.identification}
          </p>
          <div className="mt-3 h-px w-full bg-gradient-to-r from-gold-400/60 to-transparent" />
          <p className="mt-5 text-[0.88rem] leading-relaxed text-ink-400">
            {delivery.employee.fullName
              ? 'Confirme se está tudo certo com seus dados.'
              : 'Preencha seus dados para identificar o termo.'}
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Input
              {...inputProps}
              wrapperClassName="sm:col-span-2"
              label="Nome completo"
              required
              value={fullName}
              error={errors.fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
            />
            <Input
              {...inputProps}
              label="CPF"
              required
              inputMode="numeric"
              value={cpf}
              error={errors.cpf}
              onChange={(event) => setCpf(formatCpf(event.target.value))}
              placeholder="000.000.000-00"
            />
            <Input
              {...inputProps}
              label="Cargo/Função"
              required
              value={role}
              error={errors.role}
              onChange={(event) => setRole(event.target.value)}
            />
            <Input
              {...inputProps}
              wrapperClassName="sm:col-span-2"
              label="Setor/Unidade"
              required
              value={sector}
              error={errors.sector}
              onChange={(event) => setSector(event.target.value)}
            />
          </div>
        </Reveal>
      </section>

      {/* ------------------------------------------------------------ termo */}
      <section className="mx-auto mt-20 max-w-2xl px-5 sm:px-6">
        <Reveal>
          <article className="surface-light relative overflow-hidden px-6 py-8 sm:px-10 sm:py-12">
            <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gold-gradient" />

            <div className="flex items-center gap-3">
              <MonogramMark className="h-9 w-9" />
              <div>
                <p className="font-display text-[0.92rem] font-semibold tracking-[0.16em] text-ink-900">
                  {delivery.company.name.toUpperCase()}
                </p>
                <p className="text-[0.66rem] text-ink-400">
                  CNPJ {delivery.company.cnpj} · {delivery.company.headquarters}
                </p>
              </div>
            </div>

            <h2 className="mt-9 text-center font-display text-[1.15rem] font-semibold leading-snug tracking-wide text-ink-900 sm:text-[1.35rem]">
              {term.title}
            </h2>

            <p className="mt-7 text-justify text-[0.88rem] leading-[1.85] text-ink-700">
              {term.intro}
            </p>

            <h3 className="mt-9 text-[0.62rem] font-semibold uppercase tracking-widest text-gold-700">
              {term.sections.responsibility}
            </h3>
            <div className="mt-2 h-px w-full bg-gold-400/40" />
            <p className="mt-4 text-justify text-[0.88rem] leading-[1.85] text-ink-700">
              {term.responsibility}
            </p>

            <p className="mt-9 text-right font-display text-[0.95rem] italic text-ink-700">
              {delivery.company.city}/{delivery.company.state}, {formatLongDate()}.
            </p>
          </article>
        </Reveal>
      </section>

      {/* -------------------------------------------------------- assinatura */}
      <section className="mx-auto mt-16 max-w-2xl px-5 sm:px-6">
        <Reveal>
          <p className="text-[0.6rem] font-semibold uppercase tracking-widest text-gold-700">
            Assinatura do(a) colaborador(a)
          </p>
          <div className="mt-3 h-px w-full bg-gradient-to-r from-gold-400/60 to-transparent" />
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-6">
            <SignaturePad
              ref={padRef}
              label="Seu traço"
              height={230}
              onChange={(value) => {
                setHasInk(value);
                if (value) setErrors((current) => ({ ...current, signature: '' }));
              }}
              hint="A imagem da sua assinatura entra no PDF do termo, junto de data, hora e dispositivo."
            />
            {errors.signature ? (
              <p className="mt-2 text-[0.76rem] font-medium text-red-600">{errors.signature}</p>
            ) : null}
          </div>
        </Reveal>

        <Reveal delay={0.16}>
          <button
            type="button"
            onClick={() => {
              setAccepted(!accepted);
              setErrors((current) => ({ ...current, accepted: '' }));
            }}
            className={cn(
              'mt-6 flex w-full items-start gap-3.5 rounded-2xl border px-5 py-4 text-left transition-all duration-300',
              accepted
                ? 'border-gold-500/50 bg-gold-100/50'
                : 'border-ink-900/12 bg-white/70 hover:border-ink-900/25',
            )}
          >
            <span
              className={cn(
                'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-all duration-300',
                accepted
                  ? 'border-gold-600 bg-gold-gradient text-ink-950'
                  : 'border-ink-900/25 text-transparent',
              )}
            >
              <IconCheck width={12} height={12} />
            </span>
            <span className="text-[0.86rem] leading-relaxed text-ink-700">
              Li e concordo com o Termo de Responsabilidade, confirmo o recebimento dos materiais
              descritos acima e me comprometo a zelar por sua guarda, conservação e devolução.
            </span>
          </button>
          {errors.accepted ? (
            <p className="mt-2 text-[0.76rem] font-medium text-red-600">{errors.accepted}</p>
          ) : null}
        </Reveal>

        {errors.submit ? (
          <p className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[0.82rem] text-red-700">
            {errors.submit}
          </p>
        ) : null}

        <Reveal delay={0.2}>
          <Button
            full
            size="lg"
            className="mt-8"
            loading={submitting}
            disabled={!hasInk || !accepted}
            onClick={submit}
          >
            Assinar e enviar
          </Button>
          <p className="mt-4 text-center text-[0.72rem] leading-relaxed text-ink-400">
            Ao assinar, registramos data, hora, endereço IP e dispositivo como evidência do
            aceite. Seus dados são tratados conforme a LGPD.
          </p>
        </Reveal>
      </section>

      <footer className="mt-20 text-center">
        <div className="mx-auto h-px w-24 bg-gradient-to-r from-transparent via-gold-400 to-transparent" />
        <p className="mt-6 text-[0.66rem] uppercase tracking-widest text-ink-400/70">
          {delivery.company.name} · ACQUA Almoxarifado
        </p>
      </footer>
    </main>
  );
}
