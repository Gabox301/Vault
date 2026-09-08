// Package service implements primary ports (use cases) on top of repository ports.
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

const (
	maxCommandNameLen = 200
	maxCommandLen     = 10000
	maxDescriptionLen = 2000
)

type commandService struct {
	repo ports.CommandRepository
}

// NewCommandService builds the CommandService use cases on top of a
// CommandRepository port.
func NewCommandService(repo ports.CommandRepository) ports.CommandService {
	return &commandService{repo: repo}
}

func (s *commandService) Create(ctx context.Context, input domain.CommandInput) (domain.Command, error) {
	name := strings.TrimSpace(input.Name)
	cmdStr := strings.TrimSpace(input.Command)
	if name == "" || cmdStr == "" {
		return domain.Command{}, domain.ErrInvalidCommand
	}
	if utf8.RuneCountInString(name) > maxCommandNameLen {
		return domain.Command{}, fmt.Errorf("%w: nombre supera %d caracteres", domain.ErrInvalidCommand, maxCommandNameLen) //nolint:misspell
	}
	if utf8.RuneCountInString(cmdStr) > maxCommandLen {
		return domain.Command{}, fmt.Errorf("%w: comando supera %d caracteres", domain.ErrInvalidCommand, maxCommandLen) //nolint:misspell
	}
	if utf8.RuneCountInString(input.Description) > maxDescriptionLen {
		return domain.Command{}, fmt.Errorf("%w: descripción supera %d caracteres", domain.ErrInvalidCommand, maxDescriptionLen) //nolint:misspell
	}

	now := time.Now().UTC()
	cmd := domain.Command{
		GroupID:     input.GroupID,
		Name:        name,
		Description: strings.TrimSpace(input.Description),
		Command:     cmdStr,
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
	name := strings.TrimSpace(input.Name)
	cmdStr := strings.TrimSpace(input.Command)
	if name == "" || cmdStr == "" {
		return domain.Command{}, domain.ErrInvalidCommand
	}
	if utf8.RuneCountInString(name) > maxCommandNameLen {
		return domain.Command{}, fmt.Errorf("%w: nombre supera %d caracteres", domain.ErrInvalidCommand, maxCommandNameLen) //nolint:misspell
	}
	if utf8.RuneCountInString(cmdStr) > maxCommandLen {
		return domain.Command{}, fmt.Errorf("%w: comando supera %d caracteres", domain.ErrInvalidCommand, maxCommandLen) //nolint:misspell
	}

	existing.GroupID = input.GroupID
	existing.Name = name
	existing.Description = strings.TrimSpace(input.Description)
	existing.Command = cmdStr
	existing.Favorite = input.Favorite
	existing.UpdatedAt = time.Now().UTC()

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
	return s.repo.List(ctx)
}

func (s *commandService) ListByGroup(ctx context.Context, groupID int64) ([]domain.Command, error) {
	return s.repo.ListByGroup(ctx, groupID)
}

func (s *commandService) Search(ctx context.Context, query string) ([]domain.Command, error) {
	return s.repo.Search(ctx, strings.TrimSpace(query))
}

func (s *commandService) ToggleFavorite(ctx context.Context, id int64) (domain.Command, error) {
	cmd, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return domain.Command{}, err
	}
	cmd.Favorite = !cmd.Favorite
	cmd.UpdatedAt = time.Now().UTC()
	if err := s.repo.Update(ctx, cmd); err != nil {
		return domain.Command{}, err
	}
	return cmd, nil
}
