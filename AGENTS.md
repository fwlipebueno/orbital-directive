# AGENTS.md

## Visão do projeto
Orbital Directive é um simulador full stack de gerenciamento de estação espacial com simulação sob demanda, backend autoritativo e foco em legibilidade operacional.

## Princípios obrigatórios
- Backend autoritativo para toda regra sensível.
- Nunca confiar no frontend para saldo, custo, tempo, RNG, score ou autorização.
- Código simples, legível, com baixo acoplamento e alta coesão.
- Evitar overengineering, abstrações prematuras e duplicação.
- Segurança e integridade acima de conveniência.
- Separar UI, regra de negócio e persistência com clareza.

## Regras de arquitetura
- Monorepo: `apps/web`, `apps/api`, `packages/shared`.
- Services concentram regra de negócio.
- Repositories concentram persistência com Drizzle.
- Shared guarda enums, schemas, tipos, constantes e lógica pura reutilizável.
- Componentes React não implementam regra sensível.
- Não espalhar regra de domínio entre front e back.

## Regras de segurança
- Não aceitar score/saldo/custo/tempo do cliente.
- Reprocessar estado da estação no backend antes de mutações críticas.
- Usar transação para operações críticas.
- Validar ownership por recurso carregado por id.
- Usar idempotency key para upgrade, repair, resolve, purchase e reset.
- Não expor detalhes internos em erros.

## Regras de código
- TypeScript estrito.
- Evitar `any` sem justificativa real.
- Funções curtas e nomes claros.
- Não criar helper genérico sem ganho concreto.
- Remover código morto, mocks residuais e anotações pendentes sem contexto.
- Manter consistência de naming e estrutura.

## Comandos importantes
- Instalar dependências: `pnpm install`
- Subir banco: `docker compose up -d`
- Rodar migrations: `pnpm db:migrate`
- Rodar seed: `pnpm db:seed`
- Rodar testes: `pnpm test`
- Rodar desenvolvimento: `pnpm dev`
