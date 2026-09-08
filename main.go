// Package main is the composition root: wires ports to adapters and starts Wails.
package main

import (
	"context"
	"embed"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"

	"vault/internal/adapters/repository/sqlite"
	"vault/internal/adapters/wailsapp"
	"vault/internal/core/service"
)

//go:embed frontend/dist
var assets embed.FS

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	dbPath, err := dbFilePath()
	if err != nil {
		logger.Error("resolve database path", "err", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	db, err := sqlite.Open(ctx, dbPath)
	cancel()
	if err != nil {
		logger.Error("open database", "path", dbPath, "err", err)
		os.Exit(1)
	}
	defer func() {
		if err := db.Close(); err != nil {
			logger.Warn("close db", "err", err)
		}
	}()

	// --- Adapters (driven side) -------------------------------------------
	commandRepo := sqlite.NewCommandRepository(db)
	groupRepo := sqlite.NewGroupRepository(db)

	// --- Core services (use cases) -----------------------------------------
	commandService := service.NewCommandService(commandRepo)
	groupService := service.NewGroupService(groupRepo)

	// --- Driving adapter (Wails) -------------------------------------------
	app := wailsapp.New(commandService, groupService)

	if err := wails.Run(&options.App{
		Title:     "Vault",
		Width:     1280,
		Height:    720,
		MinWidth:  1280,
		MinHeight: 720,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 18, G: 18, B: 20, A: 1},
		OnStartup:        app.Startup,
		Bind: []interface{}{
			app,
		},
	}); err != nil {
		logger.Error("run wails app", "err", err)
		os.Exit(1) //nolint:gocritic
	}
}

// dbFilePath resolves ~/.vault/data.db (created on first run).
func dbFilePath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, ".Vault")
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return "", err
	}
	return filepath.Join(dir, "data.db"), nil
}
