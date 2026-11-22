import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, PLATFORM_API_URL } from "./config.js";

// The publishable key is designed for browser use. RLS and the Worker enforce access.
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const $ = (id) => document.getElementById(id);
const panels = ["auth-panel", "reset-panel", "recovery-panel", "workspace-panel"];
let authMode = "login";
let currentSession = null;

function showPanel(name) {
  for (const id of panels) $(id).classList.toggle("hidden", id !== name);
}
function notice(message, kind = "") {
  const box = $("notice");
  box.textContent = message;
  box.className = "notice" + (kind ? " " + kind : "");
  box.classList.remove("hidden");
}
function clearNotice() {
  $("notice").classList.add("hidden");
  $("notice").textContent = "";
}
function setBusy(button, busy, label) {
  button.disabled = busy;
  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = label || "Please wait…";
  } else if (button.dataset.originalLabel) {
    button.textContent = button.dataset.originalLabel;
  }
}
function safeSlug(value) {
  return value.toLowerCase().trim().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function apiReady() {
  return /^https:\/\/(?:[a-z0-9-]+\.)+workers\.dev$/i.test(PLATFORM_API_URL);
}
async function apiRequest(path, options = {}) {
  if (!apiReady()) throw new Error("The development API has not been connected yet. Sign-in is available; workspace creation will be enabled after the separate development Worker is deployed.");
  if (!currentSession?.access_token) throw new Error("Please sign in again.");
  const response = await fetch(PLATFORM_API_URL + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + currentSession.access_token,
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || body.message || "The server could not complete the request.");
  return body;
}
function setAuthMode(mode) {
  authMode = mode;
  $("login-tab").classList.toggle("active", mode === "login");
  $("signup-tab").classList.toggle("active", mode === "signup");
  $("panel-title").textContent = mode === "login" ? "Welcome back" : "Create your account";
  $("auth-submit").textContent = mode === "login" ? "Sign in securely" : "Create account";
  $("password").autocomplete = mode === "login" ? "current-password" : "new-password";
  clearNotice();
}
async function loadOrganizations() {
  const list = $("org-list");
  list.innerHTML = '<p class="muted small">Loading your workspaces…</p>';
  try {
    const result = await apiRequest("/api/organizations");
    const orgs = Array.isArray(result.organizations) ? result.organizations : [];
    if (!orgs.length) {
      list.innerHTML = '<p class="muted small">No business workspace yet. Create your first one below.</p>';
      return;
    }
    list.replaceChildren();
    for (const item of orgs) {
      const org = item.organization || item;
      const card = document.createElement("div");
      card.className = "org-item";
      const title = document.createElement("strong");
      title.textContent = org.name || "Business workspace";
      const meta = document.createElement("span");
      meta.textContent = (org.slug || "no-id") + " · " + (item.role || "member");
      card.append(title, meta);
      if (["owner", "admin"].includes(item.role)) {
        const inviteForm = document.createElement("form");
        inviteForm.className = "inline-form";
        const inviteTitle = document.createElement("strong");
        inviteTitle.textContent = "Invite a team member";
        const email = document.createElement("input");
        email.type = "email"; email.required = true; email.maxLength = 254;
        email.placeholder = "colleague@example.com"; email.setAttribute("aria-label", "Invitee email");
        const role = document.createElement("select");
        role.setAttribute("aria-label", "Invitation role");
        for (const value of (item.role === "owner" ? ["admin", "operator", "viewer"] : ["operator", "viewer"])) {
          const option = document.createElement("option");
          option.value = value; option.textContent = value[0].toUpperCase() + value.slice(1);
          role.append(option);
        }
        const submit = document.createElement("button");
        submit.className = "secondary"; submit.type = "submit"; submit.textContent = "Create invitation";
        const result = document.createElement("div");
        result.className = "token-result hidden";
        inviteForm.append(inviteTitle, email, role, submit, result);
        inviteForm.addEventListener("submit", async (event) => {
          event.preventDefault(); submit.disabled = true; submit.textContent = "Creating…";
          result.classList.add("hidden"); result.replaceChildren();
          try {
            const invitation = await apiRequest("/api/organizations/" + encodeURIComponent(org.id) + "/invitations", {
              method: "POST", body: JSON.stringify({ email: email.value.trim(), role: role.value })
            });
            const label = document.createElement("span");
            label.textContent = "One-time invitation token (expires " + new Date(invitation.expiresAt).toLocaleString() + "). Deliver it privately; it will not be shown again.";
            const token = document.createElement("code"); token.textContent = invitation.invitationToken;
            const copy = document.createElement("button"); copy.type = "button"; copy.className = "secondary"; copy.textContent = "Copy token";
            copy.addEventListener("click", async () => {
              try { await navigator.clipboard.writeText(invitation.invitationToken); copy.textContent = "Copied"; }
              catch { copy.textContent = "Copy unavailable"; }
            });
            result.append(label, token, copy); result.classList.remove("hidden");
            email.value = "";
          } catch (error) { notice(error.message || "Invitation could not be created.", "error"); }
          finally { submit.disabled = false; submit.textContent = "Create invitation"; }
        });
        card.append(inviteForm);

        const deviceForm = document.createElement("form");
        deviceForm.className = "inline-form";
        const deviceTitle = document.createElement("strong");
        deviceTitle.textContent = "Register a device";
        const deviceUid = document.createElement("input");
        deviceUid.required = true; deviceUid.minLength = 3; deviceUid.maxLength = 96;
        deviceUid.pattern = "[A-Za-z0-9][A-Za-z0-9._:-]{2,95}";
        deviceUid.placeholder = "Unique device UID"; deviceUid.setAttribute("aria-label", "Device UID");
        const deviceName = document.createElement("input");
        deviceName.required = true; deviceName.maxLength = 120;
        deviceName.placeholder = "Device name"; deviceName.setAttribute("aria-label", "Device name");
        const deviceType = document.createElement("input");
        deviceType.required = true; deviceType.minLength = 2; deviceType.maxLength = 80;
        deviceType.placeholder = "Device type (e.g. pump-controller)";
        deviceType.setAttribute("aria-label", "Device type");
        const deviceModel = document.createElement("input");
        deviceModel.maxLength = 120; deviceModel.placeholder = "Model (optional)";
        deviceModel.setAttribute("aria-label", "Device model");
        const deviceLocation = document.createElement("input");
        deviceLocation.maxLength = 160; deviceLocation.placeholder = "Installation location (optional)";
        deviceLocation.setAttribute("aria-label", "Installation location");
        const register = document.createElement("button");
        register.className = "secondary"; register.type = "submit"; register.textContent = "Register pending device";
        const deviceResult = document.createElement("div");
        deviceResult.className = "token-result hidden";
        deviceForm.append(deviceTitle, deviceUid, deviceName, deviceType, deviceModel, deviceLocation, register, deviceResult);
        deviceForm.addEventListener("submit", async (event) => {
          event.preventDefault(); register.disabled = true; register.textContent = "Registering…";
          deviceResult.classList.add("hidden"); deviceResult.replaceChildren();
          try {
            const created = await apiRequest("/api/organizations/" + encodeURIComponent(org.id) + "/devices", {
              method: "POST",
              body: JSON.stringify({
                deviceUid: deviceUid.value.trim(),
                name: deviceName.value.trim(),
                deviceType: deviceType.value.trim(),
                model: deviceModel.value.trim(),
                installationLocation: deviceLocation.value.trim()
              })
            });
            const device = created.device;
            const summary = document.createElement("span");
            summary.textContent = device.name + " registered as pending. Device ID: " + device.id;
            deviceResult.append(summary);
            const issue = document.createElement("button");
            issue.type = "button"; issue.className = "secondary"; issue.textContent = "Create 30-minute enrollment code";
            issue.addEventListener("click", async () => {
              issue.disabled = true; issue.textContent = "Creating code…";
              try {
                const claim = await apiRequest("/api/devices/" + encodeURIComponent(device.id) + "/claims", { method: "POST" });
                const label = document.createElement("span");
                label.textContent = "One-time code (expires " + new Date(claim.expiresAt).toLocaleString() + "). Share privately with the authorized operator.";
                const code = document.createElement("code"); code.textContent = claim.claimToken;
                const copy = document.createElement("button"); copy.type = "button"; copy.className = "secondary"; copy.textContent = "Copy code";
                copy.addEventListener("click", async () => {
                  try { await navigator.clipboard.writeText(claim.claimToken); copy.textContent = "Copied"; }
                  catch { copy.textContent = "Copy unavailable"; }
                });
                deviceResult.append(label, code, copy);
                issue.remove();
              } catch (error) { notice(error.message || "Could not create an enrollment code.", "error"); issue.disabled = false; issue.textContent = "Retry enrollment code"; }
            });
            deviceResult.append(issue);
            deviceResult.classList.remove("hidden");
            deviceUid.value = ""; deviceName.value = ""; deviceType.value = "";
            deviceModel.value = ""; deviceLocation.value = "";
          } catch (error) { notice(error.message || "Device registration failed.", "error"); }
          finally { register.disabled = false; register.textContent = "Register pending device"; }
        });
        card.append(deviceForm);
      }
      list.append(card);
    }
  } catch (error) {
    list.replaceChildren();
    const p = document.createElement("p");
    p.className = "muted small";
    p.textContent = error.message;
    list.append(p);
  }
}
async function enterWorkspace(session) {
  currentSession = session;
  $("signed-in-email").textContent = session.user?.email || "Signed-in account";
  $("panel-title").textContent = "Your workspace";
  showPanel("workspace-panel");
  clearNotice();
  await loadOrganizations();
}

function setupEnrollmentForms() {
  $("accept-invitation-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("accept-invitation-button");
    setBusy(button, true, "Accepting…");
    try {
      await apiRequest("/api/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ invitationToken: $("invitation-token").value.trim() })
      });
      $("invitation-token").value = "";
      notice("Invitation accepted. Your workspace membership is active.", "success");
      await loadOrganizations();
    } catch (error) { notice(error.message || "Invitation could not be accepted.", "error"); }
    finally { setBusy(button, false); }
  });

  $("redeem-device-claim-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("redeem-device-claim-button");
    setBusy(button, true, "Claiming…");
    try {
      const result = await apiRequest("/api/device-claims/redeem", {
        method: "POST",
        body: JSON.stringify({ claimToken: $("redeem-claim-token").value.trim() })
      });
      $("redeem-claim-token").value = "";
      notice("Device enrollment accepted for device " + result.deviceId + ".", "success");
    } catch (error) { notice(error.message || "Device enrollment could not be completed.", "error"); }
    finally { setBusy(button, false); }
  });
}

$("login-tab").addEventListener("click", () => setAuthMode("login"));
$("signup-tab").addEventListener("click", () => setAuthMode("signup"));
$("forgot-button").addEventListener("click", () => { clearNotice(); showPanel("reset-panel"); });
$("back-to-auth").addEventListener("click", () => { showPanel("auth-panel"); setAuthMode("login"); });

$("auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearNotice();
  const button = $("auth-submit");
  const email = $("email").value.trim();
  const password = $("password").value;
  setBusy(button, true, authMode === "login" ? "Signing in…" : "Creating account…");
  try {
    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin + "/esp32-remote-control-v2/platform/" }
      });
      if (error) throw error;
      if (!data.session) {
        notice("Account request received. Check your email and confirm your address, then return here to sign in.", "success");
      } else {
        await enterWorkspace(data.session);
        notice("Your account is ready. Create your business workspace to continue.", "success");
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await enterWorkspace(data.session);
      notice("You are signed in.", "success");
    }
  } catch (error) {
    notice(error.message || "Authentication failed. Please try again.", "error");
  } finally {
    setBusy(button, false);
  }
});
$("reset-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  setBusy(button, true, "Sending…");
  try {
    const { error } = await supabase.auth.resetPasswordForEmail($("reset-email").value.trim(), {
      redirectTo: window.location.origin + "/esp32-remote-control-v2/platform/"
    });
    if (error) throw error;
    notice("If an account exists for that address, a password-reset email will be sent.", "success");
  } catch (error) {
    notice(error.message || "Could not request a password reset.", "error");
  } finally {
    setBusy(button, false);
  }
});
$("recovery-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = $("new-password").value;
  if (password !== $("confirm-password").value) {
    notice("The two passwords do not match.", "error");
    return;
  }
  const button = event.submitter;
  setBusy(button, true, "Updating…");
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    await supabase.auth.signOut();
    currentSession = null;
    showPanel("auth-panel");
    setAuthMode("login");
    notice("Password updated. Sign in with your new password.", "success");
  } catch (error) {
    notice(error.message || "Could not update the password.", "error");
  } finally {
    setBusy(button, false);
  }
});
$("org-name").addEventListener("input", () => {
  if (!$("org-slug").dataset.edited) $("org-slug").value = safeSlug($("org-name").value);
});
$("org-slug").addEventListener("input", () => { $("org-slug").dataset.edited = "true"; });
$("org-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("create-org-button");
  const name = $("org-name").value.trim();
  const slug = $("org-slug").value.trim();
  setBusy(button, true, "Creating…");
  try {
    await apiRequest("/api/organizations", {
      method: "POST",
      body: JSON.stringify({ name, slug })
    });
    $("org-form").reset();
    delete $("org-slug").dataset.edited;
    notice("Business workspace created successfully.", "success");
    await loadOrganizations();
  } catch (error) {
    notice(error.message || "Could not create the workspace.", "error");
  } finally {
    setBusy(button, false);
  }
});
$("signout-button").addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();
  currentSession = null;
  if (error) notice(error.message, "error");
  $("panel-title").textContent = "Welcome back";
  showPanel("auth-panel");
  setAuthMode("login");
});
supabase.auth.onAuthStateChange((event, session) => {
  currentSession = session;
  if (event === "PASSWORD_RECOVERY") {
    showPanel("recovery-panel");
    $("panel-title").textContent = "Reset your password";
  } else if (session) {
    // Defer Supabase calls outside the auth callback to avoid blocking its internal lock.
    Promise.resolve().then(() => enterWorkspace(session));
  } else if (event === "SIGNED_OUT") {
    showPanel("auth-panel");
    $("panel-title").textContent = "Welcome back";
  }
});
setupEnrollmentForms();
$("year").textContent = new Date().getFullYear();
const { data: { session } } = await supabase.auth.getSession();
if (window.location.hash.includes("type=recovery")) {
  showPanel("recovery-panel");
  $("panel-title").textContent = "Reset your password";
} else if (session) {
  await enterWorkspace(session);
} else {
  showPanel("auth-panel");
}
if (!apiReady()) console.info("Platform API URL has not yet been configured.");
