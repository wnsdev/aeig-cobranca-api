import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isValidCpf, sanitizeCpf } from '../utils/cpf';

describe('Validação de CPF (Módulo 11)', () => {
  test('deve validar CPFs válidos conhecidos', () => {
    assert.equal(isValidCpf('52998224725'), true);
    assert.equal(isValidCpf('529.982.247-25'), true);
    assert.equal(isValidCpf('12345678909'), true);
    assert.equal(isValidCpf('05353139003'), true);
  });

  test('deve rejeitar CPFs com tamanho incorreto', () => {
    assert.equal(isValidCpf('123456789'), false);
    assert.equal(isValidCpf('123456789012'), false);
    assert.equal(isValidCpf(''), false);
  });

  test('deve rejeitar sequências de dígitos repetidos', () => {
    assert.equal(isValidCpf('11111111111'), false);
    assert.equal(isValidCpf('00000000000'), false);
    assert.equal(isValidCpf('99999999999'), false);
  });

  test('deve rejeitar CPFs com dígitos verificadores incorretos', () => {
    assert.equal(isValidCpf('52998224726'), false);
    assert.equal(isValidCpf('12345678900'), false);
  });

  test('deve sanitizar caracteres não numéricos', () => {
    assert.equal(sanitizeCpf(' 529.982.247-25 '), '52998224725');
  });
});
