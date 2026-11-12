export interface WebhookPagamentoInput {
  id_evento: string;
  nosso_numero: string;
  data_pagamento: string;
}

export interface WebhookPagamentoResponse {
  mensagem: string;
  id_evento: string;
  nosso_numero?: string;
  status: 'PAGA' | 'JA_PROCESSADO';
  data_pagamento?: string | null;
}
