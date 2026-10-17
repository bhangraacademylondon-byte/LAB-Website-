'use strict';

// Starter text for the website. Everything here can be changed in the admin
// area; this is only what a brand-new site shows.

module.exports = {
  site: {
    coupleNames: 'Ravi & Akshee',
    eventTitle: 'Engagement Party',
    eventDate: '',
    eventTime: '6:00pm until late',
    accentColor: '#8a6a1f',
    backgroundColor: '#fbf7ef',
    contactText: 'Any questions? Call or message Ravi or Akshee, or email us.',
    contactPhone: '',
    contactEmail: '',
    footerNote: 'With love, Ravi & Akshee',
  },

  home: {
    label: 'Home',
    kicker: 'Together with our families',
    heading: 'Ravi & Akshee',
    subheading: 'are getting engaged',
    intro: 'We would love you to join us to celebrate the start of our next chapter. Please let us know if you can come by replying on the RSVP page.',
    image: '',
    buttonText: 'Reply to your invitation',
    showCountdown: true,
  },

  story: {
    label: 'Our Story',
    visible: true,
    heading: 'Our Story',
    intro: 'How it all began.',
    chapters: [
      { title: 'How we met', when: '', text: 'Tell your guests how you first met.', image: '' },
      { title: 'Our first date', when: '', text: 'Share a favourite memory from the early days.', image: '' },
      { title: 'The proposal', when: '', text: 'Tell everyone how the big question was asked.', image: '' },
    ],
  },

  venue: {
    label: 'Venue',
    visible: true,
    heading: 'The Venue',
    name: 'Venue name',
    address: 'Street address\nTown\nPostcode',
    postcode: '',
    text: 'A few words about the venue: which room we are in, where the entrance is, and anything else that will help on the day.',
    image: '',
    phone: '',
    website: '',
    showMap: true,
  },

  travel: {
    label: 'Getting There',
    visible: true,
    heading: 'Getting There & Parking',
    intro: 'Here is everything you need to find us.',
    sections: [
      { title: 'By car', text: 'Directions, and the postcode to put in your sat nav.' },
      { title: 'Parking', text: 'Where to park, how much it costs, and whether you need to book.' },
      { title: 'By train, tube or bus', text: 'The nearest stations and bus stops, and how long the walk is.' },
      { title: 'Taxis', text: 'Local taxi numbers and the best drop-off point.' },
      { title: 'Step-free access', text: 'Step-free entrance, lifts, accessible toilets and blue badge parking.' },
    ],
  },

  faq: {
    label: 'FAQ',
    visible: true,
    heading: 'Questions & Answers',
    intro: '',
    items: [
      { q: 'What should I wear?', a: 'Tell your guests the dress code, for example Indian formal or smart.' },
      { q: 'What time should I arrive?', a: 'Please arrive by 6:00pm.' },
      { q: 'Are children invited?', a: 'Children named on your invitation are very welcome.' },
      { q: 'Can I bring someone?', a: 'Your RSVP shows everyone included in your invitation. If you have been given extra places, you can add their names when you reply.' },
      { q: 'Will there be food?', a: 'Yes. Please tell us about any dietary requirements when you RSVP.' },
      { q: 'Gifts', a: 'Your presence is the only present we need.' },
      { q: 'I can no longer come. What should I do?', a: 'You can change your reply on the RSVP page until the RSVP deadline. After that, please call or message us.' },
    ],
  },

  rsvp: {
    label: 'RSVP',
    heading: 'RSVP',
    intro: 'Please reply for yourself and everyone on your invitation.',
    open: true,
    deadline: '',
    allowLateReplies: true,
    lookupLabel: 'Your first and last name',
    lookupHelp: 'Type your name as it appears on your invitation, for example: Priya Sharma.',
    notFoundText: "Sorry, we couldn't find that name on our guest list. Please check the spelling, try the name on your invitation, or contact us and we'll help.",
    attendingLabel: 'Coming',
    notAttendingLabel: "Can't come",
    plusOnesText: 'You are welcome to bring guests. Add their full names below.',
    thankYouComing: "Thank you! We can't wait to celebrate with you.",
    thankYouNotComing: "Thank you for letting us know. You'll be missed!",
    closedText: 'The RSVP deadline has passed. If you need to change your reply, please contact us.',
    notOpenText: 'RSVPs are not open yet. Please check back soon.',
    questions: [
      { id: 'dietary', scope: 'guest', type: 'text', label: 'Dietary requirements or allergies', help: 'Leave blank if none.', options: [], required: false },
      { id: 'phone', scope: 'household', type: 'text', label: 'Best phone number to reach you', help: '', options: [], required: false },
      { id: 'message', scope: 'household', type: 'textarea', label: 'A message for Ravi & Akshee', help: 'Optional.', options: [], required: false },
    ],
  },
};
