# BUGS.md — Análise de Defeitos e Correção da Função de Cobrança

Este documento analisa a função `calcularValorAtualizado` utilizada para calcular juros e multa em mensalidades pagas após o vencimento, aponta os defeitos identificados, explica o impacto direto para o associado, apresenta a implementação corrigida e demonstra os valores esperados para os cenários de teste da AEIG.

---

## 1. Código Original com Defeitos

```typescript
function calcularValorAtualizado(
  valor: number,
  vencimento: string,
  dataPagamento: string
): number {
  const venc = new Date(vencimento);
  const pag = new Date(dataPagamento);
  const diasAtraso = Math.floor(
    (pag.getTime() - venc.getTime()) / 86400000
  );
  let total = valor;
  for (let i = 0; i <= diasAtraso; i++) {
    total = total + valor * 0.02 + total * 0.00033;
  }
  return total;
}
```

---

## 2. Diagnóstico dos Defeitos e Efeito para o Associado

### Defeito 1: Cobrança indevida no pagamento em dia (no próprio vencimento)
* **Explicação Técnica:** Quando o associado paga exatamente na data do vencimento (`vencimento === dataPagamento`), a subtração resulta em `diasAtraso = 0`. No laço `for (let i = 0; i <= diasAtraso; i++)`, a condição `0 <= 0` é avaliada como verdadeira. O laço executa exatamente uma vez (`i = 0`).
* **Efeito para o Associado:** O associado que paga pontualmente no dia do vencimento é penalizado injustamente com a multa de 2% e juros de 0,033%, pagando a mais por uma obrigação cumprida em dia.

### Defeito 2: Iteração extra em qualquer atraso (Off-by-One no Laço)
* **Explicação Técnica:** Ao utilizar `i <= diasAtraso` com início em `i = 0`, o laço é executado $N + 1$ vezes para um atraso de $N$ dias corridos. Por exemplo, se o atraso for de 1 dia (`diasAtraso = 1`), o laço roda para `i = 0` e `i = 1` (2 vezes).
* **Efeito para o Associado:** Em qualquer situação de atraso, o associado paga sempre uma rodada a mais de penalidades além dos dias que efetivamente atrasou.

### Defeito 3: Multa de 2% aplicada repetidamente a cada dia de atraso
* **Explicação Técnica:** A expressão `total = total + valor * 0.02 + ...` está situada dentro do laço de repetição diário. A regra de negócio estipula uma **multa única de 2%** por atraso. No código defeituoso, a multa é reincidente a cada dia (e com a iteração extra, um atraso de 10 dias aplica a multa 11 vezes: $+22\%$ somente de multa).
* **Efeito para o Associado:** O valor da dívida explode rapidamente. O associado é cobrado dezenas de vezes a mesma taxa punitiva, tornando a cobrança abusiva e ilegal perante as normas de defesa do consumidor.

### Defeito 4: Juros calculados de forma composta sobre o saldo acumulado
* **Explicação Técnica:** O cálculo soma `total * 0.00033`, onde a base de incidência é a variável `total` (que cresce a cada iteração com as multas repetidas e os juros anteriores). A regra do enunciado exige **juros simples de 0,033% ao dia sobre o valor original** (`valor * 0.00033 * diasAtraso`).
* **Efeito para o Associado:** O associado sofre incidência de juros sobre juros (anatocismo) e juros sobre multas acumuladas, aumentando indevidamente o valor final a pagar.

### Defeito 5: Ausência de arredondamento monetário final (Imprecisão de Ponto Flutuante)
* **Explicação Técnica:** Operações com ponto flutuante binário padrão IEEE-754 em JavaScript produzem dízimas e imprecisões decimais (ex: `0.1 + 0.2 = 0.30000000000000004`). A função retorna o número em ponto flutuante bruto, sem arredondar o total final em 2 casas decimais (centavos).
* **Efeito para o Associado:** Boletos e cobranças geram valores quebrados com frações de centavos (ex: `R$ 193,760667...`), impossibilitando o processamento bancário regular e causando divergências contábeis.

---

## 3. Função Corrigida

A versão corrigida:
1. Trata o cálculo dos dias corridos a partir da data civil em UTC, evitando interferências de horários embutidos.
2. Não aplica nenhuma penalidade se `diasAtraso <= 0` (pagamentos antecipados ou no dia do vencimento).
3. Aplica **multa única de 2%** sobre o valor original somente se houver atraso (`diasAtraso > 0`).
4. Aplica **juros simples de 0,033% ao dia** sobre o valor original.
5. Arredonda o **total final em centavos**, sem arredondar os juros diariamente (conforme orientações da AEIG).
6. Preserva a assinatura exata requisitada no enunciado.

```typescript
export function calcularValorAtualizado(
  valor: number,
  vencimento: string,
  dataPagamento: string
): number {
  const [vy, vm, vd] = vencimento.split('-').map(Number);
  const [py, pm, pd] = dataPagamento.split('-').map(Number);

  const utcVenc = Date.UTC(vy, vm - 1, vd);
  const utcPag = Date.UTC(py, pm - 1, pd);

  const diasAtraso = Math.floor((utcPag - utcVenc) / (1000 * 60 * 60 * 24));

  // Pagamento até o dia do vencimento: sem multa e sem juros
  if (diasAtraso <= 0) {
    return Math.round(valor * 100) / 100;
  }

  // Após o vencimento: multa única de 2% + juros simples de 0,033% por dia sobre o valor original
  const multa = valor * 0.02;
  const juros = valor * 0.00033 * diasAtraso;
  const total = valor + multa + juros;

  // Arredondamento monetário final em centavos
  return Math.round(total * 100) / 100;
}
```

---

## 4. Demonstração dos Cenários Oficiais (R$ 189,90 com vencimento em 05/10/2026)

| Data de Pagamento | Dias de Atraso | Multa (2%) | Juros Simples (0,033%/dia) | Total Calculado | Valor Final Arredondado |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **01/10/2026** (Antecipado) | -4 | R$ 0,00 | R$ 0,00 | R$ 189,90 | **R$ 189,90** |
| **05/10/2026** (No vencimento) | 0 | R$ 0,00 | R$ 0,00 | R$ 189,90 | **R$ 189,90** |
| **06/10/2026** (1 dia de atraso) | 1 | R$ 3,798 | R$ 0,062667 | R$ 193,760667 | **R$ 193,76** |
| **15/10/2026** (10 dias de atraso)| 10 | R$ 3,798 | R$ 0,62667 | R$ 194,32467 | **R$ 194,32** |

### Detalhamento do Cálculo:
* **Multa de 2%:** $189,90 \times 0,02 = 3,798$
* **Juros em 1 dia (06/10):** $189,90 \times 0,00033 \times 1 = 0,062667$  
  Total: $189,90 + 3,798 + 0,062667 = 193,760667 \xrightarrow{\text{arredondamento}} \mathbf{193,76}$
* **Juros em 10 dias (15/10):** $189,90 \times 0,00033 \times 10 = 0,62667$  
  Total: $189,90 + 3,798 + 0,62667 = 194,32467 \xrightarrow{\text{arredondamento}} \mathbf{194,32}$
  *(Nota: Se os juros ou multa fossem arredondados isoladamente antes da soma, teríamos R$ 3,80 + R$ 0,63 = R$ 194,33; contudo, a diretriz da AEIG instrui expressamente arredondar apenas o total final sem arredondamentos diários parciais, resultando no valor exato de **R$ 194,32**).*
