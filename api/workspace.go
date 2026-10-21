// Package handler is the Vercel Go function for /api/workspace.
package handler

import (
	"net/http"

	"github.com/sparklingstadt/typle-r/server/vercel"
)

// Workspace is the function Vercel's Go runtime calls for each request.
func Workspace(w http.ResponseWriter, r *http.Request) {
	vercel.Handler().ServeHTTP(w, r)
}
