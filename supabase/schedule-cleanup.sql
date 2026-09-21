-- First provision two Vault secrets through a secure admin channel (never commit values):
-- postcard_function_url = https://<project>.supabase.co/functions/v1/postcards?action=cleanup
-- postcard_cleanup_key = the same random secret as the POSTCARD_CLEANUP_KEY function secret.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('postcards-cleanup', '*/5 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'postcard_function_url'),
    headers := jsonb_build_object('Content-Type','application/json','x-cleanup-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'postcard_cleanup_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$$);
