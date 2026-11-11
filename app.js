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
const VERSAO = 40;
let soMemoria = false;

const VAZIO = {
  v: 1,
  lancamentos: [],
  contas: [],
  emprestimos: [],
  categorias: [],
  agenda: [],
  config: { folga: 0.10, redondo: 500, limite: null, copia: null, oculto: false, tema: 'auto' }
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
  s.agenda      = Array.isArray(d && d.agenda) ? d.agenda : [];
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
function contasVistas() { return S.contas.filter(function (c) { return papelNaVista(c) !== null; }); }

/* 10/11 noite: a conta dividida existe UMA vez, na carteira de quem a cadastrou, mas pesa
   em três sítios. Na vista do dono pesa a parte dele (`centavos`); na vista de quem paga o
   resto, a parte dessa pessoa (`total - centavos`); no Total, a conta INTEIRA. Antes disto o
   Total só via a metade do dono e a vista da outra pessoa via zero: a casa parecia pagar
   R$ 1.115 quando paga R$ 2.230. A outra pessoa acha-se pelo nome (`com`) contra as carteiras
   da casa, porque é o que já está guardado: nenhuma coluna nova, nenhuma migração.
   Uma função decide o peso (`faltaDaConta`); calc() e todas as telas leem dela. */
function semAcentoMin(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase(); }
function vagaDoOutro(c) {
  if (!haContas() || !eDividida(c) || !c.com) return null;
  const alvo = semAcentoMin(c.com);
  const k = carteiras().find(function (x) { return semAcentoMin(x.nome) === alvo; });
  return k && k.id !== (c.vaga || minhaVaga()) ? k.id : null;
}
/** 'tudo' no Total, 'dono' na carteira da conta, 'outro' na de quem paga o resto, ou null. */
function papelNaVista(c) {
  const v = contaVista();
  if (v === 'todos') return 'tudo';
  if ((c.vaga || minhaVaga()) === v) return 'dono';
  if (vagaDoOutro(c) === v) return 'outro';
  return null;
}
function parteDoOutro(c) { return eDividida(c) ? c.total - c.centavos : 0; }
function donoPagou(c, mes) { return !!(c.pagos && c.pagos[mes]); }
/* A parte do outro só passou a pesar na v36 (nov/2026). Antes era registro opcional e
   ninguém marcou os meses que passaram: contá-los agora inventaria atrasos que não houve. */
const DIVISAO_PESA_DESDE = '2026-11';
function outroJaPagou(c, mes) { return eDividida(c) && (mes < DIVISAO_PESA_DESDE || (c.outroPagou || []).includes(mes)); }
/** Quanto desta conta ainda falta pagar no mês, na vista aberta. */
function faltaDaConta(c, mes) {
  const p = papelNaVista(c);
  const a = donoPagou(c, mes) ? 0 : c.centavos;
  const b = outroJaPagou(c, mes) ? 0 : parteDoOutro(c);
  // O Total é a soma das carteiras da casa: a parte de quem não tem carteira aqui (ou de
  // quem usa o app sem conta) não é dinheiro desta casa, e não entra.
  return p === 'tudo' ? a + (vagaDoOutro(c) ? b : 0) : p === 'dono' ? a : p === 'outro' ? b : 0;
}
/** O valor da conta na vista aberta, pago ou não: o que a linha mostra. */
function valorNaVista(c) {
  const p = papelNaVista(c);
  return p === 'tudo' ? (vagaDoOutro(c) ? c.total : c.centavos) : p === 'outro' ? parteDoOutro(c) : c.centavos;
}
/** Na vista de quem paga o resto, "Paguei" marca a parte dessa pessoa (o registro que a v35
    já tinha), nunca a do dono: senão a Ana tocava em Paguei e quitava a metade do SAS. */
function acaoDePagar(c, mes) {
  const p = papelNaVista(c);
  if (p === 'outro') return 'outro-pagou';
  // No Total, se o dono já pagou, o que falta é a parte do outro: "Paguei" não pode pagar o dono de novo.
  if (p === 'tudo' && donoPagou(c, mes) && !outroJaPagou(c, mes) && vagaDoOutro(c)) return 'outro-pagou';
  return 'pagar';
}
/** A ref que acompanha a ação: 'outro-pagou' leva sempre o mês; 'pagar' só quando é de mês passado. */
function refDePagar(c, mes) {
  return acaoDePagar(c, mes) === 'outro-pagou' || mes !== mesDe(hoje()) ? c.id + '|' + mes : c.id;
}
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
    return c.ativa !== false && faltaDaConta(c, mes) > 0;
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
      if (faltaDaConta(c, m) > 0) lista.push({ conta: c, mes: m, venc: vencimentoEm(c, m), centavos: faltaDaConta(c, m) });
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
  /* 10/11 noite, pedido dele: "essas coisas que eu paguei não devem aparecer lá em cima...
     aquela parada do dia não deve afetar". Pagar o aluguel hoje não é o resultado do DIA:
     a conta fixa pertence ao mês, já saiu do Sobrou do mês e do limite do dia quando foi
     cadastrada (é a mesma regra do gastoDeHoje). Num dia só, ela fica fora; no mês, conta. */
  const umDia = de === ate;
  for (const l of lancamentosVistos()) {
    if (l.data < de || l.data > ate) continue;
    if (umDia && l.tipo === 'saida' && l.conta) continue;
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
  const contasFalta = contasPorPagar(mes).reduce(function (a, c) { return a + faltaDaConta(c, mes); }, 0) +
    contasAtrasadas().reduce(function (a, x) { return a + x.centavos; }, 0);
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
  certo: 'M5 12l5 5 9-10',
  conversa: 'M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 10h8M8 13h5',
  fechar: 'M6 6l12 12M18 6L6 18',
  lixo: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  sol: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  lua: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  auto: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 3v18',
  olho: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'olho-fechado': 'M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.1 3.9M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2'
};
function icone(n) {
  return '<svg class="traco" viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICONES[n] + '"/></svg>';
}
/* ⭐ COR POR FAMÍLIA (10/11, pedido dele: "bater o olho no registro e já saber procurar por
   cor"). A lente é da visualização de dados: o olho separa de relance poucas cores, e com
   15 categorias 15 cores viravam ruído. Por isso a cor é da FAMÍLIA, e são cinco:
     entrou = gelo · casa e contas = azul · comida = damasco · transporte = creme ·
     cuidado (saúde, filhos, escola) = rosado. Lazer, pessoal e o resto ficam sem cor.
   Medido a 10/11 (CIEDE2000): o par mais próximo, gelo × azul, está a 19; para quem não
   distingue verde de vermelho (deuteranopia simulada), o mais próximo fica a 15.
   ⚠️ A cor diz SÓ a família. Entrou e saiu continuam na seta e no sinal (DESIGN.md), e
   nenhuma família é verde nem vermelha: cor de categoria não é juízo de valor.
   Paleta declarada em _marca/DESIGN.md, onde o porteiro-de-cor a lê. */
const FAMILIA_DA_CATEGORIA = {
  'Moradia': 'casa', 'Contas fixas': 'casa', 'Alimentação': 'comida', 'Mercado': 'comida',
  'Transporte': 'transporte', 'Saúde': 'cuidado', 'Filhos': 'cuidado', 'Educação': 'cuidado'
};
const FAMILIAS = [
  ['entra', 'Entrou'], ['casa', 'Casa e contas'], ['comida', 'Comida'],
  ['transporte', 'Transporte'], ['cuidado', 'Saúde, filhos e escola']
];
function familiaDe(nome, tipo) {
  if (tipo === 'entrada' || CAT_ENTRADA.includes(nome)) return 'entra';
  if (FAMILIA_DA_CATEGORIA[nome]) return FAMILIA_DA_CATEGORIA[nome];
  const pista = categoriaSugerida(nome);
  if (FAMILIA_DA_CATEGORIA[pista]) return FAMILIA_DA_CATEGORIA[pista];
  if (/celular|telefone|internet|wi-?fi|g[aá]s/.test(String(nome).toLowerCase())) return 'casa';
  return '';
}
/** A família do lançamento: o empréstimo não tem família, é uma transferência. */
function familiaDoLancamento(l) {
  if (l.emprestimo || emprestimoDeOrigem(l)) return '';
  if (l.tipo === 'entrada') return 'entra';
  return familiaDe(categoriaDe(l) || l.nota, l.tipo);
}
function classeCor(f) { return f ? ' cor-' + f : ''; }

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
      cor: familiaDoLancamento(l),
      titulo: esc(String(l.nota || '').trim() || cat || 'Sem nome'),
      // "Mercado / Mercado" não diz nada duas vezes.
      sub: [l.nota && cat && sinNorm(l.nota) !== sinNorm(cat) ? esc(cat) : '',
        window.veroDono ? esc(window.veroDono(l, contaVista())) : ''].filter(Boolean).join(' · '),
      prefixo: l.tipo === 'entrada' ? '+' : '−',
      centavos: l.centavos,
      classes: 'compacta',
      toque: { acao: 'editar', ref: l.id, rotulo: 'Corrigir' },
      apagar: l.id
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
  return '<section class="bloco detalhe" data-paginar=".lista-pag" data-chave="detalhe"><h2 class="titulo-cartao">' + (periodoTipo === 'ano' ? 'Mês a mês' : 'Dia a dia') + '</h2><div class="lista-pag">' + linhas + '</div></section>';
}

/* A rosca de Gastos (07/11): a mesma do Início, numa caixa ao lado da faixa azul. Só se
   vê no computador; no celular a lista de destinos já faz esse papel. */
function roscaDeGastos(g) {
  const fatias = g.lista.slice(0, 5);
  const resto = g.lista.slice(5).reduce(function (a, it) { return a + it.centavos; }, 0);
  if (resto) fatias.push({ nome: 'Outras ' + (g.lista.length - 5), centavos: resto, resto: true });
  const pcts = partesDe100(fatias.map(function (x) { return x.centavos; }));
  const leg = fatias.slice(0, 3).map(function (it, i) {
    return '<button class="g-leg" data-acao="filtrar" data-ref="' + esc(it.nome) + '"><span><i class="ponto ' + (['um', 'dois'][i] || 'resto') + '"></i>' + esc(it.nome) + '</span><small>' + pcts[i] + '%</small><b>' + dinheiro(it.centavos) + '</b></button>';
  }).join('');
  return '<section class="bloco g-rosca so-pc">' + roscaHtml(fatias, g.total, 'Divisão do que saiu. Os valores estão ao lado.') + '<div class="g-legs">' + leg + '</div></section>';
}

function telaGastos() {
  const p = periodoDaTela(), corrente = p.de <= hoje() && p.ate >= hoje();
  const g = paraOndeEntre(p.de, p.ate), r = resumoEntre(p.de, p.ate);
  const nomesPeriodo = { dia: 'Dia', semana: 'Semana', mes: 'Mês', ano: 'Ano' };
  const abas = Object.keys(nomesPeriodo).map(function (k) {
    return '<button class="aba' + (k === periodoTipo ? ' activo' : '') + '" data-acao="periodo" data-ref="' + k + '"' +
      (k === periodoTipo ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + nomesPeriodo[k] + '</button>';
  }).join('');
  let linhas = '';
  const pcts = partesDe100(g.lista.map(function (x) { return x.centavos; }));
  for (const [ix, it] of g.lista.entries()) {
    const pct = pcts[ix];
    // Sem marca: nesta lista TUDO saiu, logo seis quadrados cheios iguais não
    // informam nada — eram só mais tinta.
    linhas += linhaHtml({
      marca: null,
      icone: iconeDoGasto(it.nome),
      cor: familiaDe(it.nome),
      titulo: esc(it.nome),
      sub: pct + '% · ' + it.vezes + (it.vezes === 1 ? ' vez' : ' vezes'),
      extra: pct >= 10 ? medidaProporcao(it.centavos, g.total) : '',
      centavos: it.centavos,
      toque: { acao: 'filtrar', ref: it.nome, rotulo: 'Ver os lançamentos de' }
    });
  }
  // O mês anda FORA do cartão, como no Início: navegação por cima, o dado dentro.
  return '<div class="painel gastos"><nav class="abas filtros" aria-label="Período">' + abas + '</nav>' +
      '<div class="seletor-mes">' +
        '<button class="seta" data-acao="andar" data-ref="-1" aria-label="Período anterior"' + (podeAndar(-1) ? '' : ' disabled') + '>' + icone('voltar') + '</button>' +
        '<span>' + p.nome + '</span>' +
        '<button class="seta" data-acao="andar" data-ref="1" aria-label="Período seguinte"' + (podeAndar(1) ? '' : ' disabled') + '>' + icone('avancar') + '</button>' +
      '</div><section class="bloco he">' +
      '<span class="rotulo">Para onde foi</span>' +
      '<div class="numero-grande">' + numeroGrande(g.total) + '</div>' +
      '<p class="frase">' + (!corrente
        ? 'Entrou ' + dinheiro(r.entradas) + ' · fechou com ' + dinheiro(r.resultado) + '.'
        : g.total ? 'Entrou ' + dinheiro(r.entradas) + ' neste período. O que saiu inclui as contas pagas e o que você emprestou.'
        : 'Nada saiu neste período ainda. Cada coisa que você lançar aparece aqui.') +
      '</p>' +
      fraseComparacao(comparacao(p, corrente)).replace('<p class="frase">', '<p class="frase" data-cede="1">') +
    '</section>' +
    // 07/11: no computador, a rosca ao lado da faixa azul, como no Início.
    (g.lista.length > 1 ? roscaDeGastos(g) : '') +
    secaoDetalhe(p) +
    (linhas ? '<section class="bloco grupos" data-paginar=".lista-pag" data-chave="grupos"><h2 class="titulo-cartao so-pc">Por destino</h2><div class="lista-pag">' + linhas + '</div></section>' : '') +
    '<section class="bloco lancamentos" data-paginar="#lista-lanc" data-chave="lanc"><h2 class="titulo-cartao">Lançamentos</h2>' +
      '<input type="search" id="busca" class="busca" value="' + esc(buscaTexto) + '" placeholder="Buscar: pneu, farmácia, 50…" autocomplete="off" aria-label="Buscar lançamentos">' +
      '<div id="lista-lanc">' + listaHtml() + '</div>' +
    '</section></div>';
}

let rotaPintada = null;

/* Dia e noite (04/11; cores de 05/11). "auto" segue a hora: "claro" das 6h às 18h,
   "escuro" no resto — e o turno dele é das 00h às 03h, onde o escuro descansa a vista.
   Os nomes ficaram; as cores não: "claro" é o navy, "escuro" é o quase preto da logo
   (estilo.css, bloco DIA E NOITE). A escolha na mão fica guardada. Vale o que o <script> do index já pôs antes de pintar. */
function temaAgora() {
  const t = S.config.tema || 'auto', h = new Date().getHours();
  return t === 'auto' ? (h >= 6 && h < 18 ? 'claro' : 'escuro') : t;
}
function aplicarTema() {
  const novo = temaAgora(), raiz = document.documentElement;
  if (!raiz || !raiz.dataset) return;   // nas provas não há <html>
  const mudou = raiz.dataset.tema !== novo;
  raiz.dataset.tema = novo;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', novo === 'claro' ? '#05113B' : '#03091F');
  const t = S.config.tema || 'auto';
  const b = document.getElementById('botao-tema');
  if (b) {
    b.innerHTML = icone(t === 'auto' ? 'auto' : t === 'claro' ? 'sol' : 'lua');
    b.setAttribute('aria-label', t === 'auto' ? 'Automático: navy de dia, quase preto à noite' : t === 'claro' ? 'Sempre o navy do dia' : 'Sempre o escuro da noite');
    b.title = b.getAttribute('aria-label');
  }
  const o = document.getElementById('botao-olho');
  if (o) o.innerHTML = icone(S.config.oculto ? 'olho-fechado' : 'olho');
  // a rede neural lê a tinta do tema: redesenhá-la quando o tema vira
  if (mudou) window.dispatchEvent(new Event('resize'));
}
function trocarTema() {
  const ordem = ['auto', 'claro', 'escuro'];
  S.config.tema = ordem[(ordem.indexOf(S.config.tema || 'auto') + 1) % 3];
  guardar();
  desenhar();
  oferecerDesfazer(S.config.tema === 'auto' ? 'Automático: navy de dia, quase preto à noite' : S.config.tema === 'claro' ? 'Sempre o navy do dia' : 'Sempre o escuro da noite', null);
}

function desenhar() {
  aplicarTema();
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
  caberSemRolar();
  paginarTudo();
}

/* PÁGINAS em vez de rolar (07/11, escolha dele: "Páginas 1 2 3 ›"). No computador, Gastos,
   Contas e Pessoas seguem a regra do Início: NADA rola. Uma caixa de lista
   (data-paginar) mostra só os itens que cabem inteiros; o resto vai para a página 2, 3…
   É o padrão das tabelas dos painéis profissionais. Um título de dia ("Hoje") nunca
   fica sozinho no fim de uma página: passa para a seguinte com os seus lançamentos. */
const paginaDe = {};
let paginaAssin = '';
function paginarTudo() {
  if (!telaUnica || !telaUnica.matches) return;
  // Mudou de tela ou de período: todas as listas voltam à página 1.
  const pp = rota() === 'gastos' ? periodoDaTela() : null;
  const assin = rota() + (pp ? '|' + pp.de + '|' + pp.ate : '');
  if (assin !== paginaAssin) { paginaAssin = assin; Object.keys(paginaDe).forEach(function (k) { delete paginaDe[k]; }); }
  document.querySelectorAll('[data-paginar]').forEach(paginar);
}
function paginar(caixa) {
  const lista = caixa.querySelector(caixa.dataset.paginar);
  const velho = caixa.querySelector('.paginas');
  if (velho) velho.remove();
  if (!lista) return;
  const itens = [].slice.call(lista.children).filter(function (el) { return !el.matches('.soma-busca, .tempo-busca, .vazio'); });
  itens.forEach(function (el) { el.style.display = ''; });
  const transborda = function () { return caixa.scrollHeight > caixa.clientHeight + 1; };
  if (!transborda() || itens.length < 2) return;
  const nav = document.createElement('nav');
  nav.className = 'paginas';
  nav.setAttribute('aria-label', 'Páginas');
  nav.innerHTML = '<button class="pag-seta">' + icone('voltar') + '</button><button class="pag-n">1</button>';
  caixa.appendChild(nav);
  itens.forEach(function (el) { el.style.display = 'none'; });
  const paginas = [];
  let i = 0;
  while (i < itens.length && paginas.length < 300) {
    const pag = [];
    while (i < itens.length) {
      itens[i].style.display = '';
      if (pag.length && transborda()) { itens[i].style.display = 'none'; break; }
      pag.push(itens[i]); i++;
    }
    while (pag.length > 1 && i < itens.length && pag[pag.length - 1].matches('h3.dia')) { pag.pop().style.display = 'none'; i--; }
    pag.forEach(function (el) { el.style.display = 'none'; });
    paginas.push(pag);
  }
  const chave = caixa.dataset.chave, total = paginas.length;
  const atual = Math.max(0, Math.min(paginaDe[chave] || 0, total - 1));
  paginaDe[chave] = atual;
  paginas[atual].forEach(function (el) { el.style.display = ''; });
  // Até 5 números; com mais páginas, a primeira, a última e as vizinhas da atual.
  const nums = [];
  for (let k = 0; k < total; k++) if (total <= 5 || k === 0 || k === total - 1 || Math.abs(k - atual) <= 1) nums.push(k);
  let html = '<button class="pag-seta" data-acao="pagina" data-ref="' + chave + '|' + (atual - 1) + '"' + (atual ? '' : ' disabled') + ' aria-label="Página anterior">' + icone('voltar') + '</button>';
  nums.forEach(function (k, j) {
    if (j && k - nums[j - 1] > 1) html += '<span class="pag-gap">…</span>';
    html += '<button class="pag-n' + (k === atual ? ' activo' : '') + '" data-acao="pagina" data-ref="' + chave + '|' + k + '"' + (k === atual ? ' aria-current="page"' : '') + '>' + (k + 1) + '</button>';
  });
  html += '<button class="pag-seta" data-acao="pagina" data-ref="' + chave + '|' + (atual + 1) + '"' + (atual < total - 1 ? '' : ' disabled') + ' aria-label="Página seguinte">' + icone('avancar') + '</button>';
  nav.innerHTML = html;
}

/* TELA ÚNICA no computador, 3.ª versão (06/11): nenhuma caixa do Início rola por
   dentro. No Chrome dele a área útil é 1366x641 e cada caixa rolava ("ficou
   ridículo"). Aqui cada caixa perde, pela ordem, o que é extra (data-cede) e depois
   os últimos itens das listas, até caber inteira; no lugar fica um "+N" para a lista
   completa. Só corre quando o estilo da tela única está ligado (mesma media query). */
var telaUnica = window.matchMedia ? window.matchMedia('(min-width: 1180px) and (min-height: 600px)') : null;
function caberSemRolar() {
  const painel = document.querySelector('.painel.inicio');
  if (!painel || !telaUnica || !telaUnica.matches) return;
  [].forEach.call(painel.children, function (b) {
    if (!b.classList.contains('bloco')) return;
    const transborda = function () { return b.scrollHeight > b.clientHeight + 1; };
    if (!transborda()) return;
    const cede = [].slice.call(b.querySelectorAll('[data-cede]'))
      .sort(function (x, y) { return Number(x.dataset.cede) - Number(y.dataset.cede); });
    for (let i = 0; i < cede.length && transborda(); i++) cede[i].style.display = 'none';
    // As fichas de contas ficam lado a lado: tirar uma não baixa a caixa, por isso não entram.
    const itens = [].slice.call(b.querySelectorAll('.lista-itens > .item-linha, .destinos > .destino-c'));
    if (!transborda() || itens.length < 2) return;
    const mais = document.createElement('a');
    mais.className = 'mais-n';
    mais.href = '#/gastos';
    // dentro da própria lista: fora dela, numa grade, caía numa fila nova e era cortado
    itens[0].parentNode.appendChild(mais);
    let fora = 0;
    while (itens.length > 1 && (fora === 0 || transborda())) {
      itens.pop().style.display = 'none'; fora++;
      mais.textContent = '+' + fora + ' · ver todos';
    }
  });
}
if (telaUnica) {
  let espera = 0;
  window.addEventListener('resize', function () { clearTimeout(espera); espera = setTimeout(function () { if (rotaPintada && (telaUnica.matches || document.querySelector('.mais-n, .paginas'))) desenhar(); }, 150); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (rotaPintada) desenhar(); });
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
    '<span class="aviso-extra"> O celular pode perder isto; a cópia é a sua posse.</span>' +
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
/* 04/11: nos lançamentos o quadradinho cheio/vazio lia-se como caixa de tarefa a marcar.
   Entrou e saiu passam a ser a seta num azulejo, a mesma dos cartões do Início; as contas
   e as pessoas continuam com as marcas delas. A saída leva o sinal de menos e a entrada o
   azul-gelo da marca: o sentido lê-se antes do número. */
const SETAS = { entrou: 'entrou', saiu: 'saiu', transfer: 'pessoa' };
function linhaHtml(o) {
  const seta = SETAS[o.marca];
  if (seta) {
    o = Object.assign({}, o, { icone: seta, marca: null, classes: (o.classes || '') + ' seta-' + o.marca });
  }
  const semMarca = o.marca === null || o.marca === undefined;
  const tag = o.toque ? 'button' : 'div';
  const toque = o.toque ? ' data-acao="' + o.toque.acao + '" data-ref="' + esc(o.toque.ref) + '"' : '';
  const linha = '<' + tag + toque + ' class="linha dupla' + (semMarca ? ' sem-marca' : '') + (o.icone ? ' com-icone' : '') +
      (o.toque ? ' tocavel' : '') + (o.classes ? ' ' + o.classes : '') + '">' +
    (o.icone ? '<span class="ico' + classeCor(o.cor) + '">' + icone(o.icone) + '</span>' : '') +
    (semMarca ? '' : '<span class="marca ' + o.marca + '"></span>') +
    '<span class="nome"><span class="titulo">' + o.titulo + '</span>' +
      '<span class="sub-linha"><span class="sub">' + (o.sub || '') + '</span>' +
      (o.botoes || '') + '</span>' +
      // `extra` ocupa uma linha SÓ dele, debaixo da data. Serve o que não cabe
      // ao lado dela: três botões juntos, ou a medida de proporção -- que
      // metida na linha da data encolhia de 170px para 22 e desaparecia.
      (o.extra ? '<span class="extra-linha">' + o.extra + '</span>' : '') +
    '</span>' +
    '<span class="valor">' + (o.centavos === null ? '' : (o.prefixo || '') + dinheiro(o.centavos)) +
      (o.acaoDireita ? '<span class="acao-direita">' + o.acaoDireita + '</span>' : '') + '</span>' +
  '</' + tag + '>';
  // A lixeira (04/11): botão não pode ir dentro de botão, por isso fica FORA da
  // linha tocável, num invólucro.
  if (!o.apagar) return linha;
  return '<div class="linha-com-apagar">' + linha +
    (o.toque && o.toque.acao === 'editar' ? '<button class="item-lapis" data-acao="editar" data-ref="' + esc(o.toque.ref) + '" aria-label="Corrigir">' + icone('lapis') + '</button>' : '') +
    '<button class="item-apagar" data-acao="apagar-direto" data-ref="' + esc(o.apagar) + '" aria-label="Apagar">' + icone('lixo') + '</button></div>';
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
let inicioVista = 'hoje', inicioDia = null, inicioFiltro = 'todos';

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

/* ── Início v16 (04/11, noite): o herói da v14 volta, a casca da v15 fica ──────────
   Ele abriu a v15 no PC: "não estou gostando, antes estava mais interessante". Dois
   revisores (lente dos mestres + teste dos 5 segundos como ele e a Ana Clara) deram o
   mesmo diagnóstico: a v14 tinha UM ponto de luz e UM número rei; a v15 tinha três
   números iguais, um painel creme a roubar o olho e gráficos vazios no 2.º dia.
   Receita: o cartão-herói com o degradê e o "Entrou" em negrito manda; Saiu/Ficou e o
   mês servem por baixo, dentro dele; a rosca ao lado (pedido dele, Zarss); a conversa
   com o Vero em largura toda, com cara de conversa (antes parecia busca); depois a
   lista e as contas. Gráfico só aparece quando há o que mostrar. */
function telaInicio(n) {
  const p = periodoInicio(), r = resumoEntre(p.de, p.ate);
  const ficou = r.entradas - r.saidas;
  const pct = r.entradas > 0 ? Math.min(100, Math.round(r.saidas / r.entradas * 100)) : (r.saidas ? 100 : 0);
  const pctFicou = r.entradas > 0 ? Math.max(0, Math.round(ficou / r.entradas * 100)) : 0;

  const abas = [['hoje', 'Hoje'], ['mes', 'Mês']].map(function (a) {
    return '<button class="aba' + (inicioVista === a[0] ? ' activo' : '') + '" data-acao="inicio-vista" data-ref="' + a[0] + '" aria-pressed="' + (inicioVista === a[0]) + '">' + a[1] + '</button>';
  }).join('') +
    '<label class="aba escolher' + (inicioVista === 'dia' ? ' activo' : '') + '">' + icone('agenda') +
      (inicioVista === 'dia' && inicioDia ? porExtensoData(inicioDia) : 'Outro dia') +
      '<input type="date" id="inicio-dia" max="' + hoje() + '" value="' + (inicioDia || hoje()) + '" aria-label="Escolher o dia"></label>';

  const sobra = Math.max(0, n.limite - n.gastoHoje);
  const podeGastar = inicioVista === 'hoje' && n.limite > 0 && n.livre > 0 && jaTemSaidas();
  // Recompensa na hora (Hábitos Atômicos: o hábito pega quando o ganho é IMEDIATO): o
  // herói acende por um instante logo depois de um lançamento.
  const ultimo = S.lancamentos.reduce(function (m, l) { return Math.max(m, l.em || 0); }, 0);
  /* 07/11, pedido dele, no celular: "lá em cima vai ser o total de hoje... o saiu é o
     saiu e o entrou tem que estar do lado do saiu". O número grande passa a ser o
     resultado do dia (o Sobrou); Entrou e Saiu ficam lado a lado por baixo. Aprovado em
     imagem. No computador o herói continua o de antes. */
  const celular = !(telaUnica && telaUnica.matches);
  const textoPode = podeGastar ? 'Pode gastar ' + dinheiro(sobra) + ' hoje' : r.entradas ? pctFicou + '% do que entrou' : '—';
  const heroiCel = '<section class="bloco he heroi heroi-cel' + (Date.now() - ultimo < 5000 ? ' pulso' : '') + (ficou > 0 ? ' ganho' : '') + '">' +
    '<span class="rotulo">Sobrou ' + p.quando + '</span>' +
    '<div class="numero-grande">' + (ficou < 0 ? '−' : '') + numeroGrande(Math.abs(ficou)) + '</div>' +
    '<small class="heroi-pode">' + textoPode + '</small>' +
    '<div class="heroi-dois">' +
      '<div><span>' + icone('entrou') + 'Entrou</span><b>' + dinheiro(r.entradas) + '</b><small>tudo o que entrou</small></div>' +
      '<div><span>' + icone('saiu') + 'Saiu</span><b>' + dinheiro(r.saidas) + '</b>' +
        '<div class="barra-fina" role="img" aria-label="Saiu ' + pct + '% do que entrou"><i style="width:' + pct + '%"></i></div>' +
        '<small>' + (r.entradas ? pct + '% do que entrou' : r.saidas ? 'Só saiu dinheiro' : 'Nada saiu') + '</small></div>' +
    '</div>' +
    (inicioVista !== 'mes' ? '<p class="heroi-mes" data-cede="2">No mês: entrou <b>' + dinheiro(n.entradas) + '</b> · saiu <b>' + dinheiro(n.saidas) + '</b></p>' : '') +
  '</section>';
  const heroi = celular ? heroiCel : '<section class="bloco he heroi' + (Date.now() - ultimo < 5000 ? ' pulso' : '') + (ficou > 0 ? ' ganho' : '') + '">' +
    '<span class="rotulo">Entrou ' + p.quando + '</span>' +
    '<div class="numero-grande">' + numeroGrande(r.entradas) + '</div>' +
    '<div class="heroi-dois">' +
      '<div><span>' + icone('saiu') + 'Saiu</span><b>' + dinheiro(r.saidas) + '</b>' +
        '<div class="barra-fina" role="img" aria-label="Saiu ' + pct + '% do que entrou"><i style="width:' + pct + '%"></i></div>' +
        '<small>' + (r.entradas ? pct + '% do que entrou' : r.saidas ? 'Só saiu dinheiro' : 'Nada saiu') + '</small></div>' +
      '<div class="sobrou"><span>Sobrou</span><b>' + (ficou < 0 ? '−' : '') + dinheiro(Math.abs(ficou)) + '</b><small>' +
        (podeGastar ? 'Pode gastar ' + dinheiro(sobra) + ' hoje' : r.entradas ? pctFicou + '% do que entrou' : '—') + '</small></div>' +
    '</div>' +
    (inicioVista !== 'mes' ? '<p class="heroi-mes" data-cede="2">No mês: entrou <b>' + dinheiro(n.entradas) + '</b> · saiu <b>' + dinheiro(n.saidas) + '</b></p>' : '') +
  '</section>';

  return '<div class="painel inicio">' +
    '<nav class="abas filtros" aria-label="Período">' + abas + '</nav>' +
    atalhosHtml() +
    heroi +
    (celular ? faixaAgenda() : '') +
    secaoParaOndeTiles(p) +
    (celular ? '' : conversaCartao()) +
    listaInicio(p) +
    cartaoContas(n) +
    calendarioDoMes() +
    (inicioVista === 'mes' ? secaoPorDia(n) : '') +
    avisos() +
    (celular ? conversaCartao() : '') +
  '</div>';
}

/** Os lançamentos que ele REPETE (mesmo nome, mesmo valor, mesmo tipo, 2+ vezes nos
    últimos 45 dias), os três mais frequentes. 04/11: a diária cai quase todo dia e ele
    digita por ditado — repetir tem de ser um toque, não uma folha inteira. */
function atalhosRepetidos() {
  const desde = iso(new Date(Date.now() - 45 * 86400000)), conta = {};
  lancamentosVistos().forEach(function (l) {
    if (l.data < desde || l.conta || l.emprestimo || !String(l.nota || '').trim()) return;
    const k = l.tipo + '|' + sinNorm(l.nota) + '|' + l.centavos;
    if (!conta[k]) conta[k] = { n: 0, l: l };
    conta[k].n++;
    if ((l.em || 0) > (conta[k].l.em || 0)) conta[k].l = l;
  });
  return Object.keys(conta).map(function (k) { return conta[k]; })
    .filter(function (x) { return x.n >= 2; })
    .sort(function (a, b) { return b.n - a.n; }).slice(0, 3).map(function (x) { return x.l; });
}

function atalhosHtml() {
  const lista = atalhosRepetidos();
  if (!lista.length) return '';
  return '<div class="atalhos" role="group" aria-label="Lançar de novo com um toque">' +
    '<span class="atalhos-rotulo">De novo, num toque</span>' +
    lista.map(function (l) {
      return '<button class="atalho ' + (l.tipo === 'entrada' ? 'e-entrada' : 'e-saida') + '" data-acao="repetir" data-ref="' + l.id + '">' +
        icone(l.tipo === 'entrada' ? 'entrou' : 'saiu') + esc(String(l.nota).trim()) + ' <b>' + dinheiro(l.centavos) + '</b></button>';
    }).join('') + '</div>';
}

function repetirLancamento(ref) {
  const o = S.lancamentos.find(function (x) { return x.id === ref; });
  if (!o) return;
  const l = { id: id(), tipo: o.tipo, centavos: o.centavos, data: hoje(), nota: o.nota, categoria: o.categoria || '',
    conta: null, emprestimo: null, em: Date.now(), vaga: o.vaga };
  S.lancamentos.push(l);
  guardar();
  desenhar();
  oferecerDesfazer((l.tipo === 'saida' ? 'Saiu ' : 'Entrou ') + dinheiro(l.centavos) + ' · ' + String(l.nota).trim(), function () {
    S.lancamentos = S.lancamentos.filter(function (x) { return x.id !== l.id; });
    guardar(); desenhar();
  });
}

/** Porcentagens inteiras que somam 100 (maior resto). 04/11: 60+18+13+10 dava 101%,
    porque 17,5 e 12,5 arredondavam os dois para cima. */
function partesDe100(valores) {
  const total = valores.reduce(function (a, v) { return a + v; }, 0);
  if (!total) return valores.map(function () { return 0; });
  const brutos = valores.map(function (v) { return v / total * 100; });
  const inteiros = brutos.map(Math.floor);
  let falta = 100 - inteiros.reduce(function (a, v) { return a + v; }, 0);
  brutos.map(function (b, i) { return { i: i, resto: b - inteiros[i] }; })
    .sort(function (a, b) { return b.resto - a.resto; })
    .forEach(function (x) { if (falta > 0) { inteiros[x.i]++; falta--; } });
  return inteiros;
}

/** O que falta pagar no mês, com as próximas em fichas e a primeira acesa. */
function cartaoContas(n) {
  // O que tem data vem primeiro: a ficha acesa é a que vence mais cedo, não a "sem data".
  const itens = itensProximos().sort(function (a, b) { return (a.semData ? 1 : 0) - (b.semData ? 1 : 0); }), h = hoje();
  if (!n.faltaPagar && !itens.length) return '';
  const fichas = itens.slice(0, 2).map(function (it, i) {
    const dd = it.semData ? null : diasEntre(h, it.data);
    const prazo = dd === null ? 'Sem data' : dd < 0 ? 'Venceu' : dd === 0 ? 'Hoje' : dd === 1 ? 'Amanhã' : 'Em ' + quantosDias(dd);
    return '<div class="conta-ficha' + (i === 0 ? ' acesa' : '') + '"><small>' + prazo + '</small><b>' + esc(it.nome) + '</b><span>' + dinheiro(it.centavos) + '</span></div>';
  }).join('');
  const primeira = itens[0];
  // "Com o que sobrou, a Luz de R$ 180 em 4 dias está coberta?" — a pergunta que o
  // número solto de 1.280 não respondia. Ganho primeiro: quanto JÁ está coberto.
  const rh = resumoEntre(h, h), sobrouHoje = Math.max(0, rh.entradas - rh.saidas);
  let cobre = '';
  if (primeira && primeira.tipo === 'conta' && sobrouHoje > 0) {
    const pc = Math.min(100, Math.round(sobrouHoje / primeira.centavos * 100));
    cobre = '<div class="cobre" data-cede="1"><span>' + (pc >= 100 ? 'O que sobrou hoje já paga a ' + esc(primeira.nome) + ' inteira.'
      : 'O que sobrou hoje já cobre <b>' + pc + '%</b> da ' + esc(primeira.nome) + ' · faltam ' + dinheiro(primeira.centavos - sobrouHoje)) + '</span>' +
      '<div class="barra-cobre"><i style="width:' + pc + '%"></i></div></div>';
  }
  return '<section class="bloco contas-cartao">' +
    '<div class="cabeca-linha"><span class="rotulo">Falta pagar no mês</span><a class="ver-todos" href="#/contas">Contas</a></div>' +
    '<div class="numero-grande valor-medio">' + numeroGrande(n.faltaPagar) + '</div>' +
    (n.aReceber ? '<small class="nota" data-cede="2">A receber ' + dinheiro(n.aReceber) + '</small>' : '') +
    (fichas ? '<div class="contas-fichas">' + fichas + '</div>' : '<p class="nota">Nada vence nos próximos 7 dias.</p>') +
    cobre +
    (primeira ? '<button class="btn contorno" data-acao="' + (primeira.acao || (primeira.tipo === 'conta' ? 'pagar' : 'devolvi')) + '" data-ref="' + esc(primeira.ref) + '">' +
      (primeira.tipo === 'conta' ? 'Paguei ' + esc(primeira.nome) : esc(primeira.nome.replace(/^Devolver/, 'Já devolvi'))) + '</button>' : '') +
  '</section>';
}

/** Os lançamentos do período, em navy, com os filtros em pílula. Tocar abre a folha. */
function listaInicio(p) {
  const todos = lancamentosVistos().filter(function (l) { return l.data >= p.de && l.data <= p.ate; })
    .sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : (b.em || 0) - (a.em || 0); });
  const ent = todos.filter(function (l) { return l.tipo === 'entrada'; }).length;
  const filtros = [['todos', 'Todos', todos.length], ['entrada', 'Entrou', ent], ['saida', 'Saiu', todos.length - ent]];
  const lista = inicioFiltro === 'todos' ? todos : todos.filter(function (l) { return l.tipo === inicioFiltro; });
  const pilulas = todos.length ? '<div class="pilulas" role="group" aria-label="Mostrar">' + filtros.map(function (f) {
    return '<button class="pilula' + (inicioFiltro === f[0] ? ' activo' : '') + '" data-acao="inicio-filtro" data-ref="' + f[0] + '">' + f[1] + ' <span>' + f[2] + '</span></button>';
  }).join('') + '</div>' : '';
  const linhas = lista.map(function (l) {
    const cat = categoriaDe(l), e = l.tipo === 'entrada';
    // A hora em cada linha (04/11): com o "de novo num toque", duas diárias iguais
    // pareciam um engano; com a hora, vê-se que são duas.
    const hora = l.em ? ' · ' + new Date(l.em).toTimeString().slice(0, 5) : '';
    const sub = p.de === p.ate ? (cat || (e ? 'Entrada' : 'Saída')) + hora : rotuloDoDia(l.data) + (cat ? ' · ' + cat : '');
    const nome = esc(String(l.nota || '').trim() || cat || 'Sem nome');
    // 04/11, pedido dele: "tem que ter a opção de apagar, caso eu lance errado". O
    // apagar já existia, mas escondido dentro da folha de corrigir. Agora fica na linha,
    // e o "Desfazer" que aparece em baixo salva o toque errado.
    return '<div class="item-linha">' +
      '<button class="item ' + (e ? 'e-entrada' : 'e-saida') + '" data-acao="editar" data-ref="' + l.id + '" aria-label="Corrigir ' + nome + '">' +
      '<span class="item-ico' + classeCor(familiaDoLancamento(l)) + '">' + icone(l.emprestimo || emprestimoDeOrigem(l) ? 'pessoa' : e ? 'entrou' : 'saiu') + '</span>' +
      '<span class="item-nome">' + nome + '<small>' + esc(sub) + '</small></span>' +
      '<b class="item-valor">' + (e ? '+' : '−') + dinheiro(l.centavos) + '</b></button>' +
      '<button class="item-lapis" data-acao="editar" data-ref="' + l.id + '" aria-label="Corrigir ' + nome + '">' + icone('lapis') + '</button>' +
      '<button class="item-apagar" data-acao="apagar-direto" data-ref="' + l.id + '" aria-label="Apagar ' + nome + '">' + icone('lixo') + '</button></div>';
  }).join('');
  return '<section class="bloco lista-inicio">' +
    '<div class="cabeca-linha"><h2 class="titulo-cartao">Lançamentos<span class="titulo-periodo"> ' + p.curto + '</span></h2>' + pilulas + '</div>' +
    (linhas ? '<div class="lista-itens">' + linhas + '</div>' : '<p class="vazio">Nada lançado ' + p.curto + '. Toque em + Novo lançamento.</p>') +
  '</section>';
}

/** "Para onde foi" na linguagem da faixa de cima (v15, revisão de 04/11): cada destino
    com o valor fino e grande e a barra gelo da sua parte. As fichas antigas, quadradas e
    em negrito, eram o primeiro sítio onde se via que "não mudou nada". */
function secaoParaOndeTiles(p) {
  if (telaUnica && telaUnica.matches) { const roda = secaoRoda(); if (roda) return roda; }
  const g = paraOndeEntre(p.de, p.ate);
  // Com um destino só, a rosca é um anel inteiro que não diz nada: espera haver dois.
  if (!g.total || g.lista.length < 2) return '';
  if (telaUnica && telaUnica.matches) return paraOndeA(p, g);
  // 04/11, pedido dele: "falta um gráfico de pizza para ver para onde vai MAIS o dinheiro".
  const fatias = g.lista.slice(0, 5);
  const resto = g.lista.slice(5).reduce(function (a, it) { return a + it.centavos; }, 0);
  if (resto) fatias.push({ nome: 'Outras ' + (g.lista.length - 5), centavos: resto, resto: true });
  const pcts = partesDe100(fatias.map(function (x) { return x.centavos; }));
  const cartoes = fatias.map(function (it, i) {
    const pct = pcts[i], tom = ['um', 'dois'][i] || 'resto';
    return '<button class="destino-c ' + tom + '" data-acao="ver-destino" data-ref="' + esc(it.nome) + '">' +
      '<span class="destino-c-topo"><span class="item-ico' + (it.resto ? '' : classeCor(familiaDe(it.nome))) + '">' + icone(it.resto ? 'outros' : iconeDoGasto(it.nome)) + '</span><span class="destino-c-nome"><i class="ponto ' + tom + '"></i>' + esc(it.nome) + '</span><small>' + pct + '%</small></span>' +
      '<span class="kpi-valor">' + dinheiro(it.centavos) + '</span>' +
      '<span class="kpi-barra"><i style="width:' + pct + '%"></i></span>' +
      '<small class="kpi-nota">' + (it.vezes ? it.vezes + (it.vezes === 1 ? ' vez' : ' vezes') : 'Somadas') + '</small></button>';
  }).join('');
  return '<section class="bloco para-onde"><h2 class="titulo-cartao">Para onde foi ' + p.curto + '</h2><div class="rosca-destinos">' + roscaHtml(fatias, g.total, 'Para onde foi o dinheiro. Os valores estão nos cartões ao lado.') +
    '<div class="destinos">' + cartoes + '</div></div></section>';
}

/* ── O AVISO QUE RODA (07/11, pedido dele) ─────────────────────────────────────────
   No computador, a caixa da rosca passa a mostrar, um de cada vez, o que pede atenção:
   conta que falta pagar, quem te deve e quem você deve. Troca sozinho a cada 6 s e
   PARA com o mouse em cima. O que vence mais perto aparece MAIS VEZES (peso pela
   proximidade), sem repetir o mesmo duas vezes seguidas quando há outro.
   Lentes: a curva de "saliência" dos avisos (urgência sobe com a proximidade do prazo)
   e o aviso do Nielsen Norman Group sobre carrosséis: rodam devagar, param com o mouse,
   e mostram que há mais ("2 de 5"). O relógio é a própria barrinha: quando ela acaba
   de encher, troca; com o mouse em cima, a barra pára e o aviso também.
   Sem nada a avisar, volta a rosca de sempre. */
function itensRoda() {
  const h = hoje(), mes = mesDe(h), itens = [];
  const prazo = function (data, venceu, hojeT, amanha, emN) {
    if (!data) return null;
    const dd = diasEntre(h, data);
    return { dd: dd, txt: dd < 0 ? venceu + ' há ' + quantosDias(-dd) : dd === 0 ? hojeT : dd === 1 ? amanha : emN + ' ' + quantosDias(dd) };
  };
  contasAtrasadas().forEach(function (x) {
    const pz = prazo(x.venc, 'Venceu', '', '', '');
    itens.push({ k: 'c' + x.conta.id + x.mes, tipo: 'conta', rotulo: 'Falta pagar', nome: x.conta.nome, centavos: x.centavos, dd: pz.dd, sub: pz.txt, ir: '#/contas' });
  });
  contasPorPagar(mes).forEach(function (c) {
    const venc = vencimentoEm(c, mes), pz = prazo(venc, 'Venceu', 'Vence hoje', 'Vence amanhã', 'Vence em');
    itens.push({ k: 'c' + c.id, tipo: 'conta', rotulo: 'Falta pagar', nome: c.nome, centavos: faltaDaConta(c, mes), dd: pz.dd, sub: pz.txt + ' · dia ' + diaDe(venc), ir: '#/contas' });
  });
  abertos('emprestei').forEach(function (e) {
    const pz = prazo(e.prometida, 'Prometeu e passou', 'Prometeu para hoje', 'Prometeu para amanhã', 'Prometeu para daqui a');
    itens.push({ k: 'e' + e.id, tipo: 'recebe', rotulo: 'Te deve', nome: e.pessoa, centavos: falta(e), dd: pz ? pz.dd : null, sub: pz ? pz.txt : 'Sem data para devolver', ir: '#/pessoas' });
  });
  abertos('peguei').forEach(function (e) {
    const pz = prazo(e.prometida, 'Passou do combinado', 'Combinou devolver hoje', 'Combinou devolver amanhã', 'Combinou devolver em');
    itens.push({ k: 'e' + e.id, tipo: 'deve', rotulo: 'Você deve', nome: e.pessoa, centavos: falta(e), dd: pz ? pz.dd : null, sub: pz ? pz.txt : 'Sem data combinada', ir: '#/pessoas' });
  });
  // Peso pela proximidade: vencido e hoje 6, amanhã 5, até 3 dias 4, semana 3, quinzena 2, resto 1.
  itens.forEach(function (it) {
    const d = it.dd;
    it.peso = d === null ? 1 : d <= 0 ? 6 : d === 1 ? 5 : d <= 3 ? 4 : d <= 7 ? 3 : d <= 15 ? 2 : 1;
  });
  // A ordem do "2 de 5": o mais urgente primeiro.
  return itens.sort(function (a, b) { return (a.dd === null ? 999 : a.dd) - (b.dd === null ? 999 : b.dd); });
}
let rodaAtual = null;
const rodaCredito = {};
/* Rodízio com peso, "liso": cada volta todos ganham o seu peso, sai o que tem mais, e
   paga o total. O de peso 6 sai 6 vezes em cada ciclo, espalhadas, nunca em bloco. */
function proximoRoda(itens) {
  let tot = 0, melhor = null;
  itens.forEach(function (it) {
    rodaCredito[it.k] = (rodaCredito[it.k] || 0) + it.peso;
    tot += it.peso;
    if (!melhor || rodaCredito[it.k] > rodaCredito[melhor.k]) melhor = it;
  });
  if (itens.length > 1 && melhor.k === rodaAtual) {
    const outro = itens.filter(function (it) { return it.k !== rodaAtual; }).sort(function (a, b) { return rodaCredito[b.k] - rodaCredito[a.k]; })[0];
    melhor = outro;
  }
  rodaCredito[melhor.k] -= tot;
  return melhor;
}
function corpoRoda(itens, it) {
  const pos = itens.indexOf(it) + 1;
  return '<div class="roda-corpo">' +
    '<div class="roda-topo"><span class="roda-rotulo ' + it.tipo + '">' + it.rotulo + '</span>' +
      (itens.length > 1 ? '<span class="roda-conta">' + pos + ' de ' + itens.length + '</span>' +
        '<button class="roda-prox" data-acao="roda-proximo" aria-label="Próximo aviso">' + icone('avancar') + '</button>' : '') + '</div>' +
    '<a class="roda-meio" href="' + it.ir + '"><b class="roda-nome">' + esc(it.nome) + '</b><b class="roda-valor">' + dinheiro(it.centavos) + '</b></a>' +
    '<span class="roda-sub' + (it.dd !== null && it.dd <= 1 ? ' perto' : '') + '">' + esc(it.sub) + '</span>' +
    (itens.length > 1 ? '<span class="roda-tempo"><i></i></span>' : '') +
  '</div>';
}
function secaoRoda() {
  const itens = itensRoda();
  if (!itens.length) return '';
  let it = itens.filter(function (x) { return x.k === rodaAtual; })[0];
  if (!it) { it = proximoRoda(itens); rodaAtual = it.k; }
  return '<section class="bloco para-onde roda" aria-live="polite" aria-label="Avisos">' + corpoRoda(itens, it) + '</section>';
}
function avancarRoda() {
  const caixa = document.querySelector('.roda');
  if (!caixa) return;
  const itens = itensRoda();
  if (!itens.length) return desenhar();
  const it = proximoRoda(itens);
  rodaAtual = it.k;
  const velho = caixa.querySelector('.roda-corpo');
  const trocar = function () {
    caixa.innerHTML = corpoRoda(itens, it);
    const novo = caixa.querySelector('.roda-corpo');
    if (novo.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      novo.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
  };
  if (velho && velho.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    velho.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' }).onfinish = trocar;
  else trocar();
}
// O relógio é a barrinha: acabou de encher, troca. Com o mouse em cima ela pára.
document.addEventListener('animationend', function (ev) {
  if (ev.target.matches && ev.target.matches('.roda-tempo i')) avancarRoda();
});

/* "PARA ONDE FOI", forma A (07/11, escolhida por ele entre quatro, em imagem).
   O diagnóstico dos três agentes: a caixa parecia de outra marca porque o dinheiro não
   tinha a ASSINATURA do herói (R$ e centavos pequenos, inteiro grande), não havia um
   número rei (56% e R$ 500 quase do mesmo tamanho), o anel de pontas redondas parecia
   um "carregando", e era caixa dentro de caixa. A forma A: o anel diz só "o maior
   contra o resto" (dois arcos, pontas retas), o % no centro, e o valor do maior com a
   assinatura do herói ao lado. Vem das escolhas dele no Pinterest (sas-05, sas-06).
   Só no computador; no celular a caixa continua a de antes. */
function paraOndeA(p, g) {
  const L = g.lista, T = g.total, maior = L[0], resto = T - maior.centavos;
  const pct = partesDe100(L.map(function (x) { return x.centavos; }))[0];
  const r = 48, C = 2 * Math.PI * r, vao = 2;
  const arco = function (v, ini, cls) {
    const tr = Math.max(0.01, v / T * C - vao);
    return '<circle class="pa-arco ' + cls + '" cx="52" cy="52" r="' + r + '" stroke-dasharray="' + tr.toFixed(2) + ' ' + C.toFixed(2) +
      '" stroke-dashoffset="' + (-(ini * C + vao / 2)).toFixed(2) + '" transform="rotate(-90 52 52)"/>';
  };
  const outros = L.length - 1;
  return '<section class="bloco para-onde pa">' +
    '<div class="pa-anel"><svg viewBox="0 0 104 104" role="img" aria-label="' + esc(maior.nome) + ': ' + pct + '% do que saiu">' +
      arco(maior.centavos, 0, 'um') + (resto ? arco(resto, maior.centavos / T, 'resto') : '') + '</svg>' +
      '<div class="pa-centro"><span>' + esc(maior.nome) + '</span><b>' + pct + '<small>%</small></b></div></div>' +
    '<div class="pa-texto"><span class="pa-tit">Para onde foi ' + p.curto + '</span>' +
      '<button class="numero-grande pa-valor" data-acao="ver-destino" data-ref="' + esc(maior.nome) + '" aria-label="Ver os gastos de ' + esc(maior.nome) + '">' + numeroGrande(maior.centavos) + '</button>' +
      '<span class="pa-sub">' + esc(maior.nome) + ' · de ' + dinheiro(T) + ' que saiu</span>' +
      '<a class="pa-mais" href="#/gastos">Mais ' + outros + (outros === 1 ? ' destino' : ' destinos') + ' <span>→</span></a></div>' +
  '</section>';
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

  let linhas = '';
  fatias.forEach(function (it, i) {
    const pct = Math.round(it.centavos / g.total * 100), tom = ['um', 'dois'][i] || 'resto';
    linhas += '<div class="destino"><span class="ico' + (it.resto ? '' : classeCor(familiaDe(it.nome))) + '">' + icone(it.resto ? 'outros' : iconeDoGasto(it.nome)) + '</span>' +
      '<span class="destino-nome"><i class="ponto ' + tom + '"></i>' + esc(it.nome) + '<small>' + pct + '%</small></span>' +
      '<b>' + dinheiro(it.centavos) + '</b></div>';
  });
  return '<section class="bloco para-onde">' + cabeca + '<p class="frase">' + dinheiro(g.total) + ' este mês</p>' +
    '<div class="rosca-e-lista">' + roscaHtml(fatias, g.total, 'Divisão do que saiu este mês. Os valores estão na lista.') +
    '<div>' + linhas + '</div></div></section>';
}

/** A rosca em si: os dois maiores com tom próprio, o resto num azul só (ver acima).
    No centro, o maior destino e a parte dele. */
function roscaHtml(fatias, total, aria) {
  const r = 42, volta = 2 * Math.PI * r, vao = fatias.length > 1 ? 13.5 : 0;
  let andado = 0, arcos = '';
  fatias.forEach(function (it, i) {
    const f = it.centavos / total, tom = ['um', 'dois'][i] || 'resto';
    const traco = Math.max(0.01, f * volta - vao);
    arcos += '<circle class="arco ' + tom + '" cx="50" cy="50" r="' + r + '" stroke-dasharray="' + traco.toFixed(2) + ' ' + volta.toFixed(2) +
      '" stroke-dashoffset="' + (-(andado * volta + vao / 2)).toFixed(2) + '" transform="rotate(-90 50 50)"><title>' + esc(it.nome) + ': ' + dinheiro(it.centavos) + '</title></circle>';
    andado += f;
  });
  const maior = fatias[0];
  return '<div class="rosca"><svg viewBox="0 0 100 100" role="img" aria-label="' + aria + '">' + arcos + '</svg>' +
    '<div class="rosca-centro"><span>' + esc(maior.nome) + '</span><b>' + Math.round(maior.centavos / total * 100) + '%</b></div></div>';
}

/** O X do mês (05/11, fase 1 do plano): os dias em que ele lançou ficam acesos.
    Conta-se o TOTAL de dias, nunca a sequência: quem quebra uma corrente tende a
    largar tudo (o efeito "dane-se" da psicologia do hábito). Dia vazio fica neutro,
    sem vermelho. Tocar num dia aceso abre esse dia no topo. */
/* ⭐ O CALENDÁRIO COM AGENDA (10/11, pedido dele: "posso clicar num dia e agendar: no dia 13
   tem cabeleireiro tal horário, no dia 25 de dezembro tem Natal. Todo dia eu entro no app e
   vejo ali"). O app que ele abre todo dia passa a lembrar também o que não é dinheiro.
     · Todo dia é tocável. A folha do dia junta o feriado, o que ele marcou, as contas que
       vencem nesse dia e, se houve, o atalho para os lançamentos.
     · Cada marca é uma FORMA, não uma cor (DESIGN.md): dia com lançamento = cheio, como já
       era; com compromisso = um ponto; feriado = anel tracejado.
     · Os feriados nacionais são CALCULADOS (a Páscoa decide Carnaval, Sexta-feira Santa e
       Corpus Christi): nunca ficam desactualizados e não pesam no banco.
     · O compromisso de hoje e o de amanhã sobem para a frase do calendário e, no celular,
       para uma faixa logo abaixo do número principal. */
let calMes = null;

function pascoa(ano) {
  // Algoritmo anónimo gregoriano (Meeus/Jones/Butcher).
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}
const FERIADOS_CACHE = {};
/** Feriados nacionais (Lei 662/1949 e Lei 14.759/2023, que fez nacional o 20 de novembro),
    mais Carnaval e Corpus Christi, que são ponto facultativo. Os estaduais e municipais ele
    marca como compromisso que se repete todo ano. */
function feriadosDoAno(ano) {
  if (FERIADOS_CACHE[ano]) return FERIADOS_CACHE[ano];
  const f = {};
  [['01-01', 'Confraternização Universal'], ['04-21', 'Tiradentes'], ['05-01', 'Dia do Trabalho'],
   ['09-07', 'Independência do Brasil'], ['10-12', 'Nossa Senhora Aparecida'], ['11-02', 'Finados'],
   ['11-15', 'Proclamação da República'], ['12-25', 'Natal']].forEach(function (x) { f[ano + '-' + x[0]] = x[1]; });
  if (ano >= 2024) f[ano + '-11-20'] = 'Dia da Consciência Negra';
  const p = pascoa(ano), mais = function (n) { return iso(new Date(p.getFullYear(), p.getMonth(), p.getDate() + n)); };
  f[mais(-48)] = 'Carnaval (ponto facultativo)';
  f[mais(-47)] = 'Carnaval (ponto facultativo)';
  f[mais(-2)] = 'Sexta-feira Santa';
  f[mais(60)] = 'Corpus Christi (ponto facultativo)';
  return (FERIADOS_CACHE[ano] = f);
}
function feriadoEm(data) { return feriadosDoAno(Number(data.slice(0, 4)))[data] || ''; }

/** O que ele marcou para um dia, já com os que se repetem, pela hora. */
function agendaDoDia(data) {
  const mes = data.slice(0, 7), dia = diaDe(data), md = data.slice(5);
  return (S.agenda || []).filter(daVista).filter(function (a) {
    if (!a || !a.data || a.data > data) return false;
    if (a.data === data) return true;
    if (a.repete === 'ano') {
      const alvo = a.data.slice(5);
      // 29 de fevereiro cai no 28 nos anos que não o têm.
      return alvo === md || (alvo === '02-29' && md === '02-28' && diasNoMes(mes) === 28);
    }
    if (a.repete === 'mes') return Math.min(diaDe(a.data), diasNoMes(mes)) === dia;
    return false;
  }).sort(function (x, y) { return (x.hora || '99') < (y.hora || '99') ? -1 : 1; });
}
function textoCompromisso(a) { return (a.hora ? a.hora.replace(':00', 'h').replace(':', 'h') + ' · ' : '') + a.titulo; }

/** Hoje e amanhã, numa frase: o feriado primeiro, depois o que ele marcou. */
function lembretesProximos() {
  const h = hoje(), am = dataMais(1), itens = [];
  [[h, 'Hoje'], [am, 'Amanhã']].forEach(function (d) {
    const fer = feriadoEm(d[0]);
    if (fer) itens.push({ data: d[0], quando: d[1], texto: 'Feriado · ' + fer });
    agendaDoDia(d[0]).forEach(function (a) { itens.push({ data: d[0], quando: d[1], texto: textoCompromisso(a) }); });
  });
  return itens;
}

/** No celular o calendário fica longe do topo: o que é de hoje e de amanhã sobe numa faixa. */
function faixaAgenda() {
  const itens = lembretesProximos();
  if (!itens.length) return '';
  return '<section class="bloco agenda-faixa" aria-label="Agenda de hoje e amanhã">' + itens.slice(0, 3).map(function (it) {
    return '<button class="agenda-item" data-acao="dia-abrir" data-ref="' + it.data + '">' + icone('agenda') +
      '<span><b>' + it.quando + '</b> ' + esc(it.texto) + '</span></button>';
  }).join('') + (itens.length > 3 ? '<small class="agenda-mais">+' + (itens.length - 3) + ' na agenda</small>' : '') + '</section>';
}

function calendarioDoMes() {
  const h = hoje(), base = (inicioVista === 'dia' && inicioDia ? inicioDia : h).slice(0, 7);
  const mes = calMes || base;
  const total = diasNoMes(mes), atual = mes === h.slice(0, 7);
  const ate = mes < h.slice(0, 7) ? total : atual ? diaDe(h) : 0;
  const lancou = {};
  lancamentosVistos().forEach(function (l) { if (l.data.slice(0, 7) === mes) lancou[diaDe(l.data)] = true; });
  const acesos = Object.keys(lancou).filter(function (d) { return d <= ate; }).length;
  const p = mes.split('-').map(Number), vazio = new Date(p[0], p[1] - 1, 1).getDay();
  let celulas = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(function (s) { return '<span class="sem" aria-hidden="true">' + s + '</span>'; }).join('');
  for (let i = 0; i < vazio; i++) celulas += '<span></span>';
  for (let d = 1; d <= total; d++) {
    const data = mes + '-' + p2(d), fer = feriadoEm(data), ag = agendaDoDia(data);
    const classe = 'd' + (lancou[d] ? ' lancou' : '') + (data > h ? ' futuro' : '') + (data === h ? ' hoje' : '') +
      (fer ? ' feriado' : '') + (ag.length ? ' tem-agenda' : '');
    const diz = 'Dia ' + d + (lancou[d] ? ', com lançamento' : '') + (fer ? ', feriado: ' + fer : '') +
      (ag.length ? ', ' + ag.map(function (a) { return a.titulo; }).join(', ') : '');
    celulas += '<button class="' + classe + '" data-acao="dia-abrir" data-ref="' + data + '" aria-label="' + esc(diz) + '">' + d + '</button>';
  }
  const prox = atual ? lembretesProximos() : [];
  const frase = prox.length ? '<b>' + prox[0].quando + ':</b> ' + esc(prox[0].texto) + (prox.length > 1 ? ' <span class="mais">+' + (prox.length - 1) + '</span>' : '')
    : !atual ? 'Toque num dia para marcar um compromisso.'
    : !acesos ? 'Toque num dia para marcar um compromisso.'
    : acesos === ate ? 'Todos os dias até hoje têm lançamento.'
    : quantosDias(acesos) + ' com lançamento até hoje.';
  const nome = MESES[p[1] - 1], titulo = nome.charAt(0).toUpperCase() + nome.slice(1) + (p[0] !== Number(h.slice(0, 4)) ? ' ' + p[0] : '');
  return '<section class="bloco mes-cal"><div class="cal-cabeca"><h2 class="titulo-cartao">' + titulo + '</h2>' +
      '<span class="cal-setas"><button class="cal-seta" data-acao="cal-mes" data-ref="-1" aria-label="Mês anterior">‹</button>' +
      (calMes && calMes !== base ? '<button class="cal-volta" data-acao="cal-mes" data-ref="0">Hoje</button>' : '') +
      '<button class="cal-seta" data-acao="cal-mes" data-ref="1" aria-label="Próximo mês">›</button></span></div>' +
    '<p class="frase" data-cede="1">' + frase + '</p>' +
    '<div class="cal" role="group" aria-label="Dias de ' + nome + '">' + celulas + '</div></section>';
}

function mudarMesCal(passo) {
  const h = hoje().slice(0, 7);
  if (Number(passo) === 0) calMes = null;
  else {
    const atual = calMes || (inicioVista === 'dia' && inicioDia ? inicioDia : hoje()).slice(0, 7);
    // Dois anos para cada lado chegam para um calendário de casa.
    const novo = mesSomado(atual, Number(passo));
    if (novo >= mesSomado(h, -24) && novo <= mesSomado(h, 24)) calMes = novo;
  }
  desenhar();
}

const SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
function tituloDoDia(data) {
  const x = dataDe(data);
  return SEMANA[x.getDay()] + ', ' + x.getDate() + ' de ' + MESES[x.getMonth()] + (data.slice(0, 4) !== hoje().slice(0, 4) ? ' de ' + x.getFullYear() : '');
}

/** A folha do dia: o que há nele e, por baixo, marcar um compromisso novo. */
function abrirDia(data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return;
  const fer = feriadoEm(data), ag = agendaDoDia(data), mes = data.slice(0, 7);
  const vence = contasVistas().filter(function (c) {
    return c.ativa !== false && vencimentoEm(c, mes) === data && !(/^\d{4}-\d{2}$/.test(c.desde || '') && c.desde > mes);
  });
  const teveLanc = data <= hoje() && lancamentosVistos().some(function (l) { return l.data === data; });
  let html = '';
  if (fer) html += '<p class="dia-feriado"><span class="marca-feriado" aria-hidden="true"></span>Feriado · ' + esc(fer) + '</p>';
  if (ag.length) {
    html += '<div class="dia-lista">' + ag.map(function (a) {
      const rep = a.repete === 'ano' ? 'todo ano' : a.repete === 'mes' ? 'todo mês' : '';
      return '<div class="dia-item"><span class="ponto-agenda" aria-hidden="true"></span><span class="dia-item-txt"><b>' + esc(a.titulo) + '</b>' +
        '<small>' + [a.hora ? 'às ' + a.hora : 'sem hora', rep].filter(Boolean).join(' · ') + '</small></span>' +
        '<button class="btn pequeno fraco" data-acao="apagar-lembrete" data-ref="' + esc(a.id + '|' + data) + '">Apagar</button></div>';
    }).join('') + '</div>';
  }
  if (vence.length) {
    html += '<p class="dia-contas">Vence: ' + vence.map(function (c) {
      return esc(c.nome) + ' (' + dinheiro(valorNaVista(c)) + (faltaDaConta(c, mes) === 0 ? ', paga' : '') + ')';
    }).join(' · ') + '</p>';
  }
  if (teveLanc) html += '<button class="btn contorno dia-ver" data-acao="dia-ver" data-ref="' + data + '">Ver os lançamentos deste dia</button>';
  html += '<h3 class="dia-novo">Marcar neste dia</h3>' +
    campoTexto('ag-titulo', 'O que tem', 'maxlength="60" placeholder="cabeleireiro, aniversário, médico"') +
    '<label class="campo"><span class="rotulo">Hora (se tiver)</span><input type="time" id="ag-hora"></label>' +
    '<label class="campo"><span class="rotulo">Repetir</span><select id="ag-repete">' +
      '<option value="">Só neste dia</option><option value="mes">Todo mês, dia ' + diaDe(data) + '</option>' +
      '<option value="ano">Todo ano, ' + diaDe(data) + ' de ' + MESES[Number(data.slice(5, 7)) - 1] + '</option></select></label>';
  abrirForm(tituloDoDia(data), html, function () {
    const titulo = document.getElementById('ag-titulo').value.trim().slice(0, 60);
    if (!titulo) { fecharFolhas(); return; }
    const hora = document.getElementById('ag-hora').value;
    const antes = JSON.stringify(S);
    S.agenda.push({ id: id(), data: data, hora: /^\d{2}:\d{2}$/.test(hora) ? hora : '', titulo: titulo,
      repete: document.getElementById('ag-repete').value, vaga: donoPadrao() });
    guardar(); fecharFolhas(); desenhar();
    oferecerDesfazer('Marcado: ' + titulo + ' em ' + porExtensoData(data), reporDe(antes));
  }, 'Marcar');
}

function apagarLembrete(ref) {
  const p = String(ref).split('|'), antes = JSON.stringify(S);
  const a = S.agenda.find(function (x) { return x.id === p[0]; });
  if (!a) return;
  S.agenda = S.agenda.filter(function (x) { return x.id !== p[0]; });
  guardar(); desenhar();
  abrirDia(p[1] || a.data);
  oferecerDesfazer('Apagado: ' + a.titulo + (a.repete ? ' (todas as vezes)' : ''), reporDe(antes));
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
      botao(it.acao || (it.tipo === 'conta' ? 'pagar' : 'devolvi'), it.ref, 'Paguei') +
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
      data: x.venc, nome: x.conta.nome, centavos: x.centavos, tipo: 'conta',
      ref: x.conta.id + '|' + x.mes, marca: 'vencida', acao: acaoDePagar(x.conta, x.mes)
    });
  });

  contasPorPagar(mes).forEach(function (c) {
    const venc = mes + '-' + p2(Math.min(c.dia, diasNoMes(mes)));
    if (venc > limite) return;
    itens.push({
      data: venc, nome: c.nome, centavos: faltaDaConta(c, mes), tipo: 'conta',
      ref: refDePagar(c, mes), acao: acaoDePagar(c, mes),
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
  /* 04/11: cada conta com o ícone dela, o prazo dito como prazo ("em 4 dias") e o
     "Paguei" debaixo do valor, à direita. Antes o botão flutuava no meio da linha e o
     quadradinho parecia uma caixa a marcar. Paga, o ícone vira o visto. */
  for (const c of ordenadas) {
    // Na vista do dono, igual à v35. No Total e na vista de quem paga o resto, "paga" é
    // faltaDaConta = 0: a conta só fecha quando as duas partes estão pagas.
    const papel = papelNaVista(c), pago = c.pagos && c.pagos[mes];
    const quitada = faltaDaConta(c, mes) === 0;
    const venc = mes + '-' + p2(Math.min(c.dia, diasNoMes(mes)));
    const atrasada = !quitada && venc < h;
    const valor = papel === 'dono' ? (pago ? pago.centavos : c.centavos) : valorNaVista(c);
    const faltam = diasEntre(h, venc);
    linhas += linhaHtml({
      icone: quitada ? 'certo' : iconeDoGasto(c.nome),
      cor: familiaDe(c.nome) || 'casa',
      titulo: tituloEditavel('editar-conta', c.id, esc(c.nome)),
      sub: quitada ? (pago && papel !== 'outro' ? 'Pago em ' + porExtensoData(pago.data) : 'Pago')
        : papel === 'tudo' && pago ? 'Falta a parte de ' + nomeOutro(c)
        : atrasada ? 'Venceu dia ' + c.dia
        : faltam === 0 ? 'Vence hoje' : faltam === 1 ? 'Vence amanhã' : 'Vence dia ' + c.dia + ' · em ' + faltam + ' dias',
      extra: linhaDivisao(c, mes),
      acaoDireita: papel === 'outro' ? botao('outro-pagou', c.id + '|' + mes, quitada ? 'Desfazer' : 'Paguei', quitada)
        : papel === 'tudo' && pago && !quitada && vagaDoOutro(c) ? botao('outro-pagou', c.id + '|' + mes, 'Paguei')
        : pago ? botao('despagar', c.id, 'Desfazer', true) : botao('pagar', c.id, 'Paguei'),
      centavos: valor,
      classes: 'conta-linha ' + (atrasada ? 'atrasada ' : '') + (quitada ? 'fraca' : '')
    });
  }

  const atrasadas = contasAtrasadas(), jaTemBotao = {};
  // Só a mais antiga de cada conta pode ser dispensada: dispensar move o `desde`, e numa
  // mais nova levaria junto as anteriores sem ninguém ter pedido.
  const linhasAtrasadas = atrasadas.map(function (x) {
    const primeira = !jaTemBotao[x.conta.id];
    jaTemBotao[x.conta.id] = true;
    return linhaHtml({
      icone: iconeDoGasto(x.conta.nome),
      cor: familiaDe(x.conta.nome) || 'casa',
      titulo: tituloEditavel('editar-conta', x.conta.id, esc(x.conta.nome)),
      extra: linhaDivisao(x.conta, x.mes),
      sub: 'De ' + nomeDoMes(x.mes) + ' · venceu ' + porExtensoData(x.venc),
      acaoDireita: botao(acaoDePagar(x.conta, x.mes), x.conta.id + '|' + x.mes, 'Paguei') +
        (primeira && papelNaVista(x.conta) !== 'outro' ? botao('dispensar-conta', x.conta.id + '|' + x.mes, 'Não devo', true) : ''),
      centavos: x.centavos,
      classes: 'conta-linha atrasada '
    });
  }).join('');

  // 07/11: no computador, a próxima conta ao lado da faixa azul, como no Início.
  const prox = ordenadas.filter(function (c) { return faltaDaConta(c, mes) > 0 && c.ativa !== false; })
    .map(function (c) { return { c: c, venc: mes + '-' + p2(Math.min(c.dia, diasNoMes(mes))) }; })
    .sort(function (a, b) { return a.venc < b.venc ? -1 : 1; })[0];
  let proxHtml = '';
  if (prox) {
    const dd = diasEntre(h, prox.venc);
    proxHtml = '<section class="bloco c-prox so-pc"><span class="rotulo">Próxima a vencer</span>' +
      '<div class="c-prox-linha"><b>' + esc(prox.c.nome) + '</b><b>' + dinheiro(faltaDaConta(prox.c, mes)) + '</b></div>' +
      '<small>' + (dd < 0 ? 'Venceu há ' + quantosDias(-dd) : dd === 0 ? 'Vence hoje' : dd === 1 ? 'Vence amanhã' : 'Vence em ' + quantosDias(dd) + ' · dia ' + prox.c.dia) + '</small>' +
      '<button class="btn contorno" data-acao="' + acaoDePagar(prox.c, mes) + '" data-ref="' + esc(refDePagar(prox.c, mes)) + '">Paguei ' + esc(prox.c.nome) + '</button></section>';
  }
  return '<div class="tela-grade contas"><section class="bloco he">' +
      '<span class="rotulo">Falta pagar</span>' +
      '<div class="numero-grande">' + numeroGrande(n.contasFalta) + '</div>' +
      '<p class="frase">' + contasPorPagar(mes).length + ' de ' + vistas.length + ' contas por pagar este mês.' +
        (atrasadas.length === 1 ? ' E 1 de mês passado.' : atrasadas.length ? ' E ' + atrasadas.length + ' de meses passados.' : '') + '</p>' +
    '</section>' +
    proxHtml +
    (linhasAtrasadas ? '<section class="bloco c-atras" data-paginar=".lista-pag" data-chave="atras"><h2 class="secao"><span class="rotulo">De meses passados</span></h2><div class="lista-pag">' + linhasAtrasadas + '</div></section>' : '') +
    '<section class="bloco c-todas" data-paginar=".lista-pag" data-chave="contas"><h2 class="secao"><span class="rotulo">Todas as contas</span>' +
      '<button class="btn pequeno" data-acao="nova-conta">Nova conta</button></h2>' +
      (linhas ? '<div class="lista-pag grade-cartoes">' + linhas + '</div>' : '<p class="vazio">Nenhuma conta fixa cadastrada. Comece pelas que se repetem todo mês: aluguel, luz, água, internet.</p>') +
    '</section></div>';
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
    corpo += '<div class="pessoa-cartao"><h2 class="secao"><span class="nome-pessoa">' + esc(nome) + '</span></h2>' + linhas + '</div>';
  }

  return '<div class="tela-grade pessoas"><section class="bloco he">' +
      '<span class="rotulo">Têm a devolver a você</span>' +
      '<div class="numero-grande">' + numeroGrande(n.aReceber) + '</div>' +
      '<p class="frase">Este dinheiro não entra no que sobrou — enquanto não voltar, não é seu para gastar.</p>' +
    '</section>' +
    '<section class="bloco p-deve"><h2 class="secao"><span class="rotulo">Você deve</span>' +
      '<span class="numero-medio" style="margin:0">' + numeroMedio(n.euDevo) + '</span></h2>' +
      '<div style="display:flex;gap:10px;margin-top:12px">' +
        '<button class="btn" style="flex:1" data-acao="novo-emprestimo" data-ref="emprestei">Emprestei a alguém</button>' +
        '<button class="btn" style="flex:1" data-acao="novo-emprestimo" data-ref="peguei">Peguei com alguém</button>' +
      '</div></section>' +
    (corpo ? '<section class="bloco p-todas" data-paginar=".lista-pag" data-chave="pessoas"><div class="lista-pag grade-cartoes">' + corpo + '</div></section>'
      : '<section class="bloco p-todas"><p class="vazio">Nenhum empréstimo anotado.</p></section>') + '</div>';
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
  // A legenda das cores (10/11): é aqui que ele aprende que azul é casa e damasco é comida.
  const legenda = '<p class="frase" style="margin-top:4px">Cada família de gasto tem uma cor, para achar na lista de relance:</p>' +
    '<div class="legenda-cor">' + FAMILIAS.map(function (f) { return '<span><i class="cor-' + f[0] + '"></i>' + f[1] + '</span>'; }).join('') +
    '<span><i style="background:rgba(var(--tinta-rgb),.12)"></i>O resto</span></div>';
  return blocoAjuste('Suas categorias', legenda +
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

let digitos = '', emEdicao = null, categoriaEscolhida = false, valorDaFrase = false, tipoFolha = 'saida', dataLivre = true;

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

/** O resumo da noite (04/11): das 18h às 5h, a fala do Vero conta o dia numa frase.
    Calculado aqui, sem IA. Ganho primeiro e nunca castigo: quem leva bronca do app
    pára de olhar para ele (o "efeito avestruz" das finanças). Antes das 5h é o dia
    de ontem, porque o turno dele vai da meia-noite às 3h. */
function resumoDaNoite() {
  const agora = new Date(), h = agora.getHours();
  if (h >= 5 && h < 18) return null;
  const base = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - (h < 5 ? 1 : 0));
  const dia = iso(base), quando = h < 5 ? 'Ontem' : 'Hoje';
  const doDia = lancamentosVistos().filter(function (l) { return l.data === dia; });
  if (!doDia.length) return quando + ' ainda não tem lançamento. Se entrou ou saiu alguma coisa, é só me contar aqui.';
  const r = resumoEntre(dia, dia), ficou = r.entradas - r.saidas;
  const curto = function (c) { return dinheiro(c).replace(/,00$/, ''); };

  // A semana: os seis dias antes deste, só os que têm lançamento.
  const outros = [];
  for (let i = 1; i <= 6; i++) {
    const d = iso(new Date(base.getFullYear(), base.getMonth(), base.getDate() - i));
    if (lancamentosVistos().some(function (l) { return l.data === d; })) {
      const x = resumoEntre(d, d);
      outros.push(x.entradas - x.saidas);
    }
  }
  let seguidos = 1;
  while (seguidos < 60) {
    const d = iso(new Date(base.getFullYear(), base.getMonth(), base.getDate() - seguidos));
    if (!lancamentosVistos().some(function (l) { return l.data === d; })) break;
    seguidos++;
  }
  const media = outros.length ? outros.reduce(function (a, v) { return a + v; }, 0) / outros.length : 0;
  let extra = '';
  if (ficou > 0 && outros.length >= 2 && outros.every(function (v) { return ficou > v; })) extra = 'Seu melhor dia da semana.';
  else if (ficou > 0 && outros.length >= 3 && ficou > media) extra = 'Acima da sua média da semana.';
  else if (seguidos >= 3) extra = quantosDias(seguidos) + ' seguidos lançando.';

  // Com os valores escondidos ele está na rua: a frase conta o dia sem número nenhum.
  if (S.config.oculto) {
    return (ficou > 0 ? quando + ' sobrou dinheiro.' : quando + ' você lançou ' + doDia.length + (doDia.length === 1 ? ' coisa.' : ' coisas.')) + (extra ? ' ' + extra : '');
  }
  let frase;
  if (!r.entradas) {
    const cat = {};
    doDia.forEach(function (l) { if (l.tipo === 'saida') { const c = categoriaDe(l) || 'Outros'; cat[c] = (cat[c] || 0) + l.centavos; } });
    const maior = Object.keys(cat).sort(function (a, b) { return cat[b] - cat[a]; })[0];
    frase = quando + ' saiu ' + curto(r.saidas) + (maior && maior !== 'Outros' ? ', a maior parte em ' + maior : '') + ', e não entrou nada.';
  } else if (ficou >= 0) {
    frase = quando + ' entrou ' + curto(r.entradas) + (r.saidas ? ' e sobrou ' + curto(ficou) + '.' : ' e nada saiu.');
  } else {
    frase = quando + ' entrou ' + curto(r.entradas) + ' e saiu ' + curto(r.saidas) + ', ' + curto(-ficou) + ' a mais do que entrou.';
  }
  return frase + (extra ? ' ' + extra : '');
}

/** "Fale com o Vero" no Início (04/11): ele nem reparou que a conversa existia, porque
    na v15 era uma pílula fina com cara de busca. Agora é um cartão de conversa, com o
    microfone (ele opera por ditado) e três perguntas prontas para um toque. */
function conversaCartao() {
  // Sempre desenhado: o sync.js pode chegar depois do primeiro desenho, e o cartão sumia.
  const prontas = ['Quanto gastei de gasolina este mês?', 'Quando troquei o pneu?', 'Quanto entrou esta semana?'];
  // O revisor: "tem campo, microfone e chips: é cara de buscador". Conversa tem fala.
  let fala = 'Oi! Pergunte o que quiser sobre o que você lançou. Eu procuro nas datas e respondo.';
  try {
    const hist = JSON.parse(localStorage.getItem('vero.chat') || '[]');
    const ultima = hist.filter(function (m) { return m.role === 'assistant'; }).pop();
    if (ultima && ultima.content) fala = ultima.content.length > 180 ? ultima.content.slice(0, 177) + '…' : ultima.content;
  } catch (e) {}
  const noite = resumoDaNoite();
  return '<section class="bloco conversa-vero">' +
    '<div class="conversa-cabeca"><span class="ico">' + icone('conversa') + '</span>' +
      '<div><h2 class="titulo-cartao">Fale com o Vero</h2><small>Pergunte qualquer coisa sobre o que você lançou.</small></div></div>' +
    '<p class="fala-vero' + (noite ? ' noite' : '') + '" data-acao="perguntar">' +
      (noite ? '<small class="fala-quando">Resumo da noite</small>' + esc(noite) : esc(fala)) + '</p>' +
    '<div class="conversa-campo">' +
      '<input type="text" id="ia-inicio" maxlength="500" autocomplete="off" placeholder="Escreva ou fale a pergunta" aria-label="Sua pergunta ao Vero">' +
      (reconhecedor() ? '<button class="btn microfone" data-acao="ia-ouvir" aria-label="Falar a pergunta"><svg class="traco" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>' : '') +
      '<button class="btn acento" data-acao="ia-enviar">Perguntar</button>' +
    '</div>' +
    '<div class="conversa-prontas">' + prontas.map(function (q) {
      return '<button class="ficha-op" data-acao="ia-pronta" data-ref="' + esc(q) + '">' + esc(q) + '</button>';
    }).join('') + '</div>' +
  '</section>';
}

function enviarPerguntaInicio(t) {
  const c = document.getElementById('ia-inicio');
  t = (t || (c && c.value) || '').trim();
  if (!t) { if (c) c.focus(); return; }
  if (c) c.value = '';
  if (window.veroPerguntarJa) window.veroPerguntarJa(t);
}

function ouvirPergunta() {
  const R = reconhecedor();
  if (!R) return;
  const rec = new R();
  rec.lang = 'pt-BR';
  rec.interimResults = false;
  rec.onresult = function (ev) { enviarPerguntaInicio(ev.results[0][0].transcript); };
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
  document.getElementById('lancar-titulo').textContent = l ? 'Corrigir lançamento' : 'Novo lançamento';
  tipoFolha = l ? l.tipo : 'saida';
  // A conta paga e o empréstimo têm o sentido deles: o tipo não se troca.
  document.getElementById('lancar-tipo').hidden = !!ligado;
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
  // Hoje e Ontem só valem quando cabem no intervalo: na conta paga, só o calendário.
  dataLivre = !(l && l.conta);
  valorDaFrase = false;
  document.getElementById('campo-frase').hidden = !!l;
  document.getElementById('lancar-frase').value = '';
  document.getElementById('frase-dica').textContent = '';
  document.getElementById('lancar-microfone').hidden = !reconhecedor();
  pintarAtalhos(!l);
  pintarValor();
  document.getElementById('folha-lancar').hidden = false;
}
function abrirLancar() { abrirFolha(null); }

/** Pinta a folha inteira a partir do estado: o tipo, o valor, o botão e as fichas. */
function pintarValor() {
  const c = Number(digitos || '0'), saiu = tipoFolha === 'saida';
  document.getElementById('lancar-valor').innerHTML = numeroGrande(c, true);
  document.getElementById('lancar-valor').classList.toggle('zero', !c);
  document.getElementById('lancar-rotulo').textContent = saiu ? 'Quanto saiu' : 'Quanto entrou';
  document.getElementById('lancar-nota').placeholder = saiu ? 'Feira, gasolina, lanche…' : 'Diária, salário, venda…';
  document.getElementById('lancar-frase').placeholder = saiu ? 'Ou escreva: gasolina 50 ontem' : 'Ou escreva: diária 90 hoje';
  document.querySelectorAll('#lancar-tipo [data-tipo]').forEach(function (b) {
    const ativo = b.dataset.tipo === tipoFolha;
    b.classList.toggle('activo', ativo);
    b.setAttribute('aria-pressed', ativo);
  });
  const ok = document.getElementById('lancar-confirmar');
  ok.dataset.lancar = tipoFolha;
  ok.disabled = c === 0;
  ok.textContent = emEdicao ? 'Salvar correção'
    : (saiu ? 'Lançar saída' : 'Lançar entrada') + (c ? ' de ' + dinheiroReal(c) : '');
  pintarFichas();
}

/* Categoria e dia em fichas de um toque (04/11): a lista suspensa e o calendário pediam
   dois toques e um olhar para dizer o que quase sempre é "hoje". O <select> e o <input>
   continuam por baixo como a fonte da verdade, e quem lê a folha não mudou. */
function pintarFichas() {
  const sel = document.getElementById('lancar-categoria'), atual = sel.value;
  let lista = tipoFolha === 'saida' ? CAT_SAIDA.concat(S.categorias) : CAT_ENTRADA.slice();
  if (atual && atual !== '__nova' && !lista.includes(atual)) lista = [atual].concat(lista);
  document.getElementById('chips-categoria').innerHTML = lista.map(function (c) {
    return '<button type="button" class="ficha-op' + (c === atual ? ' activo' : '') + '" data-cat="' + esc(c) + '" aria-pressed="' + (c === atual) + '">' +
      (tipoFolha === 'saida' ? icone(iconeDoGasto(c)) : '') + esc(c) + '</button>';
  }).join('') + '<button type="button" class="ficha-op' + (atual === '__nova' ? ' activo' : '') + '" data-cat="__nova">+ Nova</button>';
  // A escolhida fica à vista: na correção, "Transporte" estava cortada na borda.
  // Depois do quadro: com a folha ainda escondida, as medidas dão zero.
  requestAnimationFrame(function () {
    const ativa = document.querySelector('#chips-categoria .activo');
    if (!ativa) return;
    const caixa = ativa.parentNode, x = ativa.offsetLeft - caixa.offsetLeft;
    if (x < caixa.scrollLeft || x + ativa.offsetWidth > caixa.scrollLeft + caixa.clientWidth) caixa.scrollLeft = Math.max(0, x - 40);
  });

  const data = document.getElementById('lancar-data'), v = data.value, ontem = dataMais(-1);
  const qual = v === hoje() ? 'hoje' : v === ontem ? 'ontem' : 'outro';
  document.getElementById('chips-data').hidden = !dataLivre;
  document.getElementById('chips-data').innerHTML = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['outro', qual === 'outro' && v ? porExtensoData(v) : 'Outro dia']].map(function (d) {
    return '<button type="button" class="ficha-op' + (d[0] === qual ? ' activo' : '') + '" data-dia="' + d[0] + '" aria-pressed="' + (d[0] === qual) + '">' +
      (d[0] === 'outro' ? icone('agenda') : '') + d[1] + '</button>';
  }).join('');
  data.classList.toggle('escondido', dataLivre);
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
    if (c && l.vaga && l.vaga !== c.vaga && l.vaga === vagaDoOutro(c)) {
      const mes = mesDoPagamento(l);
      c.outroPagou = (c.outroPagou || []).filter(function (m) { return m !== mes; });
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
  for (const t of ['lancamentos', 'contas', 'emprestimos', 'agenda']) {
    const A = {}, D = {};
    (a[t] || []).forEach(function (x) { A[x.id] = x; });
    (d[t] || []).forEach(function (x) { D[x.id] = x; });
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

/* ⭐ CONTA DIVIDIDA (10/11, pedido dele: "eu tenho conta fixa junto com a minha mulher, eu
   pago metade e ela paga metade"). A lente é a de quem divide conta (Splitwise e afins): o
   erro comum é lançar só a metade, e aí o app perde o preço real da conta e ninguém sabe se
   a outra parte foi paga. Aqui guarda-se a conta INTEIRA (`total`) e a sua parte fica em
   `centavos`, que é o que sai do seu bolso. Por isso o "Sobrou", o limite do dia, o
   "Paguei" e o atraso não mudam uma linha: todos já liam `centavos`.
   `com` é o nome de quem paga o resto, e `outroPagou` os meses em que essa pessoa já pagou.
   Saber se ela pagou é só registro: o dinheiro dela não entra nas suas contas. */
function eDividida(c) { return !!(c && c.total && c.total > c.centavos); }
function parteDe(total, pct) { return Math.max(1, Math.min(total - 1, Math.round(total * pct / 100))); }
function pctDe(c) { return eDividida(c) ? Math.round(c.centavos / c.total * 100) : 50; }
function nomeOutro(c) { return String(c.com || '').trim() || 'A outra pessoa'; }

function linhaDivisao(c, mes) {
  if (!eDividida(c)) return '';
  const pagou = (c.outroPagou || []).includes(mes), pct = pctDe(c);
  // Na vista de quem paga o resto, a frase vira do lado dela, e o "Paguei" da linha já é dela.
  if (papelNaVista(c) === 'tudo' && vagaDoOutro(c)) {
    return '<span class="divisao">Dividida: ' + esc(nomeDaVaga(c.vaga) || 'Você') + ' ' + dinheiro(c.centavos) + ' · ' +
      esc(nomeOutro(c)) + ' ' + dinheiro(c.total - c.centavos) + '</span>';
  }
  if (papelNaVista(c) === 'outro') {
    return '<span class="divisao">Sua ' + (pct === 50 ? 'metade' : 'parte (' + (100 - pct) + '%)') + ' de ' + dinheiro(c.total) + ' · ' +
      esc(nomeDaVaga(c.vaga) || 'A outra pessoa') + ' paga ' + dinheiro(c.centavos) + '</span>';
  }
  return '<span class="divisao">Sua ' + (pct === 50 ? 'metade' : 'parte (' + pct + '%)') +
    ' de ' + dinheiro(c.total) + ' · ' + esc(nomeOutro(c)) + ' paga ' + dinheiro(c.total - c.centavos) + '</span>' +
    '<button class="btn pequeno fraco outro-pagou' + (pagou ? ' feito' : '') + '" data-acao="outro-pagou" data-ref="' + esc(c.id + '|' + mes) + '" aria-pressed="' + pagou + '">' +
      (pagou ? icone('certo') + esc(nomeOutro(c)) + ' pagou' : 'Marcar que ' + esc(nomeOutro(c)) + ' pagou') + '</button>';
}

/** Quem mais aparece nas contas divididas: a próxima já nasce com esse nome. */
function nomeMaisUsado() {
  const n = {};
  S.contas.forEach(function (c) { if (eDividida(c) && c.com) n[c.com] = (n[c.com] || 0) + 1; });
  return Object.keys(n).sort(function (a, b) { return n[b] - n[a]; })[0] || '';
}

function camposDivisao(c) {
  const ligada = eDividida(c), pct = pctDe(c);
  const opcoes = [[50, 'Metade'], [40, '40%'], [60, '60%'], [30, '30%'], [70, '70%']];
  if (!opcoes.some(function (o) { return o[0] === pct; })) opcoes.push([pct, pct + '%']);
  return '<label class="campo-marcar"><input type="checkbox" id="c-divide"' + (ligada ? ' checked' : '') + '>' +
      '<span>Divido esta conta com alguém</span></label>' +
    '<div id="c-divisao"' + (ligada ? '' : ' hidden') + '>' +
      '<label class="campo"><span class="rotulo">Com quem</span><input type="text" id="c-com" maxlength="40" placeholder="nome da pessoa" autocomplete="off"></label>' +
      '<label class="campo"><span class="rotulo">Sua parte</span><select id="c-pct">' +
        opcoes.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === pct ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select></label>' +
      '<p class="frase" id="c-conta-divisao"></p>' +
    '</div>';
}

/** Liga a caixa e o resumo ao vivo: o valor do formulário é sempre a conta INTEIRA. */
function ligarDivisao(c) {
  const caixa = document.getElementById('c-divide'), bloco = document.getElementById('c-divisao');
  const com = document.getElementById('c-com'), pct = document.getElementById('c-pct'), valor = document.getElementById('c-valor');
  if (!caixa || !bloco || !com || !pct || !valor) return;
  com.value = (c && c.com) || nomeMaisUsado();
  const resumo = function () {
    const total = lerValor('c-valor');
    const minha = total > 1 ? parteDe(total, Number(pct.value)) : 0;
    const saida = document.getElementById('c-conta-divisao');
    if (saida) saida.textContent = total > 1
      ? 'Você paga ' + dinheiroReal(minha) + '. ' + (com.value.trim() || 'A outra pessoa') + ' paga ' + dinheiroReal(total - minha) + '. Só a sua parte entra no que sobrou.'
      : 'Escreva acima o valor da conta inteira.';
  };
  caixa.addEventListener('change', function () { bloco.hidden = !caixa.checked; resumo(); });
  [com, pct, valor].forEach(function (x) { x.addEventListener('input', resumo); x.addEventListener('change', resumo); });
  resumo();
}

/** O que o formulário diz, em centavos: {centavos, total, com}. Sem divisão, total = 0. */
function lerDivisao() {
  const total = lerValor('c-valor');
  const caixa = document.getElementById('c-divide');
  if (!total) return null;
  if (!caixa || !caixa.checked || total < 2) return { centavos: total, total: 0, com: '' };
  return { centavos: parteDe(total, Number(document.getElementById('c-pct').value || 50)), total: total,
    com: document.getElementById('c-com').value.trim().slice(0, 40) };
}
function aplicarDivisao(c, d) {
  c.centavos = d.centavos;
  if (d.total) { c.total = d.total; c.com = d.com; c.outroPagou = c.outroPagou || []; }
  // ⚠️ Desfazer a divisão manda total = valor, nunca nulo: nulo é o que um celular com a
  // versão antiga manda, e o banco ignora-o para não apagar a divisão marcada no outro.
  else if (c.total) { c.total = d.centavos; c.com = ''; c.outroPagou = []; }
}

function marcarOutroPagou(ref) {
  const p = String(ref).split('|'), c = S.contas.find(function (x) { return x.id === p[0]; });
  if (!c || !p[1]) return;
  const mes = p[1], ja = (c.outroPagou || []).includes(mes);
  /* 10/11 noite (achado da revisão): na v36 a parte do outro pesa no Total e na vista dele,
     logo marcar "pagou" sem lançamento fazia R$ 500 aparecerem do nada no Sobrou. Quando o
     outro tem carteira na casa, a marca leva junto a SAÍDA na carteira dele, ligada à conta;
     desmarcar tira as duas. Sem carteira, continua só registro, como na v35. */
  const vagaB = vagaDoOutro(c), dela = papelNaVista(c) === 'outro';
  const texto = ja ? (dela ? 'Sua parte de ' + nomeDoMes(mes) + ' voltou a por pagar' : 'Desmarcado')
    : (dela ? 'Sua parte de ' + nomeDoMes(mes) + ': paga' : nomeOutro(c) + ' pagou a parte de ' + nomeDoMes(mes));
  comDesfazer(texto, function () {
    const lista = (c.outroPagou || []).filter(function (m) { return m !== mes; });
    if (!ja) lista.push(mes);
    c.outroPagou = lista.sort();
    if (vagaB && ja) {
      S.lancamentos = S.lancamentos.filter(function (l) { return !(l.conta === c.id && l.vaga === vagaB && mesDoPagamento(l) === mes); });
    } else if (vagaB) {
      const l = { id: id(), tipo: 'saida', centavos: parteDoOutro(c), data: hoje(), nota: c.nome, conta: c.id, emprestimo: null, em: Date.now(), vaga: vagaB };
      if (mes !== mesDe(hoje())) l.origem = 'mes:' + mes;
      S.lancamentos.push(l);
    }
    guardar();
  });
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
    campoValor('c-valor', 'Quanto é a conta inteira') +
    '<label class="campo"><span class="rotulo">Vence todo dia</span><input type="number" id="c-dia" min="1" max="31"></label>' +
    camposDivisao(c) +
    campoDono('c-dono', c.vaga || minhaVaga()) +
    botaoAgenda(linkAgendaConta(c)) +
    botaoApagar('apagar-conta', c.id, 'Apagar esta conta'),
    function () {
      const nome = document.getElementById('c-nome').value.trim();
      const div = lerDivisao();
      const dia = Math.min(31, Math.max(1, Number(document.getElementById('c-dia').value || c.dia)));
      if (!nome || !div) return;
      // ⚠️ Procurar de novo: se o outro celular lançou com a folha aberta, a sincronização
      // trocou os objetos e esta correcção ia para um que já não existe.
      const atual = S.contas.find(function (x) { return x.id === ref; });
      if (!atual) { fecharFolhas(); desenhar(); return; }
      const antes = JSON.stringify(S);
      atual.nome = nome; atual.dia = dia; atual.vaga = lerDono('c-dono', atual.vaga);
      aplicarDivisao(atual, div);
      guardar(); fecharFolhas(); desenhar();
      oferecerDesfazer('Conta corrigida', reporDe(antes));
    });
  document.getElementById('c-nome').value = c.nome;
  document.getElementById('c-valor').value = ((eDividida(c) ? c.total : c.centavos) / 100).toFixed(2);
  document.getElementById('c-dia').value = c.dia;
  ligarDivisao(c);
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
    campoValor('c-valor', 'Quanto é a conta inteira') +
    '<label class="campo"><span class="rotulo">Vence todo dia</span>' +
    '<input type="number" id="c-dia" min="1" max="31" value="5"></label>' +
    camposDivisao(null) +
    campoDono('c-dono', donoPadrao()),
    function () {
      const nome = document.getElementById('c-nome').value.trim();
      const div = lerDivisao();
      const dia = Math.min(31, Math.max(1, Number(document.getElementById('c-dia').value || 1)));
      if (!nome || !div) return;
      // Conta criada depois do vencimento deste mês só cobra a partir do próximo: a de agora
      // provavelmente já foi paga antes de existir aqui, e viraria atrasada na virada do mês.
      const mes = mesDe(hoje());
      const nova = { id: id(), nome: nome, centavos: div.centavos, dia: dia, ativa: true, pagos: {}, vaga: lerDono('c-dono'),
        desde: dia >= diaDe(hoje()) ? mes : mesSeguinte(mes) };
      aplicarDivisao(nova, div);
      S.contas.push(nova);
      guardar(); fecharFolhas(); desenhar();
    });
  ligarDivisao(null);
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
    campoValor('p-valor', eDividida(c) ? 'Quanto saiu do seu bolso' : 'Quanto saiu') +
    '<p class="frase">Deixe como está se foi ' + dinheiro(c.centavos) + '.' +
      (eDividida(c) ? ' É a sua parte: a conta inteira é ' + dinheiro(c.total) + '.' : '') + '</p>',
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
  for (const a of Array.isArray(d.agenda) ? d.agenda : []) {
    if (!a || !a.id || !dia.test(a.data) || !a.titulo || tem(S.agenda, a)) continue;
    S.agenda.push(a); n++;
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

document.getElementById('lancar-tipo').addEventListener('click', function (ev) {
  const b = ev.target.closest('[data-tipo]');
  if (!b) return;
  tipoFolha = b.dataset.tipo;
  // A categoria de saída não serve a uma entrada: volta a sugerir pela descrição.
  if (!categoriaEscolhida) document.getElementById('lancar-categoria').value = categoriaSugerida(document.getElementById('lancar-nota').value);
  pintarValor();
});
document.getElementById('chips-categoria').addEventListener('click', function (ev) {
  const b = ev.target.closest('[data-cat]');
  if (!b) return;
  const sel = document.getElementById('lancar-categoria');
  // Tocar na escolhida desfaz: a categoria nunca é obrigatória.
  sel.value = sel.value === b.dataset.cat ? '' : b.dataset.cat;
  categoriaEscolhida = true;
  document.getElementById('campo-nova').hidden = sel.value !== '__nova';
  if (sel.value === '__nova') document.getElementById('lancar-nova').focus();
  pintarFichas();
});
document.getElementById('chips-data').addEventListener('click', function (ev) {
  const b = ev.target.closest('[data-dia]');
  if (!b) return;
  const data = document.getElementById('lancar-data');
  if (b.dataset.dia === 'hoje') data.value = hoje();
  else if (b.dataset.dia === 'ontem') data.value = dataMais(-1);
  else {
    // O calendário do próprio aparelho; onde não abre sozinho, o campo aparece.
    data.classList.remove('escondido');
    try { data.showPicker(); } catch (e) { data.focus(); }
    return;
  }
  pintarFichas();
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
    case 'outro-pagou':     return marcarOutroPagou(ref);
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
    case 'repetir':         return repetirLancamento(ref);
    case 'apagar-direto':   return comDesfazer('Lançamento apagado', function () { removerLancamento(ref); });
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
    case 'ia-enviar':       return enviarPerguntaInicio();
    case 'ia-pronta':       return enviarPerguntaInicio(ref);
    case 'ia-ouvir':        return ouvirPergunta();
    case 'inicio-vista':
      inicioVista = ref;
      return desenhar();
    case 'inicio-filtro':
      inicioFiltro = ref;
      return desenhar();
    case 'dia-abrir':       return abrirDia(ref);
    case 'cal-mes':         return mudarMesCal(ref);
    case 'apagar-lembrete': return apagarLembrete(ref);
    case 'dia-ver':
      fecharFolhas();
      calMes = null;
      inicioVista = ref === hoje() ? 'hoje' : 'dia';
      inicioDia = ref;
      desenhar();
      return window.scrollTo(0, 0);
    case 'inicio-abrir-dia':
      inicioVista = ref === hoje() ? 'hoje' : 'dia';
      inicioDia = ref;
      desenhar();
      return window.scrollTo(0, 0);
    // Do Início, a ficha leva a Gastos já filtrado por aquele destino.
    case 'roda-proximo':    return avancarRoda();
    case 'pagina': {
      const pr = ref.split('|');
      paginaDe[pr[0]] = Number(pr[1]);
      const cx = document.querySelector('[data-chave="' + pr[0] + '"]');
      return cx ? paginar(cx) : undefined;
    }
    case 'ver-destino':
      buscaTexto = ref;
      location.hash = '#/gastos';
      return;
    case 'filtrar':
      paginaDe.lanc = 0;
      buscaTexto = ref;
      desenhar();
      return document.getElementById('busca').scrollIntoView({ block: 'start' });
    case 'tema':            return trocarTema();
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
    paginaDe.lanc = 0;
    paginarTudo();
  } else if (ev.target.id === 'lancar-frase') {
    preencherDaFrase(ev.target.value);
  } else if (ev.target.id === 'lancar-nota' && !categoriaEscolhida) {
    document.getElementById('lancar-categoria').value = categoriaSugerida(ev.target.value);
    pintarFichas();
  }
});
document.addEventListener('change', function (ev) {
  if (ev.target.id === 'inicio-dia') {
    if (!ev.target.value) return;
    inicioDia = ev.target.value;
    inicioVista = inicioDia === hoje() ? 'hoje' : 'dia';
    return desenhar();
  }
  if (ev.target.id === 'lancar-data') return pintarFichas();
  if (ev.target.id !== 'lancar-categoria') return;
  categoriaEscolhida = true;
  document.getElementById('campo-nova').hidden = ev.target.value !== '__nova';
});

window.addEventListener('hashchange', function () { desenhar(); });

// No computador, Esc fecha a folha aberta.
document.addEventListener('keydown', function (ev) {
  if (ev.key === 'Escape') fecharFolhas();
  if (ev.key === 'Enter' && ev.target && ev.target.id === 'ia-inicio') enviarPerguntaInicio();
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
// (as provas correm num sandbox sem relógio: daí o typeof)
if (typeof setInterval === 'function') setInterval(function () { const r = document.documentElement; if ((S.config.tema || 'auto') === 'auto' && r && r.dataset && r.dataset.tema !== temaAgora()) desenhar(); }, 60000);
let diaPintado = hoje();
document.addEventListener('visibilitychange', function () {
  if (!document.hidden && hoje() !== diaPintado) { diaPintado = hoje(); desenhar(); }
});

if (!location.hash) location.hash = '#/inicio';
desenhar();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(function () { /* abre igual sem isto */ });
}
