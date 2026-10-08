/** Erro que pode ser mostrado ao dono como está (mensagem simples em português). */
export class ErroUsuario extends Error {
  constructor(
    mensagem: string,
    public status = 400,
    public codigo?: string,
  ) {
    super(mensagem);
  }
}

export const naoEncontrado = (o_que: string) => new ErroUsuario(`${o_que} não encontrado.`, 404);
