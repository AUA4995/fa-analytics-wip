-- Batch 3 review: installs made before the agreed office split (06/11/2026) get it too — only where a pool still has
-- its old default driver (anything changed by hand in Settings is left alone).
UPDATE "CostPool" SET driver = 'TICKET_SCORE', name = 'Customer service (support)', description = 'Support staff — spread by each client''s weighted ticket score' WHERE key = 'csr' AND driver = 'MINUTES';
UPDATE "CostPool" SET driver = 'REVENUE', name = 'Management & office', description = 'Management, office costs — spread by revenue' WHERE key = 'admin' AND driver = 'LABOUR_MINUTES';
UPDATE "CostPool" SET driver = 'REVENUE', description = 'WMS, Dyspach, subscriptions — spread by revenue (Logiwa credits tracked separately)' WHERE key = 'software' AND driver = 'ORDERS';
INSERT INTO "CostPool" (key, name, kind, site, driver, description, "sortOrder", "updatedAt")
SELECT 'accounts', 'Accounts', 'LABOUR', NULL, 'INVOICES_TICKETS', 'Accounts staff — spread by invoices and accounts tickets', 3, now()
WHERE EXISTS (SELECT 1 FROM "CostPool") AND NOT EXISTS (SELECT 1 FROM "CostPool" WHERE key = 'accounts');
