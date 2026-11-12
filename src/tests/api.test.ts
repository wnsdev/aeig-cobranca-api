process.env.NODE_ENV = 'test';

import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../app';
import { setupTestDatabase, cleanTestDatabase } from './helpers/test-db';
import { IDbPool } from '../db/pool';

describe('Testes de Integração e Regras Críticas da API', () => {
  let pool: IDbPool;
  const app = buildApp();

  before(async () => {
    pool = await setupTestDatabase();
    await app.ready();
  });

  beforeEach(async () => {
    await cleanTestDatabase(pool);
  });

  after(async () => {
    await app.close();
    await pool.end();
  });

  describe('1. Cadastro de Associados (POST /associados)', () => {
    test('deve cadastrar um associado com CPF válido e valor em centavos', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/associados',
        payload: {
          nome: 'Carlos Eduardo Ferreira',
          cpf: '529.982.247-25',
          valor_mensalidade_centavos: 18990,
        },
      });

      assert.equal(response.statusCode, 201);
      const data = JSON.parse(response.payload);
      assert.equal(data.nome, 'Carlos Eduardo Ferreira');
      assert.equal(data.cpf, '52998224725');
      assert.equal(data.valor_mensalidade_centavos, 18990);
      assert.ok(data.id > 0);
    });

    test('deve rejeitar associado com CPF inválido no Módulo 11 (HTTP 400)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/associados',
        payload: {
          nome: 'Associado Inválido',
          cpf: '12345678900',
          valor_mensalidade_centavos: 18990,
        },
      });

      assert.equal(response.statusCode, 400);
      const data = JSON.parse(response.payload);
      assert.match(data.error, /CPF inválido/);
    });

    test('deve rejeitar duplicidade de CPF com HTTP 409', async () => {
      const payload = {
        nome: 'Primeiro Cadastro',
        cpf: '52998224725',
        valor_mensalidade_centavos: 15000,
      };

      const res1 = await app.inject({ method: 'POST', url: '/associados', payload });
      assert.equal(res1.statusCode, 201);

      const res2 = await app.inject({
        method: 'POST',
        url: '/associados',
        payload: {
          nome: 'Tentativa Duplicada',
          cpf: '52998224725',
          valor_mensalidade_centavos: 20000,
        },
      });

      assert.equal(res2.statusCode, 409);
      const data = JSON.parse(res2.payload);
      assert.equal(data.error, 'CPF já cadastrado no sistema');
    });
  });

  describe('2. Geração e Consulta de Cobranças (POST /cobrancas e GET /cobrancas/:nosso_numero)', () => {
    let associadoId: number;

    beforeEach(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/associados',
        payload: {
          nome: 'Mariana Lima',
          cpf: '12345678909',
          valor_mensalidade_centavos: 18990,
        },
      });
      associadoId = JSON.parse(res.payload).id;
    });

    test('deve gerar cobrança com status PENDENTE, nosso número da sequence e valor vigente do associado', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/cobrancas',
        payload: {
          associado_id: associadoId,
          mes_referencia: '2026-10',
        },
      });

      assert.equal(res.statusCode, 201);
      const data = JSON.parse(res.payload);
      assert.equal(data.associado_id, associadoId);
      assert.equal(data.mes_referencia, '2026-10');
      assert.equal(data.valor_centavos, 18990);
      assert.equal(data.status, 'PENDENTE');
      assert.equal(data.data_pagamento, null);
      assert.ok(typeof data.nosso_numero === 'string');
      assert.ok(data.nosso_numero.length > 0);
    });

    test('deve impedir cobrança duplicada para o mesmo associado no mesmo mês (HTTP 409)', async () => {
      const res1 = await app.inject({
        method: 'POST',
        url: '/cobrancas',
        payload: { associado_id: associadoId, mes_referencia: '2026-10' },
      });
      assert.equal(res1.statusCode, 201);

      const res2 = await app.inject({
        method: 'POST',
        url: '/cobrancas',
        payload: { associado_id: associadoId, mes_referencia: '2026-10' },
      });
      assert.equal(res2.statusCode, 409);
      const data = JSON.parse(res2.payload);
      assert.equal(data.error, 'Já existe uma cobrança gerada para este associado no mês informado');
    });

    test('deve consultar cobrança existente pelo nosso_numero', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/cobrancas',
        payload: { associado_id: associadoId, mes_referencia: '2026-11' },
      });
      const criada = JSON.parse(createRes.payload);

      const getRes = await app.inject({
        method: 'GET',
        url: `/cobrancas/${criada.nosso_numero}`,
      });

      assert.equal(getRes.statusCode, 200);
      const data = JSON.parse(getRes.payload);
      assert.equal(data.nosso_numero, criada.nosso_numero);
      assert.equal(data.status, 'PENDENTE');
      assert.equal(data.valor_centavos, 18990);
    });

    test('deve retornar HTTP 404 ao consultar nosso_numero inexistente', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/cobrancas/9999999999',
      });
      assert.equal(res.statusCode, 404);
    });
  });

  describe('3. Webhook de Pagamento com Idempotência e Concorrência (POST /webhooks/pagamento)', () => {
    let nossoNumero: string;

    beforeEach(async () => {
      const assocRes = await app.inject({
        method: 'POST',
        url: '/associados',
        payload: {
          nome: 'Roberto Santos',
          cpf: '05353139003',
          valor_mensalidade_centavos: 18990,
        },
      });
      const associadoId = JSON.parse(assocRes.payload).id;

      const cobRes = await app.inject({
        method: 'POST',
        url: '/cobrancas',
        payload: { associado_id: associadoId, mes_referencia: '2026-10' },
      });
      nossoNumero = JSON.parse(cobRes.payload).nosso_numero;
    });

    test('deve retornar 404 para cobrança inexistente e NÃO persistir o evento', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/pagamento',
        payload: {
          id_evento: 'evt_fantasma_01',
          nosso_numero: '9999999999',
          data_pagamento: '2026-10-15',
        },
      });

      assert.equal(res.statusCode, 404);

      // Garante que o evento NÃO foi inserido no banco
      const checkEvent = await pool.query('SELECT * FROM webhook_eventos WHERE id_evento = $1', [
        'evt_fantasma_01',
      ]);
      assert.equal(checkEvent.rows.length, 0);
    });

    test('deve processar pagamento com sucesso e atualizar cobrança para PAGA', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/pagamento',
        payload: {
          id_evento: 'evt_primeiro_01',
          nosso_numero: nossoNumero,
          data_pagamento: '2026-10-15',
        },
      });

      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.payload);
      assert.equal(data.status, 'PAGA');
      assert.equal(data.data_pagamento, '2026-10-15');

      // Verifica no GET da cobrança
      const check = await app.inject({ method: 'GET', url: `/cobrancas/${nossoNumero}` });
      const cobranca = JSON.parse(check.payload);
      assert.equal(cobranca.status, 'PAGA');
      assert.equal(cobranca.data_pagamento, '2026-10-15');
    });

    test('deve responder HTTP 200 de forma idempotente para mesmo evento e mesmos dados (sem repetir alterações)', async () => {
      const payload = {
        id_evento: 'evt_idempotente_01',
        nosso_numero: nossoNumero,
        data_pagamento: '2026-10-15',
      };

      const res1 = await app.inject({ method: 'POST', url: '/webhooks/pagamento', payload });
      assert.equal(res1.statusCode, 200);

      const res2 = await app.inject({ method: 'POST', url: '/webhooks/pagamento', payload });
      assert.equal(res2.statusCode, 200);
      const data2 = JSON.parse(res2.payload);
      assert.equal(data2.status, 'JA_PROCESSADO');

      // Apenas 1 registro na tabela webhook_eventos
      const checkEvents = await pool.query(
        'SELECT * FROM webhook_eventos WHERE id_evento = $1',
        ['evt_idempotente_01']
      );
      assert.equal(checkEvents.rows.length, 1);
    });

    test('deve garantir tratamento correto em eventos simultâneos repetidos (concorrência)', async () => {
      const payload = {
        id_evento: 'evt_concorrente_01',
        nosso_numero: nossoNumero,
        data_pagamento: '2026-10-15',
      };

      // Dispara 5 requisições em paralelo com o mesmo id_evento
      const responses = await Promise.all([
        app.inject({ method: 'POST', url: '/webhooks/pagamento', payload }),
        app.inject({ method: 'POST', url: '/webhooks/pagamento', payload }),
        app.inject({ method: 'POST', url: '/webhooks/pagamento', payload }),
        app.inject({ method: 'POST', url: '/webhooks/pagamento', payload }),
        app.inject({ method: 'POST', url: '/webhooks/pagamento', payload }),
      ]);

      // Todas devem ter respondido com sucesso (200)
      for (const res of responses) {
        assert.equal(res.statusCode, 200);
      }

      // No banco, o evento deve estar registrado exatamente 1 vez
      const count = await pool.query(
        'SELECT COUNT(*)::int as total FROM webhook_eventos WHERE id_evento = $1',
        ['evt_concorrente_01']
      );
      assert.equal(count.rows[0].total, 1);
    });

    test('deve retornar HTTP 409 quando o mesmo id_evento for reenviado com dados diferentes', async () => {
      const payloadOriginal = {
        id_evento: 'evt_conflito_01',
        nosso_numero: nossoNumero,
        data_pagamento: '2026-10-15',
      };

      const res1 = await app.inject({
        method: 'POST',
        url: '/webhooks/pagamento',
        payload: payloadOriginal,
      });
      assert.equal(res1.statusCode, 200);

      // Mesmo id_evento, porém com data_pagamento diferente
      const payloadConflitante = {
        id_evento: 'evt_conflito_01',
        nosso_numero: nossoNumero,
        data_pagamento: '2026-10-20',
      };

      const res2 = await app.inject({
        method: 'POST',
        url: '/webhooks/pagamento',
        payload: payloadConflitante,
      });

      assert.equal(res2.statusCode, 409);
      const data2 = JSON.parse(res2.payload);
      assert.match(data2.error, /Conflito: id_evento/);
    });

    test('deve registrar novo evento para cobrança já paga e preservar data de pagamento original', async () => {
      // 1. Paga a cobrança com o primeiro evento em 15/10/2026
      await app.inject({
        method: 'POST',
        url: '/webhooks/pagamento',
        payload: {
          id_evento: 'evt_paga_01',
          nosso_numero: nossoNumero,
          data_pagamento: '2026-10-15',
        },
      });

      // 2. Chega um NOVO evento para a mesma cobrança em 18/10/2026
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/pagamento',
        payload: {
          id_evento: 'evt_paga_02_novo',
          nosso_numero: nossoNumero,
          data_pagamento: '2026-10-18',
        },
      });

      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.payload);
      assert.equal(data.status, 'PAGA');
      // Deve preservar a data original (2026-10-15), não sobrescrever com 2026-10-18
      assert.equal(data.data_pagamento, '2026-10-15');

      // Verifica na cobrança persistida
      const cobRes = await app.inject({ method: 'GET', url: `/cobrancas/${nossoNumero}` });
      const cobranca = JSON.parse(cobRes.payload);
      assert.equal(cobranca.data_pagamento, '2026-10-15');

      // Mas o novo evento DEVE estar registrado na tabela de auditoria
      const eventRes = await pool.query(
        'SELECT * FROM webhook_eventos WHERE id_evento = $1',
        ['evt_paga_02_novo']
      );
      assert.equal(eventRes.rows.length, 1);
    });

    test('deve rejeitar data inexistente no calendário (ex: 29/02 em ano não bissexto) com HTTP 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/pagamento',
        payload: {
          id_evento: 'evt_bissexto_invalido',
          nosso_numero: nossoNumero,
          data_pagamento: '2026-02-29', // 2026 não é bissexto!
        },
      });

      assert.equal(res.statusCode, 400);
      const data = JSON.parse(res.payload);
      assert.match(data.error, /Data de pagamento inválida/);
    });
  });
});
