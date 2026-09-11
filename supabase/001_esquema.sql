-- Vero — esquema do banco (Supabase / Postgres)
-- Uma CASA tem até duas pessoas (vagas 'sas' e 'ela', nomes editáveis).
-- Tudo é da casa, e cada pessoa só enxerga a própria casa (RLS).
-- Dinheiro em CENTAVOS inteiros. Datas em `date` (dia local, nunca UTC).

create extension if not exists pgcrypto;

create table public.casas (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6)),
  criado_em  timestamptz not null default now()
);

create table public.membros (
  casa_id  uuid not null references public.casas(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  vaga     text not null check (vaga in ('sas', 'ela')),
  nome     text not null default 'Você' check (char_length(nome) between 1 and 20),
  primary key (casa_id, user_id),
  unique (casa_id, vaga),
  unique (user_id)
);

create table public.lancamentos (
  id          text primary key check (char_length(id) between 4 and 40),
  casa_id     uuid not null references public.casas(id) on delete cascade,
  data        date not null,
  tipo        text not null check (tipo in ('entrada', 'saida')),
  valor       integer not null check (valor > 0 and valor < 100000000),
  categoria   text not null check (char_length(categoria) between 1 and 40),
  conta       text not null check (conta in ('sas', 'ela')),
  nota        text not null default '' check (char_length(nota) <= 120),
  fixa        text not null default '' check (char_length(fixa) <= 40),
  criado_por  uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em   timestamptz not null default now()
);
create index lancamentos_casa_data on public.lancamentos (casa_id, data desc);

create table public.fixas (
  id         text primary key check (char_length(id) between 4 and 40),
  casa_id    uuid not null references public.casas(id) on delete cascade,
  nome       text not null check (char_length(nome) between 1 and 40),
  valor      integer not null check (valor > 0 and valor < 100000000),
  conta      text not null check (conta in ('sas', 'ela')),
  dia        smallint check (dia between 1 and 31),
  criado_em  timestamptz not null default now()
);
create index fixas_casa on public.fixas (casa_id);

create table public.categorias (
  casa_id  uuid not null references public.casas(id) on delete cascade,
  tipo     text not null check (tipo in ('entrada', 'saida')),
  nome     text not null check (char_length(nome) between 1 and 28),
  primary key (casa_id, tipo, nome)
);

-- a casa de quem está logado (security definer evita recursão nas políticas de membros)
create or replace function public.minha_casa() returns uuid
language sql stable security definer set search_path = public as $$
  select casa_id from public.membros where user_id = auth.uid() limit 1
$$;
revoke all on function public.minha_casa() from public, anon;
grant execute on function public.minha_casa() to authenticated;

alter table public.casas       enable row level security;
alter table public.membros     enable row level security;
alter table public.lancamentos enable row level security;
alter table public.fixas       enable row level security;
alter table public.categorias  enable row level security;

create policy casas_ver on public.casas for select to authenticated using (id = public.minha_casa());

create policy membros_ver on public.membros for select to authenticated using (casa_id = public.minha_casa());
create policy membros_renomear on public.membros for update to authenticated
  using (casa_id = public.minha_casa()) with check (casa_id = public.minha_casa());
revoke update on public.membros from authenticated;
grant update (nome) on public.membros to authenticated;

create policy lanc_casa on public.lancamentos for all to authenticated
  using (casa_id = public.minha_casa()) with check (casa_id = public.minha_casa());
create policy fixas_casa on public.fixas for all to authenticated
  using (casa_id = public.minha_casa()) with check (casa_id = public.minha_casa());
create policy cats_casa on public.categorias for all to authenticated
  using (casa_id = public.minha_casa()) with check (casa_id = public.minha_casa());

-- criar a casa (quem chega primeiro fica na vaga 'sas')
create or replace function public.criar_casa(p_nome text default 'Você') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_casa uuid; v_codigo text;
begin
  if auth.uid() is null then raise exception 'sem_login'; end if;
  select m.casa_id into v_casa from membros m where m.user_id = auth.uid();
  if v_casa is null then
    insert into casas default values returning id, codigo into v_casa, v_codigo;
    insert into membros (casa_id, user_id, vaga, nome)
      values (v_casa, auth.uid(), 'sas', coalesce(nullif(trim(p_nome), ''), 'Você'));
  end if;
  select codigo into v_codigo from casas where id = v_casa;
  return jsonb_build_object('casa_id', v_casa, 'codigo', v_codigo);
end $$;

-- entrar na casa de alguém com o código de convite (segunda vaga, 'ela')
create or replace function public.entrar_na_casa(p_codigo text, p_nome text default 'Parceira') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_casa uuid;
begin
  if auth.uid() is null then raise exception 'sem_login'; end if;
  if exists (select 1 from membros where user_id = auth.uid()) then raise exception 'ja_tem_casa'; end if;
  select id into v_casa from casas where codigo = upper(trim(p_codigo));
  if v_casa is null then raise exception 'codigo_invalido'; end if;
  if exists (select 1 from membros where casa_id = v_casa and vaga = 'ela') then raise exception 'casa_cheia'; end if;
  insert into membros (casa_id, user_id, vaga, nome)
    values (v_casa, auth.uid(), 'ela', coalesce(nullif(trim(p_nome), ''), 'Parceira'));
  return jsonb_build_object('casa_id', v_casa);
end $$;

revoke all on function public.criar_casa(text) from public, anon;
revoke all on function public.entrar_na_casa(text, text) from public, anon;
grant execute on function public.criar_casa(text) to authenticated;
grant execute on function public.entrar_na_casa(text, text) to authenticated;

-- os dois celulares veem a mesma coisa ao vivo
alter publication supabase_realtime add table public.lancamentos, public.fixas, public.categorias, public.membros;
