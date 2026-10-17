# London Academy of Bhangra web app

> This repository also holds a separate engagement party RSVP website in [`engagement-rsvp/`](engagement-rsvp/README.md).

A mobile-friendly website and members' app for the London Academy of Bhangra (LAB).

- **Public site:** Home, About, Timetable, Pricing, Gallery and Contact tabs, plus any extra pages you create.
- **Instagram gallery:** shows the latest posts from @londonacademyofbhangra automatically.
- **Member accounts:** members sign up online, write a short bio, and get a unique member ID (e.g. `LAB-7K3Q9X`) and QR code. They can track their attendance: totals, a 6-month chart and a full history.
- **QR scanner for teachers:** scan members' QR codes with a phone camera to record attendance for each class. On a phone the camera opens straight away. *Scan from a photo* and manual check-in are also available.
- **Privacy policy and consent:** sign-up requires accepting the Privacy Policy; under 16s need a parent or guardian's consent.
- **Class debriefs:** after each class a teacher logs who ran it, the date, the number of attendees, the LAB pouch balance and class feedback.
- **Admin page:** edit every part of the website: all text, headings and buttons, images, logo, colours, fonts, menu tabs, home page sections (show or hide), timetable, prices, contact details, member page wording and extra pages. Also manage members, sessions, CSV exports and contact-form messages.

## Running it

Requires **Node.js 22 or newer**. The data is kept in **Postgres**. On your own computer you don't need to install anything: without a `DATABASE_URL`, the app uses an embedded Postgres stored in the `data` folder.

```bash
npm install
cp .env.example .env      # then edit ADMIN_EMAIL / ADMIN_PASSWORD
npm start                 # http://localhost:3000
```

On first start an admin account is created from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. If no password is set, a random one is printed in the server log. Log in at `/login` and change it from **My account**.

Run the tests with `npm test`.

## Free hosting: Render + Supabase

- **Supabase** (free plan) stores the data: members, attendance, debriefs, consent records, website content, and uploaded photos.
- **Render** (free plan) runs the website.
- **Cost:** £0 a month.

### 1. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) and click **New project**. Name it **LAB**, choose a strong **database password** and save it somewhere safe. Pick the **London (eu-west-2)** region if offered.
2. When the project is ready, click **Connect** (top of the page). Under **Session pooler**, copy the connection string. It looks like:
   `postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`
   Replace `[YOUR-PASSWORD]` with your database password. This is your **DATABASE_URL**. (Use the *Session pooler* string, not "Direct connection": Render's free plan can't reach the direct one.)
3. Go to **Project Settings → API** (or **Data API**). Copy the **Project URL**; this is your **SUPABASE_URL**.
4. Go to **Project Settings → API Keys**. Copy the **secret** key (or the legacy **service_role** key); this is your **SUPABASE_SERVICE_KEY**. Keep it private: it gives full access to your project.

The app creates its database tables and a public **uploads** storage bucket by itself on first start.

### 2. Deploy on Render

1. Sign in at [dashboard.render.com](https://dashboard.render.com) and make sure Render has access to this GitHub repository (GitHub → Settings → Applications → Render → Configure).
2. Click **New → Blueprint**, pick this repository, and give it a name, e.g. *LAB Website*.
3. Fill in the values it asks for: **DATABASE_URL**, **SUPABASE_URL**, **SUPABASE_SERVICE_KEY**, **ADMIN_EMAIL** and **ADMIN_PASSWORD**. Then click **Deploy Blueprint**.
4. When the deploy finishes, the site is live at `https://london-academy-of-bhangra.onrender.com` (Render shows the exact address). Log in at `/login` with your admin details.
5. Optional: add your own domain under the service's **Settings → Custom Domains**. Render provides the https certificate, which the phone camera needs.

If `DATABASE_URL` is missing, the app refuses to start on Render rather than risk losing data. The error is shown in the service's **Logs**.

### 3. Keep it awake (recommended)

On the free plans, Render puts the site to sleep after 15 minutes without visitors (the next visit then takes about a minute to load). Supabase pauses a project after a week without activity.

To avoid both, set up a free monitor at [uptimerobot.com](https://uptimerobot.com) or [cron-job.org](https://cron-job.org). It should visit `https://<your-site>/healthz` every **10 minutes**. That page also checks the database, so it keeps both services active. One always-awake site fits within Render's free monthly hours.

If Supabase ever does pause the project, open it in the Supabase dashboard and click **Restore**.

### 4. Backups

Supabase's free plan has no backups you can restore yourself. As an admin, use **Admin → Dashboard → Download a full backup** regularly, e.g. monthly, and keep the file somewhere safe and private: it contains members' personal details. The CSV exports under Sessions and Class debriefs are useful too.

### Other hosts

Any Node host works (Railway, Fly.io, a small server, or the included `Dockerfile`): set `DATABASE_URL`, plus `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` for images. Without them, the app keeps everything in `DATA_DIR`, which must then be on a permanent disk.

- **The site must be served over HTTPS.** Phones only allow the camera (QR scanner) on secure pages.
- If the app is *not* behind a proxy or load balancer, set `TRUST_PROXY=0`.

## Roles

| Role | Can do |
| --- | --- |
| Member | See their QR card and attendance, update their name, phone and password |
| Teacher | Everything a member can, plus: QR scanner, sessions and attendance, class debriefs, view and add members, CSV export |
| Admin | Everything, plus: edit website content, change roles, reset passwords, Instagram, messages |

Make someone a teacher in **Admin → Members → (person) → Role**.

## Taking attendance

1. A teacher opens **Admin → QR scanner** on their phone (or taps the **📷 Scan QR** button shown on every page on a phone).
2. They pick today's class. Classes come from the timetable for the current day, or they can create a one-off session.
3. They tap **Start camera** and scan each member's QR code from the member's **My account** page (or a printed card).
4. Each scan is recorded once per session. Scanning someone twice shows "already checked in".

Members can log in with their email **or** member ID. If someone loses their card, **Issue new member ID** in their admin page cancels the old QR code.

Online sign-up can be switched off in **Admin → Member pages**. Admins and teachers can always add members themselves. A one-time password is shown to pass on to the member.

### Camera on phones

The scanner uses the phone's camera straight from the website, with no app to install. The first time, the phone asks for permission; tap **Allow**. The site must be served over **https** or phones will refuse camera access. If a teacher opened the link inside another app (Instagram, WhatsApp) and the camera won't start, open the link in Safari or Chrome, or use **Scan from a photo**, which takes a picture with the normal camera app.

## Class debriefs

When the class ends, the teacher taps **Finish class & write debrief** on the scanner screen (also under **Admin → Class debriefs** or on a session's page). The form is pre-filled with the class, date, the teacher's name and the number of people scanned in, and shows the last recorded LAB pouch balance. It logs:

- who ran the class (tick teachers, or type other names)
- date of class
- number of attendees
- LAB pouch balance (£)
- class feedback

There is one debrief per class. The teacher who wrote it, or an admin, can edit it; only admins can delete. **Admin → Class debriefs** lists them with the latest pouch balance and average attendance, and exports to CSV. The dashboard shows how many recent classes still need a debrief.

## Privacy policy and consent

- The **Privacy Policy** page (`/privacy`, linked in the footer) is a starting draft for UK data protection law (UK GDPR), with a section on children under 16. Edit it in **Admin → Privacy policy**. Check it matches how the academy really works (especially how long you keep information and photo consent), and consider having it reviewed.
- **Sign-up** requires ticking "I have read and agree to the Privacy Policy" and saying whether the member is 16 or over. For **under 16s**, a parent or guardian must give their name and email and tick a consent box. Brothers and sisters can share a parent's email by leaving the child's own email blank; they then log in with their member ID.
- **People added by staff** (including teachers) must accept the policy at their first login before they can use their account or the scanner.
- **Changing the policy version** in Admin asks everyone to accept the new version at their next login. Every acceptance is recorded (version and date), and shown on the member's admin page.
- **Members' rights:** in **My account → Your data & privacy**, members can download all their data or delete their account.

## Connecting Instagram

Instagram only lets websites show posts through its official API, so a one-time setup is needed. The Instagram account must be a **Professional** account (Business or Creator). You can switch in the Instagram app under Settings → Account type and tools.

Then choose one option in **Admin → Instagram**:

- **Behold feed link (easiest).** Sign up at [behold.so](https://behold.so), connect the academy's Instagram, create a *JSON feed* and paste its link (`https://feeds.behold.so/…`). Behold keeps the Instagram connection working.
- **Instagram API token (advanced).** Create an app at [developers.facebook.com/apps](https://developers.facebook.com/apps), add the Instagram product, generate a token for the account, and paste it in (or set `INSTAGRAM_ACCESS_TOKEN`). The site renews the 60-day token by itself.

Once connected, new posts appear on the Gallery and Home pages automatically, checked every 10 minutes. Visitors can tap a post to see it larger, swipe through photo sets, play videos, or open it on Instagram. Until Instagram is connected, the gallery shows a "Follow on Instagram" button and any extra photos you add in **Admin → Gallery**.

## Project layout

```
server/            Express API (auth, members, attendance, debriefs, content, Instagram)
  db.js              Postgres (DATABASE_URL) or embedded Postgres for local use
  storage.js         Uploaded images: Supabase Storage or a local folder
  defaultContent.js  Starter text for the site (everything is editable in Admin)
public/            Front end (no build step)
  js/app.js          Public pages, login and member account
  js/admin.js        Admin and teacher area: QR scanner, sessions, members, debriefs, content editors
  img/               Academy logo and app icons
test/              API tests (node --test)
```
