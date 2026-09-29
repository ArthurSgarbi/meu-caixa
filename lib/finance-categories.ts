import { getDb, type Database } from '@/db';

export const categorySeeds = [
  ['alimentacao', 'Alimentação', 'expense'],
  ['moradia', 'Moradia', 'expense'],
  ['transporte', 'Transporte', 'expense'],
  ['lazer', 'Lazer', 'expense'],
  ['saude', 'Saúde', 'expense'],
  ['educacao', 'Educação', 'expense'],
  ['outros-gastos', 'Outros gastos', 'expense'],
  ['salario', 'Salário', 'income'],
  ['freelance', 'Freelance', 'income'],
  ['rendimentos', 'Rendimentos', 'income'],
  ['outras-receitas', 'Outras receitas', 'income'],
] as const;

export async function seedCategories(db: Database = getDb()) {
  const now = new Date().toISOString();
  await db.batch(
    categorySeeds.map(([slug, name, type]) =>
      db
        .prepare(
          'INSERT OR IGNORE INTO categories (slug, name, type, created_at) VALUES (?, ?, ?, ?)',
        )
        .bind(slug, name, type, now),
    ),
  );
}
