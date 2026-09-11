-- Vero — empréstimos entre pessoas (aplicado a 2026-09-11 no projeto `vero`).
-- "quitado" existe no check mas NÃO se usa: deduz-se de falta = 0. Só "perdoado" é escolha de alguém.
-- A matemática é conservadora e vive nos LANÇAMENTOS, não aqui:
--   emprestei → o dinheiro SAI na hora (lançamento de saída) e o que volta é entrada quando volta.
--                "A receber" nunca entra no livre de verdade até cair na conta.
--   peguei    → o dinheiro ENTRA na hora (entrada) e o que falta devolver conta como "a pagar",
--                descontado do livre como uma conta fixa por pagar.
-- Cada pagamento (parcial ou total) é um lançamento com `emprestimo = <id>`; o que falta é calculado,
-- nunca guardado — um número só, uma fonte só (a lição de que números que divergem entre telas matam a confiança).

create table public.emprestimos (
  id         text primary key check (char_length(id) between 4 and 40),
  casa_id    uuid not null references public.casas(id) on delete cascade,
  direcao    text not null check (direcao in ('emprestei', 'peguei')),
  pessoa     text not null check (char_length(pessoa) between 1 and 40),
  valor      integer not null check (valor > 0 and valor < 100000000),
  data       date not null,
  prometido  date,
  conta      text not null check (conta in ('sas', 'ela')),
  nota       text not null default '' check (char_length(nota) <= 120),
  estado     text not null default 'aberto' check (estado in ('aberto', 'quitado', 'perdoado')),
  criado_em  timestamptz not null default now()
);
create index emprestimos_casa on public.emprestimos (casa_id);
alter table public.emprestimos enable row level security;
create policy emp_casa on public.emprestimos for all to authenticated
  using (casa_id = privado.minha_casa()) with check (casa_id = privado.minha_casa());

-- o pagamento de um empréstimo é um lançamento ligado a ele (como a conta fixa usa a coluna `fixa`)
alter table public.lancamentos add column emprestimo text not null default '' check (char_length(emprestimo) <= 40);

alter publication supabase_realtime add table public.emprestimos;
