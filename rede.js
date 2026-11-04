/* A rede neural da página da SAS, no fundo do Vero (04/11).
   Ordem dele: "deixa o app com conexões neurais, como se fosse da minha página,
   como se fosse um braço do outro". É o mesmo desenho da página (sas-ads-advocacia,
   dobras 2 a 5), com os mesmos números que ele aprovou lá:
   · um nó por célula de 136 px, posto por um hash da célula, nunca ao acaso — a rede
     não salta quando a janela muda de tamanho;
   · tinta creme 242,235,210;
   · em repouso, um CHÃO fraco (ligações a 0,045) — a versão forte e permanente foi
     recusada na página por "ler como papel de parede";
   · onde o cursor (ou o dedo) passa, a rede acende: nós a 0,34, ligações a 0,17.
   Fica POR TRÁS dos cartões: só aparece nas margens e nos vãos, como na página.
   Custo: um canvas do tamanho da janela, DPR no máximo 1,5, e desenha só quando algo
   muda (mexer o rato, rolar, redimensionar). Nada corre parado. */
(function () {
  const reduzido = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CEL = 136, LIGA = 136 * 1.35, RAIO = 260;
  const TINTA = '242,235,210';
  const C = { aNoMin: 0.07, aLigMin: 0.045, aNo: 0.34, aLig: 0.17 };

  const cv = document.createElement('canvas');
  cv.className = 'rede-neural';
  cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(cv);
  const ctx = cv.getContext('2d');
  let larg = 0, alt = 0, nos = [], px = -9999, py = -9999, pedido = 0;

  // O mesmo nó para a mesma célula, sempre (hash inteiro, sem Math.random).
  function hash(i, j, s) {
    let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function montar() {
    larg = window.innerWidth; alt = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    cv.width = Math.round(larg * dpr); cv.height = Math.round(alt * dpr);
    cv.style.width = larg + 'px'; cv.style.height = alt + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nos = [];
    for (let i = -1; i <= Math.ceil(larg / CEL); i++) {
      for (let j = -1; j <= Math.ceil(alt / CEL); j++) {
        nos.push({ x: (i + 0.15 + hash(i, j, 1) * 0.7) * CEL, y: (j + 0.15 + hash(i, j, 2) * 0.7) * CEL, r: 1 + hash(i, j, 3) * 1.2 });
      }
    }
    pedir();
  }

  // Quanto a rede acende num ponto: 1 junto do cursor, 0 longe dele.
  function perto(x, y) {
    const d = Math.hypot(x - px, y - py);
    return d >= RAIO ? 0 : 1 - d / RAIO;
  }

  function desenhar() {
    pedido = 0;
    ctx.clearRect(0, 0, larg, alt);
    ctx.lineWidth = 1;
    for (let a = 0; a < nos.length; a++) {
      const A = nos[a];
      for (let b = a + 1; b < nos.length; b++) {
        const B = nos[b], d = Math.hypot(A.x - B.x, A.y - B.y);
        if (d > LIGA) continue;
        const f = 1 - d / LIGA;
        const acende = Math.max(perto(A.x, A.y), perto(B.x, B.y));
        const al = f * (C.aLigMin + (C.aLig - C.aLigMin) * acende);
        if (al < 0.01) continue;
        ctx.strokeStyle = 'rgba(' + TINTA + ',' + al.toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      }
    }
    for (let a = 0; a < nos.length; a++) {
      const A = nos[a], al = C.aNoMin + (C.aNo - C.aNoMin) * perto(A.x, A.y);
      ctx.fillStyle = 'rgba(' + TINTA + ',' + al.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(A.x, A.y, A.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function pedir() { if (!pedido) pedido = requestAnimationFrame(desenhar); }

  window.addEventListener('resize', montar);
  if (!reduzido) {
    window.addEventListener('pointermove', function (ev) { px = ev.clientX; py = ev.clientY; pedir(); }, { passive: true });
    window.addEventListener('pointerdown', function (ev) { px = ev.clientX; py = ev.clientY; pedir(); }, { passive: true });
    document.addEventListener('pointerleave', function () { px = py = -9999; pedir(); });
  }
  // Para o laboratório de fotos acender a rede sem rato (_stitch/lab/foto.html?m=x,y).
  window.veroRedeEm = function (x, y) { px = x; py = y; pedir(); };
  montar();
})();
