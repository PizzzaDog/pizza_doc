---
id: user-input-rejections
title: 4xx user-input rejections (support playbook)
severity: validation-error
owner: solo
trigger: Support ticket says "I can't sign up / log in / save a pizza"
covers:
  - validation-error
  - weak-password
  - email-already-exists
  - invalid-credentials
  - unauthorized
  - pizza-not-found
---

## Scope

Every 4xx in this family is a *correct* rejection of user input — not
an incident. This playbook exists so support can map an error code to
an answer without engineering; the wire codes come from the api-server
`errorMapping` table.

## Code → answer

| Code | Meaning | Support answer |
| --- | --- | --- |
| `VALIDATION` (400) | Malformed pizza payload in the admin form | Point at the failing field; validation rules live on the model |
| `WEAK_PASSWORD` (400) | Password under 8 chars at signup | Ask for a longer password |
| `EMAIL_EXISTS` (409) | Signup with an already-registered email | Offer login / password reset instead |
| `INVALID_CREDENTIALS` (401) | Wrong email/password at login | Standard "check credentials" reply; never confirm which half is wrong |
| `UNAUTHORIZED` (403) | Non-admin calling admin endpoints | Verify the account's admin flag before escalating |
| `PIZZA_NOT_FOUND` (404) | Admin edits a deleted pizza id | Refresh the admin list; the pizza was removed |

## Escalate to engineering only if

- the same account gets `INVALID_CREDENTIALS` with a *verified correct*
  password (possible hash drift — see user-registration dataFlow), or
- `UNAUTHORIZED` fires for a user whose admin flag is set (routeAuth
  regression on the admin endpoints).
