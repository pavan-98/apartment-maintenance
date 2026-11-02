# Putting the app online with Vercel — step by step

Time needed: about 15 minutes. Cost: ₹0. Vercel's free "Hobby" plan and Upstash's free database are more than enough for 15 flats.

You need:
- Your Vercel account (log in with GitHub at https://vercel.com).
- Access to the GitHub repository `pavan-98/apartment-maintenance`.

---

## Step 1 — Put the code on the `main` branch

Vercel publishes the live site from your repository's main branch. The app was built on the branch `ccr-c7c85cf3-rdsyaw`, so merge it first:

1. Open https://github.com/pavan-98/apartment-maintenance
2. GitHub shows a yellow bar: **"ccr-c7c85cf3-rdsyaw had recent pushes" → Compare & pull request**. Click it. If there's no bar: **Pull requests → New pull request**, base `main`, compare `ccr-c7c85cf3-rdsyaw`.
3. Click **Create pull request**, then **Merge pull request → Confirm merge**.

> Alternative: skip the merge and, after Step 2, set Vercel → Project → **Settings → Git → Production Branch** to `ccr-c7c85cf3-rdsyaw`.

## Step 2 — Create the Vercel project

1. Go to https://vercel.com/new
2. Under **Import Git Repository**, find `apartment-maintenance` and click **Import**.
   - Not in the list? Click **Adjust GitHub App Permissions** (or "Configure GitHub App"), allow access to `apartment-maintenance`, and come back.
3. On the **Configure Project** screen:
   - **Project Name**: this becomes your web address. For example, `puppala-towers` gives `https://puppala-towers.vercel.app`.
   - **Framework Preset**: Next.js (detected automatically). Leave **Build and Output Settings** as they are.
   - Open **Environment Variables** and add:

     | Key | Value |
     |---|---|
     | `ADMIN_PASSWORD` | A password only admins will know, e.g. `Puppala@2026!` (make up your own) |
     | `AUTH_SECRET` | Any long random text, e.g. 30+ random letters and numbers |

4. Click **Deploy** and wait 1–2 minutes.

The site opens, but shows **"Database is not connected"**. That's expected; Step 3 fixes it.

## Step 3 — Add the free database (Upstash for Redis)

1. In your Vercel project, open the **Storage** tab.
2. Click **Create Database** (or **Browse Marketplace**) and choose **Upstash → "Upstash for Redis"**, then **Continue**.
3. Choose:
   - **Primary region**: **Mumbai (ap-south-1)** if it's offered (closest to Visakhapatnam), otherwise the nearest option.
   - **Plan**: **Free**.
   - **Name**: e.g. `puppala-db`.
4. Click **Create**.
5. On the **Connect Project** screen, choose your project and keep all environments ticked (Development, Preview, Production). Leave **Custom Prefix** empty. Click **Connect**.

   Vercel adds settings such as `KV_REST_API_URL` and `KV_REST_API_TOKEN` to the project. The app finds them automatically.

## Step 4 — Redeploy (required once)

New settings only apply to new deployments:

1. Open the **Deployments** tab.
2. On the top deployment, click **⋯ → Redeploy → Redeploy**.

## Step 5 — Check everything is connected

Open `https://<your-project>.vercel.app/api/health`. You should see:

```json
{"ok":true,"storage":"Upstash Redis (connected)","database":"ok","adminPassword":"set"}
```

| If you see | Fix |
|---|---|
| `"storage":"NOT CONNECTED"` | Step 3 wasn't connected to this project, or you skipped the redeploy in Step 4 |
| `"adminPassword":"MISSING"` | Add `ADMIN_PASSWORD` under **Settings → Environment Variables**, then redeploy |
| A 404 page | The project deployed a branch without the app. Do Step 1, then redeploy |

## Step 6 — Trial run, then start fresh

1. Open `https://<your-project>.vercel.app`. You'll see September 2026 from the book as sample data, plus a sample notice pop-up.
2. Tap the **🔒** button (top right) → enter your name and the `ADMIN_PASSWORD`.
3. Try things out: mark payments, add expenses, post a notice, and print a notice.
4. When you're happy, go to **Admin → Settings → Remove sample data & start fresh**. Books start this month at ₹0. Flat owners and phone numbers are kept.
5. Go to **Admin → Phone numbers**, enter the owners' (and tenants') WhatsApp numbers, and tap **Save all numbers**.
6. Share the link in the apartment WhatsApp group. Anyone can open it; only admins can change anything.

---

## Everyday tasks

**Change the admin password.** Settings → Environment Variables → `ADMIN_PASSWORD` → ⋯ → Edit → Save, then Deployments → ⋯ → Redeploy. Everyone logged in as admin is logged out.

**More than one admin.** Share the same password. Each admin types their own name at login, so the edit history shows who changed what.

**Updates to the app.** Every change merged to `main` on GitHub is deployed automatically within a couple of minutes. Data is not affected.

**Your own web address** (optional, about ₹800/year for a domain). Settings → Domains → Add. Vercel shows the DNS records to add at your domain seller.

**Backups.** Admin → Settings → **All months (Excel)** downloads everything. Doing this once a month is a good habit. The data also lives in your Upstash database (Storage tab → your database → **Open in Upstash**).

## Where things are stored
- Records live in your Upstash Redis database, linked to your Vercel account. Nobody else has access.
- Bill photos are stored in the same database, compressed to well under 1 MB each.
- Owners' and tenants' phone numbers are only sent to logged-in admins, never to the public page.

## Troubleshooting
- **"Please log in again"** while saving: your login expired (after 30 days) or the password was changed. Log in again.
- **The app looks old after an update**: close the app or tab and open it again. The installed app refreshes itself on the next launch.
- **WhatsApp opens but doesn't pick the person**: check the number in Admin → Phone numbers. A 10-digit Indian mobile number is enough.
- **Build fails on Vercel**: open the failed deployment → **Build Logs**, and share the red error lines.
