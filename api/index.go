// Package handler is the one Vercel Go function of the app's backend. vercel.json rewrites every backend path
// (/api/workspace, /api/workspace/records, /api/shares, /api/shared, /api/gallery, /api/gallery/categories,
// /api/gallery/added, /api/health, /api/auth/*, /api/admin/*, /api/graphql) to it, and server/vercel routes on the
// original request path, so the whole backend counts as one function per deployment.
package handler

import (
	"net/http"

	"github.com/sparklingstadt/typle-r/server/vercel"
)

// Handler is the function Vercel's Go runtime calls for each request.
func Handler(w http.ResponseWriter, r *http.Request) {
	vercel.Handler().ServeHTTP(w, r)
}
