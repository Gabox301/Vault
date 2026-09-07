package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"Vault/internal/core/domain"
	"Vault/internal/core/ports"
)

var ErrInvalidGroup = errors.New("grupo: el nombre es obligatorio")

type groupService struct {
	repo ports.GroupRepository
}

// NewGroupService builds the GroupService use cases on top of a
// GroupRepository port. It depends only on the interface, never on a
// concrete adapter (SQLite, in-memory, etc).
func NewGroupService(repo ports.GroupRepository) ports.GroupService {
	return &groupService{repo: repo}
}

func (s *groupService) Create(ctx context.Context, input domain.GroupInput) (domain.Group, error) {
	if strings.TrimSpace(input.Name) == "" {
		return domain.Group{}, ErrInvalidGroup
	}
	now := time.Now()
	g := domain.Group{
		Name:        strings.TrimSpace(input.Name),
		Description: strings.TrimSpace(input.Description),
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	return s.repo.Create(ctx, g)
}

func (s *groupService) Update(ctx context.Context, id int64, input domain.GroupInput) (domain.Group, error) {
	existing, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return domain.Group{}, err
	}
	if strings.TrimSpace(input.Name) == "" {
		return domain.Group{}, ErrInvalidGroup
	}
	existing.Name = strings.TrimSpace(input.Name)
	existing.Description = strings.TrimSpace(input.Description)
	existing.UpdatedAt = time.Now()
	if err := s.repo.Update(ctx, existing); err != nil {
		return domain.Group{}, err
	}
	return existing, nil
}

func (s *groupService) Delete(ctx context.Context, id int64) error {
	return s.repo.Delete(ctx, id)
}

func (s *groupService) Get(ctx context.Context, id int64) (domain.Group, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *groupService) List(ctx context.Context) ([]domain.Group, error) {
	return s.repo.List(ctx)
}
