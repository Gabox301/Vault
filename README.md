# Vault

Gestor local de comandos para developers: guardas tus comandos frecuentes (Git,
Docker, Go, Node, etc.) organizados en **grupos** y los recuperas al instante
con `Ctrl/Cmd+K` para **copiarlos** a tu terminal.

> La app **no ejecuta comandos**: solo los almacena para recuperarlos y
> copiarlos de forma simple (portapapeles). Sin autenticación (app 100% local,
> de un solo usuario).

Stack: **Go** (backend) + **Wails v2** (bridge de escritorio) + HTML/CSS/JS
vanilla (frontend, sin build step) + **SQLite** (persistencia local, driver
puro en Go `modernc.org/sqlite`, sin CGO).

## Arquitectura hexagonal

```
internal/
├── core/                        ← el hexágono (no importa nada de fuera)
│   ├── domain/                  entidades: Group, Command
│   ├── ports/                   interfaces (puertos)
│   │   ├── repositories.go      puertos secundarios: persistencia
│   │   └── services.go          puertos primarios: casos de uso
│   └── service/                 implementación de los casos de uso
│       ├── command_service.go   CRUD + búsqueda + favoritos de comandos
│       └── group_service.go     CRUD de grupos
│
└── adapters/                    todo lo que "conecta" el hexágono con el mundo
    ├── repository/sqlite/       adaptador secundario: persistencia (SQLite)
    └── wailsapp/                adaptador primario: expone la API a Wails/frontend

main.go                          composition root: conecta puertos con adaptadores
frontend/dist/                   UI (HTML/CSS/JS vanilla, sin build)
```

**Regla del hexágono**: `internal/core` no importa nada de `internal/adapters`
ni de Wails. El acoplamiento va en sentido único, desde los adaptadores hacia
los puertos (interfaces) que define el core. Esto permite, por ejemplo, cambiar
SQLite por otro motor o Wails por otra UI sin tocar la lógica de negocio.

## Funcionalidades

- **Command Palette** con `Ctrl/Cmd+K`: busca por nombre, comando o descripción,
  navega con teclado y **copia** el comando al portapapeles con `Enter`.
- **CRUD de comandos** (nombre, descripción opcional, comando, grupo, favorito).
- **Grupos** (nombre + descripción opcional) para organizar comandos por tema
  (Git, Docker, deploy, etc.); cada comando puede pertenecer a un grupo o a ninguno.
- **Favoritos** (⭐) con prioridad en listas y paleta.
- **Copia al portapapeles** vía `runtime.ClipboardSetText` del runtime de Wails.
- Persistencia local en SQLite, sin ejecución de procesos.

## Cómo compilarlo

```bash
# 1. Instalar la CLI de Wails (una sola vez)
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# 2. Descargar dependencias de Go
cd Vault
go mod tidy

# 3. Modo desarrollo (hot reload del frontend)
wails dev

# 4. Build de producción (genera el binario nativo)
wails build
```

El frontend no tiene paso de build (HTML/CSS/JS plano en `frontend/dist/`), por
eso `wails.json` deja `frontend:build` vacío — Wails empaqueta ese directorio
directamente vía `//go:embed frontend/dist` en `main.go`.

## Datos

La base de datos SQLite se crea automáticamente en `~/.Vault/data.db`.
Si existe una base creada por una versión anterior de la app, se **migra automáticamente**
al primer arranque: `projects` → `groups` (con descripción) y se eliminan las tablas/columnas de ejecución.
