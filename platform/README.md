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

config.js contains the Supabase project URL, the browser-safe publishable key, and PLATFORM_API_URL. The API URL must be set to the confirmed development Worker URL after deployment.

Never place a Supabase service-role/secret key, Cloudflare API token, EMQX secret, or other server credential in this folder.

## Authentication and authorization boundaries

- Supabase Auth handles passwords and browser sessions.
- The browser sends the current access token to the Cloudflare Worker.
- The Worker verifies the token and uses the user's JWT for RLS-protected organization lookups and creation.
- Organization IDs and roles are not trusted merely because they came from browser input.
- The Supabase publishable key is not an authorization credential; RLS and Worker checks remain essential.

## Before testing

1. Deploy only .github/workflows/platform-dev-deploy.yml from the backend repository's platform-foundation branch.
2. Confirm the Worker URL and /api/health response.
3. Add this exact portal URL to Supabase Auth redirect URLs:
   https://masoud-engineer.github.io/esp32-remote-control-v2/platform/
4. Confirm email confirmation settings and email delivery.
5. Set PLATFORM_API_URL in config.js to the confirmed development Worker URL.
6. Publish the platform/ folder from the frontend repository after reviewing the branch diff.

This is a development foundation, not a production-ready customer portal.
