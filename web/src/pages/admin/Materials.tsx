import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconEdit, IconPlus, IconSearch } from '@/components/icons';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { CountUp } from '@/components/ui/CountUp';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal } from '@/components/ui/Reveal';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { TiltCard } from '@/components/ui/TiltCard';
import { useToast } from '@/components/ui/Toast';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { pluralizeUnit } from '@/lib/format';
import { useDebounced, useResource } from '@/lib/useResource';
import type { Material, StockSummary } from '@/types/domain';

interface MaterialsResponse {
  materials: Material[];
  categories: string[];
  summary: StockSummary;
  lowStockThreshold: number;
}

/* ------------------------------------------------------- ajuste de estoque */

function AdjustStockModal({
  material,
  threshold,
  onClose,
  onDone,
}: {
  material: Material | null;
  threshold: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [variantKey, setVariantKey] = useState('');
  const [amount, setAmount] = useState('1');
  const [direction, setDirection] = useState<1 | -1>(1);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Cada material tem suas variantes: sem zerar aqui, a variante escolhida para
  // um material ficava presa e era enviada para o próximo, que não a tem.
  useEffect(() => {
    setVariantKey(material?.variants[0]?.key ?? '');
    setAmount('1');
    setDirection(1);
    setNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reage à troca de material
  }, [material?.id]);

  const variant = material?.variants.find((item) => item.key === (variantKey || material.variants[0]?.key));

  const submit = async () => {
    if (!material) return;
    const key = variantKey || material.variants[0]?.key;
    const delta = direction * Math.abs(Number(amount) || 0);
    if (!key || !delta) {
      toast.error('Informe a variante e a quantidade.');
      return;
    }
    setSaving(true);
    try {
      const response = await api.post<{ warnings?: string[] }>(
        `/api/materials/${material.id}/adjust`,
        { variantKey: key, delta, note },
      );
      if (response.warnings?.length) {
        // saída maior que o saldo: o servidor limitou a zero e explica
        toast.push({ title: 'Ajuste aplicado com limite', description: response.warnings.join(' '), tone: 'gold' });
      } else {
        toast.success(
          'Estoque atualizado',
          `${delta > 0 ? 'Entrada' : 'Saída'} de ${Math.abs(delta)} em ${material.name} (${key}).`,
        );
      }
      onDone();
      onClose();
      setAmount('1');
      setNote('');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Não foi possível ajustar o estoque.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(material)}
      onClose={onClose}
      eyebrow="Movimentação manual"
      title={material ? `Ajustar ${material.name}` : ''}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" loading={saving} onClick={submit}>
            Registrar movimento
          </Button>
        </>
      }
    >
      {material ? (
        <div className="space-y-4 pt-1">
          <Select
            label={material.variantLabel}
            value={variantKey || material.variants[0]?.key || ''}
            onChange={(event) => setVariantKey(event.target.value)}
            options={material.variants.map((item) => ({
              value: item.key,
              label: `${item.key} — ${item.stock} em estoque`,
            }))}
          />

          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <Input
              label="Quantidade"
              type="number"
              min={1}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <div className="flex overflow-hidden rounded-xl border border-white/10">
              {([1, -1] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDirection(value)}
                  className={cn(
                    'h-12 px-4 text-[0.78rem] font-semibold transition-colors',
                    direction === value
                      ? value === 1
                        ? 'bg-acqua-500/20 text-acqua-400'
                        : 'bg-gold-400/15 text-gold-200'
                      : 'text-bone-100/40 hover:text-bone-100',
                  )}
                >
                  {value === 1 ? 'Entrada' : 'Saída'}
                </button>
              ))}
            </div>
          </div>

          <Textarea
            label="Motivo (opcional)"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Compra do fornecedor, perda, correção de inventário…"
          />

          <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[0.78rem] text-bone-100/50">
            Saldo atual:{' '}
            <strong className="text-bone-50">{variant?.stock ?? 0}</strong>{' '}
            {pluralizeUnit(material.unit, variant?.stock ?? 0)} · mínimo{' '}
            {variant?.minStock ?? threshold}
          </p>
        </div>
      ) : null}
    </Modal>
  );
}

/* ----------------------------------------------------------------- página */

function VariantChip({
  variant,
  unit,
  threshold,
}: {
  variant: Material['variants'][number];
  unit: string;
  threshold: number;
}) {
  const limit = variant.minStock ?? threshold;
  const tone =
    variant.stock === 0
      ? 'border-red-400/35 bg-red-500/[0.08] text-red-300'
      : variant.stock <= limit
        ? 'border-gold-400/35 bg-gold-400/[0.08] text-gold-200'
        : 'border-white/[0.09] bg-white/[0.03] text-bone-100/75';

  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.74rem]',
        tone,
      )}
      title={`${variant.stock} ${pluralizeUnit(unit, variant.stock)}`}
    >
      <span className="font-semibold">{variant.key}</span>
      <span className="tabular opacity-60">{variant.stock}</span>
    </span>
  );
}

export default function Materials() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [adjusting, setAdjusting] = useState<Material | null>(null);
  const debounced = useDebounced(search);

  const query = new URLSearchParams();
  if (debounced) query.set('search', debounced);
  if (category) query.set('category', category);
  const { data, loading, reload } = useResource<MaterialsResponse>(
    `/api/materials?${query.toString()}`,
  );

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Materiais"
        description="Cada material define o próprio eixo de variação, a unidade de medida e os campos extras que fizerem sentido."
        actions={
          <ButtonLink to="/app/materiais/novo" size="sm" icon={<IconPlus width={15} height={15} />}>
            Novo material
          </ButtonLink>
        }
      />

      <div className="mb-7 flex flex-wrap items-end gap-3">
        <Input
          wrapperClassName="min-w-[240px] flex-1"
          placeholder="Buscar por nome, marca ou modelo…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          icon={<IconSearch width={15} height={15} />}
        />
        {data?.categories.length ? (
          <Select
            wrapperClassName="min-w-[190px]"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            options={[
              { value: '', label: 'Todas as categorias' },
              ...data.categories.map((item) => ({ value: item, label: item })),
            ]}
          />
        ) : null}
      </div>

      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : !data?.materials.length ? (
        <EmptyState
          title="Nenhum material encontrado"
          description={
            search || category
              ? 'Ajuste a busca ou limpe os filtros.'
              : 'Cadastre o primeiro material — camisa, calça, tênis, o que for.'
          }
          action={
            <ButtonLink to="/app/materiais/novo" size="sm">
              Cadastrar material
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.materials.map((material, index) => (
            <Reveal key={material.id} delay={Math.min(index * 0.05, 0.3)}>
              <TiltCard className="h-full">
                <article className="surface-dark flex h-full flex-col overflow-hidden p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="label-eyebrow">{material.category || 'Sem categoria'}</p>
                      <h3 className="mt-2 truncate font-display text-2xl font-medium text-bone-50">
                        {material.name}
                      </h3>
                      <p className="mt-1 truncate text-[0.78rem] text-bone-100/40">
                        {[material.brand, material.model].filter(Boolean).join(' · ') ||
                          'Sem marca/modelo'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-3xl font-light leading-none text-gold-200">
                        <CountUp value={material.totalStock ?? 0} />
                      </p>
                      <p className="mt-1 text-[0.66rem] uppercase tracking-wider text-bone-100/35">
                        {pluralizeUnit(material.unit, material.totalStock ?? 0)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <p className="mb-2 text-[0.66rem] font-semibold uppercase tracking-wider text-bone-100/35">
                      {material.variantLabel}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {material.variants.map((variant) => (
                        <VariantChip
                          key={variant.key}
                          variant={variant}
                          unit={material.unit}
                          threshold={data.lowStockThreshold}
                        />
                      ))}
                    </div>
                  </div>

                  {material.customFields.length ? (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {material.customFields.map((field) => (
                        <Badge key={field.label} tone="muted">
                          {field.label}
                        </Badge>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-auto flex items-center gap-2 pt-6">
                    <Button size="sm" variant="outline" onClick={() => setAdjusting(material)}>
                      Ajustar estoque
                    </Button>
                    <Link
                      to={`/app/materiais/${material.id}`}
                      data-magnetic="soft"
                      className="ml-auto inline-flex items-center gap-1.5 text-[0.74rem] font-semibold uppercase tracking-wider text-bone-100/40 transition-colors hover:text-gold-300"
                    >
                      <IconEdit width={14} height={14} />
                      Editar
                    </Link>
                  </div>
                </article>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      )}

      <AdjustStockModal
        material={adjusting}
        threshold={data?.lowStockThreshold ?? 5}
        onClose={() => setAdjusting(null)}
        onDone={reload}
      />
    </>
  );
}
