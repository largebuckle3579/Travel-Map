# Supabase Setup

1. Create a Supabase project.
2. Open the Supabase SQL Editor.
3. Paste and run the contents of `supabase-setup.sql`.
4. Go to Project Settings > API.
5. Copy your Project URL and anon public key.
6. Paste them into `assets/supabase-config.js`.

```js
window.SUPABASE_CONFIG = {
  url: "https://YOUR-PROJECT.supabase.co",
  anonKey: "YOUR-ANON-PUBLIC-KEY",
  bucket: "country-photos"
};
```

This setup allows public uploads. That is convenient for a shared travel map, but anyone with the site link can upload photos. For a public website, add login or moderation before sharing it widely.
