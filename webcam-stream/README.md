# Konus Cam — webcam ao vivo com link público e senha

Transmite a webcam do PC (Windows) numa página web protegida por usuário e senha,
com um link público gerado automaticamente pelo ngrok, e inicia sozinho quando o PC liga.

| Arquivo | Para que serve |
|---|---|
| `webcam_stream.py` | O programa: lê a câmera (OpenCV), serve o vídeo (Flask), pede senha (Basic Auth) e abre o túnel público (pyngrok) |
| `instalar.bat` | Instala tudo com um duplo clique e configura a inicialização automática |
| `iniciar_camera.bat` | Abre a câmera numa janela **minimizada** e reinicia o script se ele cair |
| `config.example.ini` | Modelo de configuração (o `config.ini` real, com senha e token, não vai para o git) |

---

## 1. Antes de começar: conta grátis no ngrok (2 minutos)

O ngrok é quem cria o link público (`https://...ngrok-free.app`).

1. Crie a conta em <https://dashboard.ngrok.com/signup>.
2. Copie o **Authtoken** em <https://dashboard.ngrok.com/get-started/your-authtoken>.
3. (Recomendado) Em <https://dashboard.ngrok.com/domains> pegue o **domínio fixo grátis**.
   Sem ele o link muda toda vez que o PC reinicia; com ele o link é sempre o mesmo.

## 2. Instalação no PC da câmera

1. Baixe esta pasta `webcam-stream` para o PC (ex.: `C:\KonusCam`).
   Evite pastas sincronizadas (OneDrive) ou que exijam administrador.
2. Dê **duplo clique em `instalar.bat`**. Ele vai:
   - achar o Python (se não tiver, instala o Python 3.12 pelo `winget` — depois rode o `instalar.bat` de novo);
   - criar o ambiente `.venv` e instalar OpenCV, Flask e pyngrok;
   - pedir **usuário**, **senha**, **authtoken do ngrok**, **domínio fixo** (opcional) e o número da câmera;
   - criar o lançador na pasta de inicialização do Windows;
   - perguntar se já quer iniciar a câmera.
3. Uma janela **“Konus Cam”** aparece minimizada na barra de tarefas. Abra-a para ver:

   ```
   ================================================================
     LINK PUBLICO DA CAMERA:  https://seu-dominio.ngrok-free.app
     Usuario: admin  (senha: a do config.ini)
   ================================================================
   ```

   O link também fica salvo em `link_publico.txt`, na mesma pasta.

4. Abra o link no celular/outro PC, digite usuário e senha e pronto.
   Na primeira visita o ngrok grátis mostra um aviso “You are about to visit…” — clique em **Visit Site**.

> O Windows pode perguntar se o Python pode acessar a câmera ou a rede: permita.
> Se a câmera não abrir, confira em *Configurações → Privacidade → Câmera* se
> “Permitir que aplicativos da área de trabalho acessem a câmera” está ligado.

## 3. Inicialização automática — passo a passo

O `instalar.bat` já faz o **Método A** sozinho. Os passos abaixo explicam o que ele faz
(e servem para refazer à mão). Use **um** método só, para não abrir duas vezes.

### Método A — pasta `shell:startup` (o mais simples)

1. Aperte **Win + R**, digite `shell:startup` e dê Enter. Abre a pasta *Inicializar*:
   `C:\Users\<você>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup`.
2. Nessa pasta, crie um arquivo `Konus Cam.bat` (Bloco de Notas → *Salvar como* →
   Tipo “Todos os arquivos”) com o conteúdo, trocando pelo caminho real:

   ```bat
   @echo off
   call "C:\KonusCam\webcam-stream\iniciar_camera.bat"
   ```

3. Pronto. Ao fazer login no Windows, o `iniciar_camera.bat` abre o programa com
   `start /min`, ou seja, numa janela **minimizada**, e reinicia o script se ele cair.

> Este método roda **depois que alguém faz login**. Para não precisar digitar senha,
> ative o login automático do Windows (`netplwiz` → desmarque “Os usuários devem
> digitar um nome de usuário e uma senha…”) ou use o Método B.

### Método B — Agendador de Tarefas (mais robusto)

1. Apague o `Konus Cam.bat` da pasta `shell:startup`, se existir.
2. Menu Iniciar → **Agendador de Tarefas** → **Criar Tarefa…** (não a “Tarefa Básica”).
3. Aba **Geral**: nome `Konus Cam`; marque **“Executar somente quando o usuário estiver conectado”**
   (precisa estar conectado para a janela minimizada aparecer e para o Windows liberar a webcam).
4. Aba **Disparadores** → *Novo* → **Ao fazer logon** → (opcional) *Atrasar tarefa por*: **30 segundos**,
   para dar tempo da internet e da câmera ficarem prontas.
5. Aba **Ações** → *Nova* → *Iniciar um programa*:
   - Programa/script: `C:\KonusCam\webcam-stream\iniciar_camera.bat`
   - Iniciar em: `C:\KonusCam\webcam-stream`
6. Aba **Condições**: desmarque **“Iniciar a tarefa somente se o computador estiver ligado na energia CA”**.
7. Aba **Configurações**: desmarque **“Interromper a tarefa se ela for executada por mais de…”** e
   marque **“Se a tarefa falhar, reiniciar a cada: 1 minuto”**.
8. OK. Para testar sem reiniciar: clique com o botão direito na tarefa → **Executar**.

Atalho por linha de comando (Prompt de Comando, ajuste o caminho):

```bat
schtasks /create /tn "Konus Cam" /sc onlogon /delay 0000:30 /tr "\"C:\KonusCam\webcam-stream\iniciar_camera.bat\""
```

### Dica: o PC não pode dormir

*Configurações → Sistema → Energia → Tela e suspensão*: “Colocar o dispositivo em suspensão” = **Nunca**.
Se o PC dormir, a transmissão para.

## 4. Uso no dia a dia

- **Ver o link**: abra a janela “Konus Cam” na barra de tarefas ou o arquivo `link_publico.txt`.
- **Parar**: feche a janela “Konus Cam”.
- **Trocar senha/token**: rode `instalar.bat` de novo e responda “S” para alterar o `config.ini`
  (ou edite o `config.ini` no Bloco de Notas) e reinicie a câmera.
- **Outra câmera / qualidade**: edite `[camera]` no `config.ini` (`indice = 1`, `largura`, `altura`, `fps`).
- **Problemas**: veja `webcam_stream.log` na pasta.

## 5. Segurança

- Todas as páginas (`/` e `/video_feed`) exigem usuário e senha (HTTP Basic Auth),
  comparados em tempo constante; senhas erradas são registradas no log com o IP e respondidas com atraso.
- O link do ngrok é **HTTPS**, então a senha não trafega em texto aberto.
- O servidor só escuta em `127.0.0.1` (o acesso de fora passa pelo ngrok).
  Para liberar na rede local, use `aceitar_rede_local = sim` — aí o acesso local é HTTP sem criptografia.
- Use uma senha forte e não compartilhe o `config.ini`.
- A rota `/saude` responde só “ok” (sem vídeo), útil para monitorar se o servidor está no ar.

## Rodar à mão (sem os .bat)

```bat
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python webcam_stream.py --configurar
.venv\Scripts\python webcam_stream.py
```
