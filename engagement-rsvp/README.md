# Ravi & Akshee: Pooja & engagement party RSVP website

A website for the **Pooja** (11am) and the **Engagement Party** (6pm) at the Courtyard by Marriott London Heathrow Airport, 1 Nobel Drive, Harlington, Hayes UB3 5EY, with RSVPs from the guest list and an admin area.

**For guests** (big text, big buttons, works on any phone, with a *Larger text* button at the top):

- **Home** (with both events), **Our Story**, **Venue** (map, postcode, "Open in Google Maps"), **Getting There** (parking, trains, taxis, step-free access) and **FAQ**.
- **RSVP:** guests type their name. Only people on your guest list find an invitation. They see which events their invitation is for, then tick **Coming** or **Can't come** for each person **at each of those events**, answer your questions (e.g. dietary needs), add extra guests if you allowed them, check their reply and send it.
- Guests can come back and **change their reply until the RSVP deadline**. After that it is locked and they're asked to contact you.

**For you** (log in at `/admin`, or tap **Admin** at the bottom of any page):

- **Overview:** for the Pooja and the Engagement Party separately: who's coming (adults and children), who isn't and who hasn't replied. Also the deadline. After the deadline, families who haven't replied are **highlighted in red** under *Need chasing*, with their phone number. Tick *I have chased them* to keep track.
- **Guest list:** add a family or group (one invitation), or paste many at once. Each invitation says which events it's for (**Pooja only**, or **Pooja & Engagement Party**), and lists everyone on it, how many extra guests they may bring, a phone number and private notes. You can also enter or change a reply for someone (e.g. if they phone you), or clear it.
- **Replies log:** every reply and every change, with what changed (e.g. *Priya Patel: Coming → Not coming*).
- **Email updates:** every new or changed reply is emailed to **Ravi.akshee@gmail.com** (you can add more addresses in *Settings*).
- **Edit website:** change every part of the site: your names, the events (names, dates, times, details, photos), **every colour**, a photo for every page (plus each event, story chapter and travel section), the story, venue, travel and parking details, FAQs, the RSVP deadline, RSVP questions and every message guests see.
- **Download spreadsheet** (one row per guest) and **Download a backup**.
- **Settings:** add another admin (e.g. Akshee), change your password.

## How guests find their invitation

- Guests type their first and last name. Capitals, accents and titles (Mr, Mrs, Dr) don't matter, a missing middle name is fine, and one small typo in a longer name is forgiven.
- **Type each guest's name the way they'll type it themselves** (e.g. *Priya Sharma*, not *Mrs P. Sharma*).
- Anyone on an invitation can reply for everyone on it.
- If the same name is on two invitations, the guest is asked to pick theirs, shown by the first names on each. You get a warning when you add a name that's already on the list.
- Someone who knows a guest's name could see and change that family's reply. This is normal for party RSVP sites, and every change is logged and emailed to you.

## Adding many guests at once

In **Guest list → Add many at once**, type one invitation per line, separating names with commas:

```
Patel family: Raj Patel, Priya Patel, Anil Patel (child)
Sunita Shah, Vikram Shah +1
John Smith
```

- `Patel family:` at the start is an optional name for the invitation.
- `(child)` marks a child, so you get adult and child numbers.
- `+1` or `+2` at the end lets them bring that many extra guests.

Below the box, tick which events everyone on that list is invited to. So add your **Pooja-only** list in one go with only *Pooja* ticked, and your **Pooja & Engagement Party** list with both ticked.

## Events

Both events are set up under **Edit website → Events (Pooja & Party)**. Set each event's **date** there. Each event has *Show on the home page for everyone*. If you'd rather Pooja-only guests didn't see the Engagement Party on the public pages, untick it for the party: guests invited to it still see it when they RSVP.

## Putting the code on your GitHub account

This website lives in its own GitHub repository, separate from the London Academy of Bhangra site.

1. Sign in to [github.com](https://github.com) with the account you want to use, and click **+ → New repository**.
2. Name it e.g. `ravi-akshee-rsvp`. Choose **Private** (recommended). Don't tick "Add a README". Click **Create repository**.
3. On the next page, click **uploading an existing file**.
4. Unzip `ravi-akshee-rsvp.zip` on your computer, open the `ravi-akshee-rsvp` folder, select **everything inside it** and drag it onto the GitHub page. Wait for all the files to upload, then click **Commit changes**.

The repository should then show `package.json`, `render.yaml`, `README.md` and the `server`, `public` and `test` folders at the top level.

(If you use git on your computer instead: unzip, `cd ravi-akshee-rsvp`, then `git init`, `git add .`, `git commit -m "RSVP website"`, `git branch -M main`, `git remote add origin <your new repo's URL>`, `git push -u origin main`.)

No guest information is stored in the code: the guest list and replies live in your Supabase database.

## Running it on your own computer

Requires **Node.js 22 or newer**.

```bash
cd ravi-akshee-rsvp
npm install
cp .env.example .env      # then set ADMIN_PASSWORD
npm start                 # http://localhost:3000
```

The admin account (**ADMIN_EMAIL**, Ravi.akshee@gmail.com) is created on first start with **ADMIN_PASSWORD**. If no password is set, a random one is printed in the log. Run the tests with `npm test`.

## Putting it online for free: Render + Supabase + Resend

- **Supabase** (free) stores the guest list, replies and photos.
- **Render** (free) runs the website.
- **Resend** (free) sends the update emails. Render's free plan blocks normal email-server (SMTP) connections, so the site uses Resend's web API instead.
- **Cost:** £0 a month.

### 1. Supabase (the database)

1. Sign up at [supabase.com](https://supabase.com) and click **New project**. Name it e.g. *Engagement RSVP*, choose a strong **database password** and save it. Pick the **London (eu-west-2)** region if offered.
2. Click **Connect** (top of the page). Under **Session pooler**, copy the connection string and replace `[YOUR-PASSWORD]` with your database password. This is your **DATABASE_URL**.
3. **Project Settings → API**: copy the **Project URL**. This is your **SUPABASE_URL**.
4. **Project Settings → API Keys**: copy the **secret** (or legacy **service_role**) key. This is your **SUPABASE_SERVICE_KEY**. Keep it private.

The site creates its tables and a photo storage bucket by itself on first start.

### 2. Resend (the update emails)

1. Sign up at [resend.com](https://resend.com) **using Ravi.akshee@gmail.com**.
2. Go to **API Keys → Create API key** and copy it. This is your **RESEND_API_KEY**.

Without a domain of your own, Resend's free plan only delivers to the address you signed up with. That's fine for emails to Ravi.akshee@gmail.com. To send updates to other addresses too, either verify a domain in Resend, or use **Brevo** instead: sign up at [brevo.com](https://www.brevo.com), verify your Gmail address as a sender, create an API key, and set **BREVO_API_KEY** and **EMAIL_FROM** (your verified address) instead of RESEND_API_KEY.

### 3. Render (the website)

1. Sign in at [dashboard.render.com](https://dashboard.render.com) (sign up with the same GitHub account that holds this repository) and give Render access to the repository. For a private repository, Render asks you to install its GitHub app: choose **Only select repositories** and pick this one.
2. Click **New → Blueprint** and pick this repository. Render finds `render.yaml` by itself.
3. Fill in **ADMIN_PASSWORD**, **DATABASE_URL**, **SUPABASE_URL**, **SUPABASE_SERVICE_KEY** and **RESEND_API_KEY**, then click **Deploy Blueprint**.
4. When it finishes, the site is live at an address like `https://ravi-akshee-rsvp.onrender.com`. Go to `/admin` and log in with Ravi.akshee@gmail.com and your ADMIN_PASSWORD.
5. In **Settings → Email updates**, click **Send a test email**.
6. Optional: under the service's **Environment**, add `PUBLIC_URL` (your site's address) so links in emails always point to the right place, and add your own domain under **Settings → Custom Domains**.

(Alternatively, create a **Web Service** by hand: build command `npm ci --omit=dev`, start command `npm start`, and the same environment variables.)

### 4. Keep it awake (recommended)

On the free plans, Render puts the site to sleep after 15 minutes without visitors (the next visit then takes about a minute to load), and Supabase pauses a project after a week without activity. Set up a free monitor at [uptimerobot.com](https://uptimerobot.com) or [cron-job.org](https://cron-job.org) to visit `https://<your-site>/healthz` every **10 minutes**. It also checks the database, so it keeps both awake.

### Forgotten password

In Render → **Environment**, set `ADMIN_PASSWORD` to a new password and add `ADMIN_PASSWORD_RESET` = `1`. After the site restarts, log in with the new password, then delete `ADMIN_PASSWORD_RESET`.

## Before you send the link

- [ ] **Edit website → Events:** set the date of the Pooja and the Engagement Party.
- [ ] **Edit website → Names & contact:** a contact phone number.
- [ ] **Edit website → Colours:** pick your colours.
- [ ] **Edit website → Venue** and **Getting There:** the address is filled in; add parking, trains and taxis.
- [ ] **Edit website → RSVP page & questions:** set the **RSVP deadline**, and check the questions.
- [ ] Upload photos for the home page and your story.
- [ ] Add your guest list: the Pooja-only list and the both-events list.
- [ ] **Settings → Send a test email**, then RSVP once yourself to try it, and clear that reply afterwards (**Guest list → your name → Clear reply**).

## Project layout

```
server/            Express API
  rsvp.js            Name matching, saving replies, what-changed summaries, deadlines
  email.js           Update emails (Resend or Brevo)
  content.js         Editable website content (starter text in defaultContent.js)
  db.js              Postgres (DATABASE_URL) or embedded Postgres for local use
  storage.js         Photos: Supabase Storage or a local folder
public/            Front end (no build step)
  js/app.js          Guest pages and the RSVP steps
  js/admin.js        Admin area
test/              API tests (node --test)
```
