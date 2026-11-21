# ESP32 Remote Control System V2 — Architecture

## Purpose
A three-LED ESP32 system with cloud control, local-network control, device-reported feedback, and a web dashboard.

## System components
1. **Dashboard (GitHub Pages):** user interface for signing in, issuing LED commands, and viewing confirmed device state.
2. **Cloudflare Worker:** authenticates dashboard requests, publishes commands to EMQX, receives device event webhooks, and serves the latest device status.
3. **Cloudflare Durable Object:** stores the latest reported state, acknowledgements, availability, and last-seen time.
4. **EMQX Serverless:** MQTT broker connecting the cloud service and ESP32.
5. **ESP32:** controls the red, green, and blue LEDs; publishes state, acknowledgements, heartbeat, and availability.
6. **Open-Meteo:** provides public weather information for the fixed Dar es Salaam map location.
7. **Google Maps JavaScript API:** displays a fixed illustrative Dar es Salaam location; it does not represent GPS tracking.

## Data flow

### Cloud command
Dashboard → HTTPS → Cloudflare Worker → EMQX REST publish API → MQTT/TLS → ESP32.

### Device feedback
ESP32 → MQTT/TLS → EMQX → webhook → Cloudflare Worker → Durable Object → dashboard status request.

### Local control
A phone or computer on the same Wi-Fi network opens the ESP32-hosted local dashboard and sends commands directly to the ESP32. Local access depends on the Wi-Fi network being available.

## MQTT topics
- `devices/esp32-v2/command`: cloud-to-device commands.
- `devices/esp32-v2/state`: actual LED state reported by the ESP32.
- `devices/esp32-v2/ack`: command execution acknowledgements.
- `devices/esp32-v2/heartbeat`: periodic device heartbeat.
- `devices/esp32-v2/availability`: online/offline status, including the MQTT Last Will.

## Important status distinction
A command being accepted by the API or broker does not prove that the ESP32 executed it. The dashboard must show the device-reported state and acknowledgement as confirmation.

## Fixed map and weather
The map location is Dar es Salaam (approximately -6.7924, 39.2083). This is an illustrative fixed location, not the physical location of the ESP32. Weather information is fetched for that location from Open-Meteo and is not measured by an onboard sensor.

## Security notes
- Keep broker credentials, session-signing secrets, and webhook secrets in Cloudflare Worker secrets, never in browser JavaScript or the public repository.
- Restrict the Google Maps browser key by website referrer and API.
- Use HTTPS for cloud communication and MQTT over TLS for the ESP32 connection.
- Use a short-lived authenticated dashboard session for protected commands.
