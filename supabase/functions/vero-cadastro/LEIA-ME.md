# vero-cadastro — criar conta sem depender de e-mail

Publicada no projeto `vero` a 11/09/2026, com `verify_jwt` **desligado** de propósito: é a porta de entrada, quem chama ainda não tem login.

**Porquê existe:** o servidor de e-mail grátis do Supabase só entrega a quem é da equipe do projeto. O e-mail de confirmação da conta nunca chegaria à segunda pessoa da casa. Aqui a conta nasce já confirmada (`auth.admin.createUser` com `email_confirm: true`).

**A guarda:** no máximo **duas contas** — este Vero é de uma casa. A terceira recebe `contas_cheias`.

Contrato: `POST /functions/v1/vero-cadastro` com `{ email, senha }` → `{ ok: true }` ou `{ erro }`:
`email_invalido` · `senha_curta` · `senha_fraca` · `ja_existe` · `contas_cheias` · `falha`.

Provado a 11/09 contra o banco real: vazio → `email_invalido`; senha de 3 → `senha_curta`; 1.ª e 2.ª contas → `ok` e entram com a senha; repetida → `ja_existe`; 3.ª → `contas_cheias`. Contas de teste apagadas a seguir.

⚠️ **Esqueci a senha** não existe — precisaria de e-mail. Se for preciso, a senha troca-se pelo painel do Supabase (Authentication → Users).
