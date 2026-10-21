package web

import (
	"context"
	"log"
	"net/http"
	"time"
)

// health answers 200 once the database answers, which is what a deployment check needs to know. HEAD is served as GET;
// net/http leaves the body out.
func (s *server) health(w http.ResponseWriter, r *http.Request) {
	if !methods(w, r, http.MethodGet, http.MethodHead) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	if err := s.config.Store.Ping(ctx); err != nil {
		log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
		refuse(w, http.StatusServiceUnavailable, "databaseUnavailable")
		return
	}
	reply(w, http.StatusOK, map[string]string{"status": "ok"})
}
