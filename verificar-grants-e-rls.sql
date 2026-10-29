-- =====================================================================
-- LeiteFácil — verificação consolidada de GRANT e RLS (SOMENTE LEITURA)
--
-- Esta consulta não cria, altera nem apaga nada. Pode ser rodada à vontade
-- no SQL Editor do Supabase. Ela devolve UMA tabela de resultado, com as
-- linhas problemáticas primeiro (coluna "alerta" diferente de "ok").
--
-- O que ela confere, tabela por tabela (as 22 do schema.sql):
--   1. RLS ligado ou desligado.
--   2. Quantidade de políticas no banco, comparada com a do schema.sql.
--   3. Privilégios (S=select, I=insert, U=update, D=delete) de cada papel:
--      anon, authenticated e service_role.
--   4. Se existe política para um comando (ex.: INSERT) mas falta o GRANT
--      correspondente para authenticated. É exatamente o erro
--      "permission denied for table", que o RLS sozinho não evita.
--   5. Se anon tem algum acesso. Só logs_erro pode ter INSERT (e SELECT ali
--      é inofensivo, porque a política de leitura dessa tabela é só do admin).
--   6. Se service_role consegue ler as tabelas que a Edge Function
--      avisos-diarios usa (lista tirada do plano, não do código da função).
--   7. Tabelas no banco que não estão no schema.sql, e o contrário.
--
-- E duas checagens fora das tabelas:
--   - Se existe política de admin em financeiro_lancamentos (sem ela, o
--     consentimento "admin_financeiro_liberado" não tem efeito nenhum).
--   - Políticas de colaborador, em qualquer tabela, que não exigem
--     c.status = 'ativo'.
--
-- Como usar: cole tudo no SQL Editor, rode, e me mande o resultado
-- (um print ou o texto das linhas com alerta já bastam).
-- =====================================================================

with esperado(tabela, politicas) as (
  values
    ('administradores', 1),
    ('produtores', 5),
    ('colaboradores', 3),
    ('animais', 4),
    ('eventos_reprodutivos', 3),
    ('eventos_sanitarios', 3),
    ('producao_leite', 3),
    ('producao_leite_individual', 6),
    ('qualidade_leite', 6),
    ('estoque_itens', 3),
    ('estoque_movimentacoes', 3),
    ('financeiro_lancamentos', 3),
    ('piquetes', 3),
    ('ciclos_pastejo', 3),
    ('alimentacao_eventos', 3),
    ('pesagens', 3),
    ('inscricoes_push', 4),
    ('avisos_enviados', 0),
    ('avisos_dispensados', 1),
    ('preco_leite_mensal', 3),
    ('conferencias_cio', 3),
    ('logs_erro', 2),
    ('logs_acesso', 2)
),
t as (
  select c.oid, c.relname::text as tabela, c.relrowsecurity as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
),
priv as (
  select t.tabela, r.papel,
         concat(
           case when has_table_privilege(r.papel, t.oid, 'SELECT') then 'S' else '-' end,
           case when has_table_privilege(r.papel, t.oid, 'INSERT') then 'I' else '-' end,
           case when has_table_privilege(r.papel, t.oid, 'UPDATE') then 'U' else '-' end,
           case when has_table_privilege(r.papel, t.oid, 'DELETE') then 'D' else '-' end
         ) as p
  from t
  cross join (values ('anon'), ('authenticated'), ('service_role')) r(papel)
),
pol as (
  select tablename::text as tabela,
         count(*) as qtd,
         bool_or(cmd in ('SELECT', 'ALL')) as pol_sel,
         bool_or(cmd in ('INSERT', 'ALL')) as pol_ins,
         bool_or(cmd in ('UPDATE', 'ALL')) as pol_upd,
         bool_or(cmd in ('DELETE', 'ALL')) as pol_del
  from pg_policies
  where schemaname = 'public'
  group by tablename
),
base as (
  select
    coalesce(t.tabela, e.tabela) as tabela,
    t.oid as oid,
    t.rls as rls,
    e.politicas as esperado,
    coalesce(pol.qtd, 0) as reais,
    coalesce(pol.pol_sel, false) as pol_sel,
    coalesce(pol.pol_ins, false) as pol_ins,
    coalesce(pol.pol_upd, false) as pol_upd,
    coalesce(pol.pol_del, false) as pol_del,
    coalesce((select p from priv where priv.tabela = t.tabela and papel = 'anon'), '----') as anon,
    coalesce((select p from priv where priv.tabela = t.tabela and papel = 'authenticated'), '----') as aut,
    coalesce((select p from priv where priv.tabela = t.tabela and papel = 'service_role'), '----') as svc
  from t
  full outer join esperado e on e.tabela = t.tabela
  left join pol on pol.tabela = t.tabela
),
secao1 as (
  select
    '1 tabelas' as secao,
    b.tabela as objeto,
    case when b.oid is null then 'não existe no banco'
         else 'RLS ' || case when b.rls then 'ligado' else 'desligado' end
              || '; políticas ' || b.reais || '/' || coalesce(b.esperado::text, '?')
              || '; anon ' || b.anon || '; authenticated ' || b.aut || '; service_role ' || b.svc
    end as detalhe,
    coalesce(nullif(array_to_string(array_remove(array[
      case when b.oid is null then 'tabela do schema.sql NÃO existe no banco' end,
      case when b.oid is not null and b.esperado is null then 'tabela não documentada no schema.sql' end,
      case when b.oid is not null and not b.rls and (b.anon <> '----' or b.aut <> '----')
           then 'RLS DESLIGADO e com GRANT para anon/authenticated: qualquer pessoa pode acessar' end,
      case when b.oid is not null and not b.rls and b.anon = '----' and b.aut = '----'
           then 'RLS desligado, protegida só pela falta de GRANT para anon/authenticated' end,
      case when b.oid is not null and b.esperado is not null and b.reais <> b.esperado
           then 'políticas: ' || b.reais || ' no banco, ' || b.esperado || ' no schema.sql' end,
      case when b.oid is not null and b.anon <> '----' and not (b.tabela = 'logs_erro' and b.anon in ('-I--', 'SI--'))
           then 'anon com acesso inesperado (' || b.anon || ')' end,
      case when b.tabela = 'logs_erro' and b.oid is not null and substr(b.anon, 2, 1) = '-'
           then 'anon sem INSERT: erro ocorrido antes do login não é gravado' end,
      case when b.pol_sel and substr(b.aut, 1, 1) = '-' then 'falta GRANT SELECT para authenticated' end,
      case when b.pol_ins and substr(b.aut, 2, 1) = '-' then 'falta GRANT INSERT para authenticated' end,
      case when b.pol_upd and substr(b.aut, 3, 1) = '-' then 'falta GRANT UPDATE para authenticated' end,
      case when b.pol_del and substr(b.aut, 4, 1) = '-' then 'falta GRANT DELETE para authenticated' end,
      case when b.tabela = 'avisos_enviados' and b.aut <> '----'
           then 'authenticated com acesso a tabela que só a Edge Function usa (' || b.aut || ')' end,
      case when b.tabela in ('animais', 'eventos_reprodutivos', 'eventos_sanitarios', 'qualidade_leite',
                             'inscricoes_push', 'avisos_enviados', 'avisos_dispensados')
                and b.oid is not null and substr(b.svc, 1, 1) = '-'
           then 'service_role sem SELECT (usada pela Edge Function avisos-diarios)' end,
      case when b.tabela = 'avisos_enviados' and b.oid is not null and substr(b.svc, 2, 1) = '-'
           then 'service_role sem INSERT (a função não consegue registrar o aviso enviado)' end
    ], null), ' | '), ''), 'ok') as alerta
  from base b
),
secao2 as (
  select
    '2 admin e financeiro' as secao,
    'financeiro_lancamentos' as objeto,
    coalesce((select string_agg(policyname || ' (' || cmd || ')', '; ' order by policyname)
              from pg_policies
              where schemaname = 'public' and tablename = 'financeiro_lancamentos'),
             'nenhuma política') as detalhe,
    case when exists (select 1 from pg_policies
                      where schemaname = 'public' and tablename = 'financeiro_lancamentos'
                        and cmd in ('SELECT', 'ALL')
                        and coalesce(qual, '') ilike '%administradores%')
         then 'ok'
         else 'SEM política de admin: o admin não lê o Financeiro nem de quem liberou o acesso'
    end as alerta
),
secao3 as (
  select
    '3 colaborador sem status ativo' as secao,
    'políticas de colaborador' as objeto,
    (select count(*) from pg_policies
       where schemaname = 'public' and tablename <> 'colaboradores'
         and (coalesce(qual, '') || coalesce(with_check, '')) ilike '%colaboradores%')
      || ' encontradas, fora a própria tabela colaboradores' as detalhe,
    coalesce((select 'REVISAR (falta c.status = ativo): '
                     || string_agg(tablename || ' / ' || policyname, '; ' order by tablename)
              from pg_policies
              where schemaname = 'public' and tablename <> 'colaboradores'
                and (coalesce(qual, '') || coalesce(with_check, '')) ilike '%colaboradores%'
                and (coalesce(qual, '') || coalesce(with_check, '')) not ilike '%ativo%'),
             'ok') as alerta
)
select secao, objeto, detalhe, alerta
from (
  select * from secao1
  union all
  select * from secao2
  union all
  select * from secao3
) todas
order by (alerta = 'ok'), secao, objeto;
