# Orbital Directive

## 1. Título do projeto
**Orbital Directive**

## 2. Descrição curta
Orbital Directive é um simulador full stack de gerenciamento de estação espacial com foco em decisões operacionais, risco e continuidade da missão.
O projeto foi construído para demonstrar arquitetura limpa, backend autoritativo, segurança forte, UX/UI premium e alta manutenibilidade em um escopo objetivo.

## 3. Motivo do nome
"Orbital Directive" une dois eixos centrais do projeto: o contexto orbital da experiência e o papel de comando técnico sob pressão.
"Orbital" posiciona o cenário espacial imediatamente. "Directive" reforça responsabilidade, precisão e tomada de decisão em operação crítica.

## Branding e identidade
- O nome combina operação orbital com senso de comando.
- A direção visual busca uma estética sci-fi premium, contemplativa e técnica.
- A proposta intencional é de produto maduro, não fan game e não jogo caricatural.

## 4. Preview do projeto
Placeholders para capturas reais:

- Login: `docs/previews/login.png`
- Dashboard / Command Center: `docs/previews/dashboard.png`
- Modules: `docs/previews/modules.png`
- Incidents: `docs/previews/incidents.png`
- Research: `docs/previews/research.png`
- Settings: `docs/previews/settings.png`
- Run Summary: `docs/previews/run-summary.png`

## 5. Principais destaques
- Monorepo full stack com `apps/web`, `apps/api` e `packages/shared`.
- Simulação sob demanda no backend (sem loop contínuo no servidor).
- Backend autoritativo para recursos, custos, tempo, upgrades e eventos.
- Modular monolith com separação clara entre procedures, services e repositories.
- Segurança com sessão por cookie `httpOnly`, CSRF, rate limit, validação com Zod e auditoria.
- Idempotency key para ações críticas (upgrade, repair, resolve, reset, research purchase).
- Demo mode pronto para avaliação rápida por recrutadores.
- Camada de ambientação com áudio procedural, controle de volumes, mute global e reduced sensory mode.

## 6. Stack
- Frontend: React + Vite + TypeScript + Tailwind CSS
- Backend: Node.js + Express + TypeScript
- RPC/Contrato: tRPC
- Validação: Zod
- Banco: MySQL
- ORM: Drizzle ORM
- Testes: Vitest
- Infra local: Docker Compose
- E2E: estrutura pronta para futura entrada de Playwright (`apps/web/e2e`)

## 7. Arquitetura
### Monorepo
- `apps/web`: interface, navegação, integração tRPC, UX e áudio.
- `apps/api`: autenticação, engine de simulação, segurança, persistência e auditoria.
- `packages/shared`: enums, schemas Zod, constantes de balanceamento e lógica pura de simulação.

### Camadas no backend
- Procedures tRPC: finas (orquestração de entrada/saída).
- Services: regras de negócio, transações e idempotência.
- Repositories: acesso ao banco via Drizzle.

### Por que modular monolith
Foi escolhido para manter o MVP simples, robusto e evolutivo sem custo de microserviços.
A separação interna por domínio traz clareza sem inflar complexidade operacional.

## Modelo de dados principal
- `users` 1:1 `stations` (MVP mantém uma estação por usuário).
- `users` 1:N `sessions`.
- `users` 1:1 `user_preferences`.
- `stations` 1:1 `station_resources`.
- `stations` 1:N `station_modules`.
- `stations` 1:N `station_incidents`.
- `stations` 1:N `station_logs`.
- `stations` 1:N `station_run_summaries`.
- `stations` 1:N `station_research_upgrades`.
- `users`/`stations` 1:N `audit_logs`.
- `users` 1:N `idempotency_keys`.

## 8. Decisões técnicas
- **Backend autoritativo:** frontend nunca decide saldo, custo, cooldown, RNG ou tempo.
- **Simulação sob demanda:** estado processado quando necessário, usando `lastProcessedAt` + horário do servidor.
- **Fonte de tempo oficial:** apenas relógio do backend.
- **Transações em mutações críticas:** upgrades, repairs, resolve, research purchase e reset.
- **Idempotência:** `idempotency_keys` previne replay e clique duplo.
- **Versionamento do aggregate:** `stations.version` incrementado em mutações e processamento.
- **Persistência de histórico:** `station_logs`, `station_run_summaries` e `audit_logs`.
- **Preferências de UX/audio:** reduced sensory mode e densidade compacta persistidas.

### Sistema de áudio no MVP
- O MVP usa áudio procedural via Web Audio API (sem assets proprietários).
- Controles implementados: volume de música, volume de efeitos, mute global e reduced sensory mode.
- Ponto de substituição para assets finais: `apps/web/src/features/audio/audio-provider.tsx`.

### Loop de simulação implementado
1. Ler `stations.lastProcessedAt`.
2. Calcular `deltaSeconds` com `Date.now()` do servidor.
3. Rodar `simulateStationTick` (produção, consumo, desgaste, incidentes e penalidades).
4. Persistir resultado de forma atômica em transação.
5. Atualizar snapshot oficial (`station_resources`, `station_modules`, `station_incidents`).
6. Incrementar `stations.version` e salvar `lastProcessedAt`.
7. Retornar estado consolidado.

## 9. Segurança
- Helmet com headers seguros e CSP configurável por ambiente.
- Sessão via cookie `httpOnly` + `sameSite` + `secure` configurável.
- CSRF com cookie + header (`/api/csrf` + `x-csrf-token`) para mutações.
- Rate limiting por IP (Express) e por usuário nas ações críticas (service-level).
- Senhas com hash forte via Argon2 (`@node-rs/argon2`).
- Validação de entrada com Zod (sem confiar em payload cru).
- Queries via Drizzle (sem SQL concatenado de forma insegura).
- Checagem explícita de ownership por `stationId` em todas as operações.
- Idempotência e transações para reduzir race conditions e replay.
- Erros tratados sem vazamento de detalhes internos.
- Logging estruturado com Pino e trilha de auditoria para ações críticas.

## 10. Setup local
### Pré-requisitos
- Node.js LTS (ver `.nvmrc`)
- pnpm
- Docker + Docker Compose

### Variáveis de ambiente
1. Copie `.env.example` para `.env`.
2. Ajuste credenciais e origens conforme necessário.

### Subir banco
```bash
docker compose up -d
```

### Instalar dependências
```bash
pnpm install
```

### Migrations
```bash
pnpm db:migrate
```

### Seed + demo station
```bash
pnpm db:seed
```

### Rodar desenvolvimento
```bash
pnpm dev
```

Web: `http://localhost:5173`  
API: `http://localhost:4000`

## 11. Scripts
### Raiz
- `pnpm dev`: sobe web e api em paralelo.
- `pnpm dev:web`: sobe só o frontend.
- `pnpm dev:api`: sobe só o backend.
- `pnpm build`: build de todos os pacotes.
- `pnpm test`: executa testes do workspace.
- `pnpm check`: typecheck do workspace.
- `pnpm db:generate`: gera migration no `apps/api`.
- `pnpm db:migrate`: aplica migrations.
- `pnpm db:seed`: popula demo user/station.
- `pnpm db:studio`: abre Drizzle Studio.

### `apps/api`
- `pnpm --filter @orbital/api dev`
- `pnpm --filter @orbital/api db:migrate`
- `pnpm --filter @orbital/api db:seed`

### `apps/web`
- `pnpm --filter @orbital/web dev`
- `pnpm --filter @orbital/web test:e2e:prepare`

## 12. Estrutura de pastas
```txt
root/
  apps/
    web/
      src/
        app/
        components/
        features/
          auth/
          dashboard/
          station/
          modules/
          crew/
          research/
          incidents/
          logs/
          audio/
          settings/
        hooks/
        lib/
        pages/
        styles/
    api/
      src/
        bootstrap/
        config/
        db/
          schema/
          migrations/
          repositories/
        modules/
          auth/
          users/
          stations/
          modules/
          resources/
          research/
          incidents/
          leaderboard/
          audit/
        services/
        security/
        middleware/
        trpc/
        utils/
  packages/
    shared/
      src/
        schemas/
        types/
        enums/
        constants/
        game/
```

## 13. Roadmap
- Leaderboard funcional com recortes por período.
- Sistema de achievements orientado à eficiência operacional.
- Novos módulos e cadeias de produção/consumo.
- Mais incidentes compostos e efeitos cruzados.
- E2E com Playwright cobrindo fluxos críticos.
- Ajustes finos de balanceamento econômico e risco.
- Observabilidade (métricas de domínio e tracing).
- Expansão da ambientação sonora com trilhas autorais finais.

## 14. Qualidade do README
Este README foi escrito para refletir o estado real do código atual no repositório:
- comandos existentes,
- estrutura existente,
- decisões técnicas realmente implementadas.

Sem marketing vazio, sem seção fictícia e sem fluxo inventado.
