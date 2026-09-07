package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"Vault/internal/core/domain"
	"Vault/internal/core/ports"
)

var ErrInvalidCommand = errors.New("comando: el nombre y el comando son obligatorios")

type commandService struct {
	repo ports.CommandRepository
}

// NewCommandService builds the CommandService use cases on top of a
// CommandRepository port. It depends only on the interface, never on a
// concrete adapter (SQLite, in-memory, etc).
func NewCommandService(repo ports.CommandRepository) ports.CommandService {
	return &commandService{repo: repo}
}

func (s *commandService) Create(ctx context.Context, input domain.CommandInput) (domain.Command, error) {
	if strings.TrimSpace(input.Name) == "" || strings.TrimSpace(input.Command) == "" {
		return domain.Command{}, ErrInvalidCommand
	}
	now := time.Now()
	cmd := domain.Command{
		GroupID:     input.GroupID,
		Name:        strings.TrimSpace(input.Name),
		Description: strings.TrimSpace(input.Description),
		Command:     input.Command,
		Favorite:    input.Favorite,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	return s.repo.Create(ctx, cmd)
}

func (s *commandService) Update(ctx context.Context, id int64, input domain.CommandInput) (domain.Command, error) {
	existing, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return domain.Command{}, err
	}
	if strings.TrimSpace(input.Name) == "" || strings.TrimSpace(input.Command) == "" {
		return domain.Command{}, ErrInvalidCommand
	}
	existing.GroupID = input.GroupID
	existing.Name = strings.TrimSpace(input.Name)
	existing.Description = strings.TrimSpace(input.Description)
	existing.Command = input.Command
	existing.Favorite = input.Favorite
	existing.UpdatedAt = time.Now()

	if err := s.repo.Update(ctx, existing); err != nil {
		return domain.Command{}, err
	}
	return existing, nil
}

func (s *commandService) Delete(ctx context.Context, id int64) error {
	return s.repo.Delete(ctx, id)
}

func (s *commandService) Get(ctx context.Context, id int64) (domain.Command, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *commandService) List(ctx context.Context) ([]domain.Command, error) {
	cmds, err := s.repo.List(ctx)
	if err != nil {
		return nil, err
	}
	sortFavoritesFirst(cmds)
	return cmds, nil
}

func (s *commandService) ListByGroup(ctx context.Context, groupID int64) ([]domain.Command, error) {
	return s.repo.ListByGroup(ctx, groupID)
}

func (s *commandService) Search(ctx context.Context, query string) ([]domain.Command, error) {
	cmds, err := s.repo.Search(ctx, query)
	if err != nil {
		return nil, err
	}
	sortFavoritesFirst(cmds)
	return cmds, nil
}

func (s *commandService) ToggleFavorite(ctx context.Context, id int64) (domain.Command, error) {
	cmd, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return domain.Command{}, err
	}
	cmd.Favorite = !cmd.Favorite
	cmd.UpdatedAt = time.Now()
	if err := s.repo.Update(ctx, cmd); err != nil {
		return domain.Command{}, err
	}
	return cmd, nil
}

// sortFavoritesFirst gives favorites priority in search/listing using a
// simple stable partition (no need to pull in sort for such a small,
// already-mostly-ordered slice).
func sortFavoritesFirst(cmds []domain.Command) {
	favs := make([]domain.Command, 0, len(cmds))
	rest := make([]domain.Command, 0, len(cmds))
	for _, c := range cmds {
		if c.Favorite {
			favs = append(favs, c)
		} else {
			rest = append(rest, c)
		}
	}
	copy(cmds, append(favs, rest...))
}
