# LeiteFácil

Aplicativo gratuito de controle de produção leiteira, feito para o pequeno produtor. Funciona no navegador e pode ser instalado no celular como se fosse um aplicativo (PWA). É um projeto sem fins lucrativos, criado pelo professor Laerte Bemm (Universidade Estadual de Maringá, UEM) e usado na Fazenda Experimental de Iguatemi da UEM.

O que o produtor pode registrar: animais, reprodução (cio, cobertura, parto, secagem), produção de leite por dia (por rebanho ou por vaca), chuva do dia, qualidade do leite, manejo sanitário, pesagens, alimentação e pastagem, estoque, financeiro e indicadores. O app também avisa no celular, todo dia às 7h, sobre partos, secagens, cios e outros eventos que estão chegando.

## Como o projeto é montado

O aplicativo inteiro está em um único arquivo, o `index.html`. Isso foi uma escolha para manter a publicação simples. Para não se perder nele, o começo do arquivo traz um mapa com todas as seções, e cada seção tem um código de busca entre colchetes, como `[J24]`. Use a busca do editor (Ctrl+F) e digite o código.

| Arquivo ou pasta | Para que serve |
| --- | --- |
| `index.html` | O aplicativo: visual (CSS), telas (HTML) e lógica (JavaScript) |
| `service-worker.js` | Permite abrir o app sem internet e guarda uma cópia dele no aparelho |
| `schema.sql` | Descrição completa do banco de dados (tabelas, regras de acesso e permissões) |
| `adicionar-chuva-producao.sql` e outros `.sql` | Scripts avulsos para rodar uma vez no banco, quando uma novidade exige colunas novas |
| `supabase/functions/avisos-diarios/index.ts` | Cópia da função que envia os avisos das 7h (ela roda no Supabase, não aqui) |
| `testes/` | Testes automáticos das contas e regras do app |
| `.github/workflows/testes.yml` | Roda os testes sozinho a cada alteração enviada ao GitHub |
| `ControleLeiteiro-Plano-e-Progresso.md` | Histórico do projeto: decisões, o que foi feito e o que falta |

## De onde vêm os dados e onde o app é publicado

- **Banco de dados e login:** [Supabase](https://supabase.com) (PostgreSQL). Cada produtor só enxerga os próprios dados, por regras de acesso do próprio banco (RLS). A chave que aparece no `index.html` é a chave pública do Supabase, feita para ficar no navegador; quem protege os dados são as regras de acesso, não o sigilo dessa chave.
- **Avisos das 7h:** uma função do Supabase (Edge Function) chamada todos os dias às 7h, horário de Brasília.
- **Publicação:** [Vercel](https://vercel.com), ligado a este repositório. Cada alteração enviada ao ramo `main` vira uma nova versão do site em poucos minutos.

## Como conferir os testes

Os testes rodam sozinhos no GitHub: abra a aba **Actions** e veja se a última execução está verde. Para rodar no próprio computador, é preciso ter o Node.js (versão 22 ou mais nova) e usar, na pasta do projeto:

```
node testes/testar-calculos.js
node testes/testar-avisos-diarios.js
```

Os testes procuram as funções de cálculo pelo nome dentro do `index.html`. Se alguma delas mudar de nome, o teste correspondente também precisa ser atualizado.

## Como publicar uma alteração

1. Se a novidade criar colunas novas no banco, rode primeiro o script `.sql` correspondente no Supabase (menu **SQL Editor**).
2. Envie os arquivos alterados ao GitHub (por exemplo, `index.html` e, se mudou, `testes/testar-calculos.js`).
3. Confira em **Actions** se os testes ficaram verdes e abra o site para ver a mudança.

A ordem do passo 1 importa: se o `index.html` novo for publicado antes de o banco estar pronto, o app pode tentar gravar colunas que ainda não existem.

## Para quem for desenvolver

- Comece pelo mapa no topo do `index.html` e por `schema.sql`.
- Os nomes das funções seguem um padrão: `render...` desenha uma tela, `abrir...` abre um formulário, `salvar...` grava no banco e `calcular...` faz contas puras, que são cobertas pelos testes.
- Uma possível evolução é dividir o `index.html` em vários arquivos (CSS e JavaScript por assunto). Se isso for feito, será preciso adaptar os testes e a lista de arquivos do `service-worker.js`, e publicar todos os arquivos juntos, num único envio.
- O público do app é formado por produtores rurais, muitos com pouca familiaridade com tecnologia. Textos e telas devem continuar simples e sem termos técnicos.

## Contato

Laerte Bemm: lbemm2@uem.br
