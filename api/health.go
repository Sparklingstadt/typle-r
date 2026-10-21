// Package handler is the Vercel Go function for /api/health.
package handler

import (
	"net/http"

	"github.com/sparklingstadt/typle-r/server/vercel"
)

// Health is the function Vercel's Go runtime calls for each request.
func Health(w http.ResponseWriter, r *http.Request) {
	vercel.Handler().ServeHTTP(w, r)
}
