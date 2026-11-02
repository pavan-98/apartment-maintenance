# Srinivasa Sai Vigneswara Puppala Towers — Maintenance App

A mobile-friendly web app that replaces the maintenance book for our 15 flats.

## What residents see (no login)
- **Red alert at the top** listing every flat that hasn't paid maintenance, with the total pending and the months owed. Before the due date (default the 10th) it shows a softer amber "yet to pay" list instead.
- **Flats view**: the building floor by floor (501–503 at the top, 101–103 at the bottom). Green = paid, red = not paid. Tap a flat to see the owner, who lives there, and its full payment history.
- **Month summary**: collected, spent, and balance or shortage, plus an expense breakdown and a step-by-step "how the balance was worked out" chart (the calculation at the bottom of the book page).
- **Additional works** (pest control, painting, repairs…): per-flat amount, costs, who hasn't paid.
- **History** tab: collected vs spent per month and the month-end balance, with a table view.
- **Rules** tab: apartment rules for owners and tenants. New or changed rules get a "New" badge. Share a direct link with `/#rules`.
- **Telugu / English** switch, **WhatsApp share** of the monthly summary and reminders, and a printable statement (Print / Save as PDF).
- **Install app** button in the header. The app never shows an install pop-up on its own; it only installs when someone taps the button. It also works offline with the last loaded data.

## Admin mode (`/admin`, password)
- **Maintenance**: one tap per flat to mark paid (or record amount, date, cash/UPI and a note), "Mark all paid", and a different amount for a particular month.
- **Expenses**: one tap adds the regular monthly items (salary, electricity, GVMC + tank cleaning, lift, cleaning material) with their usual amounts; then edit what changed. You can add any other expense and attach a photo of the bill.
- **Additional works**: create a work, add its costs, and tap flats as they pay.
- **Flats**: edit owner and resident names, and WhatsApp numbers (numbers are only visible to admins).
- **Rules**: add, edit, reorder, and mark as important.
- **Settings**: apartment name, maintenance amount, due day, start month, opening balance, carry-forward on/off, the regular expenses list, Excel (CSV) export, print, and **Remove sample data & start fresh**.
- **History**: every change, with who made it and when.

## Sample data → fresh start
The first time the app opens it loads **September 2026 from the book** as a trial run. When you're ready, go to **Admin → Settings → Remove sample data & start fresh**. Flat owner names are kept; everything else is cleared, and the books start from the current month at ₹0 with nothing carried forward.

## Deploy (free) on Vercel
1. Go to vercel.com → **Add New → Project** → import this GitHub repository.
2. In the project, open **Storage → Create / Connect → Upstash for Redis** (free plan) and connect it to the project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
3. Under **Settings → Environment Variables**, add `ADMIN_PASSWORD` (and optionally `AUTH_SECRET`, any long random text).
4. **Deploy** (or redeploy after adding the variables). Share the link in the apartment WhatsApp group.

## Run locally
```bash
npm install
npm run dev        # http://localhost:3000, admin password "admin" in development
npm test           # money calculations, checked against the book page
npm run build
```
Without Redis variables, data is stored in `data/db.json`.

## Tech
Next.js 16 (App Router) + React 19 + Tailwind CSS 4. All records live in one small JSON document, stored in Upstash Redis in production. Writes use version checks, so two admins saving at once don't overwrite each other. Business logic is in `lib/` (`calc.ts` for balances and dues, `actions.ts` for validated admin changes and edit history) and is unit-tested in `tests/`.
