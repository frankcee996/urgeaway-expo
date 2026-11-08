/* ==========================================================================
   Nudges — the pool of 10 a.m. daily notification messages.

   To refresh them (e.g. every 50 days): replace the strings below with new
   ones and rebuild. Any count works; 50 is the plan.

   One message per calendar day, no repeats until the whole pool has been
   used, then the order is reshuffled for the next round. The pick is a
   pure function of the date, so the notification scheduler and the
   in-app history always agree on which message a given day got.
   ========================================================================== */

const NUDGE_MESSAGES = [
  'A small reset can change the next few minutes.',
  'You can always take the next few minutes one step at a time.',
  'Take a moment for yourself today.',
  'An urge is a wave. It rises, peaks, and passes. Ride it out.',
  'You’ve gotten through every urge so far. Today is no different.',
  'Pause. Breathe in for four, out for six. Then decide.',
  'An urge isn’t an order. You don’t have to follow it.',
  'Future you is counting on the choice you make today.',
  'Drink some water, stretch, and give the urge ten minutes to fade.',
  'You’re not starting over. Every day you resist still counts.',
  'Feeling it doesn’t mean you have to act on it.',
  'Be kind to yourself today. Progress isn’t a straight line.',
  'Ten minutes. That’s all it takes to outlast most urges.',
  'Your reasons for starting are still good reasons. Remember them today.',
  'If things get loud, go for a short walk. Movement helps.',
  'Strong people ask for help too. Reach out if you need to.',
  'Every urge you let pass makes the next one weaker.',
  'You’re building a new habit with every small choice.',
  'Not giving in is a quiet kind of courage. Notice yours.',
  'When the moment gets hard, tap “I have an urge” and let UrgeAway help.',
  'Cravings fade. Pride in yourself lasts.',
  'Look how far you’ve come. Keep going.',
  'Don’t negotiate with the urge. Redirect it.',
  'A bad moment is not a bad day. Keep your head up.',
  'You get to choose what happens next.',
  'Step away from whatever set it off. Change the scene, change the moment.',
  'Rest, food, and water make urges easier to handle. Look after the basics today.',
  'You don’t need to be perfect. You just need to keep going.',
  'Say it out loud: “This will pass.” Then wait for it to.',
  'Another day, another chance to choose yourself.',
  'The hardest part is the first few minutes. Get through those.',
  'You’ve done hard things before. This is one more.',
  'Text a friend, call someone, or journal for a minute. Break the silence.',
  'Your future self will thank you for today.',
  'Small wins add up. Count today as one.',
  'Slow down. Nothing about this urge is urgent.',
  'Be proud of every day you’ve shown up for yourself.',
  'If it feels heavy, shrink the goal: just get through the next hour.',
  'The urge will tell you it lasts forever. It doesn’t.',
  'Try a mind game or a distraction in UrgeAway. Two minutes can change everything.',
  'Choose the version of today you’ll be proud of tonight.',
  'Setbacks teach. They don’t define you. Keep going.',
  'Take a deep breath. You’re in charge here.',
  'Willpower is a muscle, and you’re training it right now.',
  'Don’t wait for motivation. Start with one small, good choice.',
  'Be patient with yourself. Change takes time, and you’re doing it.',
  'Notice where you feel the urge in your body, then watch it soften.',
  'You are more than your urges.',
  'One more day of choosing yourself. You’ve got this.',
  'Whatever today brings, you can handle it. One moment at a time.',
];

// Small seeded PRNG so the shuffle for a given round is always the same.
function nudgeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nudgeRawOrder(round, size) {
  const rand = nudgeRng(Math.imul(round + 1, 2654435761));
  const order = [];
  for (let i = 0; i < size; i++) order.push(i);
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
  }
  return order;
}

function nudgeOrderForRound(round, size) {
  const order = nudgeRawOrder(round, size);
  // Never open a new round with the message that closed the previous one.
  if (size > 2) {
    const prevLast = nudgeRawOrder(round - 1, size)[size - 1];
    if (order[0] === prevLast) { const tmp = order[0]; order[0] = order[1]; order[1] = tmp; }
  }
  return order;
}

// Day number (whole days since 1970, local calendar date) — used to count
// days since the nudges were first switched on.
function nudgeDayNumber(date) {
  const d = date instanceof Date ? date : new Date(date);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

// The message for a given calendar day (local date). anchorDay is the day
// number the nudges started on (notifications.js stores it the first time
// they're scheduled): rounds are counted from there, so the first 50 days
// are 50 different messages.
function nudgeForDate(date, anchorDay) {
  const size = NUDGE_MESSAGES.length;
  const rel = nudgeDayNumber(date) - (anchorDay || 0);
  const round = Math.floor(rel / size);
  const pos = ((rel % size) + size) % size;
  return NUDGE_MESSAGES[nudgeOrderForRound(round, size)[pos]];
}
