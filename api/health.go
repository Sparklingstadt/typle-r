// Package handler is the Vercel Go function for /api/health. Later routes are served by the same handler.
package handler

import (
	"net/http"

	"github.com/sparklingstadt/typle-r/server/vercel"
)

// Handler is the function Vercel's Go runtime calls for each request.
func Handler(w http.ResponseWriter, r *http.Request) {
	vercel.Handler().ServeHTTP(w, r)
}
