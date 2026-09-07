package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"Vault/internal/core/domain"
	"Vault/internal/core/ports"
)

type groupRepo struct {
	db *sql.DB
}

// NewGroupRepository returns a ports.GroupRepository backed by SQLite.
func NewGroupRepository(db *sql.DB) ports.GroupRepository {
	return &groupRepo{db: db}
}

func (r *groupRepo) Create(ctx context.Context, g domain.Group) (domain.Group, error) {
	res, err := r.db.ExecContext(ctx, `
		INSERT INTO groups (name, description, created_at, updated_at)
		VALUES (?, ?, ?, ?)`,
		g.Name, g.Description, g.CreatedAt, g.UpdatedAt,
	)
	if err != nil {
		return domain.Group{}, fmt.Errorf("insert group: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return domain.Group{}, err
	}
	g.ID = id
	return g, nil
}

func (r *groupRepo) Update(ctx context.Context, g domain.Group) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE groups SET name = ?, description = ?, updated_at = ? WHERE id = ?`,
		g.Name, g.Description, g.UpdatedAt, g.ID,
	)
	if err != nil {
		return fmt.Errorf("update group %d: %w", g.ID, err)
	}
	return nil
}

func (r *groupRepo) Delete(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM groups WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete group %d: %w", id, err)
	}
	return nil
}

func (r *groupRepo) GetByID(ctx context.Context, id int64) (domain.Group, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, name, description, created_at, updated_at FROM groups WHERE id = ?`, id)
	g, err := scanGroup(row)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Group{}, fmt.Errorf("group %d not found: %w", id, err)
	}
	return g, err
}

func (r *groupRepo) List(ctx context.Context) ([]domain.Group, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, name, description, created_at, updated_at FROM groups ORDER BY name ASC`)
	if err != nil {
		return nil, fmt.Errorf("list groups: %w", err)
	}
	defer rows.Close()

	var out []domain.Group
	for rows.Next() {
		g, err := scanGroup(rows)
		if err != nil {
			return nil, fmt.Errorf("scan group row: %w", err)
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanGroup(row rowScanner) (domain.Group, error) {
	var g domain.Group
	if err := row.Scan(&g.ID, &g.Name, &g.Description, &g.CreatedAt, &g.UpdatedAt); err != nil {
		return domain.Group{}, err
	}
	return g, nil
}
