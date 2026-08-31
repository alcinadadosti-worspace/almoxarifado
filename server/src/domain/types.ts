/**
 * Modelo de domínio do ACQUA Almoxarifado.
 *
 * Regra de ouro: **o admin define a estrutura de cada material**. Nada de
 * tamanhos, numerações ou unidades fixos no código — tudo vira dado.
 * (Espelhado em `web/src/types/domain.ts` — o servidor é a fonte da verdade.)
 */

export type Iso = string;

/* ------------------------------------------------------------- materiais */

export type VariantType = 'letter' | 'number' | 'custom';

export interface MaterialVariant {
  /** Chave livre criada pelo admin: "PP", "G", "42", "Azul-marinho"… */
  key: string;
  stock: number;
  /** Estoque mínimo desta variante (cai para o padrão global quando ausente). */
  minStock?: number;
  sku?: string;
}

export type CustomFieldType = 'text' | 'number' | 'select';

export interface CustomFieldDef {
  label: string;
  type: CustomFieldType;
  options?: string[];
  required?: boolean;
  defaultValue?: string;
}

export interface Material {
  id: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  conservationDefault: string;
  /** Rótulo do eixo de variação: "Tamanho", "Numeração", "Voltagem"… */
  variantLabel: string;
  variantType: VariantType;
  variants: MaterialVariant[];
  customFields: CustomFieldDef[];
  /** Unidade de medida livre: "unidade", "par", "dezena", "caixa"… */
  unit: string;
  notes?: string;
  active: boolean;
  createdAt: Iso;
  updatedAt: Iso;
}

/* --------------------------------------------------------- colaboradores */

export interface Employee {
  id: string;
  fullName: string;
  cpf: string;
  role: string;
  sector: string;
  email?: string;
  slackUserId?: string;
  active: boolean;
  createdAt: Iso;
  updatedAt: Iso;
}

/* --------------------------------------------------------------- entregas */

export type DeliveryStatus =
  | 'draft'
  | 'sent'
  | 'signed_by_employee'
  | 'countersigned'
  | 'archived'
  | 'returned';

/** Snapshot imutável do item no momento da entrega. */
export interface DeliveryItem {
  materialId: string;
  name: string;
  category?: string;
  brand: string;
  model: string;
  variantLabel: string;
  variantKey: string;
  quantity: number;
  unit: string;
  conservation: string;
  customValues: Record<string, string>;
  /** Quantidade já devolvida (reentrada no estoque). */
  returnedQuantity?: number;
}

export interface EmployeeDraft {
  fullName: string;
  cpf: string;
  role: string;
  sector: string;
  slackUserId?: string;
  email?: string;
}

export interface SignatureEvidence {
  /** Caminho no Storage (nunca a URL — a URL é assinada sob demanda). */
  imagePath: string;
  signedAt: Iso;
  ip?: string;
  userAgent?: string;
}

export interface EmployeeSignature extends SignatureEvidence {
  fullName: string;
  cpf: string;
}

export interface AdminSignature extends SignatureEvidence {
  adminUid: string;
  adminName: string;
}

export interface DeliveryReturn {
  at: Iso;
  actorUid: string;
  actorName: string;
  note?: string;
  items: Array<{ itemIndex: number; quantity: number; conservation: string }>;
}

export interface Delivery {
  id: string;
  /** Token de 256 bits do link público (`/aceite/:token`). */
  token: string;
  tokenExpiresAt: Iso;
  employeeId?: string;
  employeeDraft: EmployeeDraft;
  items: DeliveryItem[];
  status: DeliveryStatus;
  notes?: string;
  /** Referência da mensagem enviada no Slack, para atualizá-la depois. */
  slackMessageTs?: string;
  slackChannel?: string;
  sentAt?: Iso;
  employeeSignature?: EmployeeSignature;
  adminSignature?: AdminSignature;
  /** Caminho do PDF no Storage. */
  pdfPath?: string;
  pdfGeneratedAt?: Iso;
  /** Avisos gerados quando o estoque não cobriu a baixa integralmente. */
  stockWarnings?: string[];
  returns?: DeliveryReturn[];
  archivedAt?: Iso;
  createdBy: string;
  createdAt: Iso;
  updatedAt: Iso;
}

/* ---------------------------------------------------------- movimentações */

export type MovementReason =
  | 'material_created'
  | 'manual_adjustment'
  | 'delivery_signed'
  | 'delivery_returned'
  | 'delivery_cancelled';

export interface StockMovement {
  id: string;
  materialId: string;
  materialName: string;
  variantKey: string;
  /** Negativo = saída, positivo = entrada. */
  delta: number;
  stockAfter: number;
  reason: MovementReason;
  deliveryId?: string;
  note?: string;
  actorUid: string;
  actorName: string;
  at: Iso;
}

/* ------------------------------------------------------------ configuração */

export interface CompanyInfo {
  name: string;
  cnpj: string;
  headquarters: string;
  city: string;
  state: string;
}

export interface AppSettings {
  id: string;
  company: CompanyInfo;
  lowStockThreshold: number;
  slackAdminChannel?: string;
  termIntro?: string;
  termResponsibility?: string;
  updatedAt: Iso;
}

export interface AdminProfile {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  /** Assinatura salva do representante da empresa, reutilizável. */
  savedSignaturePath?: string;
  updatedAt: Iso;
}

/* ------------------------------------------------------------- auxiliares */

export interface AuthenticatedAdmin {
  uid: string;
  email: string;
  name: string;
  dev: boolean;
}

/* ---------------------------------------------------------------- arquivos */

/**
 * Arquivo sensível (PNG de assinatura, PDF do termo) guardado no banco.
 *
 * Usado quando não há Firebase Storage configurado: os arquivos deste sistema
 * são pequenos (dezenas de KB), então cabem com folga em um documento do
 * Firestore — e assim o projeto inteiro roda no plano gratuito.
 */
export interface StoredFile {
  id: string;
  path: string;
  contentType: string;
  size: number;
  /** Conteúdo em base64. */
  data: string;
  updatedAt: Iso;
}
