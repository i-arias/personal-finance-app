-- Categorías iniciales (CLAUDE.md, sección 6). Se pueden editar desde la app.
-- Los colores se asignan en la Fase 4, junto con los dashboards.

INSERT INTO categories (name, kind) VALUES
  ('Mercado', 'expense'),
  ('Restaurantes y domicilios', 'expense'),
  ('Transporte', 'expense'),
  ('Vivienda', 'expense'),
  ('Servicios públicos', 'expense'),
  ('Celular e internet', 'expense'),
  ('Salud y droguería', 'expense'),
  ('Suscripciones', 'expense'),
  ('Compras y ropa', 'expense'),
  ('Entretenimiento', 'expense'),
  ('Educación', 'expense'),
  ('Viajes', 'expense'),
  ('Cuidado personal', 'expense'),
  ('Mascotas', 'expense'),
  ('Regalos', 'expense'),
  ('Impuestos y comisiones', 'expense'),
  ('Transferencias a personas', 'expense'),
  ('Otros', 'expense'),
  ('Salario', 'income'),
  ('Otros ingresos', 'income'),
  ('Pago de tarjeta de crédito', 'internal'),
  ('Movimiento entre mis cuentas', 'internal');
