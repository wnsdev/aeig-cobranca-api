-- Sequência para geração atômica de Nosso Número sem limite arbitrário
CREATE SEQUENCE IF NOT EXISTS seq_nosso_numero START WITH 10000001;

-- Tabela de Associados
CREATE TABLE IF NOT EXISTS associados (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    cpf VARCHAR(11) NOT NULL UNIQUE,
    valor_mensalidade_centavos INTEGER NOT NULL CHECK (valor_mensalidade_centavos > 0),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Cobranças
CREATE TABLE IF NOT EXISTS cobrancas (
    id SERIAL PRIMARY KEY,
    associado_id INTEGER NOT NULL REFERENCES associados(id) ON DELETE RESTRICT,
    mes_referencia CHAR(7) NOT NULL CHECK (mes_referencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    nosso_numero VARCHAR(50) NOT NULL UNIQUE,
    valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'PAGA')),
    data_pagamento DATE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_associado_mes UNIQUE (associado_id, mes_referencia)
);

-- Tabela de Idempotência e Auditoria de Webhooks com Chave Estrangeira
CREATE TABLE IF NOT EXISTS webhook_eventos (
    id_evento VARCHAR(100) PRIMARY KEY,
    nosso_numero VARCHAR(50) NOT NULL REFERENCES cobrancas(nosso_numero) ON DELETE RESTRICT,
    data_pagamento DATE NOT NULL,
    recebido_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices úteis não-redundantes para chaves estrangeiras
CREATE INDEX IF NOT EXISTS idx_cobrancas_associado_id ON cobrancas(associado_id);
CREATE INDEX IF NOT EXISTS idx_webhook_eventos_nosso_numero ON webhook_eventos(nosso_numero);
