package domain

import "errors"

// Sentinel errors del dominio — permiten a los adaptadores mapear
// errores de infraestructura (sql.ErrNoRows) a un contrato estable
// testeable con errors.Is.
var (
	ErrNotFound       = errors.New("not found")
	ErrInvalidCommand = errors.New("comando: el nombre y el comando son obligatorios") //nolint:misspell
	ErrInvalidGroup   = errors.New("grupo: el nombre es obligatorio")                  //nolint:misspell
)
