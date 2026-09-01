import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { IconPlus, IconTrash } from '@/components/icons';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal } from '@/components/ui/Reveal';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { quantityLabel } from '@/lib/format';
import type { CustomFieldDef, Material, MaterialVariant, VariantType } from '@/types/domain';

/* -------------------------------------------------------------- presets */

const UNIT_SUGGESTIONS = ['unidade', 'par', 'dezena', 'caixa', 'kit', 'metro', 'litro'];
const AXIS_SUGGESTIONS = ['Tamanho', 'Numeração', 'Cor', 'Voltagem', 'Capacidade', 'Unidade'];
const LETTER_PRESET = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];
const SHOE_PRESET = ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44'];

interface FormState {
  name: string;
  category: string;
  brand: string;
  model: string;
  conservationDefault: string;
  variantLabel: string;
  variantType: VariantType;
  variants: MaterialVariant[];
  customFields: CustomFieldDef[];
  unit: string;
  notes: string;
  active: boolean;
}

const EMPTY: FormState = {
  name: '',
  category: 'Fardamento',
  brand: '',
  model: '',
  conservationDefault: 'Novo',
  variantLabel: 'Tamanho',
  variantType: 'letter',
  variants: [{ key: '', stock: 0 }],
  customFields: [],
  unit: 'unidade',
  notes: '',
  active: true,
};

/* ------------------------------------------------------------- seção */

function Section({
  index,
  title,
  description,
  children,
}: {
  index: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Reveal>
      <section className="surface-dark overflow-hidden">
        <header className="flex items-start gap-4 border-b border-white/[0.06] px-6 py-5 sm:px-8">
          <span className="font-display text-2xl font-light leading-none text-gold-400/40">
            {index}
          </span>
          <div>
            <h2 className="font-display text-xl font-medium text-bone-50">{title}</h2>
            {description ? (
              <p className="mt-1 text-[0.8rem] leading-relaxed text-bone-100/40">{description}</p>
            ) : null}
          </div>
        </header>
        <div className="px-6 py-6 sm:px-8">{children}</div>
      </section>
    </Reveal>
  );
}

/* ----------------------------------------------------------------- página */

export default function MaterialEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const editing = Boolean(id);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  /** Variantes que já existiam ao abrir: o saldo delas só muda por movimento. */
  const [lockedKeys, setLockedKeys] = useState<Set<string>>(new Set());
  /** Desligado = item contado por um número só (crachá, kit). */
  const [hasVariants, setHasVariants] = useState(true);

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      try {
        const response = await api.get<{ material: Material }>(`/api/materials/${id}`);
        if (!active) return;
        const material = response.material;
        setLockedKeys(new Set(material.variants.map((variant) => variant.key)));
        setHasVariants(!(material.variants.length === 1 && !material.variants[0].key));
        setForm({
          name: material.name,
          category: material.category,
          brand: material.brand,
          model: material.model,
          conservationDefault: material.conservationDefault,
          variantLabel: material.variantLabel,
          variantType: material.variantType,
          variants: material.variants.map((variant) => ({ ...variant })),
          customFields: material.customFields.map((field) => ({ ...field })),
          unit: material.unit,
          notes: material.notes ?? '',
          active: material.active,
        });
      } catch {
        toast.error('Material não encontrado.');
        navigate('/app/materiais', { replace: true });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, navigate, toast]);

  const patch = (values: Partial<FormState>) => setForm((current) => ({ ...current, ...values }));

  // Alternar o modo reescreve as linhas: sem variação existe uma única linha
  // sem nome; com variação, uma linha em branco para preencher.
  const toggleVariants = (enabled: boolean) => {
    setHasVariants(enabled);
    if (enabled) {
      patch({
        variants: form.variants.every((variant) => !variant.key)
          ? [{ key: '', stock: form.variants[0]?.stock ?? 0 }]
          : form.variants,
      });
    } else {
      const total = form.variants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0);
      patch({ variants: [{ key: '', stock: total, minStock: form.variants[0]?.minStock }] });
    }
  };

  const totalStock = useMemo(
    () => form.variants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0),
    [form.variants],
  );

  /* ------------------------------------------------------------ variantes */

  const setVariant = (index: number, values: Partial<MaterialVariant>) =>
    patch({
      variants: form.variants.map((variant, position) =>
        position === index ? { ...variant, ...values } : variant,
      ),
    });

  const addVariants = (keys: string[]) => {
    const existing = new Set(form.variants.map((variant) => variant.key.toLowerCase()));
    const fresh = keys
      .filter((key) => !existing.has(key.toLowerCase()))
      .map((key) => ({ key, stock: 0 }));
    const cleaned = form.variants.filter((variant) => variant.key.trim());
    patch({ variants: [...cleaned, ...fresh] });
  };

  /* ------------------------------------------------------ campos extras */

  const setField = (index: number, values: Partial<CustomFieldDef>) =>
    patch({
      customFields: form.customFields.map((field, position) =>
        position === index ? { ...field, ...values } : field,
      ),
    });

  /* --------------------------------------------------------------- salvar */

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});

    // Sem variação a única linha vale mesmo sem nome — ela *é* o material.
    // Com variação, linhas em branco são descartadas em silêncio.
    const rows = hasVariants
      ? form.variants.filter((variant) => variant.key.trim())
      : form.variants.slice(0, 1).map((variant) => ({ ...variant, key: '' }));

    const payload = {
      ...form,
      notes: form.notes || undefined,
      variants: rows.map((variant) => ({
        key: variant.key.trim(),
        stock: Number(variant.stock) || 0,
        minStock:
          variant.minStock === undefined || variant.minStock === null || Number.isNaN(variant.minStock)
            ? undefined
            : Number(variant.minStock),
      })),
      customFields: form.customFields
        .filter((field) => field.label.trim())
        .map((field) => ({
          ...field,
          label: field.label.trim(),
          options: field.type === 'select' ? (field.options ?? []).filter(Boolean) : undefined,
        })),
    };

    if (!payload.variants.length) {
      setErrors({ variants: 'Dê um nome a ao menos uma variante (PP, 40, Azul…).' });
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await api.put(`/api/materials/${id}`, payload);
        toast.success('Material atualizado', `${payload.name} foi salvo.`);
      } else {
        await api.post('/api/materials', payload);
        toast.success('Material cadastrado', `${payload.name} entrou no catálogo.`);
      }
      navigate('/app/materiais');
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.details ?? {});
        toast.error(error.message);
      } else {
        toast.error('Não foi possível salvar o material.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Catálogo" title="Material" back={{ to: '/app/materiais', label: 'Materiais' }} />
        <SkeletonCard lines={6} />
      </>
    );
  }

  return (
    <form onSubmit={submit}>
      <PageHeader
        eyebrow={editing ? 'Editar material' : 'Novo material'}
        title={form.name || 'Material sem nome'}
        description="Você define como este item varia e em que unidade ele é medido. O sistema se adapta ao seu almoxarifado — não o contrário."
        back={{ to: '/app/materiais', label: 'Materiais' }}
        actions={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => navigate('/app/materiais')}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" loading={saving}>
              {editing ? 'Salvar alterações' : 'Cadastrar material'}
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          {/* ------------------------------------------------ identificação */}
          <Section
            index="01"
            title="Identificação"
            description="Estes dados são copiados automaticamente para o termo de responsabilidade."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Nome do material"
                required
                value={form.name}
                error={errors.name}
                onChange={(event) => patch({ name: event.target.value })}
                placeholder="Camisa, Calça, Tênis, Notebook…"
                wrapperClassName="sm:col-span-2"
              />
              <Input
                label="Categoria"
                value={form.category}
                onChange={(event) => patch({ category: event.target.value })}
                placeholder="Fardamento"
              />
              <Input
                label="Estado de conservação padrão"
                value={form.conservationDefault}
                onChange={(event) => patch({ conservationDefault: event.target.value })}
                placeholder="Novo"
              />
              <Input
                label="Marca"
                value={form.brand}
                onChange={(event) => patch({ brand: event.target.value })}
                placeholder="ACQUA"
              />
              <Input
                label="Modelo"
                value={form.model}
                onChange={(event) => patch({ model: event.target.value })}
                placeholder="Social manga curta"
              />
              <div>
                <Input
                  label="Unidade de medida"
                  required
                  list="unit-suggestions"
                  value={form.unit}
                  error={errors.unit}
                  onChange={(event) => patch({ unit: event.target.value })}
                  placeholder="unidade, par, dezena…"
                  hint="Como este item é contado. Escreva o que quiser — o texto é livre."
                />
                <datalist id="unit-suggestions">
                  {UNIT_SUGGESTIONS.map((unit) => (
                    <option key={unit} value={unit} />
                  ))}
                </datalist>

                {/* Atalhos, não um seletor: sem o rótulo, os chips pareciam
                    opções obrigatórias de um campo que é de texto livre. */}
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[0.68rem] text-bone-100/30">Atalhos:</span>
                  {UNIT_SUGGESTIONS.slice(0, 4).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => patch({ unit })}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[0.68rem] transition-colors',
                        form.unit === unit
                          ? 'border-gold-400/50 bg-gold-400/10 text-gold-200'
                          : 'border-white/[0.09] text-bone-100/40 hover:border-white/20 hover:text-bone-100',
                      )}
                    >
                      {unit}
                    </button>
                  ))}
                </div>

                {/* O efeito da escolha, em vez de só o nome dela. */}
                {form.unit.trim() ? (
                  <p className="mt-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[0.72rem] text-bone-100/45">
                    Uma entrega de 2 aparece no termo como{' '}
                    <strong className="font-semibold text-gold-200">
                      {quantityLabel(2, form.unit)}
                    </strong>
                  </p>
                ) : null}
              </div>
              <div className="sm:col-span-2">
                <Switch
                  label="Material ativo"
                  hint="Materiais inativos somem das novas entregas, mas o histórico continua intacto."
                  checked={form.active}
                  onChange={(active) => patch({ active })}
                />
              </div>
            </div>
          </Section>

          {/* --------------------------------------------------- variações */}
          <Section
            index="02"
            title={hasVariants ? 'Eixo de variação' : 'Quantidade em estoque'}
            description={
              hasVariants
                ? 'O que diferencia uma peça da outra: tamanho, numeração, voltagem… Você dá o nome e cria quantas variantes precisar, cada uma com seu estoque.'
                : 'Este item é contado por um número só — sem tamanho, numeração ou cor.'
            }
          >
            <Switch
              label="Este material tem variações"
              hint="Desligue para itens que não variam, como crachá ou kit: aí basta a quantidade."
              checked={hasVariants}
              onChange={toggleVariants}
            />

            {!hasVariants ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Input
                  label={`Quantidade em estoque (${form.unit || 'unidade'})`}
                  type="number"
                  min={0}
                  value={String(form.variants[0]?.stock ?? 0)}
                  disabled={lockedKeys.has('')}
                  title={
                    lockedKeys.has('')
                      ? 'O saldo muda apenas por movimento auditado — use Ajustar estoque.'
                      : undefined
                  }
                  onChange={(event) =>
                    patch({ variants: [{ ...form.variants[0], key: '', stock: Number(event.target.value) || 0 }] })
                  }
                  hint={
                    lockedKeys.has('')
                      ? 'Use "Ajustar estoque" na lista de materiais para alterar.'
                      : undefined
                  }
                />
                <Input
                  label="Alerta de estoque baixo"
                  type="number"
                  min={0}
                  placeholder="padrão"
                  value={form.variants[0]?.minStock === undefined ? '' : String(form.variants[0].minStock)}
                  onChange={(event) =>
                    patch({
                      variants: [
                        {
                          ...form.variants[0],
                          key: '',
                          minStock: event.target.value === '' ? undefined : Number(event.target.value),
                        },
                      ],
                    })
                  }
                  hint="Em branco usa o limite geral das Configurações."
                />
              </div>
            ) : (
              <>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <Input
                    label="Como este material varia?"
                    list="axis-suggestions"
                    value={form.variantLabel}
                    onChange={(event) => patch({ variantLabel: event.target.value })}
                    placeholder="Tamanho"
                    hint="O nome do que muda de uma peça para outra."
                  />
                  <datalist id="axis-suggestions">
                    {AXIS_SUGGESTIONS.map((axis) => (
                      <option key={axis} value={axis} />
                    ))}
                  </datalist>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[0.68rem] text-bone-100/30">Atalhos:</span>
                    {AXIS_SUGGESTIONS.slice(0, 4).map((axis) => (
                      <button
                        key={axis}
                        type="button"
                        onClick={() => patch({ variantLabel: axis })}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[0.68rem] transition-colors',
                          form.variantLabel === axis
                            ? 'border-gold-400/50 bg-gold-400/10 text-gold-200'
                            : 'border-white/[0.09] text-bone-100/40 hover:border-white/20 hover:text-bone-100',
                        )}
                      >
                        {axis}
                      </button>
                    ))}
                  </div>
                </div>
                <Select
                  label="Tipo de variação"
                  value={form.variantType}
                  onChange={(event) => patch({ variantType: event.target.value as VariantType })}
                  options={[
                    { value: 'letter', label: 'Letras (PP, P, M, G, GG)' },
                    { value: 'number', label: 'Números (35, 40, 45)' },
                    { value: 'custom', label: 'Livre (cor, voltagem, qualquer coisa)' },
                  ]}
                />
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="text-[0.7rem] uppercase tracking-wider text-bone-100/35">
                  Preencher rápido:
                </span>
                <Button type="button" size="sm" variant="ghost" onClick={() => addVariants(LETTER_PRESET)}>
                  PP → XGG
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => addVariants(SHOE_PRESET)}>
                  34 → 44
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => addVariants(['35', '40', '45'])}
                >
                  35 · 40 · 45
                </Button>
              </div>

              <div className="mt-5 space-y-2">
                <div className="hidden grid-cols-[1.4fr_1fr_1fr_auto] gap-3 px-1 text-[0.64rem] font-semibold uppercase tracking-wider text-bone-100/30 sm:grid">
                  <span>{form.variantLabel || 'Variante'}</span>
                  <span>Estoque</span>
                  <span>Mínimo</span>
                  <span />
                </div>

                {form.variants.map((variant, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:border-0 sm:bg-transparent sm:p-0"
                  >
                    <Input
                      placeholder={form.variantType === 'number' ? '40' : 'G'}
                      value={variant.key}
                      onChange={(event) => setVariant(index, { key: event.target.value })}
                    />
                    <Input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={String(variant.stock ?? 0)}
                      disabled={lockedKeys.has(variant.key)}
                      title={
                        lockedKeys.has(variant.key)
                          ? 'O saldo desta variante muda apenas por movimento auditado.'
                          : undefined
                      }
                      onChange={(event) => setVariant(index, { stock: Number(event.target.value) })}
                    />
                    <Input
                      type="number"
                      min={0}
                      placeholder="padrão"
                      value={variant.minStock === undefined ? '' : String(variant.minStock)}
                      onChange={(event) =>
                        setVariant(index, {
                          minStock: event.target.value === '' ? undefined : Number(event.target.value),
                        })
                      }
                    />
                    <button
                      type="button"
                      aria-label="Remover variante"
                      onClick={() =>
                        patch({ variants: form.variants.filter((_, position) => position !== index) })
                      }
                      className="grid h-12 w-12 place-items-center rounded-xl border border-white/[0.07] text-bone-100/35 transition-colors hover:border-red-400/40 hover:text-red-300"
                    >
                      <IconTrash width={16} height={16} />
                    </button>
                  </div>
                ))}
              </div>

              {errors.variants ? (
                <p className="mt-3 text-[0.76rem] text-red-400">{errors.variants}</p>
              ) : null}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                icon={<IconPlus width={14} height={14} />}
                onClick={() => patch({ variants: [...form.variants, { key: '', stock: 0 }] })}
              >
                Adicionar variante
              </Button>

              {editing ? (
                <p className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[0.76rem] leading-relaxed text-bone-100/45">
                  O saldo das variantes já existentes só muda por movimento auditado — use
                  <strong className="text-bone-100/70"> Ajustar estoque</strong> na lista de materiais.
                  Variantes novas entram com o saldo informado aqui.
                </p>
              ) : null}
              </>
            )}
          </Section>

          {/* ---------------------------------------------- campos extras */}
          <Section
            index="03"
            title="Campos personalizados"
            description="Atributos livres que aparecem na entrega e no termo: cor, tecido, voltagem, número de série…"
          >
            {form.customFields.length === 0 ? (
              <p className="text-[0.84rem] text-bone-100/40">
                Nenhum campo extra. Este material usa apenas os dados padrão.
              </p>
            ) : (
              <div className="space-y-3">
                {form.customFields.map((field, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4"
                  >
                    <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto]">
                      <Input
                        label="Rótulo"
                        value={field.label}
                        onChange={(event) => setField(index, { label: event.target.value })}
                        placeholder="Cor"
                      />
                      <Select
                        label="Tipo"
                        value={field.type}
                        onChange={(event) =>
                          setField(index, { type: event.target.value as CustomFieldDef['type'] })
                        }
                        options={[
                          { value: 'text', label: 'Texto' },
                          { value: 'number', label: 'Número' },
                          { value: 'select', label: 'Seleção' },
                        ]}
                      />
                      <button
                        type="button"
                        aria-label="Remover campo"
                        onClick={() =>
                          patch({
                            customFields: form.customFields.filter((_, p) => p !== index),
                          })
                        }
                        className="mt-auto grid h-12 w-12 place-items-center rounded-xl border border-white/[0.07] text-bone-100/35 transition-colors hover:border-red-400/40 hover:text-red-300"
                      >
                        <IconTrash width={16} height={16} />
                      </button>
                    </div>

                    {field.type === 'select' ? (
                      <Input
                        wrapperClassName="mt-3"
                        label="Opções (separadas por vírgula)"
                        value={(field.options ?? []).join(', ')}
                        onChange={(event) =>
                          setField(index, {
                            options: event.target.value.split(',').map((option) => option.trim()),
                          })
                        }
                        placeholder="Branco, Preto, Areia"
                      />
                    ) : (
                      <Input
                        wrapperClassName="mt-3"
                        label="Valor padrão (opcional)"
                        value={field.defaultValue ?? ''}
                        onChange={(event) => setField(index, { defaultValue: event.target.value })}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              icon={<IconPlus width={14} height={14} />}
              onClick={() =>
                patch({ customFields: [...form.customFields, { label: '', type: 'text' }] })
              }
            >
              Adicionar campo
            </Button>
          </Section>

          <Section index="04" title="Observações internas">
            <Textarea
              value={form.notes}
              onChange={(event) => patch({ notes: event.target.value })}
              placeholder="Fornecedor, prazo de reposição, regras internas…"
            />
          </Section>
        </div>

        {/* ---------------------------------------------------------- resumo */}
        <aside className="xl:sticky xl:top-8 xl:self-start">
          <Reveal delay={0.1}>
            <div className="surface-dark frame-gold overflow-hidden p-6">
              <p className="label-eyebrow">Pré-visualização</p>
              <h3 className="mt-3 font-display text-2xl font-medium text-bone-50">
                {form.name || 'Material sem nome'}
              </h3>
              <p className="mt-1 text-[0.8rem] text-bone-100/40">
                {[form.brand, form.model].filter(Boolean).join(' · ') || 'Sem marca/modelo'}
              </p>

              <dl className="mt-6 space-y-3 text-[0.82rem]">
                {[
                  ['Categoria', form.category || '—'],
                  ['Unidade', form.unit || '—'],
                  ...(hasVariants ? [['Eixo', form.variantLabel || '—']] : []),
                  ['Conservação', form.conservationDefault || '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4">
                    <dt className="text-bone-100/35">{label}</dt>
                    <dd className="text-right font-medium text-bone-100/85">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-6 border-t border-white/[0.06] pt-5">
                <p className="text-[0.66rem] uppercase tracking-wider text-bone-100/35">
                  Como aparece no termo
                </p>
                <p className="mt-2 font-display text-lg italic text-gold-200">
                  {form.name || 'Material'}
                  {form.variants[0]?.key
                    ? ` — ${form.variantLabel} ${form.variants[0].key}`
                    : ''}
                </p>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-white/[0.06] pt-5">
                <span className="text-[0.76rem] text-bone-100/40">
                  {hasVariants
                    ? `${form.variants.filter((variant) => variant.key.trim()).length} variantes`
                    : 'Sem variações'}
                </span>
                <Badge tone="gold">{quantityLabel(totalStock, form.unit || 'unidade')} em estoque</Badge>
              </div>
            </div>
          </Reveal>
        </aside>
      </div>
    </form>
  );
}
