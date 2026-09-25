import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT_PATH = path.join(ROOT, 'scripts', 'generate_veeva_executive_slides.mjs');

// 7 slide metadata templates
const SLIDE_TEMPLATES = {
  1: {
    id: 1,
    slug: 'veeva_intro_executive_overview',
    title: 'GE Veeva Vault GxP MCP Connector: Executive Overview',
    subtitle: 'Autonomous Agent-to-Agent (A2A) Clinical Safety Bridge & Model Context Protocol for Regulated Life Sciences',
    badge: 'Introduction & Scope',
    contentVar: 'slide1Content',
    scriptVar: 'slide1Script'
  },
  2: {
    id: 2,
    slug: 'veeva_problem_statement_challenges',
    title: 'Problem Statement: Velocity vs Compliance in Regulated Clinical Ops',
    subtitle: 'Data Fragmentation, 21 CFR Part 11 Audit Trail Deficits, and Public Internet PHI Egress Risks',
    badge: 'Problem Statement',
    contentVar: 'slide2Content',
    scriptVar: 'slide2Script'
  },
  3: {
    id: 3,
    slug: 'veeva_solution_architecture_flow',
    title: 'Solution Approach: Sovereign BYOMCP Architecture Flow',
    subtitle: 'Air-Gapped Cloud Run Demarcation, Sub-28µs AST Sanitizer, and 21 CFR Part 11 HMAC Sealer',
    badge: 'Technical Architecture',
    contentVar: 'slide3Content',
    scriptVar: 'slide3Script'
  },
  4: {
    id: 4,
    slug: 'veeva_comparative_benefits_matrix',
    title: 'Comparative Benefits Matrix: Status Quo vs GE Veeva MCP Gateway',
    subtitle: 'Quantified Operational Benchmarks: Query Latency (-99.9%), Egress Leaks (0 Bytes), and Cost (-99.9%)',
    badge: 'Comparative ROI',
    contentVar: 'slide4Content',
    scriptVar: 'slide4Script'
  },
  5: {
    id: 5,
    slug: 'veeva_real_screenshots_ground_truth',
    title: 'Live Ground-Truth Verification & Production Proof',
    subtitle: 'Zero-Hallucination Parity: Real Veeva Vault Web UI vs Real Gemini Enterprise Chat UI',
    badge: 'Real Screenshots',
    contentVar: 'slide5Content',
    scriptVar: "''"
  },
  6: {
    id: 6,
    slug: 'veeva_limitations_and_risk_matrix',
    title: 'Limitations & Enterprise Risk Governance Matrix',
    subtitle: 'Transparent Technical Boundaries, API Throttling Mitigation, and FDA §11.10 Inspection Readiness',
    badge: 'Risk Governance',
    contentVar: 'slide6Content',
    scriptVar: 'slide6Script'
  },
  7: {
    id: 7,
    slug: 'veeva_call_to_action_roadmap',
    title: 'Strategic Call to Action & 4-Week Deployment Roadmap',
    subtitle: 'Phase 1 Ingress ➔ Phase 2 Cohort B Pilot ➔ Phase 3 RIM Expansion ➔ Phase 4 Enterprise GA',
    badge: 'Call to Action',
    contentVar: 'slide7Content',
    scriptVar: 'slide7Script'
  }
};

function parseArgs() {
  const args = process.argv.slice(2);
  let order = null;
  let move = null;
  let before = null;
  let after = null;
  let swap = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--order' && args[i+1]) {
      order = args[i+1].split(',').map(x => parseInt(x.trim(), 10));
      i++;
    } else if (args[i] === '--move' && args[i+1]) {
      move = parseInt(args[i+1], 10);
      i++;
    } else if (args[i] === '--before' && args[i+1]) {
      before = parseInt(args[i+1], 10);
      i++;
    } else if (args[i] === '--after' && args[i+1]) {
      after = parseInt(args[i+1], 10);
      i++;
    } else if (args[i] === '--swap' && args[i+1] && args[i+2]) {
      swap = [parseInt(args[i+1], 10), parseInt(args[i+2], 10)];
      i += 2;
    }
  }
  return { order, move, before, after, swap };
}

function calculateNewOrder(opts, currentOrder = [1, 2, 3, 4, 5, 6, 7]) {
  if (opts.order) {
    if (opts.order.length !== 7 || new Set(opts.order).size !== 7) {
      throw new Error(`Invalid --order. Must be a permutation of 1 to 7. Given: ${opts.order.join(',')}`);
    }
    return opts.order;
  }

  const list = [...currentOrder];

  if (opts.swap) {
    const [a, b] = opts.swap;
    const idxA = list.indexOf(a);
    const idxB = list.indexOf(b);
    if (idxA === -1 || idxB === -1) throw new Error(`Slide not found for swap: ${a}, ${b}`);
    const tmp = list[idxA];
    list[idxA] = list[idxB];
    list[idxB] = tmp;
    return list;
  }

  if (opts.move && opts.before) {
    const item = opts.move;
    const target = opts.before;
    const fromIdx = list.indexOf(item);
    if (fromIdx === -1) throw new Error(`Slide to move not found: ${item}`);
    list.splice(fromIdx, 1);
    const toIdx = list.indexOf(target);
    if (toIdx === -1) throw new Error(`Target slide not found: ${target}`);
    list.splice(toIdx, 0, item);
    return list;
  }

  if (opts.move && opts.after) {
    const item = opts.move;
    const target = opts.after;
    const fromIdx = list.indexOf(item);
    if (fromIdx === -1) throw new Error(`Slide to move not found: ${item}`);
    list.splice(fromIdx, 1);
    const toIdx = list.indexOf(target);
    if (toIdx === -1) throw new Error(`Target slide not found: ${target}`);
    list.splice(toIdx + 1, 0, item);
    return list;
  }

  return list;
}

function generateSlidesArrayCode(newOrder) {
  const lines = ['const SLIDES = ['];
  newOrder.forEach((slideId, idx) => {
    const numStr = String(idx + 1).padStart(2, '0');
    const t = SLIDE_TEMPLATES[slideId];
    lines.push(`  {`);
    lines.push(`    filename: '${numStr}_${t.slug}.png',`);
    lines.push(`    title: ${JSON.stringify(t.title)},`);
    lines.push(`    subtitle: ${JSON.stringify(t.subtitle)},`);
    lines.push(`    badge: ${JSON.stringify(t.badge)},`);
    lines.push(`    content: ${t.contentVar},`);
    lines.push(`    script: ${t.scriptVar}`);
    lines.push(`  }${idx < newOrder.length - 1 ? ',' : ''}`);
  });
  lines.push('];');
  return lines.join('\n');
}

function main() {
  const opts = parseArgs();
  if (!opts.order && !opts.move && !opts.swap) {
    console.log(`
Usage:
  # Move a slide before another:
  node scripts/reorder_veeva_slides.mjs --move 5 --before 2

  # Move a slide after another:
  node scripts/reorder_veeva_slides.mjs --move 4 --after 6

  # Swap two slides:
  node scripts/reorder_veeva_slides.mjs --swap 2 5

  # Specify full custom order:
  node scripts/reorder_veeva_slides.mjs --order 1,5,2,3,4,6,7
`);
    process.exit(0);
  }

  let code = fs.readFileSync(SCRIPT_PATH, 'utf-8');
  
  // Find current order
  const match = code.match(/const SLIDES = \[([\s\S]*?)\];/);
  if (!match) {
    throw new Error('Could not find `const SLIDES = [...]` in generator script.');
  }

  const currentOrder = [];
  const slideRegex = /filename:\s*'\d+_(veeva_[^.]+)\.png'/g;
  let m;
  while ((m = slideRegex.exec(match[1])) !== null) {
    const slug = m[1];
    const foundId = Object.keys(SLIDE_TEMPLATES).find(k => SLIDE_TEMPLATES[k].slug === slug);
    if (foundId) currentOrder.push(parseInt(foundId, 10));
  }

  console.log(`Current slide order: [${currentOrder.join(', ')}]`);
  const newOrder = calculateNewOrder(opts, currentOrder.length === 7 ? currentOrder : [1,2,3,4,5,6,7]);
  console.log(`New slide order:     [${newOrder.join(', ')}]`);

  const newSlidesCode = generateSlidesArrayCode(newOrder);
  const updatedCode = code.replace(/const SLIDES = \[([\s\S]*?)\];/, newSlidesCode);
  fs.writeFileSync(SCRIPT_PATH, updatedCode, 'utf-8');
  console.log(`Updated ${SCRIPT_PATH}`);

  console.log('Regenerating slides with new order...');
  execSync('rm -f screenshots/screenshots_veeva_deck/*.png', { stdio: 'inherit' });
  execSync('node scripts/generate_veeva_executive_slides.mjs', { stdio: 'inherit' });
  console.log('All slides re-rendered successfully in new order!');
}

main();
