import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { IconCheck, IconPlus, IconSend, IconSlack, IconTrash } from '@/components/icons';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal } from '@/components/ui/Reveal';
import { useToast } from '@/components/ui/Toast';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { pluralizeUnit, quantityLabel } from '@/lib/format';
import { useResource } from '@/lib/useResource';
import type { DeliveryDto, Employee, Material, NotificationStatus } from '@/types/domain';

interface Draft {
  materialId: string;
  variantKey: string;
  quantity: number;
  conservation: string;
  customValues: Record<string, string>;
}

interface CreateResponse {
  delivery: DeliveryDto;
  acceptUrl: string;
  notification: { ok: boolean; channel?: string; reason?: string };
}

export default function DeliveryNew() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();

  const { data: catalog } = useResource<{ materials: Material[] }>('/api/materials');
  const { data: people } = useResource<{ employees: Employee[] }>('/api/employees');
  const { data: settings } = useResource<{ notifications: NotificationStatus }>('/api/settings');

  const [employeeId, setEmployeeId] = useState(params.get('employee') ?? '');
  const [draftName, setDraftName] = useState('');
  const [draftRole, setDraftRole] = useState('');
  const [draftSector, setDraftSector] = useState('');
  const [slackTarget, setSlackTarget] = useState('');
  const [notes, setNotes] = useState('');
  const [sendNow, setSendNow] = useState(true);
  const [items, setItems] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreateResponse | null>(null);

  /* -------------------------------------------------- seletor de item */
  const [pickMaterial, setPickMaterial] = useState('');
  const [pickVariant, setPickVariant] = useState('');
  const [pickQuantity, setPickQuantity] = useState('1');
  const [pickCustom, setPickCustom] = useState<Record<string, string>>({});

  const materials = catalog?.materials ?? [];
  const material = materials.find((item) => item.id === pickMaterial);
  const slackAvailable = settings?.notifications.available ?? false;

  useEffect(() => {
    if (!material) {
      setPickVariant('');
      setPickCustom({});
      return;
    }
    setPickVariant(material.variants.find((variant) => variant.stock > 0)?.key ?? material.variants[0]?.key ?? '');
    setPickCustom(
      Object.fromEntries(
        material.customFields.map((field) => [
          field.label,
          field.defaultValue ?? (field.type === 'select' ? (field.options?.[0] ?? '') : ''),
        ]),
      ),
    );
  }, [material]);

  const selectedEmployee = people?.employees.find((employee) => employee.id === employeeId);

  const addItem = () => {
    if (!material || !pickVariant) {
      toast.error('Escolha o material e a variante.');
      return;
    }
    const quantity = Math.max(1, Number(pickQuantity) || 1);
    const variant = material.variants.find((item) => item.key === pickVariant);
    if (variant && variant.stock < quantity) {
      toast.error(
        'Estoque insuficiente',
        `${material.name} (${pickVariant}) tem apenas ${variant.stock} disponível.`,
      );
      return;
    }
    if (items.some((item) => item.materialId === material.id && item.variantKey === pickVariant)) {
      toast.error('Item já adicionado', 'Some as quantidades em uma única linha.');
      return;
    }

    setItems([
      ...items,
      {
        materialId: material.id,
        variantKey: pickVariant,
        quantity,
        conservation: material.conservationDefault,
        customValues: { ...pickCustom },
      },
    ]);
    setPickQuantity('1');
  };

  const resolved = useMemo(
    () =>
      items.map((item) => {
        const source = materials.find((entry) => entry.id === item.materialId);
        return { draft: item, material: source };
      }),
    [items, materials],
  );

  const submit = async () => {
    if (!items.length) {
      toast.error('Adicione ao menos um item.');
      return;
    }
    if (!employeeId && !draftName.trim()) {
      toast.error('Escolha um colaborador ou informe o nome do destinatário.');
      return;
    }

    setSaving(true);
    try {
      const response = await api.post<CreateResponse>('/api/deliveries', {
        employeeId: employeeId || undefined,
        employeeDraft: employeeId
          ? { slackUserId: slackTarget || undefined }
          : {
              fullName: draftName.trim(),
              role: draftRole.trim(),
              sector: draftSector.trim(),
              slackUserId: slackTarget || undefined,
              cpf: '',
            },
        items: items.map((item) => ({
          materialId: item.materialId,
          variantKey: item.variantKey,
          quantity: item.quantity,
          conservation: item.conservation,
          customValues: item.customValues,
        })),
        notes: notes || undefined,
        sendNow,
        slackTarget: slackTarget || undefined,
      });
      setCreated(response);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Não foi possível criar a entrega.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Nova entrega"
        title="Montar termo de responsabilidade"
        description="Você preenche os materiais; o colaborador só confirma os dados dele e assina."
        back={{ to: '/app/entregas', label: 'Entregas' }}
      />

      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-5">
          {/* ------------------------------------------------ destinatário */}
          <Reveal>
            <section className="surface-dark p-6 sm:p-8">
              <div className="flex items-baseline gap-3">
                <span className="font-display text-2xl font-light text-gold-400/40">01</span>
                <h2 className="font-display text-xl font-medium text-bone-50">Destinatário</h2>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Select
                  wrapperClassName="sm:col-span-2"
                  label="Colaborador cadastrado"
                  value={employeeId}
                  onChange={(event) => setEmployeeId(event.target.value)}
                  options={[
                    { value: '', label: '— Enviar sem cadastro prévio —' },
                    ...(people?.employees ?? []).map((employee) => ({
                      value: employee.id,
                      label: `${employee.fullName} · ${employee.sector}`,
                    })),
                  ]}
                />

                {employeeId ? (
                  <div className="sm:col-span-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5">
                    <p className="text-[0.86rem] font-semibold text-bone-50">
                      {selectedEmployee?.fullName}
                    </p>
                    <p className="mt-1 text-[0.76rem] text-bone-100/45">
                      {selectedEmployee?.role} · {selectedEmployee?.sector} ·{' '}
                      {selectedEmployee?.cpfMasked}
                    </p>
                    <p className="mt-2 text-[0.72rem] text-bone-100/35">
                      Os dados já vão pré-preenchidos na página de assinatura — o colaborador
                      apenas confirma.
                    </p>
                  </div>
                ) : (
                  <>
                    <Input
                      wrapperClassName="sm:col-span-2"
                      label="Nome do destinatário"
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      placeholder="Como aparece no card do Slack"
                    />
                    <Input
                      label="Cargo/Função (opcional)"
                      value={draftRole}
                      onChange={(event) => setDraftRole(event.target.value)}
                    />
                    <Input
                      label="Setor/Unidade (opcional)"
                      value={draftSector}
                      onChange={(event) => setDraftSector(event.target.value)}
                    />
                  </>
                )}

                <Input
                  wrapperClassName="sm:col-span-2"
                  label="Usuário ou canal do Slack (opcional)"
                  value={slackTarget}
                  onChange={(event) => setSlackTarget(event.target.value)}
                  placeholder={selectedEmployee?.slackUserId || 'U01ABCDEF ou C01ABCDEF'}
                  hint={
                    slackAvailable
                      ? 'Deixe em branco para usar o Slack cadastrado no colaborador.'
                      : 'Slack não configurado — a entrega gera um link para você copiar.'
                  }
                />
              </div>
            </section>
          </Reveal>

          {/* -------------------------------------------------------- itens */}
          <Reveal delay={0.08}>
            <section className="surface-dark p-6 sm:p-8">
              <div className="flex items-baseline gap-3">
                <span className="font-display text-2xl font-light text-gold-400/40">02</span>
                <h2 className="font-display text-xl font-medium text-bone-50">Materiais</h2>
              </div>

              <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.015] p-4 sm:p-5">
                <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr_.7fr_auto]">
                  <Select
                    label="Material"
                    value={pickMaterial}
                    onChange={(event) => setPickMaterial(event.target.value)}
                    placeholder="Selecione…"
                    options={materials.map((entry) => ({
                      value: entry.id,
                      label: `${entry.name}${entry.brand ? ` · ${entry.brand}` : ''}`,
                    }))}
                  />
                  <Select
                    label={material?.variantLabel ?? 'Variante'}
                    value={pickVariant}
                    disabled={!material}
                    onChange={(event) => setPickVariant(event.target.value)}
                    options={(material?.variants ?? []).map((variant) => ({
                      value: variant.key,
                      label: `${variant.key} — ${variant.stock} disp.`,
                      disabled: variant.stock === 0,
                    }))}
                  />
                  <Input
                    label="Qtd."
                    type="number"
                    min={1}
                    value={pickQuantity}
                    onChange={(event) => setPickQuantity(event.target.value)}
                  />
                  <Button
                    type="button"
                    size="md"
                    className="mt-auto h-12"
                    icon={<IconPlus width={15} height={15} />}
                    onClick={addItem}
                  >
                    Adicionar
                  </Button>
                </div>

                {material?.customFields.length ? (
                  <div className="mt-4 grid gap-3 border-t border-white/[0.06] pt-4 sm:grid-cols-2">
                    {material.customFields.map((field) =>
                      field.type === 'select' ? (
                        <Select
                          key={field.label}
                          label={field.label}
                          value={pickCustom[field.label] ?? ''}
                          onChange={(event) =>
                            setPickCustom({ ...pickCustom, [field.label]: event.target.value })
                          }
                          options={(field.options ?? []).map((option) => ({
                            value: option,
                            label: option,
                          }))}
                        />
                      ) : (
                        <Input
                          key={field.label}
                          label={field.label}
                          type={field.type === 'number' ? 'number' : 'text'}
                          value={pickCustom[field.label] ?? ''}
                          onChange={(event) =>
                            setPickCustom({ ...pickCustom, [field.label]: event.target.value })
                          }
                        />
                      ),
                    )}
                  </div>
                ) : null}

                {material ? (
                  <p className="mt-3 text-[0.74rem] text-bone-100/35">
                    Medido em <strong className="text-bone-100/60">{material.unit}</strong> ·
                    conservação padrão{' '}
                    <strong className="text-bone-100/60">{material.conservationDefault}</strong>
                  </p>
                ) : null}
              </div>

              {/* itens adicionados */}
              <div className="mt-5 space-y-2.5">
                {resolved.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 px-5 py-8 text-center text-[0.84rem] text-bone-100/35">
                    Nenhum item adicionado ainda.
                  </p>
                ) : (
                  resolved.map(({ draft, material: source }, index) => (
                    <div
                      key={`${draft.materialId}-${draft.variantKey}`}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gold-400/10 font-mono text-[0.72rem] text-gold-200">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.88rem] font-semibold text-bone-50">
                          {source?.name} — {source?.variantLabel} {draft.variantKey}
                        </p>
                        <p className="mt-0.5 truncate text-[0.74rem] text-bone-100/40">
                          {[source?.brand, source?.model].filter(Boolean).join(' / ') || 'Sem marca'}
                          {Object.entries(draft.customValues)
                            .filter(([, value]) => value)
                            .map(([label, value]) => ` · ${label}: ${value}`)
                            .join('')}
                        </p>
                      </div>

                      <Input
                        wrapperClassName="w-24"
                        type="number"
                        min={1}
                        value={String(draft.quantity)}
                        onChange={(event) =>
                          setItems(
                            items.map((entry, position) =>
                              position === index
                                ? { ...entry, quantity: Math.max(1, Number(event.target.value) || 1) }
                                : entry,
                            ),
                          )
                        }
                      />
                      <Badge tone="muted">{pluralizeUnit(source?.unit ?? 'unidade', draft.quantity)}</Badge>
                      <Input
                        wrapperClassName="w-40"
                        value={draft.conservation}
                        onChange={(event) =>
                          setItems(
                            items.map((entry, position) =>
                              position === index
                                ? { ...entry, conservation: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        aria-label="Remover item"
                        onClick={() => setItems(items.filter((_, position) => position !== index))}
                        className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.07] text-bone-100/35 transition-colors hover:border-red-400/40 hover:text-red-300"
                      >
                        <IconTrash width={16} height={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </Reveal>

          <Reveal delay={0.14}>
            <section className="surface-dark p-6 sm:p-8">
              <div className="flex items-baseline gap-3">
                <span className="font-display text-2xl font-light text-gold-400/40">03</span>
                <h2 className="font-display text-xl font-medium text-bone-50">Observações</h2>
              </div>
              <Textarea
                wrapperClassName="mt-5"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Anotação interna sobre esta entrega (não aparece no termo)."
              />
            </section>
          </Reveal>
        </div>

        {/* ------------------------------------------------------- resumo */}
        <aside className="xl:sticky xl:top-8 xl:self-start">
          <Reveal delay={0.1}>
            <div className="surface-dark frame-gold overflow-hidden">
              <div className="border-b border-white/[0.06] px-6 py-5">
                <p className="label-eyebrow">Como vai aparecer no termo</p>
              </div>

              <div className="px-6 py-5">
                <p className="text-[0.8rem] text-bone-100/45">
                  {selectedEmployee?.fullName || draftName || 'Colaborador(a)'} receberá:
                </p>

                <ul className="mt-4 space-y-3">
                  {resolved.length === 0 ? (
                    <li className="text-[0.82rem] text-bone-100/30">Nenhum item ainda.</li>
                  ) : (
                    resolved.map(({ draft, material: source }, index) => (
                      <li key={index} className="flex gap-3 text-[0.84rem]">
                        <span className="font-mono text-[0.7rem] text-gold-400/60">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="flex-1 text-bone-100/80">
                          <span className="font-display text-[0.98rem] italic text-gold-200">
                            {source?.name} — {source?.variantLabel} {draft.variantKey}
                          </span>
                          <br />
                          <span className="text-[0.76rem] text-bone-100/40">
                            {quantityLabel(draft.quantity, source?.unit ?? 'unidade')} ·{' '}
                            {draft.conservation}
                          </span>
                        </span>
                      </li>
                    ))
                  )}
                </ul>

                <div className="mt-6 border-t border-white/[0.06] pt-5">
                  <Switch
                    label={slackAvailable ? 'Enviar pelo Slack agora' : 'Marcar como enviada'}
                    hint={
                      slackAvailable
                        ? 'O bot manda uma DM com o resumo e o botão de assinar.'
                        : 'Sem Slack, você copia o link na próxima tela.'
                    }
                    checked={sendNow}
                    onChange={setSendNow}
                  />
                </div>

                <Button
                  full
                  size="lg"
                  className="mt-5"
                  loading={saving}
                  onClick={submit}
                  icon={<IconSend width={16} height={16} />}
                >
                  {sendNow ? 'Criar e enviar' : 'Criar entrega'}
                </Button>

                <p className="mt-4 text-center text-[0.7rem] leading-relaxed text-bone-100/30">
                  A baixa no estoque acontece quando o colaborador assinar.
                </p>
              </div>
            </div>
          </Reveal>
        </aside>
      </div>

      {/* -------------------------------------------------- entrega criada */}
      <Modal
        open={Boolean(created)}
        onClose={() => navigate(`/app/entregas/${created?.delivery.id}`)}
        eyebrow="Entrega criada"
        title="Link de assinatura pronto"
        size="sm"
        footer={
          <>
            <ButtonLink to="/app/entregas/nova" variant="ghost" size="sm">
              Criar outra
            </ButtonLink>
            <Button size="sm" onClick={() => navigate(`/app/entregas/${created?.delivery.id}`)}>
              Ver entrega
            </Button>
          </>
        }
      >
        {created ? (
          <div className="pt-1">
            <div
              className={cn(
                'flex items-start gap-3 rounded-xl border px-4 py-3.5',
                created.notification.ok
                  ? 'border-acqua-400/30 bg-acqua-400/[0.07]'
                  : 'border-gold-400/25 bg-gold-400/[0.05]',
              )}
            >
              {created.notification.ok ? (
                <IconCheck className="mt-0.5 shrink-0 text-acqua-400" width={16} height={16} />
              ) : (
                <IconSlack className="mt-0.5 shrink-0 text-gold-300" width={16} height={16} />
              )}
              <p className="text-[0.82rem] leading-relaxed text-bone-100/70">
                {created.notification.ok
                  ? 'Mensagem enviada no Slack com o card do termo e o botão de assinar.'
                  : 'O Slack não enviou a mensagem — copie o link abaixo e envie pelo canal que preferir.'}
              </p>
            </div>

            <p className="mt-5 break-all rounded-xl border border-white/[0.07] bg-ink-950/60 px-4 py-3 font-mono text-[0.74rem] text-gold-200/90">
              {created.acceptUrl}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <CopyButton value={created.acceptUrl} size="sm" />
              <ButtonLink to={created.acceptUrl} target="_blank" rel="noreferrer" size="sm" variant="outline">
                Abrir página
              </ButtonLink>
            </div>

            <p className="mt-5 text-[0.72rem] leading-relaxed text-bone-100/35">
              O link é pessoal, de uso único e expira automaticamente. Depois de assinado, ele
              vira somente leitura.
            </p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
