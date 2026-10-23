'use strict';

// Starting content for the public site. Every value here can be changed from
// the admin page (Admin → Content); this is only used until the first save.
module.exports = {
  site: {
    name: 'London Academy of Bhangra',
    shortName: 'LAB',
    tagline: 'Authentic Punjabi dance for all ages and abilities in East London',
    logo: '/img/logo.png',
    primaryColor: '#2f2f52',
    accentColor: '#a2895c',
    headingFont: 'Poppins',
    bodyFont: 'Poppins',
    email: '',
    // Who to phone. The Call button offers each of them.
    contacts: [
      { name: 'Ravi', phone: '07851 564285' },
      { name: 'Gurdeep', phone: '07538 687118' },
    ],
    address: 'The Royal Liberty School, Gidea Park, RM2 6HJ',
    mapQuery: 'The Royal Liberty School, Gidea Park, RM2 6HJ',
    socials: {
      instagram: 'https://www.instagram.com/londonacademyofbhangra/',
      facebook: '',
      tiktok: '',
      youtube: '',
    },
    footerText: 'Keeping the spirit of Bhangra alive in London.',
    footerExploreTitle: 'Explore',
    footerContactTitle: 'Get in touch',
    copyrightText: '',
    loginButtonLabel: 'Member login',
    accountButtonLabel: 'My account',
  },

  nav: [
    { id: 'home', label: 'Home', visible: true },
    { id: 'about', label: 'About', visible: true },
    { id: 'timetable', label: 'Timetable', visible: true },
    { id: 'pricing', label: 'Pricing', visible: true },
    { id: 'gallery', label: 'Gallery', visible: true },
    { id: 'contact', label: 'Contact', visible: true },
  ],

  home: {
    announcement: { enabled: true, text: 'New term starting soon. Beginners always welcome, no experience needed!' },
    heroEyebrow: 'LAB · East London',
    heroTitle: 'London Academy of Bhangra',
    heroTagline: 'Bringing bhangra from the **pind** to the **people**',
    heroSubtitle: 'Authentic Punjabi folk dance for kids and adults together, every **Thursday at 7:30pm** at The Royal Liberty School, Gidea Park. £7 a class. No booking, just turn up.',
    heroImage: '',
    showHeroLogo: true,
    heroLayout: 'centred',
    logoAnimation: 'shine',
    heroButtons: [
      { label: 'View timetable', link: '/timetable', style: 'Gold' },
      { label: 'Member login', link: '/login', style: 'White' },
    ],
    showHighlights: true,
    highlights: [
      { icon: '🥁', title: 'Authentic heritage', text: 'Traditional Punjabi folk dance and props, taught by experienced performers from the UK Bhangra scene.' },
      { icon: '👨‍👩‍👧', title: 'Family & community', text: 'Whole families dance together in a friendly class where everyone belongs.' },
      { icon: '🏆', title: 'Perform', text: 'Get the chance to perform at events, shows and competitions with the academy team.' },
    ],
    showIntro: true,
    introEyebrow: 'Welcome',
    introTitle: 'Dance, fitness and culture',
    introText: 'Bhangra is high-energy, joyful and great for fitness. At the London Academy of Bhangra you will learn authentic moves, build confidence and become part of a welcoming community.\n\nNo partner or experience needed. Just bring water, comfortable clothes and lots of energy!',
    introImage: '',
    introButtons: [
      { label: 'About the academy', link: '/about', style: 'Navy' },
      { label: 'See pricing', link: '/pricing', style: 'Outline' },
    ],
    classesCardTitle: 'Weekly classes',
    classesCardButton: 'Full timetable',
    tileWords: ['Kids & adults', 'All abilities', 'Whole families', 'Perform on stage'],
    showInstagram: true,
    instagramEyebrow: 'Instagram',
    instagramTitle: 'Latest from the academy',
    instagramPostCount: 6,
    instagramButton: 'View gallery',
    showCta: true,
    ctaTitle: 'Ready to dance?',
    ctaText: 'Come along on Thursday. Beginners are always welcome.',
    ctaButtons: [
      { label: 'See the timetable', link: '/timetable', style: 'White' },
      { label: 'Contact us', link: '/contact', style: 'Navy' },
    ],
  },

  about: {
    title: 'About us',
    intro: 'The London Academy of Bhangra (LAB) teaches authentic Punjabi folk dance to all ages and abilities in East London.',
    story: 'LAB was founded to share the energy, history and joy of Bhangra with the next generation. Our classes combine traditional technique with performance experience, giving students the confidence to dance on any stage.\n\nWe are proud to be part of the UK Bhangra scene and to support charity events throughout the year.',
    storyEyebrow: 'Our story',
    image: '',
    teamEyebrow: 'The team',
    teamTitle: 'Meet the team',
    founders: [
      { name: 'Ravi', role: 'Co-founder & Instructor', bio: 'A highly skilled Bhangra dancer, prominent in the UK Bhangra scene.', image: '' },
      { name: 'Gurdeep', role: 'Co-founder & Instructor', bio: 'A highly skilled Bhangra dancer, prominent in the UK Bhangra scene.', image: '' },
    ],
    valuesTitle: 'What we stand for',
    values: [
      { title: 'Authenticity', text: 'Traditional Punjabi folk dance taught with respect for its roots.' },
      { title: 'Inclusivity', text: 'Classes for every age, background and level of experience.' },
      { title: 'Community', text: 'A friendly, family atmosphere where everyone belongs.' },
    ],
  },

  timetable: {
    title: 'Timetable',
    intro: 'Weekly Bhangra classes for kids and adults. Just turn up, or get in touch if you have any questions.',
    classes: [
      { day: 'Thursday', name: 'Bhangra', level: 'Mixed abilities', start: '19:30', end: '20:30', ages: 'Kids & adults', location: 'The Royal Liberty School, Gidea Park, RM2 6HJ', notes: '' },
    ],
    venueTitle: 'Getting here',
    venueText: 'The Royal Liberty School, Gidea Park, RM2 6HJ.\nNearest station: Gidea Park (about a 9 minute walk).',
    showMap: true,
    venueButton: { label: 'Questions? Contact us', link: '/contact' },
    emptyText: 'The timetable will be published soon.',
    notes: 'Please arrive 5 to 10 minutes early. Wear comfortable clothes and trainers, and bring a bottle of water.',
  },

  pricing: {
    title: 'Pricing',
    intro: 'Simple, flexible pricing. No contracts and no joining fee.',
    plans: [
      { name: 'Drop-in', price: '£7', period: 'per class', description: 'Pay as you go, no commitment.', features: ['Any single class', 'Perfect for trying us out'], highlight: false },
      { name: 'Monthly unlimited', price: 'Ask us', period: 'per month', description: 'The best value for regular dancers.', features: ['Unlimited classes', 'Priority for performances'], highlight: true },
      { name: 'Private lessons', price: 'Ask us', period: 'per session', description: 'One-to-one or group tuition, e.g. wedding dances.', features: ['Choreography to your song', 'Flexible times'], highlight: false },
    ],
    highlightBadge: 'Most popular',
    // A short line shown with the price around the site, e.g. in the menu.
    payment: 'Cash or card',
    // Members can pay for a class date online through this link (leave blank to turn it off).
    payLink: 'https://monzo.com/pay/r/london-academy-of-bhangra_HF8dxahnyoRKtg',
    payAmount: '£7',
    notes: 'Pay at the class by cash or card, or online for a chosen class from your account. Class payments are not transferable: if you miss the class, the payment can\'t be moved to another date or refunded.',
    ctaButton: { label: 'Ask about private lessons', link: '/contact' },
  },

  gallery: {
    title: 'Gallery',
    intro: 'Our latest posts from Instagram.',
    instagramUsername: 'londonacademyofbhangra',
    maxPosts: 12,
    followButton: 'Follow on Instagram',
    emptyText: 'See our latest photos and videos on Instagram.',
    extraTitle: 'More photos',
    extraImages: [],
  },

  contact: {
    title: 'Contact us',
    intro: 'Have a question about classes, performances or private lessons? Get in touch. We would love to hear from you.',
    detailsTitle: 'Find us',
    showMap: true,
    formEnabled: true,
    formTitle: 'Send a message',
    formIntro: 'Send us a message and we will get back to you as soon as possible.',
    submitLabel: 'Send message',
    successMessage: 'Thanks! Your message has been sent.',
  },

  members: {
    allowRegistration: true,
    loginTitle: 'Member login',
    loginIntro: 'Log in to see your member QR code and class attendance.',
    forgotPasswordText: 'Forgotten your password? Ask a teacher at your next class to reset it.',
    registerTitle: 'Create your account',
    registerIntro: 'You will get a unique member ID and QR code to scan in at every class.',
    bioPrompt: 'Tell us a little about yourself, e.g. your dance experience or what you would like to learn.',
    registrationClosedText: 'Online registration is currently closed. Please speak to a teacher at your next class and they will set up your account.',
    qrHint: 'Show this code to your teacher at the start of each class.',
    welcomeMessage: 'Welcome! Your member ID is shown below.',
    privacyCheckboxText: 'I have read and agree to the Privacy Policy.',
    guardianConsentText: 'I am the parent or guardian of this child. I give my consent for the London Academy of Bhangra to create this account and use their information as described in the Privacy Policy.',
    consentPageIntro: 'Before you continue, please read and accept our Privacy Policy.',
  },

  privacy: {
    title: 'Privacy policy',
    // Change the version whenever the policy changes in a way people should
    // agree to again. Everyone is then asked to accept it at their next login.
    version: '2026-10',
    lastUpdated: '12 October 2026',
    intro: 'How the London Academy of Bhangra collects, uses and protects your information, including information about children.',
    body: `## Who we are

The London Academy of Bhangra ("LAB", "we", "us") runs Bhangra dance classes in East London. We are responsible for the personal information described in this policy. If you have any questions, contact us using the details on our [Contact page](/contact) or speak to a teacher at class.

## What information we collect

When you create an account or attend classes we collect:

- **Account details:** your name, email address, phone number (optional), password (stored in encrypted form so nobody can read it) and the short bio you choose to write.
- **Your member ID and QR code**, which we use to register you at classes.
- **Attendance records:** which classes you attended and when, and which teacher checked you in.
- **Payment records:** which classes you paid for, how (online, cash or card), the payment reference, and whether an online payment was received. We never see or store your card or bank details: online payments are made on Monzo's own secure page.
- **For members under 16:** the name, email address and phone number of a parent or guardian, and a record of their consent.
- **Your privacy choices:** which version of this policy you accepted and when.
- **Messages** you send us through the contact form.

Teachers also record class debriefs (who ran the class, the number of attendees, the class cash balance and general feedback). Debriefs do not list individual students.

We do not collect payment card details, and we do not ask for sensitive information such as health details through the website. If you tell a teacher about a medical condition so they can keep you safe, we will only use it for that purpose.

## How we use your information

We use your information to:

- create and manage your membership account;
- register attendance at classes and show you your attendance history;
- contact you, or your parent or guardian, about classes, changes and safety;
- keep accurate records of classes, attendance and money collected;
- keep our classes and website safe and secure;
- reply to messages you send us.

We do **not** sell your information, use it for advertising or share it with other organisations for their marketing.

## Our legal reasons for using your information

Under UK data protection law (the UK GDPR and the Data Protection Act 2018) we rely on:

- **Contract:** to provide the classes and membership you have signed up for.
- **Legitimate interests:** to keep attendance and class records, run the academy safely and protect our website.
- **Consent:** for members under 16, we rely on the consent of a parent or guardian. You can withdraw consent at any time.
- **Legal obligation:** to keep financial records where the law requires it.

## Children under 16

We welcome dancers of all ages, and we take extra care with children's information.

- A child under 16 can only have an account if a **parent or guardian** creates it or gives their consent during sign-up. We ask for the parent or guardian's name and contact details.
- We only collect the information we need to run classes and keep children safe. We use it only for that purpose.
- We contact the parent or guardian about anything important to do with the child's membership.
- Children's information is only seen by LAB teachers and administrators. It is never published on our website or social media.
- We will **always ask separately** before posting photos or videos in which a child can be identified, and we will respect any request to remove them.
- A parent or guardian can ask to see, correct or delete their child's information at any time.

If we find that a child under 16 has created an account without a parent or guardian's consent, we will suspend the account and contact them, or delete it.

## Who can see your information

- **LAB teachers** can see members' names, member IDs, contact details, bios and attendance so they can run classes.
- **LAB administrators** can see and manage all account information.
- **Our website and database providers** (Render and Supabase) store the information on secure servers in the UK or European Economic Area. They are only allowed to use it to provide their service to us.

We will only share information with anyone else if the law requires it (for example, with the police or a court), or to protect someone's safety.

## Other services our website uses

- **Instagram:** our Gallery page shows posts from the academy's own Instagram account. We do not send any member information to Instagram.
- **Google Maps:** our Timetable and Contact pages show a map from Google. Google will receive your device's IP address when the map loads, under Google's own privacy policy.

## Cookies

We use one essential cookie to keep you logged in. It does not track you and is not used for advertising. We do not use analytics or advertising cookies.

## Visitor statistics

To see how the website is used, we count page visits: which pages are viewed, for how long, which main buttons are pressed (such as "Get directions"), the website or app a visitor came from, and whether they are on a phone, tablet or computer. This is done **without cookies** and nothing is stored on your device. We do not keep your IP address or any details that identify you: each visitor is counted using a scrambled code that changes every day, so nobody can be followed from one day to the next. If your browser is set to "do not track" or Global Privacy Control, you are not counted. The figures are only seen by LAB administrators and are deleted after 13 months. We rely on our legitimate interest in understanding how the website is used so we can improve it.

## How long we keep your information

- **Account and attendance records:** while you are a member. If an account has not been used for two years, we will delete it or remove the personal details.
- **Parent or guardian consent records:** for as long as the child's account exists.
- **Class debriefs and financial records:** up to six years, to meet record-keeping requirements.
- **Contact form messages:** up to 12 months.

You can delete your account yourself at any time from **My account**.

## Your rights

You have the right to:

- **access** your information. You can download it from **My account → Download my data**;
- **correct** information that is wrong;
- **delete** your account and information;
- **object to** or **restrict** how we use your information;
- **withdraw consent** where we rely on it.

To use any of these rights, contact us or speak to a teacher. We will respond within one month. A parent or guardian can use these rights for a child under 16.

If you are unhappy with how we have handled your information, please tell us first so we can put it right. You also have the right to complain to the Information Commissioner's Office (ICO) at [ico.org.uk](https://ico.org.uk).

## Keeping your information safe

Passwords are encrypted, the website uses a secure (https) connection, and only teachers and administrators can see member information. Please keep your password private.

## Changes to this policy

If we make important changes, we will update the version and date at the top of this page. We will ask you to read and accept the new policy the next time you log in.`,
  },

  customPages: [],
};
