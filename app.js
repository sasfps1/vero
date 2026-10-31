/* Vero -- controlo financeiro da casa. Local-first: nada sai deste aparelho.
   Decisoes de arquitectura e as cicatrizes que as pagaram:

   1. DINHEIRO EM CENTIMOS INTEIROS. Nunca float. 0.1+0.2 nao da 0.3 em
      binario, e num livro de contas isso vira um centimo que ninguem explica.
   2. DATAS NO DIA LOCAL, nunca toISOString(). Depois da meia-noite em BRT o
      toISOString() devolve o dia seguinte em UTC, e um gasto da noite cai no
      dia errado -- precisamente o dia em que ele olha para o limite.
   3. UMA SO FUNCAO CALCULA (calc). Nenhuma tela soma um total proprio. Numero
      que diverge entre duas telas derruba a confianca no painel inteiro.
   4. O QUE TENHO A RECEBER NUNCA ENTRA NO QUE SOBROU. Quase metade de quem
      emprestou ainda nao pediu de volta (LendingTree 2021). Contar com esse
      dinheiro e gastar o que talvez nao volte.
   5. DEGRADAR, NUNCA PARTIR. Se o armazenamento do navegador falhar (janela
      privada, dados bloqueados), o app funciona em memoria e DIZ que esta a
      funcionar em memoria. Nunca morre em silencio.
   6. DESFAZER VENCE CONFIRMAR. Nenhum dialogo a perguntar "tem certeza?".
*/

'use strict';

// ── armazenamento ────────────────────────────────────────────────────────────

const CHAVE = 'casa.v1';
let soMemoria = false;

const VAZIO = {
  v: 1,
  lancamentos: [],
  contas: [],
  emprestimos: [],
  categorias: [],
  config: { folga: 0.10, redondo: 500, limite: null, copia: null, oculto: false }
};

function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return estrutura(VAZIO);
    return estrutura(JSON.parse(bruto));
  } catch (e) {
    // Dados ilegiveis valem menos que um app que abre: nao apagamos nada,
    // passamos a memoria e avisamos na tela.
    soMemoria = true;
    return estrutura(VAZIO);
  }
}

// Ler o contrato, nunca a memoria: campo que falta nasce com valor, para uma
// versao antiga dos dados nao rebentar numa tela.
function estrutura(d) {
  const s = Object.assign({}, VAZIO, d || {});
  s.lancamentos = Array.isArray(s.lancamentos) ? s.lancamentos : [];
  s.contas      = Array.isArray(s.contas) ? s.contas : [];
  s.emprestimos = Array.isArray(s.emprestimos) ? s.emprestimos : [];
  s.categorias  = Array.isArray(s.categorias) ? s.categorias : [];
  s.config     = Object.assign({}, VAZIO.config, s.config || {});
  return s;
}

let S = carregar();

function guardar() {
  if (window.veroAoGuardar) window.veroAoGuardar();
  if (soMemoria) return;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(S));
  } catch (e) {
    soMemoria = true;
    desenhar();
  }
}

// Pedir ao navegador para nao despejar estes dados quando o aparelho aperta.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persisted().then(function (ok) { if (!ok) navigator.storage.persist(); });
}

// ── dinheiro e datas ─────────────────────────────────────────────────────────

function p2(n) { return String(n).padStart(2, '0'); }
function iso(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
function hoje() { return iso(new Date()); }
function mesDe(data) { return String(data).slice(0, 7); }
function diaDe(data) { return Number(String(data).slice(8, 10)); }

function diasNoMes(mes) {
  const a = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7));
  return new Date(a, m, 0).getDate();   // dia 0 do mes seguinte = ultimo deste
}
function diasRestantes() {
  const h = hoje();
  return Math.max(1, diasNoMes(mesDe(h)) - diaDe(h) + 1);
}
function dataMais(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return iso(d);
}

/** Centimos -> partes, para o numero poder ser grande e os centimos pequenos. */
function partes(c) {
  const neg = c < 0;
  const a = Math.abs(Math.round(c));
  const inteiro = Math.floor(a / 100).toLocaleString('pt-BR');
  return { sinal: neg ? '−' : '', inteiro: inteiro, cent: p2(a % 100) };
}
function dinheiroReal(c) {
  const p = partes(c);
  return p.sinal + 'R$ ' + p.inteiro + ',' + p.cent;
}
/* Esconder os valores vive aqui, num só sítio, para nenhuma tela o esquecer.
   Mecanismo do Vero de 10/09: ele abre o app na rua, entre entregas. */
function dinheiro(c) {
  return S.config.oculto ? 'R$ ••••' : dinheiroReal(c);
}
function numeroGrande(c, real) {
  if (S.config.oculto && !real) return '<span class="moeda">R$</span>••••';
  const p = partes(c);
  return '<span class="moeda">R$</span>' + p.sinal + p.inteiro + '<span class="cent">,' + p.cent + '</span>';
}
function numeroMedio(c) {
  return numeroGrande(c);
}
function porExtensoData(data) {
  const d = diaDe(data), m = Number(mesDe(data).slice(5, 7));
  return p2(d) + '/' + p2(m);
}
function id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}

// ── a UNICA funcao que calcula ───────────────────────────────────────────────

function falta(e) {
  if (e.estado !== 'aberto') return 0;
  const devolvido = S.lancamentos
    .filter(function (l) { return l.emprestimo === e.id; })
    .reduce(function (a, l) { return a + l.centavos; }, 0);
  return Math.max(0, e.centavos - devolvido);
}

function contasPorPagar(mes) {
  return S.contas.filter(function (c) {
    return c.ativa !== false && !(c.pagos && c.pagos[mes]);
  });
}

function abertos(direcao) {
  return S.emprestimos.filter(function (e) {
    return e.direcao === direcao && e.estado === 'aberto' && falta(e) > 0;
  });
}

/** O que EU devo e que pesa neste mes: prometido ate ao fim do mes, ou sem data. */
function euDevoNoMes(mes) {
  const limite = mes + '-' + p2(diasNoMes(mes));
  return abertos('peguei')
    .filter(function (e) { return !e.prometida || e.prometida <= limite; })
    .reduce(function (a, e) { return a + falta(e); }, 0);
}

/** Gasto que come o limite do dia.
    Transferencia NAO come: emprestar nao e gastar (achado dele, 11/09 22h), e
    pagar uma conta fixa ja estava descontada do que sobrou -- contar outra vez
    seria cobra-la duas vezes. */
function gastoDeHoje() {
  const h = hoje();
  return S.lancamentos.filter(function (l) {
    return l.tipo === 'saida' && l.data === h && !l.emprestimo && !l.conta;
  }).reduce(function (a, l) { return a + l.centavos; }, 0);
}

/** Limite do dia.
    Congelado durante o dia CONTRA O GASTO -- se o numero encolhesse a cada
    compra, deixava de ser um limite e passava a ser um cronometro de culpa.
    Mas sobe quando entra dinheiro: dinheiro novo muda legitimamente o que se
    pode gastar hoje.
    ⚠️ A folga de 10% nao tem fonte -- e escolha nossa, para testar no uso. */
function limiteDoDia(livre) {
  const h = hoje();
  const red = S.config.redondo;
  const bruto = livre <= 0 ? 0 : Math.floor(livre * (1 - S.config.folga) / diasRestantes() / red) * red;
  const c = S.config.limite;
  if (c && c.dia === h && livre <= c.base) return c.centavos;
  S.config.limite = { dia: h, centavos: bruto, base: livre };
  guardar();
  return bruto;
}

/** O que entrou e saiu num mês. Serve o mês corrente e os fechados, para os dois
    nunca poderem divergir. */
function resumoEntre(de, ate) {
  let entradas = 0, saidas = 0;
  for (const l of S.lancamentos) {
    if (l.data < de || l.data > ate) continue;
    if (l.tipo === 'entrada') entradas += l.centavos; else saidas += l.centavos;
  }
  return { entradas: entradas, saidas: saidas, resultado: entradas - saidas };
}
function resumoDoMes(mes) {
  return resumoEntre(mes + '-01', mes + '-' + p2(diasNoMes(mes)));
}

function calc() {
  const mes = mesDe(hoje());
  const { entradas, saidas } = resumoDoMes(mes);
  const contasFalta = contasPorPagar(mes).reduce(function (a, c) { return a + c.centavos; }, 0);
  const euDevo = euDevoNoMes(mes);
  const livre = entradas - saidas - contasFalta - euDevo;
  return {
    mes: mes,
    entradas: entradas,
    saidas: saidas,
    contasFalta: contasFalta,
    euDevo: euDevo,
    // O cartão do Início mostra entrou − saiu − falta pagar = sobrou. Sem a dívida
    // aqui a conta não fechava na tela, e o número mudava sem mostrar porquê.
    faltaPagar: contasFalta + euDevo,
    livre: livre,
    aReceber: abertos('emprestei').reduce(function (a, e) { return a + falta(e); }, 0),
    limite: limiteDoDia(livre),
    gastoHoje: gastoDeHoje()
  };
}

/** Quanto saiu em cada dia do mês. Conta as mesmas saídas de calc(), para as
    barras do Início somarem exactamente o "saiu". */
function gastoPorDia(mes) {
  const dias = new Array(diasNoMes(mes)).fill(0);
  for (const l of S.lancamentos) {
    if (l.tipo === 'saida' && mesDe(l.data) === mes) dias[diaDe(l.data) - 1] += l.centavos;
  }
  return dias;
}

// ── desfazer ─────────────────────────────────────────────────────────────────

let ultimoDesfazer = null, relogioDesfazer = null;

function oferecerDesfazer(texto, repor) {
  ultimoDesfazer = repor;
  document.getElementById('desfazer-texto').textContent = texto;
  document.getElementById('desfazer').hidden = false;
  clearTimeout(relogioDesfazer);
  relogioDesfazer = setTimeout(esconderDesfazer, 7000);
}
function esconderDesfazer() {
  document.getElementById('desfazer').hidden = true;
  ultimoDesfazer = null;
}

// ── telas ────────────────────────────────────────────────────────────────────

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function rota() {
  const r = (location.hash || '#/inicio').replace('#/', '');
  return ['inicio', 'gastos', 'contas', 'pessoas'].includes(r) ? r : 'inicio';
}

/* PARA ONDE FOI O DINHEIRO.
   Palavras dele a 2026-10-26: "Eu trabalho e não vejo o dinheiro. E eu preciso
   saber para onde que esse dinheiro está indo." E a correcção que ele fez na
   mesma frase: a pergunta nº1 do app é RETROSPECTIVA -- para onde foi -- e não
   "quanto posso gastar", que é prospectiva. As duas cabem, mas a ordem muda.
   Agrupa por categoria. Categoria nunca é obrigatória: o que ele não escolher é
   reconhecido pela nota, e o que não se reconhece fica com o nome que ele deu.
   Os empréstimos saem numa linha própria em vez de desaparecerem: dinheiro que
   saiu e não foi consumo ainda tem de ser explicado. */
const CAT_SAIDA = ['Moradia', 'Alimentação', 'Mercado', 'Transporte', 'Saúde', 'Educação', 'Filhos', 'Lazer', 'Pessoal', 'Outros'];
const CAT_ENTRADA = ['Salário', 'Serviços', 'Freelance', 'Vendas', 'Reembolso'];
const PISTAS = [
  [/mercado|feira|compras?\b|padaria|a[cç]ougue/, 'Mercado'],
  [/lanche|comida|almo[cç]o|jantar|pizza|caf[eé]|restaurante/, 'Alimentação'],
  [/gasolina|combust|posto|[aá]lcool|uber|[oô]nibus|moto\b|oficina/, 'Transporte'],
  [/farm[aá]cia|rem[eé]dio|m[eé]dico|dentista|consulta/, 'Saúde'],
  [/aluguel|condom[ií]nio|\bluz\b|energia|[aá]gua|internet|wi-?fi|\bg[aá]s\b/, 'Moradia'],
  [/escola|curso|faculdade|livro/, 'Educação'],
  [/fralda|creche|brinquedo/, 'Filhos'],
  [/cinema|show|viagem|netflix|bar\b/, 'Lazer']
];
function categoriaSugerida(nota) {
  const t = String(nota || '').toLowerCase();
  for (const p of PISTAS) if (p[0].test(t)) return p[1];
  return '';
}
/** O lançamento que nasceu de um empréstimo. `origem` só existe desde 31/10; o
    que veio antes reconhece-se pela nota, pelo valor e pela data. */
function emprestimoDeOrigem(l) {
  if (l.emprestimo) return null;
  return S.emprestimos.find(function (e) {
    if (l.origem) return e.id === l.origem;
    return l.nota === (e.direcao === 'emprestei' ? 'Emprestei a ' : 'Peguei com ') + e.pessoa &&
      l.centavos === e.centavos && l.data === e.data;
  }) || null;
}
function categoriaDe(l) {
  if (l.emprestimo || emprestimoDeOrigem(l)) return 'Empréstimos';
  if (l.conta) return 'Contas fixas';
  return l.categoria || categoriaSugerida(l.nota);
}

function paraOndeFoi(mes) {
  return paraOndeEntre(mes + '-01', mes + '-' + p2(diasNoMes(mes)));
}
function paraOndeEntre(de, ate) {
  const porNome = {};
  let total = 0;
  for (const l of S.lancamentos) {
    if (l.tipo !== 'saida' || l.data < de || l.data > ate) continue;
    total += l.centavos;
    const nome = categoriaDe(l) || String(l.nota || '').trim() || 'Sem nome';
    const chave = nome.toLowerCase();
    const g = porNome[chave] || (porNome[chave] = { nome: nome, centavos: 0, vezes: 0 });
    g.centavos += l.centavos;
    g.vezes++;
  }
  const lista = Object.keys(porNome).map(function (k) { return porNome[k]; });
  lista.sort(function (a, b) { return b.centavos - a.centavos; });
  return { total: total, lista: lista };
}

// Ícones de traço, uma cor só. O emoji traz cor própria e o porteiro reprova.
const ICONES = {
  entrou: 'M17 7L7 17M7 9v8h8', saiu: 'M7 17L17 7M9 7h8v8', falta: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  receber: 'M12 3v12M7 10l5 5 5-5M4 20h16', outros: 'M4 8l8-4 8 4v9l-8 4-8-4zM4 8l8 4 8-4M12 12v9',
  mercado: 'M3 4h2l2.4 11h10.2L20 8H6.2M9.5 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM16.5 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  gasolina: 'M5 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16M3 21h13M7.5 8h4M14 12h2a2 2 0 0 1 2 2v3a1.5 1.5 0 0 0 3 0V9l-3-3',
  farmacia: 'M9.5 20.5a5 5 0 0 1-7-7l9-9a5 5 0 0 1 7 7zM7 9l8 8', lanche: 'M4 11a8 6 0 0 1 16 0zM3 14.5h18M5 18h14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z',
  internet: 'M2.5 9a14 14 0 0 1 19 0M6 13a9 9 0 0 1 12 0M9.5 16.5a4 4 0 0 1 5 0M12 20h.01', luz: 'M13 3L5 14h6l-1 7 8-11h-6z',
  agua: 'M12 3s6.5 6.8 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 9.8 12 3 12 3z', casa: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  celular: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2', pessoa: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-7 8-7s8 3 8 7',
  voltar: 'M15 5l-7 7 7 7', avancar: 'M9 5l7 7-7 7', lapis: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4'
};
function icone(n) {
  return '<svg class="traco" viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICONES[n] + '"/></svg>';
}
/** Só se reconhece a palavra, seja categoria ou nota, e o que não se conhece leva
    a caixa. */
function iconeDoGasto(nome) {
  const t = String(nome).toLowerCase();
  const regras = [
    [/mercado|feira|compras?\b|padaria|açougue/, 'mercado'], [/gasolina|combust|posto|álcool|alcool|transporte/, 'gasolina'],
    [/farm[aá]cia|rem[eé]dio|sa[uú]de/, 'farmacia'], [/lanche|comida|almo[cç]o|jantar|pizza|caf[eé]|alimenta/, 'lanche'],
    [/internet|wi-?fi/, 'internet'], [/\bluz\b|energia/, 'luz'], [/[aá]gua/, 'agua'], [/aluguel|condom[ií]nio|moradia|contas fixas/, 'casa'],
    [/celular|telefone/, 'celular'], [/emprest|devolvi|peguei|recebi/, 'pessoa']
  ];
  for (const r of regras) if (r[0].test(t)) return r[1];
  return 'outros';
}

/** Medida de proporção em blocos rectangulares. */
function medidaProporcao(parte, total) {
  // ⚠️ Tinha um piso de `Math.max(1, ...)`: uma fatia de 2% acendia um bloco
  // inteiro e lia-se como 8%. Uma medida que mente em baixo e pior que medida
  // nenhuma. Sem piso, e so aparece a partir de 10% -- abaixo disso a
  // percentagem escrita ja diz tudo e os blocos eram ruido.
  const n = total > 0 ? Math.floor(parte / total * 12) : 0;
  let html = '';
  for (let i = 0; i < 12; i++) html += '<i class="' + (i < n ? 'passado' : 'futuro') + '"></i>';
  return '<div class="medida fina">' + html + '</div>';
}

/* O período da tela Gastos: dia, semana, mês ou ano. Pedido dele a 31/10. `refData` é
   um dia qualquer dentro do período; null quer dizer hoje. */
let periodoTipo = 'mes', refData = null, buscaTexto = '';

function dataDe(s) { const a = s.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); }
function mesSomado(mes, d) {
  return iso(new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + d, 1)).slice(0, 7);
}
function intervalo(tipo, ref) {
  if (tipo === 'dia') return { de: ref, ate: ref, nome: rotuloDoDia(ref) };
  if (tipo === 'semana') {
    // A semana começa na segunda: é assim que a semana de trabalho se lê.
    const d = dataDe(ref), recua = (d.getDay() + 6) % 7;
    const de = iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - recua));
    const ate = iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - recua + 6));
    return { de: de, ate: ate, nome: porExtensoData(de) + ' a ' + porExtensoData(ate) };
  }
  if (tipo === 'ano') return { de: ref.slice(0, 4) + '-01-01', ate: ref.slice(0, 4) + '-12-31', nome: ref.slice(0, 4) };
  const mes = mesDe(ref);
  return { de: mes + '-01', ate: mes + '-' + p2(diasNoMes(mes)), nome: MESES[Number(mes.slice(5, 7)) - 1] + ' de ' + mes.slice(0, 4) };
}
function periodoDaTela() { return intervalo(periodoTipo, refData || hoje()); }
function refAndada(d) {
  const ref = refData || hoje(), x = dataDe(ref);
  if (periodoTipo === 'dia') return iso(new Date(x.getFullYear(), x.getMonth(), x.getDate() + d));
  if (periodoTipo === 'semana') return iso(new Date(x.getFullYear(), x.getMonth(), x.getDate() + d * 7));
  if (periodoTipo === 'ano') return iso(new Date(x.getFullYear() + d, 0, 1));
  return mesSomado(mesDe(ref), d) + '-01';
}
/** O dia mais antigo com lançamento: as setas não levam a períodos vazios. */
function primeiroDia() {
  return S.lancamentos.reduce(function (m, l) { return l.data < m ? l.data : m; }, hoje());
}
function primeiroMes() { return mesDe(primeiroDia()); }
function podeAndar(d) {
  const i = intervalo(periodoTipo, refAndada(d));
  return d < 0 ? i.ate >= primeiroDia() : i.de <= hoje();
}
function mudarPeriodo(d) {
  if (!podeAndar(d)) return;
  refData = refAndada(d);
  desenhar();
}

function sinNorm(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function bateNaBusca(l, t) {
  if (sinNorm(l.nota + ' ' + categoriaDe(l)).includes(t)) return true;
  return /^[\d.,]+$/.test(t) && dinheiroReal(l.centavos).includes(t);
}

function rotuloDoDia(data) {
  if (data === hoje()) return 'Hoje';
  if (data === dataMais(-1)) return 'Ontem';
  const outroAno = data.slice(0, 4) !== hoje().slice(0, 4);
  return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dataDe(data).getDay()] + ' ' + porExtensoData(data) +
    (outroAno ? '/' + data.slice(0, 4) : '');
}

/** A lista de lançamentos do mês, agrupada por dia. Tocar numa linha abre a mesma
    folha de lançar, preenchida: um gesto só para criar e para corrigir. A busca
    soma o que achou, para "quanto gastei em farmácia?" não precisar de conta.
    ⭐ A busca olha TODO o histórico, não o período aberto: "quando troquei o pneu?"
    é feita meses depois, e presa ao mês aberto respondia que não havia nada. */
function listaHtml() {
  const t = sinNorm(buscaTexto.trim()), p = periodoDaTela();
  const itens = S.lancamentos
    .filter(function (l) { return t ? bateNaBusca(l, t) : l.data >= p.de && l.data <= p.ate; })
    .sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : (b.em || 0) - (a.em || 0); });
  let html = '';
  if (t) {
    let saiu = 0, entrou = 0;
    for (const l of itens) { if (l.tipo === 'entrada') entrou += l.centavos; else saiu += l.centavos; }
    html += '<p class="soma-busca">' + itens.length + (itens.length === 1 ? ' lançamento' : ' lançamentos') +
      (saiu ? ' · saiu ' + dinheiro(saiu) : '') + (entrou ? ' · entrou ' + dinheiro(entrou) : '') + '</p>';
  }
  if (!itens.length) {
    return html + '<p class="vazio">' + (t ? 'Nada com "' + esc(buscaTexto.trim()) + '" em todo o histórico.'
      : 'Nenhum lançamento neste período. Toque no + para lançar.') + '</p>';
  }
  let diaAtual = null;
  for (const l of itens) {
    if (l.data !== diaAtual) {
      diaAtual = l.data;
      html += '<h3 class="dia">' + rotuloDoDia(l.data) + '</h3>';
    }
    const cat = categoriaDe(l), ligado = l.emprestimo || emprestimoDeOrigem(l);
    html += linhaHtml({
      marca: ligado ? 'transfer' : l.tipo === 'entrada' ? 'entrou' : 'saiu',
      titulo: esc(String(l.nota || '').trim() || cat || 'Sem nome'),
      // "Mercado / Mercado" não diz nada duas vezes.
      sub: [l.nota && cat && sinNorm(l.nota) !== sinNorm(cat) ? esc(cat) : '',
        window.veroAutor ? esc(window.veroAutor(l)) : ''].filter(Boolean).join(' · '),
      prefixo: l.tipo === 'entrada' ? '+' : '',
      centavos: l.centavos,
      classes: 'compacta',
      toque: { acao: 'editar', ref: l.id, rotulo: 'Corrigir' }
    });
  }
  return html;
}

function telaGastos() {
  const p = periodoDaTela(), corrente = p.de <= hoje() && p.ate >= hoje();
  const g = paraOndeEntre(p.de, p.ate), r = resumoEntre(p.de, p.ate);
  const nomesPeriodo = { dia: 'Dia', semana: 'Semana', mes: 'Mês', ano: 'Ano' };
  const abas = Object.keys(nomesPeriodo).map(function (k) {
    return '<button class="periodo' + (k === periodoTipo ? ' activo' : '') + '" data-acao="periodo" data-ref="' + k + '"' +
      (k === periodoTipo ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + nomesPeriodo[k] + '</button>';
  }).join('');
  let linhas = '';
  for (const it of g.lista) {
    const pct = g.total > 0 ? Math.round(it.centavos / g.total * 100) : 0;
    // Sem marca: nesta lista TUDO saiu, logo seis quadrados cheios iguais não
    // informam nada — eram só mais tinta.
    linhas += linhaHtml({
      marca: null,
      icone: iconeDoGasto(it.nome),
      titulo: esc(it.nome),
      sub: pct + '% · ' + it.vezes + (it.vezes === 1 ? ' vez' : ' vezes'),
      extra: pct >= 10 ? medidaProporcao(it.centavos, g.total) : '',
      centavos: it.centavos,
      toque: { acao: 'filtrar', ref: it.nome, rotulo: 'Ver os lançamentos de' }
    });
  }
  return '<div class="painel gastos"><section class="bloco he">' +
      '<div class="periodos">' + abas + '</div>' +
      '<div class="seletor-mes">' +
        '<button class="seta" data-acao="andar" data-ref="-1" aria-label="Período anterior"' + (podeAndar(-1) ? '' : ' disabled') + '>' + icone('voltar') + '</button>' +
        '<span>' + p.nome + '</span>' +
        '<button class="seta" data-acao="andar" data-ref="1" aria-label="Período seguinte"' + (podeAndar(1) ? '' : ' disabled') + '>' + icone('avancar') + '</button>' +
      '</div>' +
      '<span class="rotulo">Para onde foi</span>' +
      '<div class="numero-grande">' + numeroGrande(g.total) + '</div>' +
      '<p class="frase">' + (!corrente
        ? 'Entrou ' + dinheiro(r.entradas) + ' · fechou com ' + dinheiro(r.resultado) + '.'
        : g.total ? 'Entrou ' + dinheiro(r.entradas) + ' neste período. O que saiu inclui as contas pagas e o que você emprestou.'
        : 'Nada saiu neste período ainda. Cada coisa que você lançar aparece aqui.') +
      '</p>' +
    '</section>' +
    (linhas ? '<section class="bloco grupos">' + linhas + '</section>' : '') +
    '<section class="bloco lancamentos"><h2 class="titulo-cartao">Lançamentos</h2>' +
      '<input type="search" id="busca" class="busca" value="' + esc(buscaTexto) + '" placeholder="Buscar: mercado, farmácia, 50…" autocomplete="off" aria-label="Buscar lançamentos">' +
      '<div id="lista-lanc">' + listaHtml() + '</div>' +
    '</section></div>';
}

let rotaPintada = null;

function desenhar() {
  const n = calc();
  const r = rota();
  document.body.classList.toggle('oculto', !!S.config.oculto);
  document.querySelectorAll('[data-acao="ocultar"]').forEach(function (b) {
    b.setAttribute('aria-pressed', S.config.oculto ? 'true' : 'false');
    b.setAttribute('aria-label', S.config.oculto ? 'Mostrar os valores' : 'Esconder os valores');
  });
  document.getElementById('topo-titulo').textContent = r === 'inicio' ? saudacao() : r[0].toUpperCase() + r.slice(1);
  document.getElementById('topo-mes').textContent = 'Dia ' + diaDe(hoje()) + ' de ' + MESES[Number(n.mes.slice(5, 7)) - 1];
  document.querySelectorAll('nav.barra a').forEach(function (a) {
    a.classList.toggle('activo', a.dataset.rota === r);
  });
  const tela = document.getElementById('tela');
  const rolagem = tela.scrollTop;
  tela.innerHTML = r === 'gastos' ? telaGastos(n)
    : r === 'contas' ? telaContas(n)
    : r === 'pessoas' ? telaPessoas(n)
    : telaInicio(n);
  // Só volta ao topo ao mudar de tela: corrigir um lançamento no meio da lista
  // não pode atirá-lo para o início.
  if (r !== rotaPintada) { window.scrollTo(0, 0); tela.scrollTop = 0; }
  else tela.scrollTop = rolagem;
  rotaPintada = r;
}

function saudacao() {
  const h = new Date().getHours();
  return h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite';
}

function avisoMemoria() {
  if (!soMemoria) return '';
  return '<div class="aviso pesado"><span class="marca saiu"></span>' +
    'Este aparelho não está salvando nada. O que lançar agora desaparece ao fechar. ' +
    'Salve uma cópia antes de sair.</div>';
}

function avisoCopia() {
  const ult = S.config.copia;
  // Com a conta ligada, o servidor já guarda tudo: a cópia passa a ser opcional e não
  // pode dizer que o celular pode perder os dados.
  const ligado = window.veroLigado && window.veroLigado();
  const vencida = !ligado && (!ult || ult < dataMais(-7));
  if (!S.lancamentos.length && !S.contas.length) return '';
  return '<div class="aviso sem-caixa' + (vencida ? ' pesado' : '') + '">' +
    (ult ? 'Última cópia em ' + porExtensoData(ult) + '.' : 'Nenhuma cópia baixada ainda.') +
    (vencida ? ' O celular pode perder isto; a cópia é a sua posse.' : '') +
    '<button class="btn pequeno" data-acao="copia">Baixar cópia</button></div>';
}

// ── Início ───────────────────────────────────────────────────────────────────

/** ⭐ A ÚNICA função que desenha uma linha de lista — as quatro telas passam
    por aqui. Antes cada tela montava a sua, e foi assim que a mesma dívida
    apareceu com marcas diferentes no Início e em Pessoas, e que um conserto na
    coluna do dinheiro teve de ser repetido em quatro sítios (e falhou em dois).
    `o` = { marca, titulo, sub, botoes, centavos, classes }
    `marca: null` tira a coluna da marca. `centavos: null` deixa o valor vazio.
    `toque` = { acao, ref, rotulo } faz da linha inteira um botão. */
function linhaHtml(o) {
  const semMarca = o.marca === null || o.marca === undefined;
  const tag = o.toque ? 'button' : 'div';
  const toque = o.toque ? ' data-acao="' + o.toque.acao + '" data-ref="' + esc(o.toque.ref) + '"' : '';
  return '<' + tag + toque + ' class="linha dupla' + (semMarca ? ' sem-marca' : '') + (o.icone ? ' com-icone' : '') +
      (o.toque ? ' tocavel' : '') + (o.classes ? ' ' + o.classes : '') + '">' +
    (o.icone ? '<span class="ico">' + icone(o.icone) + '</span>' : '') +
    (semMarca ? '' : '<span class="marca ' + o.marca + '"></span>') +
    '<span class="nome"><span class="titulo">' + o.titulo + '</span>' +
      '<span class="sub-linha"><span class="sub">' + (o.sub || '') + '</span>' +
      (o.botoes || '') + '</span>' +
      // `extra` ocupa uma linha SÓ dele, debaixo da data. Serve o que não cabe
      // ao lado dela: três botões juntos, ou a medida de proporção -- que
      // metida na linha da data encolhia de 170px para 22 e desaparecia.
      (o.extra ? '<span class="extra-linha">' + o.extra + '</span>' : '') +
    '</span>' +
    '<span class="valor">' + (o.centavos === null ? '' : (o.prefixo || '') + dinheiro(o.centavos)) + '</span>' +
  '</' + tag + '>';
}

function botao(acao, ref, texto, fraco) {
  return '<button class="btn pequeno' + (fraco ? ' fraco' : '') +
    '" data-acao="' + acao + '" data-ref="' + ref + '">' + texto + '</button>';
}

/* ⭐ O Início é um painel, por escolha dele a 31/10 (opção F): a receita das
   telas de finanças, com a paleta da marca. Até aqui respondia a uma pergunta só,
   e cortar secções foi o que lhe tirou o ar de extracto. Se voltar esse ar, a
   causa é a repetição entre telas: "Vence" mostra só os próximos 7 dias e a
   rosca só os 5 maiores destinos, e o resto continua em Contas e Gastos. */
function telaInicio(n) {
  const dias = diasNoMes(n.mes), d = diaDe(hoje()), faltam = diasRestantes();
  let medida = '';
  for (let i = 1; i <= dias; i++) {
    medida += '<i class="' + (i < d ? 'passado' : i === d ? 'hoje' : 'futuro') + '"></i>';
  }

  const sobra = Math.max(0, n.limite - n.gastoHoje);
  const fraseLivre = 'O mês já está todo comprometido. O próximo dinheiro que entrar abre o limite.';

  return '<div class="painel">' +
    '<section class="bloco he">' +
      '<span class="rotulo">Sobrou este mês</span>' +
      '<div class="numero-grande">' + numeroGrande(n.livre) + '</div>' +
      (n.livre <= 0 ? '<p class="frase">' + fraseLivre + '</p>'
        : n.limite === 0 ? '<p class="frase">Hoje sem folga. Assim que entrar dinheiro, o limite abre.</p>'
        : '<p class="pode-gastar">Pode gastar ' + dinheiro(sobra) + ' hoje</p>' +
          (n.gastoHoje ? '<p class="frase">De ' + dinheiro(n.limite) + ' do dia · já saiu ' + dinheiro(n.gastoHoje) + '</p>' : '')) +
      '<div class="medida">' + medida + '</div>' +
      '<p class="legenda-dias"><span>Dia ' + d + ' de ' + dias + '</span><span>' +
        (faltam === 1 ? 'falta 1 dia' : 'faltam ' + faltam + ' dias') + '</span></p>' +
    '</section>' +
    (window.veroAbrirIA ? '<button class="perguntar" data-acao="perguntar">Pergunte ao Vero: "quando troquei o pneu?"</button>' : '') +
    // "Para onde foi" é a pergunta nº1 dele (26/10): logo a seguir ao número, ainda
    // na primeira tela do celular. No computador a ordem vem do `order` no CSS.
    secaoParaOnde(n) +
    '<div class="quatro">' +
      cartaoNumero('entrou', 'Entrou', '+' + dinheiro(n.entradas), 'forte') +
      cartaoNumero('saiu', 'Saiu', '−' + dinheiro(n.saidas), '') +
      cartaoNumero('falta', 'Falta pagar', dinheiro(n.faltaPagar), '') +
      cartaoNumero('receber', 'A receber', dinheiro(n.aReceber), '') +
    '</div>' +
    secaoPorDia(n) +
    secaoVence() +
    avisos() +
  '</div>';
}

function cartaoNumero(ic, rotulo, valor, classe) {
  return '<div class="cartao ' + classe + '"><span class="ico">' + icone(ic) + '</span>' +
    '<div><span class="cartao-rotulo">' + rotulo + '</span><strong>' + valor + '</strong></div></div>';
}

/** A rosca responde "para onde foi": no centro vai o maior destino, não o total.
    ⚠️ Seis tons de azul não se distinguem (medido a 31/10: diferença 5,5, o
    mínimo é 15). Só os dois maiores têm tom próprio; os outros ficam com o mesmo
    azul, separados pelo vão, e a lista ao lado diz quanto é cada um. */
function secaoParaOnde(n) {
  const g = paraOndeFoi(n.mes);
  const cabeca = '<h2 class="titulo-cartao">Para onde foi</h2>';
  if (!g.total) {
    return '<section class="bloco para-onde">' + cabeca +
      '<p class="vazio">Nada saiu este mês ainda. Lance um gasto e ele aparece aqui, pelo nome que você der.</p></section>';
  }
  // Até 6 destinos aparecem todos: juntar um só numa linha "Outras 1" não poupa nada.
  const cabem = g.lista.length <= 6 ? 6 : 5;
  const fatias = g.lista.slice(0, cabem);
  const resto = g.lista.slice(cabem).reduce(function (a, it) { return a + it.centavos; }, 0);
  if (resto) fatias.push({ nome: 'Outras ' + (g.lista.length - cabem), centavos: resto, resto: true });

  const r = 42, volta = 2 * Math.PI * r, vao = fatias.length > 1 ? 13.5 : 0;
  let andado = 0, arcos = '', linhas = '';
  fatias.forEach(function (it, i) {
    const f = it.centavos / g.total, pct = Math.round(f * 100), tom = ['um', 'dois'][i] || 'resto';
    const traco = Math.max(0.01, f * volta - vao);
    arcos += '<circle class="arco ' + tom + '" cx="50" cy="50" r="' + r + '" stroke-dasharray="' + traco.toFixed(2) + ' ' + volta.toFixed(2) +
      '" stroke-dashoffset="' + (-(andado * volta + vao / 2)).toFixed(2) + '" transform="rotate(-90 50 50)"><title>' + esc(it.nome) + ': ' + dinheiro(it.centavos) + '</title></circle>';
    andado += f;
    linhas += '<div class="destino"><span class="ico">' + icone(it.resto ? 'outros' : iconeDoGasto(it.nome)) + '</span>' +
      '<span class="destino-nome"><i class="ponto ' + tom + '"></i>' + esc(it.nome) + '<small>' + pct + '%</small></span>' +
      '<b>' + dinheiro(it.centavos) + '</b></div>';
  });
  const maior = fatias[0];
  return '<section class="bloco para-onde">' + cabeca + '<p class="frase">' + dinheiro(g.total) + ' este mês</p>' +
    '<div class="rosca-e-lista"><div class="rosca"><svg viewBox="0 0 100 100" role="img" aria-label="Divisão do que saiu este mês. Os valores estão na lista.">' + arcos + '</svg>' +
    '<div class="rosca-centro"><span>' + esc(maior.nome) + '</span><b>' + Math.round(maior.centavos / g.total * 100) + '%</b></div></div>' +
    '<div>' + linhas + '</div></div></section>';
}

function secaoPorDia(n) {
  const dias = gastoPorDia(n.mes), d = diaDe(hoje());
  const maior = Math.max.apply(null, dias);
  if (!maior) return '';
  const iMaior = dias.indexOf(maior);
  let barras = '';
  dias.forEach(function (v, i) {
    const futuro = i + 1 > d;
    const altura = futuro ? 0 : v ? Math.max(3, Math.round(v / maior * 100)) : 2;
    barras += '<i class="' + (i === iMaior ? 'maior' : '') + '" style="height:' + altura + '%"' +
      (futuro ? '' : ' title="Dia ' + (i + 1) + ': ' + dinheiro(v) + '"') + '></i>';
  });
  // O balão não pode sair do cartão quando o maior dia está numa ponta do mês.
  const x = Math.min(82, Math.max(18, (iMaior + 0.5) / dias.length * 100));
  return '<section class="bloco por-dia"><h2 class="titulo-cartao">Gasto por dia</h2>' +
    '<p class="frase">O dia aceso foi o maior do mês</p>' +
    '<div class="barras">' + barras + '<span class="balao" style="left:' + x.toFixed(1) + '%">Dia ' + (iMaior + 1) + ': ' + dinheiro(maior) + '</span></div>' +
    // Nas pontas do mês o "Hoje" ocupa o lugar do dia 1 ou do último dia.
    '<div class="eixo"><span>' + (d > 3 ? 'Dia 1' : '') + '</span><span class="eixo-hoje" style="left:' + Math.min(95, Math.max(5, (d - 0.5) / dias.length * 100)).toFixed(1) + '%">Hoje</span><span>' + (d < dias.length - 2 ? dias.length : '') + '</span></div></section>';
}

/** O que vence nos próximos 7 dias, cada um com o seu botão. O primeiro, o mais
    atrasado ou o mais próximo, é o único aceso. A lista completa vive em Contas. */
function secaoVence() {
  const itens = itensProximos();
  if (!itens.length) return '';
  const h = hoje();
  const cartoes = itens.map(function (it, i) {
    const atrasada = it.data < h;
    return '<div class="vence-item' + (i === 0 ? ' aceso' : '') + (atrasada ? ' atrasada' : '') + '">' +
      '<span class="vence-nome"><span class="marca ' + it.marca + '"></span>' + esc(it.nome) + '</span>' +
      '<strong>' + dinheiro(it.centavos) + '</strong>' +
      '<small>' + (atrasada ? 'venceu ' + porExtensoData(it.data)
        : it.semData ? 'sem data marcada' : it.data === h ? 'vence hoje' : 'vence ' + porExtensoData(it.data)) + '</small>' +
      botao(it.tipo === 'conta' ? 'pagar' : 'devolvi', it.ref, 'Paguei') +
    '</div>';
  }).join('');
  return '<section class="bloco vence"><h2 class="titulo-cartao">Vence a seguir</h2>' +
    '<p class="frase">Nos próximos 7 dias. O resto está em Contas e em Pessoas.</p>' +
    '<div class="fila">' + cartoes + '</div></section>';
}

function avisos() {
  const html = avisoMemoria() + (window.veroAviso ? window.veroAviso() : '') + avisoCopia();
  return html ? '<section class="bloco avisos">' + html + '</section>' : '';
}

/** Próximos 7 dias: o que vence e o que me devem, por data, atrasado no topo.
    Resolve o bug dele de 11/09 -- as contas fixas saiam do limite mas nao
    apareciam, e o numero mudava sem mostrar porque. */
function itensProximos() {
  const h = hoje(), limite = dataMais(7), mes = mesDe(h);
  const itens = [];

  contasPorPagar(mes).forEach(function (c) {
    const venc = mes + '-' + p2(Math.min(c.dia, diasNoMes(mes)));
    if (venc > limite) return;
    itens.push({
      data: venc, nome: c.nome, centavos: c.centavos, tipo: 'conta', ref: c.id,
      marca: venc < h ? 'vencida' : ''
    });
  });

  abertos('peguei').forEach(function (e) {
    if (e.prometida && e.prometida > limite) return;
    itens.push({
      data: e.prometida || h, nome: 'Devolver a ' + e.pessoa,
      centavos: falta(e), tipo: 'devolver', ref: e.id, semData: !e.prometida,
      // ⚠️ um emprestimo e SEMPRE meia-marca, atrasado ou nao. Antes esta linha
      // levava a marca de conta atrasada no Inicio e a de emprestimo em
      // Pessoas: a mesma divida mudava de simbolo de uma tela para a outra.
      marca: 'transfer'
    });
  });

  // atrasado primeiro, e dentro disso pela data
  itens.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
  return itens;
}

// ── Contas ───────────────────────────────────────────────────────────────────

function telaContas(n) {
  const mes = n.mes, h = hoje();
  const ordenadas = S.contas.slice().sort(function (a, b) { return a.dia - b.dia; });
  let linhas = '';
  for (const c of ordenadas) {
    const pago = c.pagos && c.pagos[mes];
    const venc = mes + '-' + p2(Math.min(c.dia, diasNoMes(mes)));
    const atrasada = !pago && venc < h;
    const valor = pago ? pago.centavos : c.centavos;
    linhas += linhaHtml({
      marca: (pago ? 'paga fraca' : atrasada ? 'vencida' : ''),
      titulo: tituloEditavel('editar-conta', c.id, esc(c.nome)),
      sub: pago ? 'pago em ' + porExtensoData(pago.data)
        : 'dia ' + c.dia + (atrasada ? ' · venceu' : ''),
      botoes: pago ? botao('despagar', c.id, 'Não paguei', true) : botao('pagar', c.id, 'Paguei'),
      centavos: valor,
      classes: (atrasada ? 'atrasada ' : '') + (pago ? 'fraca' : '')
    });
  }

  return '<section class="bloco he">' +
      '<span class="rotulo">Falta pagar este mês</span>' +
      '<div class="numero-grande">' + numeroGrande(n.contasFalta) + '</div>' +
      '<p class="frase">' + contasPorPagar(mes).length + ' de ' + S.contas.length + ' contas por pagar.</p>' +
    '</section>' +
    '<section class="bloco"><h2 class="secao"><span class="rotulo">Todas as contas</span>' +
      '<button class="btn pequeno" data-acao="nova-conta">Nova conta</button></h2>' +
      (linhas || '<p class="vazio">Nenhuma conta fixa cadastrada. Comece pelas que se repetem todo mês: aluguel, luz, água, internet.</p>') +
    '</section>';
}

// ── Pessoas ──────────────────────────────────────────────────────────────────

function telaPessoas(n) {
  const porPessoa = {};
  for (const e of S.emprestimos) {
    (porPessoa[e.pessoa] = porPessoa[e.pessoa] || []).push(e);
  }
  const nomes = Object.keys(porPessoa).sort();

  let corpo = '';
  for (const nome of nomes) {
    let linhas = '';
    for (const e of porPessoa[nome]) {
      const f = falta(e);
      const quitado = e.estado !== 'aberto' || f === 0;
      const atrasado = !quitado && e.prometida && e.prometida < hoje();
      const rotulo = e.direcao === 'emprestei' ? 'Emprestei' : 'Peguei';
      const sub = quitado
        ? (e.estado === 'perdoado' ? 'deixou pra lá' : 'quitado')
        // "venceu", a mesma palavra das Contas: duas palavras para o mesmo
        // estado obrigam-no a aprender duas vezes.
        : (e.prometida ? (atrasado ? 'venceu ' + porExtensoData(e.prometida) : 'para ' + porExtensoData(e.prometida)) : 'sem data marcada');
      // ⚠️ Os tres botoes de um emprestimo meu nao cabem ao lado da data: o
      // "Recebi" ficava sozinho e os outros dois caiam para uma terceira linha,
      // partidos e desiguais -- e e esta a linha que ele mais usa para cobrar.
      // Juntos numa linha propria cabem os tres (66+73+95 = 234 de ~262).
      const meu = e.direcao === 'emprestei';
      const umBotao = quitado ? '' : botao('devolvi', e.id, meu ? 'Recebi' : 'Paguei');
      const tresJuntos = (quitado || !meu) ? '' :
        umBotao + botao('lembrar', e.id, 'Lembrar') + botao('perdoar', e.id, 'Deixa pra lá', true);
      const editar = e.estado === 'perdoado' ? botao('reabrir', e.id, 'Reabrir', true) : '';
      linhas += linhaHtml({
        marca: 'transfer' + (quitado ? ' fraca' : ''),
        titulo: tituloEditavel('editar-emprestimo', e.id, rotulo + ' ' + dinheiro(e.centavos)),
        sub: sub,
        botoes: meu ? '' : umBotao,
        extra: tresJuntos + editar,
        centavos: quitado ? null : f,
        classes: (atrasado ? 'atrasada ' : '') + (quitado ? 'fraca' : '')
      });
    }
    corpo += '<section class="bloco"><h2 class="secao"><span class="nome-pessoa">' + esc(nome) + '</span></h2>' + linhas + '</section>';
  }

  return '<section class="bloco he">' +
      '<span class="rotulo">Têm a devolver a você</span>' +
      '<div class="numero-grande">' + numeroGrande(n.aReceber) + '</div>' +
      '<p class="frase">Este dinheiro não entra no que sobrou — enquanto não voltar, não é seu para gastar.</p>' +
    '</section>' +
    '<section class="bloco"><h2 class="secao"><span class="rotulo">Você deve</span>' +
      '<span class="numero-medio" style="margin:0">' + numeroMedio(n.euDevo) + '</span></h2>' +
      '<div style="display:flex;gap:10px;margin-top:12px">' +
        '<button class="btn" style="flex:1" data-acao="novo-emprestimo" data-ref="emprestei">Emprestei a alguém</button>' +
        '<button class="btn" style="flex:1" data-acao="novo-emprestimo" data-ref="peguei">Peguei com alguém</button>' +
      '</div></section>' +
    (corpo || '<section class="bloco"><p class="vazio">Nenhum empréstimo anotado.</p></section>');
}

// ── folha de lançamento ──────────────────────────────────────────────────────

let digitos = '', emEdicao = null, categoriaEscolhida = false;

function opcoesCategoria() {
  function grupo(rotulo, lista) {
    if (!lista.length) return '';
    return '<optgroup label="' + rotulo + '">' + lista.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join('') + '</optgroup>';
  }
  return '<option value="">Sem categoria</option>' + grupo('Saiu', CAT_SAIDA) + grupo('Entrou', CAT_ENTRADA) +
    grupo('Suas categorias', S.categorias) + '<option value="__nova">Criar categoria…</option>';
}

/** Uma folha só para lançar e para corrigir. A categoria nunca é obrigatória:
    registar um gasto não pode passar de uma tela e poucos segundos. */
function abrirFolha(l) {
  emEdicao = l ? l.id : null;
  digitos = l ? String(l.centavos) : '';
  const ligado = l && (l.emprestimo || l.conta || emprestimoDeOrigem(l));
  document.getElementById('lancar-titulo').textContent = l ? 'Corrigir lançamento' : 'Lançar';
  document.getElementById('lancar-nota').value = l ? (l.nota || '') : '';
  document.getElementById('lancar-categoria').innerHTML = opcoesCategoria();
  document.getElementById('lancar-categoria').value = l ? (l.categoria || categoriaSugerida(l.nota)) : '';
  document.getElementById('lancar-nova').value = '';
  document.getElementById('campo-nova').hidden = true;
  document.getElementById('campo-categoria').hidden = !!ligado;
  categoriaEscolhida = !!(l && l.categoria);
  const data = document.getElementById('lancar-data');
  document.getElementById('campo-data').hidden = !l;
  document.getElementById('lancar-apagar').hidden = !l;
  if (l) {
    data.value = l.data;
    data.max = hoje();
    // A conta paga pertence ao mês em que foi paga: mudá-la de mês desfazia o pagamento.
    data.min = l.conta ? mesDe(l.data) + '-01' : '';
    if (l.conta) data.max = [hoje(), mesDe(l.data) + '-' + p2(diasNoMes(mesDe(l.data)))].sort()[0];
  }
  document.querySelectorAll('[data-lancar]').forEach(function (b) {
    b.hidden = !!(ligado && b.dataset.lancar !== l.tipo);
  });
  pintarValor();
  document.getElementById('folha-lancar').hidden = false;
}
function abrirLancar() { abrirFolha(null); }

function pintarValor() {
  const c = Number(digitos || '0');
  document.getElementById('lancar-valor').innerHTML = numeroGrande(c, true);
  document.querySelectorAll('[data-lancar]').forEach(function (b) { b.disabled = c === 0; });
}
function fecharFolhas() {
  document.getElementById('folha-lancar').hidden = true;
  document.getElementById('folha-form').hidden = true;
  emEdicao = null;
}

/** A categoria que está na folha. Criar uma nova guarda-a para as próximas vezes. */
function categoriaDaFolha() {
  const v = document.getElementById('lancar-categoria').value;
  if (v !== '__nova') return v;
  const nova = document.getElementById('lancar-nova').value.trim();
  if (nova && !CAT_SAIDA.concat(CAT_ENTRADA, S.categorias).includes(nova)) S.categorias.push(nova);
  return nova;
}

// ── corrigir e apagar ────────────────────────────────────────────────────────

/** Um empréstimo fecha quando o devolvido cobre o valor, e reabre se uma correcção
    o deixar a descoberto. "Deixa pra lá" foi decisão dele e não muda sozinho. */
function reajustarEmprestimo(e) {
  if (!e || e.estado === 'perdoado') return;
  const devolvido = S.lancamentos
    .filter(function (l) { return l.emprestimo === e.id; })
    .reduce(function (a, l) { return a + l.centavos; }, 0);
  e.estado = devolvido >= e.centavos ? 'quitado' : 'aberto';
}

/** O lançamento nunca muda sozinho: o que está ligado a ele muda junto, senão a
    conta aparecia paga por um valor e o livro dizia outro. */
function aplicarEdicao(ref, mudancas) {
  const l = S.lancamentos.find(function (x) { return x.id === ref; });
  if (!l) return;
  const origem = emprestimoDeOrigem(l);
  Object.assign(l, mudancas);
  if (origem) {
    l.origem = origem.id;
    origem.centavos = l.centavos;
    origem.data = l.data;
    reajustarEmprestimo(origem);
  }
  if (l.emprestimo) reajustarEmprestimo(S.emprestimos.find(function (e) { return e.id === l.emprestimo; }));
  if (l.conta) {
    const c = S.contas.find(function (x) { return x.id === l.conta; });
    if (c && c.pagos) {
      Object.keys(c.pagos).forEach(function (m) {
        if (c.pagos[m].lanc === l.id) { c.pagos[m].centavos = l.centavos; c.pagos[m].data = l.data; }
      });
    }
  }
  guardar();
}

/** Apagar o lançamento que abriu um empréstimo apaga o empréstimo e as devoluções
    dele: sem o dinheiro que saiu, não há dívida nenhuma. */
function removerLancamento(ref) {
  const l = S.lancamentos.find(function (x) { return x.id === ref; });
  if (!l) return;
  const origem = emprestimoDeOrigem(l);
  S.lancamentos = S.lancamentos.filter(function (x) {
    return x.id !== ref && !(origem && x.emprestimo === origem.id);
  });
  if (origem) S.emprestimos = S.emprestimos.filter(function (e) { return e.id !== origem.id; });
  if (l.emprestimo) reajustarEmprestimo(S.emprestimos.find(function (e) { return e.id === l.emprestimo; }));
  if (l.conta) {
    const c = S.contas.find(function (x) { return x.id === l.conta; });
    if (c && c.pagos) {
      Object.keys(c.pagos).forEach(function (m) { if (c.pagos[m].lanc === l.id) delete c.pagos[m]; });
    }
  }
  guardar();
}

function reporDe(antes) {
  return function () { S = estrutura(JSON.parse(antes)); guardar(); desenhar(); };
}

function corrigir(tipo) {
  const centavos = Number(digitos || '0');
  if (!centavos) return;
  const l = S.lancamentos.find(function (x) { return x.id === emEdicao; });
  // A outra pessoa pode tê-lo apagado enquanto esta folha estava aberta.
  if (!l) { fecharFolhas(); desenhar(); return; }
  const antes = JSON.stringify(S);
  const ligado = l.emprestimo || l.conta || emprestimoDeOrigem(l);
  const mudancas = {
    tipo: tipo, centavos: centavos,
    data: document.getElementById('lancar-data').value || l.data,
    nota: document.getElementById('lancar-nota').value.trim()
  };
  if (!ligado) mudancas.categoria = categoriaDaFolha();
  aplicarEdicao(l.id, mudancas);
  fecharFolhas();
  desenhar();
  oferecerDesfazer('Lançamento corrigido', reporDe(antes));
}

function apagarLancamento() {
  const antes = JSON.stringify(S);
  removerLancamento(emEdicao);
  fecharFolhas();
  desenhar();
  oferecerDesfazer('Lançamento apagado', reporDe(antes));
}

function lancar(tipo) {
  if (emEdicao) return corrigir(tipo);
  const centavos = Number(digitos || '0');
  if (!centavos) return;
  const l = {
    id: id(), tipo: tipo, centavos: centavos, data: hoje(),
    nota: document.getElementById('lancar-nota').value.trim(),
    categoria: categoriaDaFolha(),
    conta: null, emprestimo: null, em: Date.now()
  };
  S.lancamentos.push(l);
  guardar();
  fecharFolhas();
  // O lançamento novo é de hoje: a tela volta ao período corrente para ele aparecer.
  refData = null;
  buscaTexto = '';
  desenhar();
  oferecerDesfazer((tipo === 'saida' ? 'Saiu ' : 'Entrou ') + dinheiro(centavos), function () {
    S.lancamentos = S.lancamentos.filter(function (x) { return x.id !== l.id; });
    guardar(); desenhar();
  });
}

// ── folha de formulário ──────────────────────────────────────────────────────

function abrirForm(titulo, html, aoGuardar, rotulo) {
  document.getElementById('form-titulo').textContent = titulo;
  document.getElementById('form-corpo').innerHTML = html +
    '<div style="display:flex;gap:10px;margin:22px 0 40px">' +
    '<button class="btn primario" style="flex:1" id="form-ok">' + (rotulo || 'Salvar') + '</button></div>';
  document.getElementById('folha-form').hidden = false;
  document.getElementById('form-ok').addEventListener('click', function () { aoGuardar(); });
}

function campoTexto(nome, rotulo, extra) {
  return '<label class="campo"><span class="rotulo">' + rotulo + '</span>' +
    '<input type="text" id="' + nome + '" autocomplete="off" ' + (extra || '') + '></label>';
}
function campoValor(nome, rotulo) {
  return '<label class="campo"><span class="rotulo">' + rotulo + '</span>' +
    '<input type="number" id="' + nome + '" inputmode="decimal" step="0.01" min="0" placeholder="0,00"></label>';
}
function campoData(nome, rotulo, valor) {
  return '<label class="campo"><span class="rotulo">' + rotulo + '</span>' +
    '<input type="date" id="' + nome + '" value="' + (valor || '') + '"></label>';
}
function lerValor(nome) {
  const v = document.getElementById(nome).value.replace(',', '.');
  return Math.round(Number(v || 0) * 100);
}

// ── corrigir contas fixas e empréstimos ─────────────────────────────────────

/** ⚠️ Um botão "Editar" próprio partia a linha em três e voltava o ar de formulário.
    O nome com um lápis é o botão: a linha continua com a altura que tinha. */
function tituloEditavel(acao, ref, html) {
  return '<button class="titulo-editavel" data-acao="' + acao + '" data-ref="' + ref + '" aria-label="Editar">' +
    '<span>' + html + '</span>' + icone('lapis') + '</button>';
}

function botaoApagar(acao, ref, texto) {
  return '<button class="btn fraco apagar" data-acao="' + acao + '" data-ref="' + ref + '">' + texto + '</button>';
}

/** Os pagamentos já feitos continuam nos lançamentos: o dinheiro saiu mesmo. */
function removerConta(ref) {
  S.contas = S.contas.filter(function (c) { return c.id !== ref; });
  guardar();
}

function editarConta(ref) {
  const c = S.contas.find(function (x) { return x.id === ref; });
  if (!c) return;
  abrirForm('Editar conta fixa',
    campoTexto('c-nome', 'Qual conta', 'maxlength="40"') +
    campoValor('c-valor', 'Quanto costuma ser') +
    '<label class="campo"><span class="rotulo">Vence todo dia</span><input type="number" id="c-dia" min="1" max="31"></label>' +
    botaoApagar('apagar-conta', c.id, 'Apagar esta conta'),
    function () {
      const nome = document.getElementById('c-nome').value.trim();
      const centavos = lerValor('c-valor');
      const dia = Math.min(31, Math.max(1, Number(document.getElementById('c-dia').value || c.dia)));
      if (!nome || !centavos) return;
      const antes = JSON.stringify(S);
      c.nome = nome; c.centavos = centavos; c.dia = dia;
      guardar(); fecharFolhas(); desenhar();
      oferecerDesfazer('Conta corrigida', reporDe(antes));
    });
  document.getElementById('c-nome').value = c.nome;
  document.getElementById('c-valor').value = (c.centavos / 100).toFixed(2);
  document.getElementById('c-dia').value = c.dia;
}

/** Quem abriu o empréstimo muda junto, para o livro e a dívida nunca dizerem coisas
    diferentes. */
function aplicarEmprestimo(ref, m) {
  const e = S.emprestimos.find(function (x) { return x.id === ref; });
  if (!e) return;
  const origem = S.lancamentos.find(function (l) { return emprestimoDeOrigem(l) === e; });
  Object.assign(e, m);
  if (origem) {
    origem.origem = e.id;
    origem.centavos = e.centavos;
    origem.nota = (e.direcao === 'emprestei' ? 'Emprestei a ' : 'Peguei com ') + e.pessoa;
  }
  reajustarEmprestimo(e);
  guardar();
}

function removerEmprestimo(ref) {
  const e = S.emprestimos.find(function (x) { return x.id === ref; });
  if (!e) return;
  S.lancamentos = S.lancamentos.filter(function (l) { return l.emprestimo !== e.id && emprestimoDeOrigem(l) !== e; });
  S.emprestimos = S.emprestimos.filter(function (x) { return x !== e; });
  guardar();
}

function editarEmprestimo(ref) {
  const e = S.emprestimos.find(function (x) { return x.id === ref; });
  if (!e) return;
  abrirForm('Editar empréstimo',
    campoTexto('e-pessoa', 'Quem', 'maxlength="40"') +
    campoValor('e-valor', 'Quanto') +
    campoData('e-prometida', 'Data prometida', e.prometida || '') +
    botaoApagar('apagar-emprestimo', e.id, 'Apagar este empréstimo'),
    function () {
      const pessoa = document.getElementById('e-pessoa').value.trim();
      const centavos = lerValor('e-valor');
      if (!pessoa || !centavos) return;
      const antes = JSON.stringify(S);
      aplicarEmprestimo(ref, { pessoa: pessoa, centavos: centavos, prometida: document.getElementById('e-prometida').value || null });
      fecharFolhas(); desenhar();
      oferecerDesfazer('Empréstimo corrigido', reporDe(antes));
    });
  document.getElementById('e-pessoa').value = e.pessoa;
  document.getElementById('e-valor').value = (e.centavos / 100).toFixed(2);
}

function comDesfazer(texto, acao) {
  const antes = JSON.stringify(S);
  acao();
  fecharFolhas(); desenhar();
  oferecerDesfazer(texto, reporDe(antes));
}

function novaConta() {
  abrirForm('Nova conta fixa',
    campoTexto('c-nome', 'Qual conta', 'placeholder="aluguel, luz, internet" maxlength="40"') +
    campoValor('c-valor', 'Quanto costuma ser') +
    '<label class="campo"><span class="rotulo">Vence todo dia</span>' +
    '<input type="number" id="c-dia" min="1" max="31" value="5"></label>',
    function () {
      const nome = document.getElementById('c-nome').value.trim();
      const centavos = lerValor('c-valor');
      const dia = Math.min(31, Math.max(1, Number(document.getElementById('c-dia').value || 1)));
      if (!nome || !centavos) return;
      S.contas.push({ id: id(), nome: nome, centavos: centavos, dia: dia, ativa: true, pagos: {} });
      guardar(); fecharFolhas(); desenhar();
    });
}

function novoEmprestimo(direcao) {
  const eu = direcao === 'emprestei';
  abrirForm(eu ? 'Emprestei a alguém' : 'Peguei com alguém',
    campoTexto('e-pessoa', 'Quem', 'placeholder="nome da pessoa" maxlength="40"') +
    campoValor('e-valor', 'Quanto') +
    campoData('e-prometida', eu ? 'Prometeu devolver em' : 'Você prometeu devolver em', ''),
    function () {
      const pessoa = document.getElementById('e-pessoa').value.trim();
      const centavos = lerValor('e-valor');
      const prometida = document.getElementById('e-prometida').value || null;
      if (!pessoa || !centavos) return;
      const e = { id: id(), direcao: direcao, pessoa: pessoa, centavos: centavos, data: hoje(), prometida: prometida, estado: 'aberto' };
      S.emprestimos.push(e);
      // O dinheiro mexe-se na hora: emprestar e uma saida, pegar e uma entrada.
      S.lancamentos.push({
        id: id(), tipo: eu ? 'saida' : 'entrada', centavos: centavos, data: hoje(),
        nota: (eu ? 'Emprestei a ' : 'Peguei com ') + pessoa, conta: null, emprestimo: null, origem: e.id, em: Date.now()
      });
      guardar(); fecharFolhas(); desenhar();
    });
}

/** Devolucao: lancamento LIGADO ao emprestimo, nunca um campo "pago" -- ele
    pediu pagamento parcial com varias datas, e um campo so nao guarda isso. */
function devolucao(ref) {
  const e = S.emprestimos.find(function (x) { return x.id === ref; });
  if (!e) return;
  const eu = e.direcao === 'emprestei';
  abrirForm(eu ? e.pessoa + ' pagou' : 'Devolvi a ' + e.pessoa,
    '<p class="frase" style="margin:14px 0">Falta ' + dinheiro(falta(e)) + '. Pode lançar só uma parte.</p>' +
    campoValor('d-valor', 'Quanto agora'),
    function () {
      const centavos = lerValor('d-valor');
      if (!centavos) return;
      S.lancamentos.push({
        id: id(), tipo: eu ? 'entrada' : 'saida', centavos: centavos, data: hoje(),
        nota: (eu ? 'Recebi de ' : 'Devolvi a ') + e.pessoa, conta: null, emprestimo: e.id, em: Date.now()
      });
      if (falta(e) === 0) e.estado = 'quitado';
      guardar(); fecharFolhas(); desenhar();
    });
}

function pagarConta(ref) {
  const c = S.contas.find(function (x) { return x.id === ref; });
  if (!c) return;
  abrirForm('Paguei ' + c.nome,
    campoValor('p-valor', 'Quanto saiu') +
    '<p class="frase">Deixe como está se foi ' + dinheiro(c.centavos) + '.</p>',
    function () {
      const centavos = lerValor('p-valor') || c.centavos;
      const mes = mesDe(hoje());
      const l = {
        id: id(), tipo: 'saida', centavos: centavos, data: hoje(),
        nota: c.nome, conta: c.id, emprestimo: null, em: Date.now()
      };
      S.lancamentos.push(l);
      c.pagos = c.pagos || {};
      c.pagos[mes] = { data: hoje(), centavos: centavos, lanc: l.id };
      guardar(); fecharFolhas(); desenhar();
      oferecerDesfazer(c.nome + ' pago', function () {
        delete c.pagos[mes];
        S.lancamentos = S.lancamentos.filter(function (x) { return x.id !== l.id; });
        guardar(); desenhar();
      });
    });
  // o campo abre com o valor habitual, para "Paguei" ser mesmo um toque
  document.getElementById('p-valor').value = (c.centavos / 100).toFixed(2);
}

function despagar(ref) {
  const c = S.contas.find(function (x) { return x.id === ref; });
  const mes = mesDe(hoje());
  if (!c || !c.pagos || !c.pagos[mes]) return;
  const lanc = c.pagos[mes].lanc, guardado = c.pagos[mes];
  delete c.pagos[mes];
  S.lancamentos = S.lancamentos.filter(function (x) { return x.id !== lanc; });
  guardar(); desenhar();
  oferecerDesfazer(c.nome + ' voltou a por pagar', function () {
    c.pagos[mes] = guardado;
    guardar(); desenhar();
  });
}

/** Deixa pra la: fecha sem mexer no saldo. Senao fica "atrasado para sempre" e
    a pessoa deixa de abrir o app (efeito avestruz). */
function perdoar(ref) {
  const e = S.emprestimos.find(function (x) { return x.id === ref; });
  if (!e) return;
  e.estado = 'perdoado';
  guardar(); desenhar();
  oferecerDesfazer('Deixou pra lá ' + dinheiro(e.centavos), function () {
    e.estado = 'aberto'; guardar(); desenhar();
  });
}

/** O empurrao e do dono, nunca do app. Texto neutro, sem numero de telefone --
    ele escolhe o contacto no WhatsApp. */
function lembrar(ref) {
  const e = S.emprestimos.find(function (x) { return x.id === ref; });
  if (!e) return;
  const texto = 'Oi! Lembra daqueles ' + dinheiroReal(falta(e)) + '? Quando puder, me avisa. Sem pressa.';
  window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank', 'noopener');
}

// ── cópia: a posse é dele ────────────────────────────────────────────────────

function baixar(nome, texto, tipo) {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}

function guardarCopia() {
  const h = hoje();
  baixar('vero-' + h + '.json', JSON.stringify(S, null, 1), 'application/json');
  const linhas = ['data;tipo;valor;categoria;no que foi'];
  for (const l of S.lancamentos.slice().sort(function (a, b) { return a.data < b.data ? -1 : 1; })) {
    linhas.push([l.data, l.tipo, (l.centavos / 100).toFixed(2).replace('.', ','),
      String(categoriaDe(l) || '').replace(/[;\n]/g, ' '),
      String(l.nota || '').replace(/[;\n]/g, ' ')].join(';'));
  }
  baixar('vero-' + h + '.csv', '﻿' + linhas.join('\r\n'), 'text/csv');
  S.config.copia = h;
  guardar(); desenhar();
}

// ── ligações ─────────────────────────────────────────────────────────────────

// Botao que passa o clique: sempre uma funcao que CHAMA, nunca a referencia
// directa -- senao o evento vai como primeiro argumento e vira o valor.
document.getElementById('desfazer-btn').addEventListener('click', function () {
  if (ultimoDesfazer) ultimoDesfazer();
  esconderDesfazer();
});

document.getElementById('teclado').addEventListener('click', function (ev) {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.hasAttribute('data-apagar')) digitos = digitos.slice(0, -1);
  // 8 dígitos: o banco recusa de R$ 1.000.000,00 para cima.
  else if (b.dataset.d && (digitos + b.dataset.d).length <= 8) digitos = (digitos + b.dataset.d).replace(/^0+(?=\d)/, '');
  pintarValor();
});

document.addEventListener('click', function (ev) {
  const b = ev.target.closest('[data-lancar],[data-acao],[data-fechar-folha]');
  if (!b) return;
  if (b.hasAttribute('data-fechar-folha')) return fecharFolhas();
  if (b.dataset.lancar) return lancar(b.dataset.lancar);
  const ref = b.dataset.ref;
  switch (b.dataset.acao) {
    case 'lancar':          return abrirLancar();
    case 'nova-conta':      return novaConta();
    case 'novo-emprestimo': return novoEmprestimo(ref);
    case 'pagar':           return pagarConta(ref);
    case 'despagar':        return despagar(ref);
    case 'devolvi':         return devolucao(ref);
    case 'perdoar':         return perdoar(ref);
    case 'lembrar':         return lembrar(ref);
    case 'copia':           return guardarCopia();
    case 'conta':           return window.veroAbrirConta();
    case 'editar':          return abrirFolha(S.lancamentos.find(function (l) { return l.id === ref; }));
    case 'apagar-lanc':     return apagarLancamento();
    case 'andar':           return mudarPeriodo(Number(ref));
    case 'periodo':
      periodoTipo = ref;
      refData = null;
      return desenhar();
    case 'editar-conta':    return editarConta(ref);
    case 'apagar-conta':    return comDesfazer('Conta apagada', function () { removerConta(ref); });
    case 'editar-emprestimo': return editarEmprestimo(ref);
    case 'apagar-emprestimo': return comDesfazer('Empréstimo apagado', function () { removerEmprestimo(ref); });
    case 'reabrir':
      return comDesfazer('Empréstimo reaberto', function () {
        const e = S.emprestimos.find(function (x) { return x.id === ref; });
        if (e) { e.estado = 'aberto'; reajustarEmprestimo(e); guardar(); }
      });
    case 'perguntar':       return window.veroAbrirIA();
    case 'filtrar':
      buscaTexto = ref;
      desenhar();
      return document.getElementById('busca').scrollIntoView({ block: 'start' });
    case 'ocultar':
      S.config.oculto = !S.config.oculto;
      guardar();
      return desenhar();
  }
});

// A busca não redesenha a tela: redesenhar tirava o foco do campo a cada letra.
document.addEventListener('input', function (ev) {
  if (ev.target.id === 'busca') {
    buscaTexto = ev.target.value;
    document.getElementById('lista-lanc').innerHTML = listaHtml();
  } else if (ev.target.id === 'lancar-nota' && !categoriaEscolhida) {
    document.getElementById('lancar-categoria').value = categoriaSugerida(ev.target.value);
  }
});
document.addEventListener('change', function (ev) {
  if (ev.target.id !== 'lancar-categoria') return;
  categoriaEscolhida = true;
  document.getElementById('campo-nova').hidden = ev.target.value !== '__nova';
});

window.addEventListener('hashchange', function () { desenhar(); });

// O dia pode mudar com o app aberto (ele opera das 00h as 03h): ao voltar ao
// app, recalcular, senao o limite de ontem fica na tela.
let diaPintado = hoje();
document.addEventListener('visibilitychange', function () {
  if (!document.hidden && hoje() !== diaPintado) { diaPintado = hoje(); desenhar(); }
});

if (!location.hash) location.hash = '#/inicio';
desenhar();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(function () { /* abre igual sem isto */ });
}
