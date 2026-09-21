# Postcards backend deployment

Status: Supabase project, private bucket, database schema, Edge Function and five-minute cleanup cron are provisioned. The frontend endpoint points at the live Edge Function.

## Security model

- The browser never receives a Supabase service-role key.
- Postcard photos are stored in a private bucket and are only served through the Edge Function after the 24-hour expiry check.
- Creation and cleanup credentials are generated outside the repository. Only SHA-256 hashes are stored in `public.postcard_secrets`; the cleanup credential itself is held in Supabase Vault for the cron job.
- `public.postcards` and `public.postcard_secrets` have RLS enabled and no client policies. `anon` and `authenticated` have no table access.
- Recipient links use a random 256-bit capability in the URL fragment. Personal photo/text is not placed in page metadata or analytics.

## Live verification gate

Before merging to production, verify from the real postcard UI:

- Create a JPEG postcard using the participant creation code. Confirm `expires_at-created_at` is exactly 24 hours.
- Open its fragment link on another device and confirm view/image responses are `Cache-Control: no-store`.
- Confirm a wrong creation code gets 401.
- Expire a test row manually and confirm view/image return 410 immediately, without waiting for cleanup.
- Confirm the scheduled cleanup removes the object and row after expiry.
- In WhatsApp, confirm the preview stays generic and contains no personal photo/text.

## Behavior and limits

- Expiry is based on server creation time, not opening or sharing.
- Cleanup runs every five minutes, but expired content becomes inaccessible immediately even if physical deletion is delayed.
- Uploads are JPEG, max 2 MiB, resized in the browser to 1600px; the resize also strips original EXIF metadata.
- The service caps reservations to 100 postcards in a rolling 24-hour window.
- Manual delete revokes access first, then removes the storage object and database row.
- Previously downloaded images/screenshots cannot be revoked.

Run local handler tests with Node 22+:

```sh
node --test tests/postcards.test.mjs
```
