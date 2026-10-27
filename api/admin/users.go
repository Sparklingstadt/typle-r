// Package handler is the Vercel Go function for /api/admin/users.
package handler

import (
	"net/http"

	"github.com/sparklingstadt/typle-r/server/vercel"
)

// Users is the function Vercel's Go runtime calls for each request.
func Users(w http.ResponseWriter, r *http.Request) {
	vercel.Handler().ServeHTTP(w, r)
}
