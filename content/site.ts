// Everything the site says lives here. Edit this file to change copy, projects or links.

export type Project = {
  index: string;
  status: string;
  name: string;
  description: string;
  tags: string[];
  href?: string;
};

export type StackGroup = { role: string; items: string[] };

export type FieldNote = { when: string; role: string; title: string; body: string };

export const site = {
  name: 'Lucio Villena',
  navMark: 'L. Villena',
  title: 'Lucio Villena — Portfolio',
  description: 'Machine learning and embedded systems portfolio of Lucio Villena.',
  email: 'luciovillena7@gmail.com',
  links: {
    github: '#',
    linkedin: '#',
    resume: '#',
  },

  hero: {
    role: 'A portfolio by',
    closing: { role: 'MS Computer Engineering', name: 'University of Central Florida' },
  },

  prologue: {
    label: 'Prologue',
    title: 'Where it starts',
    paragraphs: [
      "I'm a computer engineering graduate student at UCF, focused on machine learning. My path runs from embedded systems to ML systems work, with time spent on the other side of the model too — evaluating, comparing and red-teaming AI systems as a data annotation contractor.",
      'I like building things that learn, and tools that make what they learn easier to see.',
    ],
    credits: [
      { role: 'Role', name: 'MS Computer Engineering, UCF' },
      { role: 'Focus', name: 'Machine Learning' },
      { role: 'Base', name: 'Orlando, Florida' },
      { role: 'Roots', name: 'California' },
    ],
  },

  projects: {
    label: 'Chapter I',
    title: 'Projects',
    items: [
      {
        index: '01', status: 'Fall 2026 · in progress', name: 'Battery Cycle-Life Prediction',
        description: 'Early prediction of lithium-ion battery cycle life from the first cycles, with an uncertainty estimate on every prediction. Built on the Severson et al. dataset; final write-up in IEEE conference format.',
        tags: ['python', 'ml', 'uncertainty'],
      },
      {
        index: '02', status: 'in progress', name: 'Champions League Predictor',
        description: "A model that predicts UEFA Champions League match winners using data drawn from the clubs' domestic leagues.",
        tags: ['python', 'ml', 'sports data'],
      },
      {
        index: '05', status: 'embedded and mobile', name: 'S.T.A.R. ',
        description: 'Automated tracking of a spotlight on a moving target, using a Raspberry Pi and a camera module. The Pi runs a small ML model to detect the target and control the motors via ESP32 and servo controllers that move the spotlight. Designed a mobil app for control and monitoring of the system, built with React Native and Expo.',
        tags: ['react native', 'expo'],
      },
    ] as Project[],
  },

  stack: {
    label: 'Chapter II',
    title: 'Stack',
    groups: [
      { role: 'Languages', items: ['Python', 'TypeScript', 'JavaScript'] },
      { role: 'Machine learning', items: ['Predictive modeling', 'Uncertainty estimation', 'Model evaluation', 'Red-teaming'] },
      { role: 'Web & app', items: ['Next.js · React', 'Tailwind CSS', 'React Native · Expo', 'Django REST Framework'] },
      { role: 'Tooling', items: ['Bun · Docker', 'WSL2', 'Claude Code', 'Figma'] },
      { role: 'Hardware', items: ['Embedded systems'] },
    ] as StackGroup[],
  },

  fieldNotes: {
    label: 'Chapter III',
    title: 'Field notes',
    entries: [
      {
        when: '2026 — present', role: 'University of Central Florida', title: 'MS Computer Engineering',
        body: 'Coursework: Machine Learning (CAP 5610), Advanced Artificial Intelligence (CAP 5636) and Machine Learning & Pattern Recognition (EEL 5825).',
      },
      {
        when: '2022 - 2026', role: 'University of Central Florida', title: 'BS Computer Engineering',
        body: 'Coursework: Data Structures & Algorithms (COP 3502 & COP 3503), Embedded Systems (EEL 4745), Operating Systems (COP 4600), Processes for Object-Oriented Developement (COP 4331), Computer Architecture (EEL 4768) and Algorithms for Machine Learning (CAP 4611).',
      },
      {
        when: 'earlier', role: 'Hardware & Systems', title: 'Embedded & ML Systems',
        body: 'Hands-on work across embedded systems and machine learning systems.',
      },
    ] as FieldNote[],
  },

  contact: {
    label: 'Epilogue',
    title: 'Send word',
    intro: 'Write to me directly — about a role, a research idea, or a match prediction you think my model gets wrong. It goes to my personal inbox, and I read everything.',
  },

  footer: { role: 'Designed & built by', year: '2026' },
};
