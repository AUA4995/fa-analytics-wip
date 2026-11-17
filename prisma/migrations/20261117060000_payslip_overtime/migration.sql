-- Batch 6: overtime hours per payslip (Xero earnings type OVERTIMEEARNINGS); null = read before this was kept
ALTER TABLE "Payslip" ADD COLUMN "overtimeHours" DECIMAL(10,2);
