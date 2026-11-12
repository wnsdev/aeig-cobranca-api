import { FastifySchema } from 'fastify';

export const webhookPagamentoSchema: FastifySchema = {
  description: 'Webhook bancário para aviso de pagamento com proteção persistente e atômica contra repetições',
  tags: ['Webhooks'],
  body: {
    type: 'object',
    required: ['id_evento', 'nosso_numero', 'data_pagamento'],
    properties: {
      id_evento: {
        type: 'string',
        minLength: 1,
        description: 'Identificador único do evento de pagamento enviado pelo banco',
        example: 'evt_000123',
      },
      nosso_numero: {
        type: 'string',
        minLength: 1,
        description: 'Nosso número da cobrança quitada',
        example: '10000001',
      },
      data_pagamento: {
        type: 'string',
        pattern: '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$',
        description: 'Data do pagamento no formato AAAA-MM-DD com data real do calendário',
        example: '2026-10-15',
      },
    },
  },
  response: {
    200: {
      description: 'Pagamento processado com sucesso ou evento já processado de forma idempotente',
      type: 'object',
      properties: {
        mensagem: { type: 'string', example: 'Pagamento processado com sucesso' },
        id_evento: { type: 'string', example: 'evt_000123' },
        nosso_numero: { type: 'string', example: '10000001' },
        status: { type: 'string', example: 'PAGA' },
        data_pagamento: { type: ['string', 'null'], example: '2026-10-15' },
      },
    },
    400: {
      description: 'Payload inválido ou data inexistente no calendário',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Data de pagamento inválida. Formato esperado: AAAA-MM-DD com data real do calendário' },
      },
    },
    404: {
      description: 'Cobrança não encontrada para o nosso_numero informado',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Cobrança não encontrada para o nosso_numero informado' },
      },
    },
    409: {
      description: 'Conflito: id_evento já existe com dados diferentes',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Conflito: id_evento já registrado com dados diferentes' },
      },
    },
  },
};
