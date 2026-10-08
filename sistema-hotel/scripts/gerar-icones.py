"""Gera a logo do painel e os ícones do app a partir de assets/logo-hotel-tropical.png.

Rodar de novo quando chegar a logo em alta resolução:
    python3 scripts/gerar-icones.py

Precisa de Pillow (pip install pillow). O recorte do ícone (sol + coqueiros) usa
proporções da logo atual (750x750); confira o resultado se a nova logo for diferente.
"""
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIGEM = RAIZ / "assets" / "logo-hotel-tropical.png"
PUBLICO = RAIZ / "painel" / "public"
AREIA = (0xFF, 0xF8, 0xEC)


def fundo_para_areia(img: Image.Image) -> Image.Image:
    """Troca o fundo quase branco pela cor --areia (fica igual ao fundo do sistema)."""
    img = img.convert("RGB")
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b = px[x, y]
            if r > 238 and g > 238 and b > 238:
                px[x, y] = AREIA
    return img


def main() -> None:
    PUBLICO.mkdir(parents=True, exist_ok=True)
    logo = Image.open(ORIGEM).convert("RGB")
    w, h = logo.size

    # Logo inteira, sem as bordas brancas, com fundo transparente
    cinza = logo.convert("L").point(lambda v: 255 if v < 235 else 0)
    caixa = cinza.getbbox()
    recortada = logo.crop(caixa).convert("RGBA")
    px = recortada.load()
    for y in range(recortada.height):
        for x in range(recortada.width):
            r, g, b, _ = px[x, y]
            claridade = min(r, g, b)
            if claridade > 238:
                px[x, y] = (r, g, b, 0)
            elif claridade > 200:  # borda suave do recorte
                px[x, y] = (r, g, b, int(255 * (238 - claridade) / 38))
    recortada.thumbnail((480, 480), Image.LANCZOS)
    recortada.save(PUBLICO / "logo.png", optimize=True)

    # Ícone: sol + coqueiros + pessoa, sem o prédio (janelas marrons e contorno azul de cima)
    sem_predio = logo.copy()
    px = sem_predio.load()
    # À direita e acima da pessoa só fica o verde dos coqueiros; o resto (prédio) vira fundo
    for y in range(int(h * 0.345)):
        for x in range(int(w * 0.53), w):
            r, g, b = px[x, y]
            if not (g > r + 15 and g > b + 15):
                px[x, y] = (255, 255, 255)
    x0, y0, lado = int(w * 0.28), int(h * 0.10), int(w * 0.43)
    icone = fundo_para_areia(sem_predio.crop((x0, y0, x0 + lado, y0 + lado)))
    margem = int(lado * 0.08)
    quadro = Image.new("RGB", (lado + 2 * margem, lado + 2 * margem), AREIA)
    quadro.paste(icone, (margem, margem))
    for tamanho in (512, 192, 48):
        quadro.resize((tamanho, tamanho), Image.LANCZOS).save(
            PUBLICO / f"icone-{tamanho}.png", optimize=True
        )
    quadro.resize((64, 64), Image.LANCZOS).save(PUBLICO / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("Gerado em", PUBLICO)


if __name__ == "__main__":
    main()
