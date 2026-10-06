# institution-prospectus

Converted prospectus JSON for South African institutions, pulled by
`raw.githubusercontent.com/startedupco/prospectuses/main/...`. The repo is JSON-only —
raw source documents were removed and live in git history (commit `21f1e6d` and earlier).

## TVET college files (programme-structure format)

All TVET college prospectuses are stored as **one file per college** named
`<college>-prospectus.json`, each entry following the canonical schema in
[startedupco/programme-structure](https://github.com/startedupco/programme-structure)
(`institution` + `programme` + `entry_requirements`), so an applicant can be told
**YES / NO** whether they qualify:

```json
{
  "institution": "Taletso TVET College",
  "province": "North West",
  "source_files": ["taletso tvet.txt"],
  "updated": "2026-10-06",
  "programme_count": 32,
  "programmes": [
    {
      "institution": "Taletso TVET College",
      "programme": { "name": "...", "type": "NCV", "nqf_level": 4, "attendance": [], "campus": [], ... },
      "entry_requirements": {
        "age": { "min": null, "max": null },
        "match": "any",
        "options": [
          { "type": "grade", "level": 9, "aps": null, "subjects": [] },
          { "type": "ncv", "level": 3, "subjects": [ ... ] }
        ],
        "notes": ["..."]
      }
    }
  ]
}
```

`entry_requirements.match: "any"` means **any one** option qualifies the applicant
(Grade 12 *or* NCV L4 *or* N3 …). Option types: `grade`, `ncv`, `abet`, `nqf`,
`nated` (Report 191 certificate, e.g. `"N3"`), `plp`, `rpl`. Nothing is invented —
where a source stated no requirements, the standard national TVET minimum is used and
flagged in `entry_requirements.notes`.

`source_files` records the original source document each college was converted from
(the raw text itself now lives only in git history).

### Check eligibility (YES / NO / REVIEW)

[`eligibility.js`](eligibility.js) is dependency-free (Node + browser):

```js
const { checkProgramme, checkAll } = require('./eligibility.js');
const college = require('./taletso-tvet-college-prospectus.json');

checkProgramme({ grade: 12, aps: 30, subjects: { Mathematics: 65, English: 60 }, age: 19 },
               college.programmes[0]);
// -> { result: 'YES' | 'NO' | 'REVIEW', matchedOption: 0, notes: [...] }
```

### Colleges in this format (25 · 756 programmes)

| College | Province | Programmes | File |
|---|---|---|---|
| Boland TVET College | Western Cape | 18 | [boland-tvet-college-prospectus.json](boland-tvet-college-prospectus.json) |
| Capricorn TVET College | Limpopo | 33 | [capricorn-tvet-college-prospectus.json](capricorn-tvet-college-prospectus.json) |
| Eastcape Midlands TVET College | Eastern Cape | 19 | [eastcape-midlands-tvet-college-prospectus.json](eastcape-midlands-tvet-college-prospectus.json) |
| Ehlanzeni TVET College | Mpumalanga | 66 | [ehlanzeni-tvet-college-prospectus.json](ehlanzeni-tvet-college-prospectus.json) |
| Elangeni TVET College | KwaZulu-Natal | 1 | [elangeni-tvet-college-prospectus.json](elangeni-tvet-college-prospectus.json) |
| Flavius Mareka TVET College | Free State | 9 | [flavius-mareka-tvet-college-prospectus.json](flavius-mareka-tvet-college-prospectus.json) |
| Gert Sibande TVET College | Mpumalanga | 29 | [gert-sibande-tvet-college-prospectus.json](gert-sibande-tvet-college-prospectus.json) |
| Letaba TVET College | Limpopo | 17 | [letaba-tvet-college-prospectus.json](letaba-tvet-college-prospectus.json) |
| Lovedale TVET College | Eastern Cape | 16 | [lovedale-tvet-college-prospectus.json](lovedale-tvet-college-prospectus.json) |
| Majuba TVET College | KwaZulu-Natal | 50 | [majuba-tvet-college-prospectus.json](majuba-tvet-college-prospectus.json) |
| Maluti TVET College | Free State | 6 | [maluti-tvet-college-prospectus.json](maluti-tvet-college-prospectus.json) |
| Mnambithi TVET College | KwaZulu-Natal | 41 | [mnambithi-tvet-college-prospectus.json](mnambithi-tvet-college-prospectus.json) |
| Mopani TVET College | Limpopo | 39 | [mopani-tvet-college-prospectus.json](mopani-tvet-college-prospectus.json) |
| Motheo TVET College | Free State | 76 | [motheo-tvet-college-prospectus.json](motheo-tvet-college-prospectus.json) |
| Mthashana TVET College | KwaZulu-Natal | 22 | [mthashana-tvet-college-prospectus.json](mthashana-tvet-college-prospectus.json) |
| Nkangala TVET College | Mpumalanga | 45 | [nkangala-tvet-college-prospectus.json](nkangala-tvet-college-prospectus.json) |
| Northern Cape Rural TVET College | Northern Cape | 18 | [northern-cape-rural-tvet-college-prospectus.json](northern-cape-rural-tvet-college-prospectus.json) |
| Northern Cape Urban TVET College | Northern Cape | 24 | [northern-cape-urban-tvet-college-prospectus.json](northern-cape-urban-tvet-college-prospectus.json) |
| Orbit TVET College | North West | 31 | [orbit-tvet-college-prospectus.json](orbit-tvet-college-prospectus.json) |
| Taletso TVET College | North West | 32 | [taletso-tvet-college-prospectus.json](taletso-tvet-college-prospectus.json) |
| Thekwini TVET College | KwaZulu-Natal | 42 | [thekwini-tvet-college-prospectus.json](thekwini-tvet-college-prospectus.json) |
| Umfolozi TVET College | KwaZulu-Natal | 51 | [umfolozi-tvet-college-prospectus.json](umfolozi-tvet-college-prospectus.json) |
| Vhembe TVET College | Limpopo | 27 | [vhembe-tvet-college-prospectus.json](vhembe-tvet-college-prospectus.json) |
| Vuselela TVET College | North West | 30 | [vuselela-tvet-college-prospectus.json](vuselela-tvet-college-prospectus.json) |
| Waterberg TVET College | Limpopo | 14 | [waterberg-tvet-college-prospectus.json](waterberg-tvet-college-prospectus.json) |

**Still in the older `qualifications` format** (no source document available to
reconvert from): `northlink-`, `south-cape-`, `west-coast-tvet-college-prospectus.json`.
University prospectuses (`*-prospectus.json` for CPUT, UCT, UP, …) are unchanged.

## Data provenance

Programmes were converted from the original college programme documents; those raw
texts were deleted from the repo and can be recovered from git history (they are also
named per college in each entry's `source_files`).
Requirements are reproduced faithfully; `null` / `[]` means the source did not state a
value. Always confirm final admission decisions with the college — this repo is a guide,
not an offer of admission.
