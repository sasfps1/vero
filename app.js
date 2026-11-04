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
// Sobe junto com CACHE em sw.js; a prova confere os dois.
const VERSAO = 13;
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
    if (!bruto) return estrutura();
    return estrutura(JSON.parse(bruto));
  } catch (e) {
    // Dados ilegiveis valem menos que um app que abre: nao apagamos nada,
    // passamos a memoria e avisamos na tela.
    soMemoria = true;
    return estrutura();
  }
}

// Ler o contrato, nunca a memoria: campo que falta nasce com valor, para uma
// versao antiga dos dados nao rebentar numa tela.
function estrutura(d) {
  // ⚠️ As listas nascem aqui, nunca as do VAZIO: partilhadas, o que se lançava na primeira
  // abertura ficava no molde e voltava a aparecer depois de sair da conta.
  const s = Object.assign({}, VAZIO, d || {});
  s.lancamentos = Array.isArray(d && d.lancamentos) ? d.lancamentos : [];
  s.contas      = Array.isArray(d && d.contas) ? d.contas : [];
  s.emprestimos = Array.isArray(d && d.emprestimos) ? d.emprestimos : [];
  s.categorias  = Array.isArray(d && d.categorias) ? d.categorias : [];
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

// ── de quem são os números ───────────────────────────────────────────────────

/* Mecanismo do Vero de 11/09: Total ou uma carteira. Até 03/11 eram duas vagas fixas
   ('sas' e 'ela'); agora são as carteiras da casa, quantas houver. O filtro fica aqui,
   antes de calc(), para as quatro telas continuarem a somar pela mesma função. Sem conta
   ligada não há carteiras, logo a tela mostra tudo. */
const K_VISTA = 'vero.vista';
let verConta = (function () {
  try { return localStorage.getItem(K_VISTA) || 'todos'; } catch (e) { return 'todos'; }
})();

function haContas() { return !!(window.veroLigado && window.veroLigado()); }
function minhaVaga() { return window.veroMinhaVaga ? window.veroMinhaVaga() : 'sas'; }
function carteiras() { return window.veroCarteiras ? window.veroCarteiras() : []; }
function contaVista() {
  if (!haContas() || verConta === 'todos') return 'todos';
  // Carteira apagada ou que deixou de ser visível: volta ao Total em vez de mostrar zero.
  return carteiras().some(function (c) { return c.id === verConta; }) ? verConta : 'todos';
}
function daVista(x) {
  const v = contaVista();
  return v === 'todos' || (x.vaga || minhaVaga()) === v;
}
function lancamentosVistos() { return S.lancamentos.filter(daVista); }
function contasVistas() { return S.contas.filter(daVista); }
function emprestimosVistos() { return S.emprestimos.filter(daVista); }

function nomeDaVaga(v) { return window.veroNomeDaVaga ? window.veroNomeDaVaga(v) : ''; }
function nomeDaVista() { return contaVista() === 'todos' ? 'Total' : nomeDaVaga(verConta); }
function mudarVista(v) {
  verConta = v && carteiras().some(function (c) { return c.id === v; }) ? v : 'todos';
  try { localStorage.setItem(K_VISTA, verConta); } catch (e) { /* vale até fechar */ }
}

/** A conta aberta decide de quem é o que se lança. No Total, é de quem está a lançar. */
function donoPadrao() { return contaVista() === 'todos' ? minhaVaga() : verConta; }
function opcoesDono(atual) {
  const lista = carteiras().slice();
  // Um registro antigo numa carteira que já não existe não pode perder o dono ao corrigir.
  if (atual && !lista.some(function (c) { return c.id === atual; })) lista.push({ id: atual, nome: nomeDaVaga(atual) });
  return lista.map(function (c) {
    return '<option value="' + esc(c.id) + '"' + (c.id === atual ? ' selected' : '') + '>' + esc(c.nome) + (c.privada ? ' (só eu)' : '') + '</option>';
  }).join('');
}
function campoDono(nome, atual) {
  // Com uma carteira só, a pergunta não tem resposta a dar: fica de fora.
  if (!haContas() || carteiras().length < 2) return '';
  return '<label class="campo"><span class="rotulo">Carteira</span><select id="' + nome + '">' + opcoesDono(atual) + '</select></label>';
}
function lerDono(nome, atual) {
  const campo = document.getElementById(nome);
  return haContas() && campo ? (campo.value || atual) : atual;
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
  return contasVistas().filter(function (c) {
    return c.ativa !== false && !(c.pagos && c.pagos[mes]);
  });
}

function mesSeguinte(mes) {
  const a = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7));
  return m === 12 ? (a + 1) + '-01' : a + '-' + p2(m + 1);
}
function nomeDoMes(mes) { return MESES[Number(mes.slice(5, 7)) - 1]; }
function vencimentoEm(c, mes) { return mes + '-' + p2(Math.min(c.dia, diasNoMes(mes))); }

/** A que mês um pagamento pertence. A conta de outubro paga em novembro saiu do dinheiro
    de novembro, mas quita outubro: sem isto, novembro aparecia pago e outubro não. */
function mesDoPagamento(l) {
  const m = /^mes:(\d{4}-\d{2})$/.exec(l.origem || '');
  return m ? m[1] : mesDe(l.data);
}

/** Contas de meses passados que ninguém pagou nem dispensou, a mais antiga primeiro.
    `desde` é o primeiro mês que a conta cobra: quem o não tem nunca aparece atrasado,
    porque um alarme falso sobre dinheiro é pior do que nenhum. */
function contasAtrasadas() {
  const atual = mesDe(hoje()), lista = [];
  contasVistas().forEach(function (c) {
    if (c.ativa === false || !/^\d{4}-\d{2}$/.test(c.desde || '')) return;
    for (let m = c.desde; m < atual; m = mesSeguinte(m)) {
      if (!(c.pagos && c.pagos[m])) lista.push({ conta: c, mes: m, venc: vencimentoEm(c, m) });
    }
  });
  return lista.sort(function (a, b) { return a.venc < b.venc ? -1 : a.venc > b.venc ? 1 : 0; });
}

function abertos(direcao) {
  return emprestimosVistos().filter(function (e) {
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
  return lancamentosVistos().filter(function (l) {
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
  // Cada conta congela o seu: trocar de conta na tela não pode mexer no limite de ninguém.
  const chave = contaVista() === 'todos' ? 'limite' : 'limite_' + verConta;
  const c = S.config[chave];
  if (c && c.dia === h && livre <= c.base) return c.centavos;
  S.config[chave] = { dia: h, centavos: bruto, base: livre };
  guardar();
  return bruto;
}

/** O que entrou e saiu num mês. Serve o mês corrente e os fechados, para os dois
    nunca poderem divergir. */
function resumoEntre(de, ate) {
  let entradas = 0, saidas = 0;
  for (const l of lancamentosVistos()) {
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
  // A conta atrasada ainda vai sair: sem ela aqui, o limite do dia prometia esse dinheiro.
  const contasFalta = contasPorPagar(mes).reduce(function (a, c) { return a + c.centavos; }, 0) +
    contasAtrasadas().reduce(function (a, x) { return a + x.conta.centavos; }, 0);
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
  for (const l of lancamentosVistos()) {
    if (l.tipo === 'saida' && mesDe(l.data) === mes) dias[diaDe(l.data) - 1] += l.centavos;
  }
  return dias;
}

// ── desfazer ─────────────────────────────────────────────────────────────────

let ultimoDesfazer = null, relogioDesfazer = null;

function oferecerDesfazer(texto, repor) {
  ultimoDesfazer = repor;
  // Sem nada para repor é só um aviso: um "Desfazer" que não faz nada engana.
  document.getElementById('desfazer-btn').hidden = !repor;
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
  return ['inicio', 'gastos', 'contas', 'pessoas', 'ajustes'].includes(r) ? r : 'inicio';
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
  [/gasolina|combust|posto|[aá]lcool|uber|[oô]nibus|moto\b|oficina|pneu|mec[aâ]nico/, 'Transporte'],
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
  for (const l of lancamentosVistos()) {
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
  voltar: 'M15 5l-7 7 7 7', avancar: 'M9 5l7 7-7 7', lapis: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  agenda: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4',
  certo: 'M5 12l5 5 9-10'
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
  return lancamentosVistos().reduce(function (m, l) { return l.data < m ? l.data : m; }, hoje());
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

/** Dias corridos entre duas datas. Em UTC: o horário de verão não pode comer um dia. */
function diasEntre(a, b) {
  const x = a.split('-').map(Number), y = b.split('-').map(Number);
  return Math.round((Date.UTC(y[0], y[1] - 1, y[2]) - Date.UTC(x[0], x[1] - 1, x[2])) / 86400000);
}

/** ⭐ "Quantos dias durou o pneu?" responde-se aqui, sem IA: o app calcula. */
function tempoDasDatas(datas) {
  const d = Array.from(new Set(datas)).sort();
  if (!d.length) return null;
  const ultima = d[d.length - 1];
  return {
    ultima: ultima,
    haDias: diasEntre(ultima, hoje()),
    anterior: d.length > 1 ? d[d.length - 2] : null,
    entreUltimas: d.length > 1 ? diasEntre(d[d.length - 2], ultima) : null,
    media: d.length > 2 ? Math.round(diasEntre(d[0], ultima) / (d.length - 1)) : null
  };
}
function comAno(data) { return porExtensoData(data) + '/' + data.slice(0, 4); }
function quantosDias(n) { return n + (n === 1 ? ' dia' : ' dias'); }
function fraseDoTempo(t) {
  const quando = t.haDias === 0 ? 'hoje' : t.haDias === 1 ? 'ontem' : 'há ' + t.haDias + ' dias';
  let f = 'Última vez em ' + comAno(t.ultima) + ', ' + quando + '.';
  if (t.anterior) f += ' Antes disso, ' + comAno(t.anterior) + ': ' + quantosDias(t.entreUltimas) + ' entre uma e outra.';
  if (t.media !== null) f += ' Em média, a cada ' + quantosDias(t.media) + '.';
  return f;
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
  const itens = lancamentosVistos()
    .filter(function (l) { return t ? bateNaBusca(l, t) : l.data >= p.de && l.data <= p.ate; })
    .sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : (b.em || 0) - (a.em || 0); });
  let html = '';
  if (t) {
    let saiu = 0, entrou = 0;
    for (const l of itens) { if (l.tipo === 'entrada') entrou += l.centavos; else saiu += l.centavos; }
    html += '<p class="soma-busca">' + itens.length + (itens.length === 1 ? ' lançamento' : ' lançamentos') +
      (saiu ? ' · saiu ' + dinheiro(saiu) : '') + (entrou ? ' · entrou ' + dinheiro(entrou) : '') + '</p>';
    const tempo = tempoDasDatas(itens.map(function (l) { return l.data; }));
    if (tempo) html += '<p class="tempo-busca">' + fraseDoTempo(tempo) + '</p>';
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
        window.veroDono ? esc(window.veroDono(l, contaVista())) : ''].filter(Boolean).join(' · '),
      prefixo: l.tipo === 'entrada' ? '+' : '',
      centavos: l.centavos,
      classes: 'compacta',
      toque: { acao: 'editar', ref: l.id, rotulo: 'Corrigir' }
    });
  }
  return html;
}

/** O período anterior, para comparar. No período em curso compara só o mesmo trecho
    (dia 1 a dia 10 contra dia 1 a dia 10): contra o mês inteiro, todo mês parecia melhor. */
function comparacao(p, corrente) {
  const ant = intervalo(periodoTipo, refAndada(-1));
  let ate = ant.ate;
  if (corrente) {
    const x = dataDe(ant.de);
    const cortado = iso(new Date(x.getFullYear(), x.getMonth(), x.getDate() + diasEntre(p.de, hoje())));
    if (cortado < ate) ate = cortado;
  }
  // Se o histórico começa no meio do período anterior, a comparação enganaria.
  if (ant.de < primeiroDia()) return null;
  const antes = paraOndeEntre(ant.de, ate).total, agora = paraOndeEntre(p.de, corrente ? hoje() : p.ate).total;
  if (!antes) return null;
  return { antes: antes, agora: agora, diferenca: agora - antes, trecho: corrente };
}
function fraseComparacao(c) {
  if (!c) return '';
  const quando = c.trecho ? 'no mesmo trecho do período anterior' : 'no período anterior';
  if (!c.diferenca) return '<p class="frase">Saiu o mesmo que ' + quando + '.</p>';
  return '<p class="frase">Saiu ' + dinheiro(Math.abs(c.diferenca)) + (c.diferenca > 0 ? ' a mais' : ' a menos') + ' que ' + quando + ' (' + dinheiro(c.antes) + ').</p>';
}

/** Ano abre em meses e semana abre em dias. Tocar numa linha desce ao período menor. */
function secaoDetalhe(p) {
  if (periodoTipo !== 'ano' && periodoTipo !== 'semana') return '';
  const passos = [];
  if (periodoTipo === 'ano') {
    for (let m = 1; m <= 12; m++) {
      const mes = p.de.slice(0, 5) + p2(m);
      passos.push({ de: mes + '-01', ate: mes + '-' + p2(diasNoMes(mes)), nome: MESES[m - 1], alvo: 'mes' });
    }
  } else {
    for (let i = 0; i < 7; i++) {
      const x = dataDe(p.de), d = iso(new Date(x.getFullYear(), x.getMonth(), x.getDate() + i));
      passos.push({ de: d, ate: d, nome: rotuloDoDia(d), alvo: 'dia' });
    }
  }
  let linhas = '';
  for (const s of passos.reverse()) {
    if (s.de > hoje()) continue;
    const r = resumoEntre(s.de, s.ate);
    if (!r.entradas && !r.saidas) continue;
    linhas += linhaHtml({
      marca: null, titulo: esc(s.nome), sub: r.entradas ? 'entrou ' + dinheiro(r.entradas) : '',
      centavos: r.saidas, classes: 'compacta',
      toque: { acao: 'descer-' + s.alvo, ref: s.de, rotulo: 'Abrir' }
    });
  }
  if (!linhas) return '';
  return '<section class="bloco"><h2 class="titulo-cartao">' + (periodoTipo === 'ano' ? 'Mês a mês' : 'Dia a dia') + '</h2>' + linhas + '</section>';
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
      fraseComparacao(comparacao(p, corrente)) +
    '</section>' +
    secaoDetalhe(p) +
    (linhas ? '<section class="bloco grupos">' + linhas + '</section>' : '') +
    '<section class="bloco lancamentos"><h2 class="titulo-cartao">Lançamentos</h2>' +
      '<input type="search" id="busca" class="busca" value="' + esc(buscaTexto) + '" placeholder="Buscar: pneu, farmácia, 50…" autocomplete="off" aria-label="Buscar lançamentos">' +
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
  document.getElementById('topo-titulo').textContent = r === 'inicio' ? saudacao() : r === 'ajustes' ? 'Configurações' : r[0].toUpperCase() + r.slice(1);
  document.getElementById('topo-mes').textContent = 'Dia ' + diaDe(hoje()) + ' de ' + MESES[Number(n.mes.slice(5, 7)) - 1];
  // Configurações não mudam de uma conta para a outra: lá o botão só confundiria.
  document.getElementById('seletor-conta').hidden = !haContas() || r === 'ajustes';
  document.getElementById('seletor-nome').textContent = nomeDaVista();
  document.querySelectorAll('nav.barra a').forEach(function (a) {
    a.classList.toggle('activo', a.dataset.rota === r);
  });
  const tela = document.getElementById('tela');
  const rolagem = tela.scrollTop;
  tela.innerHTML = r === 'gastos' ? telaGastos(n)
    : r === 'contas' ? telaContas(n)
    : r === 'pessoas' ? telaPessoas(n)
    : r === 'ajustes' ? telaAjustes(n)
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
  const restaurar = '<button class="btn pequeno fraco" data-acao="restaurar">Restaurar cópia</button>';
  if (!S.lancamentos.length && !S.contas.length) {
    if (ligado) return '';
    return '<div class="aviso sem-caixa">Trocou de celular? Traga a cópia que você baixou.' + restaurar + '</div>';
  }
  // O Início só avisa quando há o que fazer: o caminho de sempre está em Configurações.
  // Sem conta, o aviso de criar a conta já resolve o mesmo medo: dois avisos viram ruído.
  if (!vencida || (window.veroAviso && window.veroAviso())) return '';
  return '<div class="aviso sem-caixa pesado">' +
    (ult ? 'Última cópia em ' + porExtensoData(ult) + '.' : 'Nenhuma cópia baixada ainda.') +
    ' O celular pode perder isto; a cópia é a sua posse.' +
    '<span class="botoes-aviso"><button class="btn pequeno" data-acao="copia">Baixar cópia</button>' + restaurar + '</span></div>';
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
/* ⭐ O topo mostra o BRUTO do período, pedido dele a 03/11: "se eu coloquei 90 e 90,
   deve aparecer 180". Hoje, o mês ou um dia escolhido. As contas a pagar saíram do
   número grande para uma faixa própria. Desenho a partir da referência que ele
   escolheu no Pinterest: um número sozinho, a resposta numa linha, uma barra fina. */
let inicioVista = 'hoje', inicioDia = null;

function periodoInicio() {
  if (inicioVista === 'mes') {
    const mes = mesDe(hoje());
    return { de: mes + '-01', ate: mes + '-' + p2(diasNoMes(mes)), quando: 'em ' + MESES[Number(mes.slice(5, 7)) - 1], curto: 'este mês' };
  }
  const d = inicioVista === 'dia' && inicioDia ? inicioDia : hoje();
  const r = rotuloDoDia(d);
  return { de: d, ate: d, quando: r === 'Hoje' ? 'hoje' : r === 'Ontem' ? 'ontem' : 'em ' + porExtensoData(d), curto: r === 'Hoje' ? 'hoje' : r === 'Ontem' ? 'ontem' : 'neste dia' };
}

/* "Ainda pode gastar" divide o mês livre pelos dias que faltam. No primeiro dia, só com a
   entrada de hoje, isso dava "R$ 5" logo depois de "Entrou R$ 180": parecia que o app tinha
   comido o dinheiro. A frase espera haver contas ou gastos para ter do que falar. */
function jaTemSaidas() {
  return S.contas.length > 0 || S.lancamentos.some(function (l) { return l.tipo === 'saida'; });
}

function telaInicio(n) {
  const p = periodoInicio(), r = resumoEntre(p.de, p.ate);
  // Sem conta, o aviso de guardar é o que protege o que ele lançou: sobe para junto do número.
  const semContaAinda = window.veroLigado && !window.veroLigado() && window.veroAviso && !!window.veroAviso();
  const ficou = r.entradas - r.saidas;
  const pct = r.entradas > 0 ? Math.min(100, Math.round(r.saidas / r.entradas * 100)) : (r.saidas ? 100 : 0);
  const abas = [['hoje', 'Hoje'], ['mes', 'Mês']].map(function (a) {
    return '<button class="periodo' + (inicioVista === a[0] ? ' activo' : '') + '" data-acao="inicio-vista" data-ref="' + a[0] + '" aria-pressed="' + (inicioVista === a[0]) + '">' + a[1] + '</button>';
  }).join('') +
    // O seletor de data do próprio aparelho, por baixo do botão: no celular abre o calendário.
    '<label class="periodo escolher' + (inicioVista === 'dia' ? ' activo' : '') + '">' +
      (inicioVista === 'dia' && inicioDia ? porExtensoData(inicioDia) : 'Escolher dia') +
      '<input type="date" id="inicio-dia" max="' + hoje() + '" value="' + (inicioDia || hoje()) + '" aria-label="Escolher o dia"></label>';

  const sobra = Math.max(0, n.limite - n.gastoHoje);
  const fraseBarra = !r.entradas && !r.saidas ? 'Nada lançado ' + p.curto + ' ainda.'
    : !r.entradas ? 'Só saiu dinheiro ' + p.curto + '.'
    : 'Saiu ' + pct + '% do que entrou.';

  return '<div class="painel">' +
    '<section class="bloco he">' +
      '<div class="periodos tres">' + abas + '</div>' +
      '<span class="rotulo">Entrou ' + p.quando + '</span>' +
      '<div class="numero-grande">' + numeroGrande(r.entradas) + '</div>' +
      '<div class="saiu-ficou">' +
        '<span><i>' + icone('saiu') + '</i>Saiu <b>' + dinheiro(r.saidas) + '</b></span>' +
        '<span>Ficou <b>' + (ficou < 0 ? '−' : '') + dinheiro(Math.abs(ficou)) + '</b></span>' +
      '</div>' +
      '<div class="barra-fina" role="img" aria-label="' + fraseBarra + '"><i style="width:' + pct + '%"></i></div>' +
      '<p class="frase">' + fraseBarra +
        (inicioVista === 'hoje' && n.limite > 0 && n.livre > 0 && jaTemSaidas() ? ' Ainda pode gastar <b>' + dinheiro(sobra) + '</b> hoje.' : '') + '</p>' +
    '</section>' +
    (semContaAinda ? avisos() : '') +
    faixaContas(n) +
    (window.veroAbrirIA ? '<button class="perguntar" data-acao="perguntar">Pergunte ao Vero: "quando troquei o pneu?"</button>' : '') +
    secaoParaOndeTiles(p) +
    secaoLancInicio(p) +
    // Os quatro são sempre do mês, seja qual for o período aberto no topo.
    '<div class="quatro">' +
      cartaoNumero('entrou', 'Entrou no mês', '+' + dinheiro(n.entradas), 'forte') +
      cartaoNumero('saiu', 'Saiu no mês', '−' + dinheiro(n.saidas), '') +
      cartaoNumero('falta', 'Falta pagar', dinheiro(n.faltaPagar), '') +
      cartaoNumero('receber', 'A receber', dinheiro(n.aReceber), '') +
    '</div>' +
    (inicioVista === 'mes' ? secaoPorDia(n) : '') +
    (semContaAinda ? '' : avisos()) +
  '</div>';
}

/** As contas numa faixa só, fora do número grande: quanto falta no mês e a próxima,
    com o prazo dito como prazo ("faltam 4 dias"), não como data. A lista inteira
    continua em Contas. */
function faixaContas(n) {
  const itens = itensProximos(), h = hoje();
  if (!n.faltaPagar && !itens.length) return '';
  const it = itens[0];
  let prazo = '';
  if (it) {
    const dd = it.semData ? null : diasEntre(h, it.data);
    prazo = dd === null ? 'sem data' : dd < 0 ? 'venceu há ' + quantosDias(-dd) : dd === 0 ? 'vence hoje' : dd === 1 ? 'vence amanhã' : 'faltam ' + quantosDias(dd);
  }
  // O total que falta já está no cartão "Falta pagar": aqui vai só a próxima conta.
  if (!it) return '';
  const mais = itens.length - 1;
  return '<section class="bloco faixa-contas' + (it.data < h ? ' atrasada' : '') + '">' +
    '<span class="ico">' + icone('agenda') + '</span>' +
    '<span class="faixa-nome"><small>Próxima conta · ' + prazo + '</small>' + esc(it.nome) + ' · ' + dinheiro(it.centavos) + '</span>' +
    botao(it.tipo === 'conta' ? 'pagar' : 'devolvi', it.ref, 'Paguei') +
    '<a class="faixa-todas" href="#/contas">' + (mais > 0 ? '+' + mais + ' nos próximos 7 dias' : 'Ver contas') + '</a>' +
  '</section>';
}

/** "Para onde foi" em fichas que rolam para o lado, do período aberto no topo. */
function secaoParaOndeTiles(p) {
  const g = paraOndeEntre(p.de, p.ate);
  const cabeca = '<h2 class="titulo-cartao">Para onde foi ' + p.curto + '</h2>';
  if (!g.total) return '';
  const fichas = g.lista.map(function (it) {
    return '<button class="ficha" data-acao="ver-destino" data-ref="' + esc(it.nome) + '"><span class="ico">' + icone(iconeDoGasto(it.nome)) + '</span>' +
      '<span class="ficha-nome">' + esc(it.nome) + '</span>' +
      '<b>' + dinheiro(it.centavos) + '</b><small>' + Math.round(it.centavos / g.total * 100) + '% · ' + it.vezes + (it.vezes === 1 ? ' vez' : ' vezes') + '</small></button>';
  }).join('');
  return '<section class="bloco para-onde">' + cabeca + '<div class="fila fichas">' + fichas + '</div></section>';
}

/** No dia: os lançamentos. No mês: um dia por linha, e tocar abre esse dia no topo. */
function secaoLancInicio(p) {
  let linhas = '';
  if (p.de === p.ate) {
    lancamentosVistos().filter(function (l) { return l.data === p.de; })
      .sort(function (a, b) { return (b.em || 0) - (a.em || 0); })
      .forEach(function (l) {
        const cat = categoriaDe(l);
        linhas += linhaHtml({
          marca: l.emprestimo || emprestimoDeOrigem(l) ? 'transfer' : l.tipo === 'entrada' ? 'entrou' : 'saiu',
          titulo: esc(String(l.nota || '').trim() || cat || 'Sem nome'),
          sub: l.nota && cat && sinNorm(l.nota) !== sinNorm(cat) ? esc(cat) : '',
          prefixo: l.tipo === 'entrada' ? '+' : '', centavos: l.centavos, classes: 'compacta',
          toque: { acao: 'editar', ref: l.id, rotulo: 'Corrigir' }
        });
      });
    return '<section class="bloco lanc-inicio"><h2 class="titulo-cartao">Lançamentos ' + p.curto + '</h2>' +
      (linhas || '<p class="vazio">Nada lançado ' + p.curto + '. Toque no + para lançar.</p>') + '</section>';
  }
  for (let d = (p.ate < hoje() ? p.ate : hoje()); d >= p.de; d = iso(new Date(dataDe(d).getTime() - 86400000))) {
    const r = resumoEntre(d, d);
    if (!r.entradas && !r.saidas) continue;
    linhas += linhaHtml({
      marca: null, titulo: rotuloDoDia(d), sub: r.entradas ? 'entrou ' + dinheiro(r.entradas) : '',
      prefixo: r.saidas ? '−' : '', centavos: r.saidas, classes: 'compacta',
      toque: { acao: 'inicio-abrir-dia', ref: d, rotulo: 'Abrir' }
    });
  }
  return linhas ? '<section class="bloco lanc-inicio"><h2 class="titulo-cartao">Dia a dia</h2>' + linhas + '</section>' : '';
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
  // O balão fica sempre em cima da barra. Nas pontas do mês muda de âncora em vez de
  // escorregar: escorregado, apontava para o vazio ao lado (olho-da-pagina, 03/11).
  const x = (iMaior + 0.5) / dias.length * 100;
  const ponta = x < 15 ? ' na-ponta-esq' : x > 85 ? ' na-ponta-dir' : '';
  return '<section class="bloco por-dia"><h2 class="titulo-cartao">Gasto por dia</h2>' +
    '<p class="frase">O dia aceso foi o maior do mês</p>' +
    '<div class="barras">' + barras + '<span class="balao' + ponta + '" style="left:' + x.toFixed(1) + '%">Dia ' + (iMaior + 1) + ': ' + dinheiro(maior) + '</span></div>' +
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

  contasAtrasadas().forEach(function (x) {
    itens.push({
      data: x.venc, nome: x.conta.nome, centavos: x.conta.centavos, tipo: 'conta',
      ref: x.conta.id + '|' + x.mes, marca: 'vencida'
    });
  });

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
  const vistas = contasVistas();
  const ordenadas = vistas.slice().sort(function (a, b) { return a.dia - b.dia; });
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

  const atrasadas = contasAtrasadas(), jaTemBotao = {};
  // Só a mais antiga de cada conta pode ser dispensada: dispensar move o `desde`, e numa
  // mais nova levaria junto as anteriores sem ninguém ter pedido.
  const linhasAtrasadas = atrasadas.map(function (x) {
    const primeira = !jaTemBotao[x.conta.id];
    jaTemBotao[x.conta.id] = true;
    return linhaHtml({
      marca: 'vencida',
      titulo: tituloEditavel('editar-conta', x.conta.id, esc(x.conta.nome)),
      sub: 'de ' + nomeDoMes(x.mes) + ' · venceu ' + porExtensoData(x.venc),
      botoes: botao('pagar', x.conta.id + '|' + x.mes, 'Paguei') +
        (primeira ? botao('dispensar-conta', x.conta.id + '|' + x.mes, 'Não devo', true) : ''),
      centavos: x.conta.centavos,
      classes: 'atrasada '
    });
  }).join('');

  return '<section class="bloco he">' +
      '<span class="rotulo">Falta pagar</span>' +
      '<div class="numero-grande">' + numeroGrande(n.contasFalta) + '</div>' +
      '<p class="frase">' + contasPorPagar(mes).length + ' de ' + vistas.length + ' contas por pagar este mês.' +
        (atrasadas.length === 1 ? ' E 1 de mês passado.' : atrasadas.length ? ' E ' + atrasadas.length + ' de meses passados.' : '') + '</p>' +
    '</section>' +
    (linhasAtrasadas ? '<section class="bloco"><h2 class="secao"><span class="rotulo">De meses passados</span></h2>' + linhasAtrasadas + '</section>' : '') +
    '<section class="bloco"><h2 class="secao"><span class="rotulo">Todas as contas</span>' +
      '<button class="btn pequeno" data-acao="nova-conta">Nova conta</button></h2>' +
      (linhas || '<p class="vazio">Nenhuma conta fixa cadastrada. Comece pelas que se repetem todo mês: aluguel, luz, água, internet.</p>') +
    '</section>';
}

// ── Pessoas ──────────────────────────────────────────────────────────────────

function telaPessoas(n) {
  const porPessoa = {};
  for (const e of emprestimosVistos()) {
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

// ── Configurações ────────────────────────────────────────────────────────────

function linhaAjuste(titulo, sub, botoes) {
  return '<div class="ajuste"><div class="ajuste-texto">' + titulo + (sub ? '<small>' + sub + '</small>' : '') + '</div>' +
    (botoes ? '<div class="ajuste-botoes">' + botoes + '</div>' : '') + '</div>';
}
function blocoAjuste(titulo, html) {
  return '<section class="bloco"><h2 class="titulo-cartao">' + titulo + '</h2>' + html + '</section>';
}

function ajustesConta(c) {
  if (!c.disponivel) return blocoAjuste('Conta', '<p class="frase">Sem ligação com o servidor agora. Tudo o que lançar fica guardado neste aparelho.</p>');
  if (!c.entrou) {
    return blocoAjuste('Conta', linhaAjuste('Você está sem conta', 'Os dados ficam só neste aparelho. Com a conta, aparecem em todos os seus aparelhos.', botao('conta', '', 'Entrar')));
  }
  if (!c.ligado) {
    return blocoAjuste('Conta', linhaAjuste('Falta a sua casa', esc(c.email || ''), botao('conta', '', 'Continuar')) +
      '<button class="btn fraco sair" data-acao="sair">Sair da conta</button>');
  }
  return blocoAjuste('Conta',
    linhaAjuste('E-mail', esc(c.email || 'Não informado')) +
    linhaAjuste('Seu nome', esc(c.nome), botao('alterar-nome', '', 'Alterar')) +
    linhaAjuste('Senha', 'Não precisa da senha antiga enquanto estiver conectado aqui.', botao('trocar-senha', '', 'Trocar')) +
    linhaAjuste('Sincronização', esc(c.estado), botao('sincronizar', '', 'Sincronizar')) +
    '<button class="btn fraco sair" data-acao="sair">Sair da conta neste aparelho</button>' +
    // Direito do titular (LGPD): apagar está à vista, mas com o peso visual mais baixo.
    '<button class="apagar-conta" data-acao="apagar-conta">Apagar minha conta</button>');
}

/* ⭐ Casa e carteiras (03/11): pessoas entram por convite, quantas forem; o dinheiro
   separa-se em carteiras. O convite vem DEPOIS de a pessoa já usar o app sozinha —
   é o momento em que já há valor a dividir (YNAB e Monarch fazem o mesmo). */
function ajustesCasa(c) {
  if (!c.ligado) return '';
  const pessoas = c.pessoas.map(function (p) {
    return linhaAjuste(esc(p.nome), [p.vaga === c.vaga ? 'Você' : 'Participa da casa', p.dono ? 'criou a casa' : ''].filter(Boolean).join(' · '));
  }).join('');
  // A carteira de cada pessoa diz de quem é: "Da casa" com nome de gente confundia (olho, 03/11).
  const donoDe = function (k) {
    const p = c.pessoas.find(function (x) { return x.vaga === k.id; });
    return p ? 'De ' + p.nome : '';
  };
  const carts = c.carteiras.map(function (k) {
    return linhaAjuste(esc(k.nome), k.id === c.vaga ? 'Sua carteira' : k.privada ? 'Só você vê' : esc(donoDe(k)) || 'Todos da casa veem',
      botao('carteira', k.id, 'Editar'));
  }).join('');
  return blocoAjuste('Sua casa',
    '<p class="frase">Quem você convidar vê e lança junto com você. Carteiras marcadas "Só você vê" ficam fora da vista dos outros.</p>' +
    pessoas +
    (c.codigo ? '<div class="ajuste"><div class="ajuste-texto">Convidar alguém<small>Manda um link pelo WhatsApp.</small>' +
      '<small class="sem-quebra">Código: <b class="codigo-casa-mini">' + esc(c.codigo) + '</b></small></div>' +
      '<div class="ajuste-botoes">' + botao('convidar', '', 'Convidar') + botao('copiar-convite', '', 'Copiar link') + '</div></div>' : '') +
    (c.souDono ? linhaAjuste('Código vazou?', 'Troque, e o link antigo deixa de abrir a casa.', botao('novo-codigo', '', 'Trocar código')) : '')) +
    blocoAjuste('Carteiras',
      '<p class="frase">Separe o dinheiro como fizer sentido: por pessoa ou por uso (Casa, Moto, Poupança).</p>' +
      carts +
      '<button class="btn fraco nova-carteira" data-acao="nova-carteira">+ Nova carteira</button>' +
      linhaAjuste('Mostrar no Início', contaVista() === 'todos' ? 'Tudo junto, de todas as carteiras' : 'Só a carteira ' + esc(nomeDaVista()),
        botao('escolher-conta', '', 'Mudar')));
}

function ajustesLimite(n) {
  const botoes = [0, 5, 10, 15, 20].map(function (p) {
    const ativo = Math.round(S.config.folga * 100) === p;
    return '<button class="periodo' + (ativo ? ' activo' : '') + '" data-acao="folga" data-ref="' + p + '" aria-pressed="' + ativo + '">' + p + '%</button>';
  }).join('');
  return blocoAjuste('Limite do dia',
    '<p class="frase">Antes de dividir o que sobrou pelos dias que faltam, o Vero guarda esta parte como folga. Vale neste aparelho.</p>' +
    '<div class="periodos cinco">' + botoes + '</div>' +
    '<p class="frase" style="margin-top:10px">Com esta folga, o limite de hoje é ' + dinheiro(n.limite) + '.</p>');
}

function ajustesCategorias() {
  const linhas = S.categorias.slice().sort().map(function (c) {
    return linhaAjuste(esc(c), '', botao('editar-categoria', esc(c), 'Editar'));
  }).join('');
  return blocoAjuste('Suas categorias',
    (linhas || '<p class="frase">Nenhuma ainda. As categorias padrão, como Mercado e Moradia, estão sempre disponíveis.</p>') +
    '<div style="margin-top:10px">' + botao('nova-categoria', '', 'Nova categoria') + '</div>');
}

function ajustesDados() {
  const ult = S.config.copia;
  return blocoAjuste('Seus dados',
    linhaAjuste('Baixar uma cópia', (ult ? 'Última em ' + comAno(ult) + '. ' : 'Nenhuma ainda. ') + 'Um arquivo para restaurar e uma planilha.', botao('copia', '', 'Baixar')) +
    linhaAjuste('Restaurar uma cópia', 'Só acrescenta o que falta. Nada é apagado nem trocado.', botao('restaurar', '', 'Restaurar')));
}

let pedidoInstalar = null;
function jaInstalado() {
  return !!((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone);
}
function ajustesAparelho() {
  const iphone = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  const instalar = jaInstalado() ? linhaAjuste('Instalado neste aparelho', 'Abrindo pelo ícone, sem a barra do navegador.')
    : pedidoInstalar ? linhaAjuste('Instalar o Vero', 'Abre pelo ícone, como um aplicativo.', botao('instalar', '', 'Instalar'))
    : iphone ? linhaAjuste('Instalar o Vero', 'No Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início".')
    : linhaAjuste('Instalar o Vero', 'No menu do navegador, procure "Instalar" ou "Adicionar à tela inicial".');
  return blocoAjuste('Este aparelho',
    linhaAjuste('Esconder os valores', 'Para abrir o app na rua. Tocar no anel do Vero faz o mesmo.', botao('ocultar', '', S.config.oculto ? 'Mostrar' : 'Esconder')) +
    instalar +
    linhaAjuste('Versão ' + VERSAO, 'A versão nova costuma chegar sozinha.', botao('atualizar', '', 'Atualizar')));
}

function telaAjustes(n) {
  const c = window.veroConta ? window.veroConta() : { disponivel: false };
  return ajustesConta(c) + ajustesCasa(c) + ajustesLimite(n) + ajustesCategorias() + ajustesDados() +
    (c.ligado && c.conversa ? blocoAjuste('Conversa com a IA', linhaAjuste('Mensagens guardadas neste aparelho', String(c.conversa), botao('apagar-conversa', '', 'Apagar'))) : '') +
    ajustesAparelho() +
    '<section class="bloco"><div class="sobre-vero">Vero</div><p class="frase">Feito pela SAS. O app calcula e os números são seus.</p></section>';
}

/** A folga muda o limite na hora: o congelado do dia foi feito com a folga antiga. */
function definirFolga(p) {
  S.config.folga = Math.min(0.5, Math.max(0, Number(p) / 100));
  Object.keys(S.config).forEach(function (k) { if (k === 'limite' || k.indexOf('limite_') === 0) S.config[k] = null; });
  guardar();
}

/** Renomear leva junto o que já foi lançado: o histórico não pode ficar com o nome velho. */
function renomearCategoria(antigo, novo) {
  S.categorias = S.categorias.filter(function (c) { return c !== antigo; });
  if (!CAT_SAIDA.concat(CAT_ENTRADA, S.categorias).includes(novo)) S.categorias.push(novo);
  S.lancamentos.forEach(function (l) { if (l.categoria === antigo) l.categoria = novo; });
  guardar();
}
/** Apagar tira da lista. O lançamento continua com o nome que tinha: o gasto existiu. */
function removerCategoria(nome) {
  S.categorias = S.categorias.filter(function (c) { return c !== nome; });
  guardar();
}
function novaCategoria() {
  abrirForm('Nova categoria', campoTexto('cat-nome', 'Nome', 'maxlength="28"'), function () {
    const nome = document.getElementById('cat-nome').value.trim();
    if (!nome) return;
    if (!CAT_SAIDA.concat(CAT_ENTRADA, S.categorias).includes(nome)) S.categorias.push(nome);
    guardar(); fecharFolhas(); desenhar();
  });
}
function editarCategoria(nome) {
  abrirForm('Editar categoria', campoTexto('cat-nome', 'Nome', 'maxlength="28"') +
    botaoApagar('apagar-categoria', esc(nome), 'Apagar esta categoria'), function () {
    const novo = document.getElementById('cat-nome').value.trim();
    if (!novo || novo === nome) return fecharFolhas();
    comDesfazer('Categoria renomeada', function () { renomearCategoria(nome, novo); });
  });
  document.getElementById('cat-nome').value = nome;
}

function copiarCodigo(codigo, oque) {
  const pronto = function () { oferecerDesfazer((oque || 'Código') + ' copiado', null); };
  const falhou = function () { oferecerDesfazer('Não deu para copiar: ' + codigo, null); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(codigo).then(pronto, falhou);
  else falhou();
}
function enviarCodigo(codigo) {
  const texto = 'Entre comigo no Vero: ' + location.origin + location.pathname + ' . Crie a sua conta e use o código ' + codigo + '.';
  window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank', 'noopener');
}
function instalarApp() {
  if (!pedidoInstalar) return;
  const p = pedidoInstalar;
  pedidoInstalar = null;
  p.prompt();
  desenhar();
}
function atualizarApp() {
  const recarregar = function () { location.reload(); };
  if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
    navigator.serviceWorker.getRegistration().then(function (r) { return r && r.update(); }).then(recarregar, recarregar);
  } else recarregar();
}

// ── folha de lançamento ──────────────────────────────────────────────────────

let digitos = '', emEdicao = null, categoriaEscolhida = false, valorDaFrase = false;

/** "gastei 50 de gasolina ontem" -> { centavos: 5000, nota: 'Gasolina', data: ontem }.
    Não tem IA e não custa nada: lançar precisa funcionar sem sinal.
    ⚠️ Sem lookbehind na expressão: um iPhone antigo recusaria o ficheiro inteiro. */
function lerFrase(texto) {
  let t = String(texto || '').replace(/\s+/g, ' ').trim(), data = hoje();
  if (/\banteontem\b/i.test(t)) { data = dataMais(-2); t = t.replace(/\banteontem\b/gi, ' '); }
  else if (/\bontem\b/i.test(t)) { data = dataMais(-1); t = t.replace(/\bontem\b/gi, ' '); }
  else t = t.replace(/\bhoje\b/gi, ' ');

  const marcaDia = /\b(?:no )?dia (\d{1,2})\b/i.exec(t);
  if (marcaDia) {
    const d = Number(marcaDia[1]), agora = hoje();
    const mes = d <= diaDe(agora) ? mesDe(agora) : mesSomado(mesDe(agora), -1);
    if (d >= 1 && d <= diasNoMes(mes)) {
      data = mes + '-' + p2(d);
      t = t.replace(marcaDia[0], ' ');
    }
  }

  const re = /(r\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:[,.](\d{1,2})(?!\d))?(\s*mil\b)?(\s*(?:reais|real|contos?|pilas?)\b)?/gi;
  let achado = null, m;
  while ((m = re.exec(t))) {
    const antes = t[m.index - 1], depois = t[m.index + m[0].length];
    // "90/90" é medida de pneu, não dinheiro.
    if (antes === '/' || depois === '/') continue;
    if (!achado || m[1] || m[5] || !(achado[1] || achado[5])) achado = m;
  }
  let centavos = 0;
  if (achado) {
    const inteiro = Number(achado[2].replace(/\./g, '')) * (achado[4] ? 1000 : 1);
    const v = inteiro * 100 + Number(((achado[3] || '') + '00').slice(0, 2));
    if (v > 0 && v <= 99999999) {
      centavos = v;
      t = t.slice(0, achado.index) + ' ' + t.slice(achado.index + achado[0].length);
    }
  }

  let nota = t.replace(/\s+/g, ' ').trim().replace(/^(gastei|paguei|comprei|saiu|entrou|recebi|ganhei|foi)\s+/i, '');
  const solta = /^(de|do|da|dos|das|com|em|no|na|por|pra|para|o|a|os|as|um|uma)\s+/i;
  while (solta.test(nota)) nota = nota.replace(solta, '');
  nota = nota.replace(/\s+(de|do|da|com|em|no|na|por|pra|para)$/i, '').slice(0, 120);
  return { centavos: centavos, nota: nota ? nota[0].toUpperCase() + nota.slice(1) : '', data: data };
}

function preencherDaFrase(texto) {
  const f = lerFrase(texto);
  if (f.centavos) { digitos = String(f.centavos); valorDaFrase = true; }
  else if (valorDaFrase) { digitos = ''; valorDaFrase = false; }
  document.getElementById('lancar-nota').value = f.nota;
  document.getElementById('lancar-data').value = f.data;
  if (!categoriaEscolhida) document.getElementById('lancar-categoria').value = categoriaSugerida(f.nota);
  pintarValor();
}

/** O que mais se repete, para repetir com um toque. Conta paga e empréstimo ficam de
    fora: têm botão próprio e mexem noutras coisas. */
function gastosFrequentes() {
  const porNota = {};
  const lista = lancamentosVistos().filter(function (l) {
    return l.tipo === 'saida' && String(l.nota || '').trim() && !l.conta && !l.emprestimo && !emprestimoDeOrigem(l);
  }).sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
  for (const l of lista) {
    const k = sinNorm(l.nota.trim());
    const g = porNota[k] || (porNota[k] = { vezes: 0 });
    g.vezes++;
    g.nota = l.nota.trim(); g.centavos = l.centavos; g.categoria = l.categoria || '';
  }
  return Object.keys(porNota).map(function (k) { return porNota[k]; })
    .filter(function (g) { return g.vezes >= 2; })
    .sort(function (a, b) { return b.vezes - a.vezes; })
    .slice(0, 4);
}

function pintarAtalhos(novo) {
  const caixa = document.getElementById('lancar-atalhos');
  const lista = novo ? gastosFrequentes() : [];
  caixa.hidden = !lista.length;
  caixa.innerHTML = lista.map(function (g, i) {
    return '<button class="atalho" data-acao="atalho" data-ref="' + i + '">' + esc(g.nota) + ' <b>' + dinheiro(g.centavos) + '</b></button>';
  }).join('');
}

function usarAtalho(i) {
  const g = gastosFrequentes()[Number(i)];
  if (!g) return;
  digitos = String(g.centavos);
  valorDaFrase = false;
  document.getElementById('lancar-nota').value = g.nota;
  document.getElementById('lancar-categoria').value = g.categoria || categoriaSugerida(g.nota);
  categoriaEscolhida = !!g.categoria;
  pintarValor();
}

/** Falar em vez de digitar. Onde o navegador não ouve, o botão nem aparece. */
let ouvindo = null;
function reconhecedor() { return window.SpeechRecognition || window.webkitSpeechRecognition || null; }
function ouvir() {
  const R = reconhecedor(), dica = document.getElementById('frase-dica');
  if (!R) return;
  if (ouvindo) { ouvindo.stop(); return; }
  const rec = new R();
  rec.lang = 'pt-BR';
  rec.interimResults = false;
  rec.onresult = function (ev) {
    const texto = ev.results[0][0].transcript;
    document.getElementById('lancar-frase').value = texto;
    preencherDaFrase(texto);
    dica.textContent = 'Confira e toque em Saiu ou Entrou.';
  };
  rec.onerror = function (ev) {
    dica.textContent = ev.error === 'not-allowed' || ev.error === 'service-not-allowed'
      ? 'O microfone está bloqueado neste aparelho. Pode escrever a frase.'
      : 'Não ouvi direito. Tente de novo ou escreva a frase.';
  };
  rec.onend = function () {
    ouvindo = null;
    document.getElementById('lancar-microfone').classList.remove('ouvindo');
  };
  ouvindo = rec;
  document.getElementById('lancar-microfone').classList.add('ouvindo');
  dica.textContent = 'Ouvindo…';
  rec.start();
}

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
  // A conta paga e o empréstimo seguem o dono deles: o livro não pode dizer outra coisa.
  document.getElementById('campo-dono').hidden = !haContas() || !!ligado;
  if (haContas()) document.getElementById('lancar-dono').innerHTML = opcoesDono(l ? (l.vaga || minhaVaga()) : donoPadrao());
  categoriaEscolhida = !!(l && l.categoria);
  const data = document.getElementById('lancar-data');
  document.getElementById('lancar-apagar').hidden = !l;
  // Esquecer de lançar é normal: o gasto de ontem entra com a data de ontem.
  data.value = l ? l.data : hoje();
  data.max = hoje();
  data.min = '';
  if (l && l.conta) {
    // A conta paga pertence ao mês em que foi paga: mudá-la de mês desfazia o pagamento.
    data.min = mesDe(l.data) + '-01';
    data.max = [hoje(), mesDe(l.data) + '-' + p2(diasNoMes(mesDe(l.data)))].sort()[0];
  }
  valorDaFrase = false;
  document.getElementById('campo-frase').hidden = !!l;
  document.getElementById('lancar-frase').value = '';
  document.getElementById('frase-dica').textContent = '';
  document.getElementById('lancar-microfone').hidden = !reconhecedor();
  pintarAtalhos(!l);
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

/** ⚠️ Desfazer devolve só o que esta acção mudou. Voltar a fotografia inteira apagava do
    banco o que a outra pessoa lançou nos 7 segundos do aviso. */
function reporDe(antes) {
  const depois = JSON.stringify(S);
  return function () { reverter(JSON.parse(antes), JSON.parse(depois)); guardar(); desenhar(); };
}
function reverter(a, d) {
  for (const t of ['lancamentos', 'contas', 'emprestimos']) {
    const A = {}, D = {};
    a[t].forEach(function (x) { A[x.id] = x; });
    d[t].forEach(function (x) { D[x.id] = x; });
    Object.keys(Object.assign({}, A, D)).forEach(function (k) {
      if (JSON.stringify(A[k]) === JSON.stringify(D[k])) return;
      S[t] = S[t].filter(function (x) { return x.id !== k; });
      if (A[k]) S[t].push(A[k]);
    });
  }
  const criadas = d.categorias.filter(function (c) { return !a.categorias.includes(c); });
  S.categorias = S.categorias.filter(function (c) { return !criadas.includes(c); });
  a.categorias.forEach(function (c) { if (!S.categorias.includes(c)) S.categorias.push(c); });
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
  if (!ligado) {
    mudancas.categoria = categoriaDaFolha();
    mudancas.vaga = lerDono('lancar-dono', l.vaga);
  }
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
  const escolhida = document.getElementById('lancar-data').value;
  const quando = /^\d{4}-\d{2}-\d{2}$/.test(escolhida) && escolhida <= hoje() ? escolhida : hoje();
  const l = {
    id: id(), tipo: tipo, centavos: centavos, data: quando,
    nota: document.getElementById('lancar-nota').value.trim(),
    categoria: categoriaDaFolha(),
    conta: null, emprestimo: null, em: Date.now(),
    vaga: lerDono('lancar-dono')
  };
  S.lancamentos.push(l);
  guardar();
  fecharFolhas();
  // O lançamento novo é de hoje: a tela volta ao período corrente para ele aparecer.
  refData = null;
  buscaTexto = '';
  desenhar();
  // Lançado para a outra pessoa, não aparece nesta tela: o aviso diz para onde foi.
  const paraOutra = daVista(l) ? '' : ' para ' + nomeDaVaga(l.vaga);
  oferecerDesfazer((tipo === 'saida' ? 'Saiu ' : 'Entrou ') + dinheiro(centavos) + (quando === hoje() ? '' : ' em ' + porExtensoData(quando)) + paraOutra, function () {
    S.lancamentos = S.lancamentos.filter(function (x) { return x.id !== l.id; });
    guardar(); desenhar();
  });
}

// ── folha de formulário ──────────────────────────────────────────────────────

function abrirForm(titulo, html, aoGuardar, rotulo) {
  document.getElementById('form-titulo').textContent = titulo;
  document.getElementById('form-corpo').innerHTML = html + (aoGuardar
    ? '<div style="display:flex;gap:10px;margin:22px 0 40px">' +
      '<button class="btn primario" style="flex:1" id="form-ok">' + (rotulo || 'Salvar') + '</button></div>'
    : '');
  document.getElementById('folha-form').hidden = false;
  if (aoGuardar) document.getElementById('form-ok').addEventListener('click', function () { aoGuardar(); });
}

function escolherConta() {
  const v = contaVista(), eu = minhaVaga();
  const opcao = function (ref, nome, sub) {
    return '<button class="opcao-conta" role="radio" aria-checked="' + (v === ref) + '" data-acao="ver-conta" data-ref="' + ref + '">' +
      '<span>' + esc(nome) + (sub ? '<small>' + sub + '</small>' : '') + '</span>' + icone('certo') + '</button>';
  };
  const lista = carteiras();
  abrirForm('Ver os números de',
    '<div class="opcoes-conta" role="radiogroup">' +
      opcao('todos', 'Total', lista.length > 1 ? 'Soma de todas as carteiras que você vê' : '') +
      lista.map(function (c) {
        return opcao(c.id, c.nome, c.id === eu ? 'Sua carteira' : c.privada ? 'Só você vê' : '');
      }).join('') +
    '</div>' +
    '<button class="btn fraco nova-carteira" data-acao="nova-carteira">+ Nova carteira</button>', null);
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
  const c = Math.round(Number(v || 0) * 100);
  // Valor negativo ou de R$ 1.000.000 para cima o banco recusa, e a linha sumia da tela.
  return c > 0 && c <= 99999999 ? c : 0;
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

/* Mecanismo do Vero de 11/09: o aviso nasce na agenda de quem toca, sem servidor de
   notificações. O valor fica fora do título: a agenda aparece na tela bloqueada. */
function dataAgenda(data) { return data.replace(/-/g, ''); }
function diaSeguinte(data) {
  const x = dataDe(data);
  return iso(new Date(x.getFullYear(), x.getMonth(), x.getDate() + 1));
}
function linkAgenda(titulo, data, recorrencia) {
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(titulo) +
    '&dates=' + dataAgenda(data) + '/' + dataAgenda(diaSeguinte(data)) +
    '&details=' + encodeURIComponent('Lembrete criado pelo Vero.') +
    (recorrencia ? '&recur=' + encodeURIComponent(recorrencia) : '');
}
/** Dia 29, 30 e 31 não existem em todo mês: o aviso cai no 28, antes de vencer, para
    nenhum mês ficar sem lembrete. */
function linkAgendaConta(c) {
  const dia = Math.min(c.dia, 28), mes = mesDe(hoje());
  const neste = mes + '-' + p2(dia);
  const primeira = neste >= hoje() ? neste : mesSomado(mes, 1) + '-' + p2(dia);
  return linkAgenda('Pagar ' + c.nome + ' (vence dia ' + c.dia + ')', primeira, 'RRULE:FREQ=MONTHLY;BYMONTHDAY=' + dia);
}
function linkAgendaEmprestimo(e) {
  const titulo = e.direcao === 'emprestei' ? e.pessoa + ' prometeu devolver' : 'Devolver a ' + e.pessoa;
  return linkAgenda(titulo, e.prometida, null);
}
function botaoAgenda(href) {
  return '<a class="btn agenda" href="' + esc(href) + '" target="_blank" rel="noopener">' + icone('agenda') + 'Lembrar na agenda</a>';
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
    campoDono('c-dono', c.vaga || minhaVaga()) +
    botaoAgenda(linkAgendaConta(c)) +
    botaoApagar('apagar-conta', c.id, 'Apagar esta conta'),
    function () {
      const nome = document.getElementById('c-nome').value.trim();
      const centavos = lerValor('c-valor');
      const dia = Math.min(31, Math.max(1, Number(document.getElementById('c-dia').value || c.dia)));
      if (!nome || !centavos) return;
      // ⚠️ Procurar de novo: se o outro celular lançou com a folha aberta, a sincronização
      // trocou os objetos e esta correcção ia para um que já não existe.
      const atual = S.contas.find(function (x) { return x.id === ref; });
      if (!atual) { fecharFolhas(); desenhar(); return; }
      const antes = JSON.stringify(S);
      atual.nome = nome; atual.centavos = centavos; atual.dia = dia; atual.vaga = lerDono('c-dono', atual.vaga);
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
    origem.vaga = e.vaga;
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
    campoDono('e-dono', e.vaga || minhaVaga()) +
    (e.prometida ? botaoAgenda(linkAgendaEmprestimo(e)) : '') +
    botaoApagar('apagar-emprestimo', e.id, 'Apagar este empréstimo'),
    function () {
      const pessoa = document.getElementById('e-pessoa').value.trim();
      const centavos = lerValor('e-valor');
      if (!pessoa || !centavos) return;
      const antes = JSON.stringify(S);
      aplicarEmprestimo(ref, { pessoa: pessoa, centavos: centavos, prometida: document.getElementById('e-prometida').value || null, vaga: lerDono('e-dono', e.vaga) });
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
    '<input type="number" id="c-dia" min="1" max="31" value="5"></label>' +
    campoDono('c-dono', donoPadrao()),
    function () {
      const nome = document.getElementById('c-nome').value.trim();
      const centavos = lerValor('c-valor');
      const dia = Math.min(31, Math.max(1, Number(document.getElementById('c-dia').value || 1)));
      if (!nome || !centavos) return;
      // Conta criada depois do vencimento deste mês só cobra a partir do próximo: a de agora
      // provavelmente já foi paga antes de existir aqui, e viraria atrasada na virada do mês.
      const mes = mesDe(hoje());
      S.contas.push({ id: id(), nome: nome, centavos: centavos, dia: dia, ativa: true, pagos: {}, vaga: lerDono('c-dono'),
        desde: dia >= diaDe(hoje()) ? mes : mesSeguinte(mes) });
      guardar(); fecharFolhas(); desenhar();
    });
}

function novoEmprestimo(direcao) {
  const eu = direcao === 'emprestei';
  abrirForm(eu ? 'Emprestei a alguém' : 'Peguei com alguém',
    campoTexto('e-pessoa', 'Quem', 'placeholder="nome da pessoa" maxlength="40"') +
    campoValor('e-valor', 'Quanto') +
    campoData('e-prometida', eu ? 'Prometeu devolver em' : 'Você prometeu devolver em', '') +
    campoDono('e-dono', donoPadrao()),
    function () {
      const pessoa = document.getElementById('e-pessoa').value.trim();
      const centavos = lerValor('e-valor');
      const prometida = document.getElementById('e-prometida').value || null;
      if (!pessoa || !centavos) return;
      const dono = lerDono('e-dono');
      const e = { id: id(), direcao: direcao, pessoa: pessoa, centavos: centavos, data: hoje(), prometida: prometida, estado: 'aberto', vaga: dono };
      S.emprestimos.push(e);
      // O dinheiro mexe-se na hora: emprestar e uma saida, pegar e uma entrada.
      S.lancamentos.push({
        id: id(), tipo: eu ? 'saida' : 'entrada', centavos: centavos, data: hoje(),
        nota: (eu ? 'Emprestei a ' : 'Peguei com ') + pessoa, conta: null, emprestimo: null, origem: e.id, em: Date.now(), vaga: dono
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
        nota: (eu ? 'Recebi de ' : 'Devolvi a ') + e.pessoa, conta: null, emprestimo: e.id, em: Date.now(), vaga: e.vaga
      });
      reajustarEmprestimo(S.emprestimos.find(function (x) { return x.id === ref; }));
      guardar(); fecharFolhas(); desenhar();
    });
}

/* ⚠️ Desfazer dura 7 segundos e a sincronização troca os objetos nesse meio-tempo, logo
   tudo aqui procura pelo id, nunca guarda o objeto. */
function marcarPago(ref, mes, pago) {
  const c = S.contas.find(function (x) { return x.id === ref; });
  if (!c) return;
  c.pagos = c.pagos || {};
  if (pago) c.pagos[mes] = pago; else delete c.pagos[mes];
}

/** A ref traz o mês quando a conta é de um mês passado: "id|2026-10". */
function pagarConta(alvo) {
  const ref = alvo.split('|')[0], mesAtrasado = alvo.split('|')[1] || null;
  const c = S.contas.find(function (x) { return x.id === ref; });
  if (!c) return;
  abrirForm('Paguei ' + c.nome + (mesAtrasado ? ' de ' + nomeDoMes(mesAtrasado) : ''),
    campoValor('p-valor', 'Quanto saiu') +
    '<p class="frase">Deixe como está se foi ' + dinheiro(c.centavos) + '.</p>',
    function () {
      const centavos = lerValor('p-valor') || c.centavos;
      const mes = mesAtrasado || mesDe(hoje());
      const l = {
        id: id(), tipo: 'saida', centavos: centavos, data: hoje(),
        nota: c.nome, conta: c.id, emprestimo: null, em: Date.now(), vaga: c.vaga
      };
      if (mesAtrasado) l.origem = 'mes:' + mesAtrasado;
      S.lancamentos.push(l);
      marcarPago(ref, mes, { data: hoje(), centavos: centavos, lanc: l.id });
      guardar(); fecharFolhas(); desenhar();
      oferecerDesfazer(c.nome + ' pago', function () {
        marcarPago(ref, mes, null);
        S.lancamentos = S.lancamentos.filter(function (x) { return x.id !== l.id; });
        guardar(); desenhar();
      });
    });
  // o campo abre com o valor habitual, para "Paguei" ser mesmo um toque
  document.getElementById('p-valor').value = (c.centavos / 100).toFixed(2);
}

/** Já foi resolvida fora do app, ou não era devida: some sem mexer no dinheiro. */
function dispensarConta(alvo) {
  const c = S.contas.find(function (x) { return x.id === alvo.split('|')[0]; });
  const mes = alvo.split('|')[1];
  if (!c || !mes) return;
  comDesfazer(c.nome + ' de ' + nomeDoMes(mes) + ' dispensada', function () { c.desde = mesSeguinte(mes); guardar(); });
}

function despagar(ref) {
  const c = S.contas.find(function (x) { return x.id === ref; });
  const mes = mesDe(hoje());
  if (!c || !c.pagos || !c.pagos[mes]) return;
  const guardado = c.pagos[mes];
  const linha = S.lancamentos.find(function (x) { return x.id === guardado.lanc; });
  marcarPago(ref, mes, null);
  S.lancamentos = S.lancamentos.filter(function (x) { return x.id !== guardado.lanc; });
  guardar(); desenhar();
  oferecerDesfazer(c.nome + ' voltou a por pagar', function () {
    // ⚠️ O lançamento volta junto. Só o "pago" voltando, a conta aparecia paga com o
    // dinheiro de fora do livro, e a sincronização desfazia o pagamento logo a seguir.
    if (linha && !S.lancamentos.some(function (x) { return x.id === linha.id; })) S.lancamentos.push(linha);
    marcarPago(ref, mes, guardado);
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
    const atual = S.emprestimos.find(function (x) { return x.id === ref; });
    if (atual) atual.estado = 'aberto';
    guardar(); desenhar();
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
  const linhas = ['data;tipo;valor;categoria;no que foi;de quem'];
  for (const l of S.lancamentos.slice().sort(function (a, b) { return a.data < b.data ? -1 : 1; })) {
    linhas.push([l.data, l.tipo, (l.centavos / 100).toFixed(2).replace('.', ','),
      String(categoriaDe(l) || '').replace(/[;\n]/g, ' '),
      String(l.nota || '').replace(/[;\n]/g, ' '),
      haContas() ? String(nomeDaVaga(l.vaga || minhaVaga())).replace(/[;\n]/g, ' ') : ''].join(';'));
  }
  baixar('vero-' + h + '.csv', '﻿' + linhas.join('\r\n'), 'text/csv');
  S.config.copia = h;
  guardar(); desenhar();
}

/** Restaurar só acrescenta o que falta, pelo id: nunca apaga nem troca o que está aqui.
    O que não parecer um registro válido fica de fora em vez de chegar ao banco. */
function juntarCopia(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.lancamentos)) return null;
  const dia = /^\d{4}-\d{2}-\d{2}$/;
  const inteiro = function (n) { return Number.isInteger(n) && n > 0 && n < 100000000; };
  const tem = function (lista, x) { return lista.some(function (y) { return y.id === x.id; }); };
  let n = 0;
  for (const l of d.lancamentos) {
    if (!l || !l.id || !dia.test(l.data) || !inteiro(l.centavos) || !['entrada', 'saida'].includes(l.tipo) || tem(S.lancamentos, l)) continue;
    S.lancamentos.push(l); n++;
  }
  for (const c of Array.isArray(d.contas) ? d.contas : []) {
    if (!c || !c.id || !c.nome || !inteiro(c.centavos) || !(c.dia >= 1 && c.dia <= 31) || tem(S.contas, c)) continue;
    S.contas.push(c); n++;
  }
  for (const e of Array.isArray(d.emprestimos) ? d.emprestimos : []) {
    if (!e || !e.id || !e.pessoa || !inteiro(e.centavos) || !dia.test(e.data) || !['emprestei', 'peguei'].includes(e.direcao) || tem(S.emprestimos, e)) continue;
    S.emprestimos.push(e); n++;
  }
  for (const c of Array.isArray(d.categorias) ? d.categorias : []) {
    if (typeof c === 'string' && c && !S.categorias.includes(c)) S.categorias.push(c);
  }
  return n;
}

function restaurarCopia() {
  const campo = document.createElement('input');
  campo.type = 'file';
  campo.accept = '.json,application/json';
  campo.addEventListener('change', function () {
    const arquivo = campo.files[0];
    if (!arquivo) return;
    arquivo.text().then(function (texto) {
      const antes = JSON.stringify(S);
      let n = null;
      try { n = juntarCopia(JSON.parse(texto)); } catch (e) { n = null; }
      if (n === null) return oferecerDesfazer('Esse arquivo não é uma cópia do Vero. Use o .json.', null);
      guardar(); desenhar();
      oferecerDesfazer(n ? n + (n === 1 ? ' registro restaurado' : ' registros restaurados') : 'Tudo dessa cópia já estava aqui', reporDe(antes));
    });
  });
  campo.click();
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
    case 'dispensar-conta': return dispensarConta(ref);
    case 'devolvi':         return devolucao(ref);
    case 'perdoar':         return perdoar(ref);
    case 'lembrar':         return lembrar(ref);
    case 'copia':           return guardarCopia();
    case 'restaurar':       return restaurarCopia();
    case 'ouvir':           return ouvir();
    case 'atalho':          return usarAtalho(ref);
    case 'descer-mes':
    case 'descer-dia':
      periodoTipo = b.dataset.acao === 'descer-mes' ? 'mes' : 'dia';
      refData = ref;
      desenhar();
      return window.scrollTo(0, 0);
    case 'conta':           return window.veroAbrirConta();
    case 'alterar-nome':    return window.veroAlterarNome();
    case 'carteira':        return window.veroCarteira(ref);
    case 'nova-carteira':   return window.veroCarteira(null);
    case 'convidar':        return window.veroConvidar();
    case 'copiar-convite':  return window.veroCopiarConvite();
    case 'novo-codigo':     return window.veroNovoCodigo();
    case 'apagar-conta':    return window.veroApagarConta();
    case 'trocar-senha':    return window.veroAbrirSenha();
    case 'sincronizar':     return window.veroSincronizar();
    case 'sair':            return window.veroSair();
    case 'apagar-conversa': return window.veroLimparConversa();
    case 'copiar-codigo':   return copiarCodigo(window.veroConta().codigo);
    case 'enviar-codigo':   return enviarCodigo(window.veroConta().codigo);
    case 'folga':
      definirFolga(ref);
      return desenhar();
    case 'nova-categoria':  return novaCategoria();
    case 'editar-categoria': return editarCategoria(ref);
    case 'apagar-categoria': return comDesfazer('Categoria apagada', function () { removerCategoria(ref); });
    case 'instalar':        return instalarApp();
    case 'atualizar':       return atualizarApp();
    case 'escolher-conta':  return escolherConta();
    case 'ver-conta':
      mudarVista(ref);
      fecharFolhas();
      return desenhar();
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
    case 'inicio-vista':
      inicioVista = ref;
      return desenhar();
    case 'inicio-abrir-dia':
      inicioVista = ref === hoje() ? 'hoje' : 'dia';
      inicioDia = ref;
      desenhar();
      return window.scrollTo(0, 0);
    // Do Início, a ficha leva a Gastos já filtrado por aquele destino.
    case 'ver-destino':
      buscaTexto = ref;
      location.hash = '#/gastos';
      return;
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
  } else if (ev.target.id === 'lancar-frase') {
    preencherDaFrase(ev.target.value);
  } else if (ev.target.id === 'lancar-nota' && !categoriaEscolhida) {
    document.getElementById('lancar-categoria').value = categoriaSugerida(ev.target.value);
  }
});
document.addEventListener('change', function (ev) {
  if (ev.target.id === 'inicio-dia') {
    if (!ev.target.value) return;
    inicioDia = ev.target.value;
    inicioVista = inicioDia === hoje() ? 'hoje' : 'dia';
    return desenhar();
  }
  if (ev.target.id !== 'lancar-categoria') return;
  categoriaEscolhida = true;
  document.getElementById('campo-nova').hidden = ev.target.value !== '__nova';
});

window.addEventListener('hashchange', function () { desenhar(); });

// No computador, Esc fecha a folha aberta.
document.addEventListener('keydown', function (ev) {
  if (ev.key === 'Escape') fecharFolhas();
});

// O navegador só deixa pedir a instalação depois deste aviso, e só uma vez.
window.addEventListener('beforeinstallprompt', function (ev) {
  ev.preventDefault();
  pedidoInstalar = ev;
  if (rota() === 'ajustes') desenhar();
});
window.addEventListener('appinstalled', function () {
  pedidoInstalar = null;
  if (rota() === 'ajustes') desenhar();
});

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
