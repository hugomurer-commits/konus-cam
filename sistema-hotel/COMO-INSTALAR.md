# Como instalar o sistema no PC do hotel

Você não precisa instalar nada de programação. É um arquivo só: **Instalar-Sistema-Hotel.exe**.

## 1. Baixar o instalador (no seu computador)

1. Entre no GitHub, no repositório **konus-cam** → aba **Actions** → **Instalador do hotel**.
2. Clique na execução mais recente que estiver com o **✓ verde**.
3. Lá embaixo, em **Artifacts**, clique em **Instalar-Sistema-Hotel**. Baixa um arquivo `.zip`.
4. Abra o `.zip` e copie o **Instalar-Sistema-Hotel.exe** para um pendrive.
5. Copie também para o pendrive a **planilha mais recente** do hotel (o arquivo do Excel).

## 2. Instalar (no PC do hotel)

O PC precisa ser Windows 10 ou 11.

1. Passe o `Instalar-Sistema-Hotel.exe` do pendrive para a Área de Trabalho e clique duas vezes nele.
2. Se aparecer **"O Windows protegeu o computador"**: clique em **Mais informações** → **Executar assim mesmo**.
   (Aparece porque o instalador é novo e não foi comprado de uma empresa. É normal.)
3. Se perguntar **"Deseja permitir que este aplicativo faça alterações?"**: clique **Sim**.
4. Clique em **Avançar** / **Instalar** até o fim. Deixe marcada a opção "Deixar o computador sempre ligado".
5. No fim, o navegador abre sozinho com o sistema. Na área de trabalho aparece o ícone **Hotel**.

## 3. Primeira vez no sistema (uns 10 minutos)

1. **Bem-vindo**: coloque seu nome, um nome de acesso e uma senha. **Anote a senha.**
2. Vai abrir **Primeiros passos**. Faça na ordem:
   - **Importar a planilha antiga**: escolha a planilha do pendrive e clique em Importar. Espere a tabela
     aparecer: todas as linhas devem dizer **"Bate"**.
   - **Dados do hotel**: CNPJ e WhatsApp.
   - **Backup**: se o Google Drive estiver instalado no PC (veja abaixo), aparece o botão
     **"Guardar o backup aqui"**. Clique nele.
   - **Quartos e preços**: confira os quartos em uso e quantas pessoas cabem.
3. Pronto. Daqui pra frente seu pai usa o ícone **Hotel** e a tela **Hoje**.

> Importe a planilha **antes** de lançar qualquer hospedagem à mão: depois do primeiro lançamento a
> importação fica bloqueada (para não misturar dados).

## 4. Backup no Google Drive

1. No PC do hotel, baixe e instale o **Google Drive para computador** (google.com/drive/download).
2. Entre com a sua conta Google.
3. Nas preferências do Google Drive, escolha **"Espelhar arquivos"** (não "Fazer streaming").
4. Volte no sistema → Configurações → Backup → **"Guardar o backup aqui"**.

O sistema faz backup sozinho todo dia de madrugada. Se passar de 2 dias sem backup, aparece um aviso
vermelho na tela Hoje.

## 5. Para o PC ligar sozinho quando a energia voltar

Isso é uma configuração da placa-mãe (BIOS), não do Windows, e precisa ser feita uma vez:

1. Reinicie o PC e, logo que ligar, aperte várias vezes **Delete** ou **F2** (depende do PC).
2. Procure uma opção com nome parecido com **"Restore on AC Power Loss"**, **"AC Power Recovery"** ou
   **"After Power Failure"** e mude para **"Power On"** (ou "Ligado").
3. Salve e saia (geralmente **F10** → Yes).

Teste: com o sistema aberto, tire o PC da tomada, espere 10 segundos e ligue de volta na tomada **sem
apertar o botão**. O PC deve ligar sozinho e, 1 minuto depois, o ícone Hotel abre o sistema com tudo
que estava lá.

Se não achar a opção na BIOS, tire uma foto da tela e me mande.
