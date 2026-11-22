# IoT Platform Account Portal (Development)

This is a separate development portal. It does not replace or modify the existing ESP32 V2 dashboard.

## Expected URL

https://masoud-engineer.github.io/esp32-remote-control-v2/platform/

## Current capabilities

- Supabase email/password signup and login
- Email confirmation redirect
- Password reset and password recovery
- Persistent Supabase browser session with token refresh
- List business workspaces through the isolated Cloudflare development Worker
- Create a business workspace through the authenticated Worker endpoint

Device control is deliberately not included or enabled.

## Configuration

config.js contains the Supabase project URL, the browser-safe publishable key, and the isolated development Worker URL. The development Worker URL is now configured.

Never place a Supabase service-role/secret key, Cloudflare API token, EMQX secret, or other server credential in this folder.

## Authentication and authorization boundaries

- Supabase Auth handles passwords and browser sessions.
- The browser sends the current access token to the Cloudflare Worker.
- The Worker verifies the token and uses the user's JWT for RLS-protected organization lookups and creation.
- Organization IDs and roles are not trusted merely because they came from browser input.
- The Supabase publishable key is not an authorization credential; RLS and Worker checks remain essential.

## Before testing

1. The isolated development Worker has been deployed. Its public health endpoint could not yet be independently verified from this environment.
2. Add this exact portal URL to Supabase Auth redirect URLs:
   https://masoud-engineer.github.io/esp32-remote-control-v2/platform/
3. Confirm email confirmation settings and email delivery.
4. Publish the platform/ folder from the frontend repository only after reviewing the branch diff. Keep the production V2 dashboard unchanged.

This is a development foundation, not a production-ready customer portal.
