import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const { Client } = pg;
const FIRST_MANAGED_MIGRATION =
  '20260920000000_clictopay_payment_status_unknown';
const HOSTED_PAYMENT_MIGRATION =
  '20260920000001_clictopay_hosted_payments';
const prismaCli = './node_modules/prisma/build/index.js';

function runPrisma(args) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function baselineLegacyDbPushDatabase() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(`
      SELECT
        to_regclass('public."_prisma_migrations"') IS NOT NULL AS has_migrations,
        (
          SELECT COUNT(*)::int
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name <> '_prisma_migrations'
        ) AS app_tables
    `);
    const state = result.rows[0];
    if (state.has_migrations || Number(state.app_tables) === 0) return;

    console.log(
      'Legacy db-push database detected; baselining historical migrations before deploy.',
    );
    const historical = readdirSync('./prisma/migrations', { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name < FIRST_MANAGED_MIGRATION)
      .map((entry) => entry.name)
      .sort();
    for (const migration of historical) {
      runPrisma(['migrate', 'resolve', '--applied', migration]);
    }
  } finally {
    await client.end();
  }
}

async function recoverKnownEnumTransactionFailure() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const migrationsTable = await client.query(
      `SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS present`,
    );
    if (!migrationsTable.rows[0].present) return;

    const failed = await client.query(
      `SELECT logs
       FROM "_prisma_migrations"
       WHERE migration_name = $1
         AND finished_at IS NULL
         AND rolled_back_at IS NULL
       ORDER BY started_at DESC
       LIMIT 1`,
      [HOSTED_PAYMENT_MIGRATION],
    );
    if (failed.rowCount === 0) return;

    const currencyColumn = await client.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'Payment'
         AND column_name = 'currency'`,
    );
    const isKnownRolledBackFailure =
      String(failed.rows[0].logs).includes('unsafe use of new value "unknown"') &&
      currencyColumn.rowCount === 0;
    if (!isKnownRolledBackFailure) {
      throw new Error(
        `Migration ${HOSTED_PAYMENT_MIGRATION} failed for an unknown reason; manual review is required.`,
      );
    }

    console.log(
      'Recovering the known ClicToPay enum transaction failure before deploy.',
    );
    runPrisma(['migrate', 'resolve', '--rolled-back', HOSTED_PAYMENT_MIGRATION]);
  } finally {
    await client.end();
  }
}

await baselineLegacyDbPushDatabase();
await recoverKnownEnumTransactionFailure();
runPrisma(['migrate', 'deploy']);
