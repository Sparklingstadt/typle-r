// Package handler is the Vercel Go function for /api/graphql.
package handler

import (
	"net/http"

	"github.com/sparklingstadt/typle-r/server/vercel"
)

// GraphQL is the function Vercel's Go runtime calls for each request.
func GraphQL(w http.ResponseWriter, r *http.Request) {
	vercel.Handler().ServeHTTP(w, r)
}
