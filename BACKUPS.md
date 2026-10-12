# Backups

The Supabase project is on the free plan, which keeps no backups. A GitHub
Actions job makes one every night and emails it.

## What happens every night

`.github/workflows/nightly-backup.yml` runs at **2:00 AM Manila** (and on demand
from GitHub → Actions → Nightly backup → Run workflow):

1. `supabase db dump` writes `database/roles.sql`, `schema.sql` and `data.sql`:
   every table, function, security rule and sign-in account.
2. `scripts/backup/build-records.mjs` writes `zeke-records-<day>.xlsx`: Bookings,
   Payments, Customers, Fleet, Expenses, Vehicle expenses, Charge types, for reading.
3. Both are packed into `zeke-backup-<day>.7z`, locked with the backup password.
4. `scripts/backup/send-backup-email.mjs` emails it to `BACKUP_EMAIL_TO`, with how
   many rows each sheet has. A failed night sends "❌ Zeke backup failed" instead.
5. GitHub keeps the same `.7z` for 14 days under the run's **Artifacts**.

Not included: files in Storage (car photos, ID photos, payment proofs).

## Setup

GitHub → `giouuuu/citi-rental` → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `SUPABASE_DB_URL` | Supabase → Connect → **Session pooler** URI, with the database password filled in |
| `RESEND_API_KEY` | Resend → API Keys (sending access) |
| `BACKUP_EMAIL_TO` | who receives it, comma-separated |
| `BACKUP_PASSWORD` | the password that locks the `.7z`. Keep it in a password manager: without it no backup can be opened |
| `EMAIL_FROM` (optional) | sender; defaults to `no-reply@zekecebucarrental.com` |

## Opening a backup

Save the attachment, open it with Keka or The Unarchiver (Mac) or 7-Zip
(Windows), and type the backup password.

## Restoring the system

Restore into a **new** Supabase project, never on top of a live one.

1. Create the project, then copy its Session pooler URI.
2. Unpack the `.7z`, and from the `database/` folder run:

   ```sh
   psql \
     --single-transaction \
     --variable ON_ERROR_STOP=1 \
     --file roles.sql \
     --file schema.sql \
     --command 'SET session_replication_role = replica' \
     --file data.sql \
     --dbname "<new project's Session pooler URI>"
   ```

3. Point the app at the new project (`NEXT_PUBLIC_SUPABASE_URL`, the publishable
   and service keys in Vercel), redeploy, and re-upload any Storage files.

Try a restore into a throwaway project once in a while: a backup is only as good
as the last time it was restored.
