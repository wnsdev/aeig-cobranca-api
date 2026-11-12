# AEIG — Mini-API de Cobrança e Proteção Veicular

Microsserviço de emissão e acompanhamento de cobranças desenvolvido para o teste prático da AEIG, contemplando cadastro de associados com validação algorítmica de CPF, emissão atômica de cobranças com `nosso_numero` único, recepção de webhooks de pagamento com garantia de idempotência sob alta concorrência e documentação OpenAPI interativa em `/docs`.

---

## 1. Stack Tecnológica e Decisões de Arquitetura

* **Linguagem & Runtime:** TypeScript com Node.js (v20+ / v24).
* **Framework Web:** Fastify v5 (alta taxa de transferência de I/O, overhead mínimo e validação nativa de payload com Ajv).
* **Banco de Dados & Driver:** PostgreSQL 16 com o driver nativo `pg` (node-postgres).
  * *Justificativa do driver `pg`:* Escolhido pela simplicidade, controle direto de conexões do pool e transparência imediata nas consultas SQL. Permite isolamento transacional estrito (`BEGIN ... COMMIT / ROLLBACK`), row-level locks (`FOR UPDATE`) e tratamento de conflitos atômicos (`ON CONFLICT`), sem as abstrações ou a sobrecarga de compilação de ORMs pesados.
* **Documentação Interativa:** Swagger / OpenAPI via `@fastify/swagger` e `@fastify/swagger-ui` acessível em `/docs`.
* **Containerização:** Docker e Docker Compose com subida orquestrada, healthcheck do banco de dados e execução automática de migrations DDL no boot.

---

## 2. Decisões de Modelagem e Regras de Negócio

1. **Valores Monetários em Centavos:**
   * Entradas (`POST /associados`): Campo `valor_mensalidade_centavos` (inteiro positivo, ex: `18990` para R$ 189,90).
   * Cobranças (`POST /cobrancas` e `GET /cobrancas/:nosso_numero`): Campo `valor_centavos` (inteiro positivo).
   * Elimina completamente imprecisões de arredondamento de ponto flutuante binário (IEEE-754) nas camadas de persistência e negócio.
   * A cobrança **preserva o valor da mensalidade vigente** no instante de sua geração, protegendo o histórico caso a mensalidade do associado seja alterada no futuro.

2. **Geração de `nosso_numero` via Sequence:**
   * Utiliza a sequência do PostgreSQL `seq_nosso_numero`, retornada diretamente como string textual (`VARCHAR(50)`).
   * Evita colisões mesmo sob concorrência intensa sem impor truncamento artificial em 8 caracteres.

3. **Validação de CPF (Módulo 11):**
   * Sanitização de pontuações, validação de tamanho (11 dígitos), bloqueio de dígitos repetidos (`11111111111`, etc.) e cálculo canônico dos dois dígitos verificadores com a fórmula da Receita Federal.
   * Restrição de unicidade (`UNIQUE`) no banco para impedir associados duplicados.

4. **Validação de Calendário:**
   * Mês de referência no formato `AAAA-MM` com validação de mês civil (`01` a `12`).
   * Data de pagamento no formato `AAAA-MM-DD` com verificação de data real do calendário gregoriano (rejeita datas inexistentes como `2026-02-29` ou `2026-04-31`).

5. **Webhook de Pagamento: Idempotência Atômica sob Concorrência:**
   * Todo o processamento ocorre **na mesma conexão do pool** (`client = await pool.connect()`) dentro de uma transação explícita com liberação garantida no bloco `finally`.
   * **Fluxo de execução:**
     1. `SELECT ... FROM cobrancas WHERE nosso_numero = $1 FOR UPDATE`: Bloqueia a linha da cobrança para serialização de concorrência.
     2. Se a cobrança **não existir**, efetua `ROLLBACK` e responde **HTTP 404** imediatamente, **sem persistir o evento no banco**.
     3. Insere atomicamente em `webhook_eventos` via `INSERT ... ON CONFLICT (id_evento) DO NOTHING RETURNING id_evento`.
     4. **Tratamento de conflito de `id_evento`:**
        * *Mesmo evento e mesmos dados (`nosso_numero` e `data_pagamento`):* Responde **HTTP 200** com status `JA_PROCESSADO`, sem aplicar alterações redundantes.
        * *Mesmo `id_evento` com dados divergentes:* Responde **HTTP 409 Conflict**.
     5. **Novo evento para cobrança já quitada (`status = 'PAGA'`):**
        * Registra o evento na tabela de auditoria `webhook_eventos` e responde **HTTP 200**, **preservando a data de pagamento original** já registrada na cobrança.
     6. **Cobrança `PENDENTE`:**
        * Atualiza o status para `PAGA`, registra a `data_pagamento` e comita a transação com **HTTP 200**.

6. **Estratégia de Validação e Tipagem (TypeScript + JSON Schema):**
   * Tipos estáticos e schemas de runtime foram mantidos coerentes através de interfaces TypeScript correspondentes e esquemas JSON declarados diretamente com Fastify e Swagger.
   * O Fastify compila o schema com Ajv na inicialização das rotas, garantindo rejeição imediata de payloads malformados com HTTP 400 antes de atingir os handlers, enquanto o compilador TypeScript valida os tipos estáticos em tempo de compilação sem necessidade de geradores de código intermediários.

---

## 3. Como Rodar o Projeto

### Pré-requisitos
* Docker e Docker Compose instalados.

### Subindo com Docker Compose (Ambiente Completo)
```bash
docker compose up --build
```
O comando:
1. Sobe o container do PostgreSQL (`postgres:16-alpine`), aguarda o healthcheck de prontidão (`pg_isready`).
2. Constrói a imagem da API via multi-stage build.
3. Executa as migrations do banco automaticamente ao inicializar.
4. Disponibiliza a API na porta `3000`.

* **API:** `http://localhost:3000`
* **Swagger / OpenAPI:** `http://localhost:3000/docs`
* **Healthcheck:** `http://localhost:3000/health`

---

## 4. Como Rodar os Testes Automatizados

O projeto utiliza o runner nativo do Node.js (`node:test`) acoplado ao `tsx`, executando em frações de segundo sem sobrecarga de frameworks externos de teste.

Para isolamento estrito, os testes utilizam um banco de testes separado (com WebAssembly em memória via `@electric-sql/pglite` ou uma base PostgreSQL isolada apontada por `TEST_DATABASE_URL`).

```bash
# Instalar dependências locais (caso queira rodar fora do Docker)
npm install

# Executar toda a suíte de testes (CPF, Cálculos de Juros e Testes e2e de API)
npm test

# Compilar o TypeScript para produção
npm run build
```

---

## 5. Exemplos de Chamadas da API (cURL)

### 1. Cadastrar Associado
```bash
curl -X POST http://localhost:3000/associados \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Carlos Eduardo Ferreira",
    "cpf": "52998224725",
    "valor_mensalidade_centavos": 18990
  }'
```
**Resposta (HTTP 201 Created):**
```json
{
  "id": 1,
  "nome": "Carlos Eduardo Ferreira",
  "cpf": "52998224725",
  "valor_mensalidade_centavos": 18990,
  "criado_em": "2026-11-11T22:20:00.000Z"
}
```

### 2. Gerar Cobrança para o Mês
```bash
curl -X POST http://localhost:3000/cobrancas \
  -H "Content-Type: application/json" \
  -d '{
    "associado_id": 1,
    "mes_referencia": "2026-10"
  }'
```
**Resposta (HTTP 201 Created):**
```json
{
  "id": 1,
  "associado_id": 1,
  "mes_referencia": "2026-10",
  "nosso_numero": "10000001",
  "valor_centavos": 18990,
  "status": "PENDENTE",
  "data_pagamento": null,
  "criado_em": "2026-11-11T22:20:05.000Z"
}
```

### 3. Consultar Cobrança por Nosso Número
```bash
curl -X GET http://localhost:3000/cobrancas/10000001
```
**Resposta (HTTP 200 OK):**
```json
{
  "id": 1,
  "associado_id": 1,
  "mes_referencia": "2026-10",
  "nosso_numero": "10000001",
  "valor_centavos": 18990,
  "status": "PENDENTE",
  "data_pagamento": null,
  "criado_em": "2026-11-11T22:20:05.000Z"
}
```

### 4. Processar Webhook de Pagamento
```bash
curl -X POST http://localhost:3000/webhooks/pagamento \
  -H "Content-Type: application/json" \
  -d '{
    "id_evento": "evt_000123",
    "nosso_numero": "10000001",
    "data_pagamento": "2026-10-15"
  }'
```
**Resposta (HTTP 200 OK):**
```json
{
  "mensagem": "Pagamento processado com sucesso",
  "id_evento": "evt_000123",
  "nosso_numero": "10000001",
  "status": "PAGA",
  "data_pagamento": "2026-10-15"
}
```

### 5. Reenvio Idempotente do Mesmo Webhook
```bash
curl -X POST http://localhost:3000/webhooks/pagamento \
  -H "Content-Type: application/json" \
  -d '{
    "id_evento": "evt_000123",
    "nosso_numero": "10000001",
    "data_pagamento": "2026-10-15"
  }'
```
**Resposta (HTTP 200 OK):**
```json
{
  "mensagem": "Evento já processado anteriormente",
  "id_evento": "evt_000123",
  "nosso_numero": "10000001",
  "status": "JA_PROCESSADO"
}
```

---

## 6. Parte B — Resolução de Defeitos

A análise completa, o diagnóstico didático dos cinco defeitos e os cálculos detalhados dos quatro cenários de teste de R$ 189,90 encontram-se detalhados no arquivo [`BUGS.md`](./BUGS.md).

---

## 7. Limitações Conhecidas e Próximos Passos

1. **Autenticação de Webhook (HMAC-SHA256):** Sugerido como item bônus no enunciado, um cabeçalho `X-Assinatura` com chave secreta simétrica seria o próximo passo de segurança para validar a autenticidade da origem bancária em produção.
2. **Paginação de Consultas:** O endpoint `GET /cobrancas/:nosso_numero` atende a consulta individual. Futuramente, uma listagem geral de cobranças com paginação baseada em cursor (`limit` e `starting_after`) traria escalabilidade ao painel administrativo.
3. **Mecanismo de Retentativa e Dead Letter Queue (DLQ):** Em um ambiente bancário de grande escala, eventos não entregues poderiam ser consumidos por uma fila resiliente para processamento assíncrono.

---

## 8. Divulgação do Uso de IA (AI Disclosure)

Conforme estabelecido nas regras de avaliação da AEIG:
* Ferramentas de IA foram utilizadas como copiloto de arquitetura para auxílio na estruturação inicial dos contratos OpenAPI, elaboração de testes de concorrência e geração de casos de teste para o algoritmo de Módulo 11 de CPF.
* Toda a modelagem relacional, estratégias de isolamento transacional ACID, lógica atômica de idempotência e a depuração matemática da função de juros e multas da Parte B foram especificadas, revisadas e dominadas pelo desenvolvedor, estando plenamente capacitado a explicar e ajustar qualquer trecho de código ao vivo na apresentação técnica.
