-- 006 (14/11/2026): o porquê e a ocasião de cada lançamento. Só acrescenta: nada se apaga.
--
-- NATUREZA. 'necessario' ou 'emocao' (pedido dele: "no mercado, o que foi necessário e o que
-- foi pela emoção, um chocolate"). Vazio ou nulo = sem marca; o app deduz pela descrição.
-- OCASIÃO. Texto curto que atravessa categorias ("Festa do fim de semana"): bebida, lanche e
-- gasolina da mesma festa somam juntos no Painel.
-- Um celular com a versão antiga não manda estas colunas: o upsert não as toca.
alter table public.lancamentos add column if not exists natureza text
  check (natureza is null or natureza in ('', 'necessario', 'emocao'));
alter table public.lancamentos add column if not exists ocasiao text
  check (ocasiao is null or char_length(ocasiao) <= 40);
