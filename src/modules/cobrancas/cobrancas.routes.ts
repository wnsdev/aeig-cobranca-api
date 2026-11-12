import { FastifyPluginAsync } from 'fastify';
import { CreateCobrancaInput, Cobranca, GetCobrancaParams } from './cobrancas.types';
import { createCobrancaSchema, getCobrancaByNossoNumeroSchema } from './cobrancas.schemas';
import { isValidMonthReference } from '../../utils/dates';
import { getPool } from '../../db/pool';

export const cobrancasRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /cobrancas - Geração de cobrança
  fastify.post<{ Body: CreateCobrancaInput }>(
    '/cobrancas',
    { schema: createCobrancaSchema },
    async (request, reply) => {
      const { associado_id, mes_referencia } = request.body;

      // 1. Validação estrita do mês de referência (formato e range de meses 01..12)
      if (!isValidMonthReference(mes_referencia)) {
        return reply.status(400).send({
          error: 'Mês de referência inválido. Formato esperado: AAAA-MM (com mês entre 01 e 12)',
        });
      }

      const pool = getPool();

      // 2. Busca do associado para recuperar a mensalidade vigente no momento da geração
      const associadoResult = await pool.query<{ id: number; valor_mensalidade_centavos: number }>(
        'SELECT id, valor_mensalidade_centavos FROM associados WHERE id = $1',
        [associado_id]
      );

      if (associadoResult.rows.length === 0) {
        return reply.status(404).send({
          error: 'Associado não encontrado',
        });
      }

      const valorMensalidade = associadoResult.rows[0].valor_mensalidade_centavos;

      try {
        // 3. Geração atômica de nosso_numero através de sequence do banco
        const seqResult = await pool.query<{ num: string }>(
          "SELECT nextval('seq_nosso_numero')::text as num"
        );
        const nossoNumero = seqResult.rows[0].num;

        // 4. Inserção com preservação de valor e status inicial PENDENTE
        const cobrancaResult = await pool.query<Cobranca>(
          `INSERT INTO cobrancas (associado_id, mes_referencia, nosso_numero, valor_centavos, status)
           VALUES ($1, $2, $3, $4, 'PENDENTE')
           RETURNING id, associado_id, mes_referencia, nosso_numero, valor_centavos, status,
                     to_char(data_pagamento, 'YYYY-MM-DD') as data_pagamento, criado_em`,
          [associado_id, mes_referencia, nossoNumero, valorMensalidade]
        );

        return reply.status(201).send(cobrancaResult.rows[0]);
      } catch (err: any) {
        // Código 23505 com restrição uq_associado_mes
        if (err.code === '23505' && err.constraint === 'uq_associado_mes') {
          return reply.status(409).send({
            error: 'Já existe uma cobrança gerada para este associado no mês informado',
          });
        }
        fastify.log.error(err);
        return reply.status(500).send({
          error: 'Erro interno ao gerar cobrança',
        });
      }
    }
  );

  // GET /cobrancas/:nosso_numero - Consulta por nosso número
  fastify.get<{ Params: GetCobrancaParams }>(
    '/cobrancas/:nosso_numero',
    { schema: getCobrancaByNossoNumeroSchema },
    async (request, reply) => {
      const { nosso_numero } = request.params;
      const pool = getPool();

      const result = await pool.query<Cobranca>(
        `SELECT id, associado_id, mes_referencia, nosso_numero, valor_centavos, status,
                to_char(data_pagamento, 'YYYY-MM-DD') as data_pagamento, criado_em
         FROM cobrancas
         WHERE nosso_numero = $1`,
        [nosso_numero]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({
          error: 'Cobrança não encontrada para o nosso_numero informado',
        });
      }

      return reply.status(200).send(result.rows[0]);
    }
  );
};
