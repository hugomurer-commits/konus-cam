# Sistema do Hotel no Windows

Guia de entrega (seção 12 da especificação). Tudo aqui é feito **no Windows**; o desenvolvimento e os
testes automáticos rodam em qualquer sistema, mas o instalador e o teste da tomada só no PC de verdade.

## 1. Gerar o instalador (notebook do Hugo)

Precisa, uma vez: **Node.js 22 LTS 64 bits** (nodejs.org) e **Inno Setup 6** (jrsoftware.org).

```powershell
cd caminho\para\konus-cam\sistema-hotel
powershell -ExecutionPolicy Bypass -File windows\build-windows.ps1
```

Sai em `windows\saida\Instalar-Sistema-Hotel.exe`. O script roda os testes, compila, baixa o Node e o
NSSM e monta o `better-sqlite3` já compilado para Windows x64. Tudo vai dentro do `.exe`.

## 2. Testar numa máquina limpa (antes de levar ao hotel)

Use uma VM com Windows 10/11 64 bits **sem Node instalado**:

1. Rodar `Instalar-Sistema-Hotel.exe` como administrador. No fim, o navegador abre em `http://localhost:8787`.
2. Primeiro uso: criar a senha → **Primeiros passos** → importar a planilha → conferir a tabela
   "planilha × sistema" (tudo "Bate").
3. Reiniciar a VM **sem fazer login**; de outro jeito (ou depois de logar), abrir o atalho **Hotel**:
   o sistema tem que estar no ar.
4. `powershell -ExecutionPolicy Bypass -File C:\SistemaHotel\servico.ps1 status` mostra "respondendo".
5. Instalar o mesmo `.exe` de novo (simula atualização): os dados continuam, e aparece
   `C:\SistemaHotel\dados\antes-da-atualizacao-*.db`.

## 3. Preparar o PC do hotel

- **BIOS**: "Restore on AC Power Loss" (ou "AC Back", "Power On After Power Fail") = **Power On**.
  Assim o PC liga sozinho quando a energia volta.
- **Windows → Energia**: suspender = **Nunca** (o PC fica sempre ligado). Pelo PowerShell como admin:
  `powercfg /change standby-timeout-ac 0` e `powercfg /change hibernate-timeout-ac 0`.
- **Login automático** (opcional, para a tela do sistema voltar sem senha do Windows): `netplwiz`.
  O sistema em si sobe sem ninguém logar; isso só ajuda a abrir o navegador.
- **Google Drive para computador**: instalar, entrar com a conta do hotel/Hugo, escolher o modo
  **"Espelhar arquivos"** e criar a pasta `Backup Hotel` dentro do "Meu Drive". Em **Configurações →
  Backup** do sistema, colocar o caminho real, por exemplo `C:\Users\Hotel\Meu Drive\Backup Hotel`
  (não use a letra `G:` do modo "streaming": o serviço do Windows não enxerga essa letra).
  Clicar em **Fazer backup agora** e conferir que a pasta aparece no Drive pela internet.

## 4. Critérios de pronto da Fase 1 (seção 11)

| Critério | Como testar | Quem |
|---|---|---|
| (a) Importação bate os totais | Configurações → Planilha antiga: todas as linhas "Bate". O teste automático `npm test` já confere os números da seção 8.3 com a planilha em `dados-originais/` | Hugo |
| (b) Check-in de hóspede que volta < 30 s | Cronometrar o dono: Hoje → + Nova hospedagem → 4 últimos números do telefone → É este → quarto → Salvar → Confirmar | Dono + Hugo |
| (c) Tirar da tomada e religar | Com o sistema aberto, **tirar o PC da tomada**. Ligar de novo na tomada **sem apertar o botão**. O PC tem que ligar sozinho e, ~1 min depois, o atalho Hotel abre o sistema com tudo que foi lançado antes | Hugo, no hotel |
| (d) Um dia real sem ajuda | O dono lança um dia inteiro (chegadas, saídas, despesas, contas) sem ajuda | Dono |

## 5. Atualizar

Gerar um instalador novo (versão maior em `package.json`) e rodar por cima. Ele para o serviço, copia o
banco para `dados\antes-da-atualizacao-*.db`, troca o programa e sobe de novo. As mudanças de banco
(migrações) rodam sozinhas ao iniciar. **A pasta `dados` nunca é apagada**, nem ao desinstalar.

## 6. Restaurar um backup

1. `servico.ps1 parar` (PowerShell como admin).
2. Guardar o banco atual: renomear `C:\SistemaHotel\dados\hotel.db` para `hotel-velho.db`
   (e apagar `hotel.db-wal` e `hotel.db-shm`, se existirem).
3. Copiar o backup escolhido (`Backup Hotel\diario\hotel-AAAA-MM-DD.db`) para
   `C:\SistemaHotel\dados\hotel.db`. As fotos ficam em `Backup Hotel\fotos` → copiar para `dados\fotos`.
4. `servico.ps1 iniciar`.

## 7. Se algo der errado

- `servico.ps1 status` e `servico.ps1 log` mostram se o sistema está no ar e as últimas mensagens.
- `servico.ps1 reiniciar` reinicia o sistema.
- O banco fica em `C:\SistemaHotel\dados\hotel.db`; os logs em `C:\SistemaHotel\dados\logs`.
