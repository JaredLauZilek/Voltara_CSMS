# admin-invite

Invites a person as Voltara staff or as a dealer member. Deployed with
`supabase functions deploy admin-invite`. Set `ADMIN_APP_URL` (where the
invite email should land) with `supabase secrets set ADMIN_APP_URL=https://…`.

Call from the admin portal with the user's session token:

```ts
await supabase.functions.invoke('admin-invite', {
  body: { email, kind: 'dealer', role: 'installer', dealer_id },
});
```
