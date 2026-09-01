import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/format';
import type { DeliveryStatus } from '@/types/domain';

type Tone = 'gold' | 'acqua' | 'neutral' | 'muted' | 'danger';

const TONES: Record<Tone, string> = {
  gold: 'border-gold-400/35 bg-gold-400/10 text-gold-200',
  acqua: 'border-acqua-400/35 bg-acqua-400/10 text-acqua-400',
  neutral: 'border-white/12 bg-white/[0.06] text-bone-100/80',
  muted: 'border-white/8 bg-white/[0.03] text-bone-100/45',
  danger: 'border-red-400/35 bg-red-400/10 text-red-300',
};

const TONES_LIGHT: Record<Tone, string> = {
  gold: 'border-gold-500/35 bg-gold-100/60 text-gold-800',
  acqua: 'border-acqua-500/30 bg-acqua-400/10 text-acqua-600',
  neutral: 'border-ink-900/12 bg-ink-900/[0.04] text-ink-700',
  muted: 'border-ink-900/8 bg-ink-900/[0.02] text-ink-400',
  danger: 'border-red-500/30 bg-red-500/10 text-red-700',
};

export function Badge({
  children,
  tone = 'neutral',
  surface = 'dark',
  dot,
  className,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  surface?: 'dark' | 'light';
  dot?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-wider',
        surface === 'dark' ? TONES[tone] : TONES_LIGHT[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function StatusBadge({
  status,
  surface = 'dark',
}: {
  status: DeliveryStatus;
  surface?: 'dark' | 'light';
}) {
  return (
    <Badge tone={STATUS_TONE[status]} surface={surface} dot>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
