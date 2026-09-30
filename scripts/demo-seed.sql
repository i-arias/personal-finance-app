-- Datos de demostración 100 % ficticios, solo para la base LOCAL:
--   npm run db:migrate:local && npm run db:seed:demo
-- Las fechas son relativas a hoy (hora de Bogotá), así la demo siempre tiene datos del mes actual.
-- Los montos varían ±15 % en cada ejecución.

INSERT INTO accounts (name, institution, type, wallet_card_name) VALUES
  ('Visa Demo', 'Banco Ejemplo', 'credit_card', 'Visa Demo'),
  ('Débito Demo', 'Banco Ejemplo', 'debit_card', 'Debito Demo'),
  ('Billetera Demo', 'Billetera Ejemplo', 'wallet', NULL);

UPDATE categories SET monthly_budget = 900000 WHERE name = 'Mercado';
UPDATE categories SET monthly_budget = 110000 WHERE name = 'Restaurantes y domicilios';
UPDATE categories SET monthly_budget = 185000 WHERE name = 'Transporte';

INSERT INTO rules (pattern, merchant_name, category_id, type, priority)
SELECT 'SUPERMERCADO DEMO', 'Supermercado Demo', id, 'expense', 100 FROM categories WHERE name = 'Mercado'
UNION ALL
SELECT 'DOMICILIOS DEMO', 'Domicilios Demo', id, 'expense', 100 FROM categories WHERE name = 'Restaurantes y domicilios'
UNION ALL
SELECT 'TAXI APP DEMO', 'Taxi App Demo', id, 'expense', 100 FROM categories WHERE name = 'Transporte';

-- 12 meses de movimientos: gastos recurrentes, salario (ingreso) y pago de tarjeta (interno).
WITH RECURSIVE months(n) AS (
  SELECT 0 UNION ALL SELECT n + 1 FROM months WHERE n < 11
),
items(merchant, category, pesos, day, account, type) AS (
  VALUES
    ('Arriendo', 'Vivienda', 1450000, 1, 'Débito Demo', 'expense'),
    ('Supermercado Demo', 'Mercado', 310000, 3, 'Visa Demo', 'expense'),
    ('Supermercado Demo', 'Mercado', 270000, 17, 'Débito Demo', 'expense'),
    ('Taxi App Demo', 'Transporte', 26000, 5, 'Visa Demo', 'expense'),
    ('Gasolina Demo', 'Transporte', 150000, 14, 'Débito Demo', 'expense'),
    ('Internet Demo', 'Celular e internet', 99000, 8, 'Visa Demo', 'expense'),
    ('Restaurante Demo', 'Restaurantes y domicilios', 84000, 9, 'Visa Demo', 'expense'),
    ('Domicilios Demo', 'Restaurantes y domicilios', 46000, 22, 'Visa Demo', 'expense'),
    ('Droguería Demo', 'Salud y droguería', 52000, 11, 'Billetera Demo', 'expense'),
    ('Energía Demo', 'Servicios públicos', 128000, 12, 'Débito Demo', 'expense'),
    ('Streaming Demo', 'Suscripciones', 38900, 15, 'Visa Demo', 'expense'),
    ('Tienda de Ropa Demo', 'Compras y ropa', 190000, 20, 'Visa Demo', 'expense'),
    ('Cine Demo', 'Entretenimiento', 56000, 26, 'Visa Demo', 'expense'),
    ('Empresa Demo S.A.S.', 'Salario', 5200000, 1, 'Débito Demo', 'income'),
    ('Pago tarjeta Visa Demo', 'Pago de tarjeta de crédito', 1200000, 25, 'Débito Demo', 'internal')
),
rows AS (
  SELECT
    i.*,
    date(date('now', '-5 hours', 'start of month'), '-' || m.n || ' months', '+' || (i.day - 1) || ' days') AS local_date,
    -- Salario y arriendo fijos; el resto varía ±15 %.
    CASE WHEN i.category IN ('Salario', 'Vivienda') THEN i.pesos * 100
         ELSE (i.pesos * (85 + abs(random()) % 31) / 100) * 100 END AS amount_minor
  FROM months m CROSS JOIN items i
)
INSERT INTO transactions (occurred_at, local_date, amount_minor, currency, type, merchant_raw, merchant,
                          category_id, account_id, source, status)
SELECT
  r.local_date || 'T12:30:00-05:00',
  r.local_date,
  r.amount_minor,
  'COP',
  r.type,
  upper(r.merchant),
  r.merchant,
  c.id,
  a.id,
  CASE WHEN r.account = 'Visa Demo' THEN 'apple_pay' ELSE 'manual' END,
  'ok'
FROM rows r
JOIN categories c ON c.name = r.category
JOIN accounts a ON a.name = r.account
WHERE r.local_date <= date('now', '-5 hours');

-- Algunos casos especiales del mes actual: por revisar y una compra en dólares.
INSERT INTO transactions (occurred_at, local_date, amount_minor, currency, type, merchant_raw, merchant,
                          category_id, account_id, source, status, raw_payload)
SELECT
  date('now', '-5 hours') || 'T09:15:00-05:00', date('now', '-5 hours'), 1850000, 'COP', 'expense',
  'COMERCIO NUEVO DEMO', 'COMERCIO NUEVO DEMO', c.id, a.id, 'apple_pay', 'review',
  '{"merchant":"COMERCIO NUEVO DEMO","amount_text":"$18.500,00","card":"Visa Demo","occurred_at":"(demo)"}'
FROM categories c, accounts a WHERE c.name = 'Otros' AND a.name = 'Visa Demo'
UNION ALL
SELECT
  date('now', '-5 hours') || 'T08:00:00-05:00', date('now', '-5 hours'), 999, 'USD', 'expense',
  'APP STORE DEMO', 'App Store Demo', c.id, a.id, 'apple_pay', 'ok', NULL
FROM categories c, accounts a WHERE c.name = 'Suscripciones' AND a.name = 'Visa Demo';
