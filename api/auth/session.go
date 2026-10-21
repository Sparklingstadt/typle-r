// Package handler is the Vercel Go function for /api/auth/session.
package handler

import (
	"net/http"

	"github.com/sparklingstadt/typle-r/server/vercel"
)

// Session is the function Vercel's Go runtime calls for each request.
func Session(w http.ResponseWriter, r *http.Request) {
	vercel.Handler().ServeHTTP(w, r)
}
