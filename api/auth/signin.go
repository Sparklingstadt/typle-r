// Package handler is the Vercel Go function for /api/auth/signin.
package handler

import (
	"net/http"

	"github.com/sparklingstadt/typle-r/server/vercel"
)

// Signin is the function Vercel's Go runtime calls for each request.
func Signin(w http.ResponseWriter, r *http.Request) {
	vercel.Handler().ServeHTTP(w, r)
}
