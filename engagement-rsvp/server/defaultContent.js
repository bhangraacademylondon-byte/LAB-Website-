'use strict';

// Starter text for the website. Everything here can be changed in the admin
// area; this is only what a brand-new site shows.

module.exports = {
  site: {
    coupleNames: 'Ravi & Akshee',
    eventTitle: 'Pooja & Engagement Party',
    contactText: 'Any questions? Call or message Ravi or Akshee, or email us.',
    contactPhone: '',
    contactEmail: '',
    footerNote: 'With love, Ravi & Akshee',
    // Colours (all editable in Admin → Edit website → Colours)
    accentColor: '#8a6a1f',
    buttonTextColor: '#ffffff',
    backgroundColor: '#fbf7ef',
    cardColor: '#ffffff',
    headerColor: '#ffffff',
    textColor: '#2b2420',
    headingColor: '#2b2420',
    highlightColor: '#c9a54c',
  },

  // The celebrations. Each invitation is for one or more of these.
  events: {
    heading: 'The celebrations',
    items: [
      { id: 'pooja', name: 'Pooja', date: '', time: '11:00am', details: 'Please join us for the Pooja as we ask for blessings for our future together.', image: '', showOnHome: true },
      { id: 'party', name: 'Engagement Party', date: '', time: '6:00pm until late', details: 'An evening of food, music and dancing to celebrate our engagement.', image: '', showOnHome: true },
    ],
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
    image: '',
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
    name: 'Courtyard by Marriott London Heathrow Airport',
    address: '1 Nobel Drive\nHarlington\nHayes',
    postcode: 'UB3 5EY',
    text: 'Both the Pooja and the Engagement Party are at the Courtyard by Marriott London Heathrow Airport.',
    image: '',
    phone: '',
    website: '',
    showMap: true,
  },

  travel: {
    label: 'Getting There',
    visible: true,
    heading: 'Getting There & Parking',
    image: '',
    intro: 'Here is everything you need to find us.',
    sections: [
      { title: 'By car', text: 'Put **UB3 5EY** into your sat nav. The hotel is on Nobel Drive in Harlington, near Heathrow Airport.', image: '' },
      { title: 'Parking', text: 'Where to park, how much it costs, and whether you need to book.', image: '' },
      { title: 'By train, tube or bus', text: 'The nearest stations and bus stops, and how long the walk is.', image: '' },
      { title: 'Taxis', text: 'Local taxi numbers and the best drop-off point.', image: '' },
      { title: 'Step-free access', text: 'Step-free entrance, lifts, accessible toilets and blue badge parking.', image: '' },
    ],
  },

  faq: {
    label: 'FAQ',
    visible: true,
    heading: 'Questions & Answers',
    image: '',
    intro: '',
    items: [
      { q: 'What should I wear?', a: 'Tell your guests the dress code, for example Indian formal or smart.' },
      { q: 'What time should I arrive?', a: 'The Pooja starts at 11:00am and the Engagement Party starts at 6:00pm. Your invitation shows which you are invited to.' },
      { q: 'Are children invited?', a: 'Children named on your invitation are very welcome.' },
      { q: 'Can I bring someone?', a: 'Your RSVP shows everyone included in your invitation. If you have been given extra places, you can add their names when you reply.' },
      { q: 'Will there be food?', a: 'Yes. All the food will be **vegetarian**. If you have any other dietary requirements or allergies, you can tell us when you RSVP.' },
      { q: 'Gifts', a: 'Your presence is the only present we need.' },
      { q: 'I can no longer come. What should I do?', a: 'You can change your reply on the RSVP page until the RSVP deadline. After that, please call or message us.' },
    ],
  },

  rsvp: {
    label: 'RSVP',
    heading: 'RSVP',
    image: '',
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
      { id: 'dietary', scope: 'guest', type: 'text', label: 'Any other dietary requirements or allergies? (optional)', help: 'All the food is vegetarian. Leave blank if you have no other requirements.', options: [], required: false },
      { id: 'phone', scope: 'household', type: 'text', label: 'Best phone number to reach you', help: '', options: [], required: false },
      { id: 'message', scope: 'household', type: 'textarea', label: 'A message for Ravi & Akshee', help: 'Optional.', options: [], required: false },
    ],
  },
};
