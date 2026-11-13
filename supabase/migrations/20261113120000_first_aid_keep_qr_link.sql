-- Keep the self-service link of a point so its current QR can be shown and printed again.
-- Until now only the SHA-256 of the token was stored, so the only way to see a QR was to create a new one —
-- which silently killed the posters already on the wall. The token is only ever read by the server
-- (service_role) for staff of that company; it is never part of the state sent to browsers.
alter table public.fa_locations add column if not exists public_token text
  check (public_token is null or public_token ~ '^[a-f0-9]{64}$');
