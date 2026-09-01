import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { SignaturePad, type SignaturePadHandle } from '@/components/SignaturePad';
import {
  IconAlert,
  IconCheck,
  IconDownload,
  IconReturn,
  IconSend,
} from '@/components/icons';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input, Switch } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal } from '@/components/ui/Reveal';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { formatDateTime, quantityLabel, slackErrorMessage } from '@/lib/format';
import { useResource } from '@/lib/useResource';
import type { AdminProfile, DeliveryDto, NotificationStatus } from '@/types/domain';

interface DetailResponse {
  delivery: DeliveryDto;
  notifications: NotificationStatus;
}

/* ------------------------------------------------------------- timeline */

function Timeline({ delivery }: { delivery: DeliveryDto }) {
  const steps = [
    { label: 'Entrega criada', at: delivery.createdAt, done: true },
    { label: 'Link enviado', at: delivery.sentAt, done: Boolean(delivery.sentAt) },
    {
      label: 'Assinado pelo colaborador',
      at: delivery.employeeSignature?.signedAt,
      done: Boolean(delivery.employeeSignature),
    },
    {
      label: 'Contra-assinado pela empresa',
      at: delivery.adminSignature?.signedAt,
      done: Boolean(delivery.adminSignature),
    },
  ];
  if (delivery.returns.length) {
    steps.push({
      label: 'Devolução registrada',
      at: delivery.returns[delivery.returns.length - 1].at,
      done: true,
    });
  }

  return (
    <ol className="relative space-y-5 border-l border-white/[0.08] pl-6">
      {steps.map((step) => (
        <li key={step.label} className="relative">
          <span
            className={cn(
              'absolute -left-[1.72rem] top-1 grid h-4 w-4 place-items-center rounded-full border',
              step.done
                ? 'border-gold-400/60 bg-gold-400/20 text-gold-200'
                : 'border-white/12 bg-ink-900 text-transparent',
            )}
          >
            {step.done ? <IconCheck width={9} height={9} /> : null}
          </span>
          <p
            className={cn(
              'text-[0.86rem] font-medium',
              step.done ? 'text-bone-50' : 'text-bone-100/30',
            )}
          >
            {step.label}
          </p>
          <p className="mt-0.5 text-[0.72rem] tabular text-bone-100/35">
            {step.at ? formatDateTime(step.at) : 'pendente'}
          </p>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------ contra-assinatura */

function CountersignPanel({
  delivery,
  onDone,
}: {
  delivery: DeliveryDto;
  onDone: (updated: DeliveryDto) => void;
}) {
  const toast = useToast();
  const { admin, refreshProfile } = useAuth();
  const padRef = useRef<SignaturePadHandle>(null);
  const { data: profile } = useResource<AdminProfile>('/api/auth/me');
  const [hasInk, setHasInk] = useState(false);
  const [saveForReuse, setSaveForReuse] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (useSaved: boolean) => {
    const signature = useSaved ? undefined : padRef.current?.toDataUrl();
    if (!useSaved && !signature) {
      toast.error('Assine no quadro antes de confirmar.');
      return;
    }
    setSaving(true);
    try {
      const response = await api.post<{ delivery: DeliveryDto }>(
        `/api/deliveries/${delivery.id}/countersign`,
        { signature, useSaved, saveForReuse },
      );
      toast.success('Termo contra-assinado', 'O PDF final já está disponível.');
      onDone(response.delivery);
      await refreshProfile();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Não foi possível contra-assinar.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="surface-dark overflow-hidden">
      <div className="border-b border-white/[0.06] px-6 py-5">
        <p className="label-eyebrow">Ação necessária</p>
        <h2 className="mt-1.5 font-display text-xl font-medium text-bone-50">
          Assinar como representante da empresa
        </h2>
        <p className="mt-1.5 text-[0.8rem] text-bone-100/45">
          Assinando como <strong className="text-bone-100/80">{profile?.name ?? admin?.name}</strong>.
        </p>
      </div>

      <div className="p-6">
        <SignaturePad
          label="Sua assinatura"
          height={200}
          onChange={setHasInk}
          ref={padRef}
          hint="Use o mouse, o dedo ou uma caneta. A imagem entra no PDF final do termo."
        />

        <div className="mt-4">
          <Switch
            label="Salvar esta assinatura para reutilizar"
            hint="Fica guardada com acesso restrito e pode ser aplicada com um clique nos próximos termos."
            checked={saveForReuse}
            onChange={setSaveForReuse}
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <Button loading={saving} disabled={!hasInk} onClick={() => submit(false)}>
            Confirmar contra-assinatura
          </Button>
          {profile?.hasSavedSignature ? (
            <Button variant="outline" loading={saving} onClick={() => submit(true)}>
              Usar assinatura salva
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- devolução */

function ReturnModal({
  delivery,
  open,
  onClose,
  onDone,
}: {
  delivery: DeliveryDto;
  open: boolean;
  onClose: () => void;
  onDone: (updated: DeliveryDto) => void;
}) {
  const toast = useToast();
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [conservation, setConservation] = useState<Record<number, string>>({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const items = delivery.items
      .map((item) => ({
        itemIndex: item.index,
        quantity: Number(quantities[item.index] ?? 0),
        conservation: conservation[item.index] || 'Bom estado',
      }))
      .filter((entry) => entry.quantity > 0);

    if (!items.length) {
      toast.error('Informe a quantidade devolvida de ao menos um item.');
      return;
    }

    setSaving(true);
    try {
      const response = await api.post<{ delivery: DeliveryDto }>(
        `/api/deliveries/${delivery.id}/return`,
        { items, note: note || undefined },
      );
      toast.success('Devolução registrada', 'O estoque foi reabastecido.');
      onDone(response.delivery);
      onClose();
      setQuantities({});
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Não foi possível registrar a devolução.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="Reentrada no estoque"
      title="Registrar devolução"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" loading={saving} onClick={submit}>
            Registrar devolução
          </Button>
        </>
      }
    >
      <div className="space-y-3 pt-1">
        {delivery.items.map((item) => {
          const returned = item.returnedQuantity ?? 0;
          const remaining = item.quantity - returned;
          return (
            <div
              key={item.index}
              className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[0.86rem] font-semibold text-bone-50">{item.description}</p>
                <Badge tone={remaining === 0 ? 'acqua' : 'muted'}>
                  {remaining === 0 ? 'Já devolvido' : `${remaining} pendente(s)`}
                </Badge>
              </div>
              {remaining > 0 ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Quantidade devolvida"
                    type="number"
                    min={0}
                    max={remaining}
                    value={quantities[item.index] ?? ''}
                    onChange={(event) =>
                      setQuantities({ ...quantities, [item.index]: event.target.value })
                    }
                    placeholder={`até ${remaining}`}
                  />
                  <Input
                    label="Estado na devolução"
                    value={conservation[item.index] ?? ''}
                    onChange={(event) =>
                      setConservation({ ...conservation, [item.index]: event.target.value })
                    }
                    placeholder="Bom estado"
                  />
                </div>
              ) : null}
            </div>
          );
        })}

        <Input
          label="Observação (opcional)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Desligamento, troca de tamanho, avaria…"
        />
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------------- página */

export default function DeliveryDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data, loading, error, setData, reload } = useResource<DetailResponse>(
    id ? `/api/deliveries/${id}` : null,
  );
  const [returning, setReturning] = useState(false);
  const [busy, setBusy] = useState(false);

  const delivery = data?.delivery;

  const update = (updated: DeliveryDto) =>
    setData((current) => (current ? { ...current, delivery: updated } : current));

  const resend = async () => {
    if (!delivery) return;
    setBusy(true);
    try {
      const response = await api.post<{
        delivery: DeliveryDto;
        notification: { ok: boolean; reason?: string };
      }>(
        `/api/deliveries/${delivery.id}/send`,
        {},
      );
      update(response.delivery);
      toast.success(
        response.notification.ok ? 'Enviado pelo Slack' : 'Entrega marcada como enviada',
        response.notification.ok ? undefined : slackErrorMessage(response.notification.reason),
      );
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Não foi possível reenviar.');
    } finally {
      setBusy(false);
    }
  };

  const openPdf = async () => {
    if (!delivery) return;
    setBusy(true);
    try {
      const response = await api.get<{ url: string }>(`/api/deliveries/${delivery.id}/pdf`);
      window.open(response.url, '_blank', 'noopener');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'PDF indisponível.');
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!delivery) return;
    setBusy(true);
    try {
      const response = await api.post<{ delivery: DeliveryDto }>(
        `/api/deliveries/${delivery.id}/archive`,
        {},
      );
      update(response.delivery);
      toast.success('Entrega arquivada');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Não foi possível arquivar.');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !delivery) {
    return (
      <>
        <PageHeader eyebrow="Entrega" title="Carregando…" back={{ to: '/app/entregas', label: 'Entregas' }} />
        <SkeletonCard lines={6} />
      </>
    );
  }

  if (!delivery) {
    return (
      <>
        <PageHeader
          eyebrow="Entrega"
          title="Entrega não encontrada"
          back={{ to: '/app/entregas', label: 'Entregas' }}
        />
        <ErrorState
          error={error}
          subject="esta entrega"
          onRetry={reload}
          backTo={{ to: '/app/entregas', label: 'Ver todas as entregas' }}
        />
      </>
    );
  }

  const pending = delivery.status === 'draft' || delivery.status === 'sent';
  const signed = Boolean(delivery.employeeSignature);

  return (
    <>
      <PageHeader
        eyebrow={`Entrega ${delivery.id}`}
        title={delivery.employee.fullName || 'Destinatário a confirmar'}
        description={`${delivery.employee.role || 'Cargo a confirmar'} · ${delivery.employee.sector || 'Setor a confirmar'}`}
        back={{ to: '/app/entregas', label: 'Entregas' }}
        actions={
          <>
            {pending ? (
              <>
                <CopyButton value={delivery.acceptUrl} size="sm" variant="outline" />
                <Button size="sm" loading={busy} onClick={resend} icon={<IconSend width={15} height={15} />}>
                  {delivery.sentAt ? 'Reenviar' : 'Enviar'}
                </Button>
              </>
            ) : null}
            {signed ? (
              <Button size="sm" variant="outline" loading={busy} onClick={openPdf} icon={<IconDownload width={15} height={15} />}>
                Baixar PDF
              </Button>
            ) : null}
            {delivery.status === 'countersigned' || delivery.status === 'returned' ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReturning(true)}
                  icon={<IconReturn width={15} height={15} />}
                >
                  Devolução
                </Button>
                <Button size="sm" variant="ghost" loading={busy} onClick={archive}>
                  Arquivar
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge status={delivery.status} />
        {delivery.expired ? <Badge tone="danger">Link expirado</Badge> : null}
        {pending ? (
          <Badge tone="muted">Link válido até {formatDateTime(delivery.tokenExpiresAt)}</Badge>
        ) : null}
        {delivery.slackChannel ? <Badge tone="acqua">Enviado pelo Slack</Badge> : null}
      </div>

      {delivery.stockWarnings.length ? (
        <div className="mb-6 rounded-2xl border border-gold-400/30 bg-gold-400/[0.06] p-5">
          <div className="flex items-center gap-2.5">
            <IconAlert className="text-gold-300" width={16} height={16} />
            <p className="text-[0.84rem] font-semibold text-gold-200">
              Avisos de estoque nesta entrega
            </p>
          </div>
          <ul className="mt-3 space-y-1.5 pl-7 text-[0.8rem] leading-relaxed text-bone-100/60">
            {delivery.stockWarnings.map((warning, index) => (
              <li key={index} className="list-disc">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          {/* --------------------------------------------------- materiais */}
          <Reveal>
            <section className="surface-dark overflow-hidden">
              <div className="border-b border-white/[0.06] px-6 py-5">
                <p className="label-eyebrow">Descrição dos materiais entregues</p>
              </div>
              <div className="divide-y divide-white/[0.05]">
                {delivery.items.map((item) => (
                  <div key={item.index} className="flex flex-wrap items-center gap-4 px-6 py-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gold-400/10 font-mono text-[0.72rem] text-gold-200">
                      {String(item.index + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-[1.05rem] text-bone-50">{item.description}</p>
                      <p className="mt-0.5 text-[0.76rem] text-bone-100/40">
                        {[item.brand, item.model].filter(Boolean).join(' / ') || 'Sem marca/modelo'}{' '}
                        · {item.conservation}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[0.86rem] font-semibold text-bone-100/85">
                        {quantityLabel(item.quantity, item.unit)}
                      </p>
                      {item.returnedQuantity ? (
                        <p className="mt-0.5 text-[0.7rem] text-acqua-400">
                          {item.returnedQuantity} devolvido(s)
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              {delivery.notes ? (
                <p className="border-t border-white/[0.06] px-6 py-4 text-[0.8rem] italic text-bone-100/45">
                  {delivery.notes}
                </p>
              ) : null}
            </section>
          </Reveal>

          {/* ---------------------------------------------- contra-assinatura */}
          {delivery.status === 'signed_by_employee' ? (
            <Reveal delay={0.08}>
              <CountersignPanel delivery={delivery} onDone={update} />
            </Reveal>
          ) : null}

          {/* ------------------------------------------------- assinaturas */}
          {signed ? (
            <Reveal delay={0.12}>
              <section className="surface-dark overflow-hidden">
                <div className="border-b border-white/[0.06] px-6 py-5">
                  <p className="label-eyebrow">Assinaturas</p>
                </div>
                <div className="grid gap-px bg-white/[0.05] sm:grid-cols-2">
                  {[
                    {
                      title: 'Colaborador(a)',
                      name: delivery.employeeSignature?.fullName,
                      subtitle: delivery.employee.cpfFormatted,
                      at: delivery.employeeSignature?.signedAt,
                      url: delivery.employeeSignature?.imageUrl,
                    },
                    {
                      title: 'Representante da empresa',
                      name: delivery.adminSignature?.adminName,
                      subtitle: 'Grupo Alcina Maria',
                      at: delivery.adminSignature?.signedAt,
                      url: delivery.adminSignature?.imageUrl,
                    },
                  ].map((block) => (
                    <div key={block.title} className="bg-ink-850 p-6">
                      <p className="text-[0.66rem] font-semibold uppercase tracking-wider text-gold-400/80">
                        {block.title}
                      </p>
                      <div className="mt-4 grid h-24 place-items-center rounded-xl bg-bone-50 p-3">
                        {block.url ? (
                          <img
                            src={block.url}
                            alt={`Assinatura de ${block.name}`}
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <span className="text-[0.76rem] text-ink-400">Aguardando assinatura</span>
                        )}
                      </div>
                      <p className="mt-3 text-[0.86rem] font-semibold text-bone-50">
                        {block.name ?? '—'}
                      </p>
                      <p className="text-[0.74rem] text-bone-100/40">{block.subtitle}</p>
                      <p className="mt-1 text-[0.7rem] tabular text-bone-100/30">
                        {block.at ? formatDateTime(block.at) : 'pendente'}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </Reveal>
          ) : null}

          {/* --------------------------------------------------- devoluções */}
          {delivery.returns.length ? (
            <Reveal delay={0.16}>
              <section className="surface-dark overflow-hidden">
                <div className="border-b border-white/[0.06] px-6 py-5">
                  <p className="label-eyebrow">Devoluções registradas</p>
                </div>
                <ul className="divide-y divide-white/[0.05]">
                  {delivery.returns.map((entry, index) => (
                    <li key={index} className="px-6 py-4">
                      <p className="text-[0.84rem] text-bone-100/80">
                        {entry.items
                          .map(
                            (item) =>
                              `${item.quantity}× ${delivery.items[item.itemIndex]?.name ?? 'item'} (${item.conservation})`,
                          )
                          .join(' · ')}
                      </p>
                      <p className="mt-1 text-[0.72rem] text-bone-100/35">
                        {formatDateTime(entry.at)} · {entry.actorName}
                        {entry.note ? ` · ${entry.note}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            </Reveal>
          ) : null}
        </div>

        {/* --------------------------------------------------------- aside */}
        <aside className="space-y-5">
          <Reveal delay={0.06}>
            <section className="surface-dark p-6">
              <p className="label-eyebrow mb-5">Linha do tempo</p>
              <Timeline delivery={delivery} />
            </section>
          </Reveal>

          {pending ? (
            <Reveal delay={0.12}>
              <section className="surface-dark frame-gold p-6">
                <p className="label-eyebrow">Link de assinatura</p>
                <p className="mt-3 break-all rounded-xl border border-white/[0.07] bg-ink-950/60 px-3.5 py-3 font-mono text-[0.7rem] text-gold-200/90">
                  {delivery.acceptUrl}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <CopyButton value={delivery.acceptUrl} size="sm" variant="outline" />
                </div>
                <p className="mt-4 text-[0.72rem] leading-relaxed text-bone-100/35">
                  Pessoal, de uso único e com expiração. Após a assinatura, torna-se somente
                  leitura.
                </p>
              </section>
            </Reveal>
          ) : null}

          {delivery.employeeSignature ? (
            <Reveal delay={0.18}>
              <section className="surface-dark p-6">
                <p className="label-eyebrow">Evidências do aceite</p>
                <dl className="mt-4 space-y-3 text-[0.78rem]">
                  {[
                    ['Data e hora', formatDateTime(delivery.employeeSignature.signedAt)],
                    ['Endereço IP', delivery.employeeSignature.ip ?? 'n/d'],
                    ['CPF informado', delivery.employee.cpfFormatted || 'n/d'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-4">
                      <dt className="shrink-0 text-bone-100/35">{label}</dt>
                      <dd className="text-right font-medium text-bone-100/80">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 break-words border-t border-white/[0.06] pt-3 text-[0.68rem] leading-relaxed text-bone-100/30">
                  {delivery.employeeSignature.userAgent ?? 'Agente não informado'}
                </p>
              </section>
            </Reveal>
          ) : null}
        </aside>
      </div>

      <ReturnModal
        delivery={delivery}
        open={returning}
        onClose={() => setReturning(false)}
        onDone={(updated) => {
          update(updated);
          void reload();
        }}
      />
    </>
  );
}
