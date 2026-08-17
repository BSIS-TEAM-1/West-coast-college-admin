# Add Subject — Flow & Process Logic

> Create Curriculum Wizard · Step 2: Add Subjects
> WCC Admin / Registrar System

---

## Two Modes of Adding Subjects

### Mode 1: Single Add

```
User types in search box
        │
        ▼
┌─────────────────────────────┐
│  250ms debounce             │  ◄── Prevents spamming the API on every keystroke
│  (subjectSearch state)      │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│  fetchSubjectSearch(query)                  │  ◄── CreateCurriculumPage.tsx:203-225
│                                             │
│  Builds query params:                       │
│    q=<search text>                          │
│    isActive=true                            │
│    limit=20                                 │  ◄── Server-side pagination
│    excludeIds=<already-placed IDs>          │  ◄── Duplicate prevention at query level
│                                             │
│  GET /api/registrar/subjects?...            │
└─────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│  Backend: SubjectController.getSubjects     │  ◄── subjectController.js:84
│                                             │
│  - Builds MongoDB query (code/title regex)  │
│  - Excludes excludeIds via _id: $nin        │
│  - .skip(offset).limit(20)                  │
│  - Returns { data, total, limit, offset }   │
└─────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│  Frontend receives results                  │
│                                             │
│  setSubjectResults(results)                 │  ◄── Display up to 20 results
│  setSubjectTotal(total)                     │  ◄── Full match count
│  cacheSubjects(results)                     │  ◄── Store in ref cache for code/title lookup
└─────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│  User clicks [Add] on a search result       │
│                                             │
│  Calls addPlacement(subjectId)              │  ◄── CreateCurriculumPage.tsx:268
└─────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│  addPlacement(subjectId)                    │  ◄── CreateCurriculumPage.tsx:268-286
│                                             │
│  1. Duplicate check:                        │
│     if placedSubjectIds.has(subjectId)      │  ◄── Frontend guard (also excluded from search)
│       return (silent no-op)                 │
│                                             │
│  2. Creates DraftPlacement with defaults:   │
│     localId: "place-N" (unique counter)     │
│     subjectId: <the subject's _id>          │
│     yearLevel: 1                            │  ◄── Default
│     semester: '1st'                         │  ◄── Default
│     type: 'General'                         │  ◄── Default
│     isRequired: true                        │  ◄── Default
│     displayOrder: prev.length               │  ◄── Auto-increment
│     prerequisiteSubjectIds: []              │  ◄── Empty = inherit Subject defaults
│     prereqMode: 'default'                   │  ◄── Key: inherit from Subject model
│                                             │
│  3. ensureSubjectCached(subjectId)          │  ◄── Fetch full subject data (with populated prereqs)
│                                             │      for display in the draft table
└─────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│  Placement appears in Draft Placements table│
│                                             │
│  Shows: Code | Title | Year | Semester |    │
│         Type | Req | Prerequisites | Actions│
│                                             │
│  Prerequisites column shows:                │
│    [default] MATH101  ← if Subject has      │
│                        default prereqs      │
│    "None"           ← if no defaults        │
│                                             │
│  Actions: [Edit] [Remove]                   │
└─────────────────────────────────────────────┘
```

---

### Mode 2: Bulk Add

```
User clicks [Bulk Select] toggle
        │
        ▼
┌─────────────────────────────────────────────┐
│  Same search mechanism, but results show    │
│  checkboxes instead of [Add] buttons        │
│                                             │
│  bulkSelectedIds: Set<string>               │  ◄── Tracks checked subjects
└─────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│  User checks multiple subjects              │
│  "8 subjects selected" counter updates      │
└─────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│  User clicks [Add 8 Subjects]               │
│                                             │
│  Calls addBulkPlacements(selectedIds)       │  ◄── CreateCurriculumPage.tsx:290
└─────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│  addBulkPlacements(subjectIds)              │  ◄── CreateCurriculumPage.tsx:290-310
│                                             │
│  1. Filter out already-placed:              │
│     toAdd = subjectIds.filter(              │
│       id => !existing.has(id)               │
│     )                                       │
│                                             │
│  2. Create INDEPENDENT DraftPlacement       │  ◄── Critical: no shared config
│     for each subject:                       │
│     ┌──────────────────────────┐            │
│     │ Placement A (subjectId=1)│            │
│     │  yearLevel: 1            │            │
│     │  semester: '1st'         │            │
│     │  prereqMode: 'default'   │            │
│     │  prereqs: []             │            │
│     ├──────────────────────────┤            │
│     │ Placement B (subjectId=2)│            │
│     │  yearLevel: 1            │            │
│     │  semester: '1st'         │            │
│     │  prereqMode: 'default'   │            │
│     │  prereqs: []             │            │
│     ├──────────────────────────┤            │
│     │ Placement C (subjectId=3)│            │
│     │  ...own config...        │            │
│     └──────────────────────────┘            │
│                                             │
│  3. displayOrder = prev.length + index      │  ◄── Sequential auto-ordering
│  4. ensureSubjectCached for each            │
│  5. Clear bulkSelectedIds                   │
└─────────────────────────────────────────────┘
```

---

## After Adding: Configure Placements

```
                    ┌──────────────────────┐
                    │  Draft Placements    │
                    │  Table               │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
     [Edit] button     [Remove] button    Checkbox select
              │                │                │
              ▼                ▼                ▼
┌──────────────────┐  removePlacement   Select multiple
│ PlacementEditor  │  (line 312)        → [Bulk Configure]
│ Modal opens      │  - Filters out    
│                  │    from placements
│ Fields:          │  - Clears draft
│  Year Level      │    selection
│  Semester        │
│  Subject Type    │         BulkConfigureModal
│  Required?       │         (only applies checked fields)
│  Display Order   │
│                  │
│ Prerequisites:   │
│  ○ Use defaults  │
│  ● Customize     │
│                  │
│  [chip×] [chip×] │
│  [+ search prereq]│
└──────────────────┘
```

---

## Prerequisite Logic (per placement)

```
┌──────────────────────────────────────────────┐
│ prereqMode = 'default'                       │
│                                              │
│  prerequisiteSubjectIds: []  (empty)         │
│  → On submit, backend seeds from             │
│    Subject.prerequisiteSubjectIds            │  ◄── Backend curriculumController.js:109-111
│  → Display shows Subject's default prereqs   │
│  → Shows [default] badge                     │
└──────────────────────────────────────────────┘
                    │
        User toggles "Customize"
        or clicks a prereq chip
                    │
                    ▼
┌──────────────────────────────────────────────┐
│ prereqMode = 'custom'                        │
│                                              │
│  prerequisiteSubjectIds: [id1, id2, ...]     │
│  → Seeds from Subject defaults first         │  ◄── setPrereqMode (line 348)
│  → User can add/remove via search picker     │
│  → Self-prerequisite blocked                 │  ◄── togglePrerequisite (line 336)
│  → On submit, sends explicit list            │
│  → Backend uses these, does NOT fall back    │
└──────────────────────────────────────────────┘
```

---

## Submit Flow (Step 3 → Backend)

```
handleCreate()                              ◄── CreateCurriculumPage.tsx:383
        │
        ▼
POST /api/registrar/curriculums
body: {
  programCode, name, version, code,
  effectiveSchoolYear: "2026-2027",        ◄── formatSchoolYear(start, end)
  subjects: [
    {
      subjectId, yearLevel, semester,
      type, isRequired, displayOrder,
      prerequisiteSubjectIds:              ◄── [] if 'default', explicit if 'custom'
    },
    ...each placement independently
  ]
}
        │
        ▼
┌─────────────────────────────────────────────┐
│ Backend: validatePlacements()               │  ◄── curriculumController.js:28
│                                             │
│  For each placement:                        │
│  ✓ subjectId present                        │
│  ✓ No duplicate subjectId                   │
│  ✓ yearLevel 1-6                            │
│  ✓ semester in [1st, 2nd, Summer]           │
│  ✓ type in [General, Major, Professional,   │
│             Elective]                       │
│  ✓ No self-prerequisite                     │
│  ✓ No duplicate prerequisites               │
│  ✓ Subject exists in DB                     │
│  ✓ Subject is active                        │
│  ✓ All prerequisite subjects exist          │
│  → If empty prereqs, seed from              │
│    Subject.prerequisiteSubjectIds           │
│                                             │
│  If ANY validation fails → 400, nothing     │
│  written                                    │
└─────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│ MongoDB Transaction (atomic)                │  ◄── curriculumController.js:201
│                                             │
│  session.withTransaction(() => {            │
│    1. Curriculum.create(...)                │
│    2. CurriculumSubject.insertMany(         │
│         placements with snapshots:          │
│           courseNo ← Subject.code           │
│           descriptiveTitle ← Subject.title  │
│           units ← Subject.units             │
│           lecturePeriods ← Subject.lecture  │
│           labPeriods ← Subject.lab          │
│           prerequisiteSubjectIds ← explicit │
│             or seeded defaults              │
│       , { session })                        │
│  })                                         │
│                                             │
│  If step 2 fails → ROLLBACK                 │
│  No partial curriculum remains              │
└─────────────────────────────────────────────┘
        │
        ▼
201 Created → onCreated(curriculumId)
```

---

## Key Design Principles

| Principle | Implementation |
|---|---|
| **Search-first, not list-first** | Server-side search with 20-result pages, never loads full catalog |
| **Independent placements** | Each bulk-added subject gets its own `DraftPlacement` object — no shared config |
| **Duplicate prevention (dual layer)** | Frontend: `excludeIds` removes placed subjects from search + `placedSubjectIds` Set guard. Backend: `seenSubjectIds` Set + unique DB index |
| **Prerequisite inheritance** | `prereqMode: 'default'` sends empty array → backend seeds from `Subject.prerequisiteSubjectIds` |
| **Prerequisite override** | `prereqMode: 'custom'` sends explicit list → backend uses it as-is |
| **Self-prerequisite blocked** | Frontend `togglePrerequisite` line 336 + backend validation line 64 |
| **Atomic creation** | MongoDB transaction wraps Curriculum + CurriculumSubject creation |
| **Snapshot architecture** | Academic fields copied from Subject → CurriculumSubject at creation time, never read live afterward |

---

## File References

| File | Purpose |
|---|---|
| `src/pages/registrar/CreateCurriculumPage.tsx` | Frontend wizard (search, bulk, draft table, modals, submit) |
| `server/controllers/subjectController.js` | Subject search API (pagination, excludeIds, isActive filter) |
| `server/controllers/curriculumController.js` | `validatePlacements()` + `createCurriculum()` with transaction |
| `server/models/Subject.js` | Canonical subject definition (owns `prerequisiteSubjectIds` defaults) |
| `server/models/CurriculumSubject.js` | Placement + snapshot (owns per-placement `prerequisiteSubjectIds`) |
| `server/securityMiddleware.js` | Joi validation for subject query params (limit, offset, excludeIds) |
| `server/curriculumController.test.js` | 29 tests covering bulk, duplicate, self-prereq, rollback, defaults, override |
