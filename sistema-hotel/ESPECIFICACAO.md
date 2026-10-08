# Sistema do Hotel: especificação para o Claude Code

Versão 1 · 08/10/2026 · Autor: Hugo (com análise da planilha `LANÇAMENTOS ATUAIS 24.09.2026.xlsx`)

> **Como usar este documento:** cole-o na raiz do projeto como `ESPECIFICACAO.md` (e um resumo no `CLAUDE.md`). Construa por fases (seção 11). Não pule a importação nem a validação de totais: ela prova que o sistema bate com a planilha.

---

## 1. Contexto

- Hotel pequeno de passagem em Cacoal/RO (na planilha a receita aparece como "HOTEL TROPICAL"; o nome é configurável).
- **Usuário único no dia a dia:** o dono (pai do Hugo), pessoa mais velha, pouco acostumada com tecnologia. Atende no balcão e no WhatsApp.
- **Onde roda:** no computador do hotel, que fica sempre ligado. Sem servidor contratado. Acesso pelo celular é desejável, mas o uso principal é no computador.
- **Hoje:** tudo numa planilha Excel com erros (seção 9). O sistema substitui a planilha.

### Perfil da operação (dados reais, jan/2025 a 08/10/2026)

| Indicador | Valor |
|---|---|
| Diárias lançadas | 3.382 (R$ 639.762) |
| Estadias | ~2.400, média 1,4 noite, **78% de 1 noite só** |
| Hóspedes distintos | ~1.527; **54% das estadias são de quem já veio antes** |
| Chegada | 46% às 12h, 29% às 18h, o resto à noite/madrugada |
| Pagamento | Pix 69%, cartão 18%, dinheiro 13% |
| Origem | RO 73%, MT 8%, AC 5% |
| Receita média/mês | 2025: R$ 31.890 · 2026 (jan a set): R$ 28.215 |
| Sobra da operação/mês | ~R$ 14 a 15 mil (≈48%), consumida por obra (~R$ 9,8 mil) e financiamento (~R$ 3,9 a 4,5 mil) |

**Consequência para o produto:** a tela mais usada é o **check-in rápido no balcão** com preenchimento automático para hóspede que volta. O link de reserva online é importante, mas secundário.

---

## 2. Decisões fechadas

| Tema | Decisão |
|---|---|
| Plataforma | Um sistema web só, que roda no PC do hotel e abre no navegador do PC e do celular (responsivo, instalável como ícone/PWA) |
| Hospedagem | Local, no PC do hotel. Acesso externo por Cloudflare Tunnel (grátis). Único custo: domínio .com.br (~R$ 40/ano) |
| Energia | Sem nobreak. O PC deve **ligar sozinho quando a energia volta** (BIOS: "Restore on AC Power Loss = Power On") e o sistema deve subir sozinho com o Windows |
| Check-in / check-out | Entrada 12h, saída 12h do dia seguinte. Diária = 1 noite |
| Aluguel por horas | Não existe como produto. **Mas acontece de o hóspede pagar a diária cheia, sair antes, o quarto ser limpo e alugado de novo na mesma noite.** O sistema precisa permitir isso (seção 4, regra de reaproveitamento) |
| Preço | Por número de pessoas (seção 5.6) |
| Reserva pelo link | Cobra **sinal de 30%** por Pix. Quarto fica segurado por **30 minutos** esperando o Pix |
| Cancelamento | Sinal devolvido **só** se a reserva foi feita pelo link e cancelada em até 7 dias da data da reserva (art. 49 do CDC). Depois disso ou no-show, o sinal fica como garantia |
| Chave Pix | CNPJ do hotel (valor em Configurações) |
| Funcionárias | Fixas (salário), com vales/adiantamentos ao longo do mês |
| Alimentação | Hoje a planilha mistura compras da casa com as do hotel → o sistema precisa separar |
| Ficha digital (FNRH gov.br) | **Fase 3**, não entra agora |
| Backup | Diário, automático, para pasta do Google Drive |

---

## 3. Arquitetura recomendada

- **Backend:** Node.js (LTS) + Fastify (ou Express) + **SQLite** (`better-sqlite3`). Um arquivo de banco, fácil de copiar e fazer backup. Volume é pequeno (centenas de lançamentos/mês).
- **Frontend:** React + Vite, servido pelo próprio backend. PWA (manifest + ícone) para "instalar" no celular.
- **Serviço no Windows:** registrar o app como serviço (ex.: NSSM ou `node-windows`) para subir no boot sem login. Mesmo para o `cloudflared`.
- **Acesso externo:** Cloudflare Tunnel com dois hostnames:
  - `reservas.<dominio>` → **somente** rotas públicas (vitrine dos quartos, disponibilidade, pré-reserva).
  - `painel.<dominio>` → painel completo, protegido por login do app **e** Cloudflare Access (plano grátis, e-mail do Hugo e do pai).
- **Login:** senha forte, sessão longa no PC do hotel (ele não deve ter que logar todo dia), sessão normal no celular. Senhas com hash (argon2/bcrypt).
- **Fotos:** salvas em disco, redimensionadas no upload (máx. ~1600px, JPEG/WebP ~80%) + miniatura.
- **Backup:** todo dia às 03h, cópia consistente do SQLite (`.backup`) + pasta de fotos para uma pasta sincronizada pelo **Google Drive para computador**. Manter 30 diárias + 12 mensais. Tela de Configurações mostra "último backup: dd/mm hh:mm" em verde, vermelho se > 48h.
- **Monitor:** se o sistema estiver fora do ar, o Hugo precisa saber. Usar um monitor grátis de uptime (ex.: ping no `reservas.<dominio>/health`) que avisa o Hugo por e-mail.
- **Fuso:** America/Porto_Velho (UTC-4). Moeda BRL, datas dd/mm/aaaa, tudo em pt-BR.

---

## 4. Modelo de dados

Todas as tabelas com `id`, `criado_em`, `atualizado_em`. Nada é apagado de verdade: usar `cancelado/arquivado` + log de auditoria (quem, quando, o quê) para tudo que mexe em dinheiro.

| Tabela | Campos principais |
|---|---|
| `quartos` | codigo ("1A", "12"), nome de exibição, capacidade máx., descrição, comodidades (lista), ativo (sim/não), mostrar_no_site (sim/não), ordem |
| `quarto_fotos` | quarto_id, arquivo, capa (sim/não), ordem |
| `tarifas` | nº de pessoas → valor da diária (tabela global; permitir exceção por quarto) |
| `hospedes` | nome, cpf_cnpj (único quando houver), telefone, cidade, uf, observações, criado_em |
| `estadias` | quarto_id, hospede_id, data_entrada, data_saida (exclusiva), nº_pessoas, valor_diaria, total, **status** (`pre_reserva`, `confirmada`, `hospedado`, `finalizada`, `cancelada`, `no_show`, `expirada`), **origem** (`balcao`, `whatsapp`, `link`), hora_chegada_prevista, sinal_previsto, pre_reserva_expira_em, reservado_em, obs |
| `pagamentos` | estadia_id, valor, forma (`pix`, `cartao`, `dinheiro`), tipo (`sinal`, `saldo`, `diaria`, `devolucao`), **conta_recebedora** (H, V, N ou outra, configurável), data, obs |
| `despesas` | data, categoria_id, fornecedor, descrição, valor, forma, conta_a_pagar_id (se veio de uma conta) |
| `categorias` | nome, **grupo**: `operacao`, `obra`, `financiamento`, `investimento` (equipamento/móveis), `casa_pessoal`, `retirada` (pró-labore) |
| `contas_recorrentes` | nome, fornecedor, categoria_id, valor previsto (ou "variável"), dia de vencimento, recorrência (mensal), parcelas restantes (opcional), avisar X dias antes, ativa |
| `contas_a_pagar` | gerada da recorrente ou avulsa: descrição, vencimento, valor previsto, valor pago, data_pagamento, status (`aberta`, `paga`, `atrasada`) |
| `funcionarias` | nome, salário, dia de pagamento, ativa |
| `vales` | funcionaria_id, data, valor, obs (descontado no fechamento do mês) |
| `config` | nome do hotel, CNPJ/chave Pix, nome e cidade do recebedor Pix, WhatsApp do hotel, % do sinal (30), minutos de segura (30), horário check-in/out, texto da política de cancelamento |

**Regra de ouro:** receita **nunca** é lançada à mão no caixa. O caixa soma `pagamentos` automaticamente. (Hoje a receita é digitada duas vezes e os números não batem.)

**Regra anti-overbooking:** não pode existir duas estadias ativas (`pre_reserva` não expirada, `confirmada`, `hospedado`) no mesmo quarto com noites sobrepostas. Validar no banco dentro de transação, não só na tela.

**Regra de reaproveitamento (saída antecipada):** quando o hóspede sai antes do fim da diária, o dono clica **"Saiu"** → a estadia vira `finalizada` com `saida_real_em` (data e hora) e o quarto passa para o estado **"Limpar"**. Ao clicar **"Quarto limpo"**, ele volta a ficar livre **na mesma noite** e pode receber outra estadia. Como a estadia anterior não está mais ativa, a regra anti-overbooking continua valendo sem exceção. Campos extras: `estadias.saida_real_em`, `quartos.estado_limpeza` (`limpo`, `limpar`). A diária do primeiro hóspede não é devolvida nem reduzida.

Efeito nos números: um quarto pode render **mais de uma diária na mesma noite**. Relatórios mostram "diárias vendidas" (pode passar de 100% por quarto) e "quartos-noite ocupados" separadamente.

---

## 5. Telas (painel do dono)

### Identidade visual (a partir da logo do Hotel Tropical)

Logo: `assets/logo-hotel-tropical.png` (sol laranja, coqueiros verdes, prédio com janelas marrons, "HOTEL" em verde e "Tropical" em letra cursiva azul-petróleo). Clima: **tropical, claro e acolhedor, mas sóbrio no painel**. A personalidade da marca aparece mais na página pública; no painel, a marca entra nas cores e no cabeçalho, e a prioridade é leitura fácil.

**Cores da marca** (amostradas da logo) e uso:

| Token | Cor | Uso |
|---|---|---|
| `--azul-tropical` | `#0A7BA3` | Cor principal: cabeçalho, links, destaques. Texto branco sobre ela: contraste 4,8 |
| `--azul-escuro` | `#076A8E` | **Botões principais** (texto branco, contraste 6,1) e estado "ocupado" |
| `--verde-coqueiro` | `#879E40` | Detalhes decorativos (ícones, bordas). **Não usar para texto** sobre branco (contraste 3,0) |
| `--verde-escuro` | `#4F6121` | Texto/estado "livre" e "pago" (contraste 6,9) |
| `--laranja-sol` | `#F2921A` | Acentos e bordas; **nunca como fundo de texto branco** (contraste 2,4) |
| `--laranja-escuro` | `#9A5208` | Texto do estado "sai hoje / vence hoje" (contraste 5,9) |
| `--marrom-janela` | `#8B4A42` | Estado "Limpar" (quarto aguardando limpeza) |
| `--areia` | `#FFF8EC` | Fundo geral (quente, menos cansativo que branco puro) |
| `--tinta` | `#1F2A30` | Texto principal (contraste 14,7 sobre branco) |
| `--vermelho-alerta` | `#B42318` | Atrasado / problema (fora da marca de propósito, para chamar atenção) |

Estados no mapa e nos alertas = fundo claro da cor + borda + **texto escrito** (nunca só cor): Livre (verde), Ocupado (azul), Chega hoje (amarelo `#FFE9A8` com texto `#6B4E00`), Sai hoje (laranja), Limpar (marrom), Atrasado (vermelho).

**Tipografia:** **Atkinson Hyperlegible** (gratuita, Google Fonts, criada para leitura com baixa visão) para toda a interface, embutida no app (funciona sem internet). A letra cursiva da logo **não** é usada em textos, só na imagem da logo. Números de dinheiro com algarismos tabulares e alinhados à direita.

**Logo e ícones:**
- Painel: logo pequena no canto do cabeçalho (altura ~40px) + nome do hotel.
- Página pública: logo grande no topo, fotos dos quartos em destaque, cantos arredondados, uma faixa curva laranja discreta lembrando o horizonte da logo.
- Ícone do app (PWA/favicon/atalho do Windows): recorte do sol + coqueiros em fundo `--areia`, legível em 48px.
- Tela de carregamento e login: logo centralizada sobre `--areia`.
- Pedir ao Hugo a logo em alta resolução/vetor se existir; a atual veio de um print de tela.

### Princípios de design (usuário mais velho)
- Fonte base **18px**, títulos 24px+, sem fonte fina. Alto contraste (texto quase preto em fundo claro).
- Botões grandes (mín. **48×48px**), com texto escrito, não só ícone.
- **4 áreas no menu**, sempre no mesmo lugar: **Hoje · Quartos · Caixa · Contas** (+ Configurações discreto). No PC: menu lateral fixo. No celular: barra fixa embaixo.
- O que importa aparece **na primeira tela, sem rolar**.
- Toda ação de dinheiro pede confirmação clara ("Confirmar pagamento de R$ 200,00 em Pix?") e permite **desfazer** por alguns segundos.
- Cores com significado fixo: **verde** livre/pago, **azul** ocupado, **amarelo** chega hoje / vence em breve, **laranja** sai hoje / vence hoje, **vermelho** atrasado/problema. Nunca só cor: sempre com texto.
- Linguagem simples: "Chegou", "Saiu", "Recebi", "Paguei". Nada de "check-in/checkout" nos botões principais (pode aparecer como subtítulo).
- Busca tolerante a acento e maiúscula.

### 5.1 Hoje (tela inicial)
- Faixa de **alertas** no topo (seção 7), em ordem de urgência.
- 4 números: quartos ocupados hoje / livres / chegadas / saídas.
- Lista **Chegam hoje** (nome, quarto, hora prevista, **saldo a receber em destaque**) com botão grande "Chegou".
- Lista **Saem hoje** (nome, quarto, saldo) com botão "Saiu". Se houver saldo, o botão abre a cobrança antes. O botão "Saiu" também aparece em qualquer hóspede que está no hotel, para saída antecipada.
- Lista **Para limpar**: quartos com hóspede que já saiu, com botão grande "Quarto limpo" (libera para alugar de novo, inclusive na mesma noite).
- Pré-reservas aguardando Pix com **contador regressivo** e botões "Pix recebido" / "Cancelar".
- Botão principal enorme: **"+ Nova hospedagem"**.

### 5.2 Nova hospedagem (check-in rápido) — tela mais importante
1. Campo único "CPF ou telefone". Ao digitar, busca hóspede existente e **preenche tudo** (nome, telefone, cidade, UF). Mostra "Já veio X vezes, última em dd/mm".
2. Quarto: botões só com os quartos **livres** para as datas.
3. Datas: entrada = hoje (padrão), botões rápidos "1 noite / 2 / 3 / outra".
4. Nº de pessoas → diária sugerida pela tabela (editável, com motivo opcional).
5. Pagamento agora? forma (Pix / Cartão / Dinheiro) + conta que recebeu (H/V/N) + valor (padrão = total).
6. Salvar. Meta: **hóspede que volta em menos de 30 segundos**.

### 5.3 Quartos (mapa)
- Grade: linhas = quartos, colunas = dias (padrão: hoje + 13 dias; navegação por semana/mês). Célula colorida com nome do hóspede. Quando houve 2 hóspedes na mesma noite (saída antecipada + novo aluguel), a célula mostra os dois nomes, em ordem.
- Na coluna de hoje, quarto em estado "Limpar" aparece com etiqueta própria.
- Clicar numa célula livre = nova hospedagem já com quarto e data. Clicar numa ocupada = detalhes da estadia (pagamentos, saldo, trocar quarto, estender, cancelar).
- Aba **"Editar quartos"**: o dono cadastra/edita nome, descrição, capacidade, comodidades, fotos (arrastar do PC ou tirar do celular, escolher capa e ordem), ligar/desligar "mostrar no site". Botão **"Ver como o hóspede vê"**. Salvou = já está no site.

### 5.4 Caixa
- Seleção de período (dia / semana / mês).
- Bloco **Entradas** (automático dos pagamentos): por forma e por conta recebedora.
- Bloco **Saídas** separado por grupo: Operação · Obra · Financiamento · Investimento · Casa/pessoal · Retiradas.
- **Três resultados**, nessa ordem, com explicação em uma linha:
  1. **Resultado do hotel** = entradas − operação (mostra se o hotel dá lucro).
  2. **Depois da obra e do financiamento**.
  3. **Depois de casa e retiradas** (o que sobrou de verdade).
- "Lançar despesa": data (hoje), categoria (botões das mais usadas), fornecedor (autocompleta), valor, forma. Rápido como o check-in.
- Comparação com o mesmo mês do ano anterior.

### 5.5 Contas
- Lista de contas a pagar do mês, ordenadas por vencimento, com status colorido.
- Botão "Paguei" → registra valor real e data, e gera a despesa automaticamente (sem lançar duas vezes).
- Cadastro de contas recorrentes (seção 7.1 já pré-carregada).
- Funcionárias: salário, vales do mês, saldo a pagar no dia do pagamento.

### 5.6 Tabela de preço (Configurações)
Pré-carregar e deixar editável:

| Pessoas | Diária |
|---|---|
| 1 | R$ 150 |
| 2 | R$ 200 |
| 3 | **R$ 300 (confirmar: a planilha tem 250 e 300 meio a meio)** |
| 4 | R$ 400 |
| 5 | R$ 500 |

Regra dita pelo dono: acima de 2 pessoas, **R$ 100 por pessoa**. Diária pode ser editada na hora (desconto/cliente fixo).

### 5.7 Hóspedes
- Busca por nome, CPF, telefone. Histórico de estadias e total gasto.
- Botão "Mandar WhatsApp" (abre `wa.me` com o número).
- Lista "clientes que mais voltam" (útil para mensagens de retorno no futuro).

---

## 6. Página pública de reserva (`reservas.<dominio>`)

Mobile first, leve (abre bem em 4G), sem login.

1. Topo: nome do hotel, foto, endereço, botão WhatsApp.
2. Hóspede escolhe **datas** e **nº de pessoas** → vê só os quartos disponíveis que comportam o grupo, com fotos, descrição e **total** da estadia.
3. Escolhe o quarto → informa nome, telefone (WhatsApp) e CPF (opcional nesta etapa).
4. Mostra resumo: datas, quarto, total, **sinal de 30%** e saldo a pagar na chegada.
5. Mostra a **política de cancelamento** em texto claro + caixinha obrigatória "Li e concordo".
6. Cria `pre_reserva` com expiração em **30 minutos** (quarto bloqueado nesse tempo).
7. Mostra **Pix copia e cola + QR Code com o valor exato do sinal** (BR Code estático no padrão do Banco Central, gerado localmente, chave = CNPJ). Atenção na implementação: CRC16-CCITT (0x1021, init 0xFFFF) calculado incluindo "6304"; valor com ponto ("60.00"); nome/cidade sem acento e em maiúsculas; testar no app de pelo menos 2 bancos antes de publicar.
8. Botão **"Já paguei, enviar comprovante"** → abre o WhatsApp do hotel com mensagem pronta (código da reserva, nome, quarto, datas, valor do sinal).
9. Contador visível: "Seu quarto fica reservado até hh:mm".

No painel: a pré-reserva aparece em **Hoje** com alerta. O dono confere o Pix no banco e clica **"Pix recebido"** → vira `confirmada` e registra o pagamento tipo `sinal`. Se passar de 30 min sem confirmação → `expirada` automaticamente e o quarto volta a ficar livre. (O sistema **não** sabe sozinho se o Pix caiu: gerar o código não é processar pagamento.)

Política de cancelamento (texto padrão, editável em Configurações):
> "Para garantir sua reserva, cobramos 30% do valor como sinal. Se você cancelar em até 7 dias depois de fazer a reserva, devolvemos o sinal. Depois desse prazo, ou se não comparecer, o sinal fica como garantia e não é devolvido. O restante é pago na chegada."

Segurança da página pública: rate limit por IP na criação de pré-reserva (ex.: 5 por hora), honeypot/captcha simples, nunca expor dados de outros hóspedes, nem o painel por essa origem.

---

## 7. Alertas

Aparecem no topo da tela **Hoje** e com contador no menu.

| Alerta | Quando | Cor |
|---|---|---|
| Conta vence em breve | X dias antes (padrão 3) | amarelo |
| Conta vence hoje | no dia | laranja |
| Conta atrasada | depois do vencimento | **vermelho**, fica até marcar "Paguei" |
| Pré-reserva aguardando Pix | enquanto não expira, com contador | laranja |
| Hóspede saindo com saldo em aberto | dia da saída, saldo > 0 | vermelho |
| Hóspede chegou com sinal e saldo a cobrar | na chegada | amarelo |
| Saída passou de 12h e quarto não foi liberado | após 12h | amarelo |
| Backup atrasado | último backup > 48h | vermelho (só em Configurações + Hoje) |

### 7.1 Contas recorrentes para pré-carregar (inferidas da planilha; confirmar valores/dias)

| Conta | Valor de referência | Vencimento |
|---|---|---|
| Financiamento Sicoob, parcela 1 | ~R$ 1.369 (decrescente) | ~dia 5 (confirmar no app Sicoob) |
| Financiamento Sicoob, parcela 2 | ~R$ 2.421 | ~dia 10 (confirmar no app Sicoob) |
| Energisa (luz) | ~R$ 2.100 (variável) | **dia 21** (confirmado pelo dono) |
| SAAE (água) | ~R$ 250 (variável) | ~dia 20 |
| Internet Duxnet | R$ 130 | ~dia 5 |
| Contabilidade (Gestão Contábil) | R$ 460 | ~dia 20 |
| Seguro Sicoob | R$ 145,08 | ~dia 15 |
| Receita Federal (impostos) | variável | conferir com a contabilidade |
| Salários das funcionárias | por funcionária | dia definido em Funcionárias |

Financiamento: o dono estima **8 a 9 parcelas restantes**. Cadastrar com contador de parcelas e mostrar "faltam N" e a data prevista de quitação.

### 7.2 Alerta no celular (Fase 3)
Gerar um **link de calendário (.ics)** com os vencimentos que o celular do dono assina uma vez; o próprio calendário do celular avisa sem abrir o app. Alternativa: e-mail diário às 7h com "vence hoje / atrasadas".

---

## 8. Importação da planilha (obrigatória na Fase 1)

Arquivo: `LANÇAMENTOS ATUAIS 24.09.2026.xlsx` (contém dados até 10/10/2026).

### 8.1 Aba `CADASTRO GERAL` (hóspedes e diárias)
Cabeçalho na linha 3/4, dados a partir da linha 6. **Cada linha = 1 diária (1 noite)**.

| Coluna | Significado | Tratamento |
|---|---|---|
| B `APTO` | quarto | `trim` + maiúsculas ("2A ", "1a" → "2A", "1A") |
| C `DATA` | data da noite | data |
| D `CLIENTE` | nome (às vezes "NOME - ACOMPANHANTE") | manter como está |
| E `CPF/CNPJ` | documento (alguns mascarados "*** 977 432 **") | normalizar dígitos; mascarado = sem documento |
| F `FONE` | telefone | só dígitos |
| G/H | cidade / UF | |
| I `HOSP.` | nº de pessoas | |
| J `HORA ENT.` | hora de chegada, formato "12;00" | converter ";" → ":" |
| K `VALOR` | valor da diária | |
| L `PAGO / A REC` | pago ou a receber | |
| M `C D P` | forma: C cartão, D dinheiro, P Pix | 212 linhas têm outra coisa (datas como "20.02", "2026-08-17") e 70 estão vazias → importar como "não informado" e listar |
| N `H V N` | **conta/pessoa que recebeu: H = Hugo, V = Valdo, N = Nereide** (confirmar com o Hugo). 245 linhas têm "PIX", "D", "J", "C" digitados por engano | mapear H/V/N; o resto → "não informado" |
| O `ANTECIPAÇÃO` | anotações ("PRIMEIRA", "SEGUNDA" diária, valores) | ir para `obs` |
| P `OBS / N.F` | observações / nota fiscal | `obs` |

Agrupamento: noites **consecutivas**, mesmo quarto, mesmo cliente → **uma estadia** (`data_saida` = última noite + 1). Hóspede único por CPF; sem CPF, por nome + telefone.

Problemas a **sinalizar, não apagar** (gerar relatório "Para conferir" na tela de importação):
- **15 linhas em duplicidade exata** (mesmo quarto, data e cliente), somando R$ 2.424.
- **45 noites com 2 clientes diferentes no mesmo quarto**. Na maioria são **legítimas** (hóspede saiu antes, quarto limpo e alugado de novo). Importar normalmente como duas estadias, a primeira `finalizada` (sem hora real de saída conhecida). Só marcar "para conferir" quando o segundo cliente também ocupa a noite seguinte e o primeiro também (sobreposição real de mais de uma noite).
- 7 linhas sem valor e 7 "A REC".
- Linhas de datas futuras (até 10/10/2026) → importar como `confirmada`.

### 8.2 Aba `DESPESAS 2025` (contém 2025 e 2026)
Colunas: B data, C tipo (categoria), D fornecedor, F descrição, G qtd, H valor unit., I total (=G×H), J receitas.

- Linhas com valor em **J (receitas)**, fornecedor "HOTEL TROPICAL" (627 linhas, R$ 652.044): **não importar como receita** (a receita vem do cadastro). Usar só num relatório de conferência "planilha antiga × cadastro" por mês.
- Normalizar categorias: "CONTA DE LUZ" → "CONTA LUZ", "IMPOSTO" → "IMPOSTOS", "CONTA GAZ" → "GAZ".
- Mapear grupos:
  - `FINAN SICOOB` (está em IMOBILIZADO) → categoria **Financiamento Sicoob**, grupo `financiamento`
  - demais IMOBILIZADO (ar, TV, espelho, placas) → grupo `investimento`
  - CONSTRUÇÃO → grupo `obra`
  - PRO-LABORE → grupo `retirada`
  - ALIMENTAÇÃO → grupo `operacao` por enquanto, com aviso: "mistura casa e hotel" (dono confirmou). Daqui pra frente, lançar separado.
  - resto → `operacao`

### 8.3 Validação obrigatória (teste automatizado)
Depois da importação, os totais precisam bater:

| Verificação | Esperado |
|---|---|
| Diárias com data no cadastro | 3.382 |
| Soma das diárias | R$ 639.762,00 |
| Diárias 2025 / soma | 2.140 / R$ 382.675,00 |
| Diárias 2026 / soma | 1.242 / R$ 257.087,00 |
| Set/2026 | 144 diárias / R$ 32.500,00 |
| Linhas de despesa | 2.516 |
| Soma das despesas (G×H) | R$ 650.974,79 |

Diferenças devem aparecer na tela "Para conferir", nunca serem corrigidas em silêncio.

### 8.4 As outras abas
Abas mensais (`SET 25`, `DEZ 25` etc.) são calendários com fórmulas quebradas e quase todas vazias: **ignorar**. `FATURAMENTO` (2023 a jan/2025, total mensal): importar só como histórico de comparação.

---

## 9. Problemas da planilha atual (o que o sistema elimina)

1. Não existe mapa de quartos funcionando (calendários vazios ou com fórmula apontando para o dia errado, sem os quartos "A", sem 2026).
2. Receita digitada duas vezes, com valores que não batem.
3. Diárias duplicadas, e quarto realugado na mesma noite sem registro de que o primeiro hóspede saiu (não dá para saber se foi realuguel ou erro).
4. Códigos de quarto inconsistentes; forma de pagamento com datas digitadas.
5. Financiamento escondido como "imobilizado"; obra e casa misturadas com a operação, o que faz o hotel parecer dar prejuízo quando dá lucro.
6. Dados pessoais de ~1.500 hóspedes numa planilha sem senha.

---

## 10. Segurança e LGPD
- Painel só com login. Página pública não expõe nenhum dado de hóspede.
- CPF e telefone visíveis só no painel. Logs sem CPF.
- Backup no Drive da conta do hotel/Hugo, com acesso restrito.
- Botão "exportar tudo" (Excel) em Configurações: o dono nunca fica preso ao sistema.

---

## 11. Fases e critérios de pronto

### Fase 1 — Funciona no PC do hotel (sem internet externa)
Quartos (cadastro + fotos), tabela de preço, Nova hospedagem, mapa, Hoje, Hóspedes, Caixa com 3 resultados, despesas, Contas + recorrentes + alertas, funcionárias/vales, importação com validação (8.3), backup diário, serviço que sobe sozinho.
**Pronto quando:** (a) importação bate os totais; (b) check-in de hóspede que volta < 30 s; (c) desligar o PC da tomada e religar → sistema volta sozinho sem ninguém mexer; (d) o dono lança 1 dia inteiro real sem ajuda.

### Fase 2 — Acesso pelo celular e reserva online
Domínio, Cloudflare Tunnel (2 hostnames), Cloudflare Access no painel, PWA, página pública, pré-reserva de 30 min, Pix com valor do sinal, WhatsApp com mensagem pronta, política + aceite, rate limit, monitor de uptime.
**Pronto quando:** reserva de teste ponta a ponta pelo 4G, Pix testado em 2 bancos, pré-reserva expira sozinha em 30 min, e 2 pessoas tentando o mesmo quarto ao mesmo tempo não geram overbooking.

### Fase 3 — Extras
Calendário .ics/e-mail de vencimentos no celular, ficha digital FNRH, relatórios anuais, mensagem de retorno para clientes frequentes.

**Medir depois de 30 dias da Fase 2:** quantas reservas vieram pelo link. Se forem poucas, não investir mais na página pública.

---

## 12. Entrega e instalação

O desenvolvimento acontece no notebook do Hugo (Windows). O sistema vai rodar no PC do hotel. Por isso a entrega é um **instalador único**:

- Gerar `Instalar-Sistema-Hotel.exe` (ex.: Inno Setup) que **leva tudo dentro**: o runtime do Node, o app já compilado e o `cloudflared`. O PC do hotel **não precisa ter nada instalado antes**.
- Atenção: `better-sqlite3` tem parte nativa. Compilar para **Windows x64** e testar o instalador numa máquina "limpa" (ou VM) antes de levar ao hotel.
- O instalador: copia os arquivos para `C:\SistemaHotel`, cria a pasta de dados `C:\SistemaHotel\dados` (banco + fotos), registra o app como serviço do Windows (sobe sozinho no boot), cria um **atalho na área de trabalho** "Hotel" que abre o navegador no sistema, e abre o assistente de primeiro uso.
- **Assistente de primeiro uso** (no navegador): criar senha, nome do hotel, CNPJ/chave Pix, importar a planilha (com a tela de validação da seção 8.3), escolher a pasta do Google Drive para backup.
- **Atualizações:** novo instalador com versão maior. Antes de qualquer mudança ele faz backup do banco, atualiza só o programa e **nunca apaga** a pasta `dados`. Migrações de banco automáticas e versionadas.
- **Desinstalar** remove o programa e mantém a pasta `dados`.
- Dados de teste ficam só no notebook do Hugo. A importação real da planilha é feita no PC do hotel, com a versão mais recente da planilha.

---

## 13. Pendências (valores de configuração, não bloqueiam o desenvolvimento)

| Item | Com quem | Onde entra |
|---|---|---|
| Lista dos quartos que existem hoje e quantos ao final da obra (em uso na planilha: 1A, 2A, 3A, 5A, 6A, 7A, 11, 12, 15) | Pai | Quartos (o próprio dono cadastra) |
| Preço para 3 pessoas: 250 ou 300? Quando cobra 250 para 2 pessoas? | Pai | Tabela de preço |
| Confirmar H/V/N = conta de quem recebeu (Hugo/Valdo/Nereide) | Hugo | Importação + campo conta_recebedora |
| CNPJ do hotel (chave Pix), nome e cidade do recebedor | Hugo | Configurações |
| Dia exato de vencimento das 2 parcelas Sicoob e quantas faltam | App Sicoob | Contas recorrentes |
| Domínio escolhido | Hugo | Fase 2 |
| PC do hotel: Windows 10 ou 11, 64 bits? Liga sozinho após queda de energia? | Hugo (teste da tomada) | Fase 1 e instalador |
| Fotos dos quartos | Pai | Quartos |
