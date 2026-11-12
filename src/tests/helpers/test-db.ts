import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { runMigrations } from '../../db/migrate';
import { setPool, IDbPool } from '../../db/pool';

class PGlitePoolAdapter implements IDbPool {
  private pglite: PGlite;
  private txMutex: Promise<void> = Promise.resolve();

  constructor() {
    this.pglite = new PGlite();
  }

  async query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number | null }> {
    if (!params || params.length === 0) {
      // Para scripts com múltiplos comandos DDL / migrations
      if (sql.trim().includes(';') && (sql.includes('CREATE') || sql.includes('TRUNCATE'))) {
        await this.pglite.exec(sql);
        return { rows: [], rowCount: 0 };
      }
    }
    const res = await this.pglite.query<T>(sql, params);
    return {
      rows: res.rows,
      rowCount: res.affectedRows ?? res.rows.length,
    };
  }

  async connect() {
    let releaseMutex: () => void = () => {};
    const currentMutex = this.txMutex;
    this.txMutex = new Promise<void>((resolve) => {
      releaseMutex = resolve;
    });

    await currentMutex;

    return {
      query: async <T = any>(sql: string, params?: any[]) => {
        if (!params || params.length === 0) {
          if (sql.trim().includes(';') && (sql.includes('CREATE') || sql.includes('TRUNCATE'))) {
            await this.pglite.exec(sql);
            return { rows: [], rowCount: 0 };
          }
        }
        const res = await this.pglite.query<T>(sql, params);
        return {
          rows: res.rows,
          rowCount: res.affectedRows ?? res.rows.length,
        };
      },
      release: () => {
        releaseMutex();
      },
    };
  }

  async end(): Promise<void> {
    await this.pglite.close();
  }
}

export async function setupTestDatabase(): Promise<IDbPool> {
  let pool: IDbPool;

  if (process.env.TEST_DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
  } else {
    pool = new PGlitePoolAdapter();
  }

  // Executa o schema DDL no banco de testes separado
  await runMigrations(pool);
  setPool(pool);
  return pool;
}

export async function cleanTestDatabase(pool: IDbPool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE webhook_eventos, cobrancas, associados RESTART IDENTITY CASCADE;
    ALTER SEQUENCE seq_nosso_numero RESTART WITH 10000001;
  `);
}
