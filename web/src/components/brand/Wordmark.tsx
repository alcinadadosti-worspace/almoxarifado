import { Link } from 'react-router-dom';
import { MonogramMark } from './MonogramMark';
import { cn } from '@/lib/cn';

interface WordmarkProps {
  to?: string;
  className?: string;
  surface?: 'dark' | 'light';
  compact?: boolean;
  subtitle?: string;
}

/** Assinatura da marca: monograma + "ACQUA / Almoxarifado". */
export function Wordmark({
  to = '/',
  className,
  surface = 'dark',
  compact = false,
  subtitle = 'Almoxarifado',
}: WordmarkProps) {
  const content = (
    <span className={cn('group inline-flex items-center gap-3', className)}>
      <span className="relative grid h-10 w-10 shrink-0 place-items-center">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-gold-400/10 opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-100"
        />
        <MonogramMark className="relative h-9 w-9 transition-transform duration-700 ease-premium group-hover:rotate-[8deg]" />
      </span>
      {!compact ? (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              'font-display text-[1.06rem] font-semibold tracking-[0.34em]',
              surface === 'dark' ? 'text-bone-50' : 'text-ink-900',
            )}
          >
            ACQUA
          </span>
          <span
            className={cn(
              'mt-1 text-[0.58rem] font-medium uppercase tracking-[0.3em]',
              surface === 'dark' ? 'text-gold-400/80' : 'text-gold-700',
            )}
          >
            {subtitle}
          </span>
        </span>
      ) : null}
    </span>
  );

  return to ? (
    <Link to={to} data-magnetic="soft" aria-label="ACQUA Almoxarifado">
      {content}
    </Link>
  ) : (
    content
  );
}
