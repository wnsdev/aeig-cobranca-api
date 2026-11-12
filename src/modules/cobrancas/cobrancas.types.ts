export interface CreateCobrancaInput {
  associado_id: number;
  mes_referencia: string;
}

export interface Cobranca {
  id: number;
  associado_id: number;
  mes_referencia: string;
  nosso_numero: string;
  valor_centavos: number;
  status: 'PENDENTE' | 'PAGA';
  data_pagamento: string | null;
  criado_em: string;
}

export interface GetCobrancaParams {
  nosso_numero: string;
}
