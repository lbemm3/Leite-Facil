#!/usr/bin/env node
/*
 * LeiteFácil — testes das regras da função avisos-diarios (notificações das 7h)
 * ------------------------------------------------------------------------------
 * Abre supabase/functions/avisos-diarios/index.ts (a cópia do código da Edge
 * Function guardada no projeto), tira os tipos do TypeScript e roda as regras
 * puras (as que não acessam o banco) com casos conhecidos.
 *
 * Como rodar: `node testes/testar-avisos-diarios.js` (Node 22.13 ou mais novo;
 * o aviso "ExperimentalWarning" que aparece é normal).
 * Se o arquivo da função não existir na pasta, o teste só avisa e termina sem erro.
 */
const fs = require('fs');
const path = require('path');
const mod = require('module');

const CAMINHO = path.join(__dirname, '..', 'supabase', 'functions', 'avisos-diarios', 'index.ts');
if(!fs.existsSync(CAMINHO)){
  console.log('Arquivo da função não encontrado (' + CAMINHO + '). Nada a testar.');
  process.exit(0);
}
process.removeAllListeners('warning');
const ts = fs.readFileSync(CAMINHO, 'utf8').replace(/^import .*$/mg, '');
const js = mod.stripTypeScriptTypes(ts);
const F = new Function('Deno', js + '\nreturn { somarDias, avisoDispensadoAtivo, chavesDispensadasAtivas, chaveAvisoQualidade, calcularAvisosReprodutivos, ordenarPorDataEId, lerTodasAsLinhas };')({ serve(){}, env: { get(){ return undefined; } } });

let total = 0, falhas = 0;
function verificar(descricao, obtido, esperado){
  total++;
  if(JSON.stringify(obtido) !== JSON.stringify(esperado)){
    falhas++;
    console.log('❌ ' + descricao + '\n   esperado: ' + JSON.stringify(esperado) + '\n   obtido:   ' + JSON.stringify(obtido));
  } else console.log('✅ ' + descricao);
}

const H = '2026-10-10';
const d = n => F.somarDias(H, n);
const ini = d(-1), fim = d(3);
const nomes = { 1: '536', 2: '12' };
const calc = (evs, desp) => F.calcularAvisosReprodutivos(evs, nomes, H, ini, fim, F.chavesDispensadasAtivas(desp || [], H));
const tipos = r => r.avisos.map(a => a.tipo);
// cobertura cujo parto previsto cai em 2 dias
const cobParto = (extra) => ({ id: 20, animal_id: 1, tipo: 'cobertura', data: d(2 - 283), ...(extra || {}) });

console.log('\n--- baixa e adiamento ---');
verificar('sem baixa: baixa sem data vale', F.avisoDispensadoAtivo({ chave: 'x', ate: null }, H), true);
verificar('adiamento até amanhã vale hoje', F.avisoDispensadoAtivo({ chave: 'x', ate: d(1) }, H), true);
verificar('adiamento que termina hoje já não vale', F.avisoDispensadoAtivo({ chave: 'x', ate: H }, H), false);
verificar('registro ausente não vale', F.avisoDispensadoAtivo(undefined, H), false);

console.log('\n--- previsão de parto ---');
verificar('cobertura com parto em 2 dias avisa', tipos(calc([cobParto()])), ['previsao_parto']);
verificar('o texto traz o animal e a data', calc([cobParto()]).avisos[0].corpo, 'Animal 536 — previsão para ' + F.somarDias(H, 2).split('-').reverse().join('/'));
verificar('parto fora da janela não avisa', tipos(calc([{ ...cobParto(), data: d(10 - 283) }])), []);
verificar('diagnosticada prenhe avisa', tipos(calc([cobParto({ diagnostico_gestacao: 'prenhe' })])), ['previsao_parto']);
verificar('diagnosticada vazia NÃO avisa', tipos(calc([cobParto({ diagnostico_gestacao: 'vazia' })])), []);
verificar('secagem registrada depois da cobertura não esconde o aviso de parto', tipos(calc([cobParto(), { id: 21, animal_id: 1, tipo: 'secagem', data: d(-30) }])), ['previsao_parto']);
verificar('parto registrado depois da cobertura encerra o aviso', tipos(calc([cobParto(), { id: 21, animal_id: 1, tipo: 'parto', data: d(-1) }])), []);
verificar('aborto depois da cobertura encerra o aviso', tipos(calc([cobParto(), { id: 21, animal_id: 1, tipo: 'aborto', data: d(-5) }])), []);
verificar('cio depois da cobertura encerra o aviso de parto', tipos(calc([cobParto(), { id: 21, animal_id: 1, tipo: 'cio', data: d(-30) }])).includes('previsao_parto'), false);

console.log('\n--- baixa no app silencia o push de parto ---');
const chaveParto = 'parto|1|' + d(2);
let r = calc([cobParto()], [{ chave: chaveParto, ate: null }]);
verificar('baixa sem data: nada é enviado e fica registrado como ocultado', [tipos(r), r.ocultos.length], [[], 1]);
r = calc([cobParto()], [{ chave: chaveParto, ate: d(3) }]);
verificar('adiamento em vigor: nada é enviado', tipos(r), []);
r = calc([cobParto()], [{ chave: chaveParto, ate: H }]);
verificar('adiamento vencido: o aviso volta', tipos(r), ['previsao_parto']);
r = calc([cobParto()], [{ chave: 'parto|1|2000-01-01', ate: null }]);
verificar('baixa de outra ocorrência (outra data) não silencia este parto', tipos(r), ['previsao_parto']);
r = calc([cobParto()], [{ chave: 'parto|2|' + d(2), ate: null }]);
verificar('baixa de outra vaca não silencia esta', tipos(r), ['previsao_parto']);
r = calc([cobParto()], []);
verificar('sem nenhuma baixa, avisa normalmente', tipos(r), ['previsao_parto']);

console.log('\n--- secagem e cio continuam como antes ---');
verificar('parto há 305 dias − 2: previsão de secagem em 2 dias avisa', tipos(calc([{ id: 30, animal_id: 2, tipo: 'parto', data: d(2 - 305) }])), ['previsao_secagem']);
verificar('secagem registrada depois do parto: sem previsão de secagem', tipos(calc([{ id: 30, animal_id: 2, tipo: 'parto', data: d(2 - 305) }, { id: 31, animal_id: 2, tipo: 'secagem', data: d(-1) }])), []);
verificar('cio há 19 dias: previsão do próximo cio em 2 dias', tipos(calc([{ id: 40, animal_id: 2, tipo: 'cio', data: d(2 - 21) }])), ['previsao_cio']);
verificar('várias vacas: cada uma com o seu aviso', tipos(calc([cobParto(), { id: 41, animal_id: 2, tipo: 'cio', data: d(2 - 21) }])).sort(), ['previsao_cio', 'previsao_parto']);

console.log('\n--- indução de lactação ---');
verificar('indução depois da cobertura encerra o aviso de parto', tipos(calc([cobParto(), { id: 21, animal_id: 1, tipo: 'inducao_lactacao', data: d(-1) }])), []);
verificar('indução registrada ANTES da cobertura não atrapalha o aviso', tipos(calc([{ id: 5, animal_id: 1, tipo: 'inducao_lactacao', data: d(-400) }, cobParto()])), ['previsao_parto']);
verificar('indução sozinha, 305 dias atrás: sem previsão de secagem por tempo', tipos(calc([{ id: 50, animal_id: 2, tipo: 'inducao_lactacao', data: d(2 - 305) }])), []);
verificar('indução depois do cio: sem previsão de cio', tipos(calc([{ id: 51, animal_id: 2, tipo: 'cio', data: d(2 - 21) }, { id: 52, animal_id: 2, tipo: 'inducao_lactacao', data: d(-1) }])), []);

console.log('\n--- eventos no mesmo dia: desempate pelo id ---');
const mesmoDia = d(2 - 283);
// a lista chega em ordem contrária à dos ids, de propósito
verificar('cobertura (id 20) e depois cio (id 21) no mesmo dia: o cio vale, sem aviso de parto', tipos(calc([{ id: 21, animal_id: 1, tipo: 'cio', data: mesmoDia }, { id: 20, animal_id: 1, tipo: 'cobertura', data: mesmoDia }])), []);
verificar('cio (id 20) e depois cobertura (id 21) no mesmo dia: a cobertura vale, avisa o parto', tipos(calc([{ id: 21, animal_id: 1, tipo: 'cobertura', data: mesmoDia }, { id: 20, animal_id: 1, tipo: 'cio', data: mesmoDia }])), ['previsao_parto']);
verificar('ids de tamanhos diferentes: 9 vem antes de 10', F.ordenarPorDataEId([{ id: 10, data: H }, { id: 9, data: H }, { id: 100, data: d(-1) }]).map(e => e.id), [100, 9, 10]);
verificar('a ordenação não altera a lista recebida', (() => { const l = [{ id: 2, data: H }, { id: 1, data: H }]; F.ordenarPorDataEId(l); return l.map(e => e.id); })(), [2, 1]);

console.log('\n--- leitura em páginas de 1000 linhas ---');
// consulta falsa: imita o Supabase (devolve no máximo 1000 linhas por .range)
function consultaFalsa(linhas, falharNaPagina){
  const pedidos = [];
  const montar = () => {
    let ordens = [];
    const q = {
      order(coluna){ ordens.push(coluna); return q; },
      async range(de, ate){
        pedidos.push({ de, ate, ordens: ordens.slice() });
        if(falharNaPagina !== undefined && pedidos.length === falharNaPagina) return { data: null, error: { message: 'falhou' } };
        return { data: linhas.slice(de, Math.min(ate, de + 999) + 1), error: null };
      }
    };
    return q;
  };
  return { montar, pedidos };
}
const gerar = n => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
(async () => {
  for(const [n, paginas] of [[0, 1], [999, 1], [1000, 2], [1001, 2], [2500, 3]]){
    const c = consultaFalsa(gerar(n));
    const r = await F.lerTodasAsLinhas(c.montar);
    verificar(n + ' linhas: todas lidas em ' + paginas + ' consulta(s), sem repetir', [r.data.length, new Set(r.data.map(x => x.id)).size, c.pedidos.length, r.error], [n, n, paginas, null]);
  }
  let c = consultaFalsa(gerar(10));
  await F.lerTodasAsLinhas(c.montar, 'data');
  verificar('ordena por data (quando pedido) e depois por id', c.pedidos[0].ordens, ['data', 'id']);
  c = consultaFalsa(gerar(10));
  await F.lerTodasAsLinhas(c.montar);
  verificar('sem ordem extra, ordena por id', c.pedidos[0].ordens, ['id']);
  c = consultaFalsa(gerar(2500), 2);
  const r = await F.lerTodasAsLinhas(c.montar);
  verificar('erro numa página: devolve o erro e nenhum dado (nada de lista cortada)', [r.data, r.error && r.error.message], [null, 'falhou']);
  finalizar();
})();

function finalizar(){
console.log('\n--- chave do aviso de qualidade (igual à do app) ---');
verificar('nível e data do último resultado', F.chaveAvisoQualidade('alerta', [{ data: '2026-09-01' }, { data: '2026-09-20' }, { data: '2026-09-10' }]), 'qualidade|alerta|2026-09-20');
verificar('sem resultados usa "sem-data"', F.chaveAvisoQualidade('atencao', []), 'qualidade|atencao|sem-data');

console.log('\n' + '-'.repeat(50));
console.log(total + ' verificações, ' + falhas + ' falha(s).');
process.exit(falhas ? 1 : 0);
}