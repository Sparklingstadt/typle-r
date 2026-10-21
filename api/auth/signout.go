// Package handler is the Vercel Go function for /api/auth/signout.
package handler

import (
	"net/http"

	"github.com/sparklingstadt/typle-r/server/vercel"
)

// Signout is the function Vercel's Go runtime calls for each request.
func Signout(w http.ResponseWriter, r *http.Request) {
	vercel.Handler().ServeHTTP(w, r)
}
