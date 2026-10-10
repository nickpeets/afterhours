# Edge functions

Server code that runs as Supabase Edge Functions.  It lives under `tools/`
with the rest of the server-side record (the `DDL-*.sql` files) so it is
never part of what ships to a browser or into the iOS bundle.

**The repo is the record, not the deploy.**  Merging a change here deploys
nothing.  A function goes live only when its `index.ts` is deployed to the
`afterhours` project (Studio → Edge Functions → the function → Code → Deploy
updates, or `supabase functions deploy <name>`).  After a deploy, the Code
tab and the file here must be byte-identical — check, don't assume.

## daily-room

`daily-room/index.ts` creates or refreshes the show's Daily room and mints
the meeting token every video join uses.  Its header says who may have which
token and cites Daily's reference for every token property it sets.

- Commit `daily-room: the function as deployed` is the source exactly as it
  was running on 2026-10-10 (read from Studio; sha256 `edbb096c…6514`, 4735
  bytes), so every later change is a diff against what was live.
- **"Verify JWT with legacy secret" must stay OFF** for this function.  The
  project signs sessions with an ECC (P-256) key; that switch accepts only
  the legacy HS256 secret and would refuse every signed-in user.  The
  function checks the caller's session itself.
- It reads `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, which Studio
  lists as DEPRECATED (still provided).  When Supabase stops providing them
  the function answers 500 "supabase environment not configured" rather than
  minting anything — move it to the new keys before that day.

Tests (offline; fetch is replaced by a small world, nothing touches the
network):

    cd tools/functions/daily-room && deno test --allow-env index.test.ts

They prove what the function ASKS Daily for and whom it refuses.  They do
not prove what Daily does with a token — that is the live run's.
