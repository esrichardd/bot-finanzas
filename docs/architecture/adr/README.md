# Architecture Decision Records

Los ADR registran decisiones estructurales que ya están implementadas y
vigentes.

## Estados

- `Aceptado`: decisión vigente.
- `Reemplazado`: otro ADR ocupa su lugar; el registro se conserva por historia.

Cuando una decisión cambia, se crea un ADR nuevo y el anterior se marca como
reemplazado. No se reescribe la justificación histórica para simular que la
decisión nueva siempre existió.

## Índice

| ADR                                                          | Estado   | Decisión                                               |
| ------------------------------------------------------------ | -------- | ------------------------------------------------------ |
| [ADR-001](ADR-001-money-as-minor-units.md)                   | Aceptado | Representar dinero como enteros en unidades mínimas    |
| [ADR-002](ADR-002-derived-account-balances.md)               | Aceptado | Derivar balances desde movimientos                     |
| [ADR-003](ADR-003-transfers-as-ledger-groups.md)             | Aceptado | Representar transferencias como grupos del ledger      |
| [ADR-004](ADR-004-credit-cards-as-accounts.md)               | Aceptado | Modelar una tarjeta de crédito como una cuenta         |
| [ADR-005](ADR-005-crypto-as-currencies.md)                   | Aceptado | Modelar criptoactivos como monedas                     |
| [ADR-006](ADR-006-single-level-category-tree.md)             | Aceptado | Usar una tabla de categorías con un nivel de jerarquía |
| [ADR-007](ADR-007-pragmatic-double-entry.md)                 | Aceptado | Aplicar cuadre doble solo a transferencias             |
| [ADR-008](ADR-008-same-origin-compose-topology.md)           | Aceptado | Servir frontend y API bajo el mismo origen             |
| [ADR-009](ADR-009-exact-sha-restricted-ssh-deploy.md)        | Aceptado | Desplegar un SHA exacto mediante SSH restringido       |
| [ADR-010](ADR-010-encrypted-offsite-postgres-backups.md)     | Aceptado | Mantener backups PostgreSQL cifrados fuera de la VPS   |
| [ADR-011](ADR-011-grafana-cloud-host-observability.md)       | Aceptado | Observar la VPS con Grafana Cloud y Grafana Alloy      |
| [ADR-012](ADR-012-ssh-tunneled-postgres-administration.md)   | Aceptado | Administrar PostgreSQL mediante proxy local y SSH      |

La arquitectura describe cómo funciona hoy el sistema; los ADR explican por
qué se eligieron sus decisiones más costosas de cambiar. El código y las
migraciones siguen siendo la fuente exacta para contratos y tipos.
