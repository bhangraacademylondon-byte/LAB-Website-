'use strict';

// Starting content for the public site. Every value here can be changed from
// the admin page (Admin → Content); this is only used until the first save.
module.exports = {
  site: {
    name: 'London Academy of Bhangra',
    shortName: 'LAB',
    tagline: 'Authentic Punjabi dance for all ages and abilities in East London',
    logo: '/img/logo-dark.png',
    primaryColor: '#2f2f52',
    accentColor: '#a2895c',
    email: '',
    phones: ['07851 564285', '07538 687118'],
    address: 'The Royal Liberty School, Gidea Park, RM2 6HJ',
    mapQuery: 'The Royal Liberty School, Gidea Park, RM2 6HJ',
    socials: {
      instagram: 'https://www.instagram.com/londonacademyofbhangra/',
      facebook: '',
      tiktok: '',
      youtube: '',
    },
    footerText: 'Keeping the spirit of Bhangra alive in London.',
    allowRegistration: true,
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
    heroTitle: 'London Academy of Bhangra',
    heroSubtitle: 'Authentic Punjabi dance classes for kids and adults in East London. Every Thursday at The Royal Liberty School, Gidea Park.',
    heroImage: '',
    ctaPrimary: { label: 'View timetable', link: '/timetable' },
    ctaSecondary: { label: 'Member login', link: '/login' },
    highlights: [
      { icon: '💃', title: 'All abilities', text: 'Beginner, intermediate and advanced classes. Complete beginners are always welcome.' },
      { icon: '👨‍👩‍👧', title: 'Kids & adults', text: 'Dedicated sessions for children and for adults, so everyone learns at the right pace.' },
      { icon: '🥁', title: 'Authentic Bhangra', text: 'Learn traditional Punjabi folk dance with props, from experienced performers.' },
      { icon: '🏆', title: 'Perform', text: 'Get the chance to perform at events, shows and competitions with the academy team.' },
    ],
    introTitle: 'Dance, fitness and culture',
    introText: 'Bhangra is high-energy, joyful and great for fitness. At the London Academy of Bhangra you will learn authentic moves, build confidence and become part of a welcoming community.\n\nNo partner or experience needed. Just bring water, comfortable clothes and lots of energy!',
    introImage: '',
  },

  about: {
    title: 'About us',
    intro: 'The London Academy of Bhangra (LAB) teaches authentic Punjabi folk dance to all ages and abilities in East London.',
    story: 'LAB was founded to share the energy, history and joy of Bhangra with the next generation. Our classes combine traditional technique with performance experience, giving students the confidence to dance on any stage.\n\nWe are proud to be part of the UK Bhangra scene and to support charity events throughout the year.',
    image: '',
    founders: [
      { name: 'Ravi', role: 'Co-founder & Instructor', bio: 'A highly skilled Bhangra dancer, prominent in the UK Bhangra scene.', image: '' },
      { name: 'Gurdeep', role: 'Co-founder & Instructor', bio: 'A highly skilled Bhangra dancer, prominent in the UK Bhangra scene.', image: '' },
    ],
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
      { day: 'Thursday', name: 'Kids Bhangra', level: 'All levels', start: '18:30', end: '19:15', ages: 'Children', location: 'The Royal Liberty School, Gidea Park, RM2 6HJ', notes: '' },
      { day: 'Thursday', name: 'Adults Bhangra', level: 'All levels', start: '19:30', end: '20:30', ages: 'Adults', location: 'The Royal Liberty School, Gidea Park, RM2 6HJ', notes: '' },
    ],
    venueTitle: 'Getting here',
    venueText: 'The Royal Liberty School, Gidea Park, RM2 6HJ.\nNearest station: Gidea Park (about a 9 minute walk).',
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
    notes: 'Payment is cash only at the class.',
  },

  gallery: {
    title: 'Gallery',
    intro: 'Our latest posts from Instagram.',
    instagramUsername: 'londonacademyofbhangra',
    maxPosts: 12,
    extraImages: [],
  },

  contact: {
    title: 'Contact us',
    intro: 'Have a question about classes, performances or private lessons? Get in touch. We would love to hear from you.',
    formEnabled: true,
    formIntro: 'Send us a message and we will get back to you as soon as possible.',
  },

  customPages: [],
};
