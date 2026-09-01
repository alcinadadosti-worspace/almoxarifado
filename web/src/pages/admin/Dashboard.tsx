import { Link } from 'react-router-dom';
import { IconAlert, IconPlus, IconSignature, IconSlack } from '@/components/icons';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { CountUp } from '@/components/ui/CountUp';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal } from '@/components/ui/Reveal';
import { SkeletonCard, SkeletonRows } from '@/components/ui/Skeleton';
import { TiltCard } from '@/components/ui/TiltCard';
import { MOVEMENT_REASON_LABEL, formatRelative } from '@/lib/format';
import { useResource } from '@/lib/useResource';
import type { DashboardData } from '@/types/domain';

function StatCard({
  label,
  value,
  suffix,
  hint,
  accent,
}: {
  label: string;
  value: number;
  suffix?: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <TiltCard className="h-full">
      <div className="surface-dark frame-gold h-full overflow-hidden p-6">
        {accent ? (
          <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-gold-gradient" />
        ) : null}
        <p className="label-eyebrow">{label}</p>
        <p className="mt-4 font-display text-[2.9rem] font-light leading-none text-bone-50">
          <CountUp value={value} suffix={suffix} />
        </p>
        {hint ? <p className="mt-3 text-[0.76rem] text-bone-100/40">{hint}</p> : null}
      </div>
    </TiltCard>
  );
}

export default function Dashboard() {
  const { data, loading, error, reload } = useResource<DashboardData>('/api/dashboard');

  if (loading && !data) {
    return (
      <>
        <PageHeader eyebrow="Painel" title="Estoque" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonCard key={index} lines={1} />
          ))}
        </div>
        <div className="mt-8">
          <SkeletonRows rows={4} />
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PageHeader eyebrow="Painel" title="Estoque" />
        <ErrorState error={error} subject="o painel" onRetry={reload} />
      </>
    );
  }

  const { stock, deliveries, employees, movements, notifications } = data;
  const pendingTotal = deliveries.counts.signed_by_employee;

  return (
    <>
      <PageHeader
        eyebrow={data.company.name}
        title="Estoque"
        description="Visão geral do almoxarifado, da fila de assinaturas e das últimas movimentações."
        actions={
          <>
            <ButtonLink to="/app/materiais/novo" variant="outline" size="sm" icon={<IconPlus width={15} height={15} />}>
              Novo material
            </ButtonLink>
            <ButtonLink to="/app/entregas/nova" size="sm" icon={<IconSignature width={15} height={15} />}>
              Nova entrega
            </ButtonLink>
          </>
        }
      />

      {/* ------------------------------------------------------- indicadores */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Reveal>
          <StatCard
            label="Unidades em estoque"
            value={stock.totalUnits}
            hint={`${stock.variantCount} variantes cadastradas`}
            accent
          />
        </Reveal>
        <Reveal delay={0.08}>
          <StatCard label="Materiais ativos" value={stock.materialCount} hint="No catálogo" />
        </Reveal>
        <Reveal delay={0.16}>
          <StatCard
            label="Aguardando assinatura"
            value={deliveries.counts.sent + deliveries.counts.draft}
            hint="Links enviados ao colaborador"
          />
        </Reveal>
        <Reveal delay={0.24}>
          <StatCard
            label="Para contra-assinar"
            value={pendingTotal}
            hint={pendingTotal ? 'Requer o representante da empresa' : 'Fila zerada'}
            accent={pendingTotal > 0}
          />
        </Reveal>
      </div>

      {/* ------------------------------------------------ alerta de integração */}
      {!notifications.available ? (
        <Reveal delay={0.1}>
          <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-gold-400/25 bg-gold-400/[0.05] px-5 py-4">
            <IconSlack className="shrink-0 text-gold-300" />
            <p className="flex-1 text-[0.84rem] leading-relaxed text-bone-100/65">
              O bot do Slack ainda não está configurado. As entregas continuam funcionando —
              o link de assinatura fica disponível para copiar em cada entrega.
            </p>
            <Link
              to="/app/configuracoes"
              className="text-[0.74rem] font-semibold uppercase tracking-wider text-gold-300 transition-colors hover:text-gold-200"
            >
              Configurar
            </Link>
          </div>
        </Reveal>
      ) : null}

      <div className="mt-10 grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        {/* -------------------------------------------- fila de assinaturas */}
        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="label-eyebrow">Fila de assinaturas</p>
              <h2 className="mt-1.5 font-display text-2xl font-light text-bone-50">
                Aguardando você
              </h2>
            </div>
            <Link
              to="/app/entregas"
              className="text-[0.72rem] font-semibold uppercase tracking-wider text-bone-100/40 transition-colors hover:text-gold-300"
            >
              Ver todas
            </Link>
          </div>

          {deliveries.pendingCountersign.length === 0 && deliveries.awaitingEmployee.length === 0 ? (
            <EmptyState
              title="Nada pendente"
              description="Quando um colaborador assinar um termo, ele aparece aqui para a contra-assinatura."
              action={
                <ButtonLink to="/app/entregas/nova" size="sm">
                  Criar entrega
                </ButtonLink>
              }
            />
          ) : (
            <ul className="space-y-2.5">
              {[...deliveries.pendingCountersign, ...deliveries.awaitingEmployee].map(
                (delivery, index) => (
                  <Reveal as="li" key={delivery.id} delay={index * 0.05}>
                    <Link
                      to={`/app/entregas/${delivery.id}`}
                      data-magnetic="soft"
                      className="group flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-ink-850/60 p-4 transition-all duration-400 hover:border-gold-400/30 hover:bg-ink-850"
                    >
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-gold-400/20 bg-gold-400/[0.06] font-display text-lg text-gold-200">
                        {(delivery.employee.fullName || '?').charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.9rem] font-semibold text-bone-50">
                          {delivery.employee.fullName || 'Destinatário a confirmar'}
                        </p>
                        <p className="mt-0.5 truncate text-[0.76rem] text-bone-100/40">
                          {delivery.itemCount} {delivery.itemCount === 1 ? 'item' : 'itens'} ·{' '}
                          {delivery.employee.sector || 'sem setor'} ·{' '}
                          {formatRelative(delivery.updatedAt)}
                        </p>
                      </div>
                      <StatusBadge status={delivery.status} />
                    </Link>
                  </Reveal>
                ),
              )}
            </ul>
          )}
        </section>

        {/* --------------------------------------------------- estoque baixo */}
        <section>
          <div className="mb-4">
            <p className="label-eyebrow">Atenção</p>
            <h2 className="mt-1.5 font-display text-2xl font-light text-bone-50">Estoque baixo</h2>
          </div>

          {stock.alerts.length === 0 ? (
            <div className="surface-dark p-6 text-[0.84rem] text-bone-100/45">
              Nenhuma variante abaixo do mínimo. Estoque saudável.
            </div>
          ) : (
            <ul className="surface-dark divide-y divide-white/[0.05] overflow-hidden">
              {stock.alerts.slice(0, 7).map((alert) => (
                <li key={`${alert.materialId}-${alert.variantKey}`}>
                  <Link
                    to={`/app/materiais/${alert.materialId}`}
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.03]"
                  >
                    <IconAlert
                      width={16}
                      height={16}
                      className={alert.stock === 0 ? 'text-red-400' : 'text-gold-300'}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.84rem] font-medium text-bone-50">
                        {alert.materialName}
                      </p>
                      <p className="text-[0.72rem] text-bone-100/40">
                        {alert.variantLabel} {alert.variantKey} · mínimo {alert.threshold}
                      </p>
                    </div>
                    <Badge tone={alert.stock === 0 ? 'danger' : 'gold'}>
                      {alert.stock} em estoque
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/* ------------------------------------------------ movimentações */}
          <div className="mb-4 mt-10">
            <p className="label-eyebrow">Auditoria</p>
            <h2 className="mt-1.5 font-display text-2xl font-light text-bone-50">
              Últimas movimentações
            </h2>
          </div>

          {movements.length === 0 ? (
            <div className="surface-dark p-6 text-[0.84rem] text-bone-100/45">
              Sem movimentações registradas.
            </div>
          ) : (
            <ol className="relative space-y-4 border-l border-white/[0.07] pl-5">
              {movements.slice(0, 7).map((movement) => (
                <li key={movement.id} className="relative">
                  <span
                    className={`absolute -left-[1.42rem] top-1.5 h-2 w-2 rounded-full ${
                      movement.delta >= 0 ? 'bg-acqua-400' : 'bg-gold-400'
                    }`}
                  />
                  <p className="text-[0.84rem] text-bone-100/85">
                    <span
                      className={`font-mono font-semibold ${
                        movement.delta >= 0 ? 'text-acqua-400' : 'text-gold-300'
                      }`}
                    >
                      {movement.delta > 0 ? '+' : ''}
                      {movement.delta}
                    </span>{' '}
                    {movement.materialName}{' '}
                    <span className="text-bone-100/40">({movement.variantKey})</span>
                  </p>
                  <p className="mt-0.5 text-[0.7rem] text-bone-100/35">
                    {MOVEMENT_REASON_LABEL[movement.reason] ?? movement.reason} ·{' '}
                    {movement.actorName} · {formatRelative(movement.at)}
                  </p>
                </li>
              ))}
            </ol>
          )}

          <p className="mt-6 text-[0.72rem] text-bone-100/30">
            {employees.total} colaborador(es) cadastrado(s) ·{' '}
            <Link to="/app/movimentacoes" className="text-gold-300/70 hover:text-gold-200">
              trilha completa
            </Link>
          </p>
        </section>
      </div>
    </>
  );
}
