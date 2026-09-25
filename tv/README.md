# Vídeo do Instagram na TV da Konus

O Reels é vertical (9:16) e a TV é horizontal (16:9). Aqui o mesmo vídeo
aparece **3 vezes lado a lado**, preenchendo a tela em 1920x1080:

```
+--------+--------+--------+
| video  | video  | video  |
+--------+--------+--------+
```

Cada cópia ocupa 640x1080. No modo **preencher** (padrão) não sobra faixa
preta: o vídeo é cortado ~5% em cima e embaixo (29px de cada lado). Se
tiver texto ou logo colado na borda, use o modo **inteiro**: nada é cortado
e aparecem faixas pretas finas nas laterais de cada cópia. O áudio sai uma
vez só.

## Opção 1 — navegador, sem instalar nada

1. Baixe o Reels (app do Instagram: abra o Reels > `...` > **Baixar**) e
   passe para o computador.
2. Abra `video-tv.html` no **Chrome** ou **Edge** e arraste o vídeo.
3. Clique em **Gerar vídeo para TV**. A gravação leva o tempo do vídeo;
   no fim ele baixa `NOME_tv.mp4`.

Chrome/Edge atualizados gravam em MP4 (H.264), que a TV toca. Se o
arquivo sair `.webm`, o navegador não grava MP4: use a opção 2.

## Opção 2 — script (baixa direto do Instagram)

Precisa de Python 3.

```
pip install yt-dlp imageio-ffmpeg
python video_tv.py https://www.instagram.com/reel/XXXXXXXX/
```

Ele usa o login do Instagram que já está no Chrome para baixar e gera
`video_tv.mp4` (H.264 + AAC, toca em qualquer TV, pendrive ou TV box).
**No Windows, feche o Chrome antes**: com ele aberto os cookies ficam
travados. Se mesmo assim não baixar, baixe pelo app e passe o arquivo:

```
python video_tv.py cone_cravejado.mp4 --saida cone_cravejado_tv.mp4
python video_tv.py cone_cravejado.mp4 --modo inteiro
python video_tv.py cone_cravejado.mp4 --resolucao 3840x2160   # TV 4K
```
