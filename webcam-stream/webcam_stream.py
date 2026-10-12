"""
Konus Cam - transmite a webcam do PC ao vivo numa pagina web protegida por senha,
com link publico automatico via ngrok.

Uso:
    python webcam_stream.py               -> inicia a transmissao
    python webcam_stream.py --configurar  -> (re)cria o config.ini interativamente

Configuracao em config.ini (mesma pasta deste arquivo). Veja config.example.ini.
"""

import argparse
import configparser
import getpass
import hmac
import logging
import os
import socket
import sys
import threading
import time
from datetime import datetime
from functools import wraps
from logging.handlers import RotatingFileHandler

import cv2
from flask import Flask, Response, render_template_string, request

PASTA = os.path.dirname(os.path.abspath(__file__))
ARQ_CONFIG = os.path.join(PASTA, "config.ini")
ARQ_LINK = os.path.join(PASTA, "link_publico.txt")
ARQ_LOG = os.path.join(PASTA, "webcam_stream.log")

log = logging.getLogger("konus-cam")


# --------------------------------------------------------------------------
# Configuracao
# --------------------------------------------------------------------------

PADROES = {
    "acesso": {"usuario": "admin", "senha": ""},
    "camera": {"indice": "0", "largura": "1280", "altura": "720",
               "fps": "15", "qualidade_jpeg": "70"},
    "servidor": {"porta": "5000", "aceitar_rede_local": "nao"},
    "ngrok": {"authtoken": "", "dominio": "", "ativo": "sim"},
}


def carregar_config():
    cfg = configparser.ConfigParser(interpolation=None)
    cfg.read_dict(PADROES)
    if not os.path.exists(ARQ_CONFIG):
        sys.exit(f"config.ini nao encontrado em {PASTA}.\n"
                 "Rode: python webcam_stream.py --configurar")
    cfg.read(ARQ_CONFIG, encoding="utf-8")
    if not cfg["acesso"]["senha"]:
        sys.exit("Defina uma senha em [acesso] no config.ini "
                 "(ou rode: python webcam_stream.py --configurar)")
    return cfg


def configurar_interativo():
    cfg = configparser.ConfigParser(interpolation=None)
    cfg.read_dict(PADROES)
    if os.path.exists(ARQ_CONFIG):
        cfg.read(ARQ_CONFIG, encoding="utf-8")

    def perguntar(secao, chave, texto, secreto=False):
        atual = cfg[secao][chave]
        dica = " [manter atual]" if (secreto and atual) else (f" [{atual}]" if atual else "")
        leitor = getpass.getpass if secreto else input
        valor = leitor(f"{texto}{dica}: ").strip()
        if valor:
            cfg[secao][chave] = valor

    print("\n=== Configuracao da Konus Cam ===\n")
    perguntar("acesso", "usuario", "Usuario para ver a camera")
    while True:
        perguntar("acesso", "senha", "Senha para ver a camera (nao aparece ao digitar)", secreto=True)
        if cfg["acesso"]["senha"]:
            break
        print("  A senha nao pode ficar vazia.")
    print("\nToken do ngrok: crie uma conta gratis em https://dashboard.ngrok.com/signup")
    print("e copie o token em https://dashboard.ngrok.com/get-started/your-authtoken")
    perguntar("ngrok", "authtoken", "Authtoken do ngrok", secreto=True)
    print("\nOpcional: dominio fixo gratuito do ngrok (ex.: algo.ngrok-free.app),")
    print("em https://dashboard.ngrok.com/domains. Assim o link nunca muda.")
    perguntar("ngrok", "dominio", "Dominio fixo (Enter para pular)")
    perguntar("camera", "indice", "Numero da camera (0 = padrao)")

    with open(ARQ_CONFIG, "w", encoding="utf-8") as f:
        cfg.write(f)
    print(f"\nConfiguracao salva em {ARQ_CONFIG}\n")


# --------------------------------------------------------------------------
# Camera: uma thread le sem parar e guarda o ultimo frame em JPEG.
# Assim varios visualizadores podem assistir sem disputar a camera.
# --------------------------------------------------------------------------

class Camera:
    def __init__(self, indice, largura, altura, fps, qualidade):
        self.indice = indice
        self.largura = largura
        self.altura = altura
        self.fps = fps
        self.qualidade = qualidade
        self._jpeg = None
        self._cond = threading.Condition()
        self._contador = 0
        threading.Thread(target=self._loop, daemon=True, name="camera").start()

    def _abrir(self):
        # Um numero abre a webcam; texto abre arquivo/URL (util para testes ou camera IP).
        if str(self.indice).isdigit():
            idx = int(self.indice)
            cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW) if os.name == "nt" else cv2.VideoCapture(idx)
        else:
            cap = cv2.VideoCapture(self.indice)
        if cap.isOpened():
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.largura)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.altura)
            cap.set(cv2.CAP_PROP_FPS, self.fps)
        return cap

    def _loop(self):
        intervalo = 1.0 / max(self.fps, 1)
        params = [int(cv2.IMWRITE_JPEG_QUALITY), self.qualidade]
        while True:
            cap = self._abrir()
            if not cap.isOpened():
                log.warning("Nao consegui abrir a camera %s. Tentando de novo em 5s...", self.indice)
                time.sleep(5)
                continue
            log.info("Camera %s aberta.", self.indice)
            falhas = 0
            while True:
                inicio = time.time()
                ok, frame = cap.read()
                if not ok:
                    falhas += 1
                    if falhas >= 30:
                        log.warning("Camera parou de responder. Reabrindo...")
                        break
                    time.sleep(0.1)
                    continue
                falhas = 0
                carimbo = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
                cv2.putText(frame, carimbo, (10, frame.shape[0] - 12),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 3, cv2.LINE_AA)
                cv2.putText(frame, carimbo, (10, frame.shape[0] - 12),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)
                ok, buf = cv2.imencode(".jpg", frame, params)
                if ok:
                    with self._cond:
                        self._jpeg = buf.tobytes()
                        self._contador += 1
                        self._cond.notify_all()
                espera = intervalo - (time.time() - inicio)
                if espera > 0:
                    time.sleep(espera)
            cap.release()
            time.sleep(2)

    def proximo_frame(self, ultimo_contador, timeout=10):
        with self._cond:
            self._cond.wait_for(lambda: self._contador != ultimo_contador, timeout=timeout)
            return self._contador, self._jpeg


# --------------------------------------------------------------------------
# Servidor web
# --------------------------------------------------------------------------

PAGINA = """<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Konus Cam</title>
<style>
  html,body{margin:0;height:100%;background:#111;color:#eee;font-family:system-ui,sans-serif}
  header{padding:10px 16px;font-weight:600;display:flex;justify-content:space-between;align-items:center}
  .ao-vivo{color:#e33;font-size:.85em}
  main{display:flex;justify-content:center;align-items:center;height:calc(100% - 44px)}
  img{max-width:100%;max-height:100%;object-fit:contain;background:#000}
</style>
</head>
<body>
<header><span>Konus Cam</span><span class="ao-vivo">&#9679; AO VIVO</span></header>
<main><img src="{{ url_for('video_feed') }}" alt="Camera ao vivo"></main>
</body>
</html>"""


def criar_app(camera, usuario, senha):
    app = Flask(__name__)

    def autorizado():
        auth = request.authorization
        if not auth or auth.type != "basic":
            return False
        ok_user = hmac.compare_digest((auth.username or "").encode(), usuario.encode())
        ok_pass = hmac.compare_digest((auth.password or "").encode(), senha.encode())
        return ok_user and ok_pass

    def requer_login(f):
        @wraps(f)
        def wrapper(*a, **kw):
            if autorizado():
                return f(*a, **kw)
            if request.authorization:
                ip = request.headers.get("X-Forwarded-For", request.remote_addr)
                log.warning("Login recusado de %s", ip)
                time.sleep(1)  # freia tentativas de adivinhar a senha
            return Response("Acesso restrito.", 401,
                            {"WWW-Authenticate": 'Basic realm="Konus Cam", charset="UTF-8"'})
        return wrapper

    @app.route("/")
    @requer_login
    def index():
        return render_template_string(PAGINA)

    @app.route("/video_feed")
    @requer_login
    def video_feed():
        def gerar():
            contador = -1
            while True:
                contador, jpeg = camera.proximo_frame(contador)
                if jpeg is None:
                    continue
                yield (b"--frame\r\nContent-Type: image/jpeg\r\n"
                       b"Content-Length: " + str(len(jpeg)).encode() + b"\r\n\r\n"
                       + jpeg + b"\r\n")
        return Response(gerar(), mimetype="multipart/x-mixed-replace; boundary=frame",
                        headers={"Cache-Control": "no-store"})

    @app.route("/saude")
    def saude():
        return "ok"

    return app


# --------------------------------------------------------------------------
# Tunel publico (ngrok)
# --------------------------------------------------------------------------

def abrir_tunel(porta, authtoken, dominio):
    from pyngrok import conf, ngrok

    conf.get_default().auth_token = authtoken
    opcoes = {"domain": dominio} if dominio else {}
    tentativa = 0
    while True:
        tentativa += 1
        try:
            tunel = ngrok.connect(str(porta), "http", **opcoes)
            return tunel.public_url.replace("http://", "https://")
        except Exception as e:  # sem internet no boot, token errado, etc.
            espera = min(60, 5 * tentativa)
            log.error("Falha ao abrir o tunel ngrok (%s). Nova tentativa em %ss.", e, espera)
            try:
                ngrok.kill()
            except Exception:
                pass
            time.sleep(espera)


def configurar_log():
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s", "%d/%m/%Y %H:%M:%S")
    tela = logging.StreamHandler(sys.stdout)
    tela.setFormatter(fmt)
    arquivo = RotatingFileHandler(ARQ_LOG, maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    arquivo.setFormatter(fmt)
    log.setLevel(logging.INFO)
    log.addHandler(tela)
    log.addHandler(arquivo)
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    logging.getLogger("pyngrok").setLevel(logging.WARNING)


def main():
    parser = argparse.ArgumentParser(description="Konus Cam - webcam ao vivo com link publico")
    parser.add_argument("--configurar", action="store_true", help="cria/edita o config.ini")
    args = parser.parse_args()

    if args.configurar:
        configurar_interativo()
        return

    configurar_log()
    cfg = carregar_config()
    cam = cfg["camera"]
    porta = cfg.getint("servidor", "porta")
    host = "0.0.0.0" if cfg["servidor"]["aceitar_rede_local"].lower() in ("sim", "s", "1", "true") else "127.0.0.1"

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(("127.0.0.1", porta)) == 0:
            log.error("A porta %s ja esta em uso: a Konus Cam ja esta aberta "
                      "(veja a barra de tarefas) ou outro programa usa essa porta.", porta)
            sys.exit(3)  # o iniciar_camera.bat entende 3 como "ja esta rodando"

    camera = Camera(cam["indice"], cam.getint("largura"), cam.getint("altura"),
                    cam.getint("fps"), cam.getint("qualidade_jpeg"))
    app = criar_app(camera, cfg["acesso"]["usuario"], cfg["acesso"]["senha"])

    threading.Thread(
        target=lambda: app.run(host=host, port=porta, threaded=True, use_reloader=False),
        daemon=True, name="flask").start()
    log.info("Servidor local: http://127.0.0.1:%s", porta)

    if cfg["ngrok"]["ativo"].lower() in ("sim", "s", "1", "true"):
        if not cfg["ngrok"]["authtoken"]:
            log.error("Sem authtoken do ngrok no config.ini: so o acesso local vai funcionar.")
        else:
            url = abrir_tunel(porta, cfg["ngrok"]["authtoken"], cfg["ngrok"]["dominio"])
            with open(ARQ_LINK, "w", encoding="utf-8") as f:
                f.write(url + "\n")
            barra = "=" * 64
            print(f"\n{barra}\n  LINK PUBLICO DA CAMERA:  {url}\n"
                  f"  Usuario: {cfg['acesso']['usuario']}  (senha: a do config.ini)\n{barra}\n",
                  flush=True)
            log.info("Link publico: %s (salvo em link_publico.txt)", url)

    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        log.info("Encerrando.")


if __name__ == "__main__":
    main()
