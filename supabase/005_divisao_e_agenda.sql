-- 005 (10/11/2026): conta fixa dividida e agenda do calendário. Só acrescenta: nada se apaga.
--
-- CONTA DIVIDIDA. `valor` continua a ser o que sai do bolso de quem a cadastrou (a sua parte):
-- assim nenhuma conta do "Sobrou" muda, e um celular com a versão antiga continua certo.
-- `total` é a conta inteira, `dividida_com` o nome de quem paga o resto, e `outro_pagou` os meses
-- (AAAA-MM) em que essa pessoa já pagou a parte dela. Sem `total`, a conta não é dividida.
alter table public.fixas add column if not exists total integer
  check (total is null or (total > 0 and total < 100000000));
alter table public.fixas add column if not exists dividida_com text
  check (dividida_com is null or char_length(dividida_com) <= 40);
alter table public.fixas add column if not exists outro_pagou jsonb
  check (outro_pagou is null or jsonb_typeof(outro_pagou) = 'array');

-- AGENDA. Compromissos que ele marca num dia do calendário (cabeleireiro, aniversário). Os
-- feriados nacionais não vivem aqui: o app calcula-os, para nunca ficarem desactualizados.
-- `repete`: '' uma vez só, 'mes' todo mês no mesmo dia, 'ano' todo ano no mesmo dia.
create table if not exists public.agenda (
  id        text primary key check (char_length(id) between 4 and 40),
  casa_id   uuid not null references public.casas(id) on delete cascade,
  data      text not null check (data ~ '^\d{4}-\d{2}-\d{2}$'),
  hora      text check (hora is null or hora ~ '^\d{2}:\d{2}$'),
  titulo    text not null check (char_length(titulo) between 1 and 60),
  repete    text not null default '' check (repete in ('', 'mes', 'ano')),
  conta     text not null,
  criado_em timestamptz not null default now()
);
create index if not exists agenda_casa on public.agenda (casa_id);

alter table public.agenda enable row level security;
drop policy if exists agenda_casa on public.agenda;
create policy agenda_casa on public.agenda for all to authenticated
  using ((casa_id = privado.minha_casa()) and privado.carteira_visivel(casa_id, conta))
  with check ((casa_id = privado.minha_casa()) and privado.carteira_visivel(casa_id, conta));

alter publication supabase_realtime add table public.agenda;
