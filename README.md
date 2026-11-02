# Srinivasa Sai Vigneswara Puppala Towers — Maintenance App

A mobile-friendly web app that replaces the maintenance book for our 15 flats.

## What residents see (no login)
- **Red alert at the top** listing every flat that hasn't paid maintenance, with the total pending and the months owed. Before the due date (default the 10th) it shows a softer amber "yet to pay" list instead.
- **Flats view**: the building floor by floor (501–503 at the top, 101–103 at the bottom). Green = paid, red = not paid. Tap a flat to see the owner, who lives there, and its full payment history.
- **Month summary**: collected, spent, and balance or shortage, plus an expense breakdown and a step-by-step "how the balance was worked out" chart (the calculation at the bottom of the book page).
- **Additional works** (pest control, painting, repairs…): per-flat amount, costs, who hasn't paid.
- **History** tab: collected vs spent per month and the month-end balance, with a table view.
- **Rules** tab: apartment rules in English and Telugu, grouped by topic (payments, cleanliness, water, lift, parking…), important rules first. Rules never expire. An admin can announce a new or changed rule with a one-time pop-up. Rules can be printed (A4, both languages) or shared on WhatsApp. Direct link: `/#rules`.
- **Notices** in English and Telugu. Each notice pops up **every time the app is opened until its date** (for things happening soon), **once**, or **not at all**. After its end date it is hidden automatically. Notices with no end date stay in the Notices tab (e.g. emergency contacts). Each one can be printed for the notice board or shared on WhatsApp.
- **Telugu / English** switch, **WhatsApp share** of the monthly summary and reminders, and a printable statement (Print / Save as PDF).
- **Install app** button in the header. The app never shows an install pop-up on its own; it only installs when someone taps the button. It also works offline with the last loaded data.

## Admin mode (`/admin`, password)
- **Maintenance**: one tap per flat to mark paid (or record amount, date, cash/UPI and a note), "Mark all paid", and a different amount for a particular month.
- **Expenses**: one tap adds the regular monthly items (salary, electricity, GVMC + tank cleaning, lift, cleaning material) with their usual amounts; then edit what changed. You can add any other expense and attach a photo of the bill.
- **Additional works**: create a work, add its costs, and tap flats as they pay.
- **Notices**: write a notice in English and Telugu, choose whether it pops up, set an end date, print it (A4 notice-board format), share it to the group, or send it to each owner.
- **WhatsApp send**: personal maintenance reminders to every flat with dues (each with their own amounts and months), a notice, or your own message, sent to owners, tenants or both. Someone who owns several flats gets one message. WhatsApp only allows fully automatic bulk sending through its paid Business API, so the app opens each chat with the message ready: tap send, come back, tap "Send to next". Progress is remembered.
- **Phone numbers**: enter all owners' and tenants' WhatsApp numbers on one screen (only admins can see them).
- **Flats**: edit owner and resident names.
- **Rules**: bilingual, with topics, important flag, an optional "tell residents" pop-up, reordering, print and share.
- **Managers** (main admin only): give someone their own login with limited rights, to hand over day-to-day work without sharing the main password. Managers can run the **current month only** (payments, expenses, additional works), record late payments for earlier dues, post notices, send WhatsApp messages and update phone numbers and tenants. They **cannot** change past months, see the edit history, or change settings, rules, owner names or managers. You can pause or remove a manager, or change their password, and their login stops working immediately. The server enforces all of this, not just the screens.
- **Settings**: apartment name, maintenance amount, due day, start month, opening balance, carry-forward on/off, the regular expenses list, Excel (CSV) export, print, and **Remove sample data & start fresh**.
- **History**: every change, with who made it and when.

## Sample data → fresh start
The first time the app opens it loads **September 2026 from the book** as a trial run. When you're ready, go to **Admin → Settings → Remove sample data & start fresh**. Flat owner names are kept; everything else is cleared, and the books start from the current month at ₹0 with nothing carried forward.

## Deploy (free) on Vercel
See **[docs/VERCEL_SETUP.md](docs/VERCEL_SETUP.md)** for step-by-step instructions (about 15 minutes). In short: import the repository in Vercel, add `ADMIN_PASSWORD`, connect **Upstash for Redis** from the Storage tab, redeploy, then check `/api/health`.

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
