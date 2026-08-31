import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { Wordmark } from '@/components/brand/Wordmark';
import { ButtonLink } from '@/components/ui/Button';
import { Reveal, SplitHeading } from '@/components/ui/Reveal';
import { useAuth } from '@/lib/auth';
import { usePrefersReducedMotion } from '@/lib/device';
import { MonogramStage } from '@/three/MonogramStage';

const STEPS = [
  {
    number: '01',
    title: 'O admin monta a entrega',
    body: 'Escolhe material, variante e quantidade. Descrição, marca/modelo e estado de conservação já vêm preenchidos do catálogo.',
  },
  {
    number: '02',
    title: 'O colaborador recebe o link',
    body: 'Uma DM no Slack com o resumo dos itens e um botão. Sem Slack configurado, o admin copia o link — o fluxo nunca trava.',
  },
  {
    number: '03',
    title: 'Assina pelo celular',
    body: 'Confere os itens, confirma seus dados, lê o termo e assina com o dedo. Registramos data, hora, IP e dispositivo.',
  },
  {
    number: '04',
    title: 'A empresa contra-assina',
    body: 'O representante assina, o PDF é arquivado e o estoque baixa sozinho — com trilha de auditoria de cada unidade.',
  },
];

const PILLARS = [
  {
    title: 'Estoque sem amarras',
    body: 'Você define o eixo de variação: tamanho PP–GG, numeração 35/40/45, voltagem, cor. E a unidade: unidade, par, dezena, caixa.',
  },
  {
    title: 'Termo com valor probatório',
    body: 'PDF com os dados da empresa, tabela dos materiais, assinaturas embutidas e hash SHA-256 das evidências.',
  },
  {
    title: 'Dados tratados como sensíveis',
    body: 'CPF e assinaturas nunca ficam públicos. O acesso é sempre por URL assinada com expiração curta.',
  },
];

export default function Landing() {
  const { admin } = useAuth();
  const reduced = usePrefersReducedMotion();
  const heroRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', reduced ? '0%' : '18%']);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, reduced ? 1 : 0.15]);
  const sceneScale = useTransform(scrollYProgress, [0, 1], [1, reduced ? 1 : 1.22]);

  return (
    <main className="relative min-h-dvh overflow-x-clip bg-ink-vignette">
      {/* ------------------------------------------------------------ topo */}
      <header className="fixed inset-x-0 top-0 z-50">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Wordmark />
          <nav className="flex items-center gap-3">
            <a
              href="#como-funciona"
              data-magnetic="soft"
              className="hidden text-[0.78rem] font-medium uppercase tracking-widest text-bone-100/50 transition-colors hover:text-gold-200 sm:block"
            >
              Como funciona
            </a>
            <ButtonLink to={admin ? '/app' : '/login'} size="sm" variant="outline">
              {admin ? 'Abrir painel' : 'Entrar'}
            </ButtonLink>
          </nav>
        </div>
      </header>

      {/* ------------------------------------------------------------ hero */}
      <section ref={heroRef} className="relative grid min-h-dvh place-items-center overflow-hidden">
        <motion.div
          style={{ scale: sceneScale }}
          className="pointer-events-none absolute inset-0 z-0"
        >
          <MonogramStage className="h-full w-full" quality="hero" />
        </motion.div>

        {/* véu que separa o texto da cena — a cena vira cenário, não ruído */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(100%_66%_at_50%_46%,rgba(8,8,10,.8)_0%,rgba(8,8,10,.52)_40%,rgba(8,8,10,.08)_72%,transparent_90%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-1/3 bg-gradient-to-t from-ink-950 via-ink-950/70 to-transparent"
        />

        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className="relative z-10 mx-auto w-full max-w-5xl px-5 pb-24 pt-32 text-center sm:px-8"
        >
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.15 }}
            className="text-[0.62rem] font-semibold uppercase tracking-brand text-gold-400/90"
          >
            Grupo Alcina Maria
          </motion.p>

          <h1 className="mt-7 font-display text-[2.6rem] font-light leading-[1.02] tracking-[-0.015em] text-bone-50 sm:text-6xl lg:text-[4.6rem]">
            <SplitHeading text="Cada material entregue," delay={0.25} />
            <br />
            <span className="gold-text italic">
              <SplitHeading text="assinado e arquivado." delay={0.5} />
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.95 }}
            className="mx-auto mt-8 max-w-2xl text-balance text-[0.95rem] leading-relaxed text-bone-100/55 sm:text-base"
          >
            Controle de estoque, entrega de fardamento e Termo de Responsabilidade com
            assinatura digital — do almoxarifado ao colaborador, em um único link.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 1.1 }}
            className="mt-11 flex flex-wrap items-center justify-center gap-3"
          >
            <ButtonLink to={admin ? '/app' : '/login'} size="lg">
              {admin ? 'Abrir painel' : 'Entrar no painel'}
            </ButtonLink>
            <ButtonLink to="#como-funciona" size="lg" variant="outline">
              Como funciona
            </ButtonLink>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6, duration: 1 }}
          className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2"
        >
          <div className="flex flex-col items-center gap-3">
            <span className="text-[0.58rem] uppercase tracking-widest text-bone-100/35">
              Role
            </span>
            <span className="relative h-12 w-px overflow-hidden bg-white/10">
              <motion.span
                className="absolute inset-x-0 top-0 h-4 bg-gold-gradient"
                animate={reduced ? undefined : { y: ['-100%', '300%'] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            </span>
          </div>
        </motion.div>
      </section>

      {/* --------------------------------------------------------- marquee */}
      <div className="grain relative border-y border-white/[0.06] bg-ink-900/60 py-5">
        <div className="flex overflow-hidden">
          <motion.div
            className="flex shrink-0 items-center gap-10 pr-10"
            animate={reduced ? undefined : { x: ['0%', '-50%'] }}
            transition={{ duration: 34, repeat: Infinity, ease: 'linear' }}
          >
            {Array.from({ length: 2 }).map((_, copy) => (
              <div key={copy} className="flex shrink-0 items-center gap-10">
                {['Camisa PP–GG', 'Calça 35 · 40 · 45', 'Tênis por par', 'Moletom', 'Blazer', 'Crachá', 'Campos livres', 'Dezena · Par · Unidade'].map(
                  (item) => (
                    <span
                      key={`${copy}-${item}`}
                      className="flex shrink-0 items-center gap-10 whitespace-nowrap text-[0.72rem] uppercase tracking-widest text-bone-100/35"
                    >
                      {item}
                      <span className="h-1 w-1 rounded-full bg-gold-400/50" />
                    </span>
                  ),
                )}
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* --------------------------------------------------- como funciona */}
      <section id="como-funciona" className="relative mx-auto max-w-7xl px-5 py-28 sm:px-8 sm:py-36">
        <Reveal>
          <p className="label-eyebrow">O fluxo</p>
          <h2 className="mt-5 max-w-2xl font-display text-3xl font-light leading-tight text-bone-50 sm:text-5xl">
            Quatro passos entre o estoque e a assinatura.
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <Reveal key={step.number} delay={index * 0.1} className="group relative bg-ink-950/85">
              <div className="relative h-full p-8 transition-colors duration-500 group-hover:bg-ink-900/60">
                <span className="font-display text-4xl font-light text-gold-400/25 transition-colors duration-500 group-hover:text-gold-400/60">
                  {step.number}
                </span>
                <h3 className="mt-6 font-display text-xl font-medium text-bone-50">{step.title}</h3>
                <p className="mt-3 text-[0.86rem] leading-relaxed text-bone-100/45">{step.body}</p>
                <span
                  aria-hidden
                  className="absolute inset-x-8 bottom-0 h-px origin-left scale-x-0 bg-gold-gradient transition-transform duration-700 ease-premium group-hover:scale-x-100"
                />
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- pilares */}
      <section className="relative border-t border-white/[0.06] bg-ink-900/40">
        <div className="mx-auto grid max-w-7xl gap-14 px-5 py-28 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-36">
          <Reveal>
            <p className="label-eyebrow">Por dentro</p>
            <h2 className="mt-5 font-display text-3xl font-light leading-tight text-bone-50 sm:text-[2.75rem]">
              Feito para o jeito que o almoxarifado realmente funciona.
            </h2>
            <p className="mt-6 max-w-md text-[0.92rem] leading-relaxed text-bone-100/45">
              Nada de tamanhos fixos no código. Quem cadastra o material decide como ele varia,
              em que unidade é medido e quais atributos importam.
            </p>
            <div className="mt-10 h-40 w-40 opacity-90">
              <MonogramStage quality="compact" delay={800} particles={90} className="h-full w-full" />
            </div>
          </Reveal>

          <div className="flex flex-col justify-center gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.06]">
            {PILLARS.map((pillar, index) => (
              <Reveal key={pillar.title} delay={index * 0.12} className="bg-ink-950/85">
                <div className="p-8 sm:p-10">
                  <h3 className="font-display text-xl font-medium text-bone-50">{pillar.title}</h3>
                  <p className="mt-3 text-[0.86rem] leading-relaxed text-bone-100/45">
                    {pillar.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- rodapé */}
      <footer className="border-t border-white/[0.06] bg-ink-950">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-5 py-14 text-center sm:px-8">
          <Wordmark to="" />
          <p className="text-[0.72rem] leading-relaxed text-bone-100/35">
            Grupo Alcina Maria · CNPJ 14.750.618/0001-83 · Penedo, Alagoas — BR
          </p>
          <div className="hairline-gold max-w-xs" />
          <p className="text-[0.66rem] uppercase tracking-widest text-bone-100/25">
            ACQUA Almoxarifado
          </p>
        </div>
      </footer>
    </main>
  );
}
