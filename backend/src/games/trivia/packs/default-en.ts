// Placeholder English pack — 10 questions to exercise the engine end-to-end.
// Real bilingual content (per PLAN.md: ~50 AR + ~50 EN across 5 categories)
// lands when the user has reviewed it.

import type { Question } from '../trivia.types.js';

export const DEFAULT_EN_PACK: Question[] = [
  {
    id: 'en-geo-1',
    category: 'geography',
    locale: 'en',
    text: 'What is the capital of France?',
    choices: ['Paris', 'Berlin', 'Madrid', 'Rome'],
    correctIndex: 0,
  },
  {
    id: 'en-geo-2',
    category: 'geography',
    locale: 'en',
    text: 'Which country is home to the Great Pyramid of Giza?',
    choices: ['Mexico', 'Egypt', 'Greece', 'India'],
    correctIndex: 1,
  },
  {
    id: 'en-sci-1',
    category: 'science',
    locale: 'en',
    text: 'What planet is known as the Red Planet?',
    choices: ['Venus', 'Jupiter', 'Mars', 'Saturn'],
    correctIndex: 2,
  },
  {
    id: 'en-sci-2',
    category: 'science',
    locale: 'en',
    text: 'What is the chemical symbol for water?',
    choices: ['H2O', 'O2', 'CO2', 'NaCl'],
    correctIndex: 0,
  },
  {
    id: 'en-hist-1',
    category: 'history',
    locale: 'en',
    text: 'In which year did World War II end?',
    choices: ['1945', '1939', '1918', '1950'],
    correctIndex: 0,
  },
  {
    id: 'en-hist-2',
    category: 'history',
    locale: 'en',
    text: 'Who painted the Mona Lisa?',
    choices: ['Vincent van Gogh', 'Leonardo da Vinci', 'Pablo Picasso', 'Claude Monet'],
    correctIndex: 1,
  },
  {
    id: 'en-sport-1',
    category: 'sports',
    locale: 'en',
    text: 'How many players are on a standard football (soccer) team on the field?',
    choices: ['9', '10', '11', '12'],
    correctIndex: 2,
  },
  {
    id: 'en-ent-1',
    category: 'entertainment',
    locale: 'en',
    text: 'Which studio produced the film "Spirited Away"?',
    choices: ['Studio Ghibli', 'Pixar', 'DreamWorks', 'Disney'],
    correctIndex: 0,
  },
  {
    id: 'en-geo-3',
    category: 'geography',
    locale: 'en',
    text: 'Which is the longest river in the world?',
    choices: ['Amazon', 'Nile', 'Yangtze', 'Mississippi'],
    correctIndex: 1,
  },
  {
    id: 'en-sci-3',
    category: 'science',
    locale: 'en',
    text: 'How many bones are in the adult human body?',
    choices: ['206', '186', '226', '256'],
    correctIndex: 0,
  },
];
