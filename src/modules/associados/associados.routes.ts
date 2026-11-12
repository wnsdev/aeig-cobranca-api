import { FastifyPluginAsync } from 'fastify';
import { CreateAssociadoInput, Associado } from './associados.types';
import { createAssociadoSchema } from './associados.schemas';
import { isValidCpf, sanitizeCpf } from '../../utils/cpf';
import { getPool } from '../../db/pool';

export const associadosRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: CreateAssociadoInput }>(
    '/associados',
    { schema: createAssociadoSchema },
    async (request, reply) => {
      const { nome, cpf, valor_mensalidade_centavos } = request.body;

      // 1. Validação canônica de CPF via Módulo 11
      if (!isValidCpf(cpf)) {
        return reply.status(400).send({
          error: 'CPF inválido ou com dígitos verificadores incorretos',
        });
      }

      const cleanCpf = sanitizeCpf(cpf);
      const cleanNome = nome.trim();
      const pool = getPool();

      try {
        const result = await pool.query<Associado>(
          `INSERT INTO associados (nome, cpf, valor_mensalidade_centavos)
           VALUES ($1, $2, $3)
           RETURNING id, nome, cpf, valor_mensalidade_centavos, criado_em`,
          [cleanNome, cleanCpf, valor_mensalidade_centavos]
        );

        return reply.status(201).send(result.rows[0]);
      } catch (err: any) {
        // Código 23505 = unique_violation no PostgreSQL
        if (err.code === '23505') {
          return reply.status(409).send({
            error: 'CPF já cadastrado no sistema',
          });
        }
        fastify.log.error(err);
        return reply.status(500).send({
          error: 'Erro interno ao cadastrar associado',
        });
      }
    }
  );
};
