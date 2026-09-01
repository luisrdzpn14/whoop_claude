# Bug report — whoop-mcp-unofficial@0.6.5 on Windows

Environment: Windows 11 (10.0.22631), Node v24.15.0, npm 11.12.1, PowerShell 5.1,
installed via `npx -y whoop-mcp-unofficial@0.6.5`.

---

## 1. [Critical] `auth` opens a truncated URL on Windows → `unsupported_response_type`

**Impact:** the default `auth` flow is completely broken on Windows. Every user hits it.

`openBrowser()` in `src/cli/auth.ts` spawns the URL through `cmd.exe`:

```js
const command = process.platform === "win32" ? "cmd" : ...;
const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
spawn(command, args, { detached: true, stdio: "ignore" });
```

`cmd.exe` treats `&` as a command separator, and the URL is not escaped. The
authorization URL is truncated at the first `&`, so the browser only receives:

```
https://api.prod.whoop.com/oauth/oauth2/auth?client_id=<id>
```

Everything after it — `redirect_uri`, `response_type`, `scope`, `code_challenge`,
`code_challenge_method` — is dropped. WHOOP then redirects to the registered
callback with:

```
error=unsupported_response_type
error_description=The authorization server does not support obtaining a token using this method
error_hint=The request is missing the "response_type" parameter
```

**Reproduce:** run `whoop-mcp-server auth` on Windows with a valid config.

**Workaround:** `auth --no-open` and paste the URL manually.

**Suggested fix:** avoid `cmd` entirely. Either

```js
spawn("powershell", ["-NoProfile", "-Command", "Start-Process", url], ...)
```

or escape the URL for `cmd` (`^` before each `&`), or use `{ shell: false }` with
`rundll32 url.dll,FileProtocolHandler <url>`.

---

## 2. `whoop_daily_summary` fails with "Invalid time value" when `days` is omitted

**Reproduce:**

```
whoop-mcp-server call whoop_daily_summary --json '{}'
→ { "error": "Invalid time value" }
```

Passing it explicitly works:

```
whoop-mcp-server call whoop_daily_summary --json '{"days":14}'
→ full summary, correct output
```

**Cause:** `isoDaysAgo()` in `src/services/summary.ts` (~line 105):

```js
return new Date(Date.now() - days * 24 * HOUR_MS).toISOString();
```

With `days === undefined`, `days * 24 * HOUR_MS` is `NaN`, so `new Date(NaN)` is an
invalid date and `.toISOString()` throws `RangeError: Invalid time value`. The
`DailySummaryInputSchema` default does not appear to be applied on this path.

**Suggested fix:** apply the zod default before use, or guard:
`const days = input.days ?? DEFAULT_LOOKBACK_DAYS;`

The same pattern is worth checking in `whoop_weekly_summary` and the other
workflow tools that call `isoDaysAgo`.

---

## 3. `DEFAULT_SCOPES` omits `offline`, so no refresh token is ever issued

`src/constants.ts`:

```js
export const DEFAULT_SCOPES = [
  "read:recovery", "read:cycles", "read:workout",
  "read:sleep", "read:profile", "read:body_measurement"
];
```

WHOOP only returns a `refresh_token` when the `offline` scope is requested. After a
default `auth`, `doctor` reports:

```
✗  Refresh token    missing
```

and the access token expires in ~1h, forcing a full manual re-authorization.

**Workaround:** set `WHOOP_SCOPES` with `offline` appended before running `auth`.
This works and produces a refresh token.

**Suggested fix:** add `offline` to `DEFAULT_SCOPES`, or at minimum have `doctor`
say *why* the refresh token is missing and how to fix it — the current output
reports the symptom with no remedy.

---

## 4. Generated Claude MCP config uses bare `npx`, which fails on Windows

`setup --client claude` writes:

```json
{ "mcpServers": { "whoop": { "command": "npx", "args": ["-y", "whoop-mcp-unofficial"] } } }
```

On Windows, spawning `npx` without an extension typically fails; `npx.cmd` is
required. Suggest emitting `npx.cmd` on `win32`.

Separately, the snippet pins no version. Pinning (`whoop-mcp-unofficial@<version>`)
would be safer for a package that handles health data and OAuth secrets.

---

## 5. ~~Refresh request may need `scope=offline`~~ — NOT A BUG (verified)

Initially suspected because `refreshToken()` in `src/services/whoop-client.ts` omits
`scope=offline`, which WHOOP's docs include. **Verified against a live expiry and it
works correctly.** An access token that expired at 19:33 was automatically refreshed
on the next tool call; the new token was valid for a further 3 hours and the refresh
token was preserved. Leaving this here only to record that it was checked.

---

## Minor: `doctor` reports `secure_permissions: true` on Windows

`whoop_connection_status` returns `"permissions": "666"` alongside
`"secure_permissions": true`. The `0600` hardening is POSIX-only and does not apply
on Windows, where protection comes from NTFS ACLs instead. The current output
overstates the guarantee. Consider reporting "not applicable on Windows".
