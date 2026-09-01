import { z } from 'zod';
import { isValidCpf, onlyDigits } from '../utils/cpf';

/* ------------------------------------------------------------ primitivos */

const trimmed = (max: number) => z.string().trim().max(max);
const requiredText = (max: number, label: string) =>
  trimmed(max).min(1, { message: `${label} é obrigatório.` });

export const cpfSchema = z
  .string()
  .trim()
  .transform(onlyDigits)
  .refine((value) => isValidCpf(value), { message: 'CPF inválido.' });

/** data URL de imagem PNG gerada pelo canvas de assinatura (limite ~2MB). */
export const signatureDataUrlSchema = z
  .string()
  .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=\s]+$/, {
    message: 'Assinatura inválida.',
  })
  .max(3_000_000, { message: 'Assinatura muito grande.' });

/* ------------------------------------------------------------- materiais */

/**
 * `key` vazia significa "material sem variação" — um crachá, um kit, algo que
 * só tem quantidade. Antes era preciso inventar uma variante ("Padrão") só
 * para ter onde guardar o estoque.
 */
export const variantSchema = z.object({
  key: trimmed(60).default(''),
  stock: z.coerce.number().int().min(0).max(1_000_000),
  minStock: z.coerce.number().int().min(0).max(1_000_000).optional(),
  sku: trimmed(60).optional(),
});

export const customFieldSchema = z.object({
  label: requiredText(60, 'O rótulo do campo'),
  type: z.enum(['text', 'number', 'select']),
  options: z.array(trimmed(60)).max(40).optional(),
  required: z.boolean().optional(),
  defaultValue: trimmed(120).optional(),
});

export const materialInputSchema = z
  .object({
    name: requiredText(120, 'O nome do material'),
    category: trimmed(80).default('Fardamento'),
    brand: trimmed(80).default(''),
    model: trimmed(80).default(''),
    conservationDefault: trimmed(60).default('Novo'),
    variantLabel: trimmed(60).default('Tamanho'),
    variantType: z.enum(['letter', 'number', 'custom']).default('custom'),
    variants: z.array(variantSchema).min(1, { message: 'Cadastre ao menos uma variante.' }).max(60),
    customFields: z.array(customFieldSchema).max(20).default([]),
    unit: requiredText(40, 'A unidade de medida').default('unidade'),
    notes: trimmed(600).optional(),
    active: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    const keys = value.variants.map((v) => v.key.toLowerCase());
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variants'],
        message: 'Existem variantes com a mesma chave.',
      });
    }
    // Sem variação: uma única linha sem chave. Com variação: toda linha precisa
    // de um nome, senão duas viram "a mesma coisa" no termo e no estoque.
    if (value.variants.length > 1 && value.variants.some((v) => !v.key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variants'],
        message: 'Dê um nome a cada variante (PP, 40, Azul…).',
      });
    }
    value.customFields.forEach((field, index) => {
      if (field.type === 'select' && (!field.options || field.options.length === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customFields', index, 'options'],
          message: 'Campos do tipo "seleção" precisam de ao menos uma opção.',
        });
      }
    });
  });

export const materialUpdateSchema = materialInputSchema;

export const stockAdjustmentSchema = z.object({
  /** Vazia para material sem variação. */
  variantKey: trimmed(60).default(''),
  delta: z.coerce.number().int().refine((v) => v !== 0, { message: 'Informe uma quantidade.' }),
  note: trimmed(240).optional(),
});

/* --------------------------------------------------------- colaboradores */

/**
 * Só o nome é exigido no cadastro.
 *
 * CPF, cargo e setor entram sozinhos na primeira assinatura — é lá que o
 * colaborador confere e completa os próprios dados, e a ficha é atualizada.
 * Exigir tudo aqui impediria importar uma lista de pessoas do Slack, que é
 * como o cadastro realmente começa.
 */
export const employeeInputSchema = z.object({
  fullName: requiredText(140, 'O nome completo'),
  cpf: z
    .string()
    .trim()
    .transform(onlyDigits)
    .refine((value) => value === '' || isValidCpf(value), { message: 'CPF inválido.' })
    .default(''),
  role: trimmed(90).default(''),
  sector: trimmed(90).default(''),
  email: z.string().trim().email({ message: 'E-mail inválido.' }).optional().or(z.literal('')),
  slackUserId: trimmed(30).optional(),
  active: z.boolean().default(true),
});

/* --------------------------------------------------------------- entregas */

export const deliveryItemInputSchema = z.object({
  materialId: requiredText(60, 'O material'),
  /** Vazia para material sem variação. */
  variantKey: trimmed(60).default(''),
  quantity: z.coerce.number().int().min(1).max(100_000),
  /** Sobrescritas opcionais — por padrão vem tudo do cadastro do material. */
  brand: trimmed(80).optional(),
  model: trimmed(80).optional(),
  conservation: trimmed(60).optional(),
  customValues: z.record(z.string().max(200)).default({}),
});

export const employeeDraftSchema = z.object({
  fullName: trimmed(140).default(''),
  cpf: z
    .string()
    .trim()
    .transform(onlyDigits)
    .refine((v) => v === '' || isValidCpf(v), { message: 'CPF inválido.' })
    .default(''),
  role: trimmed(90).default(''),
  sector: trimmed(90).default(''),
  slackUserId: trimmed(30).optional(),
  email: z.string().trim().optional(),
});

export const deliveryInputSchema = z
  .object({
    employeeId: trimmed(60).optional(),
    employeeDraft: employeeDraftSchema.optional(),
    items: z.array(deliveryItemInputSchema).min(1, { message: 'Selecione ao menos um item.' }).max(40),
    notes: trimmed(600).optional(),
    /** Envia pelo Slack assim que criar (quando houver credenciais). */
    sendNow: z.boolean().default(false),
    slackTarget: trimmed(40).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.employeeId && !value.employeeDraft?.fullName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['employeeId'],
        message: 'Escolha um colaborador cadastrado ou informe o nome do destinatário.',
      });
    }
    const seen = new Set<string>();
    value.items.forEach((item, index) => {
      const key = `${item.materialId}::${item.variantKey}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index],
          message: 'Item repetido — some as quantidades em uma única linha.',
        });
      }
      seen.add(key);
    });
  });

export const deliverySendSchema = z.object({
  slackTarget: trimmed(40).optional(),
});

/** Payload que o colaborador envia na página pública. */
export const acceptSignSchema = z.object({
  fullName: requiredText(140, 'O nome completo'),
  cpf: cpfSchema,
  role: requiredText(90, 'O cargo/função'),
  sector: requiredText(90, 'O setor/unidade'),
  signature: signatureDataUrlSchema,
  accepted: z.literal(true, {
    errorMap: () => ({ message: 'É necessário aceitar os termos para assinar.' }),
  }),
});

export const countersignSchema = z.object({
  signature: signatureDataUrlSchema.optional(),
  /** Reaproveita a assinatura salva do admin. */
  useSaved: z.boolean().default(false),
  /** Salva a assinatura enviada para reutilizar nas próximas contra-assinaturas. */
  saveForReuse: z.boolean().default(false),
});

export const deliveryReturnSchema = z.object({
  items: z
    .array(
      z.object({
        itemIndex: z.coerce.number().int().min(0),
        quantity: z.coerce.number().int().min(1),
        conservation: trimmed(60).default('Bom estado'),
      }),
    )
    .min(1, { message: 'Informe ao menos um item devolvido.' }),
  note: trimmed(600).optional(),
});

/* ---------------------------------------------------------- configuração */

export const settingsSchema = z.object({
  company: z.object({
    name: requiredText(140, 'A razão social'),
    cnpj: requiredText(30, 'O CNPJ'),
    headquarters: requiredText(160, 'A sede'),
    city: requiredText(80, 'A cidade'),
    state: requiredText(4, 'A UF'),
  }),
  lowStockThreshold: z.coerce.number().int().min(0).max(10_000),
  slackAdminChannel: trimmed(40).optional(),
});

export const adminProfileSchema = z.object({
  displayName: requiredText(140, 'O nome do representante'),
  signature: signatureDataUrlSchema.optional(),
  clearSignature: z.boolean().optional(),
});

export const devLoginSchema = z.object({
  email: z.string().trim().email({ message: 'E-mail inválido.' }),
  password: z.string().min(1, { message: 'Informe a senha.' }),
});

/* ---------------------------------------------------------------- tipos */

export type MaterialInput = z.infer<typeof materialInputSchema>;
export type EmployeeInput = z.infer<typeof employeeInputSchema>;
export type DeliveryInput = z.infer<typeof deliveryInputSchema>;
export type AcceptSignInput = z.infer<typeof acceptSignSchema>;
export type CountersignInput = z.infer<typeof countersignSchema>;
export type DeliveryReturnInput = z.infer<typeof deliveryReturnSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
