# Auto-Assign Subjects from Curriculum — Architecture Analysis

> Should we auto-assign subjects to block sections when a curriculum is assigned to a block?
> WCC Admin / Registrar System

---

## Current Architecture (What Exists Today)

### Three Layers of Subject Data

```
Layer 1: CURRICULUM (the blueprint)
   "What subjects belong to BEED Curriculum 2026?"
   │
   ├── Curriculum
   │     programCode: 101 (BEED)
   │     version: 2026
   │     status: Draft → Active
   │
   └── CurriculumSubject (placements)
         curriculumId → Curriculum
         subjectId → Subject
         yearLevel: 1
         semester: '1st'
         type: 'General'
         isRequired: true
         prerequisiteSubjectIds: [...]
         snapshot: courseNo, descriptiveTitle, units, lecturePeriods, labPeriods
```

```
Layer 2: BLOCK GROUP (the cohort)
   "Which curriculum does this block follow?"
   │
   └── BlockGroup
         name: "BEED-1A"
         courseId: 101
         courseCode: "BEED"
         yearLevel: 1
         semester: '1st'
         schoolYear: "2026-2027"
         curriculumId → Curriculum        ◄── Already linked!
         studentClassification: 'Regular'
         │
         └── BlockSection
               blockGroupId → BlockGroup
               sectionCode: "BEED-1A"
               capacity: 40
               currentPopulation: 35
```

```
Layer 3: BLOCK SUBJECT ASSIGNMENT (the schedule)
   "Which subjects are offered to this block this semester?"
   │
   └── BlockSubjectAssignment
         blockSectionId → BlockSection
         subjectId → Subject
         semester: '1st'
         academicYear: "2026-2027"
         assignedBy → Admin
         assignedAt: Date
```

### Key Observation

The BlockGroup already knows:
- ✅ Which curriculum it follows (`curriculumId`)
- ✅ What year level the students are in (`yearLevel`)
- ✅ What semester it is (`semester`)
- ✅ What school year (`schoolYear`)

The CurriculumSubject already knows:
- ✅ Which subjects belong to that curriculum
- ✅ At which year level
- ✅ At which semester

**The data to auto-derive block subject assignments already exists.**
**The registrar currently re-selects subjects manually that the curriculum already defines.**

---

## The Problem Today

### Current Manual Flow (Repetitive)

```
1. Registrar creates curriculum
   "BEED Curriculum 2026 has 48 subjects across 4 years"
         │
         ▼
2. Registrar creates block group
   BEED-1A · Year 1 · 1st Semester · Curriculum 2026
         │
         ▼
3. Registrar goes to Assign Subject page
   Manually searches and selects:
     ☑ ENG101
     ☑ MATH101
     ☑ SCI101
     ☑ HIST101
     ☑ FIL101
     ☑ PE101
   ...re-selecting subjects the curriculum already defines
         │
         ▼
4. Repeat for every block section, every semester, every year
```

### Why This Is Inefficient

- The curriculum already says "Year 1, 1st Semester = ENG101, MATH101, SCI101, HIST101"
- The block group already knows it follows Curriculum 2026, Year 1, 1st Semester
- The registrar is manually copying information that already exists in the system
- For 48 subjects across 8 semesters × multiple blocks = hundreds of manual clicks

---

## Proposed Solution: Auto-Assign from Curriculum

### New Flow (With Auto-Assign)

```
1. Registrar creates curriculum
   "BEED Curriculum 2026 has 48 subjects across 4 years"
         │
         ▼
2. Registrar creates block group
   BEED-1A · Year 1 · 1st Semester · Curriculum 2026
         │
         ▼
3. Registrar clicks [ ⚡ Auto-assign from curriculum ]
         │
         ▼
   Backend reads CurriculumSubject where:
     curriculumId = blockGroup.curriculumId
     yearLevel = blockGroup.yearLevel
     semester = blockGroup.semester
         │
         ▼
   Creates BlockSubjectAssignment for each matching subject
   across all sections in the block group
         │
         ▼
   Block 1A now has: ENG101, MATH101, SCI101, HIST101
   (for academic year 2026-2027, 1st semester)
         │
         ▼
4. Registrar reviews and adjusts:
   - Remove a subject not being offered this semester
   - Add an elective manually
   - Assign instructors
```

### What Auto-Assign Does

```
┌─────────────────────────────────────────────────────────────┐
│  INPUT                                                       │
│                                                             │
│  BlockGroup:                                                 │
│    curriculumId: "curr-2026-beed"                           │
│    yearLevel: 1                                             │
│    semester: '1st'                                          │
│    schoolYear: '2026-2027'                                  │
│    sections: [BEED-1A, BEED-1B, BEED-1C]                    │
│                                                             │
│  CurriculumSubject (matched):                               │
│    ENG101 · Year 1 · 1st · General · Required               │
│    MATH101 · Year 1 · 1st · General · Required              │
│    SCI101 · Year 1 · 1st · General · Required               │
│    HIST101 · Year 1 · 1st · General · Required              │
│    FIL101 · Year 1 · 1st · General · Required               │
│    PE101 · Year 1 · 1st · General · Required                │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  OUTPUT                                                      │
│                                                             │
│  BlockSubjectAssignment records created:                     │
│                                                             │
│  BEED-1A × ENG101 × 1st × 2026-2027                         │
│  BEED-1A × MATH101 × 1st × 2026-2027                        │
│  BEED-1A × SCI101 × 1st × 2026-2027                         │
│  BEED-1A × HIST101 × 1st × 2026-2027                        │
│  BEED-1A × FIL101 × 1st × 2026-2027                         │
│  BEED-1A × PE101 × 1st × 2026-2027                          │
│  BEED-1B × ENG101 × 1st × 2026-2027                         │
│  BEED-1B × MATH101 × 1st × 2026-2027                        │
│  ... (repeated for each section)                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Why You Still Need Manual Control After

Auto-assign handles the **common case** (required subjects for regular students).
Manual control is still needed for the **edge cases**:

| Scenario | Why auto-assign can't handle it |
|---|---|
| **Electives** | Not all students take electives — registrar chooses which to offer |
| **Subject not offered** | No available instructor, low enrollment → subject deferred to next semester |
| **Irregular/Transferee blocks** | May need different subjects than the curriculum default |
| **Instructor assignment** | `BlockSubjectAssignment` doesn't store instructor — that's done separately |
| **Summer subjects** | Conditional, not always offered |
| **Curriculum transition** | Mid-year curriculum change → some subjects from old, some from new |
| **Partial offering** | Registrar may choose to offer only 5 of 8 subjects this semester |

### Recommended UI

```
Assign Subjects to Block BEED-1A

┌─────────────────────────────────────────────────────┐
│  Block: BEED-1A · Year 1 · 1st Sem · 2026-2027     │
│  Curriculum: BEED Curriculum 2026                   │
│                                                    │
│  [ ⚡ Auto-assign from curriculum ]                 │  ◄── NEW: populates from CurriculumSubject
│                                                    │
│  Currently assigned:                               │
│  ☑ ENG101 · English Communication                  │  ◄── Auto-assigned
│  ☑ MATH101 · College Algebra                       │  ◄── Auto-assigned
│  ☑ SCI101 · General Science                        │  ◄── Auto-assigned
│  ☑ HIST101 · Philippine History                    │  ◄── Auto-assigned
│  ☑ FIL101 · Filipino Communication                 │  ◄── Auto-assigned
│  ☑ PE101 · Physical Fitness                        │  ◄── Auto-assigned
│  ☐ ELECTIVE01 · (not auto-assigned)                │  ◄── Registrar adds manually
│                                                    │
│  [ + Add subject manually ]                         │  ◄── Still needed for electives/overrides
│  [ Remove selected ]                                │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Backend

```
New endpoint: POST /api/registrar/block-groups/:id/auto-assign

Request body:
{
  "academicYear": "2026-2027",       // optional, defaults to blockGroup.schoolYear
  "semester": "1st",                 // optional, defaults to blockGroup.semester
  "yearLevel": 1,                    // optional, defaults to blockGroup.yearLevel
  "sectionIds": ["sec1", "sec2"],    // optional, defaults to all sections in group
  "overwrite": false                 // if true, removes existing assignments first
}

Logic:
1. Load BlockGroup, get curriculumId + yearLevel + semester
2. If no curriculumId → 400 "Block group has no curriculum assigned"
3. Query CurriculumSubject:
     curriculumId = blockGroup.curriculumId
     yearLevel = blockGroup.yearLevel
     semester = blockGroup.semester
4. Load all BlockSections in the block group
5. For each section × each CurriculumSubject:
     - Check if BlockSubjectAssignment already exists (skip if it does, unless overwrite)
     - Create BlockSubjectAssignment:
         blockSectionId = section._id
         subjectId = curriculumSubject.subjectId
         semester = blockGroup.semester
         academicYear = blockGroup.schoolYear
         assignedBy = req.admin._id
6. Return summary:
     { assigned: 24, skipped: 6, sections: 4, subjects: 6 }
```

### Frontend

```
- Add [ ⚡ Auto-assign from curriculum ] button to Assign Subject page
- Button is disabled if block group has no curriculumId
- On click: confirm dialog → call POST /block-groups/:id/auto-assign
- Show result summary: "24 assignments created across 4 sections"
- Refresh the assigned subjects list
- Manual add/remove still works after auto-assign
```

### What Does NOT Change

| Component | Change |
|---|---|
| Curriculum model | ❌ No changes |
| CurriculumSubject model | ❌ No changes |
| BlockGroup model | ❌ No changes (already has curriculumId) |
| BlockSection model | ❌ No changes |
| BlockSubjectAssignment model | ❌ No changes |
| Assign Subject page | ✅ Add auto-assign button (keep manual controls) |
| Create Curriculum wizard | ❌ No changes |
| Curriculum Details page | ❌ No changes |

---

## Data Flow Diagram (Complete Picture)

```
                    ┌──────────────┐
                    │  CURRICULUM  │
                    │  (blueprint) │
                    └──────┬───────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            ▼              ▼              ▼
   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
   │ Year 1 · 1st│ │ Year 1 · 2nd│ │ Year 2 · 1st│
   │ ENG101      │ │ ENG102      │ │ ENG201      │
   │ MATH101     │ │ MATH102     │ │ MATH201     │
   │ SCI101      │ │ SCI102      │ │ SCI201      │
   │ HIST101     │ │ HIST102     │ │ HIST201     │
   └──────┬──────┘ └─────────────┘ └─────────────┘
          │
          │  curriculumId + yearLevel + semester
          │
          ▼
   ┌──────────────┐
   │ BLOCK GROUP  │
   │ BEED-1A      │
   │ curriculumId │──────► links to curriculum
   │ yearLevel: 1 │
   │ semester: 1st│
   │ schoolYear:  │
   │  2026-2027   │
   └──────┬───────┘
          │
          │  [ Auto-assign ]
          │
          ▼
   ┌──────────────────────────────────────┐
   │ BLOCK SUBJECT ASSIGNMENTS            │
   │                                      │
   │ BEED-1A × ENG101 × 1st × 2026-2027  │  ◄── auto-created
   │ BEED-1A × MATH101 × 1st × 2026-2027 │  ◄── auto-created
   │ BEED-1A × SCI101 × 1st × 2026-2027  │  ◄── auto-created
   │ BEED-1A × HIST101 × 1st × 2026-2027 │  ◄── auto-created
   │                                      │
   │ + manual additions:                  │
   │ BEED-1A × ELECTIVE01 × 1st × 2026   │  ◄── registrar adds manually
   └──────────────────────────────────────┘
          │
          │
          ▼
   ┌──────────────┐
   │  STUDENTS    │
   │  enroll in   │
   │  assigned    │
   │  subjects    │
   └──────────────┘
```

---

## Edge Cases to Handle

| Edge Case | Handling |
|---|---|
| Block group has no `curriculumId` | Disable auto-assign button, show message "Assign a curriculum to this block first" |
| Curriculum has no subjects for this year/semester | Return "No subjects found in curriculum for Year 1, 1st Semester" |
| Assignments already exist | Skip existing (default) or overwrite (if `overwrite: true`) |
| Curriculum is Draft (not Active) | Allow auto-assign but warn "Curriculum is still in Draft status" |
| Block group has no sections | Return "No sections found in this block group" |
| Subject in curriculum is inactive | Skip with warning "Skipped MATH101 (subject is inactive)" |
| `isRequired: false` subjects (electives) | Option: `includeElectives: false` (default) to skip non-required |

---

## Summary

| Question | Answer |
|---|---|
| Can we auto-assign subjects from curriculum to blocks? | **Yes** — the data already supports it |
| Should we remove the Assign Subject page? | **No** — still needed for electives, overrides, edge cases |
| Is this a big change? | **No** — 1 new backend endpoint + 1 button on frontend |
| Does the data model change? | **No** — all fields already exist |
| Does the curriculum change? | **No** — curriculum is the source of truth, not modified |
| Does the block assignment change? | **No** — same model, just populated automatically |

**The curriculum is the blueprint. Auto-assign copies the blueprint to the schedule. Manual control adjusts the schedule for real-world exceptions.**
