package main

import (
	"context"
	"embed"
	"log"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"

	"Vault/internal/adapters/repository/sqlite"
	"Vault/internal/adapters/wailsapp"
	"Vault/internal/core/service"
)

//go:embed frontend/dist
var assets embed.FS

func main() {
	dbPath, err := dbFilePath()
	if err != nil {
		log.Fatalf("resolve database path: %v", err)
	}

	ctx := context.Background()
	db, err := sqlite.Open(ctx, dbPath)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer db.Close()

	// --- Adapters (driven side) -------------------------------------------
	commandRepo := sqlite.NewCommandRepository(db)
	groupRepo := sqlite.NewGroupRepository(db)

	// --- Core services (use cases) -----------------------------------------
	commandService := service.NewCommandService(commandRepo)
	groupService := service.NewGroupService(groupRepo)

	// --- Driving adapter (Wails) -------------------------------------------
	app := wailsapp.New(commandService, groupService)

	err = wails.Run(&options.App{
		Title:  "Vault",
		Width:  1100,
		Height: 720,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 18, G: 18, B: 20, A: 1},
		OnStartup:        app.Startup,
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		log.Fatalf("run wails app: %v", err)
	}
}

// dbFilePath resolves ~/.Vault/data.db (created on first
// run), keeping the SQLite file out of the app bundle / working directory.
func dbFilePath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, ".Vault")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return filepath.Join(dir, "data.db"), nil
}
