-- Ejemplo con datos ficticios. Copia este archivo como accounts.local.sql (no se sube a git)
-- y cambia los datos por tus cuentas reales. Nunca pongas números de tarjeta ni últimos dígitos.
--
-- type: credit_card | debit_card | savings | wallet | cash
-- wallet_card_name: nombre EXACTO que muestra Apple Wallet (NULL si la cuenta no está en Wallet).
--
-- Cada INSERT revisa que la cuenta no exista, así que se puede ejecutar varias veces.

INSERT INTO accounts (name, institution, type, wallet_card_name)
SELECT 'Débito Banco Ejemplo', 'Banco Ejemplo', 'debit_card', 'Debito Ejemplo'
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE name = 'Débito Banco Ejemplo');

INSERT INTO accounts (name, institution, type, wallet_card_name)
SELECT 'Efectivo', NULL, 'cash', NULL
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE name = 'Efectivo');
