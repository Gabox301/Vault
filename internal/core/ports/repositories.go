package ports

import (
	"context"

	"Vault/internal/core/domain"
)

// GroupRepository is the driven port for Group persistence.
type GroupRepository interface {
	Create(ctx context.Context, g domain.Group) (domain.Group, error)
	Update(ctx context.Context, g domain.Group) error
	Delete(ctx context.Context, id int64) error
	GetByID(ctx context.Context, id int64) (domain.Group, error)
	List(ctx context.Context) ([]domain.Group, error)
}

// CommandRepository is a driven (secondary) port: the core defines the
// contract it needs for persistence, and an adapter (e.g. SQLite) fulfils it.
type CommandRepository interface {
	Create(ctx context.Context, cmd domain.Command) (domain.Command, error)
	Update(ctx context.Context, cmd domain.Command) error
	Delete(ctx context.Context, id int64) error
	GetByID(ctx context.Context, id int64) (domain.Command, error)
	List(ctx context.Context) ([]domain.Command, error)
	ListByGroup(ctx context.Context, groupID int64) ([]domain.Command, error)
	Search(ctx context.Context, query string) ([]domain.Command, error)
}
