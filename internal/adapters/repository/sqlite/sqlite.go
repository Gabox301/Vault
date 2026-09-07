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

	_ "modernc.org/sqlite" // Pure-Go SQLite driver (no CGO required, works with CGO_ENABLED=0)
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

CREATE TABLE IF NOT EXISTS settings (
	key   TEXT PRIMARY KEY,
	value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_commands_group_id ON commands(group_id);
`

// Open creates/opens the SQLite database file at path, migrates any older
// schema and applies the current schema idempotently (safe to call on
// every app start).
func Open(ctx context.Context, path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite db: %w", err)
	}
	db.SetMaxOpenConns(1) // simple desktop app, single writer: keep it serialized

	if _, err := db.ExecContext(ctx, "PRAGMA foreign_keys = ON;"); err != nil {
		return nil, fmt.Errorf("enable foreign keys: %w", err)
	}
	if err := migrate(ctx, db); err != nil {
		return nil, fmt.Errorf("migrate schema: %w", err)
	}
	if _, err := db.ExecContext(ctx, schema); err != nil {
		return nil, fmt.Errorf("apply schema: %w", err)
	}
	return db, nil
}

// migrate upgrades a database created by an earlier version of the app:
//
//	projects  -> groups                  (name + optional description)
//	commands  -> project_id→group_id, drops working_directory & shell
//	executions -> dropped entirely (the app no longer runs commands)
//
// It is idempotent and safe to run on startup against a fresh DB too.
func migrate(ctx context.Context, db *sql.DB) error {
	hasTable := func(name string) (bool, error) {
		var n int
		err := db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?`, name).Scan(&n)
		return n > 0, err
	}
	columnNames := func(table string) ([]string, error) {
		rows, err := db.QueryContext(ctx, `PRAGMA table_info(`+table+`)`)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
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
		if _, err := db.ExecContext(ctx, `ALTER TABLE projects RENAME TO groups`); err != nil {
			return fmt.Errorf("rename projects to groups: %w", err)
		}
	}

	// 2. groups.description column (older DBs only had name + path);
	//    and drop the vestigial path column (groups no longer point to a
	//    filesystem directory).
	if hasGroup || hasProject {
		cols, err := columnNames("groups")
		if err != nil {
			return fmt.Errorf("read groups columns: %w", err)
		}
		if !hasCol(cols, "description") {
			if _, err := db.ExecContext(ctx,
				`ALTER TABLE groups ADD COLUMN description TEXT NOT NULL DEFAULT ''`); err != nil {
				return fmt.Errorf("add groups.description: %w", err)
			}
		}
		if hasCol(cols, "path") {
			if _, err := db.ExecContext(ctx, `ALTER TABLE groups DROP COLUMN path`); err != nil {
				return fmt.Errorf("drop groups.path: %w", err)
			}
		}
	}

	// 3. commands: rename project_id -> group_id, drop execution-only cols
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
			if _, err := db.ExecContext(ctx,
				`ALTER TABLE commands RENAME COLUMN project_id TO group_id`); err != nil {
				return fmt.Errorf("rename commands.project_id: %w", err)
			}
		}
		for _, drop := range []string{"working_directory", "shell"} {
			if hasCol(cols, drop) {
				if _, err := db.ExecContext(ctx,
					`ALTER TABLE commands DROP COLUMN `+drop); err != nil {
					return fmt.Errorf("drop commands.%s: %w", drop, err)
				}
			}
		}
		if _, err := db.ExecContext(ctx, `DROP INDEX IF EXISTS idx_commands_project_id`); err != nil {
			return fmt.Errorf("drop old index: %w", err)
		}
	}

	// 4. executions (history) is no longer part of the app
	hasExec, err := hasTable("executions")
	if err != nil {
		return fmt.Errorf("check executions: %w", err)
	}
	if hasExec {
		if _, err := db.ExecContext(ctx, `DROP TABLE IF EXISTS executions`); err != nil {
			return fmt.Errorf("drop executions: %w", err)
		}
	}

	// Drop leftover history indexes, if any.
	if _, err := db.ExecContext(ctx, `DROP INDEX IF EXISTS idx_executions_command_id`); err != nil {
		return fmt.Errorf("drop old index: %w", err)
	}
	if _, err := db.ExecContext(ctx, `DROP INDEX IF EXISTS idx_executions_started_at`); err != nil {
		return fmt.Errorf("drop old index: %w", err)
	}
	return nil
}
