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
    'arredondar1', 'montarLinhasCSVProducao', 'buscarTodasAsLinhas',
    'JANELA_CONFERENCIA_DIAS', 'JANELA_DIAS_SEM_LANCAMENTO', 'LIMITE_LITROS_ORDENHA', 'LIMITE_LITROS_VACA_DIA',
    'MIN_VACAS_DIA_REPETIDO', 'TOLERANCIA_TOTAL_DIA', 'escaparHTML',
    'verificarQualidadeDados', 'montarCartaoQualidadeDados',
    'NOMES_MESES', 'agruparProducaoPorAnoMes', 'formatarLitros',
    'formatarPercentual', 'montarLinhasPrecoLeite', 'htmlTabelaPrecoLeite', 'linhasExcelPrecoLeite', 'PRECO_MAX_LITRO', 'formatarReais', 'litrosDoMes', 'calcularValoresLeiteMes', 'validarPrecosLeite', 'opcoesMesesPreco', 'rotuloMesAno',
    'DIAS_PAINEL_SECAGEM', 'textoPrazoDias', 'calcularPainelReprodutivo', 'filtrarHistoricoRebanho', 'normalizarBuscaAnimal', 'filtrarAnimaisPorBusca', 'CURVA_W', 'CURVA_ESQ', 'CURVA_DIR', 'xMaxCurvaLactacao', 'pontoMaisProximoCurva', 'lactacoesDoAnimal', 'pontosCurvaLactacao', 'resumoCurvaLactacao', 'curvaLactacaoSVG', 'descricaoLactacao', 'curvaLactacaoHTML',
    'calcularProducaoDiariaMes', 'limiteEixoGrafico', 'graficoProducaoMesHTML', 'blocoProducaoMesInicioHTML',
    'DIAS_ALERTA_SEM_COBERTURA', 'DIAS_AVISO_SECAGEM', 'DIAS_AVISO_PARTO', 'DIAS_PARTO_ATRASADO_MAX',
    'QUEDA_PRODUCAO_PCT', 'MIN_LITROS_BASE_QUEDA', 'DIAS_BAIXA_QUEDA', 'MAX_DIAS_ADIAR',
    'calcularAcoesDoDia', 'montarCartaoAcoesDoDia',
    'avisoDispensadoAtivo', 'filtrarAvisosDispensados', 'chaveAvisoQualidade', 'validarDiasAdiar', 'botoesAviso',
    'DIAS_CARENCIA_LIMPEZA_AVISOS', 'chavesDosGrupos', 'classificarAvisosDispensados',
    'DIAS_ALERTA_VAZIA_SEM_COBERTURA', 'DIAS_ALERTA_SEM_DIAGNOSTICO', 'DIAS_MAX_AVISO_SEM_DIAGNOSTICO', 'DIAS_MAX_DIAGNOSTICO', 'situacaoGestacaoCobertura', 'coberturaEmAberto',
    'validarDiagnosticoGestacao', 'formatarDetalhesCobertura', 'formatarData', 'montarCartaoGrupo1',
    'ehInicioLactacao', 'TIPOS_SERVICO', 'TIPOS_SERVICO_CURTO', 'normalizarTipoServico', 'opcoesTipoServicoHTML', 'linhaConcepcaoPorServico'
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

console.log('\n--- verificarQualidadeDados (conferência dos dados lançados) ---');
{
  const H = '2026-10-10';
  const dia = n => F.somarDias(H, -n);                       // n dias antes de hoje
  const codigos = av => av.map(x => x.codigo);
  const vacas = [1, 2, 3, 4, 5, 6].map(i => ({ id: i, identificacao: String(500 + i), partos_anteriores: 0 }));
  // 10 dias de produção do rebanho (de 2 a 11 dias atrás), cada vaca com litros diferentes a cada dia
  const prod = [], ind = [];
  for(let n = 2; n <= 11; n++){
    let somaM = 0, somaT = 0;
    vacas.forEach(v => { const m = 10 + v.id + n * 0.1, t = 8 + v.id + n * 0.1; ind.push({ data: dia(n), animal_id: v.id, litros_manha: m, litros_tarde: t }); somaM += m; somaT += t; });
    prod.push({ data: dia(n), litros_manha: somaM, litros_tarde: somaT, metodo_registro: 'individual' });
  }

  verificar('dados corretos não geram nenhum aviso', F.verificarQualidadeDados(prod, ind, vacas, [], H), []);

  // 1) dias sem lançamento
  const semDia5 = prod.filter(r => r.data !== dia(5));
  let av = F.verificarQualidadeDados(semDia5, null, vacas, [], H);
  verificar('um dia sem lançamento no meio do período gera aviso', codigos(av), ['dias_sem_lancamento']);
  verificar('o aviso diz que é 1 dia', av[0].titulo.startsWith('1 dia sem lançamento'), true);
  verificar('hoje e ontem ainda por lançar não contam como falta', codigos(F.verificarQualidadeDados(prod, null, vacas, [], H)), []);
  const parado = prod.map(r => ({ ...r, data: F.somarDias(r.data, -20) })).filter((r, i) => i % 2 === 0);
  verificar('produtor sem lançar há mais de 7 dias (app parado) não recebe aviso de dias faltando', codigos(F.verificarQualidadeDados(parado, null, vacas, [], H)), []);
  verificar('sem nenhuma produção, nenhum aviso', F.verificarQualidadeDados([], [], vacas, [], H), []);
  verificar('sem a produção por vaca (null), as regras que dependem dela são puladas sem erro', codigos(F.verificarQualidadeDados(prod, null, vacas, [], H)), []);

  // 2) total diferente da soma
  const prodDif = prod.map(r => r.data === dia(4) ? { ...r, litros_manha: r.litros_manha + 9 } : r);
  av = F.verificarQualidadeDados(prodDif, ind, vacas, [], H);
  verificar('total do dia diferente da soma das vacas gera aviso', codigos(av), ['total_diferente_da_soma']);
  verificar('o aviso cita a data do dia', av[0].detalhe.includes(dia(4).slice(8, 10) + '/' + dia(4).slice(5, 7)), true);
  const prodPouco = prod.map(r => r.data === dia(4) ? { ...r, litros_manha: r.litros_manha + 0.05 } : r);
  verificar('diferença de até 0,1 L (arredondamento) não gera aviso', codigos(F.verificarQualidadeDados(prodPouco, ind, vacas, [], H)), []);
  const prodRebanho = prodDif.map(r => ({ ...r, metodo_registro: 'rebanho' }));
  verificar('dia lançado só pelo rebanho (sem método individual) não é comparado', codigos(F.verificarQualidadeDados(prodRebanho, ind, vacas, [], H)), []);

  // 3) dia igual ao anterior (caso 02/10 e 03/10 da FEI)
  const indRep = ind.filter(r => r.data !== dia(3)).concat(ind.filter(r => r.data === dia(4)).map(r => ({ ...r, data: dia(3) })));
  const prodRep = prod.map(r => r.data === dia(3) ? { ...prod.find(p => p.data === dia(4)), data: dia(3) } : r);
  av = F.verificarQualidadeDados(prodRep, indRep, vacas, [], H);
  verificar('dia com os mesmos litros do dia anterior gera aviso', codigos(av), ['dia_repetido']);
  verificar('o aviso diz qual dia repete qual', av[0].detalhe.startsWith(dia(3).slice(8, 10) + '/' + dia(3).slice(5, 7) + ' igual a ' + dia(4).slice(8, 10)), true);
  const quatroVacas = [1, 2, 3, 4].map(i => ({ data: dia(3), animal_id: i, litros_manha: 10, litros_tarde: 8 })).concat([1, 2, 3, 4].map(i => ({ data: dia(2), animal_id: i, litros_manha: 10, litros_tarde: 8 })));
  verificar('com poucas vacas em comum (menos de 5), dias iguais não geram aviso', codigos(F.verificarQualidadeDados([], quatroVacas, vacas, [], H)), []);
  const indSalto = indRep.filter(r => r.data !== dia(4));
  verificar('dias iguais mas não seguidos não geram aviso', codigos(F.verificarQualidadeDados(prodRep.filter(r => r.data !== dia(4)), indSalto, vacas, [], H)).includes('dia_repetido'), false);

  // 4) valores implausíveis
  const indAlto = ind.map(r => r.data === dia(6) && r.animal_id === 1 ? { ...r, litros_manha: 90 } : r);
  av = F.verificarQualidadeDados([], indAlto, vacas, [], H);
  verificar('90 L numa ordenha gera aviso', codigos(av), ['valor_implausivel']);
  verificar('o aviso cita a vaca', av[0].detalhe.includes('Nº 501'), true);
  const um = (m, t) => F.verificarQualidadeDados([], [{ data: dia(5), animal_id: 1, litros_manha: m, litros_tarde: t }], vacas, [], H).length;
  verificar('40 L numa ordenha ainda é aceito', um(40, 20), 0);
  verificar('41 L numa ordenha gera aviso', um(41, 5), 1);
  verificar('total de mais de 70 L no dia gera aviso mesmo sem passar de 40 em cada ordenha', um(38, 35), 1);
  verificar('valor negativo gera aviso', um(-5, 10), 1);

  // 5) leite antes do primeiro parto (caso da vaca 536)
  const eventos = [{ animal_id: 1, tipo: 'parto', data: dia(5), observacoes: null }];
  av = F.verificarQualidadeDados([], ind, vacas, eventos, H);
  verificar('leite lançado antes do primeiro parto, sem partos anteriores, gera aviso', codigos(av), ['leite_antes_do_parto']);
  verificar('o aviso cita a vaca e o número de dias com leite antes do parto', av[0].detalhe.includes('Nº 501') && av[0].detalhe.includes('leite em 6 dias'), true);
  const vacasComAnteriores = vacas.map(v => v.id === 1 ? { ...v, partos_anteriores: 2 } : v);
  verificar('com partos anteriores informados, não gera aviso', codigos(F.verificarQualidadeDados([], ind, vacasComAnteriores, eventos, H)), []);
  const eventosAnterior = [{ animal_id: 1, tipo: 'parto', data: dia(5), observacoes: 'Parto anterior à entrada no rebanho (data aproximada)' }];
  verificar('parto anterior à entrada no rebanho (data aproximada) não gera aviso', codigos(F.verificarQualidadeDados([], ind, vacas, eventosAnterior, H)), []);
  const eventosCedo = [{ animal_id: 1, tipo: 'parto', data: dia(11), observacoes: null }];
  verificar('leite só depois do parto não gera aviso', codigos(F.verificarQualidadeDados([], ind, vacas, eventosCedo, H)), []);
  const inducaoTarde = [{ animal_id: 1, tipo: 'inducao_lactacao', data: dia(5), observacoes: null }];
  av = F.verificarQualidadeDados([], ind, vacas, inducaoTarde, H);
  verificar('leite antes do início da ordenha de uma indução de lactação também gera aviso, falando em indução', [codigos(av), av[0] && av[0].detalhe.includes('indução em')], [['leite_antes_do_parto'], true]);
  verificar('leite só depois da indução não gera aviso', codigos(F.verificarQualidadeDados([], ind, vacas, [{ animal_id: 1, tipo: 'inducao_lactacao', data: dia(11), observacoes: null }], H)), []);

  // janela de 90 dias
  const velho = [{ data: F.somarDias(H, -100), animal_id: 1, litros_manha: 90, litros_tarde: 5 }];
  verificar('lançamentos com mais de 90 dias ficam fora da conferência', F.verificarQualidadeDados([], velho, vacas, [], H), []);

  // cartão
  verificar('sem avisos e sem dados, o cartão não aparece', F.montarCartaoQualidadeDados([], false), '');
  verificar('sem avisos e com dados, o cartão diz que está tudo certo', F.montarCartaoQualidadeDados([], true).includes('Nenhum problema encontrado'), true);
  const html = F.montarCartaoQualidadeDados([{ codigo: 'x', titulo: '<b>t</b>', detalhe: 'a & b' }], true);
  verificar('o texto dos avisos é escapado no HTML', html.includes('&lt;b&gt;t&lt;/b&gt;') && html.includes('a &amp; b'), true);
}

console.log('\n--- calcularAcoesDoDia ("o que fazer hoje") ---');
{
  const H = '2026-10-10';
  const d = n => F.somarDias(H, n);                          // d(-5) = 5 dias atrás; d(5) = daqui a 5 dias
  const acoes = (animais, eventos, individual) => F.calcularAcoesDoDia(animais, eventos, individual === undefined ? null : individual, H);
  const grupo = (r, cod) => r.find(g => g.codigo === cod);
  const vaca = (id, nasc) => ({ id, identificacao: String(id), data_nascimento: nasc || '2020-01-01' });
  const dm = x => x.slice(8, 10) + '/' + x.slice(5, 7);

  verificar('sem nenhum evento, nada a fazer', acoes([vaca(1)], []), []);

  // Parto próximo ou atrasado
  const cob = (diasParaParto) => [{ animal_id: 1, tipo: 'cobertura', data: d(diasParaParto - 283) }];
  verificar('parto previsto em 13 dias aparece', !!grupo(acoes([vaca(1)], cob(13)), 'parto'), true);
  verificar('o aviso diz quantos dias faltam', grupo(acoes([vaca(1)], cob(13)), 'parto').itens[0].texto.includes('em 13 dias'), true);
  verificar('parto previsto em 14 dias ainda aparece', !!grupo(acoes([vaca(1)], cob(14)), 'parto'), true);
  verificar('parto previsto em 15 dias ainda não aparece', !!grupo(acoes([vaca(1)], cob(15)), 'parto'), false);
  verificar('parto previsto hoje diz "hoje"', grupo(acoes([vaca(1)], cob(0)), 'parto').itens[0].texto.includes('(hoje)'), true);
  verificar('parto previsto que passou há 10 dias pede para registrar', grupo(acoes([vaca(1)], cob(-10)), 'parto').itens[0].texto.includes('não foi registrado'), true);
  verificar('parto previsto que passou há mais de 45 dias é tratado como dado antigo', !!grupo(acoes([vaca(1)], cob(-46)), 'parto'), false);
  verificar('cio depois da cobertura desfaz a prenhez presumida (sem aviso de parto)',
    !!grupo(acoes([vaca(1)], cob(13).concat([{ animal_id: 1, tipo: 'cio', data: d(-240) }])), 'parto'), false);
  verificar('parto registrado depois da cobertura encerra o aviso',
    !!grupo(acoes([vaca(1)], cob(13).concat([{ animal_id: 1, tipo: 'parto', data: d(-100) }])), 'parto'), false);

  // Secagem (vaca que já pariu e está prenhe)
  const parto = { animal_id: 1, tipo: 'parto', data: d(-300) };
  const coberturaParaParto = n => [parto, { animal_id: 1, tipo: 'cobertura', data: d(n - 283) }];
  let r = acoes([vaca(1)], coberturaParaParto(65));      // data de secar = hoje + 5
  verificar('secagem recomendada em 5 dias aparece', grupo(r, 'secagem').itens[0].texto.includes('em 5 dias'), true);
  verificar('a data de secar é o parto previsto menos 60 dias', grupo(r, 'secagem').itens[0].texto.includes(dm(d(5))), true);
  verificar('secagem só daqui a 8 dias ainda não aparece', !!grupo(acoes([vaca(1)], coberturaParaParto(68)), 'secagem'), false);
  r = acoes([vaca(1)], coberturaParaParto(59));          // data de secar foi ontem
  verificar('data de secar que passou sem secagem registrada aparece', grupo(r, 'secagem').itens[0].texto.includes('já passou'), true);
  verificar('com secagem registrada depois do parto, não avisa',
    !!grupo(acoes([vaca(1)], coberturaParaParto(59).concat([{ animal_id: 1, tipo: 'secagem', data: d(-1) }])), 'secagem'), false);
  verificar('novilha prenhe (sem parto) não recebe aviso de secagem', !!grupo(acoes([vaca(1)], cob(65)), 'secagem'), false);

  // Sem cobertura há muito tempo
  const partoHa = n => [{ animal_id: 1, tipo: 'parto', data: d(-n) }];
  r = acoes([vaca(1)], partoHa(100));
  verificar('vaca lactante há 100 dias do parto sem cobertura aparece', grupo(r, 'sem_cobertura').itens[0].texto.startsWith('100 dias desde o parto'), true);
  verificar('89 dias ainda não aparece', !!grupo(acoes([vaca(1)], partoHa(89)), 'sem_cobertura'), false);
  verificar('90 dias aparece', !!grupo(acoes([vaca(1)], partoHa(90)), 'sem_cobertura'), true);
  verificar('com cobertura depois do parto, não aparece',
    !!grupo(acoes([vaca(1)], partoHa(100).concat([{ animal_id: 1, tipo: 'cobertura', data: d(-20) }])), 'sem_cobertura'), false);
  verificar('vaca seca (secagem registrada) não aparece',
    !!grupo(acoes([vaca(1)], partoHa(100).concat([{ animal_id: 1, tipo: 'secagem', data: d(-10) }])), 'sem_cobertura'), false);
  verificar('um cio registrado não esconde o aviso', !!grupo(acoes([vaca(1)], partoHa(100).concat([{ animal_id: 1, tipo: 'cio', data: d(-5) }])), 'sem_cobertura'), true);
  verificar('aborto recente reinicia a contagem', !!grupo(acoes([vaca(1)], partoHa(200).concat([{ animal_id: 1, tipo: 'aborto', data: d(-30) }])), 'sem_cobertura'), false);
  verificar('aborto antigo: a contagem parte do aborto e o aviso fala em aborto',
    grupo(acoes([vaca(1)], partoHa(200).concat([{ animal_id: 1, tipo: 'aborto', data: d(-95) }])), 'sem_cobertura').itens[0].texto.includes('desde o aborto'), true);

  // Queda de produção (vaca lactante prenhe há pouco, para não cair na regra de sem cobertura)
  const evsLact = [{ animal_id: 1, tipo: 'parto', data: d(-100) }, { animal_id: 1, tipo: 'cobertura', data: d(-30) }];
  const dias = (de, ate, m, t) => { const l = []; for(let i = de; i <= ate; i++) l.push({ data: d(-i), animal_id: 1, litros_manha: m, litros_tarde: t }); return l; };
  const base = dias(4, 10, 14, 11);                       // 25 L/dia de 10 a 4 dias atrás (7 dias)
  r = acoes([vaca(1)], evsLact, base.concat(dias(1, 3, 10, 8)));   // 18 L/dia: queda de 28%
  verificar('queda de 28% aparece', grupo(r, 'queda_producao').itens[0].texto.startsWith('produção caiu 28%'), true);
  verificar('o aviso traz as duas médias', grupo(r, 'queda_producao').itens[0].texto.includes('18.0 L/dia') && grupo(r, 'queda_producao').itens[0].texto.includes('25.0 L/dia'), true);
  verificar('queda de 20% não aparece', !!grupo(acoes([vaca(1)], evsLact, base.concat(dias(1, 3, 10, 10))), 'queda_producao'), false);
  verificar('com só 1 dia completo recente, não aparece', !!grupo(acoes([vaca(1)], evsLact, base.concat(dias(1, 1, 5, 5))), 'queda_producao'), false);
  verificar('dia com uma ordenha só não entra na média (sobra só 1 dia completo, que não basta)', !!grupo(acoes([vaca(1)], evsLact, base.concat(dias(1, 3, 10, 8).map((x, i) => i < 1 ? x : { ...x, litros_tarde: null }))), 'queda_producao'), false);
  const baseBaixa = dias(4, 10, 2, 1);
  verificar('média base abaixo de 5 L/dia não gera aviso de queda', !!grupo(acoes([vaca(1)], evsLact, baseBaixa.concat(dias(1, 3, 0.5, 0.5))), 'queda_producao'), false);
  verificar('vaca seca não gera aviso de queda',
    !!grupo(acoes([vaca(1)], evsLact.concat([{ animal_id: 1, tipo: 'secagem', data: d(-5) }]), base.concat(dias(1, 3, 10, 8))), 'queda_producao'), false);
  verificar('sem a produção por vaca (null), a regra de queda é pulada sem erro', !!grupo(acoes([vaca(1)], evsLact, null), 'queda_producao'), false);

  // Ordem dos grupos e dos itens
  const varias = [vaca(1), vaca(2), vaca(3)];
  const evs3 = [
    { animal_id: 1, tipo: 'cobertura', data: d(10 - 283) },          // parto em 10 dias
    { animal_id: 2, tipo: 'cobertura', data: d(3 - 283) },           // parto em 3 dias
    { animal_id: 3, tipo: 'parto', data: d(-150) }                   // sem cobertura há 150 dias
  ];
  r = acoes(varias, evs3);
  verificar('grupos saem na ordem de importância (parto antes de sem cobertura)', r.map(g => g.codigo), ['parto', 'sem_cobertura']);
  verificar('dentro do grupo, o parto mais perto vem primeiro', r[0].itens.map(i => i.animal), ['Nº 2', 'Nº 1']);

  // Cartão
  verificar('sem animais cadastrados, o cartão não aparece', F.montarCartaoAcoesDoDia([], false), '');
  verificar('com animais e sem ação, o cartão diz que não há nada urgente', F.montarCartaoAcoesDoDia([], true).includes('Nada urgente hoje'), true);
  const html = F.montarCartaoAcoesDoDia([{ codigo: 'x', titulo: 'T <b>', itens: [{ animal: 'Nº 1', texto: 'a & b' }] }], true);
  verificar('o texto do cartão é escapado', html.includes('T &lt;b&gt;') && html.includes('a &amp; b'), true);
  const muitos = [{ codigo: 'x', titulo: 'T', itens: Array.from({ length: 11 }, (_, i) => ({ animal: 'Nº ' + i, texto: 't' })) }];
  verificar('mais de 8 itens num grupo mostra "e mais 3"', F.montarCartaoAcoesDoDia(muitos, true).includes('e mais 3'), true);
}

console.log('\n--- baixa e adiamento de avisos ---');
{
  const H = '2026-10-10';
  const d = n => F.somarDias(H, n);

  // avisoDispensadoAtivo
  verificar('baixa definitiva (sem data) está ativa', F.avisoDispensadoAtivo({ chave: 'a', ate: null }, H), true);
  verificar('adiado até amanhã continua escondido hoje', F.avisoDispensadoAtivo({ chave: 'a', ate: d(1) }, H), true);
  verificar('no dia da data de adiamento o aviso volta', F.avisoDispensadoAtivo({ chave: 'a', ate: H }, H), false);
  verificar('depois da data de adiamento o aviso volta', F.avisoDispensadoAtivo({ chave: 'a', ate: d(-3) }, H), false);
  verificar('sem registro nenhum, nada está dispensado', F.avisoDispensadoAtivo(undefined, H), false);

  // filtrarAvisosDispensados
  const grupos = [
    { codigo: 'parto', titulo: 'Parto', itens: [{ animal: 'Nº 1', texto: 't', chave: 'parto|1|x' }, { animal: 'Nº 2', texto: 't', chave: 'parto|2|x' }] },
    { codigo: 'secagem', titulo: 'Secagem', itens: [{ animal: 'Nº 3', texto: 't', chave: 'secagem|3|x' }] }
  ];
  let f = F.filtrarAvisosDispensados(grupos, [{ chave: 'parto|1|x', ate: null }], H);
  verificar('baixa tira só o aviso dispensado', f.grupos[0].itens.map(i => i.animal), ['Nº 2']);
  verificar('conta quantos foram escondidos', f.ocultos, 1);
  f = F.filtrarAvisosDispensados(grupos, [{ chave: 'secagem|3|x', ate: d(5) }], H);
  verificar('grupo que fica sem itens some', f.grupos.map(g => g.codigo), ['parto']);
  f = F.filtrarAvisosDispensados(grupos, [{ chave: 'secagem|3|x', ate: d(-1) }], H);
  verificar('adiamento vencido: o aviso volta', f.grupos.length, 2);
  f = F.filtrarAvisosDispensados(grupos, [{ chave: 'parto|1|outra-gestacao', ate: null }], H);
  verificar('baixa de outra ocorrência (outra data) não esconde este aviso', [f.grupos[0].itens.length, f.ocultos], [2, 0]);
  verificar('sem dispensados, os grupos passam intactos', F.filtrarAvisosDispensados(grupos, [], H).grupos, grupos);
  verificar('filtrar não altera a lista original', grupos[0].itens.length, 2);

  // chaves geradas pelo painel: estáveis ao longo dos dias, para a baixa continuar valendo
  const vaca = { id: 7, identificacao: '7', data_nascimento: '2020-01-01' };
  const evs = [{ animal_id: 7, tipo: 'cobertura', data: d(10 - 283) }];
  const g1 = F.calcularAcoesDoDia([vaca], evs, null, H);
  const g2 = F.calcularAcoesDoDia([vaca], evs, null, d(2));
  verificar('o aviso de parto tem chave com a vaca e a data prevista', g1[0].itens[0].chave, 'parto|7|' + d(10));
  verificar('a chave não muda de um dia para o outro (a baixa continua valendo)', g2[0].itens[0].chave, g1[0].itens[0].chave);
  verificar('o item traz uma descrição para a lista de avisos dispensados', g1[0].itens[0].descricao, 'Parto próximo ou atrasado: Nº 7');
  verificar('aviso comum não tem prazo de baixa fixo', g1[0].itens[0].baixaDias, null);
  const evsLact = [{ animal_id: 7, tipo: 'parto', data: d(-100) }, { animal_id: 7, tipo: 'cobertura', data: d(-30) }];
  const ind = []; for(let i = 4; i <= 10; i++) ind.push({ data: d(-i), animal_id: 7, litros_manha: 14, litros_tarde: 11 });
  for(let i = 1; i <= 3; i++) ind.push({ data: d(-i), animal_id: 7, litros_manha: 10, litros_tarde: 8 });
  const q = F.calcularAcoesDoDia([vaca], evsLact, ind, H).find(g => g.codigo === 'queda_producao');
  verificar('queda de produção: a baixa vale por 30 dias', [q.itens[0].chave, q.itens[0].baixaDias], ['queda|7', 30]);
  const semCob = F.calcularAcoesDoDia([vaca], [{ animal_id: 7, tipo: 'parto', data: d(-100) }], null, H).find(g => g.codigo === 'sem_cobertura');
  verificar('sem cobertura: a chave inclui a data do parto (nova lactação, novo aviso)', semCob.itens[0].chave, 'sem_cobertura|7|' + d(-100));
  const secagem = F.calcularAcoesDoDia([vaca], [{ animal_id: 7, tipo: 'parto', data: d(-300) }, { animal_id: 7, tipo: 'cobertura', data: d(65 - 283) }], null, H).find(g => g.codigo === 'secagem');
  verificar('secagem: a chave inclui a data de secar', secagem.itens[0].chave, 'secagem|7|' + d(5));

  // qualidade do leite
  verificar('chave da qualidade usa o nível e a data do resultado mais recente', F.chaveAvisoQualidade('alerta', [{ data: '2026-08-01' }, { data: '2026-09-15' }, { data: '2026-07-01' }]), 'qualidade|alerta|2026-09-15');
  verificar('um resultado novo muda a chave (o aviso volta se continuar ruim)',
    F.chaveAvisoQualidade('alerta', [{ data: '2026-09-15' }]) !== F.chaveAvisoQualidade('alerta', [{ data: '2026-09-15' }, { data: '2026-10-05' }]), true);
  verificar('mudar o nível também muda a chave', F.chaveAvisoQualidade('atencao', [{ data: '2026-09-15' }]) !== F.chaveAvisoQualidade('alerta', [{ data: '2026-09-15' }]), true);
  verificar('sem datas, a chave ainda existe', F.chaveAvisoQualidade('alerta', []), 'qualidade|alerta|sem-data');

  // dias do adiamento
  verificar('7 dias é aceito', F.validarDiasAdiar('7'), 7);
  verificar('365 dias é o máximo', F.validarDiasAdiar(365), 365);
  verificar('366 dias é recusado', F.validarDiasAdiar('366'), null);
  verificar('0 e negativos são recusados', [F.validarDiasAdiar('0'), F.validarDiasAdiar('-3')], [null, null]);
  verificar('decimais são recusados', F.validarDiasAdiar('2.5'), null);
  verificar('vazio e texto são recusados', [F.validarDiasAdiar(''), F.validarDiasAdiar('abc'), F.validarDiasAdiar(null)], [null, null, null]);

  // botões
  const html = F.botoesAviso('parto|1|"x"', 'Parto: <Nº 1>', 30);
  verificar('os dois botões existem', html.includes('Dar baixa') && html.includes('Adiar'), true);
  verificar('os dados do aviso são escapados nos atributos', html.includes('data-chave="parto|1|&quot;x&quot;"') && html.includes('data-descricao="Parto: &lt;Nº 1&gt;"'), true);
  verificar('o prazo de baixa vai no botão quando existe', html.includes('data-baixa-dias="30"'), true);
  verificar('sem prazo, o atributo fica vazio', F.botoesAviso('a', 'b', null).includes('data-baixa-dias=""'), true);
  const cartao = F.montarCartaoAcoesDoDia(g1, true);
  verificar('o cartão de ações mostra os botões em cada aviso', (cartao.match(/Dar baixa/g) || []).length >= 1 && cartao.includes('data-chave="parto|7|'), true);
}

console.log('\n--- limpeza dos avisos dispensados (lista só com o que ainda vale) ---');
{
  const H = '2026-10-10';
  const d = n => F.somarDias(H, n);
  const criadoHa = n => d(-n) + 'T12:00:00.000+00:00';           // como o Supabase devolve o criado_em
  const reg = (chave, ate, criadoEmDias) => ({ chave, ate, criado_em: criadoHa(criadoEmDias === undefined ? 1 : criadoEmDias) });
  const vig = (...chaves) => new Set(chaves);

  // chavesDosGrupos
  const grupos = [{ codigo: 'a', itens: [{ chave: 'k1' }, { chave: 'k2' }, { animal: 'sem chave' }] }, { codigo: 'b', itens: [{ chave: 'k3' }] }];
  verificar('chavesDosGrupos junta as chaves de todos os grupos', [...F.chavesDosGrupos(grupos)], ['k1', 'k2', 'k3']);
  verificar('chavesDosGrupos aceita lista vazia ou nula', [F.chavesDosGrupos([]).size, F.chavesDosGrupos(null).size], [0, 0]);

  // baixa e adiamento de aviso que ainda existe: aparece na lista e não é apagado
  let r = F.classificarAvisosDispensados([reg('a', null, 40), reg('b', d(5), 2)], vig('a', 'b'), H);
  verificar('baixa e adiamento de avisos que ainda existem aparecem na lista', r.visiveis.map(x => x.chave), ['a', 'b']);
  verificar('e não são apagados, por mais antigos que sejam', [r.expirados, r.obsoletos], [[], []]);

  // adiamento vencido: apagado, mesmo que o aviso ainda exista
  r = F.classificarAvisosDispensados([reg('a', d(-1), 10), reg('b', H, 10)], vig('a', 'b'), H);
  verificar('adiamento vencido (ontem ou hoje) sai da lista e vai para apagar', [r.visiveis.length, r.expirados], [0, ['a', 'b']]);
  r = F.classificarAvisosDispensados([reg('a', d(-1), 10)], null, H);
  verificar('adiamento vencido é apagado mesmo sem saber quais avisos existem', r.expirados, ['a']);

  // aviso que deixou de existir
  r = F.classificarAvisosDispensados([reg('velho', null, 30)], vig('outro'), H);
  verificar('baixa de aviso que não existe mais, com 30 dias, sai da lista e é apagada', [r.visiveis.length, r.obsoletos], [0, ['velho']]);
  r = F.classificarAvisosDispensados([reg('novo', null, 3)], vig('outro'), H);
  verificar('dentro da carência (3 dias), sai da lista mas ainda não é apagada', [r.visiveis.length, r.obsoletos], [0, []]);
  verificar('a carência é de 7 dias', F.DIAS_CARENCIA_LIMPEZA_AVISOS, 7);
  verificar('com 6 dias ainda espera', F.classificarAvisosDispensados([reg('x', null, 6)], vig(), H).obsoletos, []);
  verificar('com exatamente 7 dias já apaga', F.classificarAvisosDispensados([reg('x', null, 7)], vig(), H).obsoletos, ['x']);
  verificar('adiamento ainda no prazo, mas de aviso que não existe mais, também some depois da carência',
    F.classificarAvisosDispensados([reg('x', d(20), 9)], vig(), H).obsoletos, ['x']);
  verificar('sem data de criação, nunca se apaga como obsoleto', F.classificarAvisosDispensados([{ chave: 'x', ate: null }], vig(), H).obsoletos, []);

  // não saber o que existe: não apagar nada como obsoleto, e mostrar tudo que está ativo
  r = F.classificarAvisosDispensados([reg('a', null, 90), reg('b', d(4), 90)], null, H);
  verificar('sem saber o que existe, a lista mostra todos os ativos', r.visiveis.map(x => x.chave), ['a', 'b']);
  verificar('e nada é apagado como obsoleto', r.obsoletos, []);
  verificar('lista vazia ou nula não dá erro', [F.classificarAvisosDispensados([], vig(), H), F.classificarAvisosDispensados(null, null, H)].map(x => x.visiveis.length), [0, 0]);

  // cada registro cai em no máximo um grupo, e a lista original não é alterada
  const original = [reg('a', null, 40), reg('b', d(-2), 40), reg('c', null, 40), reg('d', null, 2)];
  const copia = JSON.stringify(original);
  r = F.classificarAvisosDispensados(original, vig('a'), H);
  verificar('cada registro cai em um só grupo (visível, expirado, obsoleto ou em carência)', [r.visiveis.map(x => x.chave), r.expirados, r.obsoletos], [['a'], ['b'], ['c']]);
  verificar('a lista original não é alterada', JSON.stringify(original), copia);

  // ligação com o painel real: a baixa dada a um parto previsto some quando o parto é registrado
  const vaca = { id: 7, identificacao: '7', data_nascimento: '2020-01-01' };
  const cobertura = { animal_id: 7, tipo: 'cobertura', data: d(10 - 283) };
  const antes = F.chavesDosGrupos(F.calcularAcoesDoDia([vaca], [cobertura], null, H));
  const chave = 'parto|7|' + d(10);
  verificar('o aviso de parto existe e a baixa dele aparece na lista', F.classificarAvisosDispensados([reg(chave, null, 3)], antes, H).visiveis.length, 1);
  const depois = F.chavesDosGrupos(F.calcularAcoesDoDia([vaca], [cobertura, { animal_id: 7, tipo: 'parto', data: d(9) }], null, d(11)));
  verificar('depois que o parto é registrado, o aviso deixa de existir', depois.has(chave), false);
  r = F.classificarAvisosDispensados([reg(chave, null, 12)], depois, d(11));
  verificar('e a baixa antiga sai da lista e é apagada', [r.visiveis.length, r.obsoletos], [0, [chave]]);

  // ligação com a qualidade: um resultado novo muda a chave e a baixa antiga fica obsoleta
  const chaveAntiga = F.chaveAvisoQualidade('alerta', [{ data: '2026-09-15' }]);
  const chaveNova = F.chaveAvisoQualidade('alerta', [{ data: '2026-09-15' }, { data: '2026-10-05' }]);
  r = F.classificarAvisosDispensados([reg(chaveAntiga, null, 25)], vig(chaveNova), H);
  verificar('resultado novo de qualidade: a baixa antiga some e é apagada', [r.visiveis.length, r.obsoletos], [0, [chaveAntiga]]);
  r = F.classificarAvisosDispensados([reg(chaveAntiga, null, 25)], vig(chaveAntiga), H);
  verificar('sem resultado novo, a baixa da qualidade continua na lista', r.visiveis.length, 1);
}

console.log('\n--- diagnóstico de gestação (prenhe, vazia ou ainda sem confirmação) ---');
{
  const H = '2026-10-10';
  const d = n => F.somarDias(H, n);
  const grupo = (r, cod) => r.find(g => g.codigo === cod);
  const vaca = { id: 1, identificacao: '1', data_nascimento: '2020-01-01' };
  const parto = { animal_id: 1, tipo: 'parto', data: d(-200) };
  const cobSem = (n) => ({ id: 10, animal_id: 1, tipo: 'cobertura', data: d(n) });
  const cobDiag = (n, res, nd) => ({ id: 10, animal_id: 1, tipo: 'cobertura', data: d(n), diagnostico_gestacao: res, diagnostico_data: d(nd) });

  verificar('cobertura sem diagnóstico: prenhez presumida', F.situacaoGestacaoCobertura(cobSem(-50)), 'presumida');
  verificar('diagnóstico prenhe: confirmada', F.situacaoGestacaoCobertura(cobDiag(-50, 'prenhe', -10)), 'confirmada');
  verificar('diagnóstico vazia: vazia', F.situacaoGestacaoCobertura(cobDiag(-50, 'vazia', -10)), 'vazia');
  verificar('evento que não é cobertura não tem situação', F.situacaoGestacaoCobertura(parto), null);
  verificar('sem evento nenhum, situação nula', F.situacaoGestacaoCobertura(null), null);

  // Cobertura em aberto
  verificar('cobertura sem nada depois está em aberto', F.coberturaEmAberto([parto, cobSem(-50)]).id, 10);
  verificar('cobertura seguida de cio não está mais em aberto', F.coberturaEmAberto([parto, cobSem(-50), { tipo: 'cio', data: d(-20) }]), null);
  verificar('cobertura seguida de parto não está em aberto', F.coberturaEmAberto([cobSem(-300), { tipo: 'parto', data: d(-10) }]), null);
  verificar('sem eventos, nada em aberto', F.coberturaEmAberto([]), null);

  // Validação do diagnóstico
  const cb = cobSem(-60);
  verificar('diagnóstico válido passa', F.validarDiagnosticoGestacao(cb, 'prenhe', d(-20), H), null);
  verificar('diagnóstico hoje passa', F.validarDiagnosticoGestacao(cb, 'vazia', H, H), null);
  verificar('sem resultado é recusado', !!F.validarDiagnosticoGestacao(cb, '', d(-20), H), true);
  verificar('resultado inventado é recusado', !!F.validarDiagnosticoGestacao(cb, 'talvez', d(-20), H), true);
  verificar('sem data é recusado', !!F.validarDiagnosticoGestacao(cb, 'prenhe', '', H), true);
  verificar('data no dia da cobertura é recusada', !!F.validarDiagnosticoGestacao(cb, 'prenhe', d(-60), H), true);
  verificar('data antes da cobertura é recusada', !!F.validarDiagnosticoGestacao(cb, 'prenhe', d(-70), H), true);
  verificar('data no futuro é recusada', !!F.validarDiagnosticoGestacao(cb, 'prenhe', d(1), H), true);
  verificar('data a mais de 300 dias da cobertura é recusada', !!F.validarDiagnosticoGestacao(cobSem(-400), 'prenhe', d(-50), H), true);
  verificar('só vale numa cobertura', !!F.validarDiagnosticoGestacao(parto, 'prenhe', d(-20), H), true);

  // Texto na lista de eventos
  verificar('texto da cobertura prenhe', F.formatarDetalhesCobertura(cobDiag(-50, 'prenhe', -10)), 'Prenhe, confirmada em ' + F.formatarData(d(-10)));
  verificar('texto da cobertura vazia', F.formatarDetalhesCobertura(cobDiag(-50, 'vazia', -10)), 'Vazia, diagnosticada em ' + F.formatarData(d(-10)));
  verificar('cobertura sem diagnóstico não ganha texto', F.formatarDetalhesCobertura(cobSem(-50)), '');

  // Efeito no "O que fazer hoje": parto previsto em 5 dias (cobertura há 278)
  const aco = (evs) => F.calcularAcoesDoDia([vaca], evs, null, H);
  const cobPerto = (res, nd) => ({ id: 10, animal_id: 1, tipo: 'cobertura', data: d(-278), diagnostico_gestacao: res, diagnostico_data: nd == null ? null : d(nd) });
  verificar('sem diagnóstico, o parto previsto aparece (como antes)', !!grupo(aco([cobPerto(null)]), 'parto'), true);
  verificar('diagnosticada prenhe, o parto previsto aparece', !!grupo(aco([cobPerto('prenhe', -200)]), 'parto'), true);
  verificar('diagnosticada vazia, o parto previsto NÃO aparece', !!grupo(aco([cobPerto('vazia', -200)]), 'parto'), false);
  verificar('vaca coberta já parida, diagnosticada vazia, não gera aviso de secagem', !!grupo(aco([{ animal_id: 1, tipo: 'parto', data: d(-400) }, cobPerto('vazia', -200)]), 'secagem'), false);

  // Vazia sem nova cobertura
  const evVazia = (diasDesdeDiag) => [parto, cobDiag(-100, 'vazia', -diasDesdeDiag)];
  verificar('vazia há 29 dias ainda não avisa', !!grupo(aco(evVazia(29)), 'sem_cobertura'), false);
  const gv = grupo(aco(evVazia(30)), 'sem_cobertura');
  verificar('vazia há 30 dias avisa', !!gv, true);
  verificar('o aviso cita o diagnóstico de vazia e os dias', gv && gv.itens[0].texto.includes('diagnosticada vazia') && gv.itens[0].texto.includes('30 dias'), true);
  verificar('a chave do aviso de vazia identifica o diagnóstico', gv && gv.itens[0].chave, 'vazia_sem_cobertura|1|' + d(-30));
  verificar('vazia: só um aviso por vaca (não duplica com o de sem cobertura)', gv && gv.itens.length, 1);
  verificar('nova cobertura depois da vazia encerra o aviso', !!grupo(aco([parto, cobDiag(-100, 'vazia', -60), { id: 11, animal_id: 1, tipo: 'cobertura', data: d(-20) }]), 'sem_cobertura'), false);

  // Lote
  const hojeLote = H;
  verificar('vaca coberta e prenhe, a 30 dias do parto, vai para seca', F.calcularLoteAnimal(vaca, [{ tipo: 'parto', data: d(-400) }, cobPerto('prenhe', -200)], hojeLote), 'seca');
  verificar('vaca diagnosticada vazia continua lactante, mesmo com a data de secar vencida', F.calcularLoteAnimal(vaca, [{ tipo: 'parto', data: d(-400) }, cobPerto('vazia', -200)], hojeLote), 'lactante');
  verificar('sem diagnóstico, o lote é o de sempre (seca)', F.calcularLoteAnimal(vaca, [{ tipo: 'parto', data: d(-400) }, cobPerto(null)], hojeLote), 'seca');

  // Cobertura sem diagnóstico (aviso do "O que fazer hoje")
  const cobHa = (dias, extra) => Object.assign({ id: 10, animal_id: 1, tipo: 'cobertura', data: d(-dias) }, extra || {});
  verificar('cobertura há 59 dias sem diagnóstico ainda não avisa', !!grupo(aco([cobHa(59)]), 'sem_diagnostico'), false);
  const gsd = grupo(aco([cobHa(60)]), 'sem_diagnostico');
  verificar('cobertura há 60 dias sem diagnóstico avisa', !!gsd, true);
  verificar('o aviso diz a data e os dias da cobertura', gsd && gsd.itens[0].texto.includes('coberta em') && gsd.itens[0].texto.includes('(60 dias)'), true);
  verificar('a chave identifica a vaca e a cobertura', gsd && gsd.itens[0].chave, 'sem_diagnostico|1|' + d(-60));
  verificar('cobertura há 180 dias ainda avisa', !!grupo(aco([cobHa(180)]), 'sem_diagnostico'), true);
  verificar('cobertura há 181 dias não avisa (parto já perto)', !!grupo(aco([cobHa(181)]), 'sem_diagnostico'), false);
  verificar('já diagnosticada prenhe: não avisa', !!grupo(aco([cobHa(90, { diagnostico_gestacao: 'prenhe', diagnostico_data: d(-40) })]), 'sem_diagnostico'), false);
  verificar('já diagnosticada vazia: não avisa', !!grupo(aco([cobHa(90, { diagnostico_gestacao: 'vazia', diagnostico_data: d(-40) })]), 'sem_diagnostico'), false);
  verificar('cobertura seguida de cio não avisa (já se sabe que não pegou)', !!grupo(aco([cobHa(90), { animal_id: 1, tipo: 'cio', data: d(-60) }]), 'sem_diagnostico'), false);
  verificar('uma cobertura nova depois da antiga: avisa só pela nova', grupo(aco([cobHa(120), { id: 11, animal_id: 1, tipo: 'cobertura', data: d(-70) }]), 'sem_diagnostico').itens.length, 1);
  verificar('novilha (sem parto) coberta também entra no aviso', !!grupo(aco([cobHa(100)]), 'sem_diagnostico'), true);
  verificar('o grupo aparece depois dos outros na tela (por último)', aco([parto, cobHa(100)]).map(g => g.codigo).pop(), 'sem_diagnostico');

  // Indicador de concepção
  const indic = (evs) => F.calcularIndicadoresGrupo1([vaca], evs, H).diagnosticoGestacao;
  verificar('sem nenhum diagnóstico, taxa nula', indic([cobHa(100)]).taxaConcepcaoPct, null);
  verificar('3 prenhes e 1 vazia: 75%', indic([
    cobHa(400, { id: 1, diagnostico_gestacao: 'prenhe', diagnostico_data: d(-350) }),
    cobHa(300, { id: 2, diagnostico_gestacao: 'prenhe', diagnostico_data: d(-250) }),
    cobHa(200, { id: 3, diagnostico_gestacao: 'vazia', diagnostico_data: d(-150) }),
    cobHa(100, { id: 4, diagnostico_gestacao: 'prenhe', diagnostico_data: d(-50) })]).taxaConcepcaoPct, 75);
  verificar('conta prenhes e vazias separadamente', [indic([
    cobHa(200, { id: 3, diagnostico_gestacao: 'vazia', diagnostico_data: d(-150) }),
    cobHa(100, { id: 4, diagnostico_gestacao: 'prenhe', diagnostico_data: d(-50) })]).prenhes, indic([
    cobHa(200, { id: 3, diagnostico_gestacao: 'vazia', diagnostico_data: d(-150) })]).vazias], [1, 1]);
  verificar('cobertura em aberto há 90 dias sem diagnóstico conta como aguardando', indic([cobHa(90)]).aguardando, 1);
  verificar('cobertura há 30 dias ainda não conta como aguardando', indic([cobHa(30)]).aguardando, 0);
  verificar('cobertura antiga seguida de parto não conta como aguardando', indic([cobHa(300), { animal_id: 1, tipo: 'parto', data: d(-20) }]).aguardando, 0);
  verificar('cobertura seguida de cio (repetiu) não conta como aguardando', indic([cobHa(100), { animal_id: 1, tipo: 'cio', data: d(-60) }]).aguardando, 0);
  verificar('o indicador não mexe nos outros (repetição de cio segue igual)', F.calcularIndicadoresGrupo1([vaca], [cobHa(100)], H).repeticaoCio.coberturas, 1);


  // Tipo de serviço
  verificar('os três tipos de serviço têm nome', Object.keys(F.TIPOS_SERVICO), ['inseminacao', 'iatf', 'monta_natural']);
  verificar('valor conhecido é aceito', F.normalizarTipoServico('iatf'), 'iatf');
  verificar('vazio vira não informado', F.normalizarTipoServico(''), null);
  verificar('valor inventado vira não informado', F.normalizarTipoServico('touro'), null);
  verificar('nome herdado do objeto (constructor) não passa', F.normalizarTipoServico('constructor'), null);
  verificar('sem valor vira não informado', F.normalizarTipoServico(undefined), null);
  verificar('texto da cobertura traz o serviço', F.formatarDetalhesCobertura(cobHa(50, { tipo_servico: 'iatf' })), 'IATF');
  verificar('texto da cobertura junta serviço e diagnóstico', F.formatarDetalhesCobertura(cobHa(50, { tipo_servico: 'monta_natural', diagnostico_gestacao: 'prenhe', diagnostico_data: d(-10) })), 'Monta natural · Prenhe, confirmada em ' + F.formatarData(d(-10)));
  verificar('serviço inválido gravado no banco não aparece', F.formatarDetalhesCobertura(cobHa(50, { tipo_servico: 'xyz' })), '');
  verificar('as opções do formulário começam em "Não informado" e marcam a atual', [F.opcoesTipoServicoHTML('iatf').startsWith('<option value="">Não informado</option>'), F.opcoesTipoServicoHTML('iatf').includes('value="iatf" selected')], [true, true]);

  const cobS = (id, servico, res) => cobHa(100 + id, { id, tipo_servico: servico, diagnostico_gestacao: res, diagnostico_data: d(-50 - id) });
  const evsS = [cobS(1, 'inseminacao', 'prenhe'), cobS(2, 'inseminacao', 'prenhe'), cobS(3, 'inseminacao', 'vazia'), cobS(4, 'monta_natural', 'prenhe'), cobS(5, null, 'vazia'), cobS(6, 'iatf', null)];
  const ps = F.calcularIndicadoresGrupo1([vaca], evsS, H).diagnosticoGestacao.porServico;
  verificar('inseminação: 2 prenhes, 1 vazia, 67%', [ps.inseminacao.prenhes, ps.inseminacao.vazias, Math.round(ps.inseminacao.taxaPct)], [2, 1, 67]);
  verificar('monta natural: 1 de 1, 100%', [ps.monta_natural.prenhes, ps.monta_natural.vazias, ps.monta_natural.taxaPct], [1, 0, 100]);
  verificar('IATF sem diagnóstico não tem taxa', [ps.iatf.prenhes + ps.iatf.vazias, ps.iatf.taxaPct], [0, null]);
  verificar('cobertura sem serviço informado fica fora da comparação, mas entra na taxa geral', F.calcularIndicadoresGrupo1([vaca], evsS, H).diagnosticoGestacao.vazias, 2);
  const linha = F.linhaConcepcaoPorServico(ps);
  verificar('linha por serviço mostra só os que têm diagnóstico', [linha.includes('Inseminação 67% (2 de 3)'), linha.includes('Monta natural 100% (1 de 1)'), linha.includes('IATF')], [true, true, false]);
  verificar('sem serviço informado em nenhum diagnóstico, a linha não aparece', F.linhaConcepcaoPorServico(F.calcularIndicadoresGrupo1([vaca], [cobS(5, null, 'vazia')], H).diagnosticoGestacao.porServico), '');
  verificar('o cartão inclui a linha por serviço', F.montarCartaoGrupo1(F.calcularIndicadoresGrupo1([vaca], evsS, H)).includes('Por tipo de serviço:'), true);

  // Cartão
  const cartao = (evs) => F.montarCartaoGrupo1(F.calcularIndicadoresGrupo1([vaca], evs, H));
  verificar('cartão mostra a taxa e as contagens', cartao([cobHa(200, { id: 3, diagnostico_gestacao: 'vazia', diagnostico_data: d(-150) }), cobHa(100, { id: 4, diagnostico_gestacao: 'prenhe', diagnostico_data: d(-50) })]).includes('50%') && cartao([cobHa(100, { diagnostico_gestacao: 'prenhe', diagnostico_data: d(-50) })]).includes('1 prenhe(s), 0 vazia(s)'), true);
  verificar('cartão sem diagnóstico diz que não há registro', cartao([cobHa(10)]).includes('Nenhum diagnóstico registrado'), true);
  verificar('cartão avisa quantas coberturas aguardam diagnóstico', cartao([cobHa(90)]).includes('1 cobertura(s) aguardando diagnóstico'), true);
}

console.log('\n--- indução de lactação (lactação sem gestação nem parto) ---');
{
  const H = '2026-10-10';
  const d = n => F.somarDias(H, n);
  const vaca = { id: 1, identificacao: '9', data_nascimento: '2022-01-01' };
  const ind = (dias, extra) => Object.assign({ id: 30, animal_id: 1, tipo: 'inducao_lactacao', data: d(-dias) }, extra || {});
  const aco = (evs) => F.calcularAcoesDoDia([vaca], evs, null, H);
  const grupo = (r, cod) => r.find(g => g.codigo === cod);

  verificar('parto e indução abrem lactação, o resto não', [F.ehInicioLactacao({ tipo: 'parto' }), F.ehInicioLactacao({ tipo: 'inducao_lactacao' }), F.ehInicioLactacao({ tipo: 'cobertura' }), F.ehInicioLactacao(null)], [true, true, false, false]);

  // Lote
  verificar('novilha com indução há 30 dias vira lactante', F.calcularLoteAnimal(vaca, [ind(30)], H), 'lactante');
  verificar('sem a indução, a mesma novilha continua novilha', F.calcularLoteAnimal(vaca, [], H), 'novilha');
  verificar('indução seguida de secagem: seca', F.calcularLoteAnimal(vaca, [ind(200), { tipo: 'secagem', data: d(-5) }], H), 'seca');
  verificar('induzida e depois coberta, a 53 dias do parto previsto: seca', F.calcularLoteAnimal(vaca, [ind(300), { tipo: 'cobertura', data: d(-230) }], H), 'seca');
  verificar('induzida e coberta há pouco: segue lactante', F.calcularLoteAnimal(vaca, [ind(100), { tipo: 'cobertura', data: d(-30) }], H), 'lactante');

  // DEL, partos e paridade
  const r1 = F.resumoReprodutivoAnimal([ind(40)], H, 0);
  verificar('DEL conta desde a indução', r1.del, 40);
  verificar('indução não conta como parto, nem na paridade, nem no IEP', [r1.partos, r1.paridade, r1.ultimoParto, r1.iep], [0, 0, null, null]);
  const r2 = F.resumoReprodutivoAnimal([{ tipo: 'parto', data: d(-500), natimorto: false }, ind(40)], H, 0);
  verificar('parto antigo e indução depois: o DEL vem da indução, mas só 1 parto conta', [r2.del, r2.partos, r2.iep], [40, 1, null]);
  verificar('indução seguida de secagem: sem DEL', F.resumoReprodutivoAnimal([ind(200), { tipo: 'secagem', data: d(-5) }], H, 0).del, null);

  // Indicadores: indução não vira primeiro parto
  const g1 = F.calcularIndicadoresGrupo1([vaca], [ind(40)], H);
  verificar('idade ao 1º parto não considera a indução', [g1.idadePrimeiroParto.elegiveis, g1.idadePrimeiroParto.excluidos], [0, 0]);

  // O que fazer hoje
  verificar('induzida há 100 dias sem cobertura NÃO recebe o aviso de "sem cobertura"', !!grupo(aco([ind(100)]), 'sem_cobertura'), false);
  verificar('indução depois de uma cobertura em aberto encerra o parto previsto', !!grupo(aco([{ id: 5, animal_id: 1, tipo: 'cobertura', data: d(-278) }, ind(5)]), 'parto'), false);
  const gs = grupo(aco([ind(300), { id: 5, animal_id: 1, tipo: 'cobertura', data: d(-230) }]), 'secagem');
  verificar('induzida e coberta: o aviso de secagem funciona (data de secar já passou)', !!gs && gs.itens[0].texto.includes('já passou'), true);
  verificar('induzida e coberta há 70 dias sem diagnóstico: entra no aviso de diagnóstico', !!grupo(aco([ind(200), { id: 5, animal_id: 1, tipo: 'cobertura', data: d(-70) }]), 'sem_diagnostico'), true);
  verificar('aborto não abre lactação', F.calcularLoteAnimal(vaca, [{ tipo: 'aborto', data: d(-30) }], H), 'novilha');
  verificar('vaca com parto e aborto depois: o DEL continua contado do parto', F.resumoReprodutivoAnimal([{ tipo: 'parto', data: d(-100) }, { tipo: 'aborto', data: d(-30) }], H, 0).del, 100);
  verificar('induzida, coberta e com secagem registrada depois da indução: sem aviso de secagem', !!grupo(aco([ind(300), { id: 5, animal_id: 1, tipo: 'cobertura', data: d(-230) }, { tipo: 'secagem', animal_id: 1, data: d(-3) }]), 'secagem'), false);
  verificar('coberta e depois induzida: a cobertura deixa de estar em aberto', F.coberturaEmAberto([{ id: 5, tipo: 'cobertura', data: d(-100) }, ind(10)]), null);
}

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


  // ---------- Produção em ano → mês → dias ----------
  console.log('\nProdução agrupada por ano e mês');
  {
    const R = (data, m, t) => ({ data, litros_manha:m, litros_tarde:t });
    const regs = [R('2026-10-02',100,50), R('2026-10-01',90,40), R('2026-08-15',10,5), R('2025-12-31',70,30), R('2025-12-30',60,null), R('2026-10-03','80','20')];
    const g = F.agruparProducaoPorAnoMes(regs, '2026-10-20');
    verificar('anos em ordem decrescente', g.map(x=>x.ano), [2026, 2025]);
    verificar('ano atual vai de outubro até janeiro (meses sem lançamento incluídos)', g[0].meses.map(m=>m.mes), [10,9,8,7,6,5,4,3,2,1]);
    verificar('ano passado só traz meses com registro', g[1].meses.map(m=>m.mes), [12]);
    const out = g[0].meses[0];
    verificar('outubro: total soma manhã+tarde (aceita texto numérico)', out.total, 380);
    verificar('outubro: dias lançados e média por dia lançado', [out.diasLancados, Math.round(out.media*10)/10], [3, 126.7]);
    verificar('dias do mês em ordem decrescente', out.registros.map(r=>r.data), ['2026-10-03','2026-10-02','2026-10-01']);
    verificar('mês sem lançamento: zeros e média 0', [g[0].meses[1].total, g[0].meses[1].diasLancados, g[0].meses[1].media], [0,0,0]);
    verificar('dezembro/2025: litro nulo conta como 0', g[1].meses[0].total, 160);
    verificar('total do ano', [g[0].total, g[1].total], [395, 160]);
    verificar('registro de 31/12 fica em dezembro, não em janeiro', g[1].meses[0].registros.length, 2);
    const vazio = F.agruparProducaoPorAnoMes([], '2027-02-10');
    verificar('sem dados: só o ano atual, jan e fev vazios', [vazio.length, vazio[0].ano, vazio[0].meses.map(m=>m.mes)], [1, 2027, [2,1]]);
    const futuro = F.agruparProducaoPorAnoMes([R('2027-01-05',1,1)], '2026-10-20');
    verificar('ano futuro com dados também aparece', futuro.map(x=>x.ano), [2027, 2026]);
    verificar('registros inválidos são ignorados', F.agruparProducaoPorAnoMes([null, {litros_manha:5}], '2026-01-10')[0].meses[0].diasLancados, 0);
    verificar('formatarLitros usa vírgula e 1 casa', [F.formatarLitros(12480), F.formatarLitros(416.666), F.formatarLitros(0)], ['12.480', '416,7', '0']);
  }


  // ---------- Gráfico da produção do mês no Início ----------
  console.log('\nProdução diária do mês (Início)');
  {
    const R = (data, m, t) => ({ data, litros_manha:m, litros_tarde:t });
    const regs = [R('2026-10-01',100,50), R('2026-10-03',80,'20'), R('2026-10-05',null,60), R('2026-09-30',999,999), R('2026-11-01',999,999), R('2026-10-20',0,0)];
    const r = F.calcularProducaoDiariaMes(regs, '2026-10-20');
    verificar('outubro tem 31 dias', r.nDias, 31);
    verificar('total do mês ignora outros meses', r.total, 150+100+60);
    verificar('dias lançados contam o dia com zero litro', r.diasLancados, 4);
    verificar('média por dia lançado', r.media, 310/4);
    verificar('dia sem lançamento fica null, dia com zero fica 0', [r.dias[1].litros, r.dias[19].litros], [null, 0]);
    verificar('máximo do mês', r.maximo, 150);
    verificar('fevereiro de 2028 (bissexto) tem 29 dias', F.calcularProducaoDiariaMes([], '2028-02-10').nDias, 29);
    verificar('fevereiro de 2026 tem 28 dias', F.calcularProducaoDiariaMes([], '2026-02-10').nDias, 28);
    verificar('mês sem dados: total 0, média 0', (x => [x.total, x.diasLancados, x.media])(F.calcularProducaoDiariaMes([], '2026-10-20')), [0,0,0]);
    verificar('registros inválidos são ignorados', F.calcularProducaoDiariaMes([null, {litros_manha:3}, {data:'2026-10-40', litros_manha:3}], '2026-10-20').diasLancados, 0);
    verificar('limite do eixo é um valor redondo', [0,7,10,11,24,150,380,1200,2600,4999].map(F.limiteEixoGrafico), [10,10,10,20,25,200,500,2000,5000,5000]);
    const svg = F.graficoProducaoMesHTML(r);
    verificar('gráfico: uma barra por dia com litros > 0 (3) e um alvo de toque por dia (31)', [(svg.match(/fill="var\(--azul\)"/g)||[]).length, (svg.match(/onclick=/g)||[]).length], [3, 31]);
    verificar('gráfico tem a linha da média', svg.includes('stroke-dasharray'), true);
    verificar('sem lançamentos, não há linha de média', F.graficoProducaoMesHTML(F.calcularProducaoDiariaMes([], '2026-10-20')).includes('stroke-dasharray'), false);
    const bloco = F.blocoProducaoMesInicioHTML(regs, '2026-10-20');
    verificar('bloco mostra título do mês, total e média', [bloco.includes('Produção de outubro'), bloco.includes('310 L'), bloco.includes('77,5 L')], [true, true, true]);
    verificar('mês vazio mostra orientação em vez de gráfico', (b => [b.includes('<svg'), b.includes('Ainda não há produção')])(F.blocoProducaoMesInicioHTML([], '2026-10-20')), [false, true]);
  }


  // ---------- Curva de lactação individual ----------
  console.log('\nCurva de lactação (por dias em lactação)');
  {
    const ev = (tipo, data) => ({ tipo, data });
    const eventos = [ev('parto','2024-01-10'), ev('secagem','2024-11-01'), ev('parto','2025-02-01'), ev('cobertura','2025-05-01'), ev('inducao_lactacao','2026-03-01'), ev('aborto','2025-09-09')];
    const l = F.lactacoesDoAnimal(eventos);
    verificar('três lactações (2 partos e 1 indução), em ordem', l.map(x=>[x.numero, x.inicio, x.tipoInicio]), [[1,'2024-01-10','parto'],[2,'2025-02-01','parto'],[3,'2026-03-01','inducao_lactacao']]);
    verificar('1ª termina na secagem', [l[0].ate, l[0].encerrada], ['2024-11-01', true]);
    verificar('2ª sem secagem termina no dia anterior à indução', [l[1].ate, l[1].encerrada], ['2026-02-28', true]);
    verificar('3ª (atual) está em andamento', [l[2].ate, l[2].encerrada], [null, false]);
    verificar('aborto e cobertura não abrem lactação', l.length, 3);
    verificar('secagem de uma lactação não fecha a seguinte', F.lactacoesDoAnimal([ev('parto','2025-01-01'), ev('secagem','2024-06-01')])[0].encerrada, false);
    verificar('secagem depois do próximo parto pertence ao próximo', F.lactacoesDoAnimal([ev('parto','2025-01-01'), ev('parto','2026-01-01'), ev('secagem','2026-09-01')]).map(x=>x.ate), ['2025-12-31','2026-09-01']);
    verificar('sem parto nem indução: nenhuma lactação', F.lactacoesDoAnimal([ev('cobertura','2025-01-01'), ev('cio','2025-02-01')]), []);
    verificar('entrada vazia ou nula', [F.lactacoesDoAnimal(null), F.lactacoesDoAnimal([null])], [[], []]);

    const lact = { inicio:'2026-01-01', ate:'2026-01-20' };
    const P = (data, m, t) => ({ data, litros_manha:m, litros_tarde:t });
    const prod = [P('2025-12-31',99,99), P('2026-01-01',5,5), P('2026-01-02',8,'7'), P('2026-01-05',20,10), P('2026-01-20',9,null), P('2026-01-21',99,99)];
    const pts = F.pontosCurvaLactacao(prod, lact);
    verificar('pontos só dentro da lactação (inclui o primeiro e o último dia)', pts.map(q=>q.data), ['2026-01-01','2026-01-02','2026-01-05','2026-01-20']);
    verificar('DEL = dias desde o início; litros somam manhã+tarde', pts.map(q=>[q.del, q.litros]), [[0,10],[1,15],[4,30],[19,9]]);
    verificar('suavização usa vizinhos a até 3 dias de DEL', pts.map(q=>Math.round(q.suave*100)/100), [12.5, 18.33, 22.5, 9]);
    verificar('lactação aberta aceita registros depois', F.pontosCurvaLactacao(prod, { inicio:'2026-01-01', ate:null }).length, 5);
    verificar('registros do mesmo dia são somados', F.pontosCurvaLactacao([P('2026-01-03',1,1), P('2026-01-03',2,2)], lact)[0].litros, 6);
    verificar('sem registros na lactação: sem pontos e sem resumo', [F.pontosCurvaLactacao([], lact), F.resumoCurvaLactacao([])], [[], null]);
    const rs = F.resumoCurvaLactacao(pts);
    verificar('resumo: início, pico (da curva suavizada) e último', [rs.inicio, [rs.pico.del, Math.round(rs.pico.litros*100)/100], rs.ultimo, rs.nDias], [{del:0,litros:10}, [4, 22.5], {del:19,litros:9}, 4]);
    const pico1 = F.resumoCurvaLactacao(F.pontosCurvaLactacao([P('2026-01-01',10,10), P('2026-01-02',10,10), P('2026-01-03',10,10), P('2026-01-04',10,10), P('2026-01-05',40,40), P('2026-01-06',10,10), P('2026-01-07',10,10), P('2026-01-08',10,10), P('2026-01-09',10,10)], { inicio:'2026-01-01', ate:null }));
    verificar('um dia isolado muito alto não vira o pico sozinho (pico = média móvel)', pico1.pico.litros < 40, true);
    const P2 = (d, l) => ({ data:d, litros_manha:l, litros_tarde:0 });
    const sp = F.resumoCurvaLactacao(F.pontosCurvaLactacao([P2('2026-01-01',20), P2('2026-01-02',20), P2('2026-01-03',20), P2('2026-01-04',20), P2('2026-01-05',20), P2('2026-01-20',10), P2('2026-01-21',25), P2('2026-01-22',10)], { inicio:'2026-01-01', ate:null }));
    verificar('pico fica onde a média de 7 dias é maior, não no maior valor bruto isolado', [sp.pico.del < 10, sp.pico.litros], [true, 20]);
    const svg = F.curvaLactacaoSVG(pts, rs);
    verificar('SVG: um ponto por dia registrado, marcador do pico e um único toque no gráfico', [(svg.match(/r="2"/g)||[]).length, (svg.match(/onclick=/g)||[]).length, svg.includes('Pico 22,5 L')], [4, 1, true]);
    const xDe = del => F.CURVA_ESQ + del / F.xMaxCurvaLactacao(pts) * (F.CURVA_W - F.CURVA_ESQ - F.CURVA_DIR);
    verificar('eixo x vai até o múltiplo de 30 acima do último DEL (mínimo 90)', [F.xMaxCurvaLactacao(pts), F.xMaxCurvaLactacao([{del:100}]), F.xMaxCurvaLactacao([{del:305}])], [90, 120, 330]);
    const longo = [{del:0,litros:1,data:'a'},{del:100,litros:1,data:'b'}];
    verificar('toque usa a escala do eixo real (lactação longa)', F.pontoMaisProximoCurva(longo, F.CURVA_ESQ + 60/120*(F.CURVA_W - F.CURVA_ESQ - F.CURVA_DIR)).del, 100);
    verificar('toque escolhe o ponto de DEL mais próximo', [F.pontoMaisProximoCurva(pts, xDe(0.5)).del, F.pontoMaisProximoCurva(pts, xDe(3)).del, F.pontoMaisProximoCurva(pts, xDe(15)).del, F.pontoMaisProximoCurva(pts, xDe(80)).del, F.pontoMaisProximoCurva([], 100)], [0, 4, 19, 19, null]);
    verificar('descrição da lactação', [F.descricaoLactacao(l[0]), F.descricaoLactacao(l[2])], ['1ª lactação · Parto em 10/01/2024 · até 01/11/2024', '3ª lactação · Indução em 01/03/2026 · em andamento']);
    const h = F.curvaLactacaoHTML(l, 2, [P('2026-03-05',20,10), P('2026-03-06',22,10)]);
    verificar('HTML: atual por padrão traz seletor com "(atual)" e botões de lactações anteriores', [h.includes('3ª (atual)'), h.includes('selecionarLactacaoCurva(0)'), h.includes('em andamento'), h.includes('<svg')], [true, true, true, true]);
    verificar('uma lactação só: sem seletor', F.curvaLactacaoHTML([l[0]], 0, [P('2024-02-01',5,5)]).includes('selecionarLactacaoCurva'), false);
    verificar('lactação sem registros: mensagem, sem gráfico', (x => [x.includes('<svg'), x.includes('Nenhum registro de ordenha')])(F.curvaLactacaoHTML(l, 0, [P('2026-03-05',20,10)])), [false, true]);
  }


  // ---------- Busca de animal pelo número ----------
  console.log('\nBusca em "Meus animais"');
  {
    const A = (id, ident) => ({ id, identificacao: ident });
    const lista = [A(1,'042'), A(2,'536'), A(3,'1042'), A(4,'Mimosa 5'), A(5,'42'), A(6,'AÇÚCAR'), A(7,null), A(8,'420')];
    const ids = t => F.filtrarAnimaisPorBusca(lista, t).map(a=>a.id);
    verificar('sem termo (ou só espaços) devolve todos, na ordem original', [ids(''), ids('   '), ids(null)], [[1,2,3,4,5,6,7,8], [1,2,3,4,5,6,7,8], [1,2,3,4,5,6,7,8]]);
    verificar('número exato primeiro, depois os que começam igual, depois os que contêm', ids('42'), [5, 8, 1, 3]);
    verificar('o número exato vem antes de um que apenas começa igual, mesmo cadastrado depois', F.filtrarAnimaisPorBusca([A(1,'420'), A(2,'42')], '42').map(x=>x.id), [2, 1]);
    verificar('número único encontra só ele', ids('536'), [2]);
    verificar('trecho no meio do número', ids('04'), [1, 3]);
    verificar('sem resultado devolve lista vazia', ids('999'), []);
    verificar('ignora maiúscula, acento e espaços nas pontas', [ids('  mimosa'), ids('acucar'), ids('AÇÚCAR ')], [[4], [6], [6]]);
    verificar('identificação vazia (null) não quebra nem aparece', ids('0'), [1, 3, 8]);
    verificar('a lista original não é alterada', lista.map(a=>a.id), [1,2,3,4,5,6,7,8]);
    verificar('normalizar: texto, número e nulo', [F.normalizarBuscaAnimal(' Á1 '), F.normalizarBuscaAnimal(42), F.normalizarBuscaAnimal(undefined)], ['a1', '42', '']);
  }


  // ---------- Aba Reprodução (painel do rebanho) ----------
  console.log('\nAba Reprodução');
  {
    const hoje = '2026-10-20';
    const d = n => F.somarDias(hoje, n);
    const animais = [1,2,3,4,5,6,7,8,9].map(i => ({ id:i, identificacao:String(100+i) }));
    let seq = 0;
    const E = (animal_id, tipo, data, extra) => ({ id: ++seq, animal_id, tipo, data, ...(extra||{}) });
    const eventos = [
      E(1,'parto', d(-400)), E(1,'cobertura', d(-270)),                         // parto previsto em 13 dias
      E(2,'cobertura', d(-283)),                                                // parto previsto hoje
      E(3,'cobertura', d(-290), { diagnostico_gestacao:'vazia', diagnostico_data: d(-250) }), // vazia: sem previsão
      E(4,'cobertura', d(-100), { diagnostico_gestacao:'prenhe', diagnostico_data: d(-60), tipo_servico:'iatf' }), // parto em 183 dias
      E(5,'cobertura', d(-340)),                                                // previsão passou há 57 dias: dado antigo
      E(6,'parto', d(-290)),                                                    // secagem prevista em 15 dias
      E(7,'parto', d(-100)),                                                    // secagem em 205 dias: fora do painel
      E(8,'cio', d(-20)),                                                       // próximo cio em 1 dia
      E(9,'cio', d(-30)),                                                       // ciclo passou há 9 dias: some
      E(99,'cobertura', d(-100)),                                               // animal que não existe mais
      E(6,'cio', d(-300)),                                                      // evento antigo do 6, não é o último
    ];
    const pn = F.calcularPainelReprodutivo(animais, eventos, hoje);
    verificar('partos previstos: ordem por data, sem vazia, sem dado antigo e sem animal inexistente', pn.partos.map(x=>[x.identificacao, x.dias]), [['102',0],['101',13],['104',183]]);
    verificar('parto: situação e tipo de serviço seguem a cobertura', pn.partos.map(x=>[x.situacao, x.servico]), [['presumida',null],['presumida',null],['confirmada','iatf']]);
    verificar('secagens: só as dos próximos 60 dias (ou atrasadas recentes)', pn.secagens.map(x=>[x.identificacao, x.dias]), [['106',15]]);
    verificar('cios: só o ciclo ainda atual', pn.cios.map(x=>[x.identificacao, x.dias]), [['108',1]]);
    verificar('cobertura depois do parto tira a vaca da lista de secagens', pn.secagens.some(x=>x.identificacao==='101'), false);
    verificar('previsão passada há pouco aparece como atrasada (dias negativos)', F.calcularPainelReprodutivo(animais, [E(1,'cobertura', d(-290))], hoje).partos.map(x=>x.dias), [-7]);
    verificar('exatamente no limite de dado antigo ainda aparece; um dia depois não', [F.calcularPainelReprodutivo(animais, [E(1,'cobertura', d(-283-45))], hoje).partos.length, F.calcularPainelReprodutivo(animais, [E(1,'cobertura', d(-283-46))], hoje).partos.length], [1, 0]);
    verificar('secagem atrasada há 45 dias ainda aparece; 46 não', [F.calcularPainelReprodutivo(animais, [E(1,'parto', d(-305-45))], hoje).secagens.length, F.calcularPainelReprodutivo(animais, [E(1,'parto', d(-305-46))], hoje).secagens.length], [1, 0]);
    verificar('secagem em exatamente 60 dias aparece; em 61 não', [F.calcularPainelReprodutivo(animais, [E(1,'parto', d(-305+60))], hoje).secagens.length, F.calcularPainelReprodutivo(animais, [E(1,'parto', d(-305+61))], hoje).secagens.length], [1, 0]);
    verificar('indução também prevê secagem', F.calcularPainelReprodutivo(animais, [E(1,'inducao_lactacao', d(-300))], hoje).secagens.map(x=>x.dias), [5]);
    verificar('último evento aborto ou secagem: nenhuma previsão', (x => [x.partos.length, x.secagens.length, x.cios.length])(F.calcularPainelReprodutivo(animais, [E(1,'cobertura', d(-100)), E(1,'aborto', d(-10)), E(2,'parto', d(-300)), E(2,'secagem', d(-5))], hoje)), [0,0,0]);
    verificar('mesmo dia: vale o evento de id maior', F.calcularPainelReprodutivo(animais, [E(1,'cio', d(-1)), E(1,'cobertura', d(-1))], hoje).partos.length, 1);
    verificar('mesmo dia, array em ordem contrária à dos ids: ainda vale o id maior', F.calcularPainelReprodutivo(animais, [{id:5, animal_id:1, tipo:'cobertura', data:d(-1)}, {id:4, animal_id:1, tipo:'cio', data:d(-1)}], hoje).partos.length, 1);
    verificar('entradas vazias ou nulas', [F.calcularPainelReprodutivo(null, null, hoje), F.calcularPainelReprodutivo(animais, [null], hoje)], [{partos:[],secagens:[],cios:[]}, {partos:[],secagens:[],cios:[]}]);
    verificar('texto do prazo', [0,1,-1,12,-5].map(F.textoPrazoDias), ['hoje','amanhã','ontem','em 12 dias','há 5 dias']);

    const h = F.filtrarHistoricoRebanho(eventos, animais, 'todos', 4);
    verificar('histórico: mais recente primeiro, limitado, com o total e sem animal inexistente', [h.itens.map(x=>x.identificacao), h.total], [['108','109','107','104'], 11]);
    verificar('histórico ordenado do mais recente para o mais antigo', h.itens.every((x,i,a)=> i===0 || a[i-1].data >= x.data), true);
    verificar('histórico filtrado por tipo', F.filtrarHistoricoRebanho(eventos, animais, 'cio', 50).itens.map(x=>x.identificacao), ['108','109','106']);
    verificar('histórico: tipo sem eventos', F.filtrarHistoricoRebanho(eventos, animais, 'aborto', 50), { total:0, itens:[] });
    verificar('histórico: no mesmo dia vale o id maior primeiro', F.filtrarHistoricoRebanho([E(1,'cio','2026-01-01'), E(2,'cio','2026-01-01')], animais, 'todos', 5).itens.map(x=>x.animal_id), [2,1]);
  }


  // ---------- Preço do leite e valor recebido ----------
  console.log('\nPreço do leite (bruto, líquido e imposto retido)');
  {
    const R = (data, m, t) => ({ data, litros_manha:m, litros_tarde:t });
    const prod = [R('2026-10-01',100,50), R('2026-10-31',200,'50'), R('2026-09-30',999,999), R('2026-11-01',999,999), R('2026-10-15',null,10), null];
    verificar('litros do mês: soma manhã+tarde só do mês (inclui dia 1 e dia 31, aceita texto e nulo)', F.litrosDoMes(prod, '2026-10'), 410);
    verificar('mês sem produção: zero', [F.litrosDoMes(prod, '2026-08'), F.litrosDoMes(null, '2026-10')], [0, 0]);

    const v = F.calcularValoresLeiteMes(10000, 2.35, 2.2);
    verificar('valores: bruto, líquido e imposto = diferença', [v.bruto, v.liquido, v.imposto], [23500, 22000, 1500]);
    verificar('imposto em % do bruto', Math.round(v.impostoPct*100)/100, 6.38);
    const c = F.calcularValoresLeiteMes(1234.5, 2.3333, 2.1111);
    verificar('centavos arredondados e a diferença bate com bruto − líquido', [c.bruto, c.liquido, c.imposto, Math.round((c.bruto - c.liquido)*100)/100], [2880.46, 2606.15, 274.31, 274.31]);
    verificar('sem litros: tudo zero e sem percentual', (z => [z.bruto, z.liquido, z.imposto, z.impostoPct])(F.calcularValoresLeiteMes(0, 2.3, 2.1)), [0, 0, 0, null]);
    verificar('bruto igual ao líquido: imposto zero', F.calcularValoresLeiteMes(100, 2, 2).imposto, 0);

    verificar('validação aceita vírgula e ponto', [F.validarPrecosLeite('2,35', '2.2'), F.validarPrecosLeite(' 2,3500 ', '2,2')], [{ok:true, bruto:2.35, liquido:2.2}, {ok:true, bruto:2.35, liquido:2.2}]);
    verificar('validação recusa vazio, zero, negativo e texto', ['', '0', '-1', 'abc', null].map(x => F.validarPrecosLeite(x, '2').ok), [false, false, false, false, false]);
    verificar('validação recusa líquido maior que bruto', F.validarPrecosLeite('2', '2,5').ok, false);
    verificar('validação aceita líquido igual ao bruto', F.validarPrecosLeite('2', '2').ok, true);
    verificar('validação recusa preço absurdo (total da nota no lugar do preço)', [F.validarPrecosLeite('20', '19').ok, F.validarPrecosLeite('20,01', '19').ok, F.validarPrecosLeite('9500', '8700').ok], [true, false, false]);
    verificar('mensagens de erro distintas', [F.validarPrecosLeite('', '').erro.includes('maiores que zero'), F.validarPrecosLeite('999','1').erro.includes('alto demais'), F.validarPrecosLeite('2','3').erro.includes('não pode ser maior')], [true, true, true]);

    verificar('opções de mês: produção, preço salvo e mês atual, do mais recente ao mais antigo, sem repetir', F.opcoesMesesPreco([R('2026-08-10',1,1), R('2026-08-11',1,1), R('2026-06-01',1,1)], [{mes:'2026-07-01'}, {mes:'2026-08-01'}], '2026-10-20'), ['2026-10','2026-08','2026-07','2026-06']);
    verificar('opções de mês sem dados: só o mês atual', F.opcoesMesesPreco(null, null, '2026-10-20'), ['2026-10']);
    const precos = [{ mes:'2026-08-01', preco_bruto_litro:'2.4', preco_liquido_litro:'2.2' }, { mes:'2026-10-01', preco_bruto_litro:2.5, preco_liquido_litro:2.3 }, null, { preco_bruto_litro:1 }];
    const ln = F.montarLinhasPrecoLeite(precos, prod);
    verificar('ficha: um item por mês com preço, mais recente primeiro; ignora linhas inválidas', ln.map(x=>x.chave), ['2026-10','2026-08']);
    verificar('ficha: outubro tem 410 L, bruto 1.025, líquido 943, imposto 82', [ln[0].litros, ln[0].valorBruto, ln[0].valorLiquido, ln[0].imposto], [410, 1025, 943, 82]);
    verificar('ficha: mês com preço e sem produção fica zerado (não some)', [ln[1].litros, ln[1].valorBruto, ln[1].imposto], [0, 0, 0]);
    const sem = F.montarLinhasPrecoLeite(precos, null);
    verificar('sem permissão de produção: litros e valores são nulos (nunca zero), preços aparecem', [sem[0].litros, sem[0].valorBruto, sem[0].imposto, sem[0].impostoPct, sem[0].precoBruto], [null, null, null, null, 2.5]);
    verificar('lista vazia ou nula', [F.montarLinhasPrecoLeite([], prod), F.montarLinhasPrecoLeite(null, prod)], [[], []]);
    const th = F.htmlTabelaPrecoLeite(ln);
    verificar('tabela: cabeçalho, mês, valores em reais e imposto com percentual', [th.includes('Valor líquido'), th.includes('Outubro de 2026'), th.replace(/\u00a0/g, ' ').includes('R$ 1.025,00'), th.includes('(8,0%)')], [true, true, true, true]);
    verificar('tabela sem permissão de produção mostra traço e a explicação', (t => [t.includes('—'), t.includes('permissão de Produção')])(F.htmlTabelaPrecoLeite(sem)), [true, true]);
    verificar('tabela sem preços: mensagem', F.htmlTabelaPrecoLeite([]).includes('Nenhum preço informado'), true);
    verificar('tabela escapa HTML do rótulo (não há entrada de usuário, mas o rótulo passa por escape)', F.htmlTabelaPrecoLeite([{ ...ln[0], rotulo:'<b>x</b>' }]).includes('<b>x</b>'), false);
    verificar('excel: colunas e valores arredondados', F.linhasExcelPrecoLeite(ln)[0], { mes:'2026-10', litros_lancados:410, preco_bruto_litro:2.5, preco_liquido_litro:2.3, valor_bruto:1025, valor_liquido:943, imposto_retido:82, imposto_pct:8 });
    verificar('excel: percentual com duas casas', F.linhasExcelPrecoLeite(F.montarLinhasPrecoLeite([{ mes:'2026-10-01', preco_bruto_litro:2.35, preco_liquido_litro:2.2 }], [{ data:'2026-10-02', litros_manha:5000, litros_tarde:5000 }]))[0].imposto_pct, 6.38);
    verificar('excel sem produção: células vazias, não zero', (o => [o.litros_lancados, o.valor_bruto, o.imposto_retido, o.imposto_pct, o.preco_bruto_litro])(F.linhasExcelPrecoLeite(sem)[0]), ['', '', '', '', 2.5]);
    verificar('rótulo do mês', [F.rotuloMesAno('2026-01'), F.rotuloMesAno('2026-12')], ['Janeiro de 2026', 'Dezembro de 2026']);
    verificar('reais no formato brasileiro', F.formatarReais(1234.5).replace(/\s| /g, ' '), 'R$ 1.234,50');
  }

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
