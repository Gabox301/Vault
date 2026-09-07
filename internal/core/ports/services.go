package ports

import (
	"context"

	"Vault/internal/core/domain"
)

// GroupService is a primary (driving) port: the use cases around managing
// Groups. The Wails "App" adapter calls into this; it never touches
// repositories directly.
type GroupService interface {
	Create(ctx context.Context, input domain.GroupInput) (domain.Group, error)
	Update(ctx context.Context, id int64, input domain.GroupInput) (domain.Group, error)
	Delete(ctx context.Context, id int64) error
	Get(ctx context.Context, id int64) (domain.Group, error)
	List(ctx context.Context) ([]domain.Group, error)
}

// CommandService is a primary (driving) port: the use cases around
// managing Commands.
type CommandService interface {
	Create(ctx context.Context, input domain.CommandInput) (domain.Command, error)
	Update(ctx context.Context, id int64, input domain.CommandInput) (domain.Command, error)
	Delete(ctx context.Context, id int64) error
	Get(ctx context.Context, id int64) (domain.Command, error)
	List(ctx context.Context) ([]domain.Command, error)
	ListByGroup(ctx context.Context, groupID int64) ([]domain.Command, error)
	Search(ctx context.Context, query string) ([]domain.Command, error)
	ToggleFavorite(ctx context.Context, id int64) (domain.Command, error)
}
