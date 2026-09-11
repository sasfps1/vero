# Vero

Finanças da casa: quanto está **livre de verdade** e quanto dá para gastar por dia. By SAS.ads [IA].

**App:** https://sasfps1.github.io/vero/ — abre no celular e instala na tela inicial.

## Como funciona
- **Login** por e-mail (Supabase Auth). Cada pessoa tem a sua conta.
- **Casa:** quem chega primeiro cria a casa e recebe um código; a outra pessoa entra com esse código. Até duas pessoas por casa.
- **Dados** no Supabase (projeto `vero`, São Paulo), protegidos por RLS — cada casa só enxerga a sua. Dinheiro em centavos inteiros; datas no dia local.
- **Ao vivo:** o que um registra aparece no celular do outro na hora (Realtime).
- **IA:** a função `vero-ia` recebe o painel já calculado e soma o resto no banco com ferramentas. *O app calcula, a IA interpreta.*
- **Contas fixas:** interruptor liga = paga; "lembrar na agenda" cria o aviso mensal no Google Agenda de quem toca.
- **Sem internet:** abre com a última cópia salva no aparelho.

## Proteções (Fase 1, 11/09/2026)
- **Fila de envio:** toda escrita fica guardada no aparelho e vai para o banco sozinha, na ordem, quando a internet voltar (evento "online", ao voltar ao app, e nova tentativa a cada 20 s — o sinal fraco da rua não dispara o evento). Reenviar não duplica (`upsert` por id). Sair da conta com registros na fila é bloqueado.
- **Planilha:** Conta → *Baixar planilha* — todos os registros e as contas fixas em CSV (abre no Excel e no Google Planilhas). O plano grátis do Supabase não dá cópia do banco para baixar; esta é a cópia do dono.
- **Batimento:** `.github/workflows/batimento.yml` lê o banco todo dia às 08:17 (Brasília), para o projeto grátis não pausar por falta de uso. Se falhar, o GitHub manda e-mail. ⚠️ O GitHub desliga agendamentos em repositório público sem commits há 60 dias.
- **Teto da IA:** 40 perguntas por casa por dia, contadas no banco antes de a chave gastar (`gastar_pergunta_ia`).
- **Porta fechada:** depois de criada a primeira casa, ninguém cria outra — só se entra com o código de convite (`criar_casa` → `cadastro_fechado`).
- Provado nos dois estados (sem e com internet) num Chrome invisível com banco falso; a cota e a porta, numa transação desfeita no banco real.

## Estrutura
- `index.html` — o app inteiro (HTML, CSS e JS num arquivo).
- `manifest.webmanifest`, `sw.js`, `icone*.{svg,png}` — instalação e modo offline.
- `supabase/001_esquema.sql` — o esquema do banco. `supabase/002_protecoes.sql` — cota, batimento, porta fechada.
- `supabase/functions/vero-ia/` — a função da IA (a referência; o código vivo está no Supabase).

## Configuração que só o dono faz
1. Supabase → **Edge Functions → Secrets**: `ANTHROPIC_API_KEY`.
2. Supabase → **Authentication → URL Configuration**: Site URL `https://sasfps1.github.io/vero/`.
3. Console da Anthropic → **Limits**: um limite de gasto mensal para a chave (a segunda trava da IA).
4. **Depois de os dois entrarem:** Supabase → Authentication → desligar *Allow new users to sign up*.
