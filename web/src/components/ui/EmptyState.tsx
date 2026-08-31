import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { MonogramMark } from '@/components/brand/MonogramMark';

export function EmptyState({
  title,
  description,
  action,
  className,
  surface = 'dark',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  surface?: 'dark' | 'light';
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed px-8 py-16 text-center',
        surface === 'dark' ? 'border-white/10' : 'border-ink-900/12',
        className,
      )}
    >
      <MonogramMark className="h-12 w-12 opacity-25" />
      <h3
        className={cn(
          'mt-6 font-display text-xl font-medium',
          surface === 'dark' ? 'text-bone-50' : 'text-ink-900',
        )}
      >
        {title}
      </h3>
      {description ? (
        <p
          className={cn(
            'mt-2 max-w-sm text-sm leading-relaxed',
            surface === 'dark' ? 'text-bone-100/45' : 'text-ink-400',
          )}
        >
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-7">{action}</div> : null}
    </div>
  );
}
