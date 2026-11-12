import Fastify, { FastifyInstance, FastifyError } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { associadosRoutes } from './modules/associados/associados.routes';
import { cobrancasRoutes } from './modules/cobrancas/cobrancas.routes';
import { webhooksRoutes } from './modules/webhooks/webhooks.routes';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
    ajv: {
      customOptions: {
        strict: false,
      },
    },
  });

  // Configuração do Swagger / OpenAPI
  app.register(swagger, {
    openapi: {
      info: {
        title: 'AEIG — API de Cobrança e Proteção Veicular',
        description:
          'API para gestão de associados, emissão atômica de cobranças e recepção de webhooks de pagamento com controle de idempotência e precisão em centavos.',
        version: '1.0.0',
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Ambiente Local / Docker',
        },
      ],
      tags: [
        { name: 'Associados', description: 'Gestão de associados e validação de CPF' },
        { name: 'Cobranças', description: 'Emissão e consulta de cobranças' },
        { name: 'Webhooks', description: 'Processamento de pagamentos bancários com idempotência' },
      ],
    },
  });

  app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });

  // Tratamento de erros com tipagem estrita
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      return reply.status(400).send({
        error: error.message,
      });
    }
    app.log.error(error);
    return reply.status(error.statusCode || 500).send({
      error: error.message || 'Erro interno no servidor',
    });
  });

  // Rota de Healthcheck
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Registro das rotas dos módulos
  app.register(associadosRoutes);
  app.register(cobrancasRoutes);
  app.register(webhooksRoutes);

  return app;
}
