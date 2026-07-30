-- Custom SQL migration file, put your code below! --
INSERT INTO "currencies" ("code", "name", "decimals", "kind") VALUES
('USD', 'Dólar estadounidense', 2, 'fiat'),
('COP', 'Peso colombiano', 2, 'fiat');
