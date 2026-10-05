#!/usr/bin/env node
// Converts the Group A "Brochure Selection" .txt files in this repo into
// <slug>-tvet-college-prospectus.json using the south-cape schema.
//
//   node tools/convert-brochure.mjs          write JSON + tools/convert-report.md
//   node tools/convert-brochure.mjs --dry    report only, write nothing
//
// Nothing is invented: where the source has no value the field stays
// null/""/[]. Every source line is classified; lines that do not fit the
// model are listed in the report for human review.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const REF = path.join(REPO, '..', 'ref');
const DRY = process.argv.includes('--dry');

const HEADER_RE =
  /^\s*(\d{4})\s+(.+?)\s{2,}(.+?)\s{2,}(.+?)\s{2,}(.+?)\s{2,}(.+?)\s{2,}(.+?)\s{2,}(.+?)\s{2,}COURSE\s*$/;

// Boilerplate the source site emits between course rows.
const NOISE_RE = [
  /^for which course do you want to apply\?$/i,
  /chure\s*selection$/i,
  /^cannot find what you are looking for/i,
  /^click here for more options/i,
  /^which study direction are you interested in\?$/i,
  /^search$/i,
];

const SOURCES = [
  ['CAPRICORN TVET COLLEGE.txt', 'capricorn'],
  ['ELANGENI TVET COLLEGE.txt', 'elangeni'],
  ['Eastern Cape   EASTCAPE MIDLANDS TVET.txt', 'eastcape-midlands'],
  ['FLAVIUS MAREKA TVET COLLEGE.txt', 'flavius-mareka'],
  ['LOVEDALE TVET COLLEGE.txt', 'lovedale'],
  ['MALUTI TVET COLLEGE.txt', 'maluti'],
  ['MNAMBITHI TVET COLLEGE.txt', 'mnambithi'],
  ['MOTHEO TVET COLLEGE.txt', 'motheo'],
  ['MTHASHANA TVET COLLEGE.txt', 'mthashana'],
  ['THEKWINI TVET COLLEGE.txt', 'thekwini'],
  ['UMFOLOZI TVET COLLEGE.txt', 'umfolozi'],
];

// Header "qualification type" column -> south-cape programme_categories key.
const CATEGORY_MAP = [
  [/NATIONAL CERT VOCATIONAL/i, 'ncv'],
  [/\bNCV\b/, 'ncv'],
  [/NATIONAL QUALIFICATION FRAMEWO/i, 'report_191'],
  [/^NQF$/i, 'report_191'],
  [/NON-FORMAL/i, 'occupational'],
  [/OCCUPA/i, 'occupational'],
  [/QCTO/i, 'occupational'],
  [/SHORT COURSE/i, 'occupational'],
];

const CATEGORY_META = {
  ncv: { id: 'ncv', name: 'NC(V)', qualification_level: 'NQF Levels 2-4' },
  occupational: { id: 'occupational', name: 'Occupational Programmes', qualification_level: null },
  report_191: { id: 'report_191', name: 'Report 191', qualification_level: 'N1-N3' },
};

const MATCHING_RULES = {
  grade_rule: 'learner_grade >= programme.minimum_grade',
  percentage_rule: 'If minimum_percentage is not null, learner_percentage >= minimum_percentage.',
  required_subject_rule: "Every subject marked required=true must be present in the learner's results.",
  subject_group_rule: 'The learner must have the required number of additional subjects satisfying the specified rule.',
  placement_test_rule: "If a placement test applies to the learner, the learner's result must meet or exceed minimum_percentage.",
  progression_rule: 'A progression requirement must be satisfied before the learner can enter the next level.',
  alternative_path_rule: 'any_of means at least one eligibility path must be satisfied.',
  document_rule: 'All documents marked required=true must be supplied before application submission.',
  application_submission_rule: 'Application submission should be blocked when a required document is missing.',
  unknown_requirement_rule: 'null or requirements_provided=false means the supplied source did not provide enough information to determine eligibility.',
};

const SUBJECT_DICTIONARY = {
  mathematics: 'Mathematics',
  english: 'English',
  life_orientation: 'Life Orientation',
  physical_science: 'Physical Science',
  life_sciences: 'Life Sciences',
  natural_sciences: 'Natural Sciences',
  technology: 'Technology',
};

// ---------------------------------------------------------------- helpers

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function titleCase(s) {
  return s.toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase());
}

const isNoise = (t) => NOISE_RE.some((re) => re.test(t));

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ------------------------------------------------------- line classification

function splitRequirement(raw) {
  const pats = [
    /(\bADMISSION\s+(?:REQUIREMENTS?|REQ\.?)\b\s*:?\s*)/i,
    /(\bENTRY\s+REQUI[A-Z]*MENTS?\b\s*:?\s*)/i,
    /(\bPREREQUISITES?\b\s*:?\s*)/i,
    /(\bMIN(?:IMUM)?[\s-]+REQUI[A-Z]*MENTS?\b\s*:?\s*)/i,
    /(\bADDITIONAL\s+REQUI[A-Z]*MENTS?\b\s*:?\s*)/i,
    /(\bREQUI[A-Z]*MENTS?\b\s*:?\s*)/i,
    /(\.\s*(?:To\s+apply|NOTE)\b)/i,
  ];
  for (const re of pats) {
    const m = raw.match(re);
    if (m) {
      const at = m.index + m[1].length;
      const title = raw.slice(0, m.index).trim().replace(/[(\s]+$/, '').trim();
      const req = raw.slice(at).trim();          // kept verbatim, only trimmed
      return [title, req || null];
    }
  }
  return [raw.trim(), null];
}

// Ordering matters:
//   1. anchored requirement prefixes (unambiguous)
//   2. course lines that open with a qualification keyword
//   3. loose requirement phrases - these appear INSIDE course lines too, so
//      they must only be checked once the course keywords have been ruled out
//   4. generic level markers  5. label
function classify(raw) {
  const t = raw.trim();
  const u = t.toUpperCase();

  if (/^ONLY GR\b/.test(u)) return 'requirement';
  if (/^ENTRY REQUIREMENTS?\b/.test(u)) return 'requirement';
  if (/^REQUIREMENTS?\s*[:\-]/.test(u)) return 'requirement';
  if (/^\(?\s*REQUIREMENTS\b\s*:/.test(u)) return 'requirement';
  if (/^PREREQUISITES?\b/.test(u)) return 'requirement';
  if (/^NQF LEVEL \d/.test(u)) return 'requirement';
  if (/^PASS(ED)?\s+(GRADE|NQF)\b/.test(u)) return 'requirement';

  if (/^OCC/.test(u)) return 'course';
  if (/^(NATIONAL\s+)?SKILLS? PROGRAMME/.test(u)) return 'course';
  if (/^L\d\s*[:\-]/.test(t)) return 'course';

  if (/\bOR GRADE 12\b/.test(u)) return 'requirement';
  if (/\bEQUIVALENT QUALIFICATION\b/.test(u)) return 'requirement';

  if (/\bTHIS COURSE\b/.test(u) && /\b(EQUIPS|PREPARES|PROVIDES|STUDENT)\b/.test(u)) return 'description';

  if (/\bOCCUPA/.test(u)) return 'course';
  if (/\bNQF\s*L\d\b/.test(u)) return 'course';
  if (/\bL\d\b/.test(u)) return 'course';
  if (/\bNQF\s*LEVEL\s*\d\b/.test(u)) return 'course';
  if (/\bLEVEL\s*\d\b/.test(u)) return 'course';
  if (/\bNQF\s*\d\b/.test(u)) return 'course';

  return 'label';
}

function extractLevels(text) {
  const out = new Set();
  const u = text.toUpperCase();
  for (const m of u.matchAll(/\bL(\d+)\b/g)) out.add(String(Number(m[1])));
  for (const m of u.matchAll(/\bLEVEL\s+(\d+)\b/g)) out.add(String(Number(m[1])));
  for (const m of u.matchAll(/\bNQF\s+(\d+)\b/g)) out.add(String(Number(m[1])));
  return [...out].sort();
}

function cleanName(raw) {
  let t = raw.trim();

  // qualification prefixes, including misspellings present in the source
  t = t.replace(/^O?\s?CC[A-Z]*\s+(?:CERTIFICATE|QUALIFICATION)\s*[:.\-]\s*/i, '');
  t = t.replace(/^(NATIONAL\s+)?(OCCUPATIONAL|OCCUPATONAL)\s+(CERTIFICATE|QUALIFICATION)\s*[:.\-]\s*/i, '');
  t = t.replace(/^OCCUPAT\.?\s*CERT\.?\s*[:.\-]\s*/i, '');
  t = t.replace(/^OCC\s+CERT\.?\s*[:.\-]\s*/i, '');
  t = t.replace(/^NATIONAL\s+CERTIFICATE:\s*/i, '');

  // level prefixes: "L2:", "NCV L2 ", "LEVEL 2:"
  t = t.replace(/^(?:NCV\s+)?(?:L\d+|LEVEL\s+\d+)\s*[:\s\-]+/i, '');

  // attendance
  t = t.replace(/\s*[-\u2013]?\s*(FULL|PART)\s*TIME\.?/gi, ' ');

  // level tokens anywhere - the level is carried separately in `levels`
  t = t.replace(/\s*[-\u2013]?\s*(?:(?:NQF|NCV)\s+)?LEVEL\s+\d+/gi, ' ');
  t = t.replace(/\s*[-\u2013]?\s*NQF\s*L\d+/gi, ' ');
  t = t.replace(/\s+[-\u2013]?\s*L\d+(?=\s|$|[)\.]|,)/gi, ' ');
  t = t.replace(/\bNQF\s*L?\d+\b/gi, ' ');

  // fragments left behind by requirement splitting
  t = t.replace(/[\s.\u2013\-]*\b(?:Entry|Min|Minimum|Additional)\s*$/i, '');
  t = t.replace(/\s{2,}/g, ' ');
  t = t.replace(/^[\s:.\-,\u2013]+/, '').replace(/[\s:.\-,\u2013]+$/, '').trim();
  return t;
}

function mapCategory(qualType) {
  for (const [re, key] of CATEGORY_MAP) if (re.test(qualType)) return key;
  return null;
}

function parseDuration(text) {
  const m = String(text).match(/^(\d+)\s*(YEAR|MONTH|WEEK|DAY)/i);
  if (!m) return null;
  const raw = m[2].toUpperCase().replace(/S$/, '');
  const unit = { YEAR: 'years', MONTH: 'months', WEEK: 'weeks', DAY: 'days' }[raw];
  return { unit, value: Number(m[1]) };
}

// ---------------------------------------------------------------- parsing

function splitBlocks(lines) {
  const blocks = [];
  let cur = null;
  for (const raw of lines) {
    const m = raw.match(HEADER_RE);
    if (m) {
      if (cur) blocks.push(cur);
      cur = {
        year: m[1], province: m[2].trim(), college: m[3].trim(), duration: m[4].trim(),
        qualType: m[5].trim(), campus: m[6].trim(), attendance: m[7].trim(),
        field: m[8].trim(), body: [],
      };
      continue;
    }
    if (!cur) continue;
    const t = raw.trim();
    if (t === '' || isNoise(t)) continue;
    cur.body.push(t);
  }
  if (cur) blocks.push(cur);
  return blocks;
}

// The source alternates "direction label" lines with "course / requirement /
// description" lines; the label may be absent, repeated, or appear after the
// requirement.
function buildEntries(body) {
  const entries = [];
  let pendingLabel = null;
  let pendingReq = null;
  let last = null;

  const push = (name, levels, req, desc) => {
    const e = { name, levels, requirement: req || null, description: desc || null };
    entries.push(e);
    last = e;
    return e;
  };

  // A label can still carry "Min Requirements: ..." style text, so run it
  // through the same splitter as a course line.
  const emitLabel = (label, req) => {
    const [title, embedded] = splitRequirement(label);
    push(cleanName(title) || title, extractLevels(title), req || embedded, null);
  };

  for (const raw of body) {
    const kind = classify(raw);

    if (kind === 'label') {
      if (pendingLabel !== null) {
        emitLabel(pendingLabel, pendingReq);
        pendingReq = null;
      }
      pendingLabel = raw;
      continue;
    }
    if (kind === 'requirement') {
      if (last && !last.requirement) last.requirement = raw;
      else pendingReq = raw;
      continue;
    }
    if (kind === 'description') {
      if (last && !last.description) last.description = raw;
      continue;
    }
    const [title, embedded] = splitRequirement(raw);
    const name = cleanName(title);
    pendingLabel = null;
    push(name || title, extractLevels(title), pendingReq || embedded, null);
    pendingReq = null;
  }

  if (pendingLabel !== null) {
    emitLabel(pendingLabel, pendingReq);
  } else if (pendingReq !== null && last && !last.requirement) {
    last.requirement = pendingReq;
  }
  return entries;
}

// ---------------------------------------------------------------- loading

function flattenColleges() {
  const raw = loadJson(path.join(REF, 'tvet-colleges.json'));
  const out = new Map();
  for (const p of raw.provinces || []) {
    for (const c of p.colleges || []) out.set(c.slug, c);
  }
  return out;
}

function logoIndex() {
  const treeFile = path.join(REF, 'inst-tree.txt');
  const out = new Map();
  if (!fs.existsSync(treeFile)) return out;
  for (const line of fs.readFileSync(treeFile, 'utf8').split(/\r?\n/)) {
    const f = line.trim();
    if (!/\.(png|jpe?g|svg|webp)$/i.test(f) || f.includes('/')) continue;
    out.set(f.replace(/\.[^.]+$/, '').replace(/_/g, '-').toLowerCase(), f);
  }
  return out;
}

function esc(s) {
  return String(s).replace(/\|/g, '\\|');
}

// ---------------------------------------------------------------- emit

function build(file, slug, colleges, logos, report) {
  const abs = path.join(REPO, file);
  if (!fs.existsSync(abs)) {
    report.push(`## ${slug}`, '', `- **MISSING SOURCE FILE**: \`${file}\``, '');
    return null;
  }

  const blocks = splitBlocks(fs.readFileSync(abs, 'utf8').split(/\r?\n/));
  if (blocks.length === 0) {
    report.push(`## ${slug}`, '', `- **NO HEADERS PARSED** in \`${file}\``, '');
    return null;
  }

  const meta = colleges.get(slug) || null;
  const warnings = [];
  if (!meta) warnings.push('No entry in institutions/tvet-colleges.json for this slug.');

  const categories = { ncv: [], occupational: [], report_191: [] };
  const byKey = new Map();
  const usedIds = new Set();
  const campuses = new Map();
  const catSeen = new Set();
  const unknownQualTypes = new Set();
  const oddBodies = [];
  const longLabels = [];
  const unknownAttendance = new Set();

  for (const b of blocks) {
    const cat = mapCategory(b.qualType);
    if (!cat) unknownQualTypes.add(b.qualType);
    if (!/^(FULL|PART)\s*TIME$/i.test(b.attendance)) unknownAttendance.add(b.attendance);

    const campusId = slugify(b.campus.replace(/\s+CAMPUS$/i, ''));
    if (campusId && !campuses.has(campusId)) {
      campuses.set(campusId, {
        id: campusId,
        name: titleCase(b.campus.replace(/\s+CAMPUS$/i, '')),
        town: '',
        campus_manager: '',
        notes: [],
        programmes: [],
      });
    }

    if (b.body.length % 2 === 1) oddBodies.push(`${b.campus} / ${b.field} (${b.body.length} lines)`);
    for (const raw of b.body) {
      if (classify(raw) === 'label' && raw.length > 90) {
        longLabels.push(`${b.campus} / ${b.field}: ${raw}`);
      }
    }

    if (!cat) continue;
    catSeen.add(cat);

    for (const e of buildEntries(b.body)) {
      if (!e.name) continue;
      const key = `${cat} ${e.name.toLowerCase()}`;
      let prog = byKey.get(key);
      if (!prog) {
        // two distinct source names can slugify to the same id (e.g. "&" vs "and")
        const base = `${cat}_${slugify(e.name)}`;
        let id = base;
        for (let n = 2; usedIds.has(id); n++) id = `${base}_${n}`;
        usedIds.add(id);
        prog = {
          id,
          name: e.name,
          category: cat === 'ncv' ? 'NC(V)' : CATEGORY_META[cat].name,
          levels: [],
          description: '',
          careers: [],
          campus_ids: [],
          duration: parseDuration(b.duration),
          fee: null,
          eligibility: { requirements_provided: false },
          _cat: cat,
        };
        byKey.set(key, prog);
        categories[cat].push(prog);
      }
      for (const l of e.levels) if (!prog.levels.includes(l)) prog.levels.push(l);
      if (campusId && !prog.campus_ids.includes(campusId)) prog.campus_ids.push(campusId);
      if (!prog.description && e.description) prog.description = e.description;
      if (!prog.eligibility.requirements_provided && e.requirement) {
        prog.eligibility = { requirements_provided: true, raw: e.requirement };
      }
    }
  }

  for (const c of campuses.values()) {
    c.programmes = [...byKey.values()].filter((p) => p.campus_ids.includes(c.id)).map((p) => p.id);
  }

  const all = [...byKey.values()];
  for (const p of all) {
    p.levels = p.levels.sort();
    if (p.levels.length === 0) delete p.levels;
    if (p.campus_ids.length === 0) delete p.campus_ids;
    delete p._cat;
  }

  const counts = {
    ncv: categories.ncv.length,
    occupational: categories.occupational.length,
    report_191: categories.report_191.length,
  };

  const institution = meta
    ? {
        id: meta.id,
        name: meta.name,
        short_name: meta.short_name,
        slug: meta.slug,
        province: meta.province,
        city: meta.city,
        country: 'South Africa',
        avatar: meta.avatar || '',
        tel: '',
        email: '',
        fax: '',
        website: '',
        application_cycles: meta.application_cycles || [],
        logos: {},
        application_process: {
          required_certified_documents: [],
          document_check: { enabled: false, check_before_submission: false, block_application_if_required_document_missing: false },
          application_tracking: { available: false, external: false, name: '', url: '' },
        },
      }
    : { id: slug, name: slug, slug, country: 'South Africa' };

  const logoFile = logos.get(slug);
  if (logoFile) {
    institution.logos = {
      horizontal: `https://raw.githubusercontent.com/startedupco/institutions/main/${logoFile}`,
      vertical: '',
    };
  }

  const out = {
    application_process: institution.application_process,
    campuses: [...campuses.values()],
    institution,
    matching_rules: MATCHING_RULES,
    programme_categories: {
      ncv: { ...CATEGORY_META.ncv, programmes: categories.ncv },
      occupational: { ...CATEGORY_META.occupational, programmes: categories.occupational },
      report_191: { ...CATEGORY_META.report_191, programmes: categories.report_191 },
    },
    source: { institution: institution.name, website: '' },
    subject_dictionary: SUBJECT_DICTIONARY,
    summary: {
      campus_count: campuses.size,
      ncv_programme_count: counts.ncv,
      occupational_programme_count: counts.occupational,
      report_191_programme_count: counts.report_191,
      total_known_programmes: counts.ncv + counts.occupational + counts.report_191,
    },
  };

  // ---- report
  report.push(`## ${slug}`, '');
  report.push(`- source: \`${file}\``);
  report.push(
    `- blocks: ${blocks.length} · campuses: ${campuses.size} · programmes: ${out.summary.total_known_programmes}` +
      ` (ncv ${counts.ncv} / occupational ${counts.occupational} / report_191 ${counts.report_191})`
  );
  report.push(`- header qualification types mapped: ${[...catSeen].join(', ') || '(none)'}`);
  if (unknownQualTypes.size) report.push(`- **UNMAPPED qualification type**: ${[...unknownQualTypes].map((q) => `\`${q}\``).join(', ')}`);
  if (unknownAttendance.size) report.push(`- **UNEXPECTED attendance value**: ${[...unknownAttendance].map((q) => `\`${q}\``).join(', ')}`);
  if (oddBodies.length) report.push(`- odd-length bodies: ${oddBodies.length} — ${oddBodies.slice(0, 5).join('; ')}${oddBodies.length > 5 ? ' …' : ''}`);
  if (longLabels.length) report.push(`- **long label lines (review)**: ${longLabels.length}`);
  for (const w of warnings) report.push(`- **WARNING**: ${w}`);
  if (!logoFile) report.push('- no logo file found in institutions repo');
  report.push('');
  report.push('| programme | levels | category | campuses | requirement |');
  report.push('|---|---|---|---|---|');
  for (const cat of ['ncv', 'occupational', 'report_191']) {
    for (const p of categories[cat]) {
      const req = p.eligibility.requirements_provided ? p.eligibility.raw : '—';
      report.push(
        `| ${esc(p.name)} | ${(p.levels || []).join('/') || '—'} | ${p.category} | ` +
          `${(p.campus_ids || []).join(', ') || '—'} | ${esc(String(req).slice(0, 90))} |`
      );
    }
  }
  report.push('');
  if (longLabels.length) {
    report.push('<details><summary>Long label lines flagged for review</summary>', '');
    for (const l of longLabels) report.push(`- ${l}`);
    report.push('', '</details>', '');
  }

  return { slug, out, blocks: blocks.length };
}

function main() {
  const colleges = flattenColleges();
  const logos = logoIndex();
  const report = ['# Group A brochure conversion report', '', `Generated by \`tools/convert-brochure.mjs${DRY ? ' --dry' : ''}\`.`, ''];
  const results = [];

  for (const [file, slug] of SOURCES) {
    const r = build(file, slug, colleges, logos, report);
    if (r) results.push(r);
  }

  if (!DRY) {
    for (const r of results) {
      const dest = path.join(REPO, `${r.slug}-tvet-college-prospectus.json`);
      fs.writeFileSync(dest, JSON.stringify(r.out));
      console.log(`wrote ${path.basename(dest)}  ${JSON.stringify(r.out).length} bytes  ${r.blocks} blocks`);
    }
    const rp = path.join(HERE, 'convert-report.md');
    fs.writeFileSync(rp, report.join('\n'));
    console.log(`wrote ${path.relative(process.cwd(), rp)}`);
  } else {
    console.log(`dry run: ${results.length} files, nothing written`);
  }

  const prog = results.reduce((n, r) => n + r.out.summary.total_known_programmes, 0);
  const blocks = results.reduce((n, r) => n + r.blocks, 0);
  console.log(`total: ${results.length} files · ${blocks} blocks · ${prog} programmes`);
}

main();
