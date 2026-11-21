# ESP32 Remote Control System V2

A cloud-connected ESP32 dashboard for remotely controlling three LEDs (red, green and blue), with device acknowledgements, reported output state, heartbeat monitoring and private login.

- **Live dashboard:** https://masoud-engineer.github.io/esp32-remote-control-v2/
- **Cloud API:** https://esp32-remote-control-v2-api.masoudsubi.workers.dev/
- **Device ID:** `esp32-v2`

This README is the operational reference for setup checks and troubleshooting.

## 1. System architecture

The system has four parts:

1. **ESP32 firmware** connects to Wi-Fi and EMQX using MQTT. It subscribes to LED commands and publishes state, acknowledgement, heartbeat and availability events.
2. **EMQX Serverless** is the MQTT broker. It carries commands to the ESP32 and forwards device events to the Cloudflare Worker using an authenticated webhook.
3. **Cloudflare Worker API** authenticates dashboard users, publishes commands through the EMQX HTTPS REST API, validates webhook events and serves device status.
4. **GitHub Pages dashboard** provides login, LED controls and telemetry. It polls the API every 2 seconds.

```text
Browser dashboard
   | HTTPS: login / status / command
   v
Cloudflare Worker API
   | HTTPS REST publish
   v
EMQX MQTT broker
   | MQTT command
   v
ESP32 device
   | MQTT: state / ack / heartbeat / availability
   v
EMQX webhook
   | HTTPS POST + X-Webhook-Secret
   v
Cloudflare Worker -> Durable Object state storage
   |
   v
Dashboard (status polling every 2 seconds)
```

The dashboard does not communicate directly with the ESP32. Remote operation depends on the internet, Cloudflare, EMQX and the device's Wi-Fi connection.

## 2. Important links

| Component | Link |
|---|---|
| Frontend repository | https://github.com/masoud-engineer/esp32-remote-control-v2 |
| Live dashboard | https://masoud-engineer.github.io/esp32-remote-control-v2/ |
| Backend repository (private) | https://github.com/masoud-engineer/esp32-remote-control-v2-backend |
| Cloudflare dashboard | https://dash.cloudflare.com/ |
| Worker health check | https://esp32-remote-control-v2-api.masoudsubi.workers.dev/api/health |
| EMQX dashboard | https://cloud.emqx.com/ |
| MQTT broker host | `g4ecb0fe.ala.eu-central-1.emqxsl.com` |

Backend source map:
- `src/index.js`: API routes, authentication, command publishing, webhook validation and online/offline logic.
- `src/device-state.js`: Durable Object state storage and login-attempt throttling.
- `wrangler.jsonc`: Worker name, Durable Object binding and non-secret defaults.
- `documentation/api-contract.md`: API routes, MQTT topics and payload formats.

## 3. Current operating values

| Item | Current value | Where controlled |
|---|---:|---|
| Device ID | `esp32-v2` | Firmware and Worker |
| Command topic | `devices/esp32-v2/command` | Firmware and Worker |
| Heartbeat interval | 15 seconds | ESP32 firmware |
| Offline/stale threshold | 35 seconds maximum | Cloudflare Worker |
| Firmware reconnect retry | 5 seconds | ESP32 firmware |
| Dashboard status polling | 2 seconds | Frontend `index.html` |
| Login session lifetime | 8 hours / 28,800 seconds by default | Worker |

**Important:** Offline timeout is controlled by the backend, not by an ESP32 firmware timeout variable. The ESP32 sends a heartbeat every 15 seconds. The Worker marks it offline when the last heartbeat is older than 35 seconds, or when an explicit offline availability event is received. Network delay can affect the exact observed transition. The Worker source caps the effective threshold at 35 seconds.

## 4. Configuration reference

### Cloudflare Worker variables

Cloudflare Dashboard → Workers & Pages → `esp32-remote-control-v2-api` → Settings → Variables and Secrets.

| Name | Purpose / expected setting |
|---|---|
| `ALLOWED_ORIGIN` | Exactly `https://masoud-engineer.github.io` (origin only; no repository path or trailing slash) |
| `EMQX_PUBLISH_URL` | `https://g4ecb0fe.ala.eu-central-1.emqxsl.com:8443/api/v5/publish` |
| `DEVICE_ID` | `esp32-v2` |
| `EMQX_COMMAND_TOPIC` | `devices/esp32-v2/command` |
| `SESSION_TTL_SECONDS` | `28800` |
| `HEARTBEAT_STALE_SECONDS` | Worker enforces a maximum effective threshold of 35 seconds |

### Cloudflare Worker secrets

Configure these as **secrets**, never commit their values to GitHub or put them in frontend JavaScript.

| Secret | Purpose |
|---|---|
| `ACCESS_CODE` | Private dashboard login code; minimum 12 characters |
| `SESSION_SECRET` | Signs and verifies dashboard sessions; minimum 32 characters |
| `WEBHOOK_SECRET` | Authenticates EMQX webhook requests; minimum 32 characters |
| `EMQX_APP_ID` | EMQX REST API application/key ID |
| `EMQX_APP_SECRET` | Matching EMQX REST API secret |

### Two different EMQX credential pairs

- `EMQX_APP_ID` + `EMQX_APP_SECRET`: used by the Cloudflare Worker for HTTPS REST publishing.
- MQTT username + password: used by the ESP32 firmware to connect to the broker.

They are not interchangeable. Never share the actual credential values in documentation, screenshots or chat.

### ESP32 firmware configuration

The firmware must match the broker host, MQTT TLS port, MQTT username/password, device ID and topic names above. It also needs the correct Wi-Fi credentials, Worker webhook URL and matching webhook secret if the firmware sends direct webhook events.

- Heartbeat interval: **15,000 ms**.
- Reconnect retry interval: **5,000 ms**.
- Do not add an offline timeout to the firmware; the Worker decides online/offline status.

**TLS security note:** Inspect the firmware before wider customer deployment. If it calls `WiFiClientSecure::setInsecure()`, the connection is encrypted but the ESP32 does not validate the server certificate. Use the appropriate CA certificate with `setCACert()` and test both broker and HTTPS connections before describing the firmware as certificate-validated.

## 5. API endpoints

Base URL: `https://esp32-remote-control-v2-api.masoudsubi.workers.dev`

| Method and path | Purpose | Authentication |
|---|---|---|
| `GET /api/health` | Checks configuration flags and Durable Object reachability | Public diagnostic |
| `POST /api/login` | Exchanges access code for a signed session | Access code in request body |
| `GET /api/status` | Returns device state, heartbeat, last command and acknowledgement | Bearer session |
| `GET /api/device` | Alias for device status | Bearer session |
| `POST /api/command` | Publishes a red/green/blue LED command | Bearer session |
| `POST /api/device/event` | Receives authenticated device events forwarded by EMQX | `X-Webhook-Secret` |

### Health-check procedure

Open:

https://esp32-remote-control-v2-api.masoudsubi.workers.dev/api/health

A correctly configured service should return `ok: true` and these `configured` flags should be true:

- `allowedOrigin`
- `emqxPublishUrl`
- `emqxCredentials`
- `accessCodeConfigured` and `accessCodeLengthValid`
- `sessionSecretConfigured` and `sessionSecretLengthValid`
- `webhookSecret`
- `deviceStateBinding` and `deviceStateReachable`

This endpoint checks configuration presence/format and Durable Object reachability. **It does not prove that the ESP32 is connected, EMQX accepts a publish, or a command reaches the hardware.** Verify those separately.

## 6. MQTT topics and event flow

| Direction | Topic | Meaning |
|---|---|---|
| Cloud → ESP32 | `devices/esp32-v2/command` | LED command |
| ESP32 → Cloud | `devices/esp32-v2/state` | Actual reported LED output states |
| ESP32 → Cloud | `devices/esp32-v2/ack` | Acknowledgement for a command ID |
| ESP32 → Cloud | `devices/esp32-v2/heartbeat` | Periodic heartbeat |
| ESP32 → Cloud | `devices/esp32-v2/availability` | Explicit online/offline status |

EMQX forwards the four device event topics (state, ack, heartbeat and availability) to:

`POST https://esp32-remote-control-v2-api.masoudsubi.workers.dev/api/device/event`

The webhook request must include the header `X-Webhook-Secret` with the same secret stored in Cloudflare as `WEBHOOK_SECRET`. Do not forward the command topic to this webhook.

## 7. Startup and normal verification

1. Open Arduino IDE Serial Monitor at **115200 baud**.
2. Restart the ESP32. Confirm Wi-Fi connects.
3. Confirm MQTT connects successfully.
4. Open the Worker health-check URL and review all configuration flags.
5. Open the dashboard and sign in.
6. Confirm the device changes to **Online** and heartbeat age updates.
7. Toggle each LED. Confirm the physical output changes.
8. Confirm the dashboard receives the acknowledgement and updated state.
9. Disconnect the ESP32 from Wi-Fi to test offline detection; expect it to become offline after the last accepted heartbeat ages beyond the 35-second threshold (allow for network/polling delay).
10. Reconnect Wi-Fi and confirm MQTT reconnects and the dashboard returns to Online.

A command accepted by the broker is not the same as a command executed by the ESP32. Look for the ESP32 acknowledgement and reported state.

## 8. Troubleshooting guide

Use the first layer that fails. Avoid changing several settings at once.

| Symptom | Where to check first | What to verify |
|---|---|---|
| Dashboard does not load | GitHub Pages / browser | Pages deployment succeeded; correct dashboard URL; browser internet connection |
| Login fails immediately | Browser + Worker health + Worker logs | API URL; `ACCESS_CODE`; minimum secret lengths; `ALLOWED_ORIGIN`; inspect Worker error |
| Login works but refresh returns to login | Browser session + Worker | Session token is tab-scoped in `sessionStorage`; check expiry (8 hours by default), browser privacy settings and API 401 responses |
| Dashboard says API unavailable | Browser developer console + Worker logs | Worker URL reachable; internet; Worker deployment and runtime errors |
| Health check has a false flag | Cloudflare Worker settings | Compare the false flag with the variables/secrets table above; check Durable Object binding/reachability |
| Device stays Offline | ESP32 Serial Monitor → EMQX → Worker | Wi-Fi connected; MQTT connected; heartbeat published to correct topic; EMQX forwards heartbeat webhook; webhook secret matches; device ID matches |
| Device is Online but LED buttons do not reflect state | EMQX + Worker logs | ESP32 state event published; correct state topic; webhook forwarding and payload; Worker status response |
| Button command fails / internal server error | Worker logs first, then EMQX | REST publish URL; REST API key pair; broker response/status; command topic; Worker configuration |
| Broker accepts command but hardware does not change | EMQX + ESP32 Serial Monitor | ESP32 subscribed to exact command topic; MQTT connection alive; JSON/device ID/LED/state validation; GPIO wiring and output logic |
| Hardware changes but dashboard does not update | ESP32 → EMQX webhook → Worker | ESP32 publishes ack and state; EMQX forwards both; webhook secret and event payload are correct |
| Device takes too long to show Offline | Worker source and heartbeat | Heartbeat is 15 seconds; effective Worker stale threshold is 35 seconds; inspect heartbeat age in status response. Dashboard refresh is 2 seconds |
| Device reconnects to Wi-Fi but stays Offline | ESP32 Serial Monitor + EMQX | MQTT has reconnected and a new heartbeat is actually being published and forwarded |

### Recommended diagnostic order

1. **ESP32 Serial Monitor (115200):** Is Wi-Fi connected? Is MQTT connected? Are reconnects or publish errors printed?
2. **Worker health check:** Are configuration flags true? Remember this is not a live broker/device test.
3. **Cloudflare Worker logs:** Look for login errors, missing configuration, EMQX publish rejection/network errors and webhook failures.
4. **EMQX dashboard:** Check client connection, subscriptions, incoming/outgoing topic traffic, webhook/rule delivery and REST API credentials.
5. **Browser developer tools:** Check Console and Network requests for failed `/api/login`, `/api/status` or `/api/command` requests and HTTP status codes.

Useful HTTP status clues:
- `401`: invalid/expired session or invalid webhook secret, depending on endpoint.
- `403`: origin, topic or device ID rejected.
- `429`: login attempt rate limit; wait for the temporary block to expire.
- `502`: Worker could not reach EMQX or broker rejected the publish.
- `503`: required Worker configuration is missing or invalid.

## 9. How command confirmation works

1. Dashboard sends a command to `POST /api/command`.
2. Worker authenticates the session and sends the command to EMQX using HTTPS REST API.
3. HTTP **202 Accepted** means EMQX accepted the publish request; it does **not** prove the ESP32 executed it.
4. ESP32 receives and validates the MQTT command, then publishes an acknowledgement containing the matching `commandId`.
5. ESP32 publishes its actual LED state. The Worker stores the latest reported state and the dashboard displays it.

An LED value of `null` means the state is not yet known/reported. It does not mean OFF.

## 10. Security and maintenance

- Never commit access codes, session secrets, webhook secrets, MQTT passwords or EMQX REST API secrets.
- If a secret is exposed, rotate it in the relevant service and update the dependent device/service configuration.
- CORS restricts browser origins but is not authentication; protected API routes also require a signed bearer session.
- The Worker applies login-attempt throttling through the Durable Object.
- Keep HTTPS and MQTT TLS enabled. Certificate validation must also be enabled in firmware for strong server identity verification.
- The Durable Object stores the latest device snapshot and latest command/acknowledgement, not an unlimited event history.
- Keep the device ID and topic names consistent across firmware, EMQX and Worker.
- After changing firmware or Worker configuration, repeat the verification procedure above.

## 11. Scope and limitations

This version controls three LED outputs and provides cloud status/telemetry. It is not a general-purpose industrial controller, safety-rated system or guarantee of real-time operation. Internet availability, broker connectivity and device processing introduce latency. Do not use it as the sole control path for safety-critical equipment.

The dashboard's map and weather panel are informational location/weather widgets; they are not GPS tracking or readings from sensors on the ESP32.

---

For detailed request/response payloads and the exact MQTT event contract, see the backend repository's [API and MQTT contract](https://github.com/masoud-engineer/esp32-remote-control-v2-backend/blob/main/documentation/api-contract.md).
