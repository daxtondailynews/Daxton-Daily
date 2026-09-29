# Edition keys

The morning routine locks each edition before pushing it to `content/.pending/`:

- `edition-DATE.json.enc` is the edition, AES-256 encrypted with a random one-time key.
- `edition-DATE.json.key` is that one-time key, encrypted with `edition-public.pem`.

Only the **Publish pending editions** workflow can unlock them, using the
`DAXTON_EDITION_PRIVATE_KEY` repo secret. The routine needs no secret at all.

`keycheck.json.enc` / `keycheck.json.key` are a test file the workflow unlocks on
every run to prove the secret is set correctly ("Edition key OK" in the log).

Never commit `edition-private.pem`.
