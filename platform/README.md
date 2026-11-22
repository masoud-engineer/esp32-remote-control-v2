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
- Create team invitations from an owner/admin workspace card, with role restrictions enforced by the database
- Accept an invitation using a one-time token and a verified email address that matches the invitation
- Register pending devices inside an owner/admin workspace, then issue short-lived enrollment codes and let same-business operators redeem them

Device control is deliberately not included or enabled. Device registration creates a pending database record; enrollment codes authorize tenant assignment only and do not attest physical hardware or provision MQTT credentials. Invitation delivery is manual; the portal displays the one-time token once for private sharing.

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
4. Run the platform portal CI checks on the development branch.
5. Review and test the invitation and device enrollment flows with dedicated test accounts and test device records.
6. Publish the platform/ folder only after reviewing the branch diff and completing the separate release checklist. Keep the production V2 dashboard unchanged.

This is a development foundation, not a production-ready customer portal.
