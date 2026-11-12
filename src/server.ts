import { buildApp } from './app';
import { getPool, closePool } from './db/pool';
import { runMigrations } from './db/migrate';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  const app = buildApp();
  const pool = getPool();

  try {
    console.log('Verificando e executando migrations no banco de dados...');
    await runMigrations(pool);
    console.log('Banco de dados pronto.');

    await app.listen({ port: PORT, host: HOST });
    console.log(`Servidor rodando em http://${HOST}:${PORT}`);
    console.log(`Documentação Swagger disponível em http://${HOST}:${PORT}/docs`);
  } catch (err) {
    app.log.error(err);
    await closePool();
    process.exit(1);
  }

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      console.log(`Recebido sinal ${signal}, encerrando graciosamente...`);
      await app.close();
      await closePool();
      process.exit(0);
    });
  }
}

start();
