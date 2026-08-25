# Especificaciones

Los archivos `SPEC-000` a `SPEC-013` son planes y registros históricos de las
unidades de trabajo que construyeron la aplicación. No son documentación de la
API, un runbook de producción ni una lista de funcionalidades planificadas.

Las fuentes vigentes son:

- `ARCHITECTURE.md` para los límites e invariantes del sistema;
- `backend/ARCHITECTURE.md` para las reglas del backend;
- `frontend/ARCHITECTURE.md` para las reglas del frontend;
- `docs/DATABASE.md` para el modelo de datos vigente;
- `docs/architecture/adr/README.md` para las decisiones estructurales;
- `docs/operations/README.md` para infraestructura, despliegue y recuperación;
- el código y las migraciones para contratos, columnas y tipos exactos.

El estado `completado` de un spec significa que su implementación se incorporó
al repositorio. Un checkbox sin marcar conserva la falta de evidencia registrada
para esa verificación concreta; no debe reinterpretarse como una promesa de
funcionalidad adicional.

Los comandos, rutas y snippets dentro de un spec reflejan el momento en que se
ejecutó. Los contratos actuales se consultan en el código, porque specs
posteriores pudieron reemplazar o ampliar los anteriores.
