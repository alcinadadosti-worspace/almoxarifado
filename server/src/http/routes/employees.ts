import { Router } from 'express';
import { collections } from '../../data';
import { employeeInputSchema } from '../../domain/schemas';
import type { Employee } from '../../domain/types';
import { deliveryDto } from '../../services/deliveries';
import { formatCpf, maskCpf } from '../../utils/cpf';
import { newId } from '../../utils/ids';
import { requireAdmin } from '../auth';
import { HttpError, asyncRoute } from '../errors';

export const employeesRouter = Router();
employeesRouter.use(requireAdmin);

const dto = (employee: Employee) => ({
  ...employee,
  cpfFormatted: formatCpf(employee.cpf),
  cpfMasked: maskCpf(employee.cpf),
});

employeesRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const search = String(req.query.search ?? '').trim().toLowerCase();
    let employees = await collections.employees.list({ orderBy: ['fullName', 'asc'] });
    if (req.query.includeInactive !== 'true') {
      employees = employees.filter((employee) => employee.active);
    }
    if (search) {
      employees = employees.filter((employee) =>
        [employee.fullName, employee.role, employee.sector, employee.cpf]
          .join(' ')
          .toLowerCase()
          .includes(search),
      );
    }
    res.json({ employees: employees.map(dto) });
  }),
);

/** Ficha do colaborador com todo o histórico de termos assinados. */
employeesRouter.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const employee = await collections.employees.get(req.params.id);
    if (!employee) throw HttpError.notFound('Colaborador não encontrado.');

    const deliveries = await collections.deliveries.list({
      where: [['employeeId', '==', employee.id]],
      orderBy: ['createdAt', 'desc'],
      limit: 100,
    });

    res.json({
      employee: dto(employee),
      deliveries: await Promise.all(deliveries.map((delivery) => deliveryDto(delivery))),
    });
  }),
);

employeesRouter.post(
  '/',
  asyncRoute(async (req, res) => {
    const input = employeeInputSchema.parse(req.body);
    const duplicate = await collections.employees.findOne({ where: [['cpf', '==', input.cpf]] });
    if (duplicate) throw HttpError.conflict('Já existe um colaborador com este CPF.', 'duplicate_cpf');

    const now = new Date().toISOString();
    const employee: Employee = {
      id: newId('col_'),
      ...input,
      email: input.email || undefined,
      createdAt: now,
      updatedAt: now,
    };
    await collections.employees.set(employee);
    res.status(201).json({ employee: dto(employee) });
  }),
);

employeesRouter.put(
  '/:id',
  asyncRoute(async (req, res) => {
    const existing = await collections.employees.get(req.params.id);
    if (!existing) throw HttpError.notFound('Colaborador não encontrado.');
    const input = employeeInputSchema.parse(req.body);

    const duplicate = await collections.employees.findOne({ where: [['cpf', '==', input.cpf]] });
    if (duplicate && duplicate.id !== existing.id) {
      throw HttpError.conflict('Já existe um colaborador com este CPF.', 'duplicate_cpf');
    }

    const employee: Employee = {
      ...existing,
      ...input,
      email: input.email || undefined,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await collections.employees.set(employee);
    res.json({ employee: dto(employee) });
  }),
);

employeesRouter.delete(
  '/:id',
  asyncRoute(async (req, res) => {
    const employee = await collections.employees.get(req.params.id);
    if (!employee) throw HttpError.notFound('Colaborador não encontrado.');
    await collections.employees.update(employee.id, {
      active: false,
      updatedAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  }),
);
