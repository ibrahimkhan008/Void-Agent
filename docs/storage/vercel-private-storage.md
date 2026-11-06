# Private Vercel Blob storage

Void-Agent can use a private Vercel Blob store for authenticated user uploads.

1. Create or select a **Private** Blob store in Vercel Storage and connect its read-write token to the application environment.
2. Set `FILE_STORAGE_TYPE=vercel-blob` and `VERCEL_BLOB_ACCESS=private` in the same environment.
3. Redeploy/restart the app after setting both values. The store access mode and this setting must match; the SDK rejects mismatched operations.
4. Keep the existing authenticated `/api/storage/download`, `/api/storage/sheet`, and owner-scoped `/api/files/...` paths for browser reads. Void-Agent fetches private Blob bytes server-side and does not redirect the browser to the Blob origin.

`VERCEL_BLOB_ACCESS` defaults to `public` for compatibility with existing public Blob stores. This setting is not a migration: it does not convert existing blobs or change a store's access mode. Existing objects in a public store remain publicly reachable until they are migrated into a private store and the old public objects are deleted. Configure private storage in a staging store and verify uploads, model attachment processing, previews, and downloads before switching production.

No Vercel account, Blob store, or live storage credential was available for this local implementation, so the new access-mode behavior is verified with SDK mocks only. Private Blob is supported by the installed `@vercel/blob` SDK version; see [Vercel Private Storage](https://vercel.com/docs/vercel-blob/private-storage).
