# Postcards backend deployment

Status: source prepared and handler tests pass; a project, secrets, schema, function and cron must be provisioned before sharing is enabled. `postcard-config.js` intentionally has an empty endpoint until verified.

## Provisioning

1. Select/create a Supabase project for this trip. Apply `schema.sql` through the SQL management tool. Do not grant `anon` or `authenticated` table or bucket access. Inspect advisors after applying.
2. Set Edge Function secrets securely (never in git or browser code):
   - `POSTCARD_CREATION_CODE`: a randomly generated participant code with at least 128 bits of entropy; distribute privately to participants.
   - `POSTCARD_CLEANUP_KEY`: a different random secret.
   - `POSTCARD_ORIGIN`: `https://tomershko.github.io` (or the exact development origin when testing).
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase's function runtime.
3. Deploy `functions/postcards/index.ts` as `postcards` with platform JWT verification disabled as in `config.toml`. The handler authenticates write/cleanup requests itself and checks random 256-bit capabilities for reads. There are no third-party dependencies.
4. Create Vault secrets `postcard_function_url` (the function URL plus `?action=cleanup`) and `postcard_cleanup_key` (same as the cleanup secret), then run `schedule-cleanup.sql` once. If reconfiguring, update the existing named job rather than adding duplicates. Confirm both cron execution and `net._http_response` success; a scheduled HTTP request alone does not prove successful cleanup.
5. Verify the live flow below. Only then set `window.POSTCARD_CONFIG.endpoint` to the public function endpoint and merge the frontend PR.

## Live verification gate

- Create a test JPEG postcard using the participant code. Verify `expires_at-created_at` is exactly 24 hours and public table/bucket reads are denied.
- Open its fragment link on another device. Check view/image responses have `Cache-Control: no-store` and the bucket has no public policies. Incorrect participant code returns 401.
- For the test row only, set `expires_at` into the past. Both view and image must immediately return 410 without waiting for cleanup.
- Trigger authenticated cleanup; verify both the storage object and row are removed. Test deletion and check cron results again after five minutes.
- In WhatsApp verify the generic envelope preview contains no personal photo/text. The capability is in the URL fragment (not sent in the page request). App preview behavior must be checked on actual WhatsApp.

## Behavior and limits

- Expiry is based on server creation time, not opening or sharing. No public or signed storage URL is returned; image reads are proxied through the expiry check.
- Cleanup uses the Storage API before deleting the row. Failed uploads retain a cleanup row; failed removals are retryable. Normal cleanup runs every five minutes, but outages can delay physical deletion. Expired content stays inaccessible independently.
- The static service worker only caches the main itinerary page, never postcards or API responses. Viewer content is in memory only, removed on expiry/page exit; no analytics run on the postcard page. Downloaded images/screenshots cannot be revoked.
- Uploads are JPEG, max 2 MiB, resized in the browser to 1600px (also strips original EXIF). The SQL reservation caps active rolling-day rows at 100; deletion can free quota. This is a small trusted-group service, not a public upload platform. Use a strong random participant code, not a short numeric PIN.
- Manual delete is available in the creation session; administrators can expire a row and let cleanup remove it later. No private keys or participant codes are stored in browser persistence.
- The WhatsApp response button opens the contact picker with text; it does not know the sender's phone number.

Run local handler tests with Node 22+:

```sh
node --test tests/postcards.test.mjs
```

These use mocked Supabase endpoints; they do not substitute for the live verification gate.
