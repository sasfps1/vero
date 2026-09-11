# vero-ia — a função da IA no Supabase

Publicada no projeto `vero` (`gxddaeujovalkdlaflwn`), com `verify_jwt` ligado.
O código vivo está no Supabase; esta pasta guarda a referência da arquitectura.

**Regra:** o app calcula, a IA interpreta.
- O app manda o painel já calculado (`contexto`, vai como `system`) e a conversa (`historico`).
- A função dá à IA duas ferramentas — `consultar_lancamentos` e `somar_por_categoria` — que
  somam EXATO no banco com o login de quem pergunta. A RLS garante que cada casa só vê a sua.
- Modelo `claude-opus-5`, esforço `medium`, `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`).

**Segredo necessário (o dono põe, ninguém mais):** `ANTHROPIC_API_KEY` em
Supabase → Edge Functions → Secrets. Sem ele, a função responde `{ "erro": "sem_chave" }`.

Contrato: `POST /functions/v1/vero-ia` com `{ contexto: string, historico: [{role, content}] }`
→ `{ texto }` ou `{ erro }`.
