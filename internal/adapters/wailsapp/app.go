// Package wailsapp is the primary (driving) adapter: it's the only place
// that knows about Wails. It exposes methods that get bound to the
// frontend (window.go.wailsapp.App.*) and translates them into calls on the
// core's primary ports (ports.CommandService, ports.GroupService).
package wailsapp

import (
	"context"

	"Vault/internal/core/domain"
	"Vault/internal/core/ports"
)

// App is bound to Wails as the sole JS-callable surface. Everything it
// does is delegate to a primary port — no business logic lives here.
type App struct {
	ctx context.Context

	Commands ports.CommandService
	Groups   ports.GroupService
}

// New builds the App adapter.
func New(commands ports.CommandService, groups ports.GroupService) *App {
	return &App{
		Commands: commands,
		Groups:   groups,
	}
}

// Startup is a Wails lifecycle hook, called once the frontend is ready.
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
}

// --- Groups ---------------------------------------------------------------

func (a *App) GetGroups() ([]GroupVM, error) {
	gs, err := a.Groups.List(a.ctx)
	if err != nil {
		return nil, err
	}
	return toGroupVMs(gs), nil
}

func (a *App) GetGroup(id int64) (GroupVM, error) {
	g, err := a.Groups.Get(a.ctx, id)
	if err != nil {
		return GroupVM{}, err
	}
	return toGroupVM(g), nil
}

func (a *App) CreateGroup(input domain.GroupInput) (GroupVM, error) {
	g, err := a.Groups.Create(a.ctx, input)
	if err != nil {
		return GroupVM{}, err
	}
	return toGroupVM(g), nil
}

func (a *App) UpdateGroup(id int64, input domain.GroupInput) (GroupVM, error) {
	g, err := a.Groups.Update(a.ctx, id, input)
	if err != nil {
		return GroupVM{}, err
	}
	return toGroupVM(g), nil
}

func (a *App) DeleteGroup(id int64) error {
	return a.Groups.Delete(a.ctx, id)
}

// --- Commands --------------------------------------------------------------

func (a *App) GetCommands() ([]CommandVM, error) {
	cs, err := a.Commands.List(a.ctx)
	if err != nil {
		return nil, err
	}
	return toCommandVMs(cs), nil
}

func (a *App) GetCommandsByGroup(groupID int64) ([]CommandVM, error) {
	cs, err := a.Commands.ListByGroup(a.ctx, groupID)
	if err != nil {
		return nil, err
	}
	return toCommandVMs(cs), nil
}

func (a *App) SearchCommands(query string) ([]CommandVM, error) {
	cs, err := a.Commands.Search(a.ctx, query)
	if err != nil {
		return nil, err
	}
	return toCommandVMs(cs), nil
}

func (a *App) GetCommand(id int64) (CommandVM, error) {
	c, err := a.Commands.Get(a.ctx, id)
	if err != nil {
		return CommandVM{}, err
	}
	return toCommandVM(c), nil
}

func (a *App) CreateCommand(input domain.CommandInput) (CommandVM, error) {
	c, err := a.Commands.Create(a.ctx, input)
	if err != nil {
		return CommandVM{}, err
	}
	return toCommandVM(c), nil
}

func (a *App) UpdateCommand(id int64, input domain.CommandInput) (CommandVM, error) {
	c, err := a.Commands.Update(a.ctx, id, input)
	if err != nil {
		return CommandVM{}, err
	}
	return toCommandVM(c), nil
}

func (a *App) DeleteCommand(id int64) error {
	return a.Commands.Delete(a.ctx, id)
}

func (a *App) ToggleFavorite(id int64) (CommandVM, error) {
	c, err := a.Commands.ToggleFavorite(a.ctx, id)
	if err != nil {
		return CommandVM{}, err
	}
	return toCommandVM(c), nil
}
