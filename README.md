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

## Estrutura
- `index.html` — o app inteiro (HTML, CSS e JS num arquivo).
- `manifest.webmanifest`, `sw.js`, `icone*.{svg,png}` — instalação e modo offline.
- `supabase/001_esquema.sql` — o esquema do banco.
- `supabase/functions/vero-ia/` — a função da IA (a referência; o código vivo está no Supabase).

## Configuração que só o dono faz
1. Supabase → **Edge Functions → Secrets**: `ANTHROPIC_API_KEY`.
2. Supabase → **Authentication → URL Configuration**: Site URL `https://sasfps1.github.io/vero/`.
