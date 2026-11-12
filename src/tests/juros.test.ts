import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calcularValorAtualizado } from '../utils/juros';

describe('Parte B — Cálculo de Multa e Juros (calcularValorAtualizado)', () => {
  const mensalidade = 189.90;
  const vencimento = '2026-10-05';

  test('Caso 1: Pagamento antecipado em 01/10/2026 (sem multa e sem juros)', () => {
    const valorAtualizado = calcularValorAtualizado(mensalidade, vencimento, '2026-10-01');
    assert.equal(valorAtualizado, 189.90);
  });

  test('Caso 2: Pagamento no dia do vencimento 05/10/2026 (sem multa e sem juros)', () => {
    const valorAtualizado = calcularValorAtualizado(mensalidade, vencimento, '2026-10-05');
    assert.equal(valorAtualizado, 189.90);
  });

  test('Caso 3: Pagamento com 1 dia de atraso em 06/10/2026 (multa 2% + 1 dia de juros 0.033%)', () => {
    // Multa: 189.90 * 0.02 = 3.798
    // Juros: 189.90 * 0.00033 * 1 = 0.062667
    // Total: 189.90 + 3.798 + 0.062667 = 193.760667 => Arredondado: 193.76
    const valorAtualizado = calcularValorAtualizado(mensalidade, vencimento, '2026-10-06');
    assert.equal(valorAtualizado, 193.76);
  });

  test('Caso 4: Pagamento com 10 dias de atraso em 15/10/2026 (multa 2% + 10 dias de juros 0.33%)', () => {
    // Multa: 189.90 * 0.02 = 3.798
    // Juros: 189.90 * 0.00033 * 10 = 0.62667
    // Total: 189.90 + 3.798 + 0.62667 = 194.32467 => Arredondado: 194.32
    const valorAtualizado = calcularValorAtualizado(mensalidade, vencimento, '2026-10-15');
    assert.equal(valorAtualizado, 194.32);
  });
});
