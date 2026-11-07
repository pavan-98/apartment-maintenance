# Putting the app online with Vercel — step by step

Time needed: about 15 minutes. Cost: ₹0. Vercel's free "Hobby" plan and Upstash's free database are more than enough for 15 flats.

You need:
- Your Vercel account (log in with GitHub at https://vercel.com).
- Your own copy of this repository on GitHub: open https://github.com/pavan-98/apartment-maintenance and click **Fork**.

---

## Step 1 — Get the code

Fork the repository (see above) so you have your own copy, e.g. `your-name/apartment-maintenance`. Vercel will publish the `main` branch of your fork and redeploy automatically whenever it changes.

## Step 2 — Create the Vercel project

1. Go to https://vercel.com/new
2. Under **Import Git Repository**, find `apartment-maintenance` and click **Import**.
   - Not in the list? Click **Adjust GitHub App Permissions** (or "Configure GitHub App"), allow access to your fork, and come back.
3. On the **Configure Project** screen:
   - **Project Name**: this becomes your web address. For example, `sunrise-residency` gives `https://sunrise-residency.vercel.app`.
   - **Framework Preset**: Next.js (detected automatically). Leave **Build and Output Settings** as they are.
   - Open **Environment Variables** and add:

     | Key | Value |
     |---|---|
     | `ADMIN_PASSWORD` | A password only admins will know, e.g. `Sunrise@2026!` (make up your own) |
     | `AUTH_SECRET` | Any long random text, e.g. 30+ random letters and numbers |
     | `NEXT_PUBLIC_APARTMENT_NAME` | Your apartment's name, e.g. `Sunrise Residency` |

4. Click **Deploy** and wait 1–2 minutes.

The site opens, but shows **"Database is not connected"**. That's expected; Step 3 fixes it.

## Step 3 — Add the free database (Upstash for Redis)

1. In your Vercel project, open the **Storage** tab.
2. Click **Create Database** (or **Browse Marketplace**) and choose **Upstash → "Upstash for Redis"**, then **Continue**.
3. Choose:
   - **Primary region**: **Mumbai (ap-south-1)** if it's offered (closest to Visakhapatnam), otherwise the nearest option.
   - **Plan**: **Free**.
   - **Name**: e.g. `apartment-db`.
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
| A 404 page | The project deployed a branch without the app. Check **Settings → Git → Production Branch** is `main`, then redeploy |

## Step 5b — Phone notifications (optional, free)

Residents can get a notification on their phone when a notice is posted. It uses the browsers' own free push service; you only need a pair of keys.

1. On any computer with Node.js, run `npx web-push generate-vapid-keys`. It prints a **Public Key** and a **Private Key**.
2. In Vercel, **Settings → Environment Variables**, add (all environments ticked):

   | Key | Value |
   |---|---|
   | `VAPID_PUBLIC_KEY` | the Public Key |
   | `VAPID_PRIVATE_KEY` | the Private Key (keep it secret) |

3. Redeploy (Deployments → ⋯ → Redeploy).

Generate the keys **once** and keep them. If they change, every phone has to turn notifications on again.

What residents see: after the notice pop-ups, the app asks them to **turn on notifications** and **install the app**. "Not now" hides it for a week, and they can turn notifications on or off any time at the top of the **Notices** tab.
- **Android and computers** (Chrome, Edge, Firefox, Samsung Internet): works straight from the browser; installing is optional.
- **iPhone / iPad** (iOS 16.4 or later): only after **Share → Add to Home Screen** and opening the app from the Home Screen. The app shows these steps.

When you post a notice, **Send a notification to N subscribed phones** is ticked. Any current notice also has a **🔔 Notify phones** button to send it again.

**Admin → 🔔 Phone notifications** sends your own message (not tied to a notice) in English and Telugu, with ready-made texts for a maintenance reminder, water supply and meetings. It also lists every subscribed phone (device, language, browser or installed app) with the result of the last notification, a **Send test** button and **Remove**. Residents can also tap **Send a test** in the Notices tab on their own phone.

## Step 6 — Trial run, then start fresh

1. Open `https://<your-project>.vercel.app`. You'll see sample data (made-up names) and a few sample notices and rules.
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
- **Admin shows "Phone notifications are not set up"**: add `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (Step 5b) and redeploy.
- **A resident doesn't get notifications**: on iPhone the app must be opened from the Home Screen; on Android check the phone's notification settings for the browser, and that notifications aren't blocked for the site (🔒 next to the address).
- **WhatsApp opens but doesn't pick the person**: check the number in Admin → Phone numbers. A 10-digit Indian mobile number is enough.
- **Build fails on Vercel**: open the failed deployment → **Build Logs**, and share the red error lines.
