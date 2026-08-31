import { useState } from 'react';
import { IconPlus, IconSearch, IconSignature } from '@/components/icons';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Switch } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal } from '@/components/ui/Reveal';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ApiError, api } from '@/lib/api';
import { formatCpf, isValidCpf } from '@/lib/format';
import { useDebounced, useResource } from '@/lib/useResource';
import type { Employee } from '@/types/domain';

interface EmployeesResponse {
  employees: Employee[];
}

const EMPTY = {
  fullName: '',
  cpf: '',
  role: '',
  sector: '',
  email: '',
  slackUserId: '',
  active: true,
};

export default function Employees() {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Employee | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const debounced = useDebounced(search);
  const { data, loading, reload } = useResource<EmployeesResponse>(
    `/api/employees?search=${encodeURIComponent(debounced)}`,
  );

  const openCreate = () => {
    setForm({ ...EMPTY });
    setErrors({});
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (employee: Employee) => {
    setForm({
      fullName: employee.fullName,
      cpf: formatCpf(employee.cpf),
      role: employee.role,
      sector: employee.sector,
      email: employee.email ?? '',
      slackUserId: employee.slackUserId ?? '',
      active: employee.active,
    });
    setErrors({});
    setEditing(employee);
    setCreating(true);
  };

  const submit = async () => {
    setErrors({});
    if (!isValidCpf(form.cpf)) {
      setErrors({ cpf: 'CPF inválido.' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        email: form.email || undefined,
        slackUserId: form.slackUserId || undefined,
      };
      if (editing) await api.put(`/api/employees/${editing.id}`, payload);
      else await api.post('/api/employees', payload);
      toast.success(editing ? 'Colaborador atualizado' : 'Colaborador cadastrado', form.fullName);
      setCreating(false);
      reload();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.details ?? {});
        toast.error(error.message);
      } else {
        toast.error('Não foi possível salvar.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Pessoas"
        title="Colaboradores"
        description="Quem já está cadastrado tem os dados pré-preenchidos na hora de assinar — basta confirmar."
        actions={
          <Button size="sm" icon={<IconPlus width={15} height={15} />} onClick={openCreate}>
            Novo colaborador
          </Button>
        }
      />

      <Input
        wrapperClassName="mb-6 max-w-md"
        placeholder="Buscar por nome, cargo, setor ou CPF…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        icon={<IconSearch width={15} height={15} />}
      />

      {loading && !data ? (
        <SkeletonRows rows={6} />
      ) : !data?.employees.length ? (
        <EmptyState
          title="Nenhum colaborador"
          description="Cadastre a equipe para agilizar as entregas — ou envie o link direto e deixe o colaborador preencher."
          action={
            <Button size="sm" onClick={openCreate}>
              Cadastrar colaborador
            </Button>
          }
        />
      ) : (
        <div className="surface-dark overflow-hidden">
          <ul className="divide-y divide-white/[0.05]">
            {data.employees.map((employee, index) => (
              <Reveal as="li" key={employee.id} delay={Math.min(index * 0.03, 0.25)}>
                <div className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.02] sm:px-6">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-gold-400/20 bg-gold-400/[0.06] font-display text-lg text-gold-200">
                    {employee.fullName.charAt(0).toUpperCase()}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.92rem] font-semibold text-bone-50">
                      {employee.fullName}
                    </p>
                    <p className="mt-0.5 truncate text-[0.76rem] text-bone-100/40">
                      {employee.role} · {employee.sector}
                    </p>
                  </div>

                  <span className="hidden font-mono text-[0.76rem] text-bone-100/35 md:block">
                    {employee.cpfMasked ?? formatCpf(employee.cpf)}
                  </span>

                  {employee.slackUserId ? <Badge tone="acqua">Slack</Badge> : null}
                  {!employee.active ? <Badge tone="muted">Inativo</Badge> : null}

                  <div className="flex items-center gap-2">
                    <ButtonLink
                      to={`/app/entregas/nova?employee=${employee.id}`}
                      size="sm"
                      variant="outline"
                      icon={<IconSignature width={14} height={14} />}
                    >
                      Entregar
                    </ButtonLink>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(employee)}>
                      Editar
                    </Button>
                  </div>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        eyebrow={editing ? 'Editar cadastro' : 'Novo cadastro'}
        title={editing ? editing.fullName : 'Colaborador'}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button size="sm" loading={saving} onClick={submit}>
              Salvar
            </Button>
          </>
        }
      >
        <div className="grid gap-4 pt-1 sm:grid-cols-2">
          <Input
            wrapperClassName="sm:col-span-2"
            label="Nome completo"
            required
            value={form.fullName}
            error={errors.fullName}
            onChange={(event) => setForm({ ...form, fullName: event.target.value })}
          />
          <Input
            label="CPF"
            required
            inputMode="numeric"
            value={form.cpf}
            error={errors.cpf}
            onChange={(event) => setForm({ ...form, cpf: formatCpf(event.target.value) })}
            placeholder="000.000.000-00"
          />
          <Input
            label="Cargo/Função"
            required
            value={form.role}
            error={errors.role}
            onChange={(event) => setForm({ ...form, role: event.target.value })}
            placeholder="Consultora de Beleza"
          />
          <Input
            label="Setor/Unidade"
            required
            value={form.sector}
            error={errors.sector}
            onChange={(event) => setForm({ ...form, sector: event.target.value })}
            placeholder="Loja Penedo — Centro"
          />
          <Input
            label="E-mail (opcional)"
            type="email"
            value={form.email}
            error={errors.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          <Input
            wrapperClassName="sm:col-span-2"
            label="ID do usuário no Slack (opcional)"
            value={form.slackUserId}
            hint="Ex.: U01ABCDEF — permite enviar o termo por DM automaticamente."
            onChange={(event) => setForm({ ...form, slackUserId: event.target.value })}
          />
          <div className="sm:col-span-2">
            <Switch
              label="Colaborador ativo"
              checked={form.active}
              onChange={(active) => setForm({ ...form, active })}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
