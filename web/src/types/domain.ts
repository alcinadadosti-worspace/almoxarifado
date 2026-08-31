/**
 * Espelho dos tipos de domínio do servidor (`server/src/domain/types.ts`).
 * O backend é a fonte da verdade; aqui ficam apenas as formas que a UI consome.
 */

export type VariantType = 'letter' | 'number' | 'custom';
export type CustomFieldType = 'text' | 'number' | 'select';

export interface MaterialVariant {
  key: string;
  stock: number;
  minStock?: number;
  sku?: string;
}

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
  variantLabel: string;
  variantType: VariantType;
  variants: MaterialVariant[];
  customFields: CustomFieldDef[];
  unit: string;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  totalStock?: number;
  lowStockVariants?: string[];
}

export interface Employee {
  id: string;
  fullName: string;
  cpf: string;
  cpfFormatted?: string;
  cpfMasked?: string;
  role: string;
  sector: string;
  email?: string;
  slackUserId?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DeliveryStatus =
  | 'draft'
  | 'sent'
  | 'signed_by_employee'
  | 'countersigned'
  | 'archived'
  | 'returned';

export interface DeliveryItemDto {
  index: number;
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
  returnedQuantity?: number;
  description: string;
  quantityLabel: string;
}

export interface DeliveryReturnDto {
  at: string;
  actorUid: string;
  actorName: string;
  note?: string;
  items: Array<{ itemIndex: number; quantity: number; conservation: string }>;
}

export interface DeliveryDto {
  id: string;
  status: DeliveryStatus;
  employeeId?: string;
  employee: {
    fullName: string;
    cpf: string;
    cpfFormatted: string;
    cpfMasked: string;
    role: string;
    sector: string;
    slackUserId?: string;
    email?: string;
  };
  items: DeliveryItemDto[];
  itemCount: number;
  totalQuantity: number;
  notes?: string;
  acceptUrl: string;
  tokenExpiresAt: string;
  expired: boolean;
  slackChannel?: string;
  slackMessageTs?: string;
  sentAt?: string;
  employeeSignature: {
    signedAt: string;
    ip?: string;
    userAgent?: string;
    fullName: string;
    imageUrl: string | null;
  } | null;
  adminSignature: {
    signedAt: string;
    adminName: string;
    adminUid: string;
    imageUrl: string | null;
  } | null;
  pdfUrl: string | null;
  pdfGeneratedAt?: string;
  stockWarnings: string[];
  returns: DeliveryReturnDto[];
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  materialId: string;
  materialName: string;
  variantKey: string;
  delta: number;
  stockAfter: number;
  reason:
    | 'material_created'
    | 'manual_adjustment'
    | 'delivery_signed'
    | 'delivery_returned'
    | 'delivery_cancelled';
  deliveryId?: string;
  note?: string;
  actorUid: string;
  actorName: string;
  at: string;
}

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
  updatedAt: string;
}

export interface StockAlert {
  materialId: string;
  materialName: string;
  variantLabel: string;
  variantKey: string;
  stock: number;
  threshold: number;
}

export interface StockSummary {
  materialCount: number;
  variantCount: number;
  totalUnits: number;
  alerts: StockAlert[];
}

export interface NotificationStatus {
  channel: string;
  label: string;
  available: boolean;
  adminChannelConfigured: boolean;
}

export interface DashboardData {
  company: CompanyInfo;
  stock: StockSummary;
  deliveries: {
    counts: Record<DeliveryStatus, number>;
    total: number;
    pendingCountersign: DeliveryDto[];
    awaitingEmployee: DeliveryDto[];
    recent: DeliveryDto[];
  };
  employees: { total: number };
  movements: StockMovement[];
  notifications: NotificationStatus;
  lowStockThreshold: number;
}

/* --------------------------------------------------- página do colaborador */

export interface PublicDeliveryItem {
  index: number;
  name: string;
  description: string;
  brand: string;
  model: string;
  variantLabel: string;
  variantKey: string;
  quantity: number;
  unit: string;
  quantityLabel: string;
  conservation: string;
  customValues: Record<string, string>;
}

export interface PublicDelivery {
  id: string;
  status: DeliveryStatus;
  signed: boolean;
  expired: boolean;
  expiresAt: string;
  company: CompanyInfo;
  employee: { fullName: string; cpf: string; role: string; sector: string };
  items: PublicDeliveryItem[];
  signedAt: string | null;
  createdAt: string;
}

export interface TermContent {
  title: string;
  sections: { identification: string; materials: string; responsibility: string };
  intro: string;
  responsibility: string;
  placeAndDate: string;
}

export interface AdminProfile {
  uid: string;
  email: string;
  name: string;
  dev: boolean;
  hasSavedSignature: boolean;
  savedSignatureUrl: string | null;
}
