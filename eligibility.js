/**
 * eligibility.js - reference YES / NO / REVIEW checker for programme entry requirements.
 *
 * Works in Node and the browser (no dependencies).
 *
 * Applicant profile:
 * {
 *   grade: 12,                 // highest school grade passed (9..12) or null
 *   aps: 30,                   // Admission Point Score or null
 *   subjects: { "Mathematics": 65, "English": 55 },   // marks (%) or null
 *   ncv_level: null,           // highest NCV level completed (2..4) or null
 *   nated: null,               // highest Report 191 certificate, e.g. "N3"
 *   nqf_level: null,           // highest NQF level attained or null
 *   abet_level: null,          // ABET/Amended Senior Certificate level (1..4) or null
 *   plp: null,                 // completed the college Placement Test? true/false/null
 *   rpl: null,                 // completed RPL assessment? true/false/null
 *   age: 19                    // applicant age or null
 * }
 *
 * Usage:
 *   const { checkProgramme } = require('./eligibility.js');
 *   const entry = require('./tvet/taletso-tvet-college.json').programmes[0];
 *   console.log(checkProgramme(profile, entry));  // { result: 'YES' | 'NO' | 'REVIEW', ... }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NevableEligibility = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var YES = 'yes', NO = 'no', UNKNOWN = 'unknown';
  var N_LEVELS = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6'];

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  function normSubject(name) {
    var s = String(name || '').toLowerCase().trim()
      .replace(/&/g, ' and ')
      .replace(/\s+/g, ' ')
      .replace(/\b1st\b/g, 'first')
      .replace(/\bfal\b/g, 'first additional language')
      .replace(/ first additional language$/, '')
      .replace(/\bmaths\b/g, 'mathematics')
      .replace(/\bmath\b/g, 'mathematics')
      .replace(/\bphys(ical)? scien(ce|ces)\b/g, 'physical sciences')
      .replace(/\bnatural scien(ce|ces)\b/g, 'physical sciences');
    return s;
  }

  function normalizedMarks(profile, markKey) {
    var src = (profile && profile[markKey]) || null;
    if (!src) return null;
    var out = {};
    Object.keys(src).forEach(function (k) {
      var v = src[k];
      if (v == null) return;
      var key = normSubject(k);
      if (!(key in out) || num(v) > num(out[key])) out[key] = v;
    });
    return Object.keys(out).length ? out : null;
  }

  function checkSubjectRows(profile, rows, markKey) {
    if (!Array.isArray(rows) || rows.length === 0) return YES;
    var marks = normalizedMarks(profile, markKey);
    var allKnown = true, allOk = true;
    rows.forEach(function (row) {
      var choices = row.choices || [];
      var choiceKnown = false, choiceOk = false;
      choices.forEach(function (ch) {
        var key = normSubject(ch.name);
        if (!marks || marks[key] == null) return;
        choiceKnown = true;
        var mark = num(marks[key]);
        if (mark === null) return;
        if (ch.percentage == null || mark >= ch.percentage) choiceOk = true;
      });
      if (!choiceKnown) { allKnown = false; return; }
      if (row.match === 'all') { if (!choiceOk) allOk = false; }
      else if (!choiceOk) allOk = false;
    });
    if (!allKnown) return UNKNOWN;
    return allOk ? YES : NO;
  }

  function checkOption(profile, opt) {
    if (!opt || typeof opt !== 'object') return UNKNOWN;
    var worst = YES;
    function set(r) { if (r === NO) worst = NO; else if (r === UNKNOWN && worst !== NO) worst = UNKNOWN; }

    switch (opt.type) {
      case 'grade': {
        var g = num(profile.grade);
        if (g === null) set(NO);
        else if (opt.level != null && g < opt.level) set(NO);
        if (opt.aps != null) {
          var aps = num(profile.aps);
          if (aps === null) set(UNKNOWN);
          else if (aps < opt.aps) set(NO);
        }
        set(checkSubjectRows(profile, opt.subjects, 'subjects'));
        break;
      }
      case 'ncv': {
        var n = num(profile.ncv_level);
        if (n === null) set(NO);
        else if (opt.level != null && n < opt.level) set(NO);
        set(checkSubjectRows(profile, opt.subjects, 'subjects'));
        break;
      }
      case 'abet': {
        var a = num(profile.abet_level);
        if (a === null) set(NO);
        else if (opt.level != null && a < opt.level) set(NO);
        set(checkSubjectRows(profile, opt.subjects, 'subjects'));
        break;
      }
      case 'nqf': {
        var q = num(profile.nqf_level);
        if (q === null) set(NO);
        else if (opt.level != null && q < opt.level) set(NO);
        break;
      }
      case 'nated': {
        var held = typeof profile.nated === 'string' ? profile.nated.toUpperCase().trim() : null;
        if (!held) { set(NO); break; }
        var want = String(opt.level || '').toUpperCase().trim();
        var hi = N_LEVELS.indexOf(held), wi = N_LEVELS.indexOf(want);
        if (hi < 0 || wi < 0) set(UNKNOWN);
        else if (hi < wi) set(NO);
        break;
      }
      case 'plp':
      case 'rpl': {
        if (profile[opt.type] === true) set(YES);
        else if (profile[opt.type] === false) set(NO);
        else set(UNKNOWN);
        break;
      }
      default:
        set(UNKNOWN);
    }
    return worst;
  }

  /**
   * Check one canonical programme entry ({ institution, programme, entry_requirements }).
   * Returns { result: 'YES'|'NO'|'REVIEW', matchedOption: number|null, ageBlock: boolean, notes: [] }
   *   YES    - at least one admissions pathway is fully satisfied
   *   NO      - every pathway is known and failed (or the age minimum rules the applicant out)
   *   REVIEW - not enough information (e.g. subject marks not supplied) or only test/RPL
   *            pathways remain. Level fields left null are treated as "not held".
   */
  function checkProgramme(profile, entry) {
    profile = profile || {};
    var er = entry && entry.entry_requirements;
    var out = { result: 'REVIEW', matchedOption: null, ageBlock: false, notes: [] };
    if (!er || !Array.isArray(er.options) || er.options.length === 0) {
      out.notes.push('No entry requirements recorded for this programme.');
      return out;
    }
    if (Array.isArray(er.notes)) out.notes = er.notes.slice();

    var hasData = ['grade', 'aps', 'ncv_level', 'nated', 'nqf_level', 'abet_level', 'age']
      .some(function (k) { return profile[k] != null; })
      || (profile.subjects && Object.keys(profile.subjects).length > 0)
      || profile.plp === true || profile.plp === false
      || profile.rpl === true || profile.rpl === false;
    if (!hasData) {
      out.notes.push('No applicant details supplied - add grade, subjects and levels to get a YES/NO.');
      return out;
    }

    var age = er.age || {};
    var applicantAge = num(profile.age);
    if (age.min != null && applicantAge !== null && applicantAge < age.min) {
      out.result = 'NO';
      out.ageBlock = true;
      out.notes.push('Minimum age ' + age.min + ' not met.');
      return out;
    }

    var results = er.options.map(function (o) { return checkOption(profile, o); });
    var anyYes = results.indexOf(YES) >= 0;
    var anyUnknown = results.indexOf(UNKNOWN) >= 0;

    if (er.match === 'all') {
      if (results.every(function (r) { return r === YES; })) { out.result = 'YES'; out.matchedOption = results.indexOf(YES); }
      else if (results.indexOf(NO) >= 0) out.result = 'NO';
      else out.result = 'REVIEW';
      return out;
    }

    if (anyYes) {
      out.result = 'YES';
      out.matchedOption = results.indexOf(YES);
      return out;
    }
    out.result = anyUnknown ? 'REVIEW' : 'NO';
    return out;
  }

  function checkAll(profile, programmes) {
    return (programmes || []).map(function (p) {
      var r = checkProgramme(profile, p);
      return {
        institution: p.institution,
        programme: p.programme && p.programme.name,
        result: r.result,
        matchedOption: r.matchedOption,
        notes: r.notes
      };
    });
  }

  return { checkProgramme: checkProgramme, checkAll: checkAll, checkOption: checkOption };
});
