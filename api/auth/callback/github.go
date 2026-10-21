// Package handler is the Vercel Go function for /api/auth/callback/github.
package handler

import (
	"net/http"

	"github.com/sparklingstadt/typle-r/server/vercel"
)

// Callback is the function Vercel's Go runtime calls for each request.
func Callback(w http.ResponseWriter, r *http.Request) {
	vercel.Handler().ServeHTTP(w, r)
}
