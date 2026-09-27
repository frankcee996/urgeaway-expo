/* ==========================================================================
   Mind Games — premium brain-game variants added to the urge-flow game
   pool. Same (container, onFinish, opts) calling convention as the games
   in distractions.js, so they slot into the same runners unchanged.

   No hub, no persistent best-score/streak here (by design, for now) — any
   combo/streak shown is ephemeral, reset every time the game is opened,
   purely for in-the-moment feedback. opts.hideProgress suppresses round
   counters, matching the no-visible-countdown rule for the urge flow.
   ========================================================================== */

function mgEl(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

/* ------------------------- 1. Impossible Choice ------------------------- */
const IC_SHAPE_TYPES = ['circle', 'triangle', 'square'];
const IC_COLORS = [
  { name: 'red', hex: '#ef4444' },
  { name: 'blue', hex: '#3b82f6' },
  { name: 'green', hex: '#22c55e' },
  { name: 'yellow', hex: '#eab308' },
];
const IC_RULES = [
  { text: 'Tap the circles', matches: (s) => s.type === 'circle' },
  { text: "Don't tap red", matches: (s) => s.color.name !== 'red' },
  { text: 'Tap the largest shapes', matches: (s) => s.size === 'large' },
  { text: 'Tap blue only', matches: (s) => s.color.name === 'blue' },
  { text: 'Avoid triangles', matches: (s) => s.type !== 'triangle' },
  { text: 'Tap the squares', matches: (s) => s.type === 'square' },
  { text: "Don't tap yellow", matches: (s) => s.color.name !== 'yellow' },
];

function icShapeSvg(shape) {
  const c = shape.color.hex;
  if (shape.type === 'circle') return `<circle cx="24" cy="24" r="20" fill="${c}"/>`;
  if (shape.type === 'square') return `<rect x="5" y="5" width="38" height="38" rx="6" fill="${c}"/>`;
  return `<polygon points="24,4 44,42 4,42" fill="${c}"/>`;
}

function runImpossibleChoice(container, onFinish, opts) {
  opts = opts || {};
  const totalRounds = opts.rounds || 9;
  let round = 0;
  let combo = 0;

  function playRound() {
    // Build a 3x3 grid of random shapes, then pick a rule that yields a
    // meaningful subset (not 0, not all 9) so every round has a real
    // decision to make.
    let shapes, rule, targetCount;
    let tries = 0;
    do {
      shapes = Array.from({ length: 9 }, () => ({
        type: pick(IC_SHAPE_TYPES),
        color: pick(IC_COLORS),
        size: Math.random() < 0.35 ? 'large' : 'small',
      }));
      rule = pick(IC_RULES);
      targetCount = shapes.filter(rule.matches).length;
      tries += 1;
    } while ((targetCount === 0 || targetCount === 9) && tries < 15);

    container.innerHTML = '';
    const wrap = mgEl(`
      <div class="fade-in" style="width:100%;display:flex;flex-direction:column;align-items:center;gap:14px;">
        ${opts.hideProgress ? '' : `<div class="timer-pill">${round + 1} of ${totalRounds}</div>`}
        <div class="prompt-text" id="ic-rule">${escapeHtml(rule.text)}</div>
        <div id="ic-combo" style="color:var(--focus-cyan);font-size:11.5px;font-weight:700;min-height:16px;">${combo >= 2 ? `\ud83d\udd25 ${combo} in a row` : ''}</div>
        <div id="ic-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;max-width:260px;"></div>
      </div>
    `);
    container.appendChild(wrap);
    const grid = wrap.querySelector('#ic-grid');
    let remaining = new Set(shapes.map((_, i) => i).filter((i) => rule.matches(shapes[i])));

    shapes.forEach((s, i) => {
      const size = s.size === 'large' ? 52 : 36;
      const btn = document.createElement('button');
      btn.style.cssText = `background:none;border:none;padding:10px;display:flex;align-items:center;justify-content:center;`;
      btn.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 48 48">${icShapeSvg(s)}</svg>`;
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        if (remaining.has(i)) {
          remaining.delete(i);
          combo += 1;
          btn.style.opacity = '0.25';
          btn.disabled = true;
          wrap.querySelector('#ic-combo').textContent = combo >= 2 ? `\ud83d\udd25 ${combo} in a row` : '';
          if (remaining.size === 0) {
            setTimeout(() => {
              round += 1;
              if (round >= totalRounds) onFinish();
              else playRound();
            }, 350);
          }
        } else {
          combo = 0;
          wrap.querySelector('#ic-combo').textContent = '';
          btn.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.85)' }, { transform: 'scale(1)' }], { duration: 200 });
        }
      });
      grid.appendChild(btn);
    });
  }
  playRound();
  return { onExit: () => {} };
}

/* ------------------------- 2. Mental Rotation -------------------------
   Genuinely correct, not just visually plausible: shapes are small
   polycubes (integer x/y/z coordinates), and every rotation is real
   integer-axis rotation math on those coordinates, then projected to an
   isometric 2D view for rendering. So "this option is the same object,
   just rotated" is always mathematically true, and wrong options are
   built from an actual mirror-reflection (a genuinely different, chirally
   distinct object no rotation can match) or a moved cube — never a coin
   flip on what "looks" different. */
const MR_BASE_SHAPES = [
  [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]],
  [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 1, 1]],
  [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0]],
];
function mrRotY(p) { return [p[2], p[1], -p[0]]; }
function mrRotX(p) { return [p[0], -p[2], p[1]]; }
function mrRotZ(p) { return [-p[1], p[0], p[2]]; }
function mrRandomRotate(shape) {
  let s = shape;
  const spins = [mrRotX, mrRotY, mrRotZ];
  spins.forEach((fn) => {
    const times = Math.floor(Math.random() * 4);
    for (let i = 0; i < times; i++) s = s.map(fn);
  });
  return s;
}
function mrMirror(shape) { return shape.map((p) => [-p[0], p[1], p[2]]); }
function mrMoveOneCube(shape) {
  // A structurally different shape: drop one cube, attach a new one
  // adjacent to a different cube — genuinely not the same object under
  // any rotation, not just relabeled.
  const kept = shape.slice(1);
  const anchor = kept[Math.floor(Math.random() * kept.length)];
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const dir = pick(dirs);
  const newCube = [anchor[0] + dir[0], anchor[1] + dir[1], anchor[2] + dir[2]];
  return [...kept, newCube];
}
function mrRenderIso(shape, size) {
  const cubeSize = size === 'large' ? 34 : 22;
  const xs = shape.map((p) => p[0]), ys = shape.map((p) => p[1]), zs = shape.map((p) => p[2]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const projected = shape.map(([x, y, z]) => {
    const nx = x - cx, ny = y - cy, nz = z - cz;
    return {
      sx: (nx - nz) * cubeSize * 0.87,
      sy: (nx + nz) * cubeSize * 0.5 - ny * cubeSize,
      depth: nx + nz - ny * 2,
      shade: 0.55 + (ny + 1.5) * 0.15,
    };
  }).sort((a, b) => a.depth - b.depth);
  const box = size === 'large' ? 140 : 90;
  const wrap = mgEl(`<div style="position:relative;width:${box}px;height:${box}px;"></div>`);
  projected.forEach((p) => {
    const tile = document.createElement('div');
    const light = Math.max(0.35, Math.min(1, p.shade));
    tile.style.cssText = `position:absolute;left:${box / 2 + p.sx - cubeSize / 2}px;top:${box / 2 + p.sy - cubeSize / 2}px;width:${cubeSize}px;height:${cubeSize}px;border-radius:5px;background:rgba(52,224,214,${light});box-shadow:0 3px 6px rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.15);`;
    wrap.appendChild(tile);
  });
  return wrap;
}
function runMentalRotation(container, onFinish, opts) {
  opts = opts || {};
  const totalRounds = opts.rounds || 6;
  let round = 0;

  function playRound() {
    const base = pick(MR_BASE_SHAPES);
    const reference = mrRandomRotate(base);
    const correct = mrRandomRotate(base);
    const wrongPool = [
      mrRandomRotate(mrMirror(base)),
      mrRandomRotate(mrMirror(base)),
      mrRandomRotate(mrMoveOneCube(base)),
    ];
    const options = pickN(wrongPool, 3);
    options.splice(Math.floor(Math.random() * 4), 0, correct);
    const correctIdx = options.indexOf(correct);

    container.innerHTML = '';
    const wrap = mgEl(`
      <div class="fade-in" style="width:100%;display:flex;flex-direction:column;align-items:center;gap:14px;">
        ${opts.hideProgress ? '' : `<div class="timer-pill">${round + 1} of ${totalRounds}</div>`}
        <div class="prompt-text">Which option is the same object, just rotated?</div>
        <div id="mr-ref" style="display:flex;justify-content:center;"></div>
        <div id="mr-options" style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;"></div>
        <div id="mr-feedback" class="feedback-flash"></div>
      </div>
    `);
    container.appendChild(wrap);
    wrap.querySelector('#mr-ref').appendChild(mrRenderIso(reference, 'large'));
    const optWrap = wrap.querySelector('#mr-options');
    options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'option-card';
      btn.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:6px;';
      btn.appendChild(mrRenderIso(opt, 'small'));
      btn.addEventListener('click', () => {
        Array.from(optWrap.children).forEach((c) => (c.disabled = true));
        const fb = wrap.querySelector('#mr-feedback');
        const isCorrect = idx === correctIdx;
        fb.textContent = isCorrect ? 'Nice!' : 'Not quite \u2014 look again next round';
        fb.className = isCorrect ? 'feedback-flash good' : 'feedback-flash bad';
        setTimeout(() => {
          round += 1;
          if (round >= totalRounds) onFinish();
          else playRound();
        }, 700);
      });
      optWrap.appendChild(btn);
    });
  }
  playRound();
  return { onExit: () => {} };
}
/* ------------------------- 3. Visual Sudoku -------------------------
   4x4 mini-sudoku using shapes instead of digits. Every generated puzzle
   is guaranteed valid by construction, not by a solver: it starts from a
   hand-verified valid solution grid and only ever applies operations that
   are mathematically proven to preserve sudoku validity (relabeling
   shapes, swapping the two rows within a band, swapping the two bands,
   same for columns, transposing) — so there's no risk of ever generating
   a broken or unsolvable board. */
const SUDOKU_SHAPES = ['\u25cf', '\u25b2', '\u25a0', '\u2666']; // ● ▲ ■ ◆
const SUDOKU_SEED = [
  [1, 2, 3, 4],
  [3, 4, 1, 2],
  [2, 1, 4, 3],
  [4, 3, 2, 1],
];
function sudokuGenerate() {
  let g = SUDOKU_SEED.map((r) => r.slice());
  const swapRows = (a, b) => { [g[a], g[b]] = [g[b], g[a]]; };
  const swapCols = (a, b) => { g.forEach((row) => { [row[a], row[b]] = [row[b], row[a]]; }); };
  if (Math.random() < 0.5) swapRows(0, 1);
  if (Math.random() < 0.5) swapRows(2, 3);
  if (Math.random() < 0.5) { swapRows(0, 2); swapRows(1, 3); }
  if (Math.random() < 0.5) swapCols(0, 1);
  if (Math.random() < 0.5) swapCols(2, 3);
  if (Math.random() < 0.5) { swapCols(0, 2); swapCols(1, 3); }
  if (Math.random() < 0.5) g = g[0].map((_, c) => g.map((row) => row[c])); // transpose
  const perm = [1, 2, 3, 4].sort(() => Math.random() - 0.5);
  g = g.map((row) => row.map((v) => perm[v - 1]));
  return g;
}
function runVisualSudoku(container, onFinish, opts) {
  opts = opts || {};
  const totalRounds = opts.rounds || 2;
  let round = 0;

  function playRound() {
    const solution = sudokuGenerate();
    const given = solution.map((row) => row.map(() => true));
    let hidden = 8; // of 16 cells
    while (hidden > 0) {
      const r = Math.floor(Math.random() * 4), c = Math.floor(Math.random() * 4);
      if (given[r][c]) { given[r][c] = false; hidden -= 1; }
    }
    const board = solution.map((row, r) => row.map((v, c) => (given[r][c] ? v : null)));
    let selected = null;

    container.innerHTML = '';
    const wrap = mgEl(`
      <div class="fade-in" style="width:100%;display:flex;flex-direction:column;align-items:center;gap:16px;">
        ${opts.hideProgress ? '' : `<div class="timer-pill">${round + 1} of ${totalRounds}</div>`}
        <div class="prompt-text" style="font-size:14px;">Fill the grid \u2014 no shape repeats in a row, column, or 2\u00d72 box</div>
        <div id="sd-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:3px;background:var(--focus-line);padding:3px;border-radius:var(--radius-m);width:200px;height:200px;"></div>
        <div id="sd-picker" style="display:flex;gap:10px;"></div>
        <div id="sd-msg" style="color:var(--focus-text-2);font-size:12px;min-height:16px;"></div>
      </div>
    `);
    container.appendChild(wrap);
    const gridEl = wrap.querySelector('#sd-grid');
    const cells = [];

    function boxOf(r, c) { return Math.floor(r / 2) * 2 + Math.floor(c / 2); }
    function conflictsAt(r, c, val) {
      if (!val) return false;
      for (let i = 0; i < 4; i++) {
        if (i !== c && board[r][i] === val) return true;
        if (i !== r && board[i][c] === val) return true;
      }
      for (let rr = 0; rr < 4; rr++) for (let cc = 0; cc < 4; cc++) {
        if ((rr !== r || cc !== c) && boxOf(rr, cc) === boxOf(r, c) && board[rr][cc] === val) return true;
      }
      return false;
    }
    function renderGrid() {
      gridEl.innerHTML = '';
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const cell = document.createElement('button');
        const isGiven = given[r][c];
        const val = board[r][c];
        const conflict = !isGiven && conflictsAt(r, c, val);
        cell.style.cssText = `background:${isGiven ? 'rgba(148,178,210,0.14)' : (selected && selected[0] === r && selected[1] === c ? 'rgba(52,224,214,0.22)' : 'var(--focus-bg-2)')};border:${conflict ? '2px solid var(--coral)' : 'none'};font-size:22px;display:flex;align-items:center;justify-content:center;color:${isGiven ? 'var(--focus-text-1)' : 'var(--focus-cyan)'};border-radius:4px;`;
        cell.textContent = val ? SUDOKU_SHAPES[val - 1] : '';
        if (!isGiven) cell.addEventListener('click', () => { selected = [r, c]; renderGrid(); });
        gridEl.appendChild(cell);
      }
    }
    renderGrid();

    const pickerEl = wrap.querySelector('#sd-picker');
    SUDOKU_SHAPES.forEach((shape, i) => {
      const btn = document.createElement('button');
      btn.style.cssText = 'width:40px;height:40px;border-radius:10px;background:var(--focus-bg-2);border:1px solid var(--focus-line);color:var(--focus-cyan);font-size:20px;';
      btn.textContent = shape;
      btn.addEventListener('click', () => {
        if (!selected) { wrap.querySelector('#sd-msg').textContent = 'Tap an empty square first'; return; }
        board[selected[0]][selected[1]] = i + 1;
        renderGrid();
        const complete = board.every((row) => row.every((v) => v));
        if (complete) {
          const correct = board.every((row, r) => row.every((v, c) => v === solution[r][c]));
          if (correct) {
            wrap.querySelector('#sd-msg').textContent = 'Solved!';
            setTimeout(() => { round += 1; if (round >= totalRounds) onFinish(); else playRound(); }, 500);
          } else {
            wrap.querySelector('#sd-msg').textContent = 'Not quite \u2014 check the highlighted conflicts';
          }
        }
      });
      pickerEl.appendChild(btn);
    });
  }
  playRound();
  return { onExit: () => {} };
}

/* ------------------------- 4. Word Scramble ------------------------- */
const WORD_BANK = {
  everyday: ['WATER', 'CHAIR', 'BREAD', 'SLEEP', 'MONEY', 'HAPPY', 'LIGHT', 'PAPER', 'SMILE', 'QUIET'],
  objects: ['PENCIL', 'BOTTLE', 'BASKET', 'WINDOW', 'MIRROR', 'BLANKET', 'CANDLE', 'WALLET'],
  places: ['GARDEN', 'BRIDGE', 'MARKET', 'KITCHEN', 'STATION', 'HARBOR', 'VILLAGE', 'DESERT'],
  technology: ['PHONE', 'ROBOT', 'SIGNAL', 'CAMERA', 'BATTERY', 'NETWORK', 'LAPTOP'],
};
function wsScramble(word) {
  let arr = word.split('');
  let scrambled = word;
  let tries = 0;
  while (scrambled === word && tries < 10) {
    arr = arr.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    scrambled = arr.join('');
    tries += 1;
  }
  return scrambled;
}
function runWordScramble(container, onFinish, opts) {
  opts = opts || {};
  const totalRounds = opts.rounds || 8;
  const categories = Object.keys(WORD_BANK);
  let round = 0;
  let combo = 0;

  function playRound() {
    const category = pick(categories);
    const word = pick(WORD_BANK[category]);
    const scrambled = wsScramble(word).split('');
    let answer = [];
    let usedIdx = new Set();

    container.innerHTML = '';
    const wrap = mgEl(`
      <div class="fade-in" style="width:100%;display:flex;flex-direction:column;align-items:center;gap:16px;">
        ${opts.hideProgress ? '' : `<div class="timer-pill">${round + 1} of ${totalRounds}</div>`}
        <div style="color:var(--focus-text-2);font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(category)}</div>
        <div id="ws-answer" style="display:flex;gap:6px;min-height:40px;flex-wrap:wrap;justify-content:center;"></div>
        <div id="ws-tiles" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;max-width:300px;"></div>
        <div id="ws-combo" style="color:var(--focus-cyan);font-size:11.5px;font-weight:700;min-height:16px;">${combo >= 2 ? `\ud83d\udd25 ${combo} in a row` : ''}</div>
        <button class="btn-ghost btn" id="ws-clear" style="font-size:12px;">Clear</button>
      </div>
    `);
    container.appendChild(wrap);
    const answerWrap = wrap.querySelector('#ws-answer');
    const tilesWrap = wrap.querySelector('#ws-tiles');

    function renderAnswer() {
      answerWrap.innerHTML = '';
      for (let i = 0; i < word.length; i++) {
        const slot = document.createElement('div');
        slot.style.cssText = 'width:32px;height:36px;border-bottom:2px solid var(--focus-cyan);display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:800;color:var(--focus-text-0);';
        slot.textContent = answer[i] || '';
        answerWrap.appendChild(slot);
      }
    }
    renderAnswer();

    scrambled.forEach((letter, i) => {
      const tile = document.createElement('button');
      tile.className = 'tap-target';
      tile.style.cssText = 'width:38px;height:38px;font-size:17px;font-weight:800;display:flex;align-items:center;justify-content:center;';
      tile.textContent = letter;
      tile.addEventListener('click', () => {
        if (usedIdx.has(i) || answer.length >= word.length) return;
        usedIdx.add(i);
        answer.push(letter);
        tile.style.visibility = 'hidden';
        renderAnswer();
        if (answer.length === word.length) {
          const guess = answer.join('');
          setTimeout(() => {
            if (guess === word) {
              combo += 1;
              wrap.querySelector('#ws-combo').textContent = combo >= 2 ? `\ud83d\udd25 ${combo} in a row` : '';
              round += 1;
              if (round >= totalRounds) onFinish();
              else playRound();
            } else {
              combo = 0;
              answer = [];
              usedIdx = new Set();
              tilesWrap.querySelectorAll('button').forEach((b) => { b.style.visibility = 'visible'; });
              renderAnswer();
              wrap.querySelector('#ws-combo').textContent = '';
            }
          }, 300);
        }
      });
      tilesWrap.appendChild(tile);
    });

    wrap.querySelector('#ws-clear').addEventListener('click', () => {
      answer = [];
      usedIdx = new Set();
      tilesWrap.querySelectorAll('button').forEach((b) => { b.style.visibility = 'visible'; });
      renderAnswer();
    });
  }
  playRound();
  return { onExit: () => {} };
}

/* ------------------------- 5. Logic Detective -------------------------
   A small bank of hand-written mysteries rather than a procedural
   generator — each one is manually verified (by hand-solving it via
   elimination) to have exactly one answer that the clues actually
   support, rather than trusting a generator to produce a puzzle that's
   both solvable and unique. Correctness over infinite variety. */
const DETECTIVE_CASES = [
  { intro: 'Three friends each own a different pet.', category: 'pet', people: ['Anna', 'Ben', 'Cleo'], items: ['Cat', 'Dog', 'Bird'],
    clues: ['Anna does not own the dog.', 'Ben owns the cat or the bird.', 'Cleo does not own the bird.', 'Ben does not own the bird.'],
    answer: { Anna: 'Bird', Ben: 'Cat', Cleo: 'Dog' }, question: 'Who owns the dog?', correctPerson: 'Cleo' },
  { intro: 'Three coworkers each have a favorite color.', category: 'color', people: ['Max', 'Nia', 'Omar'], items: ['Red', 'Blue', 'Green'],
    clues: ["Max's favorite is not green.", "Nia's favorite is red or green.", "Omar's favorite is not red.", "Nia's favorite is not green."],
    answer: { Max: 'Blue', Nia: 'Red', Omar: 'Green' }, question: 'Whose favorite color is green?', correctPerson: 'Omar' },
  { intro: 'Three neighbors each order a different drink.', category: 'drink', people: ['Priya', 'Quinn', 'Ravi'], items: ['Tea', 'Coffee', 'Juice'],
    clues: ['Priya does not drink coffee.', 'Quinn drinks tea or juice.', 'Ravi drinks coffee or tea.', 'Quinn does not drink tea.'],
    answer: { Priya: 'Tea', Quinn: 'Juice', Ravi: 'Coffee' }, question: 'Who drinks coffee?', correctPerson: 'Ravi' },
  { intro: 'Three students each play a different instrument.', category: 'instrument', people: ['Sam', 'Tara', 'Uma'], items: ['Piano', 'Guitar', 'Drums'],
    clues: ['Sam does not play drums.', 'Tara plays piano or drums.', 'Uma does not play piano.', 'Tara does not play piano.'],
    answer: { Sam: 'Piano', Tara: 'Drums', Uma: 'Guitar' }, question: 'Who plays the guitar?', correctPerson: 'Uma' },
  { intro: 'Three neighbors each do a different sport.', category: 'sport', people: ['Vik', 'Wren', 'Xena'], items: ['Tennis', 'Swimming', 'Cycling'],
    clues: ['Vik does not swim.', 'Wren cycles or swims.', 'Xena does not cycle.', 'Wren does not cycle.'],
    answer: { Vik: 'Cycling', Wren: 'Swimming', Xena: 'Tennis' }, question: 'Who swims?', correctPerson: 'Wren' },
  { intro: 'Three friends each order a different dessert.', category: 'dessert', people: ['Yara', 'Zane', 'Abel'], items: ['Cake', 'Ice Cream', 'Pie'],
    clues: ['Yara does not eat pie.', 'Zane eats cake or pie.', 'Abel does not eat cake.', 'Zane does not eat cake.'],
    answer: { Yara: 'Cake', Zane: 'Pie', Abel: 'Ice Cream' }, question: 'Who eats the ice cream?', correctPerson: 'Abel' },
];
function runLogicDetective(container, onFinish, opts) {
  opts = opts || {};
  const totalRounds = Math.min(opts.rounds || 4, DETECTIVE_CASES.length);
  let round = 0;
  let order = pickN(DETECTIVE_CASES, totalRounds);
  let wrongTries = 0;

  function playRound() {
    const c = order[round];
    wrongTries = 0;
    container.innerHTML = '';
    const wrap = mgEl(`
      <div class="fade-in" style="width:100%;display:flex;flex-direction:column;align-items:center;gap:14px;">
        ${opts.hideProgress ? '' : `<div class="timer-pill">Case ${round + 1} of ${totalRounds}</div>`}
        <div class="prompt-text" style="font-size:14px;">${escapeHtml(c.intro)}</div>
        <div id="ld-clues" style="display:flex;flex-direction:column;gap:8px;width:100%;max-width:300px;"></div>
        <div class="prompt-text" style="font-size:15px;margin-top:4px;">${escapeHtml(c.question)}</div>
        <div id="ld-answers" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;"></div>
        <div id="ld-msg" style="color:var(--focus-text-2);font-size:12px;min-height:16px;text-align:center;max-width:280px;"></div>
      </div>
    `);
    container.appendChild(wrap);

    const cluesWrap = wrap.querySelector('#ld-clues');
    c.clues.forEach((clue, i) => {
      const card = document.createElement('button');
      card.style.cssText = 'text-align:left;background:var(--focus-bg-2);border:1px solid var(--focus-line);border-radius:var(--radius-s);padding:10px 12px;color:var(--focus-text-1);font-size:12.5px;';
      card.textContent = `\ud83d\udd0e ${clue}`;
      card.addEventListener('click', () => {
        const marked = card.style.borderColor === 'rgb(52, 224, 214)';
        card.style.borderColor = marked ? '' : 'var(--focus-cyan)';
        card.style.color = marked ? 'var(--focus-text-1)' : 'var(--focus-cyan)';
      });
      cluesWrap.appendChild(card);
    });

    const answersWrap = wrap.querySelector('#ld-answers');
    pickN(c.people, c.people.length).forEach((person) => {
      const btn = document.createElement('button');
      btn.className = 'choice-pill';
      btn.textContent = person;
      btn.addEventListener('click', () => {
        if (person === c.correctPerson) {
          wrap.querySelector('#ld-msg').textContent = 'Case solved!';
          Array.from(answersWrap.children).forEach((b) => (b.disabled = true));
          setTimeout(() => { round += 1; if (round >= totalRounds) onFinish(); else playRound(); }, 600);
        } else {
          wrongTries += 1;
          wrap.querySelector('#ld-msg').textContent = wrongTries >= 2
            ? `Try eliminating people using each clue about ${c.category} one at a time.`
            : 'Not quite \u2014 check the clues again.';
        }
      });
      answersWrap.appendChild(btn);
    });
  }
  playRound();
  return { onExit: () => {} };
}

/* ------------------------- 6. Path Finder -------------------------
   A real perfect maze (randomized-DFS / "recursive backtracker"), not a
   pre-drawn image — every cell is reachable from every other cell by
   exactly one path, generated fresh each round, so it's always solvable
   by construction. Grid size increases each round for a difficulty ramp
   within a single play session. */
function pfGenerateMaze(size) {
  const cells = Array.from({ length: size * size }, () => ({ visited: false, walls: { top: true, right: true, bottom: true, left: true } }));
  const idx = (r, c) => r * size + c;
  const stack = [0];
  cells[0].visited = true;
  const dirs = [
    { key: 'top', dr: -1, dc: 0, opp: 'bottom' },
    { key: 'right', dr: 0, dc: 1, opp: 'left' },
    { key: 'bottom', dr: 1, dc: 0, opp: 'top' },
    { key: 'left', dr: 0, dc: -1, opp: 'right' },
  ];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const r = Math.floor(cur / size), c = cur % size;
    const neighbors = dirs
      .map((d) => ({ ...d, nr: r + d.dr, nc: c + d.dc }))
      .filter((d) => d.nr >= 0 && d.nr < size && d.nc >= 0 && d.nc < size && !cells[idx(d.nr, d.nc)].visited);
    if (!neighbors.length) { stack.pop(); continue; }
    const chosen = pick(neighbors);
    const ni = idx(chosen.nr, chosen.nc);
    cells[cur].walls[chosen.key] = false;
    cells[ni].walls[chosen.opp] = false;
    cells[ni].visited = true;
    stack.push(ni);
  }
  return cells;
}
function runPathFinder(container, onFinish, opts) {
  opts = opts || {};
  const totalRounds = opts.rounds || 3;
  let round = 0;

  function playRound() {
    const size = 4 + round; // grows each round: 4x4, 5x5, 6x6...
    const cells = pfGenerateMaze(size);
    const idx = (r, c) => r * size + c;
    const start = 0;
    const end = size * size - 1;
    let path = [start];

    container.innerHTML = '';
    const px = Math.min(240, Math.floor(280 / size) * size);
    const cellPx = Math.floor(px / size);
    const wrap = mgEl(`
      <div class="fade-in" style="width:100%;display:flex;flex-direction:column;align-items:center;gap:14px;">
        ${opts.hideProgress ? '' : `<div class="timer-pill">Maze ${round + 1} of ${totalRounds}</div>`}
        <div class="prompt-text" style="font-size:14px;">Trace a path from START to END</div>
        <div id="pf-grid" style="position:relative;width:${cellPx * size}px;height:${cellPx * size}px;background:var(--focus-bg-2);border-radius:6px;"></div>
        <button class="btn-ghost btn" id="pf-reset" style="font-size:12px;">Reset path</button>
      </div>
    `);
    container.appendChild(wrap);
    const gridEl = wrap.querySelector('#pf-grid');

    function render() {
      gridEl.innerHTML = '';
      cells.forEach((cell, i) => {
        const r = Math.floor(i / size), c = i % size;
        const inPath = path.includes(i);
        const div = document.createElement('div');
        div.style.cssText = `position:absolute;left:${c * cellPx}px;top:${r * cellPx}px;width:${cellPx}px;height:${cellPx}px;box-sizing:border-box;
          border-top:${cell.walls.top ? '2px solid var(--focus-line)' : 'none'};
          border-right:${cell.walls.right ? '2px solid var(--focus-line)' : 'none'};
          border-bottom:${cell.walls.bottom ? '2px solid var(--focus-line)' : 'none'};
          border-left:${cell.walls.left ? '2px solid var(--focus-line)' : 'none'};
          background:${inPath ? 'rgba(52,224,214,0.35)' : 'transparent'};`;
        if (i === start) div.style.background = 'rgba(139,227,168,0.55)';
        if (i === end) div.style.background = inPath ? 'rgba(52,224,214,0.55)' : 'rgba(232,121,201,0.35)';
        div.addEventListener('click', () => {
          const last = path[path.length - 1];
          const lr = Math.floor(last / size), lc = last % size;
          if (path.length > 1 && i === path[path.length - 2]) { path.pop(); render(); return; } // step back
          if (path.includes(i)) return;
          const adjacent = (r === lr && Math.abs(c - lc) === 1) || (c === lc && Math.abs(r - lr) === 1);
          if (!adjacent) return;
          const dirKey = r < lr ? 'top' : r > lr ? 'bottom' : c < lc ? 'left' : 'right';
          if (cells[last].walls[dirKey]) return; // blocked by a wall
          path.push(i);
          render();
          if (i === end) {
            setTimeout(() => { round += 1; if (round >= totalRounds) onFinish(); else playRound(); }, 500);
          }
        });
        gridEl.appendChild(div);
      });
    }
    render();
    wrap.querySelector('#pf-reset').addEventListener('click', () => { path = [start]; render(); });
  }
  playRound();
  return { onExit: () => {} };
}
