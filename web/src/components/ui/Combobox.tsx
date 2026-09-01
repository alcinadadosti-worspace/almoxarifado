import { useEffect, useMemo, useRef, useState } from 'react';
import { IconCheck, IconSearch, IconX } from '@/components/icons';
import { FieldShell } from '@/components/ui/Field';
import { cn } from '@/lib/cn';

export interface ComboboxOption {
  value: string;
  label: string;
  hint?: string;
  badge?: string;
}

interface ComboboxProps {
  label?: string;
  hint?: string;
  error?: string;
  placeholder?: string;
  emptyLabel?: string;
  value: string;
  options: ComboboxOption[];
  onChange: (value: string) => void;
  wrapperClassName?: string;
}

/** Remove acentos para que "jose" encontre "José". */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Seletor com busca. Um `<select>` nativo funciona para meia dúzia de opções;
 * com uma centena de colaboradores, achar alguém vira rolagem cega — daí a
 * busca por nome, com navegação por teclado.
 */
export function Combobox({
  label,
  hint,
  error,
  placeholder = 'Buscar…',
  emptyLabel,
  value,
  options,
  onChange,
  wrapperClassName,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const selected = options.find((option) => option.value === value);

  const filtered = useMemo(() => {
    const needle = fold(query.trim());
    const pool = emptyLabel
      ? [{ value: '', label: emptyLabel } as ComboboxOption, ...options]
      : options;
    if (!needle) return pool;
    return pool.filter((option) => fold(`${option.label} ${option.hint ?? ''}`).includes(needle));
  }, [options, query, emptyLabel]);

  /* fecha ao clicar fora */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(Math.max(0, filtered.findIndex((option) => option.value === value)));
      requestAnimationFrame(() => input.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, [open]);

  /** Mantém a opção destacada visível durante a navegação por teclado. */
  useEffect(() => {
    if (!open) return;
    list.current?.querySelectorAll('li')[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (option: ComboboxOption) => {
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + filtered.length) % Math.max(filtered.length, 1));
      return;
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      const option = filtered[active];
      if (option) choose(option);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <FieldShell label={label} hint={hint} error={error} className={wrapperClassName}>
      {(id) => (
        <div ref={container} className="relative" onKeyDown={onKeyDown}>
          <button
            type="button"
            id={id}
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            className={cn(
              'flex h-12 w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-ink-900/70 px-4 text-left text-[0.92rem] transition-all duration-200',
              'hover:border-white/20 focus:border-gold-400/70 focus:outline-none focus:ring-4 focus:ring-gold-400/12',
              open && 'border-gold-400/70 ring-4 ring-gold-400/12',
              error && 'border-red-400/60',
            )}
          >
            <span className={cn('truncate', selected ? 'text-bone-50' : 'text-ink-300/70')}>
              {selected ? selected.label : (emptyLabel ?? placeholder)}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {selected && emptyLabel ? (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="Limpar seleção"
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange('');
                  }}
                  className="grid h-5 w-5 place-items-center rounded-full text-bone-100/40 transition-colors hover:bg-white/10 hover:text-bone-100"
                >
                  <IconX width={11} height={11} />
                </span>
              ) : null}
              <svg aria-hidden viewBox="0 0 12 8" className="h-2 w-3 text-gold-400">
                <path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </span>
          </button>

          {open ? (
            <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-ink-900 shadow-card-dark">
              <div className="flex items-center gap-2 border-b border-white/[0.07] px-3.5">
                <IconSearch width={15} height={15} className="shrink-0 text-ink-300" />
                <input
                  ref={input}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(0);
                  }}
                  placeholder={placeholder}
                  className="h-11 w-full bg-transparent text-[0.88rem] text-bone-50 placeholder:text-ink-300/60 focus:outline-none"
                />
                {filtered.length ? (
                  <span className="shrink-0 text-[0.68rem] tabular text-bone-100/30">
                    {filtered.length}
                  </span>
                ) : null}
              </div>

              <ul ref={list} role="listbox" className="max-h-64 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <li className="px-4 py-6 text-center text-[0.82rem] text-bone-100/35">
                    Ninguém encontrado com “{query}”.
                  </li>
                ) : (
                  filtered.map((option, index) => (
                    <li
                      key={option.value || '__empty'}
                      role="option"
                      aria-selected={option.value === value}
                      onPointerEnter={() => setActive(index)}
                      onClick={() => choose(option)}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 px-4 py-2.5 text-[0.86rem] transition-colors',
                        index === active ? 'bg-white/[0.07] text-bone-50' : 'text-bone-100/70',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{option.label}</span>
                        {option.hint ? (
                          <span className="block truncate text-[0.72rem] text-bone-100/35">
                            {option.hint}
                          </span>
                        ) : null}
                      </span>
                      {option.badge ? (
                        <span className="shrink-0 rounded-full border border-gold-400/30 bg-gold-400/10 px-2 py-0.5 text-[0.62rem] uppercase tracking-wider text-gold-200">
                          {option.badge}
                        </span>
                      ) : null}
                      {option.value === value ? (
                        <IconCheck width={14} height={14} className="shrink-0 text-gold-300" />
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </FieldShell>
  );
}
