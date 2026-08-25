# Convención de commits

Basada en Conventional Commits, recortada. Normativa para cualquier cambio del
repositorio.

## Formato

```
<tipo>(<scope opcional>): <descripción en inglés, imperativo, minúscula, sin punto final>

<cuerpo opcional en inglés: el "por qué", no el "qué">

<referencia opcional: SPEC-XXX>
```

## Tipos permitidos

| Tipo       | Cuándo                                                          |
| ---------- | --------------------------------------------------------------- |
| `feat`     | Nueva funcionalidad visible (pantalla, endpoint o módulo)       |
| `fix`      | Corrección de un comportamiento incorrecto                      |
| `refactor` | Cambio de código sin cambio de comportamiento                   |
| `test`     | Solo tests (agregar, corregir, reorganizar)                     |
| `docs`     | Solo documentación (arquitecturas, specs, comentarios)          |
| `chore`    | Infra, Docker, dependencias, config, tooling, CI                |

Ningún otro tipo. En la duda entre dos: el que describa el efecto para el usuario del sistema (`feat` > `refactor` > `chore`).

## Scope

- El nombre del módulo o área: `feat(movements):`, `fix(accounts):`, `chore(docker):`, `test(credit-cards):`.
- Se omite cuando el cambio es transversal: `chore: actualizar dependencias`.

## Idioma

- Todo el commit en inglés: tipo, scope, descripción y cuerpo.
- La documentación del repo (specs y arquitecturas) sigue en español; solo los commits van en inglés.

## Reglas

1. **Un commit = un cambio lógico.** Si la descripción necesita un "y", probablemente son dos commits.
2. **La descripción dice qué; el cuerpo dice por qué.** El cuerpo solo cuando el porqué no es obvio (decisiones, trade-offs, contexto del bug).
3. **Trabajo de un spec referencia el spec** en la última línea del cuerpo: `SPEC-001`. Permite reconstruir qué commits materializaron cada spec.
4. **Los cambios automatizados siguen la misma convención.**
5. Descripción ≤ 72 caracteres.

## Ejemplos

```
feat(movements): create movement with balance update

SPEC-002
```

```
fix(accounts): scope archived account lookup by user

The archived lookup queried only by account id and could reveal data
belonging to another user.
```

```
chore(docker): interpolate credentials from .env with ${VAR:?} in prod
```

```
docs: separate global and backend architecture
```

## Anti-patrones

- `fix: misc fixes` / `chore: changes` (no dice nada).
- Mensajes en pasado ("added", "fixed") — imperativo siempre: "add", "fix".
- Mezclar refactor + feature en un commit (imposible de revisar y de revertir).
- Commits gigantes al final del día: commitea por cambio lógico, no por sesión.
