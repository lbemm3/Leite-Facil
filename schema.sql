-- =====================================================================
-- LeiteFácil — esquema do banco de dados (Supabase / PostgreSQL)
--
-- Este arquivo é um RETRATO do banco, reconstruído a partir de duas
-- consultas de leitura rodadas no SQL Editor do Supabase em 30/09/2026
-- (information_schema.columns e pg_policies). Ele documenta o estado
-- real do banco nesse momento — não foi testado como script para criar
-- o banco do zero, e não deve ser rodado de uma vez.
--
-- Serve para responder, sem precisar abrir o Supabase: quais tabelas
-- existem, quais colunas cada uma tem, e quem pode ler/escrever em cada
-- uma. Toda vez que uma tabela for criada ou alterada (como nos arquivos
-- adicionar-*.sql desta pasta), atualize a tabela correspondente aqui
-- também, para este arquivo nunca ficar desatualizado por muito tempo.
--
-- O que este arquivo NÃO cobre ainda (ficou de fora da consulta usada):
--   - GRANTs: foram conferidos no banco real em 09/10/2026, com o script
--     verificar-grants-e-rls.sql. O resultado está no bloco "GRANTS" no fim
--     deste arquivo. Os CREATE TABLE abaixo continuam sem GRANT, de propósito.
--   - Chaves primárias, chaves estrangeiras (exceto as poucas já escritas
--     abaixo) e CHECKs: a consulta que gerou este retrato não trazia isso.
--   - Colunas bigint (id de animais, colaboradores, eventos, etc.) usam
--     algum mecanismo de geração automática (os inserts do app não
--     informam id), mas o tipo exato (identity/serial) não veio nesta
--     consulta — não é um problema, só um detalhe que não foi conferido.
-- =====================================================================


-- ============================== administradores ==============================
create table administradores (
  user_id    uuid not null,
  criado_em  timestamptz default now()
);

alter table administradores enable row level security;
create policy "Usuário vê se é administrador" on administradores for select to public
  using (auth.uid() = user_id);


-- ============================== produtores ==============================
create table produtores (
  id                            uuid not null,
  nome                          text not null,
  propriedade                   text,
  cidade                        text,
  telefone                      text,
  criado_em                     timestamptz default now(),
  termos_aceitos_em             timestamptz,
  estado                        text,
  localidade                    text,
  area_total_hectares           numeric,
  area_alimentos_hectares       numeric,
  outras_fontes_renda           jsonb,
  alimentos_produzidos          jsonb,
  admin_financeiro_liberado     boolean default false,
  admin_financeiro_liberado_em  timestamptz,
  admin_financeiro_revogado_em  timestamptz
);

alter table produtores enable row level security;
create policy "Admin vê todos os produtores" on produtores for select to public
  using (exists (select 1 from administradores a where a.user_id = auth.uid()));
create policy "Colaborador ve o produtor que o convidou" on produtores for select to public
  using (exists (select 1 from colaboradores c where c.produtor_id = produtores.id and c.user_id = auth.uid() and c.status = 'ativo'));
create policy "Produtor cria seu próprio perfil" on produtores for insert to public
  with check (auth.uid() = id);
create policy "Produtor edita seu próprio perfil" on produtores for update to public
  using (auth.uid() = id);
create policy "Produtor vê seu próprio perfil" on produtores for select to public
  using (auth.uid() = id);


-- ============================== colaboradores ==============================
create table colaboradores (
  id              bigint not null,
  produtor_id     uuid not null,
  email           text not null,
  user_id         uuid,
  ve_animais      boolean not null default true,
  ve_reprodutivo  boolean not null default true,
  ve_sanitario    boolean not null default true,
  ve_producao     boolean not null default false,
  ve_estoque      boolean not null default false,
  ve_financeiro   boolean not null default false,
  status          text not null default 'pendente',
  criado_em       timestamptz default now()
);

alter table colaboradores enable row level security;
create policy "Convidado reivindica seu convite" on colaboradores for update to public
  using (email = (auth.jwt() ->> 'email') and user_id is null)
  with check (email = (auth.jwt() ->> 'email'));
create policy "Convidado ve seu convite ou acesso" on colaboradores for select to public
  using (user_id = auth.uid() or email = (auth.jwt() ->> 'email'));
create policy "Produtor gerencia seus colaboradores" on colaboradores for all to public
  using (auth.uid() = produtor_id);


-- ============================== animais ==============================
create table animais (
  id                bigint not null,
  produtor_id       uuid not null,
  identificacao     text not null,
  grau_sangue       text,
  data_nascimento   date,
  status            text,
  criado_em         timestamptz default now(),
  mae_nome          text,
  mae_brinco        text,
  pai_nome          text,
  avo_nome          text,
  avo_macho_nome    text,
  partos_anteriores integer not null default 0  -- partos antes do 1º parto registrado no app (check 0 a 19)
);

alter table animais enable row level security;
create policy "Admin vê todos os animais" on animais for select to public
  using (exists (select 1 from administradores a where a.user_id = auth.uid()));
create policy "Colaborador ve animais liberados" on animais for select to public
  using (exists (select 1 from colaboradores c where c.produtor_id = animais.produtor_id and c.user_id = auth.uid() and c.status = 'ativo' and c.ve_animais = true));
create policy "Produtor gerencia seus animais" on animais for all to public
  using (auth.uid() = produtor_id);
create policy "Produtor vê seus animais" on animais for select to public
  using (auth.uid() = produtor_id);


-- ============================== eventos_reprodutivos ==============================
create table eventos_reprodutivos (
  id                      bigint not null,
  animal_id               bigint not null,
  produtor_id             uuid not null,
  tipo                    text not null,          -- cio | cobertura | parto | aborto | secagem
  data                    date not null,
  observacoes             text,
  criado_em               timestamptz default now(),
  periodo_parto           text,                   -- só quando tipo = 'parto'
  condicao_parto          text,                   -- só quando tipo = 'parto'
  peso_nascimento_kg      numeric,                -- só quando tipo = 'parto'
  sexo_bezerro            text,                   -- só quando tipo = 'parto'
  bezerra_animal_id       bigint,                 -- só quando tipo = 'parto' e a fêmea foi ao rebanho
  natimorto               boolean not null default false, -- só quando tipo = 'parto'
  meses_gestacao_aborto   numeric                 -- só quando tipo = 'aborto'
);

alter table eventos_reprodutivos enable row level security;
create policy "Admin ve eventos reprodutivos" on eventos_reprodutivos for select to public
  using (exists (select 1 from administradores a where a.user_id = auth.uid()));
create policy "Colaborador ve reprodutivo liberado" on eventos_reprodutivos for select to public
  using (exists (select 1 from colaboradores c where c.produtor_id = eventos_reprodutivos.produtor_id and c.user_id = auth.uid() and c.status = 'ativo' and c.ve_reprodutivo = true));
create policy "Produtor gerencia seus eventos reprodutivos" on eventos_reprodutivos for all to public
  using (auth.uid() = produtor_id);


-- ============================== eventos_sanitarios ==============================
create table eventos_sanitarios (
  id                  bigint not null,
  animal_id           bigint not null,
  produtor_id         uuid not null,
  tipo                text not null,
  descricao           text,
  data_aplicacao      date not null,
  dias_carencia       integer default 0,
  data_fim_carencia   date,
  criado_em           timestamptz default now(),
  proxima_dose_em     date,
  subcategoria        text,     -- ex.: vacina_obrigatoria / vacina_nao_obrigatoria
  nome_medicamento    text
);

alter table eventos_sanitarios enable row level security;
create policy "Admin ve eventos sanitarios" on eventos_sanitarios for select to public
  using (exists (select 1 from administradores a where a.user_id = auth.uid()));
create policy "Colaborador ve sanitario liberado" on eventos_sanitarios for select to public
  using (exists (select 1 from colaboradores c where c.produtor_id = eventos_sanitarios.produtor_id and c.user_id = auth.uid() and c.status = 'ativo' and c.ve_sanitario = true));
create policy "Produtor gerencia seus eventos sanitarios" on eventos_sanitarios for all to public
  using (auth.uid() = produtor_id);


-- ============================== producao_leite (registro do rebanho/dia) ==============================
create table producao_leite (
  id                             bigint not null,
  produtor_id                    uuid not null,
  data                           date not null,
  litros_manha                   numeric,
  litros_tarde                   numeric,
  criado_em                      timestamptz default now(),
  tipo_ordenha_manha             text,
  ordenhador_manha               text,
  tempo_ordenha_min_manha        integer,
  higienizacao_manha             text,
  problemas_animais_manha        text,
  problemas_equipamento_manha    text,
  tipo_ordenha_tarde             text,
  ordenhador_tarde               text,
  tempo_ordenha_min_tarde        integer,
  higienizacao_tarde             text,
  problemas_animais_tarde        text,
  problemas_equipamento_tarde    text,
  metodo_registro                text default 'rebanho',  -- 'rebanho' ou 'individual'
  resfriamento_manha             text,
  resfriamento_tarde             text
);

alter table producao_leite enable row level security;
create policy "Admin ve producao" on producao_leite for select to public
  using (exists (select 1 from administradores a where a.user_id = auth.uid()));
create policy "Colaborador ve producao liberada" on producao_leite for select to public
  using (exists (select 1 from colaboradores c where c.produtor_id = producao_leite.produtor_id and c.user_id = auth.uid() and c.status = 'ativo' and c.ve_producao = true));
create policy "Produtor gerencia sua producao" on producao_leite for all to public
  using (auth.uid() = produtor_id);


-- ============================== producao_leite_individual (por vaca) ==============================
create table producao_leite_individual (
  id            uuid not null default gen_random_uuid(),
  animal_id     bigint not null,
  produtor_id   uuid not null,
  data          date not null,
  litros_manha  numeric,
  litros_tarde  numeric,
  criado_em     timestamptz not null default now()
);

alter table producao_leite_individual enable row level security;
create policy "admin ve producao individual" on producao_leite_individual for select to public
  using (exists (select 1 from administradores ad where ad.user_id = auth.uid()));
create policy "produtor ve producao individual" on producao_leite_individual for select to public
  using (auth.uid() = produtor_id);
create policy "produtor cria producao individual" on producao_leite_individual for insert to public
  with check (auth.uid() = produtor_id);
create policy "produtor atualiza producao individual" on producao_leite_individual for update to public
  using (auth.uid() = produtor_id);
create policy "produtor apaga producao individual" on producao_leite_individual for delete to public
  using (auth.uid() = produtor_id);
create policy "Colaborador ve producao individual liberada" on producao_leite_individual for select to public
  using (exists (select 1 from colaboradores c where c.produtor_id = producao_leite_individual.produtor_id and c.user_id = auth.uid() and c.status = 'ativo' and c.ve_producao = true));
-- Corrigido em corrigir-rls-colaborador.sql: faltava esta política — um colaborador
-- com ve_producao liberado usa os botões de Excel/PDF, que buscam esta tabela, e
-- voltavam vazios sem erro nenhum.


-- ============================== qualidade_leite ==============================
create table qualidade_leite (
  id            bigint not null,
  produtor_id   uuid not null,
  data          date not null,
  ccs           numeric,
  cbt           numeric,
  observacoes   text,
  criado_em     timestamptz not null default now(),
  gordura       numeric,
  proteina      numeric
);

alter table qualidade_leite enable row level security;
create policy "admin_ve_qualidade" on qualidade_leite for select to public
  using (exists (select 1 from administradores a where a.user_id = auth.uid()));
create policy "produtor_ve_qualidade" on qualidade_leite for select to public
  using (produtor_id = auth.uid());
create policy "produtor_insere_qualidade" on qualidade_leite for insert to public
  with check (produtor_id = auth.uid());
create policy "produtor_atualiza_qualidade" on qualidade_leite for update to public
  using (produtor_id = auth.uid());
create policy "produtor_exclui_qualidade" on qualidade_leite for delete to public
  using (produtor_id = auth.uid());
create policy "Colaborador ve qualidade liberada" on qualidade_leite for select to public
  using (exists (select 1 from colaboradores c where c.produtor_id = qualidade_leite.produtor_id and c.user_id = auth.uid() and c.status = 'ativo' and c.ve_producao = true));
-- Corrigido em corrigir-rls-colaborador.sql: mesmo caso de producao_leite_individual.


-- ============================== estoque_itens ==============================
create table estoque_itens (
  id                 bigint not null,
  produtor_id        uuid not null,
  categoria          text not null,
  nome               text not null,
  unidade            text,
  quantidade_atual   numeric not null default 0,
  criado_em          timestamptz default now(),
  subcategoria       text
);

alter table estoque_itens enable row level security;
create policy "Admin ve estoque" on estoque_itens for select to public
  using (exists (select 1 from administradores a where a.user_id = auth.uid()));
create policy "Colaborador ve estoque liberado" on estoque_itens for select to public
  using (exists (select 1 from colaboradores c where c.produtor_id = estoque_itens.produtor_id and c.user_id = auth.uid() and c.status = 'ativo' and c.ve_estoque = true));
create policy "Produtor gerencia seu estoque" on estoque_itens for all to public
  using (auth.uid() = produtor_id);


-- ============================== estoque_movimentacoes ==============================
create table estoque_movimentacoes (
  id            bigint not null,
  item_id       bigint not null,
  produtor_id   uuid not null,
  tipo          text not null,   -- entrada | consumo
  quantidade    numeric not null,
  data          date not null,
  observacoes   text,
  criado_em     timestamptz default now()
);

alter table estoque_movimentacoes enable row level security;
create policy "Admin ve movimentacoes" on estoque_movimentacoes for select to public
  using (exists (select 1 from administradores a where a.user_id = auth.uid()));
create policy "Produtor gerencia suas movimentacoes" on estoque_movimentacoes for all to public
  using (auth.uid() = produtor_id);
create policy "Colaborador ve movimentacoes liberado" on estoque_movimentacoes for select to public
  using (exists (select 1 from colaboradores c where c.produtor_id = estoque_movimentacoes.produtor_id and c.user_id = auth.uid() and c.status = 'ativo' and c.ve_estoque = true));
-- Adicionado em corrigir-rls-colaborador.sql: nenhuma tela ou exportação usa isto
-- para colaborador hoje, mas deixa o padrão igual ao resto do projeto.


-- ============================== financeiro_lancamentos ==============================
create table financeiro_lancamentos (
  id              bigint not null,
  produtor_id     uuid not null,
  tipo            text not null,   -- receita | despesa
  categoria       text not null,
  descricao       text,
  valor           numeric not null,
  data            date not null,
  criado_em       timestamptz default now(),
  subcategoria    text,
  quantidade      numeric,
  unidade         text,
  valor_unitario  numeric
);

alter table financeiro_lancamentos enable row level security;
create policy "Colaborador ve financeiro liberado" on financeiro_lancamentos for select to public
  using (exists (select 1 from colaboradores c where c.produtor_id = financeiro_lancamentos.produtor_id and c.user_id = auth.uid() and c.status = 'ativo' and c.ve_financeiro = true));
create policy "Produtor gerencia seu financeiro" on financeiro_lancamentos for all to public
  using (auth.uid() = produtor_id);
create policy "Admin ve financeiro com consentimento" on financeiro_lancamentos for select to public
  using (exists (select 1 from administradores a where a.user_id = auth.uid())
         and exists (select 1 from produtores p where p.id = financeiro_lancamentos.produtor_id and p.admin_financeiro_liberado = true));
-- Observação (09/10/2026): até esta data o banco real NÃO tinha política de admin
-- nesta tabela (confirmado por verificar-grants-e-rls.sql). O consentimento
-- (admin_financeiro_liberado em produtores) é só uma coluna: sem uma política de
-- SELECT para o admin, o RLS devolvia vazio mesmo para quem liberou o acesso.
-- A política "Admin ve financeiro com consentimento" acima foi escrita em
-- corrigir-rls-admin-financeiro.sql e passa a valer quando esse arquivo for
-- rodado no Supabase. Só leitura, e só de quem liberou. Total: 3 políticas.


-- ============================== piquetes ==============================
create table piquetes (
  id              uuid not null default gen_random_uuid(),
  produtor_id     uuid not null,
  nome            text not null,
  area_hectares   numeric,
  created_at      timestamptz not null default now()
);

alter table piquetes enable row level security;
create policy "Admin ve piquetes" on piquetes for select to public
  using (exists (select 1 from administradores a where a.user_id = auth.uid()));
create policy "Colaborador ve piquetes liberado" on piquetes for select to public
  using (exists (select 1 from colaboradores c where c.produtor_id = piquetes.produtor_id and c.user_id = auth.uid() and c.status = 'ativo' and c.ve_producao = true));
-- Corrigido em corrigir-rls-colaborador.sql: faltava o c.status = 'ativo' (reconstruído
-- sem ver o texto completo da política original de referência, na hora).
create policy "Produtor gerencia seus piquetes" on piquetes for all to public
  using (auth.uid() = produtor_id);


-- ============================== ciclos_pastejo ==============================
create table ciclos_pastejo (
  id                      uuid not null default gen_random_uuid(),
  produtor_id             uuid not null,
  piquete_id              uuid not null references piquetes(id) on delete cascade,
  data_entrada            date not null,
  especie_pasto           text,
  especie_pasto_outro     text,
  altura_entrada_cm       numeric,
  altura_saida_cm         numeric,
  dias_pastejo            integer,
  estimativa_ms_ton_ha    numeric,
  observacoes             text,
  created_at              timestamptz not null default now()
);

alter table ciclos_pastejo enable row level security;
create policy "Admin ve ciclos de pastejo" on ciclos_pastejo for select to public
  using (exists (select 1 from administradores a where a.user_id = auth.uid()));
create policy "Colaborador ve pastejo liberado" on ciclos_pastejo for select to public
  using (exists (select 1 from colaboradores c where c.produtor_id = ciclos_pastejo.produtor_id and c.user_id = auth.uid() and c.status = 'ativo' and c.ve_producao = true));
-- Corrigido em corrigir-rls-colaborador.sql: mesmo caso de piquetes.
create policy "Produtor gerencia seus ciclos de pastejo" on ciclos_pastejo for all to public
  using (auth.uid() = produtor_id);


-- ============================== alimentacao_eventos ==============================
create table alimentacao_eventos (
  id                     uuid not null default gen_random_uuid(),
  produtor_id            uuid not null,
  data                   date not null,
  horario                time,
  lote                   text not null,   -- bezerra | novilha | lactante | seca
  tipo_alimento          text not null,   -- pasto | silagem | concentrado | feno | sal_mineral | outro
  tipo_alimento_outro    text,
  quantidade_kg          numeric,
  composicao             text,
  piquete_id             uuid references piquetes(id),
  sobras_cocho_kg        numeric,
  observacoes            text,
  created_at             timestamptz not null default now()
);

alter table alimentacao_eventos enable row level security;
create policy "Admin ve alimentacao" on alimentacao_eventos for select to public
  using (exists (select 1 from administradores a where a.user_id = auth.uid()));
create policy "Colaborador ve alimentacao liberado" on alimentacao_eventos for select to public
  using (exists (select 1 from colaboradores c where c.produtor_id = alimentacao_eventos.produtor_id and c.user_id = auth.uid() and c.status = 'ativo' and c.ve_producao = true));
-- Corrigido em corrigir-rls-colaborador.sql: mesmo caso de piquetes.
create policy "Produtor gerencia sua alimentacao" on alimentacao_eventos for all to public
  using (auth.uid() = produtor_id);


-- ============================== pesagens ==============================
-- Pedido da FEI (out/2026): acompanhamento mensal do peso dos animais, em lote e
-- flexível por lote (bezerra/novilha/lactante/seca) — o produtor escolhe quais
-- lotes pesar em cada data, não precisa ser o rebanho inteiro de uma vez.
create table pesagens (
  id            uuid not null default gen_random_uuid(),
  produtor_id   uuid not null,
  animal_id     bigint not null references animais(id) on delete cascade,
  data          date not null,
  peso_kg       numeric not null,
  observacoes   text,
  criado_em     timestamptz not null default now(),
  unique (animal_id, data)
);

alter table pesagens enable row level security;
create policy "Admin ve pesagens" on pesagens for select to public
  using (exists (select 1 from administradores a where a.user_id = auth.uid()));
create policy "Colaborador ve pesagens liberado" on pesagens for select to public
  using (exists (select 1 from colaboradores c where c.produtor_id = pesagens.produtor_id and c.user_id = auth.uid() and c.status = 'ativo' and c.ve_animais = true));
create policy "Produtor gerencia suas pesagens" on pesagens for all to public
  using (auth.uid() = produtor_id);
-- Constraint pesagens_peso_positivo: peso_kg > 0 (adicionada em adicionar-pesagens.sql).


-- ============================== inscricoes_push ==============================
create table inscricoes_push (
  id            uuid not null default gen_random_uuid(),
  produtor_id   uuid not null,
  endpoint      text not null,
  p256dh        text not null,
  auth          text not null,
  criado_em     timestamptz not null default now()
);

alter table inscricoes_push enable row level security;
create policy "produtor ve suas inscricoes push" on inscricoes_push for select to public
  using (auth.uid() = produtor_id);
create policy "produtor cria suas inscricoes push" on inscricoes_push for insert to public
  with check (auth.uid() = produtor_id);
create policy "produtor atualiza suas inscricoes push" on inscricoes_push for update to public
  using (auth.uid() = produtor_id);
create policy "produtor apaga suas inscricoes push" on inscricoes_push for delete to public
  using (auth.uid() = produtor_id);


-- ============================== avisos_enviados ==============================
-- Controla quais avisos automáticos (Edge Function avisos-diarios) já foram
-- mandados, para não repetir o mesmo aviso duas vezes.
create table avisos_enviados (
  id            uuid not null default gen_random_uuid(),
  produtor_id   uuid not null,
  tipo          text not null,
  chave         text not null,
  enviado_em    timestamptz not null default now()
);
alter table avisos_enviados enable row level security;
-- Confirmado no banco real em 09/10/2026: RLS ligado e nenhuma política, de
-- propósito. Com RLS ligado e sem política, anon e authenticated não leem nem
-- gravam nada aqui (e também não têm GRANT). Só a Edge Function avisos-diarios
-- mexe nesta tabela, com service_role (que tem SELECT/INSERT/UPDATE/DELETE).


-- ============================== logs_erro ==============================
-- Monitoramento de erros (Fase 1 do diagnóstico técnico): qualquer erro de
-- JavaScript não tratado no app é gravado aqui automaticamente.
create table logs_erro (
  id            uuid not null default gen_random_uuid(),
  produtor_id   uuid,
  mensagem      text not null,
  pilha         text,
  pagina        text,
  user_agent    text,
  criado_em     timestamptz not null default now()
);

alter table logs_erro enable row level security;
create policy "Qualquer pessoa pode registrar um erro" on logs_erro for insert to public
  with check (true);
create policy "Só admin le os logs de erro" on logs_erro for select to public
  using (exists (select 1 from administradores a where a.user_id = auth.uid()));


-- ============================== logs_acesso ==============================
-- Fase 2 do diagnóstico técnico: registro de auditoria. Quem (admin ou
-- colaborador) acessou a ficha de qual produtor, quando, e de que forma.
create table logs_acesso (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null,
  papel         text not null,
  produtor_id   uuid not null,
  acao          text not null,
  criado_em     timestamptz not null default now()
);

alter table logs_acesso enable row level security;
create policy "Usuario logado registra seu proprio acesso" on logs_acesso for insert to public
  with check (usuario_id = auth.uid());
create policy "So admin le os registros de acesso" on logs_acesso for select to public
  using (exists (select 1 from administradores a where a.user_id = auth.uid()));


-- =====================================================================
-- VALIDAÇÕES DE NEGÓCIO (Fase 2) — adicionadas por fase2-validacao-e-auditoria.sql
-- em 30/09/2026. Resumo (ver aquele arquivo para o texto exato de cada uma):
--   producao_leite, producao_leite_individual: litros e tempo de ordenha >= 0
--   qualidade_leite: ccs, cbt, gordura, proteina >= 0
--   eventos_reprodutivos: peso_nascimento_kg >= 0; meses_gestacao_aborto entre 0 e 10
--   eventos_sanitarios: dias_carencia >= 0
--   estoque_movimentacoes: quantidade > 0 (estoque_itens.quantidade_atual
--     continua sem CHECK — hoje pode ficar negativo após um consumo maior
--     que o saldo, de propósito, sem bloqueio)
--   financeiro_lancamentos: valor > 0; quantidade >= 0; valor_unitario > 0
--   piquetes: area_hectares >= 0
--   ciclos_pastejo: altura_entrada_cm, altura_saida_cm, dias_pastejo,
--     estimativa_ms_ton_ha >= 0
--   alimentacao_eventos: quantidade_kg, sobras_cocho_kg >= 0
--   pesagens: peso_kg > 0 (adicionada em adicionar-pesagens.sql, não na Fase 2)
--   produtores: area_total_hectares, area_alimentos_hectares >= 0
-- =====================================================================


-- =====================================================================
-- GRANTS — conferidos no banco real em 09/10/2026 (verificar-grants-e-rls.sql)
-- S = select, I = insert, U = update, D = delete, - = sem o privilégio.
--
--   authenticated: SIUD em todas as tabelas, exceto:
--     administradores   S---   (só leitura)
--     logs_acesso       SI--
--     logs_erro         SI--
--     avisos_enviados   ----   (só a Edge Function usa)
--   anon: nenhum privilégio em nenhuma tabela, exceto:
--     logs_erro         SI--   (INSERT é o esperado, para gravar erros antes do
--                              login; o SELECT é inofensivo, a política de
--                              leitura dessa tabela é só do admin)
--   service_role (Edge Functions):
--     animais, eventos_reprodutivos, eventos_sanitarios, qualidade_leite:  S---
--     inscricoes_push, avisos_enviados:                                    SIUD
--     as demais tabelas:                                                   ----
--
-- Toda tabela nova precisa de GRANT explícito para authenticated (este projeto
-- não libera isso sozinho). RLS e GRANT são coisas diferentes: sem o GRANT, o
-- banco responde "permission denied" mesmo com a política certa.
-- =====================================================================
