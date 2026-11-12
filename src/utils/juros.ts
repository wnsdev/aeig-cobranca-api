/**
 * Função corrigida da Parte B:
 * Calcula o valor atualizado de uma cobrança com base em:
 * - Pagamento até o dia do vencimento: sem multa e sem juros.
 * - Após o vencimento: multa única de 2% mais juros simples de 0,033% por dia corrido de atraso,
 *   ambos calculados sobre o valor original.
 * - Arredondamento final em centavos, sem arredondar juros ou multas intermediários diariamente.
 */
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

  if (diasAtraso <= 0) {
    return Math.round(valor * 100) / 100;
  }

  const multa = valor * 0.02;
  const juros = valor * 0.00033 * diasAtraso;
  const total = valor + multa + juros;

  return Math.round(total * 100) / 100;
}
