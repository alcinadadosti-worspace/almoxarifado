import { Wordmark } from '@/components/brand/Wordmark';
import { ButtonLink } from '@/components/ui/Button';
import { MonogramStage } from '@/three/MonogramStage';

export default function NotFound() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-ink-vignette px-5 text-center">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <MonogramStage className="h-full w-full" quality="compact" particles={120} />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <Wordmark />
        <p className="mt-12 font-display text-[5rem] font-light leading-none gold-text sm:text-[7rem]">
          404
        </p>
        <h1 className="mt-4 font-display text-2xl font-light text-bone-50 sm:text-3xl">
          Esta página não existe.
        </h1>
        <p className="mt-3 max-w-sm text-[0.88rem] leading-relaxed text-bone-100/45">
          O link pode ter expirado ou sido digitado errado. Se você recebeu um termo para
          assinar, peça ao almoxarifado para reenviar.
        </p>
        <ButtonLink to="/" size="lg" className="mt-9">
          Voltar ao início
        </ButtonLink>
      </div>
    </main>
  );
}
