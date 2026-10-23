# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, served equally from the first screen:

- **Parents** in East London looking for a weekly activity for their children.
- **Adults** who want to dance Bhangra themselves.

Both usually arrive on a phone, often from Instagram or a search. Existing members also use the site to log in, see their attendance and check times.

## Product Purpose

The London Academy of Bhangra (LAB) teaches authentic Punjabi folk dance to children and adults. The website exists to get a new visitor to **come along on a Thursday**. No booking is needed: success is someone knowing exactly when and where to turn up, and feeling they will be welcome.

The site also runs the academy's members' area:
- member accounts with QR attendance;
- teacher scanning and class debriefs;
- an admin editor for every part of the site.

## Positioning

What sets LAB apart from other dance or Bhangra classes nearby:
- **Authentic heritage:** traditional folk dance and props, taught by experienced performers from the UK Bhangra scene.
- **Family and community:** whole families take part.
- **A performance team:** students get to dance at real shows and events.

## Operating Context

- **Classes:** one class, every Thursday at 7:30pm, at The Royal Liberty School, Gidea Park, RM2 6HJ, about a 9-minute walk from Gidea Park station. It is a mixed-abilities class where kids and adults dance together. There is no separate kids' class.
- **Unconfirmed:** the 8:30pm finish time is carried over from the old adults' class.
- **Price:** £7 drop-in per class. All levels, and complete beginners are welcome.
- **Contact:** by phone. Instagram (@londonacademyofbhangra) is the academy's live channel.

All of these values are editable in Admin and may change.

## Capabilities and Constraints

- **Stack:** Node and Express with a vanilla JavaScript single-page app. Hosted on Render's free plan, with Supabase providing Postgres and storage.
- **Editable content:** every word and image on the site is editable from Admin. Designs must work with any content length and with optional sections switched off.
- **Live Instagram feed:** posts are pulled from Instagram (Graph API or Behold) and drive the site's pictures.
- **Privacy:** a privacy policy must be accepted at sign-up. Children under 16 need a parent or guardian's details.

## Brand Commitments

- **Logo:** the round London Academy of Bhangra badge, a transparent PNG with white lettering. It is always shown on black or dark navy.
- **Colours:** navy and gold stay as the brand colours. Everything else about the look is open.
- **Feel:** festive but polished. Real Bhangra energy, carried by photos and video, inside a clean and confident layout.
- **Never:**
  - clichéd "Indian" decoration such as generic paisley, mandalas or Bollywood clip-art;
  - a quiet, plain page with no sense of Bhangra's energy.

## Evidence on Hand

- **Available, not yet uploaded:** class photos, video clips, performances and events, and genuine reviews from parents and students. The site's pictures come from the Instagram feed for now.
- **Not to invent:** no reviews, quotes, student numbers, awards or event names until the academy supplies them.

## Product Principles

1. **When and where come first.** Thursday, the times, the school and the price must be readable within seconds on a phone.
2. **Kids and adults are equals.** They dance together in one class, and neither audience should feel like an afterthought.
3. **Show the real academy.** Real photos, video and Instagram posts carry the energy; decoration never stands in for them.
4. **A welcome, not a sales pitch.** The message is "just turn up", with nothing to fill in first.

## Accessibility & Inclusion

The site is used by families and children of all ages, mostly on phones:
- readable contrast;
- large tap targets;
- support for reduced motion;
- plain words.
