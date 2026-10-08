/** Para busca: sem acento, maiúsculas, espaços únicos. "José  da Silva" → "JOSE DA SILVA". */
export function normalizarBusca(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function soDigitos(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

/** "café DA manhã" → "Café da manhã" */
export function primeiraMaiuscula(s: string): string {
  const t = s.trim().toLocaleLowerCase('pt-BR');
  return t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1);
}

/** Link do WhatsApp com DDI do Brasil quando o número vier só com DDD. */
export function linkWhatsapp(telefone: string, mensagem?: string): string | null {
  let d = soDigitos(telefone);
  if (d.length < 10) return null;
  if (d.length <= 11) d = `55${d}`;
  const texto = mensagem ? `?text=${encodeURIComponent(mensagem)}` : '';
  return `https://wa.me/${d}${texto}`;
}
