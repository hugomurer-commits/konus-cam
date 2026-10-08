import { z, type ZodTypeAny } from 'zod';
import { dataValida } from './dominio/datas.js';
import { ErroUsuario } from './erros.js';

export function validar<S extends ZodTypeAny>(schema: S, dados: unknown): z.output<S> {
  const r = schema.safeParse(dados ?? {});
  if (!r.success) {
    const p = r.error.issues[0];
    const campo = p.path.join('.');
    throw new ErroUsuario(p.message.includes(' ') ? p.message : `Campo inválido: ${campo}`);
  }
  return r.data;
}

export const zData = z.string().refine(dataValida, 'Data inválida.');
export const zCentavos = z.number().int('Valor inválido.').min(0, 'Valor não pode ser negativo.');
export const zCentavosPositivo = z.number().int('Valor inválido.').positive('Informe um valor maior que zero.');
export const zId = z.coerce.number().int().positive();
export const zHora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida.');
export const zFormaRecebimento = z.enum(['pix', 'cartao', 'dinheiro'], {
  errorMap: () => ({ message: 'Escolha a forma: Pix, cartão ou dinheiro.' }),
});
export const zFormaPagamento = z.enum(['pix', 'cartao', 'dinheiro', 'boleto'], {
  errorMap: () => ({ message: 'Escolha a forma de pagamento.' }),
});

export const paramsId = z.object({ id: zId });
