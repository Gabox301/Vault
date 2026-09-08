package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"vault/internal/core/domain"
	"vault/internal/core/ports"
)

type commandRepo struct {
	db *sql.DB
}

// NewCommandRepository returns a ports.CommandRepository backed by SQLite.
func NewCommandRepository(db *sql.DB) ports.CommandRepository {
	return &commandRepo{db: db}
}

const commandColumns = `id, group_id, name, description, command, favorite, created_at, updated_at`

func (r *commandRepo) Create(ctx context.Context, c domain.Command) (domain.Command, error) {
	res, err := r.db.ExecContext(ctx, `
		INSERT INTO commands (group_id, name, description, command, favorite, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		c.GroupID, c.Name, c.Description, c.Command, c.Favorite, c.CreatedAt, c.UpdatedAt,
	)
	if err != nil {
		return domain.Command{}, fmt.Errorf("insert command: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return domain.Command{}, err
	}
	c.ID = id
	return c, nil
}

func (r *commandRepo) Update(ctx context.Context, c domain.Command) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE commands
		SET group_id = ?, name = ?, description = ?, command = ?, favorite = ?, updated_at = ?
		WHERE id = ?`,
		c.GroupID, c.Name, c.Description, c.Command, c.Favorite, c.UpdatedAt, c.ID,
	)
	if err != nil {
		return fmt.Errorf("update command %d: %w", c.ID, err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("update command %d: %w", c.ID, domain.ErrNotFound)
	}
	return nil
}

func (r *commandRepo) Delete(ctx context.Context, id int64) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM commands WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete command %d: %w", id, err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("delete command %d: %w", id, domain.ErrNotFound)
	}
	return nil
}

func (r *commandRepo) GetByID(ctx context.Context, id int64) (domain.Command, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT `+commandColumns+` FROM commands WHERE id = ?`, id)
	c, err := scanCommand(row)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Command{}, fmt.Errorf("command %d: %w", id, domain.ErrNotFound)
	}
	return c, err
}

func (r *commandRepo) List(ctx context.Context) ([]domain.Command, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT `+commandColumns+` FROM commands ORDER BY favorite DESC, name COLLATE NOCASE ASC`)
	if err != nil {
		return nil, fmt.Errorf("list commands: %w", err)
	}
	defer func() { _ = rows.Close() }()
	return scanCommands(rows)
}

func (r *commandRepo) ListByGroup(ctx context.Context, groupID int64) ([]domain.Command, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT `+commandColumns+` FROM commands WHERE group_id = ? ORDER BY favorite DESC, name COLLATE NOCASE ASC`, groupID)
	if err != nil {
		return nil, fmt.Errorf("list commands for group %d: %w", groupID, err)
	}
	defer func() { _ = rows.Close() }()
	return scanCommands(rows)
}

func (r *commandRepo) Search(ctx context.Context, query string) ([]domain.Command, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return r.List(ctx)
	}
	// Escapar wildcards de LIKE y limitar tamaño
	if len(query) > 200 {
		query = query[:200]
	}
	esc := escapeLike(query)
	like := "%" + esc + "%"
	rows, err := r.db.QueryContext(ctx, `
		SELECT `+commandColumns+` FROM commands
		WHERE name LIKE ? ESCAPE '\' COLLATE NOCASE
		   OR description LIKE ? ESCAPE '\' COLLATE NOCASE
		   OR command LIKE ? ESCAPE '\' COLLATE NOCASE
		ORDER BY favorite DESC, name COLLATE NOCASE ASC
		LIMIT 100`, like, like, like)
	if err != nil {
		return nil, fmt.Errorf("search commands: %w", err)
	}
	defer func() { _ = rows.Close() }()
	return scanCommands(rows)
}

func escapeLike(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `%`, `\%`)
	s = strings.ReplaceAll(s, `_`, `\_`)
	return s
}

func scanCommand(row rowScanner) (domain.Command, error) {
	var c domain.Command
	var groupID sql.NullInt64
	if err := row.Scan(&c.ID, &groupID, &c.Name, &c.Description, &c.Command,
		&c.Favorite, &c.CreatedAt, &c.UpdatedAt); err != nil {
		return domain.Command{}, err
	}
	if groupID.Valid {
		c.GroupID = &groupID.Int64
	}
	return c, nil
}

func scanCommands(rows *sql.Rows) ([]domain.Command, error) {
	var out []domain.Command
	for rows.Next() {
		c, err := scanCommand(rows)
		if err != nil {
			return nil, fmt.Errorf("scan command row: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
