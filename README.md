# London Academy of Bhangra web app

A mobile-friendly website and members' app for the London Academy of Bhangra (LAB).

- **Public site:** Home, About, Timetable, Pricing, Gallery and Contact tabs, plus any extra pages you create.
- **Instagram gallery:** shows the latest posts from @londonacademyofbhangra automatically.
- **Member accounts:** members sign up online, write a short bio, and get a unique member ID (e.g. `LAB-7K3Q9X`) and QR code. They can track their attendance: totals, a 6-month chart and a full history.
- **QR scanner for teachers:** scan members' QR codes with a phone camera to record attendance for each class. On a phone the camera opens straight away. *Scan from a photo* and manual check-in are also available.
- **Class debriefs:** after each class a teacher logs who ran it, the date, the number of attendees, the LAB pouch balance and class feedback.
- **Admin page:** edit every part of the website: all text, headings and buttons, images, logo, colours, fonts, menu tabs, home page sections (show or hide), timetable, prices, contact details, member page wording and extra pages. Also manage members, sessions, CSV exports and contact-form messages.

## Running it

Requires **Node.js 22.13 or newer**. The app uses Node's built-in SQLite, so there is no separate database to install.

```bash
npm install
cp .env.example .env      # then edit ADMIN_EMAIL / ADMIN_PASSWORD
npm start                 # http://localhost:3000
```

On first start an admin account is created from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. If no password is set, a random one is printed in the server log. Log in at `/login` and change it from **My account**.

Run the tests with `npm test`.

### Deploying to Render

The repository includes a Render Blueprint (`render.yaml`). It sets up a Node web service in Frankfurt, the region closest to London. It also adds a 1 GB persistent disk for the database and uploaded images, and a health check.

1. Sign in at [dashboard.render.com](https://dashboard.render.com) and connect your GitHub account, giving Render access to this repository.
2. Click **New → Blueprint**, pick this repository and click **Connect**.
3. Enter **ADMIN_EMAIL** and **ADMIN_PASSWORD** for the first admin login, then click **Apply** (Deploy Blueprint).
4. When the deploy finishes, your site is live at `https://london-academy-of-bhangra.onrender.com` (or similar). Log in at `/login` with the admin details.
5. Optional: add your own domain under the service's **Settings → Custom Domains**. Render provides the https certificate.

The *Starter* instance type is needed because free instances cannot have a persistent disk, and without one all data would be lost on every deploy. New pushes to the branch deploy automatically.

### Deploying elsewhere

Any Node host works, for example Render, Railway, Fly.io or a small VPS. You can also use the included `Dockerfile`.

- **The site must be served over HTTPS.** Phones only allow the camera (QR scanner) on secure pages. Most hosts provide HTTPS automatically.
- **Keep `DATA_DIR` on a persistent disk or volume.** It holds the database (`lab.sqlite`) and uploaded images. Back this folder up regularly.
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

## Connecting Instagram

Instagram only lets websites show posts through its official API, so a one-time setup is needed. The Instagram account must be a **Professional** account (Business or Creator). You can switch in the Instagram app under Settings → Account type and tools.

Then choose one option in **Admin → Instagram**:

- **Behold feed link (easiest).** Sign up at [behold.so](https://behold.so), connect the academy's Instagram, create a *JSON feed* and paste its link (`https://feeds.behold.so/…`). Behold keeps the Instagram connection working.
- **Instagram API token (advanced).** Create an app at [developers.facebook.com/apps](https://developers.facebook.com/apps), add the Instagram product, generate a token for the account, and paste it in (or set `INSTAGRAM_ACCESS_TOKEN`). The site renews the 60-day token by itself.

Once connected, new posts appear on the Gallery and Home pages automatically, checked every 10 minutes. Visitors can tap a post to see it larger, swipe through photo sets, play videos, or open it on Instagram. Until Instagram is connected, the gallery shows a "Follow on Instagram" button and any extra photos you add in **Admin → Gallery**.

## Project layout

```
server/            Express API (auth, members, attendance, content, Instagram)
  defaultContent.js  Starter text for the site (everything is editable in Admin)
public/            Front end (no build step)
  js/app.js          Public pages, login and member account
  js/admin.js        Admin and teacher area: QR scanner, sessions, members, debriefs, content editors
  img/               Academy logo and app icons
test/              API tests (node --test)
```
