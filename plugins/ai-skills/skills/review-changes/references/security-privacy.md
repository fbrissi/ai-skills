# Security and privacy pass

Load this only when the change set touches authentication, sessions, tokens, permissions, tenancy, personal data, secrets, logging of request data, file or object storage, or data retention and deletion. Each item is a question to answer from the code. Report a finding only when you can name the input, the path, and the harm. Repository guidance (`AGENTS.md`/`CLAUDE.md`) overrides these defaults.

## Authentication and sessions

- Every new or changed route or handler states its access policy explicitly: public, authenticated, or a named permission. Proving identity is not the same as authorizing the action.
- Rejected sign-in, recovery, invitation, and verification paths answer with the same status, body, and comparable work, whether the account is unknown, inactive, blocked, or belongs to another application. Look for early returns that skip a password hash or a database lookup, and for different error codes or messages.
- Tokens (reset, invitation, magic link, API) are validated on the server for every mutation, not only before rendering. Check expiry, single use, binding to the subject, and binding to the intended application or scope.
- Session and cookie changes keep `HttpOnly`, `Secure`, `SameSite`, and the expected scope and lifetime. A logout or credential change revokes the sessions it should.

## Authorization and tenancy

- Every read, update, delete, count, or related-row query on tenant-owned data filters by the tenant resolved by the server, never by an ID taken from the request. An entity ID alone is not an authorization boundary.
- Bulk, export, search, and background-job paths enforce the same rules as the single-item path. Look for "select all" or query-based selections and for queue consumers that trust the message.
- Object-storage keys, signed URLs, and download endpoints check ownership before serving.

## Personal data and secrets

- Logs, error messages, analytics events, traces, error-reporting payloads, and queue messages carry no secrets, credentials, tokens, authorization headers, cookies, certificates, or unnecessary personal data. That includes values passed through generic `error.message` or full request or response dumps.
- Responses and client-side state expose only the fields the caller needs. Look for whole records returned or serialized by default, and for personal data written to `localStorage` or URLs.
- Secrets come from the platform secret store, never from code, committed config, or client bundles.
- New personal data collected or newly shared with a third party has a stated purpose and legal basis, and a retention rule (LGPD/GDPR). Flag it when the change adds collection, sharing, or a new processor without either.

## Retention and deletion

- Deletion and anonymization reach every copy the change creates: derived tables, caches, object storage, search indexes, outboxes, and exports.
- Retention jobs are idempotent, tenant-scoped, and do not delete records the law or the domain requires to keep (fiscal, audit, legal hold).

## Input and output handling

- Untrusted input reaching SQL, shell, HTML, templates, file paths, redirects, or outbound URLs is parameterized, escaped, or allow-listed (injection, XSS, path traversal, open redirect, SSRF).
- Uploads check type and size and are never executed or served as active content from the app origin.
- Rate limits, timeouts, and size limits stay in place on public or expensive endpoints.
