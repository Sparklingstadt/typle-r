package web

import "net/http"

// failure is a request refused: the status and the error key it is answered with. A failure of the server (a 503) also
// has the error to report, with the operation that failed. The REST handlers answer it with refuse (fail), and
// /api/graphql as a GraphQL error with the same key and status (graphqlError).
type failure struct {
	status    int
	key       string
	err       error
	operation string
}

func refused(status int, key string) *failure { return &failure{status: status, key: key} }

// broken is a failure of the server that is answered with a 503 and key, and reported.
func broken(err error, operation, key string) *failure {
	return &failure{status: http.StatusServiceUnavailable, key: key, err: err, operation: operation}
}

// fail reports f if it is the server's failure, and answers the request with it.
func (s *server) fail(w http.ResponseWriter, r *http.Request, f *failure) {
	if f.err != nil {
		s.report(r, f.err, f.operation)
	}
	refuse(w, f.status, f.key)
}
