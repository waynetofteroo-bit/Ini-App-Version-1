# ini — Security & Compliance

Read this before writing any file. Every rule applies to every file.

---

## 1. Claude API — prompt injection prevention

**Rule: User input is NEVER interpolated into a system prompt string.**

This is the single most important security rule in the codebase.

### ❌ WRONG — never do this
```typescript
const systemPrompt = `Mark this student answer: ${studentResponse}`;
const response = await client.messages.create({
  system: systemPrompt,
  messages: [{ role: 'user', content: 'Mark it.' }]
});
```

### ✅ CORRECT — always do this
```typescript
const systemPrompt = `You are a WJEC physics marker. Apply the rubric below...`;
const response = await client.messages.create({
  system: systemPrompt,  // no user content here
  messages: [{
    role: 'user',
    content: studentResponse  // user content passed separately
  }]
});
```

The `system` field contains only static, developer-controlled text (rubrics, instructions, JSON format specs). The `messages` array carries user-controlled content. These must never be mixed.

---

## 2. Supabase Row Level Security (RLS)

**Every table that stores user data MUST have RLS enabled.**

Content tables (courses, units, questions, knowledge_graph_nodes, knowledge_graph_edges) are public-read catalogues — no RLS needed on those.

### Tables requiring RLS + policies

| Table | Policy |
|---|---|
| `profiles` | `auth.uid() = id` |
| `user_courses` | `auth.uid() = user_id` |
| `user_units` | `auth.uid() = user_id` |
| `sm2_queue` | `auth.uid() = user_id` |
| `answer_log` | `auth.uid() = user_id` |

### Template for every user table
```sql
alter table [table_name] enable row level security;
create policy "Users manage own [table_name]"
  on [table_name] for all
  using (auth.uid() = user_id);
```

### Supabase client usage
- Use the **browser client** (`lib/supabase/client.ts`) in Client Components. This respects RLS automatically.
- Use the **server client** (`lib/supabase/server.ts`) in Server Components and API routes. Pass cookies to maintain session context.
- Use the **service role client** ONLY in admin routes (e.g. `/api/ingest`). Never expose service role key to the client.

---

## 3. Secrets management

**No secrets in client bundles. Ever.**

| Variable | Visibility | Where used |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Supabase client init |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server | Supabase client init |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Admin API routes |
| `ANTHROPIC_API_KEY` | Server only | `lib/claude.ts` |
| `ADMIN_SECRET` | Server only | `/api/ingest` header check |

Check: if a variable doesn't start with `NEXT_PUBLIC_`, it must never appear in any file under `app/` that is a Client Component (`'use client'`).

---

## 4. OWASP Top-10 headers — `next.config.js`

```javascript
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

module.exports = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};
```

---

## 5. UK GDPR & Children's Code compliance

ini is used by students, many of whom will be under 18.

**Data minimisation:**
- Collect only what is needed: email, display name, exam config, answer history.
- Do not collect date of birth, phone number, or any social profile data.
- `profiles` table stores no sensitive personal data beyond display name.

**Consent:**
- Signup flow must present clear privacy notice before account creation.
- Privacy notice must be age-appropriate and plain English.

**Data retention:**
- `answer_log` is personal data. Implement account deletion that cascades to all user tables (the `on delete cascade` FKs in schema handle this).
- Do not retain data beyond the purpose for which it was collected.

**AI-generated content:**
- Never display AI-generated assessment feedback that could be mistaken for a human teacher's opinion without appropriate framing.

---

## 6. Admin route protection

`/api/ingest` is an admin-only route. Protect it with a shared secret header check:

```typescript
// app/api/ingest/route.ts
export async function POST(request: Request) {
  const adminSecret = request.headers.get('x-admin-secret');
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return new Response('Unauthorised', { status: 401 });
  }
  // ... pipeline logic
}
```

---

## 7. Input validation

All API route inputs must be validated before use:

- Validate UUIDs before using them in DB queries (prevent malformed input errors)
- Validate `bloom_level` is an integer 1–5
- Validate `correct_idx` is within options array bounds
- Never trust client-supplied `user_id` — always derive from `auth.uid()` server-side

```typescript
// Example — derive user_id server-side, never from body
const { data: { user } } = await supabase.auth.getUser();
if (!user) return new Response('Unauthorised', { status: 401 });
const userId = user.id; // use this, not request.body.user_id
```

---

## Pre-commit checklist

Before committing any file:

- [ ] No user input in Claude system prompt strings
- [ ] Every new user table has RLS enabled and a policy
- [ ] No `ANTHROPIC_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in client files
- [ ] All API routes derive `user_id` from `auth.getUser()`, not from request body
- [ ] `/api/ingest` checks `x-admin-secret` header
- [ ] `next.config.js` includes security headers
