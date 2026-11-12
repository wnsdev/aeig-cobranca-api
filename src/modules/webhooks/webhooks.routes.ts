import { FastifyPluginAsync } from 'fastify';
import { WebhookPagamentoInput } from './webhooks.types';
import { webhookPagamentoSchema } from './webhooks.schemas';
import { isValidCalendarDate } from '../../utils/dates';
import { getPool } from '../../db/pool';

export const webhooksRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: WebhookPagamentoInput }>(
    '/webhooks/pagamento',
    { schema: webhookPagamentoSchema },
    async (request, reply) => {
      const { id_evento, nosso_numero, data_pagamento } = request.body;

      // 1. Validação estrita de data real do calendário (exclui 29/02 fora de bissexto, 31/04, etc.)
      if (!isValidCalendarDate(data_pagamento)) {
        return reply.status(400).send({
          error: 'Data de pagamento inválida. Formato esperado: AAAA-MM-DD com data real do calendário',
        });
      }

      const pool = getPool();
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // 2. Consulta defensiva da cobrança com bloqueio de linha (FOR UPDATE)
        const cobrancaRes = await client.query<{
          id: number;
          nosso_numero: string;
          status: 'PENDENTE' | 'PAGA';
          data_pagamento: string | null;
        }>(
          `SELECT id, nosso_numero, status, to_char(data_pagamento, 'YYYY-MM-DD') as data_pagamento
           FROM cobrancas
           WHERE nosso_numero = $1
           FOR UPDATE`,
          [nosso_numero]
        );

        // Cobrança inexistente: aborta imediatamente com 404, sem persistir o evento no banco
        if (cobrancaRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return reply.status(404).send({
            error: 'Cobrança não encontrada para o nosso_numero informado',
          });
        }

        const cobranca = cobrancaRes.rows[0];

        // 3. Tratamento atômico de idempotência via ON CONFLICT sobre a restrição única de id_evento
        const insertEventRes = await client.query<{ id_evento: string }>(
          `INSERT INTO webhook_eventos (id_evento, nosso_numero, data_pagamento)
           VALUES ($1, $2, $3)
           ON CONFLICT (id_evento) DO NOTHING
           RETURNING id_evento`,
          [id_evento, nosso_numero, data_pagamento]
        );

        // Se nenhuma linha foi retornada, o id_evento já existe no banco
        if (insertEventRes.rows.length === 0) {
          const existingEventRes = await client.query<{
            id_evento: string;
            nosso_numero: string;
            data_pagamento: string;
          }>(
            `SELECT id_evento, nosso_numero, to_char(data_pagamento, 'YYYY-MM-DD') as data_pagamento
             FROM webhook_eventos
             WHERE id_evento = $1`,
            [id_evento]
          );

          const existingEvent = existingEventRes.rows[0];

          // Caso 1: Mesmo id_evento com os mesmos dados -> HTTP 200 idempotente
          if (
            existingEvent &&
            existingEvent.nosso_numero === nosso_numero &&
            existingEvent.data_pagamento === data_pagamento
          ) {
            await client.query('COMMIT');
            return reply.status(200).send({
              mensagem: 'Evento já processado anteriormente',
              id_evento,
              nosso_numero,
              status: 'JA_PROCESSADO',
            });
          }

          // Caso 2: Mesmo id_evento com dados conflitantes -> HTTP 409
          await client.query('ROLLBACK');
          return reply.status(409).send({
            error: 'Conflito: id_evento já registrado com dados diferentes',
          });
        }

        // 4. O evento foi inserido com sucesso (novo evento).
        // Caso 3: Cobrança já constava como PAGA -> registra o evento e responde 200, preservando a data original
        if (cobranca.status === 'PAGA') {
          await client.query('COMMIT');
          return reply.status(200).send({
            mensagem:
              'Evento registrado com sucesso. Cobrança já constava como PAGA, data de pagamento original preservada.',
            id_evento,
            nosso_numero,
            status: 'PAGA',
            data_pagamento: cobranca.data_pagamento,
          });
        }

        // Caso 4: Cobrança PENDENTE -> atualiza status para PAGA e grava data_pagamento
        await client.query(
          `UPDATE cobrancas
           SET status = 'PAGA', data_pagamento = $1
           WHERE id = $2`,
          [data_pagamento, cobranca.id]
        );

        await client.query('COMMIT');
        return reply.status(200).send({
          mensagem: 'Pagamento processado com sucesso',
          id_evento,
          nosso_numero,
          status: 'PAGA',
          data_pagamento,
        });
      } catch (err: any) {
        await client.query('ROLLBACK');
        fastify.log.error(err);
        return reply.status(500).send({
          error: 'Erro interno ao processar webhook de pagamento',
        });
      } finally {
        client.release();
      }
    }
  );
};
