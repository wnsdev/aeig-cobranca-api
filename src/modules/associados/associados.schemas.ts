import { FastifySchema } from 'fastify';

export const createAssociadoSchema: FastifySchema = {
  description: 'Cadastra um novo associado com validação de CPF e valor de mensalidade em centavos',
  tags: ['Associados'],
  body: {
    type: 'object',
    required: ['nome', 'cpf', 'valor_mensalidade_centavos'],
    properties: {
      nome: {
        type: 'string',
        minLength: 2,
        maxLength: 150,
        description: 'Nome completo do associado',
        example: 'Carlos Eduardo Ferreira',
      },
      cpf: {
        type: 'string',
        description: 'CPF válido com ou sem pontuação (será sanitizado e validado via Módulo 11)',
        example: '52998224725',
      },
      valor_mensalidade_centavos: {
        type: 'integer',
        minimum: 1,
        description: 'Valor da mensalidade em centavos (ex: R$ 189,90 = 18990 centavos)',
        example: 18990,
      },
    },
  },
  response: {
    201: {
      description: 'Associado cadastrado com sucesso',
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        nome: { type: 'string', example: 'Carlos Eduardo Ferreira' },
        cpf: { type: 'string', example: '52998224725' },
        valor_mensalidade_centavos: { type: 'integer', example: 18990 },
        criado_em: { type: 'string', format: 'date-time' },
      },
    },
    400: {
      description: 'Dados inválidos ou CPF matematicamente inválido',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'CPF inválido ou com dígitos verificadores incorretos' },
      },
    },
    409: {
      description: 'CPF já cadastrado para outro associado',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'CPF já cadastrado no sistema' },
      },
    },
  },
};
