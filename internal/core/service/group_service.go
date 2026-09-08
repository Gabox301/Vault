package service

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"vault/internal/core/domain"
	"vault/internal/core/ports"
)

const maxGroupNameLen = 120

type groupService struct {
	repo ports.GroupRepository
}

// NewGroupService builds the GroupService use cases on top of a
// GroupRepository port.
func NewGroupService(repo ports.GroupRepository) ports.GroupService {
	return &groupService{repo: repo}
}

func (s *groupService) Create(ctx context.Context, input domain.GroupInput) (domain.Group, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return domain.Group{}, domain.ErrInvalidGroup
	}
	if utf8.RuneCountInString(name) > maxGroupNameLen {
		return domain.Group{}, fmt.Errorf("%w: nombre supera %d caracteres", domain.ErrInvalidGroup, maxGroupNameLen)
	}
	if utf8.RuneCountInString(input.Description) > maxDescriptionLen {
		return domain.Group{}, fmt.Errorf("%w: descripción supera %d caracteres", domain.ErrInvalidGroup, maxDescriptionLen)
	}
	now := time.Now().UTC()
	g := domain.Group{
		Name:        name,
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
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return domain.Group{}, domain.ErrInvalidGroup
	}
	if utf8.RuneCountInString(name) > maxGroupNameLen {
		return domain.Group{}, fmt.Errorf("%w: nombre supera %d caracteres", domain.ErrInvalidGroup, maxGroupNameLen)
	}
	existing.Name = name
	existing.Description = strings.TrimSpace(input.Description)
	existing.UpdatedAt = time.Now().UTC()
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
