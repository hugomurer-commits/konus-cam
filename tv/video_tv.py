#!/usr/bin/env python3
"""
Monta o video vertical do Instagram (Reels, 9:16) para a TV da Konus (16:9).

O video aparece 3 vezes lado a lado e preenche a tela inteira:

    +--------+--------+--------+
    |        |        |        |
    | video  | video  | video  |   1920 x 1080
    |        |        |        |
    +--------+--------+--------+

Cada copia ocupa 640x1080. Um Reels 9:16 escalado para essa largura fica
com 1138 de altura, entao sobra um corte de ~5% (29px em cima e embaixo),
imperceptivel. Com --modo inteiro nada e' cortado e aparecem faixas pretas
finas nas laterais de cada copia.

O arquivo final sai sem audio (so imagem), como vai para a TV da loja.

Uso:
    pip install yt-dlp imageio-ffmpeg
    python video_tv.py https://www.instagram.com/reel/XXXXXXXX/
    python video_tv.py video_baixado.mp4
    python video_tv.py URL --saida cone_cravejado_tv.mp4 --modo inteiro
    python video_tv.py URL --resolucao 3840x2160      # TV 4K

O download usa o login do Instagram que ja esta no Chrome (--navegador
chrome, o padrao). No Windows, feche o Chrome antes de rodar: com ele
aberto o arquivo de cookies fica travado.
"""

import argparse
import os
import shutil
import subprocess
import sys
import tempfile


def achar_ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        pass
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    sys.exit("ffmpeg nao encontrado. Rode:  pip install imageio-ffmpeg")


def baixar_instagram(url, pasta, navegador):
    try:
        import yt_dlp
    except ImportError:
        sys.exit("yt-dlp nao encontrado. Rode:  pip install yt-dlp")

    opcoes = {
        "outtmpl": os.path.join(pasta, "original.%(ext)s"),
        "format": "bv*+ba/b",
        "merge_output_format": "mp4",
        "quiet": True,
        "no_warnings": True,
    }
    # 1a tentativa com o login do navegador; se os cookies nao puderem ser
    # lidos (Chrome aberto, criptografia nova do Chrome no Windows), tenta
    # sem login - Reels publicos costumam baixar assim tambem.
    tentativas = [dict(opcoes, cookiesfrombrowser=(navegador,)), opcoes] if navegador else [opcoes]
    ultimo_erro = None
    for i, op in enumerate(tentativas):
        try:
            with yt_dlp.YoutubeDL(op) as ydl:
                info = ydl.extract_info(url, download=True)
                if "entries" in info:  # post com carrossel: pega o 1o video
                    info = next(e for e in info["entries"] if e)
                caminho = ydl.prepare_filename(info)
                base = os.path.splitext(caminho)[0]
                for ext in ("mp4", "mkv", "webm", "mov"):
                    if os.path.exists(base + "." + ext):
                        return base + "." + ext
                return caminho
        except Exception as e:  # yt-dlp levanta varios tipos
            ultimo_erro = e
            if i == 0 and len(tentativas) > 1:
                print(f"  (nao deu com o login do {navegador}: {str(e).splitlines()[0]})")
                print("  tentando sem login...")
    sys.exit(
        f"\nNao consegui baixar o video: {ultimo_erro}\n\n"
        "Alternativa: no app do Instagram abra o Reels > ... > Baixar,\n"
        "passe o arquivo para o computador e rode:\n"
        "    python video_tv.py caminho/do/video.mp4"
    )


def montar(ffmpeg, entrada, saida, largura, altura, modo):
    w = largura // 3
    if modo == "preencher":
        painel = f"scale={w}:{altura}:force_original_aspect_ratio=increase,crop={w}:{altura}"
    else:
        painel = (f"scale={w}:{altura}:force_original_aspect_ratio=decrease,"
                  f"pad={w}:{altura}:(ow-iw)/2:(oh-ih)/2:black")
    filtro = (f"[0:v]{painel},setsar=1,split=3[a][b][c];"
              f"[a][b][c]hstack=inputs=3,pad={largura}:{altura}:(ow-iw)/2:0:black,"
              f"format=yuv420p[v]")
    cmd = [
        ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-stats",
        "-i", entrada,
        "-filter_complex", filtro,
        "-map", "[v]", "-an",
        # H.264 High em MP4: o que qualquer TV/pendrive/TV box toca
        "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", "20",
        "-movflags", "+faststart",
        saida,
    ]
    subprocess.run(cmd, check=True)


def main():
    ap = argparse.ArgumentParser(description="Video vertical x3 para TV 16:9")
    ap.add_argument("fonte", help="link do Instagram ou arquivo de video")
    ap.add_argument("--saida", default="video_tv.mp4")
    ap.add_argument("--modo", choices=["preencher", "inteiro"], default="preencher",
                    help="preencher: sem faixas, corta ~5%% em cima/embaixo; "
                         "inteiro: sem corte, faixas pretas finas")
    ap.add_argument("--resolucao", default="1920x1080", help="ex.: 1920x1080, 3840x2160")
    ap.add_argument("--navegador", default="chrome",
                    help="de onde pegar o login do Instagram (chrome, edge, firefox...); "
                         "vazio para nao usar")
    args = ap.parse_args()

    largura, altura = (int(x) for x in args.resolucao.lower().split("x"))
    ffmpeg = achar_ffmpeg()

    with tempfile.TemporaryDirectory() as pasta:
        if args.fonte.startswith(("http://", "https://")):
            print("Baixando do Instagram...")
            entrada = baixar_instagram(args.fonte, pasta, args.navegador)
        else:
            entrada = args.fonte
            if not os.path.exists(entrada):
                sys.exit(f"Arquivo nao encontrado: {entrada}")
        print(f"Montando {largura}x{altura} com 3 copias...")
        montar(ffmpeg, entrada, args.saida, largura, altura, args.modo)

    print(f"\nPronto: {os.path.abspath(args.saida)}")


if __name__ == "__main__":
    main()
