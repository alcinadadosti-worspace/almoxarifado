/**
 * Popula o catálogo com os materiais de exemplo do Grupo Alcina Maria.
 * Uso: `npm run seed --workspace server` (ou `npm run seed` na raiz).
 *      `npm run seed -- --force` recria os registros de exemplo.
 */
import { env } from './config/env';
import { collections, datastore, getSettings } from './data';
import type { Employee, Material } from './domain/types';
import { newId } from './utils/ids';

const now = () => new Date().toISOString();

type MaterialSeed = Omit<Material, 'id' | 'createdAt' | 'updatedAt'>;

const materials: MaterialSeed[] = [
  {
    name: 'Camisa',
    category: 'Fardamento',
    brand: 'ACQUA',
    model: 'Social manga curta',
    conservationDefault: 'Novo',
    variantLabel: 'Tamanho',
    variantType: 'letter',
    variants: [
      { key: 'PP', stock: 20 },
      { key: 'P', stock: 10 },
      { key: 'M', stock: 14 },
      { key: 'G', stock: 5 },
      { key: 'GG', stock: 8 },
    ],
    customFields: [
      { label: 'Cor', type: 'select', options: ['Branco', 'Preto', 'Areia'], defaultValue: 'Branco' },
      { label: 'Tecido', type: 'text', defaultValue: 'Algodão penteado' },
    ],
    unit: 'unidade',
    notes: 'Peça padrão do uniforme de loja.',
    active: true,
  },
  {
    name: 'Calça',
    category: 'Fardamento',
    brand: 'ACQUA',
    model: 'Alfaiataria reta',
    conservationDefault: 'Novo',
    variantLabel: 'Numeração',
    variantType: 'number',
    variants: [
      { key: '35', stock: 3, minStock: 2 },
      { key: '40', stock: 6 },
      { key: '45', stock: 4 },
    ],
    customFields: [{ label: 'Cor', type: 'select', options: ['Preto', 'Grafite'], defaultValue: 'Preto' }],
    unit: 'dezena',
    notes: 'Controlada em dezenas junto ao fornecedor.',
    active: true,
  },
  {
    name: 'Tênis',
    category: 'Calçados',
    brand: 'ACQUA',
    model: 'Comfort antiderrapante',
    conservationDefault: 'Novo',
    variantLabel: 'Numeração',
    variantType: 'number',
    variants: [
      { key: '34', stock: 2, minStock: 2 },
      { key: '36', stock: 6 },
      { key: '38', stock: 9 },
      { key: '40', stock: 7 },
      { key: '42', stock: 4 },
    ],
    customFields: [{ label: 'Cor', type: 'select', options: ['Branco', 'Preto'], defaultValue: 'Branco' }],
    unit: 'par',
    active: true,
  },
  {
    name: 'Moletom',
    category: 'Fardamento',
    brand: 'ACQUA',
    model: 'Fechado com zíper',
    conservationDefault: 'Novo',
    variantLabel: 'Tamanho',
    variantType: 'letter',
    variants: [
      { key: 'P', stock: 7 },
      { key: 'M', stock: 11 },
      { key: 'G', stock: 6 },
      { key: 'GG', stock: 3 },
    ],
    customFields: [{ label: 'Cor', type: 'select', options: ['Grafite', 'Areia'], defaultValue: 'Grafite' }],
    unit: 'unidade',
    active: true,
  },
  {
    name: 'Blazer',
    category: 'Fardamento',
    brand: 'ACQUA',
    model: 'Corte alfaiataria',
    conservationDefault: 'Novo',
    variantLabel: 'Tamanho',
    variantType: 'letter',
    variants: [
      { key: 'P', stock: 4 },
      { key: 'M', stock: 5 },
      { key: 'G', stock: 2, minStock: 2 },
    ],
    customFields: [
      { label: 'Cor', type: 'select', options: ['Preto', 'Off-white'], defaultValue: 'Preto' },
      { label: 'Forro', type: 'text' },
    ],
    unit: 'unidade',
    active: true,
  },
  {
    name: 'Crachá funcional',
    category: 'Identificação',
    brand: 'Grupo Alcina Maria',
    model: 'PVC com cordão',
    conservationDefault: 'Novo',
    variantLabel: 'Unidade',
    variantType: 'custom',
    variants: [{ key: 'Padrão', stock: 40 }],
    customFields: [{ label: 'Loja', type: 'text' }],
    unit: 'unidade',
    active: true,
  },
];

const employees: Array<Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>> = [
  {
    fullName: 'Mariana Duarte Albuquerque',
    cpf: '52998224725',
    role: 'Consultora de Beleza',
    sector: 'Loja Penedo — Centro',
    active: true,
  },
  {
    fullName: 'Rafael Santos Lima',
    cpf: '11144477735',
    role: 'Estoquista',
    sector: 'Almoxarifado',
    active: true,
  },
];

async function run(): Promise<void> {
  const force = process.argv.includes('--force');

  // Estes são dados de DEMONSTRAÇÃO. Bastou uma chave de serviço na pasta para
  // um `npm run seed` distraído gravá-los no Firestore de produção — então,
  // fora do driver local, só com pedido explícito.
  if (datastore.driver === 'firestore' && !process.argv.includes('--production')) {
    console.error('');
    console.error('  ✖  Este comando gravaria materiais de EXEMPLO no Firestore real');
    console.error(`     (projeto ${env.firebase.projectId || 'desconhecido'}).`);
    console.error('');
    console.error('     Para o ambiente local:   DATA_DRIVER=local npm run seed');
    console.error('     Se for intencional:      npm run seed -- --production');
    console.error('');
    process.exit(1);
  }
  console.info(`[seed] destino: ${datastore.driver === 'firestore' ? 'Firestore' : 'driver local (.data)'}`);

  await getSettings();

  const existing = await collections.materials.list();
  if (existing.length && !force) {
    console.info(
      `[seed] ${existing.length} materiais já cadastrados — nada a fazer. ` +
        'Use `-- --force` para recriar os exemplos.',
    );
  } else {
    for (const seed of materials) {
      const duplicate = existing.find((material) => material.name === seed.name);
      const id = duplicate?.id ?? newId('mat_');
      await collections.materials.set({
        ...seed,
        id,
        createdAt: duplicate?.createdAt ?? now(),
        updatedAt: now(),
      });
      const total = seed.variants.reduce((sum, variant) => sum + variant.stock, 0);
      console.info(`  ✓ ${seed.name.padEnd(18)} ${seed.variants.length} variantes · ${total} ${seed.unit}(s)`);
    }
  }

  const currentEmployees = await collections.employees.list();
  for (const seed of employees) {
    if (currentEmployees.some((employee) => employee.cpf === seed.cpf)) continue;
    await collections.employees.set({ ...seed, id: newId('col_'), createdAt: now(), updatedAt: now() });
    console.info(`  ✓ colaborador ${seed.fullName}`);
  }

  console.info('\n[seed] concluído.');
}

run().catch((error) => {
  console.error('[seed] falhou', error);
  process.exit(1);
});
