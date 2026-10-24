'use strict';

// Starting content for the public site. Every value here can be changed from
// the admin page (Admin → Content); this is only used until the first save.
// The team's own bios, from their Instagram introductions.
const RAVI = {
  name: 'Ravi',
  role: 'Co-founder & Instructor',
  bio: 'Ravi is a co-founder of the LAB and a well-known name on the UK bhangra scene. Since starting in 2016 he has competed in 13 competitions, in both music and live bhangra. As co-captain of KCL Bhangra he helped lead the team to victory at The Bhangra Showdown 2019, and more recently he won 1st place with Vasda Panjab at Groundshaker and Back 2 Roots 2024 in Canada, having competed in every one of their live competitions. Known for nurturing new dancers, Ravi has worked alongside some of the scene\'s finest choreographers and performers. Together with Gurdeep, he\'s building the LAB into a home for bhangra in East London, where passion, skill and tradition come together to inspire the next generation of dancers.',
  image: '/img/team-ravi.webp',
};

const GURDEEP = {
  name: 'Gurdeep',
  role: 'Co-founder & Instructor',
  bio: 'Gurdeep is a co-founder of the LAB and one of the UK\'s most decorated bhangra dancers. Dancing since the age of 11, he trained under some of the UK\'s most senior bhangra figures. He\'s a three-time Bhangra Showdown champion with Aston University (2018, 2020 and 2022), and won Best Male at The Bhangra Showdown 2022 and at Groundshaker Bhangra 2024 in Toronto. He also took 1st place with Gabru Chel Chabileh at Bhangra Fest 2018, and back-to-back titles with Vasda Panjab at Back 2 Roots and Groundshaker 2024. With 6 wins from 10 competitions, he has proven himself on stage time and again. Together with Ravi, Gurdeep wants to share his passion with the next generation and make the LAB London\'s leading home for bhangra training and performance.',
  image: '/img/team-gurdeep.webp',
};

const AMAN = {
  name: 'Aman',
  role: 'Lead Instructor & Team Captain',
  bio: 'Aman, one of the UK\'s best female bhangra dancers, has been a key part of the LAB since we started in January 2025. She began dancing in 2022 and worked her way up, competing twice at TBS with QMUL and winning Best Female as captain in 2025. She\'s danced at national level with Furteley Girls at World Class Bhangra 2023, and with Heeran, who came 3rd at Bhangra Beatdown 2024. As our team captain she led the LAB to 1st place at Bhangra Virsa 2025, taking Best Female once again. Confident, kind and full of stage experience, Aman is now leading the next generation of LAB dancers.',
  image: '/img/team-aman.webp',
};

const SIMRIT = {
  name: 'Simrit',
  role: 'Instructor',
  bio: 'Simrit has been with the LAB since our very first class in January 2025. Since then she\'s danced on stage at UCL Rangeela and at Bhangra Virsa 2026 with Sanjha Panjab, choreographed and led classes, and helped run our social media. Her love for bhangra and her dedication make her a brilliant LAB instructor.',
  image: '/img/team-simrit.webp',
};

module.exports = {
  site: {
    name: 'London Academy of Bhangra',
    shortName: 'LAB',
    tagline: 'Authentic Punjabi dance for all ages and abilities in East London',
    logo: '/img/logo-mark.webp',
    primaryColor: '#2f2f52',
    accentColor: '#a2895c',
    headingFont: 'Poppins',
    bodyFont: 'Poppins',
    email: '',
    // The number people message on WhatsApp (leave blank to hide the WhatsApp buttons).
    whatsapp: '07851 564285',
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
    { id: 'faq', label: 'FAQs', visible: true },
    { id: 'gallery', label: 'Gallery', visible: true },
    { id: 'performances', label: 'Performances', visible: true },
    { id: 'workshops', label: 'Workshops', visible: true },
    { id: 'contact', label: 'Contact us', visible: true },
  ],

  home: {
    announcement: { enabled: true, text: 'New term starting soon. Beginners always welcome, no experience needed!' },
    heroTitle: 'London Academy of Bhangra',
    heroTagline: 'Bringing bhangra from the **pind** to the **people**',
    heroSubtitle: 'Authentic Punjabi folk dance for kids and adults together, every **Thursday at 7:30pm** at The Royal Liberty School, Gidea Park. £7 a class. No booking, just turn up.',
    tileWords: ['Kids & adults', 'All abilities', 'Whole families', 'Perform on stage'],
    showInstagram: true,
    instagramPostCount: 6,
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
      RAVI,
      GURDEEP,
      AMAN,
      SIMRIT,
    ],
    valuesTitle: 'What we stand for',
    values: [
      { title: 'Authenticity', text: 'Traditional Punjabi folk dance taught with respect for its roots.' },
      { title: 'Inclusivity', text: 'Classes for every age, background and level of experience.' },
      { title: 'Community', text: 'A friendly, family atmosphere where everyone belongs.' },
    ],
  },

  // Questions newcomers ask, answered on the FAQs page.
  faq: {
    title: 'Your questions answered',
    intro: 'Everything you need to know before your first class. Can\'t see your question? Send us a message.',
    items: [
      { question: 'Do I need to book?', answer: 'No, just turn up! Classes are every Thursday at 7:30pm at The Royal Liberty School, Gidea Park. Arrive 5 to 10 minutes early on your first night so we can say hello.' },
      { question: 'I\'ve never danced before. Can I still come?', answer: 'Absolutely. Our classes are for all abilities and we break every step down. Lots of our dancers had never tried bhangra before their first class.' },
      { question: 'How old do you have to be?', answer: 'There\'s no minimum age! Our Thursday class is for kids and adults together, so it\'s perfect for families. We do ask that all under 16s are supervised by a parent or guardian, who will also need to sign them up.' },
      { question: 'Can parents join in or watch?', answer: 'Parents and guardians are welcome to stay and watch for free. Better still, why not join in? It\'s a great way to have fun together, and it\'s £7 a class for anyone dancing.' },
      { question: 'What should I wear?', answer: 'Comfortable clothes you can move in and trainers. Bring a bottle of water, as it\'s a workout!' },
      { question: 'How much does it cost?', answer: '£7 a class, paid by cash or card on the night. Members can also pay online for a chosen class from their account. Online payments are for that date only and can\'t be moved if you miss the class.' },
      { question: 'Do I need to sign up before my first class?', answer: 'No. Come along first, and if you enjoy it, join the LAB to get your member pass: a QR code we scan to check you in each week.' },
      { question: 'Is there parking?', answer: 'Yes, there\'s plenty of free parking at the school. Coming by train? Gidea Park station is about a 9 minute walk away.' },
      { question: 'Do you perform at events or run workshops?', answer: 'Yes! We perform at weddings, parties, festivals and work events, and run workshops for schools, workplaces and groups. Have a look at our Performances and Workshops pages.' },
      { question: 'Does the academy compete?', answer: 'Yes, we do! Our team competes nationally and internationally. Come and talk to us in person at a Thursday class to find out more.' },
    ],
    ctaTitle: 'Still have a question?',
    ctaText: 'Message us on WhatsApp or send us a message, and we\'ll get back to you.',
  },

  // Booking pages for performances and workshops. Photos are added in Admin.
  performances: {
    title: 'Book a performance',
    tagline: 'Bring the energy of bhangra to your event',
    heroImage: '',
    introTitle: 'Make your event unforgettable',
    intro: 'We love performing, and there\'s nothing like watching a room come alive when the bhangra starts! Our dancers arrive in full traditional Punjabi outfits, props and all, ready to get your guests clapping, cheering and up on their feet.\n\nPerformances usually last around 10 minutes, and we can bring anything from 2 to 16 dancers. Every event is different, so tell us what you have in mind and we\'ll put together a performance that fits. Get in touch and let\'s give your guests something to talk about for years!',
    listTitle: 'Book us for',
    items: ['Weddings and sangeets', 'Birthday parties', 'Festivals and melas', 'Community and council events', 'Corporate events', 'Vaisakhi and Diwali celebrations'],
    facts: [
      { label: 'Length', value: 'Around 10 minutes' },
      { label: 'Dancers', value: '2 to 16' },
      { label: 'Outfits', value: 'Full traditional dress' },
    ],
    featureTitle: 'Corporate events',
    featureSubtitle: 'Planning a staff party? Need a team-building idea? Celebrating Vaisakhi or Diwali at work?',
    featureText: 'We\'d love to bring some bhangra to your workplace! We can open with a performance from our dancers, then teach your team a short routine of their own. It\'s the perfect excuse to step away from the screens and have some fun together.',
    buttonLabel: 'Enquire now',
    buttonLink: '/contact?subject=Performance enquiry',
    galleryTitle: 'Photos from our performances',
    gallery: [{ image: '', caption: '' }],
  },

  workshops: {
    title: 'Bhangra workshops',
    tagline: 'Come and feel the energy',
    heroImage: '',
    introTitle: 'Try bhangra for yourself',
    intro: 'Our workshops are the perfect way to find out what bhangra is all about. It\'s fast, joyful and full of energy, and once the music starts it\'s hard to stand still!\n\nWe\'re passionate about sharing bhangra and Punjabi folk dance with as many people as we can, so every workshop is shaped around your group. We\'ll teach you real steps, tell you a little about where they come from, and by the end you\'ll be dancing a full routine together. No experience needed, just bring your enthusiasm!',
    listTitle: 'Perfect for',
    items: ['Schools and colleges', 'Corporate team building', 'Wedding and sangeet prep', 'Community and youth groups', 'Cultural days and festivals', 'Birthday parties'],
    facts: [
      { label: 'Length', value: 'Tailored to your group' },
      { label: 'Experience', value: 'None needed' },
      { label: 'Where', value: 'We come to you' },
    ],
    featureTitle: 'Workshops for workplaces',
    featureSubtitle: 'Looking for a team activity everyone will actually enjoy?',
    featureText: 'Swap the usual away-day activities for something that gets everyone laughing and moving! Book a workshop on its own, or start with a performance from our dancers and then have your team join in.',
    buttonLabel: 'Enquire now',
    buttonLink: '/contact?subject=Workshop enquiry',
    galleryTitle: 'Photos from our workshops',
    gallery: [{ image: '', caption: '' }],
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
    maxPosts: 8,
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
