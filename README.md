# MY-KHATA Final

Base: MY-KHATA-Integrated (IndexedDB outbox, per-user isolation, retry-safe sync) + PWA improvements.

## What changed vs Integrated
- Fix: `offlineAwareUpdateCustomer` used an undeclared `ownerId` (ReferenceError → every online edit was queued). Now declared.
- Fix: `processOutbox` no longer `clear()`s the whole transactions store when a local customer gets its real id; only this user's affected rows are rewritten (other accounts' cache is untouched).
- Logout: tries to sync first; if anything is still pending, logout is blocked (data is not lost). After a successful logout the current user's local cache/outbox/id-maps are deleted.
- PWA: `manifest.webmanifest` with maskable icon (`icons/`), categories, `?source=pwa`, iOS meta tags.
- Service worker `v5`: new version waits; an "update available" bar appears and the user taps to reload. Bump `CACHE_NAME` on every deploy.

## Deploy
1. Run `SUPABASE-MIGRATION.sql` in Supabase SQL Editor.
2. Verify RLS on `customers` and `transactions`: `user_id = auth.uid()` for SELECT/INSERT/UPDATE/DELETE, no permissive "allow all" policy.
3. Serve over HTTPS.

## Known limits
- IndexedDB data is not encrypted.
- No CSP header; Supabase JS is loaded from CDN without SRI (pin an exact version + add `integrity` before production).
