// Package handler is the Vercel Go function for /api/shared.
package handler

import (
	"net/http"

	"github.com/sparklingstadt/typle-r/server/vercel"
)

// Shared is the function Vercel's Go runtime calls for each request.
func Shared(w http.ResponseWriter, r *http.Request) {
	vercel.Handler().ServeHTTP(w, r)
}
