// Package handler is the Vercel Go function for /api/auth/token.
package handler

import (
	"net/http"

	"github.com/sparklingstadt/typle-r/server/vercel"
)

// Token is the function Vercel's Go runtime calls for each request.
func Token(w http.ResponseWriter, r *http.Request) {
	vercel.Handler().ServeHTTP(w, r)
}
