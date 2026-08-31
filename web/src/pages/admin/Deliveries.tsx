import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { IconPlus, IconSearch, IconSlack } from '@/components/icons';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal } from '@/components/ui/Reveal';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { STATUS_LABEL, formatDateTime, formatRelative } from '@/lib/format';
import { useDebounced, useResource } from '@/lib/useResource';
import type { DeliveryDto, DeliveryStatus, NotificationStatus } from '@/types/domain';

interface DeliveriesResponse {
  deliveries: DeliveryDto[];
  counts: Record<DeliveryStatus, number>;
  total: number;
  notifications: NotificationStatus;
}

const TABS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todas' },
  { value: 'signed_by_employee', label: 'Para contra-assinar' },
  { value: 'sent', label: 'Aguardando colaborador' },
  { value: 'countersigned', label: 'Concluídas' },
  { value: 'returned', label: 'Devolvidas' },
  { value: 'draft', label: 'Rascunhos' },
];

export default function Deliveries() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);

  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (debounced) query.set('search', debounced);
  const { data, loading } = useResource<DeliveriesResponse>(`/api/deliveries?${query.toString()}`);

  return (
    <>
      <PageHeader
        eyebrow="Fila de assinaturas"
        title="Entregas"
        description="Acompanhe cada termo do rascunho ao arquivo — com o link de aceite sempre à mão."
        actions={
          <ButtonLink to="/app/entregas/nova" size="sm" icon={<IconPlus width={15} height={15} />}>
            Nova entrega
          </ButtonLink>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="no-scrollbar -mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1 py-1">
          {TABS.map((tab) => {
            const active = status === tab.value;
            const count = tab.value
              ? (data?.counts[tab.value as DeliveryStatus] ?? 0)
              : (data?.total ?? 0);
            return (
              <button
                key={tab.value || 'all'}
                type="button"
                onClick={() => {
                  if (tab.value) setParams({ status: tab.value });
                  else setParams({});
                }}
                data-magnetic="soft"
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-[0.78rem] font-medium transition-all duration-300',
                  active
                    ? 'border-gold-400/50 bg-gold-400/10 text-gold-200'
                    : 'border-white/[0.08] text-bone-100/45 hover:border-white/20 hover:text-bone-100',
                )}
              >
                {tab.label}
                {count > 0 ? (
                  <span
                    className={cn(
                      'tabular rounded-full px-1.5 py-0.5 text-[0.66rem]',
                      active ? 'bg-gold-400/20' : 'bg-white/[0.06]',
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <Input
          wrapperClassName="w-full sm:w-72"
          placeholder="Buscar colaborador ou item…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          icon={<IconSearch width={15} height={15} />}
        />
      </div>

      {data && !data.notifications.available ? (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[0.78rem] text-bone-100/50">
          <IconSlack width={15} height={15} className="shrink-0 text-gold-300/70" />
          Slack não configurado — use <strong className="text-bone-100/80">Copiar link</strong> para
          enviar o termo pelo canal que preferir.
        </div>
      ) : null}

      {loading && !data ? (
        <SkeletonRows rows={6} />
      ) : !data?.deliveries.length ? (
        <EmptyState
          title="Nenhuma entrega por aqui"
          description={
            status
              ? 'Nenhum termo neste status no momento.'
              : 'Crie a primeira entrega e envie o termo para assinatura.'
          }
          action={
            <ButtonLink to="/app/entregas/nova" size="sm">
              Nova entrega
            </ButtonLink>
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {data.deliveries.map((delivery, index) => (
            <Reveal as="li" key={delivery.id} delay={Math.min(index * 0.03, 0.25)}>
              <div className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-850/60 transition-all duration-400 hover:border-gold-400/25 hover:bg-ink-850">
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-[2px] origin-top scale-y-0 bg-gold-gradient transition-transform duration-500 ease-premium group-hover:scale-y-100"
                />
                <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
                  <Link
                    to={`/app/entregas/${delivery.id}`}
                    className="flex min-w-0 flex-1 items-center gap-4"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-gold-400/20 bg-gold-400/[0.06] font-display text-lg text-gold-200">
                      {(delivery.employee.fullName || '?').charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[0.92rem] font-semibold text-bone-50">
                        {delivery.employee.fullName || 'Destinatário a confirmar'}
                      </p>
                      <p className="mt-0.5 truncate text-[0.76rem] text-bone-100/40">
                        {delivery.items
                          .slice(0, 3)
                          .map((item) => item.description)
                          .join(' · ')}
                        {delivery.items.length > 3 ? ` +${delivery.items.length - 3}` : ''}
                      </p>
                    </div>
                  </Link>

                  <div className="flex flex-wrap items-center gap-2">
                    {delivery.expired ? <Badge tone="danger">Link expirado</Badge> : null}
                    {delivery.stockWarnings.length ? <Badge tone="gold">Estoque</Badge> : null}
                    <StatusBadge status={delivery.status} />
                    {delivery.status === 'draft' || delivery.status === 'sent' ? (
                      <CopyButton value={delivery.acceptUrl} size="sm" variant="ghost" label="Copiar link" />
                    ) : null}
                  </div>

                  <div className="w-full text-right text-[0.7rem] text-bone-100/30 sm:w-auto">
                    <p title={formatDateTime(delivery.createdAt)}>
                      {STATUS_LABEL[delivery.status]} · {formatRelative(delivery.updatedAt)}
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </ul>
      )}
    </>
  );
}
