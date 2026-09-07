// Package domain is the inner hexagon: pure enterprise entities with no
// framework or IO dependencies.
package domain

import "time"

// Group organizes stored commands (like a folder/tag). It only needs a
// name and an optional description — groups no longer carry a filesystem
// path because the app never inspects project directories.
type Group struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// GroupInput is the payload used to create or update a Group.
type GroupInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}
