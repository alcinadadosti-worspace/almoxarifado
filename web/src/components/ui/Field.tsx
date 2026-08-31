import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

type Surface = 'dark' | 'light';

const CONTROL: Record<Surface, string> = {
  dark:
    'w-full rounded-xl border border-white/10 bg-ink-900/70 px-4 text-[0.92rem] text-bone-50 ' +
    'placeholder:text-ink-300/60 transition-all duration-200 ' +
    'hover:border-white/20 focus:border-gold-400/70 focus:bg-ink-900 focus:outline-none ' +
    'focus:ring-4 focus:ring-gold-400/12 disabled:opacity-50',
  light:
    'w-full rounded-xl border border-ink-900/12 bg-white px-4 text-[0.92rem] text-ink-900 ' +
    'placeholder:text-ink-400/60 transition-all duration-200 ' +
    'hover:border-ink-900/25 focus:border-gold-500 focus:outline-none ' +
    'focus:ring-4 focus:ring-gold-400/18 disabled:opacity-50',
};

const LABEL: Record<Surface, string> = {
  dark: 'text-[0.66rem] font-semibold uppercase tracking-widest text-bone-100/45',
  light: 'text-[0.66rem] font-semibold uppercase tracking-widest text-ink-400',
};

interface FieldShellProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  surface?: Surface;
  className?: string;
  children: (id: string) => ReactNode;
}

export function FieldShell({
  label,
  hint,
  error,
  required,
  surface = 'dark',
  className,
  children,
}: FieldShellProps) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={id} className={LABEL[surface]}>
          {label}
          {required ? <span className="ml-1 text-gold-400">*</span> : null}
        </label>
      ) : null}
      {children(id)}
      {error ? (
        <p className="text-[0.72rem] font-medium text-red-400">{error}</p>
      ) : hint ? (
        <p
          className={cn(
            'text-[0.72rem]',
            surface === 'dark' ? 'text-bone-100/40' : 'text-ink-400',
          )}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  surface?: Surface;
  wrapperClassName?: string;
  /** Ícone decorativo à esquerda do campo. */
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, surface = 'dark', wrapperClassName, className, icon, ...rest },
  ref,
) {
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={rest.required}
      surface={surface}
      className={wrapperClassName}
    >
      {(id) => (
        <div className="relative">
          {icon ? (
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-ink-300">
              {icon}
            </span>
          ) : null}
          <input
            ref={ref}
            id={id}
            className={cn(
              CONTROL[surface],
              'h-12',
              icon && 'pl-10',
              error && 'border-red-400/60 focus:border-red-400 focus:ring-red-400/15',
              className,
            )}
            {...rest}
          />
        </div>
      )}
    </FieldShell>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  surface?: Surface;
  wrapperClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, surface = 'dark', wrapperClassName, className, ...rest },
  ref,
) {
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={rest.required}
      surface={surface}
      className={wrapperClassName}
    >
      {(id) => (
        <textarea
          ref={ref}
          id={id}
          className={cn(CONTROL[surface], 'min-h-[104px] py-3 leading-relaxed', className)}
          {...rest}
        />
      )}
    </FieldShell>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  surface?: Surface;
  wrapperClassName?: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, surface = 'dark', wrapperClassName, className, options, placeholder, ...rest },
  ref,
) {
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={rest.required}
      surface={surface}
      className={wrapperClassName}
    >
      {(id) => (
        <div className="relative">
          <select
            ref={ref}
            id={id}
            className={cn(
              CONTROL[surface],
              'h-12 appearance-none pr-10',
              error && 'border-red-400/60',
              className,
            )}
            {...rest}
          >
            {placeholder ? (
              <option value="" disabled>
                {placeholder}
              </option>
            ) : null}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <svg
            aria-hidden
            viewBox="0 0 12 8"
            className={cn(
              'pointer-events-none absolute right-4 top-1/2 h-2 w-3 -translate-y-1/2',
              surface === 'dark' ? 'text-gold-400' : 'text-gold-600',
            )}
          >
            <path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </div>
      )}
    </FieldShell>
  );
});

/** Interruptor usado nos formulários (ativo/inativo, salvar assinatura…). */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  surface = 'dark',
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
  surface?: Surface;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      data-magnetic="soft"
      className={cn(
        'flex w-full items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-colors',
        surface === 'dark'
          ? 'border-white/10 bg-ink-900/50 hover:border-white/20'
          : 'border-ink-900/10 bg-white hover:border-ink-900/20',
      )}
    >
      <span>
        <span
          className={cn(
            'block text-[0.84rem] font-semibold',
            surface === 'dark' ? 'text-bone-50' : 'text-ink-900',
          )}
        >
          {label}
        </span>
        {hint ? (
          <span
            className={cn(
              'mt-0.5 block text-[0.72rem]',
              surface === 'dark' ? 'text-bone-100/45' : 'text-ink-400',
            )}
          >
            {hint}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-all duration-300 ease-premium',
          checked ? 'bg-gold-gradient' : surface === 'dark' ? 'bg-white/12' : 'bg-ink-900/15',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-300 ease-premium',
            checked ? 'left-[1.4rem]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  );
}
