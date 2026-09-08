// Package sqlite is a driven (secondary) adapter: it implements the
// ports.CommandRepository and ports.GroupRepository interfaces defined by
// the core, using SQLite as the storage engine. The core never imports
// this package directly — only main.go wires it in behind the port
// interfaces.
package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	_ "modernc.org/sqlite" // Pure-Go SQLite driver (no CGO required)
)

const schema = `
CREATE TABLE IF NOT EXISTS groups (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	name        TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	created_at  DATETIME NOT NULL,
	updated_at  DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS commands (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	group_id    INTEGER REFERENCES groups(id) ON DELETE SET NULL,
	name        TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	command     TEXT NOT NULL,
	favorite    INTEGER NOT NULL DEFAULT 0,
	created_at  DATETIME NOT NULL,
	updated_at  DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_commands_group_id ON commands(group_id);
`

// Open creates/opens the SQLite database file at path, migrates any older
// schema and applies the current schema idempotently.
func Open(ctx context.Context, path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite db: %w", err)
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxIdleTime(0)

	// Desktop local DB: WAL + busy_timeout evita "database is locked".
	if _, err := db.ExecContext(ctx, "PRAGMA foreign_keys = ON;"); err != nil {
		return nil, fmt.Errorf("enable foreign keys: %w", err)
	}
	if _, err := db.ExecContext(ctx, "PRAGMA journal_mode = WAL;"); err != nil {
		return nil, fmt.Errorf("set journal_mode WAL: %w", err)
	}
	if _, err := db.ExecContext(ctx, "PRAGMA busy_timeout = 5000;"); err != nil {
		return nil, fmt.Errorf("set busy_timeout: %w", err)
	}
	if _, err := db.ExecContext(ctx, "PRAGMA synchronous = NORMAL;"); err != nil {
		return nil, fmt.Errorf("set synchronous: %w", err)
	}

	if err := migrate(ctx, db); err != nil {
		return nil, fmt.Errorf("migrate schema: %w", err)
	}
	if _, err := db.ExecContext(ctx, schema); err != nil {
		return nil, fmt.Errorf("apply schema: %w", err)
	}
	return db, nil
}

// migrate upgrades a database created by an earlier version of the app.
// Es idempotente y corre dentro de una transacción para no dejar DB a medias.
func migrate(ctx context.Context, db *sql.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin migrate tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	hasTable := func(name string) (bool, error) {
		var n int
		err := tx.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?`, name).Scan(&n)
		return n > 0, err
	}

	// Allowlist para PRAGMA table_info — evita inyección vía interpolación.
	allowed := map[string]bool{"groups": true, "commands": true, "executions": true, "projects": true}
	columnNames := func(table string) ([]string, error) {
		if !allowed[table] {
			return nil, fmt.Errorf("columnNames: tabla no permitida %q", table)
		}
		// PRAGMA no soporta placeholders para el nombre de tabla, usamos allowlist + quoting.
		q := fmt.Sprintf(`PRAGMA table_info(%q)`, table)
		rows, err := tx.QueryContext(ctx, q)
		if err != nil {
			return nil, err
		}
		defer func() { _ = rows.Close() }()
		var cols []string
		for rows.Next() {
			var cid int
			var name, ctype string
			var notnull int
			var dflt any
			var pk int
			if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
				return nil, err
			}
			cols = append(cols, name)
		}
		return cols, rows.Err()
	}
	hasCol := func(cols []string, name string) bool {
		for _, c := range cols {
			if c == name {
				return true
			}
		}
		return false
	}

	// 1. projects -> groups
	hasProject, err := hasTable("projects")
	if err != nil {
		return fmt.Errorf("check projects: %w", err)
	}
	hasGroup, err := hasTable("groups")
	if err != nil {
		return fmt.Errorf("check groups: %w", err)
	}
	if hasProject && !hasGroup {
		if _, err := tx.ExecContext(ctx, `ALTER TABLE projects RENAME TO groups`); err != nil {
			return fmt.Errorf("rename projects to groups: %w", err)
		}
	}

	// 2. groups.description + drop path
	if hasGroup || hasProject {
		cols, err := columnNames("groups")
		if err != nil {
			return fmt.Errorf("read groups columns: %w", err)
		}
		if !hasCol(cols, "description") {
			if _, err := tx.ExecContext(ctx,
				`ALTER TABLE groups ADD COLUMN description TEXT NOT NULL DEFAULT ''`); err != nil {
				return fmt.Errorf("add groups.description: %w", err)
			}
		}
		if hasCol(cols, "path") {
			// DROP COLUMN requiere SQLite >=3.35; si falla, lo ignoramos y seguimos
			if _, err := tx.ExecContext(ctx, `ALTER TABLE groups DROP COLUMN path`); err != nil {
				if !strings.Contains(strings.ToLower(err.Error()), "no such column") {
					// Modernc devuelve error genérico si no soporta; no bloqueamos migración
					_ = err
				}
			}
		}
	}

	// 3. commands: project_id -> group_id, drop cols legacy
	hasCmds, err := hasTable("commands")
	if err != nil {
		return fmt.Errorf("check commands: %w", err)
	}
	if hasCmds {
		cols, err := columnNames("commands")
		if err != nil {
			return fmt.Errorf("read commands columns: %w", err)
		}
		if hasCol(cols, "project_id") {
			if _, err := tx.ExecContext(ctx,
				`ALTER TABLE commands RENAME COLUMN project_id TO group_id`); err != nil {
				return fmt.Errorf("rename commands.project_id: %w", err)
			}
		}
		for _, drop := range []string{"working_directory", "shell"} {
			if hasCol(cols, drop) {
				if _, err := tx.ExecContext(ctx,
					`ALTER TABLE commands DROP COLUMN `+drop); err != nil {
					_ = err
				}
			}
		}
		if _, err := tx.ExecContext(ctx, `DROP INDEX IF EXISTS idx_commands_project_id`); err != nil {
			return fmt.Errorf("drop old index: %w", err)
		}
	}

	// 4. executions ya no existe
	hasExec, err := hasTable("executions")
	if err != nil {
		return fmt.Errorf("check executions: %w", err)
	}
	if hasExec {
		if _, err := tx.ExecContext(ctx, `DROP TABLE IF EXISTS executions`); err != nil {
			return fmt.Errorf("drop executions: %w", err)
		}
	}
	if _, err := tx.ExecContext(ctx, `DROP INDEX IF EXISTS idx_executions_command_id`); err != nil {
		return fmt.Errorf("drop old index: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `DROP INDEX IF EXISTS idx_executions_started_at`); err != nil {
		return fmt.Errorf("drop old index: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit migrate: %w", err)
	}
	return nil
}
