-- Vero novo (aplicado em 2026-10-31):
-- a categoria deixa de ser obrigatória, o lançamento guarda de que empréstimo nasceu e quando foi
-- feito, e a conta fixa pode ser desativada. Só acrescenta: nada se apaga.
alter table public.lancamentos drop constraint if exists lancamentos_categoria_check;
alter table public.lancamentos add constraint lancamentos_categoria_check check (char_length(categoria) <= 40);
alter table public.lancamentos add column if not exists origem text not null default '' check (char_length(origem) <= 40);
alter table public.lancamentos add column if not exists em bigint not null default 0;
alter table public.fixas add column if not exists ativa boolean not null default true;
