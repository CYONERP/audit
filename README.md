# Operaon Audit & Activity

Standalone responsável pela ingestão, sanitização, persistência, consulta e retenção controlada de eventos de auditoria, atividade, segurança e sistema da plataforma Operaon.

## Fronteira do serviço

O serviço `operaon/audit` é dono da trilha de eventos unificada e imutável. O Identity continua responsável por autenticação, emissão de JWT, sessões, MFA e dispositivos confiáveis. Durante o cutover, a API central mantém as rotas legadas e pode publicar eventos no novo serviço de forma gradual, sem exigir uma migração big-bang.

Cada evento pode ser associado a `tenantId`, `organizationId`, `userId`, `sessionId`, serviço de origem, entidade, request, correlação e horário de ocorrência. Os campos de ação, tipo, metadados e mudanças são extensíveis para evitar enums rígidos e permitir evolução entre módulos.

## Segurança e autorização

As rotas protegidas exigem simultaneamente `X-Service-Key` e JWT de acesso emitido pelo Identity. A leitura e a ingestão usam permissões dinâmicas (`audit:read`, `activity:read`, `audit:write`, `activity:write` e aliases legados), enquanto a retenção exige `audit:retention`. O middleware aplica escopo por tenant e organização a partir dos claims e dos filtros autorizados; não há bypass baseado em nomes fixos de roles.

> Nenhum endpoint público devolve tokens, senhas, secrets, refresh tokens, fingerprints de dispositivos, segredos de MFA, backup codes ou headers completos.

## Persistência e imutabilidade

A migration cria a tabela de eventos, índices para consultas temporais e por escopo, chave de idempotência para backfill e um trigger PostgreSQL que rejeita `UPDATE` e `DELETE` públicos. A retenção operacional utiliza uma variável de sessão explícita, é protegida por permissão e permanece desabilitada por padrão.

A sanitização é recursiva e aplicada antes da persistência e das respostas. Eventos de origem legada usam `legacySource` e `legacyId` para permitir reexecução idempotente do backfill sem sobrescrever dados existentes.

## Contrato HTTP

O serviço escuta por padrão em `4750` e expõe health checks sem autenticação de aplicação. As rotas de negócio ficam sob `/api/audit-activity`.

| Método | Rota | Finalidade |
|---|---|---|
| `POST` | `/api/audit-activity/events` | Ingerir um evento |
| `POST` | `/api/audit-activity/events/batch` | Ingerir eventos em lote |
| `GET` | `/api/audit-activity/events` | Consultar eventos com filtros e paginação |
| `GET` | `/api/audit-activity/events/:id` | Consultar um evento por identificador e escopo |
| `GET` | `/api/audit-activity/events/entity/:entityType/:entityId` | Consultar histórico de uma entidade |
| `GET` | `/api/audit-activity/events/user/:userId` | Consultar histórico de um usuário |
| `GET` | `/api/audit-activity/events/stats` | Consultar estatísticas agregadas |
| `GET` | `/api/audit-activity/activity/users/:userId` | Consultar atividade do usuário |
| `GET` | `/api/audit-activity/activity/suspicious` | Consultar eventos anômalos |
| `POST` | `/api/audit-activity/internal/retention/run` | Executar retenção autorizada |

Os endpoints de ingestão aceitam eventos sistêmicos sem usuário e eventos globais sem tenant quando o JWT e a permissão permitem essa operação. Filtros fora do escopo são rejeitados ou não retornam dados.

## Configuração

O arquivo `.env` versionado contém apenas valores locais não sensíveis. Em produção, forneça `DATABASE_URL`, `SERVICE_API_KEY`, `JWT_SECRET` ou a configuração equivalente do Identity, além de uma `ENCRYPTION_KEY` quando exigida pelo ambiente comum. A retenção é controlada por `RETENTION_ENABLED`, `RETENTION_DAYS_DEFAULT` e limites de lote; a configuração padrão não executa purga.

| Variável | Padrão local | Descrição |
|---|---:|---|
| `PORT` | `4750` | Porta HTTP do serviço |
| `SERVICE_API_KEY` | valor local de desenvolvimento | Chave backend-a-backend |
| `DB_NAME` | `operaon_audit` | Banco próprio do serviço |
| `RETENTION_ENABLED` | `false` | Habilita purga operacional |
| `RETENTION_DAYS_DEFAULT` | `365` | Prazo padrão de retenção |
| `JWT_ISSUER` | `operaon-identity` | Emissor aceito nos JWTs |
| `JWT_AUDIENCE` | `operaon-api,operaon-audit` | Audiences aceitas |

Nenhuma credencial real deve ser commitada. Os valores de produção devem ser injetados pelo ambiente de execução ou pelo cofre operacional.

## Execução

```bash
npm install
npm run migrate
npm run seed
npm test
npm start
```

O banco de desenvolvimento deve ser criado antes da aplicação das migrations. A migration é versionada e não depende de `sequelize.sync({ alter: true })` para estruturar o schema.

## Backfill legado

O script `scripts/backfill-legacy.js` é somente-aditivo e executa em dry-run por padrão. Ele lê `audit_trails` e `activity_logs` do banco legado, sanitiza os payloads e usa a combinação `legacySource` + `legacyId` para impedir duplicação. Não remove, atualiza ou bloqueia as tabelas legadas.

```bash
NODE_ENV=development npm run backfill:dry-run
BACKFILL_APPLY=true NODE_ENV=development npm run backfill
```

A execução com escrita deve ser autorizada separadamente, monitorada e realizada antes de qualquer desativação das rotas antigas. A purga de retenção não deve ser habilitada durante o backfill inicial.

## Cutover

O gateway expõe o namespace gradual `/api/audit-activity-standalone` em paralelo às rotas legadas `/api/audit` e às consultas de atividade de sessão. A integração do gateway resolve a base URL e a `serviceApiKey` pelo registro de integração `audit`, preservando bearer token, `X-Tenant-Id`, status HTTP e payloads remotos.

A transição recomendada é: aplicar a migration no banco novo; cadastrar a integração `audit`; executar backfill dry-run; habilitar publicação assíncrona ou dual-write; comparar contagens e consultas; direcionar novos consumidores ao namespace standalone; e somente depois planejar a retirada das rotas antigas.

<!-- OPERAON-DOCUMENTATION-LINK -->
## Documentação

A documentação técnica padronizada está em [docs/INDEX.md](docs/INDEX.md). Ela inclui arquitetura, responsabilidades, segurança, contratos, operação, testes, runbooks e decisões.
