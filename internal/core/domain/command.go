package domain

import "time"

// Command is a stored terminal command the user wants to keep at hand to
// copy into their own terminal. It can optionally belong to a Group.
// Nothing here is tied to execution: the app only saves commands so they
// can be recovered and copied quickly.
type Command struct {
	ID          int64     `json:"id"`
	GroupID     *int64    `json:"groupId,omitempty"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Command     string    `json:"command"`
	Favorite    bool      `json:"favorite"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// CommandInput is the payload used to create or update a Command.
type CommandInput struct {
	GroupID     *int64 `json:"groupId,omitempty"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Command     string `json:"command"`
	Favorite    bool   `json:"favorite"`
}
