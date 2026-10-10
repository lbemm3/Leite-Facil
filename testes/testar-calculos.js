#!/usr/bin/env node
/*
 * LeiteFácil — testes automatizados das funções de cálculo
 * ----------------------------------------------------------
 * Este script NÃO copia as funções para cá "à mão". Ele abre o próprio
 * index.html, encontra o trecho de código de cada função pelo nome, e roda
 * casos de teste conhecidos contra o código real. Se alguém mudar a lógica
 * de cálculo (mesmo sem querer, mesmo com ajuda de outra IA) e isso mudar o
 * resultado esperado, este script falha e avisa — em vez de o produtor
 * descobrir isso sozinho, meses depois, com o número errado na tela.
 *
 * Como rodar: dentro da pasta do projeto, `node testes/testar-calculos.js`.
 * Não precisa instalar nada (não usa nenhum pacote externo).
 * O GitHub Action (.github/workflows/testes.yml) já roda isto sozinho a
 * cada vez que alguém sobe um index.html novo — este arquivo é o mesmo
 * script, só que rodando na nuvem em vez de na sua máquina.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CAMINHO_INDEX = path.join(__dirname, '..', 'index.html');

function extrairTrecho(codigo, nome){
  let inicio = codigo.indexOf('function ' + nome + '(');
  let ehFuncao = inicio !== -1;
  if(ehFuncao && codigo.slice(Math.max(0, inicio - 6), inicio) === 'async ') inicio -= 6; // funções async
  if(inicio === -1){
    inicio = codigo.indexOf('const ' + nome + ' ');
    if(inicio === -1) inicio = codigo.indexOf('const ' + nome + '=');
  }
  if(inicio === -1){
    throw new Error(
      'Não encontrei "' + nome + '" no index.html.\n' +
      'Isso costuma significar que a função foi renomeada, movida ou removida — ' +
      'confira se essa mudança foi intencional antes de ignorar este erro.'
    );
  }
  if(ehFuncao){
    const inicioChave = codigo.indexOf('{', inicio);
    let profundidade = 0, i = inicioChave;
    for(; i < codigo.length; i++){
      if(codigo[i] === '{') profundidade++;
      else if(codigo[i] === '}'){ profundidade--; if(profundidade === 0){ i++; break; } }
    }
    return codigo.slice(inicio, i);
  }
  // Declaração const (número simples ou objeto literal) — vai até o ";" de fechamento.
  let profundidade = 0, i = inicio;
  for(; i < codigo.length; i++){
    const c = codigo[i];
    if(c === '{' || c === '[' || c === '(') profundidade++;
    else if(c === '}' || c === ']' || c === ')') profundidade--;
    else if(c === ';' && profundidade === 0){ i++; break; }
  }
  return codigo.slice(inicio, i);
}

function carregarFuncoesReais(){
  if(!fs.existsSync(CAMINHO_INDEX)){
    throw new Error('Não encontrei index.html em ' + CAMINHO_INDEX + '. Rode este script a partir da pasta do projeto.');
  }
  const html = fs.readFileSync(CAMINHO_INDEX, 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const codigo = scripts.join('\n');

  const nomes = [
    'DIAS_GESTACAO', 'DIAS_LACTACAO_ATE_SECAGEM', 'DIAS_CICLO_ESTRO',
    'DIAS_BEZERRA_ATE_NOVILHA', 'DIAS_SECA_ANTES_PARTO', 'DIAS_JANELA_REPETICAO_CIO',
    'STATUS_ANIMAL',
    'LIMITE_CCS', 'LIMITE_CBT', 'MINIMO_GORDURA', 'MINIMO_PROTEINA',
    'diasEntre', 'somarDias',
    'calcularLoteAnimal', 'resumoReprodutivoAnimal', 'calcularIndicadoresGrupo1',
    'mediaGeometrica', 'mediaSimples', 'registrosNoPeriodo', 'calcularStatusQualidade',
    'calcularNovoSaldoEstoque', 'calcularGMD',
    'arredondar1', 'montarLinhasCSVProducao', 'buscarTodasAsLinhas'
  ];
  const trechos = nomes.map(n => extrairTrecho(codigo, n));

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(trechos.join('\n\n') + '\nthis.__exportado = { ' + nomes.join(', ') + ' };', sandbox);
  return sandbox.__exportado;
}

// ---------- pequeno framework de asserção, sem dependências ----------
let total = 0, falhas = 0;
function verificar(descricao, obtido, esperado){
  total++;
  const iguais = JSON.stringify(obtido) === JSON.stringify(esperado);
  if(!iguais){
    falhas++;
    console.log('❌ ' + descricao);
    console.log('   esperado: ' + JSON.stringify(esperado));
    console.log('   obtido:   ' + JSON.stringify(obtido));
  } else {
    console.log('✅ ' + descricao);
  }
}
function aproximado(descricao, obtido, esperado, tolerancia){
  total++;
  const dentro = obtido !== null && esperado !== null && Math.abs(obtido - esperado) <= tolerancia;
  const ambosNull = obtido === null && esperado === null;
  if(!dentro && !ambosNull){
    falhas++;
    console.log('❌ ' + descricao);
    console.log('   esperado ≈ ' + esperado + ' (±' + tolerancia + ')');
    console.log('   obtido:    ' + obtido);
  } else {
    console.log('✅ ' + descricao);
  }
}

// ---------- roda os testes ----------
const F = carregarFuncoesReais();
const HOJE = '2026-09-29';

console.log('\n--- diasEntre / somarDias ---');
verificar('diasEntre conta dias corridos entre duas datas', F.diasEntre('2026-01-01', '2026-01-11'), 10);
verificar('somarDias avança a data corretamente', F.somarDias('2026-01-01', 10), '2026-01-11');
verificar('somarDias aceita número negativo (volta no tempo)', F.somarDias('2026-01-11', -10), '2026-01-01');

console.log('\n--- calcularLoteAnimal ---');
verificar('animal sem parto e com menos de 180 dias é bezerra',
  F.calcularLoteAnimal({ data_nascimento: '2026-08-01' }, [], HOJE), 'bezerra');
verificar('animal sem parto e com 180 dias ou mais é novilha',
  F.calcularLoteAnimal({ data_nascimento: '2025-01-01' }, [], HOJE), 'novilha');
verificar('animal sem data de nascimento e sem parto vira novilha (não dá para saber a idade)',
  F.calcularLoteAnimal({ data_nascimento: null }, [], HOJE), 'novilha');
verificar('animal com parto e sem secagem/cobertura recente é lactante',
  F.calcularLoteAnimal({ data_nascimento: '2020-01-01' }, [{ tipo:'parto', data:'2026-06-01' }], HOJE), 'lactante');
verificar('animal com secagem registrada depois do parto é seca',
  F.calcularLoteAnimal({ data_nascimento: '2020-01-01' }, [{ tipo:'parto', data:'2026-01-01' }, { tipo:'secagem', data:'2026-08-01' }], HOJE), 'seca');
verificar('animal coberta de novo, a menos de 60 dias do próximo parto previsto, já é seca mesmo sem secagem lançada',
  F.calcularLoteAnimal({ data_nascimento: '2020-01-01' }, [{ tipo:'parto', data:'2025-08-01' }, { tipo:'cobertura', data:'2025-09-15' }], HOJE), 'seca');

console.log('\n--- resumoReprodutivoAnimal (DEL, IEP, abortos, natimortos — vida toda) ---');
{
  const r1 = F.resumoReprodutivoAnimal([{ tipo:'parto', data:'2026-05-01' }], HOJE);
  verificar('DEL = dias desde o último parto quando não secou depois', r1.del, F.diasEntre('2026-05-01', HOJE));
  verificar('sem 2º parto, IEP fica vazio', r1.iep, null);

  const r2 = F.resumoReprodutivoAnimal([{ tipo:'parto', data:'2025-05-01' }, { tipo:'secagem', data:'2026-01-01' }], HOJE);
  verificar('DEL fica vazio quando já houve secagem depois do parto', r2.del, null);

  const r3 = F.resumoReprodutivoAnimal([{ tipo:'parto', data:'2025-01-01' }, { tipo:'parto', data:'2026-01-01' }], HOJE);
  verificar('IEP = dias entre os dois últimos partos', r3.iep, F.diasEntre('2025-01-01', '2026-01-01'));

  const r4 = F.resumoReprodutivoAnimal([
    { tipo:'cobertura', data:'2024-01-01' },
    { tipo:'aborto', data:'2024-04-01' },
    { tipo:'cobertura', data:'2024-06-01' },
    { tipo:'parto', data:'2025-03-01', natimorto:true },
    { tipo:'cobertura', data:'2025-06-01' },
    { tipo:'parto', data:'2026-03-01', natimorto:false }
  ], HOJE);
  verificar('conta 1 aborto na vida toda', r4.abortos, 1);
  aproximado('taxa de aborto = abortos / (abortos + partos)', r4.taxaAbortoPct, 33.33, 0.1);
  verificar('conta 1 natimorto na vida toda', r4.natimortos, 1);
  aproximado('taxa de natimorto = natimortos / total de partos', r4.taxaNatimortoPct, 50, 0.1);
}

console.log('\n--- calcularIndicadoresGrupo1 (idade ao 1º parto e repetição de cio) ---');
{
  const animais = [
    { id: 1, data_nascimento: '2023-01-01' },              // nasceu na fazenda
    { id: 2, data_nascimento: null }                        // entrou já parida (ex.: Fazenda Experimental)
  ];
  const eventos = [
    { animal_id: 1, tipo:'parto', data:'2025-03-01', observacoes:null },
    { animal_id: 2, tipo:'parto', data:'2024-01-01', observacoes:'Parto anterior à entrada no rebanho (data aproximada)' },
    { animal_id: 1, tipo:'cobertura', data:'2026-06-01' },
    { animal_id: 1, tipo:'cio', data:'2026-06-20' },         // 19 dias depois: repetição
    { animal_id: 2, tipo:'cobertura', data:'2026-01-01' },
    { animal_id: 2, tipo:'cobertura', data:'2026-09-01' }    // recente demais: ainda não conta
  ];
  const ind = F.calcularIndicadoresGrupo1(animais, eventos, HOJE);
  verificar('só o animal nascido na propriedade entra na idade ao 1º parto', ind.idadePrimeiroParto.elegiveis, 1);
  verificar('o animal que entrou já parido fica de fora', ind.idadePrimeiroParto.excluidos, 1);
  verificar('conta as coberturas com prazo já vencido (35 dias)', ind.repeticaoCio.coberturas, 2);
  verificar('detecta o cio dentro da janela como repetição', ind.repeticaoCio.repeticoes, 1);
}

console.log('\n--- partos anteriores (idade ao 1º parto e ordem de parto) ---');
{
  // Caso da FEI: vaca nascida na fazenda, com 3 partos antes do primeiro lançado no app.
  const animais = [
    { id: 1, data_nascimento: '2023-01-01', partos_anteriores: 0 },
    { id: 2, data_nascimento: '2018-01-01', partos_anteriores: 3 },
    { id: 3, data_nascimento: '2019-01-01' }                       // coluna ausente/nula conta como 0
  ];
  const eventos = [
    { animal_id: 1, tipo:'parto', data:'2025-03-01', observacoes:null },
    { animal_id: 2, tipo:'parto', data:'2026-02-01', observacoes:null },
    { animal_id: 3, tipo:'parto', data:'2021-03-01', observacoes:null }
  ];
  const ind = F.calcularIndicadoresGrupo1(animais, eventos, HOJE);
  verificar('animal com partos anteriores informados fica fora da idade ao 1º parto', ind.idadePrimeiroParto.elegiveis, 2);
  verificar('o animal com partos anteriores conta como excluído', ind.idadePrimeiroParto.excluidos, 1);
  const esperadoMeses = ((F.diasEntre('2023-01-01', '2025-03-01') + F.diasEntre('2019-01-01', '2021-03-01')) / 2) / 30.44;
  aproximado('a média da idade ao 1º parto usa só os animais sem partos anteriores', ind.idadePrimeiroParto.mediaMeses, esperadoMeses, 0.001);

  const rr = F.resumoReprodutivoAnimal([{ tipo:'parto', data:'2026-02-01' }], HOJE, 3);
  verificar('ordem de parto = partos anteriores + partos registrados', rr.paridade, 4);
  verificar('partos registrados continua sendo só o que está no histórico', rr.partos, 1);
  verificar('sem informar partos anteriores, a ordem de parto é a contagem registrada',
    F.resumoReprodutivoAnimal([{ tipo:'parto', data:'2025-01-01' }, { tipo:'parto', data:'2026-01-01' }], HOJE).paridade, 2);
  verificar('sem nenhum parto registrado, a ordem de parto fica 0 mesmo com valor informado',
    F.resumoReprodutivoAnimal([], HOJE, 3).paridade, 0);
  verificar('o IEP não é inventado quando só há um parto registrado', rr.iep, null);
}

console.log('\n--- CSV de produção (arredondamento e número de vacas) ---');
{
  verificar('arredondar1 resolve a imprecisão de ponto flutuante (12.3 + 4.5)', F.arredondar1(12.3 + 4.5), 16.8);
  verificar('arredondar1 limita a 1 casa decimal', F.arredondar1(123.34999), 123.3);
  verificar('arredondar1 trata vazio como zero', F.arredondar1(null), 0);

  const producao = [
    { data:'2026-10-01', litros_manha:300.1, litros_tarde:200.2, metodo_registro:'individual' },
    { data:'2026-10-02', litros_manha:100, litros_tarde:50, metodo_registro:'rebanho' }
  ];
  const individual = [
    { data:'2026-10-01', animal_id:1, litros_manha:10, litros_tarde:8 },
    { data:'2026-10-01', animal_id:2, litros_manha:0, litros_tarde:9 },
    { data:'2026-10-01', animal_id:3, litros_manha:0, litros_tarde:0 },     // linha vazia: não conta como ordenhada
    { data:'2026-10-01', animal_id:1, litros_manha:1, litros_tarde:1 }       // mesma vaca de novo: não conta duas vezes
  ];
  const linhas = F.montarLinhasCSVProducao(producao, individual, true);
  verificar('o total do rebanho sai com 1 casa decimal', linhas[0].total, 500.3);
  verificar('conta só as vacas com leite lançado, sem repetir a mesma vaca', linhas[0].vacas_ordenhadas, 2);
  verificar('dia sem registro individual fica com vacas_ordenhadas vazio, não zero', linhas[1].vacas_ordenhadas, '');
  verificar('o método de registro entra só quando pedido', [linhas[0].metodo, F.montarLinhasCSVProducao(producao, individual, false)[0].metodo], ['individual', undefined]);
  verificar('sem registros individuais nenhum, o CSV continua saindo', F.montarLinhasCSVProducao(producao, null, false).length, 2);
}

console.log('\n--- calcularStatusQualidade (limites legais IN 76/77 do MAPA) ---');
{
  const semRegistro = F.calcularStatusQualidade([], HOJE);
  verificar('sem nenhum resultado no período, nível fica "ok" e registros:0 (sem alarme falso)', semRegistro.nivel, 'ok');
  verificar('sem nenhum resultado, registros conta 0', semRegistro.registros, 0);

  const acimaDoLimite = F.calcularStatusQualidade([{ data: HOJE, ccs: 600000, cbt: 100000, gordura: 3.5, proteina: 3.2 }], HOJE);
  verificar('CCS acima do limite legal (500.000) dá nível "alerta"', acimaDoLimite.nivel, 'alerta');

  const pertoDoLimite = F.calcularStatusQualidade([{ data: HOJE, ccs: 460000, cbt: 100000, gordura: 3.5, proteina: 3.2 }], HOJE);
  verificar('CCS entre 90% e 100% do limite (92% aqui) dá nível "atencao"', pertoDoLimite.nivel, 'atencao');

  const gorduraBaixa = F.calcularStatusQualidade([{ data: HOJE, ccs: 100000, cbt: 50000, gordura: 2.5, proteina: 3.2 }], HOJE);
  verificar('gordura abaixo do mínimo legal (3.0) dá alerta mesmo com CCS/CBT em ordem', gorduraBaixa.nivel, 'alerta');

  const tudoOk = F.calcularStatusQualidade([{ data: HOJE, ccs: 100000, cbt: 50000, gordura: 3.8, proteina: 3.4 }], HOJE);
  verificar('tudo dentro dos limites legais dá nível "ok"', tudoOk.nivel, 'ok');

  const forViaDaJanela = F.registrosNoPeriodo([{ data: '2026-01-01', ccs: 100000 }, { data: HOJE, ccs: 100000 }], HOJE, 90);
  verificar('registrosNoPeriodo ignora resultado fora da janela de dias pedida', forViaDaJanela.length, 1);
}

console.log('\n--- calcularGMD (ganho médio diário, módulo de Pesagem) ---');
aproximado('GMD positivo: ganhou 30kg em 60 dias = 0,5 kg/dia', F.calcularGMD(200, '2026-07-01', 230, '2026-08-30'), 0.5, 0.001);
aproximado('GMD negativo: perdeu peso entre as duas pesagens', F.calcularGMD(230, '2026-07-01', 220, '2026-08-01'), -10/31, 0.001);
verificar('sem pesagem anterior, GMD fica nulo (não dá para calcular)', F.calcularGMD(null, null, 230, '2026-08-30'), null);
verificar('sem a pesagem atual, GMD fica nulo', F.calcularGMD(200, '2026-07-01', null, null), null);
verificar('as duas pesagens no mesmo dia não geram GMD (divisão por zero evitada)', F.calcularGMD(200, '2026-08-30', 202, '2026-08-30'), null);

console.log('\n--- calcularNovoSaldoEstoque ---');
verificar('entrada soma ao saldo atual', F.calcularNovoSaldoEstoque(10, 'entrada', 5), 15);
verificar('consumo subtrai do saldo atual', F.calcularNovoSaldoEstoque(10, 'consumo', 5), 5);
verificar('consumo pode deixar o saldo negativo (o app não bloqueia isso hoje — o teste só registra a regra atual)', F.calcularNovoSaldoEstoque(3, 'consumo', 5), -2);

console.log('\n--- buscarTodasAsLinhas (paginação do limite de 1000 linhas do Supabase) ---');
(async () => {
  // Consulta de mentira: guarda os pedidos feitos e devolve fatias de uma lista com n linhas.
  function consultaFalsa(n, falharNaPagina){
    const linhas = Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
    const pedidos = { ordens: [], faixas: [] };
    const fabrica = () => {
      const b = {
        order(col){ pedidos.ordens.push(col); return b; },
        range(de, ate){
          pedidos.faixas.push([de, ate]);
          if(falharNaPagina !== undefined && pedidos.faixas.length === falharNaPagina) return Promise.resolve({ data: null, error: { message: 'falhou' } });
          return Promise.resolve({ data: linhas.slice(de, ate + 1), error: null });
        }
      };
      return b;
    };
    return { fabrica, pedidos };
  }
  const roda = async (n, falhar) => { const c = consultaFalsa(n, falhar); const r = await F.buscarTodasAsLinhas(c.fabrica); return { r, c }; };

  let x = await roda(2500);
  verificar('2500 linhas voltam inteiras, em 3 pedidos', [x.r.data.length, x.c.pedidos.faixas.length], [2500, 3]);
  verificar('as páginas pedem as faixas certas', x.c.pedidos.faixas, [[0, 999], [1000, 1999], [2000, 2999]]);
  verificar('nenhuma linha repetida nem pulada', x.r.data.every((l, i) => l.id === i + 1), true);
  verificar('pede desempate por id em todas as páginas', x.c.pedidos.ordens, ['id', 'id', 'id']);

  x = await roda(2000);
  verificar('número exato de páginas cheias: faz um pedido extra e termina sem erro', [x.r.data.length, x.c.pedidos.faixas.length], [2000, 3]);

  x = await roda(40);
  verificar('poucas linhas: um pedido só', [x.r.data.length, x.c.pedidos.faixas.length], [40, 1]);

  x = await roda(0);
  verificar('tabela vazia devolve lista vazia, sem erro', [x.r.data, x.r.error], [[], null]);

  x = await roda(2500, 2);
  verificar('erro numa página para tudo e devolve o erro (sem relatório pela metade)', [x.r.data, x.r.error && x.r.error.message], [null, 'falhou']);

  console.log('\n' + '-'.repeat(50));
  console.log(total + ' verificações, ' + falhas + ' falha(s).');
  if(falhas > 0){
    console.log('\nAlgum cálculo do app não bateu com o esperado. Não suba esta versão');
    console.log('sem entender por que — pode ser um bug novo, ou os testes é que');
    console.log('precisam ser atualizados porque a regra mudou de propósito.');
    process.exit(1);
  } else {
    console.log('\nTudo certo — os cálculos continuam batendo com o esperado.');
    process.exit(0);
  }
})();
