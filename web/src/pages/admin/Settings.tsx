import { useEffect, useRef, useState } from 'react';
import { SignaturePad, type SignaturePadHandle } from '@/components/SignaturePad';
import { IconCheck, IconSlack } from '@/components/icons';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal } from '@/components/ui/Reveal';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useResource } from '@/lib/useResource';
import type { AdminProfile, AppSettings, NotificationStatus } from '@/types/domain';

interface SettingsResponse {
  settings: AppSettings;
  notifications: NotificationStatus;
}

export default function Settings() {
  const toast = useToast();
  const { refreshProfile } = useAuth();
  const { data, loading, reload } = useResource<SettingsResponse>('/api/settings');
  const { data: profile, reload: reloadProfile } = useResource<AdminProfile>('/api/auth/me');

  const [company, setCompany] = useState({
    name: '',
    cnpj: '',
    headquarters: '',
    city: '',
    state: '',
  });
  const [threshold, setThreshold] = useState('5');
  const [slackChannel, setSlackChannel] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const padRef = useRef<SignaturePadHandle>(null);

  useEffect(() => {
    if (!data) return;
    setCompany(data.settings.company);
    setThreshold(String(data.settings.lowStockThreshold));
    setSlackChannel(data.settings.slackAdminChannel ?? '');
  }, [data]);

  useEffect(() => {
    if (profile) setDisplayName(profile.name);
  }, [profile]);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.put('/api/settings', {
        company,
        lowStockThreshold: Number(threshold) || 0,
        slackAdminChannel: slackChannel || undefined,
      });
      toast.success('Configurações salvas');
      reload();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar.');
    } finally {
      setSavingSettings(false);
    }
  };

  const saveProfile = async (clearSignature = false) => {
    setSavingProfile(true);
    try {
      const signature = clearSignature ? undefined : (padRef.current?.toDataUrl() ?? undefined);
      await api.put('/api/auth/me', { displayName, signature, clearSignature });
      toast.success(
        clearSignature ? 'Assinatura removida' : 'Perfil atualizado',
        clearSignature ? undefined : 'Seu nome aparece no termo como representante da empresa.',
      );
      padRef.current?.clear();
      setHasInk(false);
      reloadProfile();
      await refreshProfile();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar o perfil.');
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading && !data) {
    return (
      <>
        <PageHeader eyebrow="Ajustes" title="Configurações" />
        <SkeletonCard lines={6} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Ajustes"
        title="Configurações"
        description="Dados da empresa que entram no termo, limites de estoque e integrações."
      />

      <div className="grid gap-5 xl:grid-cols-2">
        {/* ------------------------------------------------------- empresa */}
        <Reveal>
          <section className="surface-dark p-6 sm:p-8">
            <p className="label-eyebrow">Identificação no termo</p>
            <h2 className="mt-2 font-display text-xl font-medium text-bone-50">Dados da empresa</h2>
            <p className="mt-1.5 text-[0.8rem] leading-relaxed text-bone-100/40">
              Aparecem no cabeçalho e no parágrafo de abertura do Termo de Responsabilidade.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Input
                wrapperClassName="sm:col-span-2"
                label="Razão social"
                value={company.name}
                onChange={(event) => setCompany({ ...company, name: event.target.value })}
              />
              <Input
                label="CNPJ"
                value={company.cnpj}
                onChange={(event) => setCompany({ ...company, cnpj: event.target.value })}
              />
              <Input
                label="Sede (texto do termo)"
                value={company.headquarters}
                onChange={(event) => setCompany({ ...company, headquarters: event.target.value })}
              />
              <Input
                label="Cidade (linha da data)"
                value={company.city}
                onChange={(event) => setCompany({ ...company, city: event.target.value })}
              />
              <Input
                label="UF"
                maxLength={4}
                value={company.state}
                onChange={(event) => setCompany({ ...company, state: event.target.value })}
              />
              <Input
                wrapperClassName="sm:col-span-2"
                label="Alerta de estoque baixo (padrão)"
                type="number"
                min={0}
                value={threshold}
                onChange={(event) => setThreshold(event.target.value)}
                hint="Cada variante pode ter um mínimo próprio, que prevalece sobre este valor."
              />
            </div>

            <Button className="mt-6" loading={savingSettings} onClick={saveSettings}>
              Salvar configurações
            </Button>
          </section>
        </Reveal>

        {/* --------------------------------------------------------- perfil */}
        <Reveal delay={0.08}>
          <section className="surface-dark p-6 sm:p-8">
            <p className="label-eyebrow">Representante da empresa</p>
            <h2 className="mt-2 font-display text-xl font-medium text-bone-50">Sua assinatura</h2>
            <p className="mt-1.5 text-[0.8rem] leading-relaxed text-bone-100/40">
              Guardada com acesso restrito para aplicar com um clique nas contra-assinaturas.
            </p>

            <Input
              wrapperClassName="mt-6"
              label="Nome exibido no termo"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Nome de quem assina pela empresa"
            />

            {profile?.hasSavedSignature && profile.savedSignatureUrl ? (
              <div className="mt-5">
                <p className="mb-2 flex items-center gap-2 text-[0.72rem] uppercase tracking-wider text-acqua-400">
                  <IconCheck width={13} height={13} /> Assinatura salva
                </p>
                <div className="grid h-24 place-items-center rounded-xl bg-bone-50 p-3">
                  <img
                    src={profile.savedSignatureUrl}
                    alt="Assinatura salva"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-5">
              <SignaturePad
                label={profile?.hasSavedSignature ? 'Substituir assinatura' : 'Desenhar assinatura'}
                height={180}
                ref={padRef}
                onChange={setHasInk}
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-2.5">
              <Button loading={savingProfile} onClick={() => saveProfile(false)}>
                {hasInk ? 'Salvar nome e assinatura' : 'Salvar nome'}
              </Button>
              {profile?.hasSavedSignature ? (
                <Button variant="ghost" loading={savingProfile} onClick={() => saveProfile(true)}>
                  Remover assinatura salva
                </Button>
              ) : null}
            </div>
          </section>
        </Reveal>

        {/* ---------------------------------------------------------- Slack */}
        <Reveal delay={0.14} className="xl:col-span-2">
          <section className="surface-dark p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="label-eyebrow">Integração</p>
                <h2 className="mt-2 flex items-center gap-2.5 font-display text-xl font-medium text-bone-50">
                  <IconSlack className="text-gold-300" /> Slack
                </h2>
              </div>
              <Badge tone={data?.notifications.available ? 'acqua' : 'muted'} dot>
                {data?.notifications.available ? 'Bot conectado' : 'Não configurado'}
              </Badge>
            </div>

            <p className="mt-4 max-w-3xl text-[0.84rem] leading-relaxed text-bone-100/45">
              Com <code className="rounded bg-ink-800 px-1.5 py-0.5 text-[0.76rem] text-gold-200">SLACK_BOT_TOKEN</code>{' '}
              e{' '}
              <code className="rounded bg-ink-800 px-1.5 py-0.5 text-[0.76rem] text-gold-200">
                SLACK_SIGNING_SECRET
              </code>{' '}
              no <code className="text-gold-200/80">server/.env</code>, o bot envia o termo por DM
              com um card do Block Kit e atualiza a mensagem assim que o colaborador assina.
              Sem elas, a aplicação segue funcionando com o link copiável — o Slack é canal de
              notificação, nunca dependência.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Input
                label="Canal do administrativo"
                value={slackChannel}
                onChange={(event) => setSlackChannel(event.target.value)}
                placeholder="C01ABCDEF"
                hint="Recebe avisos de assinatura e de estoque baixo."
              />
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-[0.78rem] leading-relaxed text-bone-100/45">
                <p className="font-semibold text-bone-100/70">Endpoints do app Slack</p>
                <ul className="mt-2 space-y-1 font-mono text-[0.72rem] text-gold-200/70">
                  <li>POST /api/slack/events</li>
                  <li>POST /api/slack/interactions</li>
                  <li>POST /api/slack/commands</li>
                </ul>
              </div>
            </div>

            <Button className="mt-6" variant="outline" loading={savingSettings} onClick={saveSettings}>
              Salvar canal
            </Button>
          </section>
        </Reveal>
      </div>
    </>
  );
}
