import { FastifySchema } from 'fastify';

export const createCobrancaSchema: FastifySchema = {
  description: 'Gera uma cobrança com status PENDENTE para um associado e mês de referência específico',
  tags: ['Cobranças'],
  body: {
    type: 'object',
    required: ['associado_id', 'mes_referencia'],
    properties: {
      associado_id: {
        type: 'integer',
        minimum: 1,
        description: 'Identificador único do associado',
        example: 1,
      },
      mes_referencia: {
        type: 'string',
        pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$',
        description: 'Mês de referência no formato AAAA-MM (01 a 12)',
        example: '2026-10',
      },
    },
  },
  response: {
    201: {
      description: 'Cobrança gerada com sucesso',
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        associado_id: { type: 'integer', example: 1 },
        mes_referencia: { type: 'string', example: '2026-10' },
        nosso_numero: { type: 'string', example: '10000001' },
        valor_centavos: { type: 'integer', example: 18990 },
        status: { type: 'string', enum: ['PENDENTE', 'PAGA'], example: 'PENDENTE' },
        data_pagamento: { type: ['string', 'null'], example: null },
        criado_em: { type: 'string', format: 'date-time' },
      },
    },
    400: {
      description: 'Parâmetros inválidos ou mês de referência fora do padrão',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Mês de referência inválido. Formato esperado: AAAA-MM (com mês entre 01 e 12)' },
      },
    },
    404: {
      description: 'Associado não localizado',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Associado não encontrado' },
      },
    },
    409: {
      description: 'Cobrança duplicada para o mesmo associado no mesmo mês',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Já existe uma cobrança gerada para este associado no mês informado' },
      },
    },
  },
};

export const getCobrancaByNossoNumeroSchema: FastifySchema = {
  description: 'Consulta uma cobrança cadastrada a partir do seu nosso número único',
  tags: ['Cobranças'],
  params: {
    type: 'object',
    required: ['nosso_numero'],
    properties: {
      nosso_numero: {
        type: 'string',
        description: 'Nosso número da cobrança',
        example: '10000001',
      },
    },
  },
  response: {
    200: {
      description: 'Dados da cobrança consultada',
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        associado_id: { type: 'integer', example: 1 },
        mes_referencia: { type: 'string', example: '2026-10' },
        nosso_numero: { type: 'string', example: '10000001' },
        valor_centavos: { type: 'integer', example: 18990 },
        status: { type: 'string', enum: ['PENDENTE', 'PAGA'], example: 'PENDENTE' },
        data_pagamento: { type: ['string', 'null'], example: null },
        criado_em: { type: 'string', format: 'date-time' },
      },
    },
    404: {
      description: 'Cobrança não encontrada',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Cobrança não encontrada para o nosso_numero informado' },
      },
    },
  },
};
