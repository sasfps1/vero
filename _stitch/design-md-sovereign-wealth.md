---
name: Sovereign Wealth UI
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#45464d'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#40000d'
  on-tertiary-container: '#f23d5c'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffdadb'
  tertiary-fixed-dim: '#ffb2b7'
  on-tertiary-fixed: '#40000d'
  on-tertiary-fixed-variant: '#92002a'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-currency:
    fontFamily: Manrope
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.03em
  display-currency-mobile:
    fontFamily: Manrope
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-xl:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Manrope
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 22px
  body-lg:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  financial-tabular:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.02em
  financial-tabular-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-uppercase:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.06em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.25rem
---

## Brand & Style

Este design system equilibra a precisão analítica institucional com o acolhimento do design digital contemporâneo. Focado em alta renda, investidores e usuários conscientes de suas finanças, o objetivo visual é inspirar controle deliberado, estabilidade e clareza absoluta sobre o patrimônio.

### Atributos da Marca
- **Cerebral & Confiável:** Elimina ruídos visuais e ornamentos desnecessários; cada elemento na tela cumpre uma função informativa ou transacional.
- **Sóbrio & Sofisticado:** Utiliza profundidade tonal com fundos em camadas de slate refinado, evitando o aspecto genérico de ferramentas bancárias tradicionais.
- **Positivo & Orientado a Decisão:** O usuário nunca é repreendido por gastos; status positivos e negativos são apresentados com métricas equilibradas e contraste equilibrado.

### Direção Estética
A estética adotada mescla **Minimalismo Suíço** estruturado em grid rigoroso com **Micro-Camadas Tonais (Tonal Layering)**. Bordas ultrafinas (1px) atuam como delimitadores precisos entre cartões, painéis modulares e tabelas densas, proporcionando uma experiência ergonômica e premium em visualizações analíticas de alta densidade de dados.

## Colors

A arquitetura cromática prioriza clareza analítica em relatórios numéricos, dashboards e gráficos de investimentos.

### Estrutura da Paleta

- **Primária (Slate Profundo / Navy Analítico - `#0f172a` e `#1e293b`):** Responsável por guiar a leitura estrutural, cabeçalhos, métricas de alto impacto, barras de navegação primárias e estados ativos essenciais.
- **Secundária (Esmeralda Positivo - `#10b981`):** Reservada estritamente para influxo financeiro (proventos, receitas salariais, rendimentos acima do benchmark) e confirmações de ações seguras.
- **Terciária (Coral Analítico - `#f43f5e`):** Designada para saídas, estornos pendentes, alertas de liquidez e despesas acima do teto estipulado.
- **Superfícies & Fundos Neutros (`#f8fafc`, `#f1f5f9`, `#ffffff`):** O fundo principal (`#f8fafc`) estabelece contraste suave com a cor de superfície dos cartões (`#ffffff`), enquanto `#f1f5f9` define áreas de suporte, tabelas zebradas e barras de progresso neutras.
- **Texto e Neutros Secundários (`#0f172a`, `#475569`, `#94a3b8`):** Contraste calibrado atendendo aos critérios WCAG AAA para texto em fundos claros.

## Typography

A tipografia do sistema utiliza uma abordagem pareada cirurgicamente:
- **Manrope** organiza títulos, labels de interface, resumos de cartões e texto contínuo com legibilidade fluida e terminação moderna sem ser fria.
- **JetBrains Mono** é implementada para todos os dados quantitativos, montantes (R$), percentuais de rendimento (% a.m./a.a.), código de ativos (ex: *PETR4*, *IVVB11*) e timestamps das transações. Isso garante que colunas em tabelas alinhem perfeitamente pela casa decimal e pela largura monospaçada dos numerais.

### Regras para Notação de Valores (R$)
- O símbolo monetário (`R$`) deve ser formatado com opacidade reduzida (70%) e em tamanho 2px menor em relação ao montante inteiro para direcionar a atenção ao montante principal.
- Valores negativos em despesas recebem o sinal `-` antecedendo o `R$` (ex: `- R$ 420,50`).
- Os centavos mantêm o mesmo baseline e corpo da parte inteira para evitar quebras visuais e ruídos numéricos.

## Layout & Spacing

O sistema segue um grid fluido estruturado em múltiplos de 4px e 8px, projetado para suportar dashboards densos em telas de desktop sem provocar fadiga e manter a usabilidade em dispositivos móveis.

### Grid e Breakpoints
- **Desktop (≥ 1280px):** Grid de 12 colunas com `margin` de 2rem (32px) e `gutter` de 1.25rem (20px). Largura máxima do container principal limitada a 1440px para manter o comprimento de linha ergonômico.
- **Tablet (768px - 1279px):** Grid de 8 colunas com `margin` de 1.5rem (24px) e `gutter` de 1rem (16px). Gráficos complexos e sumários passam de divisão horizontal tripla para empilhamento duplo.
- **Mobile (< 768px):** Grid de 4 colunas com `margin-mobile` de 1rem (16px) e `gutter-mobile` de 0.75rem (12px). Cartões métricos adotam rolagem horizontal (`overflow-x: auto`) com snap-points ou pilhas verticais completas.

### Ritmo Vertical e Respiro de Dados
Espaçamento interno em componentes de exibição financeira exige consistência:
- Cartões analíticos principais aplicam `padding: 1.5rem` (`space-lg`).
- Itens de extrato e linhas tabulares usam `padding-block: 0.75rem` e `padding-inline: 1rem` para manter a densidade legível.

## Elevation & Depth

Para sustentar a sofisticação da interface e evitar o aspecto pesado de sombras tradicionais, o design system utiliza **Contraste de Superfície Tonal combinado a Outlines de Baixo Contraste**.

### Camadas de Profundidade
1. **Canvas Base (Nível 0):** Fundo nativo da aplicação em `#f8fafc`. Sem elevação.
2. **Superfície dos Cartões & Paineis (Nível 1):** Fundo branco absoluto (`#ffffff`) contornado por borda sutil `1px solid rgba(15, 23, 42, 0.06)`. Sombra difusa e quase imperceptível: `0 1px 3px rgba(15, 23, 42, 0.03), 0 1px 2px rgba(15, 23, 42, 0.02)`.
3. **Paineis Elevados & Dropdowns (Nível 2):** Menus de filtros, autocomplete de transações e seletores de conta: `0 8px 24px -4px rgba(15, 23, 42, 0.08), 0 2px 6px -1px rgba(15, 23, 42, 0.04)`. Borda em `1px solid rgba(15, 23, 42, 0.08)`.
4. **Modais e Drawers Transacionais (Nível 3):** Sobreposição direta em `#ffffff` acompanhada por overlay fosco translúcido `rgba(15, 23, 42, 0.4)` com backdrop-blur suave de 4px. Sombra: `0 20px 32px -8px rgba(15, 23, 42, 0.16)`.

## Shapes

O sistema utiliza formas contidas e refinadas com base no padrão `roundedness: 2`, transmitindo rigor técnico com arestas suavizadas.

- **Inputs, Botões e Células Interativas:** Raio de 0.5rem (8px), conferindo estabilidade tátil e foco claro em cliques.
- **Cartões Analíticos, Gráficos e Módulos do Dashboard:** Raio `rounded-lg` de 0.75rem a 1rem (12px - 16px), que cria diferenciação visual suave do fundo geral.
- **Pills, Badges e Tags de Categoria:** Raio completo de 9999px (estilo pílula) exclusivamente para pequenos elementos de categorização, evitando conflito com a estrutura retangular dos blocos de dados.

## Components

### 1. Botões (Buttons)
- **Primary:** Fundo `#0f172a`, texto `#ffffff`, altura de 40px (desktop) / 44px (mobile), cantos 8px. Hover: transição suave para `#1e293b`.
- **Secondary:** Fundo `#ffffff`, borda `1px solid #cbd5e1`, texto `#1e293b`. Hover: fundo `#f1f5f9`.
- **Positive Accent (Adicionar Receita / Aporte):** Fundo com gradiente sutil de esmeralda `#10b981` para `#059669`, texto `#ffffff`, sombra leve esmeralda (`0 2px 8px rgba(16, 185, 129, 0.25)`).

### 2. Cartões de Métricas (Metric Cards)
- Estrutura: Cartão branco com borda `1px solid rgba(15, 23, 42, 0.06)`, padding `space-lg`.
- Topo: Rótulo da métrica em `label-uppercase` com cor `#64748b` e ícone vetorial monocromático em container de 32x32px com fundo `#f1f5f9`.
- Centro: Montante financeiro em `financial-tabular` ou `display-currency`.
- Rodapé: Badge de variação percentual (ex: `+4.8% vs. mês anterior`) com fundo verde esmeralda translúcido (`rgba(16, 185, 129, 0.1)`) e texto `#047857`, ou coral translúcido (`rgba(244, 63, 94, 0.1)`) e texto `#be123c`.

### 3. Tabelas de Transações (Financial Data Tables)
- Cabeçalhos: Tipografia `label-uppercase` com cor `#64748b`, fundo `#f8fafc`, alinhamento à esquerda para descrições e à direita para montantes e datas.
- Linhas: Altura mínima de 48px, separador `1px solid #f1f5f9`. Hover na linha com mudança sutil para `#f8fafc`.
- Exibição de Valores: Alinhamento numérico à direita obrigatório usando `financial-tabular`. Entradas em `#10b981` com sinal positivo explícito (`+ R$ 2.450,00`) e saídas em `#0f172a` ou `#f43f5e` (`- R$ 124,90`).

### 4. Chips e Badges de Categoria
- Altura de 24px, tipografia `financial-tabular-sm`, bordas arredondadas completas (`pill`).
- Fundos suaves: Alimentação (`#fff7ed` / texto `#c2410c`), Investimentos (`#ecfdf5` / texto `#047857`), Moradia (`#eff6ff` / texto `#1d4ed8`), Lazer (`#fdf2f8` / texto `#be185d`).

### 5. Campos de Entrada (Form Inputs)
- Estrutura: Altura de 44px, fundo `#ffffff`, borda `1px solid #cbd5e1`, raio de 8px, tipografia `body-md`.
- Foco: Borda `#0f172a` com anel de foco externo translúcido `box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.1)`.
- Campo de Valor Financeiro: Prefixo `R$` fixo à esquerda em `#64748b`, cursor alinhado e números renderizados em `financial-tabular`.

### 6. Controles de Seleção (Checkboxes & Radios)
- Caixa de 18x18px, raio de 4px (checkbox) ou circular (radio).
- Estado desmarcado: borda `#94a3b8`, fundo `#ffffff`.
- Estado ativo: preenchimento `#0f172a`, ícone de checkmark em `#ffffff`.

### 7. Gráficos de Gastos e Evolução Patrimonial
- **Linhas / Áreas (Patrimônio Líquido):** Traçado principal em `#0f172a` com preenchimento em gradiente vertical decrescente de `rgba(15, 23, 42, 0.08)` para transparente. Pontos de interseção com tooltip flutuante em fundo `#0f172a` e texto mono branco.
- **Barras Comparativas (Receitas vs. Despesas):** Barras pareadas sem cantos excessivamente arredondados (apenas 4px no topo superior). Receita em `#10b981`, Despesa em `#f43f5e` ou `#334155`.
- **Rosca / Alocação de Ativos:** Segmentação sem contornos espessos, separação com espaço vazado de 2px na cor de fundo do cartão, rótulos legendados com percentual em tipografia monospaçada.
