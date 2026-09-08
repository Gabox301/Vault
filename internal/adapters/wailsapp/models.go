package wailsapp

import (
	"vault/internal/core/domain"
)

// DTOs de entrada — desacoplan el frontend del dominio.
// Mantienen mismos json tags que domain.*Input para compatibilidad,
// pero son un contrato propio del adaptador Wails.

type CreateGroupRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type CreateCommandRequest struct {
	GroupID     *int64 `json:"groupId,omitempty"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Command     string `json:"command"`
	Favorite    bool   `json:"favorite"`
}

func (r CreateGroupRequest) toDomain() domain.GroupInput {
	return domain.GroupInput{Name: r.Name, Description: r.Description}
}

func (r CreateCommandRequest) toDomain() domain.CommandInput {
	return domain.CommandInput{
		GroupID:     r.GroupID,
		Name:        r.Name,
		Description: r.Description,
		Command:     r.Command,
		Favorite:    r.Favorite,
	}
}

// VMs — lo que el frontend realmente consume.

type GroupVM struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	CreatedAt   int64  `json:"createdAt"`
	UpdatedAt   int64  `json:"updatedAt"`
}

type CommandVM struct {
	ID          int64  `json:"id"`
	GroupID     *int64 `json:"groupId,omitempty"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Command     string `json:"command"`
	Favorite    bool   `json:"favorite"`
	CreatedAt   int64  `json:"createdAt"`
	UpdatedAt   int64  `json:"updatedAt"`
}

func toGroupVM(g domain.Group) GroupVM {
	return GroupVM{
		ID:          g.ID,
		Name:        g.Name,
		Description: g.Description,
		CreatedAt:   g.CreatedAt.UnixMilli(),
		UpdatedAt:   g.UpdatedAt.UnixMilli(),
	}
}

func toCommandVM(c domain.Command) CommandVM {
	return CommandVM{
		ID:          c.ID,
		GroupID:     c.GroupID,
		Name:        c.Name,
		Description: c.Description,
		Command:     c.Command,
		Favorite:    c.Favorite,
		CreatedAt:   c.CreatedAt.UnixMilli(),
		UpdatedAt:   c.UpdatedAt.UnixMilli(),
	}
}

func toGroupVMs(gs []domain.Group) []GroupVM {
	vms := make([]GroupVM, len(gs))
	for i, g := range gs {
		vms[i] = toGroupVM(g)
	}
	return vms
}

func toCommandVMs(cs []domain.Command) []CommandVM {
	vms := make([]CommandVM, len(cs))
	for i, c := range cs {
		vms[i] = toCommandVM(c)
	}
	return vms
}
