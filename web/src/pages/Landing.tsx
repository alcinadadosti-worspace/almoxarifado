import { motion } from 'framer-motion';
import { Wordmark } from '@/components/brand/Wordmark';
import { ButtonLink } from '@/components/ui/Button';
import { SplitHeading } from '@/components/ui/Reveal';
import { useAuth } from '@/lib/auth';
import { MonogramStage } from '@/three/MonogramStage';

/**
 * Página de entrada: uma tela só, sem rolagem.
 * O monograma em ouro é o assunto; o resto é o caminho para o painel.
 */
export default function Landing() {
  const { admin } = useAuth();

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-ink-vignette">
      {/* ------------------------------------------------------------ topo */}
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Wordmark />
          <ButtonLink to={admin ? '/app' : '/login'} size="sm" variant="outline">
            {admin ? 'Abrir painel' : 'Entrar'}
          </ButtonLink>
        </div>
      </header>

      {/* ------------------------------------------------------------ hero */}
      <section className="relative flex flex-1 items-center justify-center">
        <div className="pointer-events-none absolute inset-0 z-0">
          <MonogramStage className="h-full w-full" quality="hero" />
        </div>

        {/* véu que separa o texto da cena — a cena vira cenário, não ruído */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(100%_66%_at_50%_46%,rgba(8,8,10,.72)_0%,rgba(8,8,10,.46)_40%,rgba(8,8,10,.08)_72%,transparent_90%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-1/3 bg-gradient-to-t from-ink-950 via-ink-950/70 to-transparent"
        />

        <div className="relative z-10 mx-auto w-full max-w-5xl px-5 py-28 text-center sm:px-8">
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
            className="mt-11 flex justify-center"
          >
            <ButtonLink to={admin ? '/app' : '/login'} size="lg">
              {admin ? 'Abrir painel' : 'Entrar no painel'}
            </ButtonLink>
          </motion.div>
        </div>
      </section>

      {/* ---------------------------------------------------------- rodapé */}
      <footer className="relative z-10 border-t border-white/[0.06] bg-ink-950">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-5 px-5 py-10 text-center sm:px-8">
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
