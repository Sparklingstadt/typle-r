// Package handler is the Vercel Go function for /api/shares.
package handler

import (
	"net/http"

	"github.com/sparklingstadt/typle-r/server/vercel"
)

// Shares is the function Vercel's Go runtime calls for each request.
func Shares(w http.ResponseWriter, r *http.Request) {
	vercel.Handler().ServeHTTP(w, r)
}
