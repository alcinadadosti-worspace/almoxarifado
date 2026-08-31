import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IconArrowLeft } from '@/components/icons';
import { cn } from '@/lib/cn';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  back?: { to: string; label: string };
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('mb-8', className)}>
      {back ? (
        <Link
          to={back.to}
          className="mb-5 inline-flex items-center gap-2 text-[0.72rem] font-medium uppercase tracking-widest text-bone-100/40 transition-colors hover:text-gold-300"
        >
          <IconArrowLeft width={14} height={14} />
          {back.label}
        </Link>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          {eyebrow ? <p className="label-eyebrow mb-2.5">{eyebrow}</p> : null}
          <h1 className="font-display text-[2rem] font-light leading-tight tracking-[-0.01em] text-bone-50 sm:text-[2.6rem]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2.5 max-w-2xl text-[0.88rem] leading-relaxed text-bone-100/45">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
      </div>

      <div className="mt-7 h-px w-full bg-gradient-to-r from-gold-400/40 via-white/[0.06] to-transparent" />
    </header>
  );
}
