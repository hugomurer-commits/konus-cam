export class ErroApi extends Error {
  constructor(
    mensagem: string,
    public status: number,
  ) {
    super(mensagem);
  }
}

export async function pedir<T = any>(metodo: string, url: string, corpo?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: metodo,
    credentials: 'same-origin',
    headers: corpo !== undefined && !(corpo instanceof FormData) ? { 'Content-Type': 'application/json' } : {},
    body: corpo === undefined ? undefined : corpo instanceof FormData ? corpo : JSON.stringify(corpo),
  });
  const texto = await r.text();
  const dados = texto ? JSON.parse(texto) : null;
  if (!r.ok) {
    if (r.status === 401 && !url.startsWith('/api/auth/') && !location.pathname.startsWith('/entrar')) {
      location.href = '/entrar';
    }
    throw new ErroApi(dados?.erro ?? 'Não foi possível falar com o sistema.', r.status);
  }
  return dados as T;
}

export const api = {
  get: <T = any>(url: string) => pedir<T>('GET', url),
  post: <T = any>(url: string, corpo?: unknown) => pedir<T>('POST', url, corpo ?? {}),
  put: <T = any>(url: string, corpo?: unknown) => pedir<T>('PUT', url, corpo ?? {}),
  del: <T = any>(url: string) => pedir<T>('DELETE', url),
};
