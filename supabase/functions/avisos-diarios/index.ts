// Edge Function: avisos-diarios
//
// O que ela faz: roda sozinha uma vez por dia (você vai agendar isso no
// passo do "Cron", explicado abaixo), e para cada produtor que tem avisos
// no celular ativados, calcula os mesmos avisos que já aparecem na tela de
// Início do app:
//   - Previsão de parto (cobertura + 283 dias)
//   - Previsão de secagem (parto + 305 dias)
//   - Fim da carência de medicamento
//   - Resumo semanal de cios (toda segunda-feira; ver a atualização de 06/11/2026)
//   - Próxima dose de vacina/tratamento prevista (campo preenchido na hora
//     de registrar o evento sanitário)
//   - Qualidade do leite fora ou perto do limite legal (90 dias)
// Cada aviso só é enviado UMA VEZ (guardamos isso na tabela
// avisos_enviados, para não mandar a mesma notificação repetida todo dia).
//
// Atualização de 12/10/2026 (rode antes liberar-avisos-dispensados-para-a-funcao.sql):
//   - Vaca com diagnóstico de gestação "vazia" na última cobertura não recebe
//     mais aviso de previsão de parto.
//   - Parto e qualidade do leite que o produtor deu baixa ou adiou na tela de
//     Início (tabela avisos_dispensados) não geram mais notificação.
//   - A previsão de parto agora olha a última COBERTURA/cio/aborto/parto da vaca,
//     como a tela de Início já fazia. Antes, uma "Secagem" registrada depois da
//     cobertura escondia o aviso de parto da vaca seca.
//   - Se a leitura de avisos_dispensados falhar, o aviso é enviado do mesmo jeito
//     (melhor um aviso a mais do que um a menos) e o erro aparece na resposta.
//
// Atualização de 23/10/2026 (não precisa rodar SQL; é só colar a função de novo e fazer Deploy):
//   - A indução de lactação passou a contar como "último evento relevante", igual ao app.
//     Vaca induzida depois de uma cobertura deixa de receber aviso de parto, e a indução
//     sozinha não gera previsão de secagem por tempo (só o parto gera).
//   - Eventos no mesmo dia são desempatados pelo id, como o app faz. Antes, a ordem entre
//     eles ficava por conta do Postgres e podia mudar de um dia para o outro.
//   - Todas as consultas leem em páginas de 1000 linhas (o Supabase devolve no máximo 1000
//     por consulta; produtor com histórico longo ficava com a lista cortada).
//   - Esta função agora também fica guardada no projeto, em
//     supabase/functions/avisos-diarios/index.ts, e é testada por
//     testes/testar-avisos-diarios.js a cada publicação.
//
// Atualização de 06/11/2026 (rode antes liberar-conferencias-cio-para-a-funcao.sql):
//   - O aviso de cio vaca por vaca (21 dias fixos depois do último cio) foi substituído por UM resumo na
//     segunda-feira: "N vacas para observar nesta semana", com as vacas que provavelmente entram em cio
//     hoje e nos 6 dias seguintes e as cobertas com retorno ao cio previsto aos 21 e 42 dias.
//   - As datas são as mesmas da ficha da vaca e da tela de Início: o ciclo é o da própria vaca (média dos cios
//     registrados, quando há pelo menos 2 intervalos normais) ou 21 dias. As regras foram copiadas do app e o teste
//     testes/testar-equivalencia-cio.js garante que continuam iguais.
//   - Vaca coberta que já respondeu "não" à pergunta "A vaca entrou em cio?" no app não entra no resumo
//     (por isso a função passou a ler a tabela conferencias_cio).
//   - O resumo sai só na segunda-feira, uma vez por semana. Para testar em outro dia, use o botão Test com o
//     corpo {"forcar_resumo_semanal": true}.
//
// Como criar no painel do Supabase (igual fizemos com a enviar-push):
// 1. Rode antes o script sql-etapa12-parte2-avisos-enviados.sql no SQL Editor.
// 2. Edge Functions → Create a new function → nome exato: avisos-diarios
// 3. Apague o código de exemplo, cole todo o conteúdo deste arquivo, Deploy.
// 4. Essa função usa os MESMOS secrets que já configuramos na enviar-push
//    (VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY) — não precisa cadastrar de novo,
//    os secrets valem para todas as funções do projeto.
// 5. Para agendar (rodar sozinha todo dia): no menu lateral do Supabase,
//    vá em "Integrations" → "Cron" → "Create job". Escolha o tipo
//    "Supabase Edge Function", selecione "avisos-diarios", e defina o
//    horário (ex.: todo dia às 8h da manhã — pode escrever em texto
//    normal, tipo "every day at 8am", ou usar o formato de horário
//    sugerido pela própria tela).
// 6. Para testar sem esperar o agendamento: use o botão "Test" desta
//    função (não precisa de nenhum campo no corpo da requisição, pode
//    deixar `{}` ou vazio).

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const DIAS_GESTACAO = 283;
const DIAS_LACTACAO_ATE_SECAGEM = 305;
const DIAS_CICLO_ESTRO = 21;
const LIMITE_CCS = 500000;
const LIMITE_CBT = 300000;
const MINIMO_GORDURA = 3.0;
const MINIMO_PROTEINA = 2.9;

function somarDias(dataIso: string, dias: number): string {
  const d = new Date(dataIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function mediaGeometrica(valores: number[]): number | null {
  const validos = valores.filter((v) => v > 0);
  if (!validos.length) return null;
  const somaLog = validos.reduce((s, v) => s + Math.log(v), 0);
  return Math.exp(somaLog / validos.length);
}

function mediaSimples(valores: number[]): number | null {
  const validos = valores.filter((v) => !isNaN(v) && v > 0);
  if (!validos.length) return null;
  return validos.reduce((s, v) => s + v, 0) / validos.length;
}

function calcularStatusQualidade(registros: any[]) {
  const mediaCCS = mediaGeometrica(registros.map((r) => Number(r.ccs)).filter((v) => v));
  const mediaCBT = mediaGeometrica(registros.map((r) => Number(r.cbt)).filter((v) => v));
  const mediaGordura = mediaSimples(registros.map((r) => Number(r.gordura)).filter((v) => v));
  const mediaProteina = mediaSimples(registros.map((r) => Number(r.proteina)).filter((v) => v));

  const razaoCCS = mediaCCS !== null ? mediaCCS / LIMITE_CCS : 0;
  const razaoCBT = mediaCBT !== null ? mediaCBT / LIMITE_CBT : 0;
  const razaoGordura = mediaGordura !== null ? MINIMO_GORDURA / mediaGordura : 0;
  const razaoProteina = mediaProteina !== null ? MINIMO_PROTEINA / mediaProteina : 0;

  const pior = Math.max(razaoCCS, razaoCBT, razaoGordura, razaoProteina);
  const nivel = pior >= 1 ? "alerta" : pior >= 0.9 ? "atencao" : "ok";
  return { nivel, registros: registros.length };
}

function numeroDaSemanaIso(dataIso: string): string {
  const d = new Date(dataIso + "T00:00:00Z");
  const ano = d.getUTCFullYear();
  const inicioDoAno = new Date(Date.UTC(ano, 0, 1));
  const dias = Math.floor((d.getTime() - inicioDoAno.getTime()) / 86400000);
  const semana = Math.ceil((dias + inicioDoAno.getUTCDay() + 1) / 7);
  return `${ano}-S${semana}`;
}

// ---------- Regras puras (sem acesso ao banco), para poderem ser testadas ----------

// Baixa ou adiamento feito no app: sem data ("ate") vale para sempre; com data, vale até o dia anterior a ela.
function avisoDispensadoAtivo(d: any, hoje: string): boolean {
  return !!d && (d.ate == null || d.ate === "" || hoje < d.ate);
}

function chavesDispensadasAtivas(dispensados: any[], hoje: string): Set<string> {
  return new Set((dispensados ?? []).filter((d) => avisoDispensadoAtivo(d, hoje)).map((d) => d.chave));
}

// Mesma chave que o app usa para o aviso de qualidade (muda quando entra um novo resultado de análise).
function chaveAvisoQualidade(nivel: string, registros: any[]): string {
  const datas = (registros ?? []).map((r) => r.data).filter(Boolean).sort();
  return "qualidade|" + nivel + "|" + (datas.length ? datas[datas.length - 1] : "sem-data");
}

// Ordem usada em toda a função: por data e, no mesmo dia, por id (igual ao app).
function ordenarPorDataEId(eventos: any[]): any[] {
  return [...(eventos ?? [])].sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? -1 : 1;
    const na = Number(a.id), nb = Number(b.id);
    if (!isNaN(na) && !isNaN(nb)) return na - nb; // ids numéricos: 9 vem antes de 10
    const ia = String(a.id), ib = String(b.id);
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  });
}

// Lê uma consulta inteira, em páginas de 1000 linhas (limite do Supabase por resposta).
// "montarConsulta" precisa devolver uma consulta nova a cada chamada. O desempate por id
// mantém a ordem estável entre as páginas, sem repetir nem pular linhas. Se uma página
// falhar, devolve o erro (a função não trabalha com lista cortada pela metade).
async function lerTodasAsLinhas(montarConsulta: () => any, ordemExtra?: string): Promise<{ data: any[] | null; error: any }> {
  const tamanho = 1000;
  let todas: any[] = [];
  for (let de = 0; ; de += tamanho) {
    let consulta = montarConsulta();
    if (ordemExtra) consulta = consulta.order(ordemExtra, { ascending: true });
    const { data, error } = await consulta.order("id", { ascending: true }).range(de, de + tamanho - 1);
    if (error) return { data: null, error };
    todas = todas.concat(data ?? []);
    if (!data || data.length < tamanho) break;
  }
  return { data: todas, error: null };
}

// Previsões de parto e secagem. A função ordena os eventos por data e id por conta própria.
function calcularAvisosReprodutivos(
  eventosRepro: any[],
  mapaAnimais: Record<string, string>,
  hoje: string,
  inicioJanela: string,
  fimJanela: string,
  dispensadasAtivas: Set<string>,
) {
  const avisos: { tipo: string; chave: string; titulo: string; corpo: string }[] = [];
  const ocultos: { tipo: string; chave: string; motivo: string }[] = [];

  const ultimoPorAnimal: Record<string, any> = {};          // último evento de qualquer tipo
  const ultimoRelevantePorAnimal: Record<string, any> = {}; // último entre cobertura, cio, aborto, parto e indução
  ordenarPorDataEId(eventosRepro).forEach((ev: any) => {
    ultimoPorAnimal[ev.animal_id] = ev;
    if (ev.tipo === "cobertura" || ev.tipo === "cio" || ev.tipo === "aborto" || ev.tipo === "parto" || ev.tipo === "inducao_lactacao") {
      ultimoRelevantePorAnimal[ev.animal_id] = ev;
    }
  });

  Object.keys(ultimoPorAnimal).forEach((animalId) => {
    const ev = ultimoPorAnimal[animalId];
    const rel = ultimoRelevantePorAnimal[animalId];
    const nome = mapaAnimais[animalId] ?? "?";

    // Parto previsto: a última coisa que mudou a situação da vaca foi uma cobertura (mesmo que a secagem
    // tenha sido registrada depois) e ela não foi diagnosticada vazia.
    if (rel && rel.tipo === "cobertura" && rel.diagnostico_gestacao !== "vazia") {
      const dataPrevista = somarDias(rel.data, DIAS_GESTACAO);
      if (dataPrevista >= inicioJanela && dataPrevista <= fimJanela) {
        const chaveApp = "parto|" + animalId + "|" + dataPrevista;
        if (dispensadasAtivas.has(chaveApp)) {
          ocultos.push({ tipo: "previsao_parto", chave: String(rel.id), motivo: "baixa ou adiamento no app" });
        } else {
          avisos.push({
            tipo: "previsao_parto",
            chave: String(rel.id),
            titulo: "Previsão de parto",
            corpo: `Animal ${nome} — previsão para ${dataPrevista.split("-").reverse().join("/")}`,
          });
        }
      }
    }

    if (ev.tipo === "parto") {
      const dataPrevista = somarDias(ev.data, DIAS_LACTACAO_ATE_SECAGEM);
      if (dataPrevista >= inicioJanela && dataPrevista <= fimJanela) {
        avisos.push({
          tipo: "previsao_secagem",
          chave: String(ev.id),
          titulo: "Previsão de secagem",
          corpo: `Animal ${nome} — previsão para ${dataPrevista.split("-").reverse().join("/")}`,
        });
      }
    }
    // O cio não é mais avisado vaca por vaca: vai no resumo de segunda-feira (resumoSemanalCios, mais abaixo).
  });

  return { avisos, ocultos };
}

// ---------- Cio: regras COPIADAS do index.html ([J09], "Cios para observar e calendário do cio") ----------
// Esta função roda no Supabase e não consegue importar código do index.html, então as regras abaixo são uma cópia.
// Elas precisam continuar IGUAIS às do app: o teste testes/testar-equivalencia-cio.js roda o código do app e este
// aqui com os mesmos dados e falha se o resultado for diferente. Se mudar uma regra no app, mude aqui também.
const MARCOS_CONFERENCIA_CIO = [21, 42];
const CICLO_COMPLETO_MIN_DIAS = 17;
const CICLO_COMPLETO_MAX_DIAS = 25;
const MIN_INTERVALOS_MEDIA_CIO = 2;
const DIAS_LISTA_CIOS_OBSERVAR = 7;
const MAX_CICLOS_PROJETADOS_CIO = 3;
const TIPOS_RELEVANTES_REPRO = ["cobertura", "cio", "aborto", "parto", "inducao_lactacao"];
const DIAS_SEMANA_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function diasEntre(dataIsoA: string, dataIsoB: string): number {
  const a = new Date(dataIsoA + "T00:00:00");
  const b = new Date(dataIsoB + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function nomeDiaSemana(iso: string): string {
  return DIAS_SEMANA_PT[new Date(iso + "T12:00:00Z").getUTCDay()];
}

function chaveRespostaCio(coberturaId: any, marco: number): string {
  return coberturaId + "|" + marco;
}

function mapaRespostasCio(respostas: any[] | null) {
  const mapa = new Map();
  (respostas || []).forEach((r: any) => {
    if (r && r.cobertura_id != null) mapa.set(chaveRespostaCio(r.cobertura_id, Number(r.marco)), r.resposta);
  });
  return mapa;
}

function situacaoGestacaoCobertura(cob: any): string | null {
  if (!cob || cob.tipo !== "cobertura") return null;
  if (cob.diagnostico_gestacao === "vazia") return "vazia";
  if (cob.diagnostico_gestacao === "prenhe") return "confirmada";
  return "presumida";
}

function ordenarEventosReprodutivos(eventos: any[]): any[] {
  return (eventos || []).filter((e) => e && e.data).slice()
    .sort((x, y) => x.data.localeCompare(y.data) || (Number(x.id) || 0) - (Number(y.id) || 0));
}

function calcularIntervaloCioVaca(eventos: any[]) {
  const evs = ordenarEventosReprodutivos(eventos).filter((e) => TIPOS_RELEVANTES_REPRO.includes(e.tipo));
  const validos: number[] = [];
  for (let i = 0; i < evs.length; i++) {
    if (evs[i].tipo !== "cio") continue;
    for (let j = i + 1; j < evs.length; j++) {
      if (evs[j].tipo === "cio") {
        const d = diasEntre(evs[i].data, evs[j].data);
        if (d >= CICLO_COMPLETO_MIN_DIAS && d <= CICLO_COMPLETO_MAX_DIAS) validos.push(d);
        break;
      }
      if (evs[j].tipo !== "cobertura") break;
    }
  }
  if (validos.length >= MIN_INTERVALOS_MEDIA_CIO) {
    return { dias: Math.round(validos.reduce((t, x) => t + x, 0) / validos.length), amostras: validos.length, personalizado: true };
  }
  return { dias: DIAS_CICLO_ESTRO, amostras: validos.length, personalizado: false };
}

function situacaoCicloVaca(eventos: any[], hojeIso: string) {
  const evs = ordenarEventosReprodutivos(eventos).filter((e) => TIPOS_RELEVANTES_REPRO.includes(e.tipo));
  const intervalo = calcularIntervaloCioVaca(eventos);
  const ultimo = evs.length ? evs[evs.length - 1] : null;
  const r: any = { estado: "sem_cio", intervalo, ultimo, proximo: null, partoPrevisto: null };
  if (!ultimo) return r;
  if (ultimo.tipo === "cio") {
    r.estado = "ciclando_antigo";
    for (let k = 1; k <= MAX_CICLOS_PROJETADOS_CIO; k++) {
      const data = somarDias(ultimo.data, k * intervalo.dias);
      if (data >= hojeIso) { r.estado = "ciclando"; r.proximo = { data, tipo: "ciclo", dias: diasEntre(hojeIso, data) }; break; }
    }
    return r;
  }
  if (ultimo.tipo === "cobertura") {
    const gest = situacaoGestacaoCobertura(ultimo);
    r.partoPrevisto = somarDias(ultimo.data, DIAS_GESTACAO);
    if (gest === "confirmada") { r.estado = "prenhe"; return r; }
    if (gest === "vazia") { r.estado = "vazia"; return r; }
    r.estado = "coberta";
    for (const marco of MARCOS_CONFERENCIA_CIO) {
      const data = somarDias(ultimo.data, marco);
      if (data >= hojeIso) { r.proximo = { data, tipo: "retorno", marco, dias: diasEntre(hojeIso, data) }; break; }
    }
  }
  return r;
}

function calcularCiosParaObservar(animais: any[], eventos: any[], respostasCio: any[] | null, hojeIso: string, janelaDias?: number) {
  const fim = somarDias(hojeIso, (janelaDias || DIAS_LISTA_CIOS_OBSERVAR) - 1);
  const respondidas = mapaRespostasCio(respostasCio);
  const eventosPor: Record<string, any[]> = {};
  (eventos || []).forEach((e) => { (eventosPor[e.animal_id] = eventosPor[e.animal_id] || []).push(e); });
  const itens: any[] = [];
  (animais || []).forEach((a) => {
    const sit = situacaoCicloVaca(eventosPor[a.id] || [], hojeIso);
    const nome = "Nº " + a.identificacao;
    if (sit.estado === "ciclando" && sit.proximo.data <= fim) {
      itens.push({ animalId: a.id, animal: nome, tipo: "ciclo", dataPrevista: sit.proximo.data, dias: sit.proximo.dias, dataBase: sit.ultimo.data, intervalo: sit.intervalo.dias });
    }
    if (sit.estado === "coberta") {
      MARCOS_CONFERENCIA_CIO.forEach((marco) => {
        const data = somarDias(sit.ultimo.data, marco);
        if (data < hojeIso || data > fim) return;
        if (sit.ultimo.id != null && (respondidas.has(chaveRespostaCio(sit.ultimo.id, marco)) || data === hojeIso)) return;
        itens.push({ animalId: a.id, animal: nome, tipo: "retorno", marco, dataPrevista: data, dias: diasEntre(hojeIso, data), dataBase: sit.ultimo.data });
      });
    }
  });
  return itens.sort((x, y) => x.dataPrevista.localeCompare(y.dataPrevista) || x.animal.localeCompare(y.animal, "pt-BR", { numeric: true }));
}

function rotuloDataCioObservar(dias: number, iso: string): string {
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  return nomeDiaSemana(iso) + ", " + iso.slice(8, 10) + "/" + iso.slice(5, 7);
}

function textoCioParaObservar(item: any): string {
  const quando = rotuloDataCioObservar(item.dias, item.dataPrevista);
  if (item.tipo === "retorno") return "retorno ao cio previsto " + quando + " (" + item.marco + " dias depois da cobertura)";
  return "provável cio " + quando;
}

// ---------- Resumo semanal (segunda-feira) ----------
// Em vez de um aviso por vaca, o produtor recebe UMA notificação na segunda-feira com as vacas a observar naquela
// semana (hoje e os 6 dias seguintes): as mesmas da lista "Cios para observar nesta semana" do app.
const MAX_VACAS_NO_RESUMO_SEMANAL = 6;

function ehSegundaFeira(hoje: string): boolean {
  return new Date(hoje + "T12:00:00Z").getUTCDay() === 1;
}

// Devolve null quando não há nenhuma vaca para observar (nesse caso não se manda nada).
function resumoSemanalCios(animais: any[], eventos: any[], respostasCio: any[] | null, hoje: string) {
  const itens = calcularCiosParaObservar(animais, eventos, respostasCio, hoje);
  if (!itens.length) return null;
  const partes = itens.slice(0, MAX_VACAS_NO_RESUMO_SEMANAL).map((i) => i.animal + " (" + textoCioParaObservar(i) + ")");
  const resto = itens.length - partes.length;
  const corpo = partes.join("; ") + (resto > 0 ? "; e mais " + resto + (resto === 1 ? " vaca" : " vacas") + ". Veja a lista completa no app." : ".");
  return {
    tipo: "cios_semana",
    chave: hoje, // uma vez por semana: a chave é a data da segunda-feira
    titulo: itens.length === 1 ? "1 vaca para observar nesta semana" : itens.length + " vacas para observar nesta semana",
    corpo,
  };
}

Deno.serve(async (req) => {
  try {
    const chavesSecretas = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    const chaveSecreta = chavesSecretas["default"] ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!chaveSecreta) {
      return new Response(JSON.stringify({ erro: "Chave secreta do Supabase não encontrada." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, chaveSecreta);

    webpush.setVapidDetails(
      "mailto:cbemm2@gmail.com",
      Deno.env.get("VAPID_PUBLIC_KEY")!,
      Deno.env.get("VAPID_PRIVATE_KEY")!
    );

    const hoje = hojeIso();
    // O resumo de cios sai na segunda-feira. Para testar em outro dia pelo botão Test, use o corpo {"forcar_resumo_semanal": true}.
    let corpoPedido: any = {};
    try { corpoPedido = await req.json(); } catch (_e) { corpoPedido = {}; }
    const mandarResumoSemanal = ehSegundaFeira(hoje) || (corpoPedido && corpoPedido.forcar_resumo_semanal === true);
    const inicioJanela = somarDias(hoje, -1); // pequena folga, caso a rotina não rode num dia
    const fimJanela = somarDias(hoje, 3); // avisa com até 3 dias de antecedência

    // Só olhamos produtores que têm ao menos uma inscrição de push ativa.
    const { data: inscricoesTodas, error: erroInscricoes } = await lerTodasAsLinhas(() =>
      supabase.from("inscricoes_push").select("id, produtor_id")
    );
    if (erroInscricoes) {
      return new Response(JSON.stringify({ erro: erroInscricoes.message }), { status: 500 });
    }
    const produtorIds = [...new Set((inscricoesTodas ?? []).map((i: any) => i.produtor_id))];

    const resumo: any[] = [];

    for (const produtorId of produtorIds) {
      const avisosParaEnviar: { tipo: string; chave: string; titulo: string; corpo: string }[] = [];

      const [
        { data: animais, error: erroAnimais },
        { data: eventosRepro, error: erroRepro },
        { data: eventosSan, error: erroSan },
        { data: eventosDose, error: erroDose },
        { data: qualidade, error: erroQualidade },
        { data: dispensados, error: erroDispensados },
      ] = await Promise.all([
        lerTodasAsLinhas(() => supabase.from("animais").select("id, identificacao").eq("produtor_id", produtorId)),
        lerTodasAsLinhas(
          () =>
            supabase
              .from("eventos_reprodutivos")
              .select("id, animal_id, tipo, data, diagnostico_gestacao")
              .eq("produtor_id", produtorId),
          "data",
        ),
        lerTodasAsLinhas(() =>
          supabase
            .from("eventos_sanitarios")
            .select("id, animal_id, tipo, descricao, data_fim_carencia")
            .eq("produtor_id", produtorId)
            .not("data_fim_carencia", "is", null)
        ),
        lerTodasAsLinhas(() =>
          supabase
            .from("eventos_sanitarios")
            .select("id, animal_id, tipo, descricao, proxima_dose_em")
            .eq("produtor_id", produtorId)
            .not("proxima_dose_em", "is", null)
        ),
        lerTodasAsLinhas(() =>
          supabase
            .from("qualidade_leite")
            .select("id, data, ccs, cbt, gordura, proteina")
            .eq("produtor_id", produtorId)
            .gte("data", somarDias(hoje, -90))
            .lte("data", hoje)
        ),
        lerTodasAsLinhas(() => supabase.from("avisos_dispensados").select("id, chave, ate").eq("produtor_id", produtorId)),
      ]);

      const errosDeConsulta = [erroAnimais, erroRepro, erroSan, erroDose, erroQualidade]
        .filter(Boolean)
        .map((e: any) => ({ mensagem: e.message, codigo: e.code }));
      if (errosDeConsulta.length) {
        resumo.push({ produtor_id: produtorId, erro_ao_consultar: errosDeConsulta });
        continue;
      }

      const mapaAnimais: Record<string, string> = {};
      (animais ?? []).forEach((a: any) => (mapaAnimais[a.id] = a.identificacao));

      // Baixas e adiamentos dados no app. Se a leitura falhar, avisa do mesmo jeito (melhor um a mais do que um a menos).
      if (erroDispensados) {
        resumo.push({ produtor_id: produtorId, erro_ao_ler_avisos_dispensados: erroDispensados.message, codigo: erroDispensados.code });
      }
      const dispensadasAtivas = erroDispensados ? new Set<string>() : chavesDispensadasAtivas(dispensados ?? [], hoje);

      // Previsão de parto / secagem / cio.
      const reprodutivos = calcularAvisosReprodutivos(eventosRepro ?? [], mapaAnimais, hoje, inicioJanela, fimJanela, dispensadasAtivas);
      avisosParaEnviar.push(...reprodutivos.avisos);
      reprodutivos.ocultos.forEach((o) => resumo.push({ produtor_id: produtorId, ...o, enviado: false }));

      // Fim da carência de medicamento.
      (eventosSan ?? []).forEach((ev: any) => {
        if (ev.data_fim_carencia >= inicioJanela && ev.data_fim_carencia <= fimJanela) {
          avisosParaEnviar.push({
            tipo: "fim_carencia",
            chave: String(ev.id),
            titulo: "Fim da carência",
            corpo: `Animal ${mapaAnimais[ev.animal_id] ?? "?"} — carência termina em ${ev.data_fim_carencia.split("-").reverse().join("/")}`,
          });
        }
      });

      // Próxima dose de vacina/tratamento prevista.
      (eventosDose ?? []).forEach((ev: any) => {
        if (ev.proxima_dose_em >= inicioJanela && ev.proxima_dose_em <= fimJanela) {
          avisosParaEnviar.push({
            tipo: "proxima_dose",
            chave: String(ev.id),
            titulo: "Próxima dose prevista",
            corpo: `Animal ${mapaAnimais[ev.animal_id] ?? "?"} — ${ev.descricao || "vacina/tratamento"} em ${ev.proxima_dose_em.split("-").reverse().join("/")}`,
          });
        }
      });

      // Resumo semanal de cios (só na segunda-feira). As respostas "não" da conferência de cio no app tiram a vaca da lista.
      // Se a leitura das respostas falhar, o resumo sai do mesmo jeito (melhor uma vaca a mais do que a menos).
      if (mandarResumoSemanal) {
        const { data: respostasCio, error: erroRespostasCio } = await lerTodasAsLinhas(() =>
          supabase.from("conferencias_cio").select("id, cobertura_id, marco, resposta").eq("produtor_id", produtorId)
        );
        if (erroRespostasCio) {
          resumo.push({ produtor_id: produtorId, erro_ao_ler_conferencias_cio: erroRespostasCio.message, codigo: erroRespostasCio.code });
        }
        const resumoCios = resumoSemanalCios(animais ?? [], eventosRepro ?? [], erroRespostasCio ? [] : (respostasCio ?? []), hoje);
        if (resumoCios) avisosParaEnviar.push(resumoCios);
      }

      // Qualidade do leite (dedupe por semana, para não repetir todo dia).
      const statusQualidade = calcularStatusQualidade(qualidade ?? []);
      const qualidadeDispensada = dispensadasAtivas.has(chaveAvisoQualidade(statusQualidade.nivel, qualidade ?? []));
      if ((statusQualidade.nivel === "alerta" || statusQualidade.nivel === "atencao") && qualidadeDispensada) {
        resumo.push({ produtor_id: produtorId, tipo: "qualidade_leite", enviado: false, motivo: "baixa ou adiamento no app" });
      } else if (statusQualidade.nivel === "alerta" || statusQualidade.nivel === "atencao") {
        avisosParaEnviar.push({
          tipo: "qualidade_leite",
          chave: `${numeroDaSemanaIso(hoje)}-${statusQualidade.nivel}`,
          titulo:
            statusQualidade.nivel === "alerta"
              ? "Qualidade do leite fora do limite legal"
              : "Qualidade do leite: atenção",
          corpo: "Confira os indicadores de CCS, CBT, gordura e proteína no app.",
        });
      }

      if (!avisosParaEnviar.length) continue;

      const { data: inscricoesDoProdutor } = await lerTodasAsLinhas(() =>
        supabase.from("inscricoes_push").select("*").eq("produtor_id", produtorId)
      );

      for (const aviso of avisosParaEnviar) {
        // Tenta registrar o aviso como "já enviado". Se já existir
        // (mesmo produtor + tipo + chave), o Postgres recusa com o
        // código 23505 (violação de unicidade) — nesse caso, e só nesse
        // caso, é seguro pular, porque significa que já foi enviado antes.
        // Qualquer OUTRO erro (ex.: permissão) precisa aparecer na resposta,
        // em vez de ser escondido.
        const { error: erroRegistro } = await supabase
          .from("avisos_enviados")
          .insert({ produtor_id: produtorId, tipo: aviso.tipo, chave: aviso.chave });

        if (erroRegistro) {
          if (erroRegistro.code === "23505") continue; // já tinha sido enviado antes — ok, pula
          resumo.push({
            produtor_id: produtorId,
            ...aviso,
            enviado: false,
            erro_ao_registrar: erroRegistro.message,
            codigo_erro: erroRegistro.code,
          });
          continue;
        }

        const payload = JSON.stringify({ title: aviso.titulo, body: aviso.corpo, url: "./index.html" });
        for (const inscricao of inscricoesDoProdutor ?? []) {
          try {
            await webpush.sendNotification(
              { endpoint: inscricao.endpoint, keys: { p256dh: inscricao.p256dh, auth: inscricao.auth } },
              payload
            );
          } catch (e: any) {
            const codigo = e && (e.statusCode || e.status);
            if (codigo === 410 || codigo === 404) {
              await supabase.from("inscricoes_push").delete().eq("endpoint", inscricao.endpoint);
            }
          }
        }
        resumo.push({ produtor_id: produtorId, ...aviso, enviado: true });
      }
    }

    return new Response(JSON.stringify({ produtores_verificados: produtorIds.length, avisos_enviados: resumo }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ erro: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
