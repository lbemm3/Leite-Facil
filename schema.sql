-- LeiteFácil — correções de RLS encontradas ao revisar o schema.sql
-- Nenhuma delas muda dado nenhum, só quem pode ler o quê.

-- 1) BUG REAL: colaborador com "ve_producao" liberado usa os botões de
-- Excel e PDF, que buscam produção individual por vaca e qualidade do
-- leite — mas essas duas tabelas não tinham política para colaborador,
-- então a busca voltava vazia, sem erro. Mesmo padrão de
-- "producao_leite", incluindo o c.status = 'ativo'.

create policy "Colaborador ve producao individual liberada" on producao_leite_individual for select to public
  using (exists (select 1 from colaboradores c where c.produtor_id = producao_leite_individual.produtor_id and c.user_id = auth.uid() and c.status = 'ativo' and c.ve_producao = true));

create policy "Colaborador ve qualidade liberada" on qualidade_leite for select to public
  using (exists (select 1 from colaboradores c where c.produtor_id = qualidade_leite.produtor_id and c.user_id = auth.uid() and c.status = 'ativo' and c.ve_producao = true));


-- 2) DESCUIDO: as políticas de colaborador de piquetes, ciclos_pastejo e
-- alimentacao_eventos (criadas para o Grupo 4 — Nutrição) foram copiadas
-- de uma referência que eu só tinha vista pela metade, e ficaram sem o
-- "c.status = 'ativo'" que as outras tabelas do projeto sempre exigem —
-- ou seja, um colaborador que já reivindicou o convite mas ainda não foi
-- aprovado pelo produtor não deveria enxergar esses dados, e com a
-- política antiga, em teoria, conseguiria (se o produtor já tivesse
-- deixado "ve_producao" ligado). ALTER POLICY troca a regra sem precisar
-- apagar e recriar a política.

alter policy "Colaborador ve piquetes liberado" on piquetes
  using (exists (select 1 from colaboradores c where c.produtor_id = piquetes.produtor_id and c.user_id = auth.uid() and c.status = 'ativo' and c.ve_producao = true));

alter policy "Colaborador ve pastejo liberado" on ciclos_pastejo
  using (exists (select 1 from colaboradores c where c.produtor_id = ciclos_pastejo.produtor_id and c.user_id = auth.uid() and c.status = 'ativo' and c.ve_producao = true));

alter policy "Colaborador ve alimentacao liberado" on alimentacao_eventos
  using (exists (select 1 from colaboradores c where c.produtor_id = alimentacao_eventos.produtor_id and c.user_id = auth.uid() and c.status = 'ativo' and c.ve_producao = true));


-- 3) Consistência, sem urgência: estoque_movimentacoes não é usado por
-- nenhuma tela ou exportação do colaborador hoje, então isto não corrige
-- nenhum bug em uso — só deixa o padrão igual ao resto do projeto, caso
-- o histórico de movimentações passe a ser exibido para colaborador no
-- futuro.

create policy "Colaborador ve movimentacoes liberado" on estoque_movimentacoes for select to public
  using (exists (select 1 from colaboradores c where c.produtor_id = estoque_movimentacoes.produtor_id and c.user_id = auth.uid() and c.status = 'ativo' and c.ve_estoque = true));
