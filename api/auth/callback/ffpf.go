// Package handler is the Vercel Go function for /api/auth/callback/ffpf.
package handler

import (
	"net/http"

	"github.com/sparklingstadt/typle-r/server/vercel"
)

// Ffpf is the function Vercel's Go runtime calls for each request.
func Ffpf(w http.ResponseWriter, r *http.Request) {
	vercel.Handler().ServeHTTP(w, r)
}
