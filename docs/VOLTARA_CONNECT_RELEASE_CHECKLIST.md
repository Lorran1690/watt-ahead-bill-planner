# Voltara Connect — candidate release (NOT published)

## Threat model
The server receives encrypted message payloads and media, with routing metadata (household, sender, recipient, date, size, receipt, typing signal). AES-256-GCM uses a random 96-bit nonce and AAD for each envelope and attachment; HKDF derives a pair-specific key from a randomly generated 256-bit secret. Pairing requires a trusted out-of-band exchange and comparing the fingerprint on both devices. No keys stored in Supabase or localStorage. The device holds the key while the conversation is unlocked. No forward secrecy, ratchet, automatic recovery, audited protocol or independent security review. The trusted web origin can deliver new code; compromised devices, browser extensions, or deployment compromise are outside the protection boundary. Other financial data remains under the existing Voltara security model. Favorites/pins persist message IDs locally. An expelled member cannot retrieve new data, but previously downloaded/decrypted copies cannot be revoked.

## Before publication
1. Run quality build/tests and isolated PostgreSQL permission tests. The fixture reproduces the authorization policies; it is not an actual Supabase Auth, Realtime, or Storage service.
2. Apply the chat SQL ONLY to a separate test Supabase project. Verify real Auth JWT, Data API grants, private bucket download/upload, Realtime subscriptions, revocation, concurrent sends, pagination, and quota behavior with two test users and an outsider. Review security advisors.
3. Verify pairing and audio formats with Android, iOS and Windows; wrong-key behavior; cancel microphone and lock; IndexedDB offline retry after interruption. Test network interruption and sign-out on a shared device. Offline queue works with chat already open; app shell does not currently start offline.
4. Independently review crypto, key exchange, device trust, key recovery/rotation and threat model. Do not claim Signal-equivalent protection. Never paste the secret into GitHub, this chat or Supabase.
5. For optional Web Push: apply push SQL in staging, deploy Edge Function with verified JWT, configure secret environment variables VOLTARA_VAPID_PRIVATE_KEY, VOLTARA_VAPID_PUBLIC_KEY, VOLTARA_VAPID_SUBJECT (a real contact), and configure ONLY the matching public key VITE_VOLTARA_VAPID_PUBLIC_KEY in the web build. Test allowlisted endpoints, origin, unauthorized requests, duplicate dispatch, account changes, expired endpoints, opt-out and closed app. Push contains only a generic notification, never content. If push isn't configured, the UI only offers local notifications while chat is open.
6. Establish private-bucket media quota and orphan retention/cleanup (uploads interrupted before message creation) using authorized Storage API; never delete storage metadata directly. Add retention policy for receipts and push metadata. Keep existing financial data untouched.
7. Verify production deploy only after these checks pass. Until then keep PR as draft and production schema unchanged.

## Implemented scope
- Text, photos with compression and metadata stripping, voice messages with user-initiated recording and preview.
- Pair-bound, ciphertext-only storage and encrypted outbox (up to 50 queued messages).
- Real-time subscriptions with polling fallback while unlocked, read receipts for visible decrypted messages, consented presence/digitation.
- Search and media gallery for loaded messages; load older messages manually. Pins and favorites are device-local.
- Add a message to shopping list with confirmation of name and price; send a selected expense summary; open decrypted photo in local OCR with explicit confirmation to save.
- Push client/server code and worker are staged; delivery not verified or active.
- No migrations have been applied to the live Voltara database by this PR.
