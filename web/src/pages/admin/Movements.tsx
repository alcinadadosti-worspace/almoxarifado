import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal } from '@/components/ui/Reveal';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { MOVEMENT_REASON_LABEL, formatDateTime } from '@/lib/format';
import { useResource } from '@/lib/useResource';
import type { StockMovement } from '@/types/domain';

export default function Movements() {
  const { data, loading } = useResource<{ movements: StockMovement[] }>(
    '/api/movements?limit=200',
  );

  return (
    <>
      <PageHeader
        eyebrow="Auditoria"
        title="Movimentações"
        description="Toda unidade que entra ou sai do almoxarifado deixa registro: quem, quando, por quê e o saldo resultante."
      />

      {loading && !data ? (
        <SkeletonRows rows={8} />
      ) : !data?.movements.length ? (
        <EmptyState
          title="Nenhuma movimentação"
          description="Cadastre materiais e registre entregas para começar a trilha de auditoria."
        />
      ) : (
        <div className="surface-dark overflow-hidden">
          <div className="hidden grid-cols-[auto_1.6fr_1fr_1fr_1.2fr] gap-4 border-b border-white/[0.06] px-6 py-3 text-[0.64rem] font-semibold uppercase tracking-wider text-bone-100/30 lg:grid">
            <span className="w-16">Delta</span>
            <span>Material</span>
            <span>Motivo</span>
            <span>Responsável</span>
            <span className="text-right">Data</span>
          </div>

          <ul className="divide-y divide-white/[0.05]">
            {data.movements.map((movement, index) => (
              <Reveal as="li" key={movement.id} delay={Math.min(index * 0.015, 0.2)}>
                <div className="grid grid-cols-[auto_1fr] items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.02] sm:px-6 lg:grid-cols-[auto_1.6fr_1fr_1fr_1.2fr]">
                  <span
                    className={`w-16 shrink-0 text-center font-mono text-[0.9rem] font-semibold ${
                      movement.delta >= 0 ? 'text-acqua-400' : 'text-gold-300'
                    }`}
                  >
                    {movement.delta > 0 ? '+' : ''}
                    {movement.delta}
                  </span>

                  <div className="min-w-0">
                    <p className="truncate text-[0.88rem] font-medium text-bone-50">
                      {movement.materialName}
                      <span className="ml-2 text-[0.76rem] font-normal text-bone-100/40">
                        {movement.variantKey}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[0.72rem] text-bone-100/35 lg:hidden">
                      {MOVEMENT_REASON_LABEL[movement.reason] ?? movement.reason} ·{' '}
                      {formatDateTime(movement.at)}
                    </p>
                    <p className="mt-0.5 hidden text-[0.72rem] text-bone-100/35 lg:block">
                      Saldo após: {movement.stockAfter}
                      {movement.note ? ` · ${movement.note}` : ''}
                    </p>
                  </div>

                  <span className="hidden text-[0.8rem] text-bone-100/60 lg:block">
                    {movement.deliveryId ? (
                      <Link
                        to={`/app/entregas/${movement.deliveryId}`}
                        className="text-gold-300/80 underline-offset-4 hover:text-gold-200 hover:underline"
                      >
                        {MOVEMENT_REASON_LABEL[movement.reason] ?? movement.reason}
                      </Link>
                    ) : (
                      (MOVEMENT_REASON_LABEL[movement.reason] ?? movement.reason)
                    )}
                  </span>

                  <span className="hidden truncate text-[0.8rem] text-bone-100/50 lg:block">
                    {movement.actorName}
                  </span>

                  <span className="hidden text-right text-[0.78rem] tabular text-bone-100/40 lg:block">
                    {formatDateTime(movement.at)}
                  </span>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
