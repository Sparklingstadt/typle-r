// Package handler is the Vercel Go function for /api/workspace/records.
package handler

import (
	"net/http"

	"github.com/sparklingstadt/typle-r/server/vercel"
)

// Records is the function Vercel's Go runtime calls for each request.
func Records(w http.ResponseWriter, r *http.Request) {
	vercel.Handler().ServeHTTP(w, r)
}
