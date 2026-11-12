import { Pool } from 'pg';

export interface IDbClient {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number | null }>;
  release(): void;
}

export interface IDbPool {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number | null }>;
  connect(): Promise<IDbClient>;
  end(): Promise<void>;
}

let activePool: IDbPool | null = null;

export function getPool(): IDbPool {
  if (!activePool) {
    const connectionString =
      process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/cobranca_db';
    activePool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return activePool;
}

export function setPool(newPool: IDbPool): void {
  activePool = newPool;
}

export async function closePool(): Promise<void> {
  if (activePool) {
    await activePool.end();
    activePool = null;
  }
}
