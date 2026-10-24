// Edge Function: avisos-diarios
//
// O que ela faz: roda sozinha uma vez por dia (você vai agendar isso no
// passo do "Cron", explicado abaixo), e para cada produtor que tem avisos
// no celular ativados, calcula os mesmos avisos que já aparecem na tela de
// Início do app:
//   - Previsão de parto (cobertura + 283 dias)
//   - Previsão de secagem (parto + 305 dias)
//   - Fim da carência de medicamento
//   - Previsão de próximo cio (21 dias após o último cio registrado, caso
//     não tenha sido coberta depois)
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

// Previsões de parto, secagem e cio. A função ordena os eventos por data e id por conta própria.
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
    } else if (ev.tipo === "cio") {
      const dataPrevista = somarDias(ev.data, DIAS_CICLO_ESTRO);
      if (dataPrevista >= inicioJanela && dataPrevista <= fimJanela) {
        avisos.push({
          tipo: "previsao_cio",
          chave: String(ev.id),
          titulo: "Previsão de próximo cio",
          corpo: `Animal ${nome} — previsto para ${dataPrevista.split("-").reverse().join("/")} (caso não tenha sido coberta)`,
        });
      }
    }
  });

  return { avisos, ocultos };
}

Deno.serve(async (_req) => {
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
