#!/usr/bin/env node
/*
 * LeiteFácil — teste de equivalência das regras de cio (app x função das 7h)
 * ---------------------------------------------------------------------------
 * A função avisos-diarios roda no Supabase e não consegue usar o código do index.html, então as regras de cio
 * foram copiadas para o arquivo supabase/functions/avisos-diarios/index.ts. Este teste garante que a cópia
 * continua IGUAL ao original: ele abre os dois arquivos, roda as regras do app e as da função com os mesmos
 * dados (milhares de rebanhos fictícios, gerados de forma repetível) e falha se qualquer resposta for diferente.
 *
 * Como rodar: `node testes/testar-equivalencia-cio.js` (Node 22.13 ou mais novo; o aviso
 * "ExperimentalWarning" que aparece é normal). Não precisa instalar nada.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const mod = require('module');

const RAIZ = path.join(__dirname, '..');
const CAMINHO_INDEX = path.join(RAIZ, 'index.html');
const CAMINHO_FUNCAO = path.join(RAIZ, 'supabase', 'functions', 'avisos-diarios', 'index.ts');
process.removeAllListeners('warning');

// ---------- as duas implementações ----------
function extrairTrecho(codigo, nome){
  let inicio = codigo.indexOf('function ' + nome + '(');
  const ehFuncao = inicio !== -1;
  if(!ehFuncao){
    inicio = codigo.indexOf('const ' + nome + ' ');
    if(inicio === -1) inicio = codigo.indexOf('const ' + nome + '=');
  }
  if(inicio === -1) throw new Error('Não encontrei "' + nome + '" no index.html (foi renomeada ou removida?).');
  if(ehFuncao){
    const inicioChave = codigo.indexOf('{', inicio);
    let prof = 0, i = inicioChave;
    for(; i < codigo.length; i++){
      if(codigo[i] === '{') prof++;
      else if(codigo[i] === '}'){ prof--; if(prof === 0){ i++; break; } }
    }
    return codigo.slice(inicio, i);
  }
  let prof = 0, i = inicio;
  for(; i < codigo.length; i++){
    const c = codigo[i];
    if(c === '{' || c === '[' || c === '(') prof++;
    else if(c === '}' || c === ']' || c === ')') prof--;
    else if(c === ';' && prof === 0){ i++; break; }
  }
  return codigo.slice(inicio, i);
}

const NOMES = [
  'DIAS_GESTACAO', 'DIAS_CICLO_ESTRO', 'MARCOS_CONFERENCIA_CIO', 'CICLO_COMPLETO_MIN_DIAS', 'CICLO_COMPLETO_MAX_DIAS',
  'MIN_INTERVALOS_MEDIA_CIO', 'DIAS_LISTA_CIOS_OBSERVAR', 'MAX_CICLOS_PROJETADOS_CIO', 'TIPOS_RELEVANTES_REPRO', 'DIAS_SEMANA_PT',
  'diasEntre', 'somarDias', 'nomeDiaSemana', 'chaveRespostaCio', 'mapaRespostasCio', 'situacaoGestacaoCobertura',
  'ordenarEventosReprodutivos', 'calcularIntervaloCioVaca', 'situacaoCicloVaca', 'calcularCiosParaObservar',
  'rotuloDataCioObservar', 'textoCioParaObservar'
];
const FUNCOES_COMPARADAS = ['calcularIntervaloCioVaca', 'situacaoCicloVaca', 'calcularCiosParaObservar', 'textoCioParaObservar', 'rotuloDataCioObservar'];
const CONSTANTES_COMPARADAS = NOMES.filter(n => /^[A-Z_]+$/.test(n));

function carregarApp(){
  const html = fs.readFileSync(CAMINHO_INDEX, 'utf8');
  const codigo = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(NOMES.map(n => extrairTrecho(codigo, n)).join('\n\n') + '\nthis.__x = { ' + NOMES.join(', ') + ' };', sandbox);
  return sandbox.__x;
}

function carregarFuncao(){
  const ts = fs.readFileSync(CAMINHO_FUNCAO, 'utf8').replace(/^import .*$/mg, '');
  const js = mod.stripTypeScriptTypes(ts);
  return new Function('Deno', js + '\nreturn { ' + NOMES.join(', ') + ' };')({ serve(){}, env: { get(){ return undefined; } } });
}

const APP = carregarApp();
const FUNCAO = carregarFuncao();

// ---------- pequeno framework de asserção ----------
let total = 0, falhas = 0;
function verificar(descricao, obtido, esperado){
  total++;
  if(JSON.stringify(obtido) !== JSON.stringify(esperado)){
    falhas++;
    console.log('❌ ' + descricao);
    console.log('   app:    ' + JSON.stringify(esperado));
    console.log('   função: ' + JSON.stringify(obtido));
  } else console.log('✅ ' + descricao);
}

// ---------- gerador de rebanhos fictícios (repetível: mesma semente, mesmos dados) ----------
function gerador(semente){
  let x = semente >>> 0;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
}
const TIPOS = ['cio', 'cio', 'cio', 'cobertura', 'cobertura', 'parto', 'aborto', 'inducao_lactacao', 'secagem'];

function sortearRebanho(rnd, hoje){
  const nVacas = 1 + Math.floor(rnd() * 6);
  const animais = [], eventos = [], respostas = [];
  let idEvento = 1;
  for(let v = 1; v <= nVacas; v++){
    animais.push({ id: v, identificacao: String(Math.floor(rnd() * 900) + 1) });
    const n = Math.floor(rnd() * 8);
    // às vezes uma sequência regular de cios (ciclos de 17 a 25 dias), para exercitar a média do ciclo da vaca
    let data = -Math.floor(rnd() * 120);
    const ciclo = 17 + Math.floor(rnd() * 9);
    for(let k = 0; k < n; k++){
      const regular = rnd() < 0.5;
      const tipo = regular ? 'cio' : TIPOS[Math.floor(rnd() * TIPOS.length)];
      const e = { id: idEvento++, animal_id: v, tipo, data: FUNCAO.somarDias(hoje, data) };
      if(tipo === 'cobertura' && rnd() < 0.25) e.diagnostico_gestacao = rnd() < 0.5 ? 'prenhe' : 'vazia';
      eventos.push(e);
      if(tipo === 'cobertura' && rnd() < 0.4){ // resposta "não" a uma das conferências
        respostas.push({ cobertura_id: e.id, marco: rnd() < 0.5 ? 21 : 42, resposta: 'nao' });
      }
      // próximo evento: ciclo regular, intervalo aleatório ou, de vez em quando, no mesmo dia
      data += regular ? ciclo : (rnd() < 0.15 ? 0 : 1 + Math.floor(rnd() * 40));
    }
  }
  // a lista chega embaralhada: as duas implementações precisam ordenar por conta própria
  for(let i = eventos.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [eventos[i], eventos[j]] = [eventos[j], eventos[i]]; }
  return { animais, eventos, respostas };
}

console.log('--- constantes copiadas ---');
CONSTANTES_COMPARADAS.forEach(n => verificar('constante ' + n + ' igual no app e na função', FUNCAO[n], APP[n]));

console.log('\n--- as mesmas respostas com os mesmos dados ---');
const DATAS_HOJE = ['2026-11-02', '2026-11-03', '2026-11-08', '2026-12-31', '2027-03-01'];
const CENARIOS_POR_DATA = 1500;
const diferencas = { calcularIntervaloCioVaca: 0, situacaoCicloVaca: 0, calcularCiosParaObservar: 0, textos: 0 };
let primeiraDiferenca = null;
let cenarios = 0, comItens = 0;
const rnd = gerador(20261106);
DATAS_HOJE.forEach(hoje => {
  for(let i = 0; i < CENARIOS_POR_DATA; i++){
    const { animais, eventos, respostas } = sortearRebanho(rnd, hoje);
    cenarios++;
    const porVaca = {};
    eventos.forEach(e => { (porVaca[e.animal_id] = porVaca[e.animal_id] || []).push(e); });
    animais.forEach(a => {
      const evs = porVaca[a.id] || [];
      const x = JSON.stringify(APP.calcularIntervaloCioVaca(evs)), y = JSON.stringify(FUNCAO.calcularIntervaloCioVaca(evs));
      if(x !== y){ diferencas.calcularIntervaloCioVaca++; primeiraDiferenca = primeiraDiferenca || { regra: 'calcularIntervaloCioVaca', app: x, funcao: y }; }
      const sx = JSON.stringify(APP.situacaoCicloVaca(evs, hoje)), sy = JSON.stringify(FUNCAO.situacaoCicloVaca(evs, hoje));
      if(sx !== sy){ diferencas.situacaoCicloVaca++; primeiraDiferenca = primeiraDiferenca || { regra: 'situacaoCicloVaca', app: sx, funcao: sy }; }
    });
    const lx = APP.calcularCiosParaObservar(animais, eventos, respostas, hoje);
    const ly = FUNCAO.calcularCiosParaObservar(animais, eventos, respostas, hoje);
    if(lx.length) comItens++;
    if(JSON.stringify(lx) !== JSON.stringify(ly)){ diferencas.calcularCiosParaObservar++; primeiraDiferenca = primeiraDiferenca || { regra: 'calcularCiosParaObservar', app: JSON.stringify(lx), funcao: JSON.stringify(ly) }; }
    // janela diferente da padrão também precisa bater
    if(JSON.stringify(APP.calcularCiosParaObservar(animais, eventos, respostas, hoje, 14)) !== JSON.stringify(FUNCAO.calcularCiosParaObservar(animais, eventos, respostas, hoje, 14))){ diferencas.calcularCiosParaObservar++; }
    lx.forEach((item, k) => {
      if(!ly[k]) return; // listas de tamanhos diferentes já foram contadas acima
      if(APP.textoCioParaObservar(item) !== FUNCAO.textoCioParaObservar(ly[k])){ diferencas.textos++; primeiraDiferenca = primeiraDiferenca || { regra: 'textoCioParaObservar', app: APP.textoCioParaObservar(item), funcao: FUNCAO.textoCioParaObservar(ly[k]) }; }
    });
  }
});
verificar(cenarios + ' rebanhos: duração do ciclo de cada vaca igual', diferencas.calcularIntervaloCioVaca, 0);
verificar(cenarios + ' rebanhos: situação de cada vaca no ciclo igual', diferencas.situacaoCicloVaca, 0);
verificar(cenarios + ' rebanhos: lista de vacas a observar igual (datas, tipo, ordem)', diferencas.calcularCiosParaObservar, 0);
verificar(cenarios + ' rebanhos: texto de cada item igual', diferencas.textos, 0);
verificar('os cenários sorteados realmente têm vacas na lista (o teste não está vazio)', comItens > cenarios * 0.2, true);
if(primeiraDiferenca) console.log('   primeira diferença encontrada: ' + JSON.stringify(primeiraDiferenca));

console.log('\n--- casos conhecidos (a resposta certa está escrita aqui, não só comparada) ---');
const H = '2026-11-02';
const d = n => FUNCAO.somarDias(H, n);
const caso = (animais, eventos, respostas) => ({
  app: APP.calcularCiosParaObservar(animais, eventos, respostas, H).map(i => [i.animalId, i.tipo, i.dataPrevista]),
  funcao: FUNCAO.calcularCiosParaObservar(animais, eventos, respostas, H).map(i => [i.animalId, i.tipo, i.dataPrevista])
});
let c = caso([{ id: 1, identificacao: '9' }], [{ id: 1, animal_id: 1, tipo: 'cio', data: d(-60) }, { id: 2, animal_id: 1, tipo: 'cio', data: d(-40) }, { id: 3, animal_id: 1, tipo: 'cio', data: d(-20) }], []);
verificar('vaca com ciclo de 20 dias: previsão hoje (e não em 1 dia, como seria com 21 fixos)', [c.app, c.funcao], [[[1, 'ciclo', d(0)]], [[1, 'ciclo', d(0)]]]);
c = caso([{ id: 1, identificacao: '9' }], [{ id: 7, animal_id: 1, tipo: 'cobertura', data: d(-16) }], []);
verificar('coberta há 16 dias: retorno aos 21 dias daqui a 5 dias', [c.app, c.funcao], [[[1, 'retorno', d(5)]], [[1, 'retorno', d(5)]]]);
c = caso([{ id: 1, identificacao: '9' }], [{ id: 7, animal_id: 1, tipo: 'cobertura', data: d(-16) }], [{ cobertura_id: 7, marco: 21, resposta: 'nao' }]);
verificar('coberta que já respondeu "não": fora da lista nos dois', [c.app, c.funcao], [[], []]);

console.log('\n' + '-'.repeat(50));
console.log(total + ' verificações, ' + falhas + ' falha(s).');
if(falhas){
  console.log('\nAs regras de cio do app e as da função das 7h deixaram de coincidir. Corrija a cópia em');
  console.log('supabase/functions/avisos-diarios/index.ts (ou o app) para as duas darem a mesma data.');
}
process.exit(falhas ? 1 : 0);
