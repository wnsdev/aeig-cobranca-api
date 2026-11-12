export interface CreateAssociadoInput {
  nome: string;
  cpf: string;
  valor_mensalidade_centavos: number;
}

export interface Associado {
  id: number;
  nome: string;
  cpf: string;
  valor_mensalidade_centavos: number;
  criado_em: string;
}
