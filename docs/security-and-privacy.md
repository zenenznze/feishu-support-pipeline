# Security and privacy notes

Never commit:

- Feishu/Lark app secrets, user access tokens, cookies, or exported browser storage.
- Real tenant domains if they should not be public.
- Wiki tokens, synced docs, raw chat transcripts, screenshots, or customer identifiers.
- Generated reports that contain private content.

Use `local-data/` for all real outputs. It is ignored by git.
