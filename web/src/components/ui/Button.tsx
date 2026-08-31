import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

type Variant = 'gold' | 'outline' | 'ghost' | 'dark' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const BASE =
  'group relative inline-flex select-none items-center justify-center gap-2 overflow-hidden rounded-full font-sans font-semibold ' +
  'transition-all duration-300 ease-premium disabled:pointer-events-none disabled:opacity-40';

const VARIANTS: Record<Variant, string> = {
  gold:
    'bg-gold-gradient text-ink-950 shadow-gold hover:shadow-gold-lg ' +
    'hover:brightness-[1.06] active:scale-[.985]',
  outline:
    'border border-gold-400/45 text-gold-200 hover:border-gold-300 hover:bg-gold-400/[0.08] ' +
    'active:scale-[.985]',
  ghost: 'text-bone-100/70 hover:bg-white/[0.06] hover:text-bone-50 active:scale-[.985]',
  dark:
    'border border-white/10 bg-ink-800 text-bone-100 hover:border-white/20 hover:bg-ink-700 ' +
    'active:scale-[.985]',
  danger:
    'border border-red-400/40 text-red-200 hover:bg-red-500/10 hover:border-red-300/60 active:scale-[.985]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-4 text-[0.78rem] tracking-wide',
  md: 'h-11 px-6 text-[0.84rem] tracking-wide',
  lg: 'h-14 px-9 text-[0.92rem] tracking-[0.08em]',
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  full?: boolean;
  className?: string;
  children?: ReactNode;
}

/** Brilho que atravessa o botão dourado no hover. */
function Sheen() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 -translate-x-full bg-gold-sheen opacity-0 transition-all duration-700 ease-premium group-hover:translate-x-full group-hover:opacity-100"
    />
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
    />
  );
}

export type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'gold', size = 'md', loading, icon, full, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      data-magnetic={variant === 'gold' ? 'strong' : 'soft'}
      disabled={disabled || loading}
      className={cn(BASE, VARIANTS[variant], SIZES[size], full && 'w-full', className)}
      {...rest}
    >
      {variant === 'gold' ? <Sheen /> : null}
      <span className="relative z-10 inline-flex items-center gap-2">
        {loading ? <Spinner /> : icon}
        {children}
      </span>
    </button>
  );
});

interface ButtonLinkProps extends CommonProps {
  to: string;
  state?: unknown;
  target?: string;
  rel?: string;
}

export function ButtonLink({
  variant = 'gold',
  size = 'md',
  icon,
  full,
  className,
  children,
  to,
  ...rest
}: ButtonLinkProps) {
  // Links absolutos e âncoras usam <a>; rotas internas usam o Link do router.
  const external = /^https?:\/\//.test(to) || to.startsWith('#');
  const classes = cn(BASE, VARIANTS[variant], SIZES[size], full && 'w-full', className);

  if (external) {
    return (
      <a href={to} className={classes} data-magnetic="soft" {...rest}>
        {variant === 'gold' ? <Sheen /> : null}
        <span className="relative z-10 inline-flex items-center gap-2">
          {icon}
          {children}
        </span>
      </a>
    );
  }

  return (
    <Link to={to} className={classes} data-magnetic="soft" {...rest}>
      {variant === 'gold' ? <Sheen /> : null}
      <span className="relative z-10 inline-flex items-center gap-2">
        {icon}
        {children}
      </span>
    </Link>
  );
}
