---
name: London Academy of Bhangra
description: Warm paper, a floating white header card, heavy uppercase Archivo, and a mosaic of rounded navy, gold and cream tiles that drifts on the home page.
colors:
  paper: "#f5f4ef"
  ink: "#16162c"
  navy: "#1d1d3b"
  navy-raised: "#2a2a52"
  deep-navy: "#01003d"
  cream: "#f9f6f1"
  gold: "#c9a463"
  gold-light: "#e7c98a"
  gold-text: "#7d6130"
  muted: "#5d5c66"
  body-ink: "#3a3a4a"
  white: "#ffffff"
typography:
  display:
    fontFamily: "Archivo, Arial Black, Impact, system-ui, sans-serif"
    fontSize: "72px"
    fontWeight: 900
    lineHeight: 0.94
    letterSpacing: "-0.06em"
  headline:
    fontFamily: "Archivo, Arial Black, Impact, system-ui, sans-serif"
    fontSize: "clamp(52px, 7.4vw, 104px)"
    fontWeight: 900
    lineHeight: 0.94
    letterSpacing: "-0.055em"
  title:
    fontFamily: "Archivo, Arial Black, Impact, system-ui, sans-serif"
    fontSize: "clamp(34px, 4.2vw, 60px)"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "-0.05em"
  title-small:
    fontFamily: "Archivo, Arial Black, Impact, system-ui, sans-serif"
    fontSize: "clamp(24px, 2.3vw, 34px)"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.035em"
    fontVariation: "'wdth' 88"
  figure:
    fontFamily: "Archivo, Arial Black, Impact, system-ui, sans-serif"
    fontSize: "clamp(64px, 7vw, 104px)"
    fontWeight: 900
    lineHeight: 0.85
    letterSpacing: "-0.06em"
    fontFeature: "'tnum'"
  menu:
    fontFamily: "Archivo, Arial Black, Impact, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 88"
  index:
    fontFamily: "Archivo, Arial Black, Impact, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.06em"
  punchline:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
  lead:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.2
  button:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1
rounded:
  field: "14px"
  button: "16px"
  ticker: "18px"
  tile: "22px"
  full: "50%"
spacing:
  tile-gap: "13px"
  tile-gap-phone: "8px"
  edge: "clamp(16px, 3.2vw, 40px)"
  page: "clamp(20px, 4.4vw, 86px)"
  tile-pad: "clamp(22px, 2.6vw, 36px)"
  section: "40px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.tile}"
    padding: "0 26px"
    height: "63px"
  button-primary-hover:
    backgroundColor: "#26264a"
    textColor: "{colors.white}"
  button-gold:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.tile}"
    padding: "0 26px"
    height: "63px"
  button-gold-hover:
    backgroundColor: "#d8b678"
    textColor: "{colors.ink}"
  button-light:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.tile}"
    padding: "0 26px"
    height: "63px"
  button-ring:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.gold}"
    rounded: "{rounded.full}"
    size: "64px"
  header-card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    height: "102px"
    padding: "0 20px 0 26px"
  tile-gold:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: "{spacing.tile-pad}"
  tile-navy:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.white}"
    rounded: "{rounded.tile}"
    padding: "{spacing.tile-pad}"
  tile-deep:
    backgroundColor: "{colors.deep-navy}"
    textColor: "{colors.white}"
    rounded: "{rounded.tile}"
    padding: "{spacing.tile-pad}"
  tile-cream:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: "{spacing.tile-pad}"
  tile-white:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: "{spacing.tile-pad}"
  input-field:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "13px 15px"
  ticker-strip:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.ink}"
    typography: "{typography.title-small}"
    rounded: "{rounded.ticker}"
    padding: "16px 0"
  footer:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.white}"
    padding: "44px {spacing.page} 24px"
---

# Design System: London Academy of Bhangra

## Overview

**Creative North Star: "The Thursday Mosaic"**

The site is a wall of rounded tiles on warm paper. Each tile holds one thing: a photo from the academy's Instagram, a block of navy or gold, or a single fact in heavy uppercase ("Every Thursday", "7:30pm", "£7 a class", "Gidea Park"). On the home page the wall drifts up and down beside the academy's name, set huge in Archivo. The last word of the name sits on a navy tile of its own, ringed by a thin thread of moving gold light. Inner pages use the same tiles as their content blocks under a big two-voice page head: ink, then gold. The energy comes from motion, scale and real photos, never from ornament. Around that, a floating white header card, a gold ticker strip and a dark rounded footer keep the layout clean and confident.

The feel is festive but polished. The type is loud and tightly tracked. The surfaces are flat with soft corners. The palette is navy and gold, the brand colours, set on a pale warm paper instead of a dark ground, so the page reads as daylight and welcome. A fine grain on the solid tiles gives them a printed, tactile quality. That grain is a deliberate decision, not leftover texture. Every effect (shimmer, shine, word rotate, ripple, blur fade, number tickers, confetti, the drift and the ticker) is plain CSS or small vanilla JS in the spirit of Magic UI, and all of them stop for visitors who ask for reduced motion.

The brand's refusals are carried from PRODUCT.md: no clichéd "Indian" decoration (paisley, mandalas, Bollywood clip-art), and no quiet, plain page without Bhangra's energy.

**Key Characteristics:**
- Warm paper ground (#f5f4ef) with navy, gold, cream and white tiles at a 22px radius.
- Archivo 900, uppercase, tracked tight (-0.035em to -0.06em), for every heading and every fact on a tile.
- Titles in two voices: ink, then the last word in gold.
- Inter for reading, with Inter italic as the punchline voice.
- Flat surfaces. Depth comes from tone, hairline rings and grain; the only real shadows are on the floating header card and the pause button.
- Motion that is constant but calm (drift, shine, ticker), with a pause button and a full stop under reduced motion.

## Colors

Navy and gold on warm paper, with cream and white as quiet tiles and a deep near-black navy for photo grounds.

### Primary
- **Academy Navy** (navy): the footer, the dark tiles and the tile behind the last word of the home title. It always carries white or gold type.
- **Raised Navy** (navy-raised): a second, lighter navy tile so the wall has two dark tones. It also backs the map tiles.
- **Midnight** (deep-navy): the deepest tile tone and the ground under every photo tile, so a slow image loads onto dark rather than onto a white flash. Class times and stats tiles use it.
- **Ink** (ink): all type on paper, the main pill button and the round pin button. It is almost navy, so text and brand never fight.

### Secondary
- **Festival Gold** (gold): gold tiles, the ticker strip, the gold pill, text selection, the short rule before the home lede, and gold type on navy (6.9:1 on Academy Navy).
- **Gold Light** (gold-light): the bright point of the gold shine border and of the confetti; also the shared `--accent-light`.
- **Gold Ink** (gold-text): the second voice of every title on paper, link hover, the punchline's picked-out words and the index numbers on light tiles. It reads at 5.3:1 on paper.

### Neutral
- **Warm Paper** (paper): the page background on every public page.
- **Cream** (cream): the soft light tile, with a hairline inset ring (#e9e6df) so it holds its edge on paper.
- **White** (white): the header card, form cards and plain content tiles.
- **Body Ink** (body-ink): long reading text on paper (page intros, body copy, the home lede).
- **Muted** (muted): small secondary text (the logo's tagline, menu notes, empty states).
- **Hairline** (rgba(22, 22, 44, .08)) and **Rule** (rgba(22, 22, 44, .16)): the ring round white surfaces and the dividing lines under page heads and between list rows.

### Named Rules
**The Gold Ink Rule.** Gold type on paper or white is always Gold Ink (#7d6130); Festival Gold (#c9a463) is a fill, or type on navy only. Festival Gold on paper fails contrast.

**The Brand Pair Rule.** Navy and gold are the only chromatic colours. Every other surface is paper, cream or white. Confetti is drawn from the same five colours (gold, gold light, navy, raised navy, cream).

**The Dark Ground Logo Rule.** The round badge always sits on black or dark navy, never straight on paper or white; in the header it sits in a black circle.

## Typography

**Display Font:** Archivo (variable weight 100 to 900 and width 62% to 125%, self-hosted), with Arial Black, Impact
**Body Font:** Inter (variable, with its italic, self-hosted), with system-ui

**Character:** Archivo at 900, uppercase and tightly tracked, is a poster voice: loud, compact, sporty. A 1.1px stroke in the type's own colour makes the big titles heavier still. Inter is the calm reading voice next to it, and its italic carries the one line of personality under the home title.

### Hierarchy
- **Display** (900, 72px on the 1280 x 800 home canvas, scaled down for long names; 0.94; -0.06em; uppercase; 1.1px stroke): the academy's name on the home page, one word per line, with the last word on a navy tile in gold.
- **Headline** (900, clamp(52px, 7.4vw, 104px), 0.94, -0.055em, uppercase, 1.1px stroke): inner page heads. The final word drops to its own line in Gold Ink.
- **Title** (900, clamp(34px, 4.2vw, 60px), 0.95, -0.05em, uppercase): section headings, again in two voices.
- **Title Small** (900, clamp(24px, 2.3vw, 34px), 1, width 88%, -0.035em, uppercase): headings inside tiles. The same face at 85% width, sized to the tile (up to 34px), sets the facts on home tiles.
- **Figure** (900, clamp(64px, 7vw, 104px), 0.85, -0.06em, tabular): big numbers such as class times, prices and attendance totals. They count up into view.
- **Menu** (800, 24px, 1.1, width 88%, -0.02em, uppercase): the links in the open menu panel.
- **Index** (800, 13px, +0.06em): tile numbering such as "01" or "A1 · Thursday · 7:30pm", in Gold Ink on light tiles and gold on dark ones.
- **Punchline** (Inter italic 600, 20px, 1.3): the line under the home title; picked-out words go to 800 in Gold Ink.
- **Lead** (400, 19px, 1.45, max 36ch): page-head introductions. Home lede is 18px.
- **Body** (400, 17px, 1.6, max 60ch): reading text inside tiles and sections.
- **Label** (600, 15px): header links and the menu button. Buttons are Inter 700 16px.

### Named Rules
**The Two Voices Rule.** Every big title splits into ink and gold: everything but the last word in ink, the last word in gold (Gold Ink on paper, Festival Gold on navy). On the home page, the last word moves onto its own navy tile.

**The Uppercase Display Rule.** Archivo is always uppercase and always tracked negative at heading sizes. Inter is never uppercase, except for the logo's small tagline and the footer column headings.

## Layout

**The page is paper with an edge.** The header and footer sit in from the screen edges by the edge gutter (clamp(16px, 3.2vw, 40px)). Content sits in from them by the page gutter (clamp(20px, 4.4vw, 86px)). Sections are bands with 40px vertical padding, holding tile grids in two, three or four columns with a 13px gap. At 960px, three- and four-column grids drop to two. At 620px, everything drops to one column except the four-column photo grid, which keeps two with an 8px gap.

**Inner page heads** are a two-column grid (1.25fr title, 1fr intro and actions), aligned to the bottom over a rule line, and they stack at 960px. Photo walls use a staggered grid, with columns pushed down by 60px, 24px and 90px so the gallery echoes the drifting wall.

**The home page fits one screen on every device** and never scrolls. It picks one of five layouts from the screen's shape:
- **desk:** a fixed 1280 x 800 canvas, scaled to fill. The name is at left, three drifting columns at right, and up to three extra columns fill very wide screens.
- **tab-l (landscape tablets):** the same canvas. The links move into the menu.
- **tab-p (portrait tablets):** header, then the name, then a band of tiles below.
- **mob (phones):** the name first, the tiles fill what is left. Tiles get a 16px radius and an 8px gap.
- **mob-l (landscape phones):** the name at left, the tiles in a column at right.

Tiles keep a fixed ratio (column width x 1.376). Neighbouring tiles never repeat a photo.

## Elevation & Depth

The system is flat and tonal. Tiles sit on paper with no drop shadow. Light tiles hold their edge with a 1px hairline ring, and dark tiles with a faint white inset ring. Depth and material come from the grain: a fractal-noise texture on every solid tile, multiplied at 13% on light tiles and screened at 3.5% on dark ones.

### Shadow Vocabulary
- **Floating card** (`box-shadow: 0 0 0 1px rgba(22,22,44,.08), 0 16px 36px -24px rgba(22,22,44,.30)`): the header card only, which floats over the page as it scrolls.
- **Control lift** (`box-shadow: 0 0 0 1px rgba(22,22,44,.08), 0 8px 20px -10px rgba(22,22,44,.45)`): the round pause button over the tile wall.
- **Hairline ring** (`box-shadow: 0 0 0 1px rgba(22,22,44,.08)`): white tiles and cards.
- **Inset ring** (`box-shadow: inset 0 0 0 1px rgba(255,255,255,.14)` on navy, `inset 0 0 0 1px #e9e6df` on cream): tile edges.

### Named Rules
**The Grain Stays Rule.** Every solid tile carries the grain overlay. It is part of the material, by the owner's decision; do not remove it or swap it for a gradient.

**The Two Floaters Rule.** Only things that float over moving or scrolling content (the header card, the pause button) cast a shadow. Tiles never do.

## Shapes

Soft, generous corners everywhere, and circles for icon controls. Tiles, the header card's lower corners, the footer's upper corners, the main pills and dialogs all use the 22px tile radius. The navy tile behind the home title's last word is 18px (14px on phones), and so is the ticker strip. Shared buttons and notices are 16px, fields and toasts 14px. Phone tiles drop to 16px. Round controls (pin button, call button, pause button, the small arrow circles, the logo badge) are full circles. The header card is a tab hanging from the top of the screen (square top, rounded bottom), and the footer is its mirror rising from the bottom. There are no square corners on any public surface.

## Components

### Buttons
Big, soft and confident: a tall pill and a round partner beside it.
- **Shape:** 63px tall, gently rounded (22px), min 116px wide; on phones 54px tall at 18px radius.
- **Primary:** ink fill, white Inter 700 16px, 26px side padding; hover deepens to #26264a.
- **Gold / Light:** the gold pill (ink text, hover #d8b678) and the light pill (white with a 1.5px ink inset ring, hover #f1efe8), used for Call us on phones.
- **Round partner:** a 64px ink circle with a gold icon (54px on phones), set 4px from its pill, e.g. Get directions plus the map pin.
- **Go link:** bold ink text with a 32px ink arrow circle, set 18 to 22px after the pill pair (e.g. Timetable).
- **Press:** every pill and circle scales to 0.97 over 160ms on the ease-out curve, and a ripple spreads from the press point (currentColor at 22%, 560ms).
- **Shimmer:** Get directions on the home page carries a gold light sweep across its face, every 4.2s after a 2.2s wait.

### Header card
A white floating card, sticky at the top, inset by the edge gutter. It holds the round badge on black, the name in Archivo 900 31px at 85% width with a small uppercase Inter tagline, then the links (15px 600), a hairline separator, the menu button with a three-line burger that turns into a cross, and the Get directions pill pair. The current page is underlined in gold (2px, 6px offset). At 960px the links and pills give way to a round call button, and at 620px the card is 68px tall. On the home page the header joins the canvas and slides down on entrance.

### Menu panel
It opens inside the header card by growing its row (260ms ease-out). Links are Menu-style uppercase Archivo in two columns with hairline rules and small muted notes at right. A contact column on the right holds the phone number, a note and Instagram. Items cascade in 30ms apart.

### Tiles
The single content container of the system.
- **Corner Style:** 22px, clipped, isolated.
- **Background:** gold, navy, raised navy, midnight, cream or white. Inner pages cycle gold, midnight, cream for lists of values or perks.
- **Shadow Strategy:** none; hairline or inset rings plus grain (see Elevation & Depth).
- **Internal Padding:** clamp(22px, 2.6vw, 36px), 12px gap.
- **Contents:** an index number, a Title Small heading, body text, or a big Figure. Photo tiles fill the tile on a midnight ground. Map tiles fill it with the embedded map.

### Inputs / Fields
- **Style:** white, 1.5px #d9d7cf stroke, 14px radius, 16px Inter, 13px 15px padding, labels in Inter 600 ink. Forms sit in a white form card on paper.
- **Consent:** a rule line, then an uppercase Archivo legend at 20px. Checkboxes take an ink accent.
- **Focus:** a 2px ink outline at a 3px offset, switching to gold on navy tiles, the footer and the pass card.

### Ticker strip
A gold rounded band (18px) above the footer on every page but home. The class's facts (day, time, address, price, ages) repeat in Archivo 900 20px uppercase, scrolling left over 48s with faded ends. It pauses on hover, and shows one static line under reduced motion.

### Footer
Academy Navy with rounded top corners, in four columns (two at 960px, one at 620px). The name is set in two voices at 44px, with the second half in gold. Column headings are small uppercase gold Inter. Links are white and turn gold on hover. A base row holds the copyright and the privacy link.

### Home title and tile wall (signature)
The name in Display type, one word per line, each line rising in on a 1000ms expo curve, 85ms apart. The last word sits on an 18px navy tile with gold type and a 2px conic gold shine border, rotating every 6s. Beside it, columns of tiles (a mix of photo, colour and fact tiles) drift in alternating directions on a 14.6s linear loop, gliding in from off-screen and handing over to the drift at 2.1s. One tile rotates its words every 2.6s (blur out, slide up, blur in). A round pause button sits at the wall's bottom right. The drift also pauses on hover with a fine pointer, and stops entirely under reduced motion.

### Effects
- **Blur fade:** content below the fold softens in from an 8px blur and 14px down (600 to 700ms, staggered 70ms).
- **Number ticker:** big figures count up over 1.1s with a quartic ease-out.
- **Confetti:** a 1.6s burst of 110 gold and navy pieces from the button, when sign-up succeeds or a message is sent.

## Do's and Don'ts

### Do:
- **Do** build every content block as a 22px tile in one of the six tones, on warm paper.
- **Do** set titles in Archivo 900 uppercase with negative tracking, and split them into two voices (ink, then the last word in gold).
- **Do** use Gold Ink (#7d6130) for any gold type on paper or white, and Festival Gold (#c9a463) only as a fill or as type on navy.
- **Do** keep the grain overlay on solid tiles.
- **Do** pair the main pill with its 64px round partner and keep tap targets at least 44px.
- **Do** switch every effect off under reduced motion, and give any loop longer than five seconds a pause control.
- **Do** let real photos from Instagram fill the photo tiles, on a midnight ground.

### Don't:
- **Don't** use clichéd "Indian" decoration: generic paisley, mandalas or Bollywood clip-art.
- **Don't** make a quiet, plain page with no sense of Bhangra's energy.
- **Don't** put the round badge straight on paper or white; it sits on black or dark navy.
- **Don't** add drop shadows to tiles, or hard offset shadows anywhere; only the header card and the pause button float.
- **Don't** use square corners on public surfaces.
- **Don't** introduce chromatic colours beyond navy and gold.
