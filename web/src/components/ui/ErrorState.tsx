import { MonogramMark } from '@/components/brand/MonogramMark';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

interface ErrorStateProps {
  error?: ApiError | null;
  /** Assunto do que não pôde ser carregado: "a entrega", "o material"… */
  subject?: string;
  onRetry?: () => void;
  backTo?: { to: string; label: string };
  className?: string;
}

/**
 * O que aparece quando os dados não vieram.
 *
 * Existe porque devolver `null` deixava a tela em branco: quem clicava num
 * link antigo — de uma entrega já removida, por exemplo — ficava olhando para
 * o nada, sem saber se era erro, permissão ou carregamento travado.
 */
export function ErrorState({ error, subject = 'o conteúdo', onRetry, backTo, className }: ErrorStateProps) {
  const status = error?.status ?? 0;

  const { title, description } =
    status === 404
      ? {
          title: 'Não encontramos este registro',
          // Frase neutra de propósito: `subject` pode ser masculino ou feminino.
          description: `Talvez ${subject} não exista mais, ou o link esteja desatualizado. Se você chegou por uma mensagem antiga, peça um link novo.`,
        }
      : status === 403
        ? {
            title: 'Sem acesso a este registro',
            description: 'Sua conta não tem permissão para ver isto. Fale com quem administra o almoxarifado.',
          }
        : status === 401
          ? {
              title: 'Sua sessão expirou',
              description: 'Entre novamente para continuar.',
            }
          : {
              title: 'Não foi possível carregar',
              description:
                error?.message ??
                `Houve uma falha ao buscar ${subject}. Verifique sua conexão e tente de novo.`,
            };

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-8 py-20 text-center',
        className,
      )}
    >
      <MonogramMark className="h-12 w-12 opacity-25" />
      <h2 className="mt-6 font-display text-2xl font-light text-bone-50">{title}</h2>
      <p className="mt-3 max-w-md text-[0.86rem] leading-relaxed text-bone-100/45">{description}</p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
        {status === 401 ? (
          <ButtonLink to="/login" size="sm">
            Entrar novamente
          </ButtonLink>
        ) : null}
        {onRetry && status !== 401 ? (
          <Button size="sm" onClick={onRetry}>
            Tentar de novo
          </Button>
        ) : null}
        {backTo ? (
          <ButtonLink to={backTo.to} size="sm" variant="outline">
            {backTo.label}
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}
