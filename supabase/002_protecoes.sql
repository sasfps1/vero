-- Vero — Fase 1 de proteções (aplicada a 2026-09-11 no projeto `vero`).
-- A função da casa vive no esquema `privado` (fora da API), não em `public`.

-- 1) Cota da IA: no máximo 40 perguntas por casa por dia (dia de Brasília).
create table public.uso_ia (
  casa_id    uuid not null references public.casas(id) on delete cascade,
  dia        date not null,
  perguntas  integer not null default 0,
  primary key (casa_id, dia)
);
alter table public.uso_ia enable row level security;
create policy uso_ia_ver on public.uso_ia for select to authenticated using (casa_id = privado.minha_casa());

-- conta a pergunta ANTES de chamar a IA; devolve quantas ainda restam hoje (negativo = recusar)
create or replace function public.gastar_pergunta_ia() returns integer
language plpgsql security definer set search_path = public as $$
declare v_casa uuid := privado.minha_casa(); v_n integer;
begin
  if v_casa is null then raise exception 'sem_casa'; end if;
  insert into uso_ia (casa_id, dia, perguntas)
    values (v_casa, (now() at time zone 'America/Sao_Paulo')::date, 1)
  on conflict (casa_id, dia) do update set perguntas = uso_ia.perguntas + 1
  returning perguntas into v_n;
  return 40 - v_n;
end $$;
revoke all on function public.gastar_pergunta_ia() from public, anon;
grant execute on function public.gastar_pergunta_ia() to authenticated;

-- 2) Batimento: uma leitura leve por dia para o projeto grátis não pausar por falta de uso.
create or replace function public.batimento() returns text
language sql stable set search_path = public as $$
  select 'vivo ' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI')
$$;
revoke all on function public.batimento() from public;
grant execute on function public.batimento() to anon, authenticated;

-- 3) Porta fechada: este Vero é de UMA casa. Depois de criada, só se entra com o código de convite.
--    Para reabrir (ex.: criar a casa de novo), apagar esta linha `if exists (select 1 from casas)`.
create or replace function public.criar_casa(p_nome text default 'Você') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_casa uuid; v_codigo text;
begin
  if auth.uid() is null then raise exception 'sem_login'; end if;
  select m.casa_id into v_casa from membros m where m.user_id = auth.uid();
  if v_casa is null then
    if exists (select 1 from casas) then raise exception 'cadastro_fechado'; end if;
    insert into casas default values returning id, codigo into v_casa, v_codigo;
    insert into membros (casa_id, user_id, vaga, nome)
      values (v_casa, auth.uid(), 'sas', coalesce(nullif(trim(p_nome), ''), 'Você'));
  end if;
  select codigo into v_codigo from casas where id = v_casa;
  return jsonb_build_object('casa_id', v_casa, 'codigo', v_codigo);
end $$;
