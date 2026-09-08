// Package wailsapp is the primary (driving) adapter: it's the only place
// that knows about Wails. It exposes methods that get bound to the
// frontend (window.go.wailsapp.App.*) and translates them into calls on the
// core's primary ports.
package wailsapp

import (
	"context"
	"sync"
	"time"

	"vault/internal/core/ports"
)

// App is bound to Wails as the sole JS-callable surface.
// Fields son privados para no filtrarse vía reflect al frontend.
type App struct {
	mu sync.RWMutex
	//nolint:containedctx // Wails requiere almacenar ctx del lifecycle para bound methods.
	ctx      context.Context
	commands ports.CommandService
	groups   ports.GroupService
}

// New builds the App adapter.
func New(commands ports.CommandService, groups ports.GroupService) *App {
	return &App{
		commands: commands,
		groups:   groups,
	}
}

// Startup is a Wails lifecycle hook, called once the frontend is ready.
func (a *App) Startup(ctx context.Context) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.ctx = ctx
}

func (a *App) ctxOrBG() context.Context {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if a.ctx != nil {
		return a.ctx
	}
	return context.Background()
}

func withTimeout(parent context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(parent, 4*time.Second)
}

// --- Groups ---------------------------------------------------------------

func (a *App) GetGroups() ([]GroupVM, error) {
	ctx, cancel := withTimeout(a.ctxOrBG())
	defer cancel()
	gs, err := a.groups.List(ctx)
	if err != nil {
		return nil, err
	}
	return toGroupVMs(gs), nil
}

func (a *App) GetGroup(id int64) (GroupVM, error) {
	ctx, cancel := withTimeout(a.ctxOrBG())
	defer cancel()
	g, err := a.groups.Get(ctx, id)
	if err != nil {
		return GroupVM{}, err
	}
	return toGroupVM(g), nil
}

func (a *App) CreateGroup(input CreateGroupRequest) (GroupVM, error) {
	ctx, cancel := withTimeout(a.ctxOrBG())
	defer cancel()
	g, err := a.groups.Create(ctx, input.toDomain())
	if err != nil {
		return GroupVM{}, err
	}
	return toGroupVM(g), nil
}

func (a *App) UpdateGroup(id int64, input CreateGroupRequest) (GroupVM, error) {
	ctx, cancel := withTimeout(a.ctxOrBG())
	defer cancel()
	g, err := a.groups.Update(ctx, id, input.toDomain())
	if err != nil {
		return GroupVM{}, err
	}
	return toGroupVM(g), nil
}

func (a *App) DeleteGroup(id int64) error {
	ctx, cancel := withTimeout(a.ctxOrBG())
	defer cancel()
	return a.groups.Delete(ctx, id)
}

// --- Commands --------------------------------------------------------------

func (a *App) GetCommands() ([]CommandVM, error) {
	ctx, cancel := withTimeout(a.ctxOrBG())
	defer cancel()
	cs, err := a.commands.List(ctx)
	if err != nil {
		return nil, err
	}
	return toCommandVMs(cs), nil
}

func (a *App) GetCommandsByGroup(groupID int64) ([]CommandVM, error) {
	ctx, cancel := withTimeout(a.ctxOrBG())
	defer cancel()
	cs, err := a.commands.ListByGroup(ctx, groupID)
	if err != nil {
		return nil, err
	}
	return toCommandVMs(cs), nil
}

func (a *App) SearchCommands(query string) ([]CommandVM, error) {
	ctx, cancel := withTimeout(a.ctxOrBG())
	defer cancel()
	cs, err := a.commands.Search(ctx, query)
	if err != nil {
		return nil, err
	}
	return toCommandVMs(cs), nil
}

func (a *App) GetCommand(id int64) (CommandVM, error) {
	ctx, cancel := withTimeout(a.ctxOrBG())
	defer cancel()
	c, err := a.commands.Get(ctx, id)
	if err != nil {
		return CommandVM{}, err
	}
	return toCommandVM(c), nil
}

func (a *App) CreateCommand(input CreateCommandRequest) (CommandVM, error) {
	ctx, cancel := withTimeout(a.ctxOrBG())
	defer cancel()
	c, err := a.commands.Create(ctx, input.toDomain())
	if err != nil {
		return CommandVM{}, err
	}
	return toCommandVM(c), nil
}

func (a *App) UpdateCommand(id int64, input CreateCommandRequest) (CommandVM, error) {
	ctx, cancel := withTimeout(a.ctxOrBG())
	defer cancel()
	c, err := a.commands.Update(ctx, id, input.toDomain())
	if err != nil {
		return CommandVM{}, err
	}
	return toCommandVM(c), nil
}

func (a *App) DeleteCommand(id int64) error {
	ctx, cancel := withTimeout(a.ctxOrBG())
	defer cancel()
	return a.commands.Delete(ctx, id)
}

func (a *App) ToggleFavorite(id int64) (CommandVM, error) {
	ctx, cancel := withTimeout(a.ctxOrBG())
	defer cancel()
	c, err := a.commands.ToggleFavorite(ctx, id)
	if err != nil {
		return CommandVM{}, err
	}
	return toCommandVM(c), nil
}
