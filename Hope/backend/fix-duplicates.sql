-- Run this SQL in your PostgreSQL database (psql or pgAdmin) to fix duplicate transporters
-- Replace 'your_org_id' with your actual organization ID

-- Step 1: Find duplicates
WITH duplicates AS (
  SELECT
    organization_id,
    firm_name,
    array_agg(id ORDER BY created_at) as ids
  FROM "Transporter"
  GROUP BY organization_id, firm_name
  HAVING COUNT(*) > 1
)
SELECT * FROM duplicates;

-- Step 2: For each duplicate group, keep the first (oldest) and update references to point to it
-- Run this for each duplicate group found above:

-- Example (replace with actual IDs):
-- UPDATE "Trip" SET transporter_id = 'KEEP_ID' WHERE transporter_id = 'DELETE_ID';
-- UPDATE "RateCard" SET transporter_id = 'KEEP_ID' WHERE transporter_id = 'DELETE_ID';
-- UPDATE "TransporterLedgerEntry" SET transporter_id = 'KEEP_ID' WHERE transporter_id = 'DELETE_ID';
-- UPDATE "Payment" SET transporter_id = 'KEEP_ID' WHERE transporter_id = 'DELETE_ID';
-- DELETE FROM "Transporter" WHERE id = 'DELETE_ID';

-- Step 3: After cleanup, run: npx prisma db push --accept-data-loss