# invoice168

A simple, multi-company invoicing SaaS. Create invoices, manage customers and products,
apply tax rates, and record payments — built on React + Vite + Tailwind + Supabase, deployable on Netlify.

## Stack
- Frontend: React 18 + Vite + TailwindCSS
- Backend / database / auth: Supabase (Postgres, Row Level Security)
- Hosting: Netlify (auto-deploy from GitHub)

## Features (v1)
- Email sign up / login (Supabase Auth), each account gets its own company
- Customers, Products/Services, Tax Rates
- Invoices with line items, live totals, tax, statuses (draft / sent / partial / paid / overdue / cancelled)
- Record multiple (partial) payments per invoice; balances update automatically
- Dashboard with outstanding, paid-this-month, overdue and customer counts
- Company settings (currency, invoice prefix, address)

## Local development
```bash
npm install
npm run dev
```
Set Supabase credentials in `.env.local` (see `.env.example`). The app also ships with
working defaults so a Netlify deploy works out of the box.

## Database
Run the SQL in the Supabase SQL Editor to create the schema (tables + Row Level Security).
See the schema script shared during setup.

## Deploy (Netlify)
1. Connect this repo in Netlify (Import from GitHub).
2. Build command `npm run build`, publish directory `dist` (already in `netlify.toml`).
3. (Optional) set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars.
