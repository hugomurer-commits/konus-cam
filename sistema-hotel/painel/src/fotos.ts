// Redimensiona a foto no navegador antes de enviar (seção 3: máx. ~1600px, ~80%, + miniatura).
// Assim o servidor não precisa de biblioteca nativa de imagem.

async function reduzir(origem: ImageBitmap, max: number, qualidade: number): Promise<Blob> {
  const escala = Math.min(1, max / Math.max(origem.width, origem.height));
  const w = Math.round(origem.width * escala);
  const h = Math.round(origem.height * escala);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(origem, 0, 0, w, h);
  const comoBlob = (tipo: string) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, tipo, qualidade));
  const webp = await comoBlob('image/webp');
  // Alguns navegadores (Safari antigo) não geram WebP e devolvem PNG: aí usa JPEG
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await comoBlob('image/jpeg');
  if (!jpeg) throw new Error('Não consegui preparar a foto.');
  return jpeg;
}

export async function prepararFoto(arquivo: File): Promise<{ foto: Blob; miniatura: Blob }> {
  if (!arquivo.type.startsWith('image/')) throw new Error(`"${arquivo.name}" não é uma foto.`);
  let bitmap: ImageBitmap;
  try {
    // Respeita a orientação da câmera do celular
    bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`Não consegui abrir "${arquivo.name}". Tente tirar a foto de novo ou usar JPG.`);
  }
  const foto = await reduzir(bitmap, 1600, 0.8);
  const miniatura = await reduzir(bitmap, 480, 0.75);
  bitmap.close();
  return { foto, miniatura };
}
