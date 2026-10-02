# London Academy of Bhangra web app

A mobile-friendly website and members' app for the London Academy of Bhangra (LAB).

- **Public site:** Home, About, Timetable, Pricing, Gallery and Contact tabs, plus any extra pages you create.
- **Instagram gallery:** shows the latest posts from @londonacademyofbhangra automatically.
- **Member accounts:** each member gets a unique member ID (e.g. `LAB-7K3Q9X`) and a QR code, and can see their attendance history.
- **QR scanner for instructors:** scan members' QR codes with a phone camera to record attendance for each class. Manual check-in by name or ID is also available.
- **Admin page:** edit all of the site's text, images, colours, menu tabs, timetable, prices and contact details. Also manage members, sessions, CSV exports and contact-form messages.

## Running it

Requires **Node.js 22.13 or newer**. The app uses Node's built-in SQLite, so there is no separate database to install.

```bash
npm install
cp .env.example .env      # then edit ADMIN_EMAIL / ADMIN_PASSWORD
npm start                 # http://localhost:3000
```

On first start an admin account is created from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. If no password is set, a random one is printed in the server log. Log in at `/login` and change it from **My account**.

Run the tests with `npm test`.

### Deploying

Any Node host works, for example Render, Railway, Fly.io or a small VPS. You can also use the included `Dockerfile`.

- **The site must be served over HTTPS.** Phones only allow the camera (QR scanner) on secure pages. Most hosts provide HTTPS automatically.
- **Keep `DATA_DIR` on a persistent disk or volume.** It holds the database (`lab.sqlite`) and uploaded images. Back this folder up regularly.
- If the app is *not* behind a proxy or load balancer, set `TRUST_PROXY=0`.

## Roles

| Role | Can do |
| --- | --- |
| Member | See their QR card and attendance, update their name, phone and password |
| Instructor | Everything a member can, plus: QR scanner, sessions and attendance, view and add members, CSV export |
| Admin | Everything, plus: edit website content, change roles, reset passwords, Instagram, messages |

Make someone an instructor in **Admin → Members → (person) → Role**.

## Taking attendance

1. An instructor opens **Admin → QR scanner** on their phone.
2. They pick today's class. Classes come from the timetable for the current day, or they can create a one-off session.
3. They tap **Start camera** and scan each member's QR code from the member's **My account** page (or a printed card).
4. Each scan is recorded once per session. Scanning someone twice shows "already checked in".

Members can log in with their email **or** member ID. If someone loses their card, **Issue new member ID** in their admin page cancels the old QR code.

Online sign-up can be switched off in **Admin → Site & branding**. Admins and instructors can always add members themselves. A one-time password is shown to pass on to the member.

## Connecting Instagram

Instagram only lets websites show posts through its official API, so a one-time setup is needed:

1. Switch @londonacademyofbhangra to a **Professional** account (Business or Creator) in the Instagram app.
2. At [developers.facebook.com/apps](https://developers.facebook.com/apps), create an app and add the **Instagram** product ("API setup with Instagram login").
3. Add the academy's Instagram account and click **Generate token**.
4. Paste the token into **Admin → Instagram** (or set `INSTAGRAM_ACCESS_TOKEN`).

New posts then appear on the Gallery page and home page automatically. The site checks every 15 minutes, and it renews the 60-day token by itself. Until Instagram is connected, the gallery shows a "Follow on Instagram" button and any extra photos you add in **Admin → Gallery**.

## Project layout

```
server/            Express API (auth, members, attendance, content, Instagram)
  defaultContent.js  Starter text for the site (everything is editable in Admin)
public/            Front end (no build step)
  js/app.js          Public pages, login and member account
  js/admin.js        Admin and instructor area, including the QR scanner
  img/               Academy logo and app icons
test/              API tests (node --test)
```
