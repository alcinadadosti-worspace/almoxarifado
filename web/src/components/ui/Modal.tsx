import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  surface?: 'dark' | 'light';
}

const SIZES = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' };

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  size = 'md',
  surface = 'dark',
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[130] flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
            className="absolute inset-0 bg-ink-950/80 backdrop-blur-md"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.985 }}
            transition={{ type: 'spring', stiffness: 280, damping: 30 }}
            className={cn(
              'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl',
              surface === 'dark'
                ? 'border border-white/10 bg-ink-900/95 text-bone-100'
                : 'border border-ink-900/10 bg-bone-50 text-ink-900',
              SIZES[size],
            )}
          >
            <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-gold-gradient" />

            <header className="flex items-start justify-between gap-4 px-6 pb-4 pt-6 sm:px-8">
              <div>
                {eyebrow ? <p className="label-eyebrow mb-1">{eyebrow}</p> : null}
                <h2 className="font-display text-2xl font-medium leading-tight sm:text-[1.75rem]">
                  {title}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                data-magnetic="soft"
                className={cn(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors',
                  surface === 'dark'
                    ? 'border-white/10 text-bone-100/60 hover:border-white/25 hover:text-bone-50'
                    : 'border-ink-900/10 text-ink-400 hover:border-ink-900/25 hover:text-ink-900',
                )}
              >
                <svg viewBox="0 0 14 14" className="h-3.5 w-3.5">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 sm:px-8">{children}</div>

            {footer ? (
              <footer
                className={cn(
                  'flex flex-wrap items-center justify-end gap-3 border-t px-6 py-4 sm:px-8',
                  surface === 'dark' ? 'border-white/8 bg-ink-950/40' : 'border-ink-900/8 bg-white/60',
                )}
              >
                {footer}
              </footer>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
