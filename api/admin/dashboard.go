// Package handler is the Vercel Go function for /api/admin/dashboard.
package handler

import (
	"net/http"

	"github.com/sparklingstadt/typle-r/server/vercel"
)

// Dashboard is the function Vercel's Go runtime calls for each request.
func Dashboard(w http.ResponseWriter, r *http.Request) {
	vercel.Handler().ServeHTTP(w, r)
}
