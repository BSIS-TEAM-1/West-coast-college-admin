# Use Case Diagram Guardrail

## 1. Purpose

A Use Case Diagram must describe the system **from the perspective of external actors and their goals**.

The diagram must answer:

> **Who interacts with the system, and what goal/function do they accomplish through the system?**

It must not attempt to describe database structure, implementation details, screen layouts, algorithms, or detailed process sequences.

---

# 2. Determine Whether a Use Case Diagram Is Appropriate

Use a Use Case Diagram when the user wants to represent:

* System requirements
* User goals
* System functionality
* Actor-system interactions
* System scope
* External-system interactions

Do NOT use a Use Case Diagram as the primary diagram for:

* Database relationships → Class/ER diagram
* Detailed workflow → Activity diagram
* Time-ordered interactions → Sequence diagram
* System architecture → Component diagram
* Physical infrastructure → Deployment diagram
* Object lifecycle → State Machine diagram

If the requested information belongs to another diagram type, recommend that diagram instead of forcing it into a Use Case Diagram.

---

# 3. Identify Actors Correctly

An actor is an **external entity that interacts with the system**.

Actors can be:

* Human users
* Organizations
* External software systems
* Hardware devices
* External services

Examples:

```text
Student
Teacher
Administrator
Payment Gateway
Email Service
Biometric Scanner
```

## Actor Rule

An actor must be **outside the system boundary**.

Do not model internal components as actors.

Incorrect:

```text
Student Information System
        |
     Database
```

if the database is an internal component of the system.

Correct:

```text
Payment Gateway
        |
        v
+--------------------------+
| Student Information      |
| System                   |
|                          |
| Process Payment          |
+--------------------------+
```

when the Payment Gateway is an external service.

---

# 4. Identify Use Cases as User Goals

A use case should represent a **meaningful goal or service provided by the system**.

Good:

```text
Register Student
Enroll in Course
View Grades
Approve Enrollment
Generate Report
Process Payment
```

Avoid overly technical actions:

```text
Click Button
Open Modal
Execute SQL Query
Call API
Insert Database Record
Validate HTTP Request
```

These are implementation/UI details rather than user goals.

---

# 5. Use Case Naming

Use short, clear, goal-oriented names.

Prefer:

```text
Register Student
Manage Enrollment
Approve Request
Generate Report
View Payment History
```

Avoid:

```text
Student Registration Functionality
System Processing Module
Database Student Registration
Do Registration Things
```

Use consistent terminology across the entire project.

If the system calls an entity "Student", do not randomly switch to:

```text
Learner
Student User
Pupil
Student Account
```

unless these represent genuinely different concepts.

---

# 6. System Boundary

Every Use Case Diagram must clearly identify the system being modeled.

Use:

```text
+--------------------------------------+
|       Student Information System     |
|                                      |
|   (Register Student)                 |
|   (Enroll Student)                   |
|   (View Grades)                      |
|                                      |
+--------------------------------------+
```

Actors remain outside the boundary.

The boundary defines:

> **What functionality belongs to this system?**

---

# 7. Association Relationship

Use an association when an actor participates in or interacts with a use case.

Example:

```text
Student -------- (Enroll in Course)
```

The association means:

> The Student interacts with the Enroll in Course functionality.

Do not create associations simply because two elements are related conceptually.

---

# 8. `<<include>>` Guardrail

Use `<<include>>` when the included use case represents **required behavior of the base use case**.

General structure:

```text
(Base Use Case)
      |
      | <<include>>
      v
(Included Use Case)
```

Example:

```text
(Submit Enrollment)
       |
       | <<include>>
       v
(Validate Enrollment)
```

Meaning:

> Submit Enrollment requires Validate Enrollment.

## Include Test

Ask:

> **Can the base use case normally complete without executing the included behavior?**

If NO → `<<include>>` may be appropriate.

If YES → do not automatically use `include`.

### Important

Do not use `include` merely because:

* One action happens before another.
* One feature is related to another.
* One function is commonly used.
* Two functions share a similar name.

---

# 9. `<<extend>>` Guardrail

Use `<<extend>>` when additional behavior occurs **conditionally or optionally**.

Example:

```text
(Select Seat)
      |
      | <<extend>>
      v
(Book Flight)
```

Meaning:

> Selecting a seat is additional behavior that may occur during flight booking.

## Extend Test

Ask:

> **Can the base use case be completed without the extending behavior?**

If YES, and the additional behavior is conditional/optional, `extend` may be appropriate.

If NO, consider `include` instead.

---

# 10. Never Confuse Include and Extend

Use this decision rule:

```text
Is the additional behavior REQUIRED?
        |
       YES
        |
     INCLUDE

Is the additional behavior OPTIONAL/CONDITIONAL?
        |
       YES
        |
     EXTEND
```

Do not select the relationship based only on wording.

Always evaluate the actual requirement.

---

# 11. Relationship Direction

Validate arrow direction.

### Include

The arrow goes:

```text
Including Use Case
        |
        v
Included Use Case
```

Example:

```text
(Checkout) ------<<include>>------> (Process Payment)
```

### Extend

The extending use case points toward the base use case:

```text
Extending Use Case
        |
        v
Base Use Case
```

Example:

```text
(Apply Discount) ------<<extend>>------> (Checkout)
```

---

# 12. Generalization

Use generalization when one actor or use case is a **specialized form of another**.

The relationship represents:

> **is-a**

Example:

```text
Administrator
      ^
      |
System Administrator
```

This means:

> A System Administrator is a specialized type of Administrator.

Do not use generalization simply because two actors or use cases are similar.

---

# 13. Actor Generalization

Actor generalization can be used when a specialized actor inherits interactions from a more general actor.

Example:

```text
             User
              ^
              |
       +------+------+
       |             |
    Student        Teacher
```

If `User` has common interactions, Student and Teacher may inherit those interactions.

Do not create this hierarchy unless the requirements support it.

---

# 14. Use Case Generalization

Use case generalization can represent specialized versions of a more general use case.

Example:

```text
              (Generate Report)
                     ^
                     |
            +--------+--------+
            |                 |
    (Generate Grade      (Generate
       Report)          Financial Report)
```

Only use this when the specialized use cases genuinely represent variants of the general use case.

---

# 15. Avoid Overusing Relationships

A common AI failure is creating relationships everywhere.

Bad:

```text
Student -------- Login
Student -------- Register
Student -------- Database
Student -------- Validate
Student -------- Authentication
Student -------- Dashboard
Student -------- API
```

A Use Case Diagram should communicate **meaningful actor goals**, not every technical dependency.

Prefer:

```text
Student
   |
   +---- (Register Account)
   |
   +---- (Log In)
   |
   +---- (Enroll in Course)
   |
   +---- (View Grades)
```

---

# 16. Do Not Put Internal Components in a Use Case Diagram

Avoid treating these as use cases:

```text
Database
API
Controller
Repository
Model
React Component
Authentication Middleware
SQL Query
Server
```

These belong in architectural or technical diagrams.

Instead:

```text
Student ---- (View Grades)
```

The implementation details can be represented elsewhere.

---

# 17. Do Not Turn Every Button Into a Use Case

A UI action is not automatically a use case.

Avoid:

```text
Click Login Button
Click Submit Button
Click Search Button
Open Dashboard
Click Add Student
```

Instead model the user's goal:

```text
Log In
Search Student
Register Student
Add Student
```

---

# 18. Do Not Turn Every Database Operation Into a Use Case

Avoid:

```text
Insert Student
Update Student Table
Delete Enrollment Record
Query Grades
Fetch User Record
```

Unless the user specifically describes these as externally observable system goals, they should not be represented as use cases.

---

# 19. Avoid Excessive Detail

A Use Case Diagram is a **high-level requirements diagram**.

Do not put:

* Every validation rule
* Every database operation
* Every UI interaction
* Every API call
* Every business rule
* Every exception
* Every internal process

into one diagram.

Use Activity and Sequence Diagrams for detailed behavior.

---

# 20. Large-System Rule

For large projects, do NOT create one enormous Use Case Diagram.

Use a hierarchy.

### Level 1 — System Overview

Show major actors and major system capabilities.

```text
Student Information System
│
├── Enrollment
├── Academic Management
├── Student Management
├── Financial Management
└── Reporting
```

### Level 2 — Module Use Cases

Create separate diagrams:

```text
Enrollment Use Cases
Academic Management Use Cases
Student Management Use Cases
Financial Management Use Cases
Reporting Use Cases
```

### Level 3 — Detailed Behavior

Use:

* Activity Diagrams
* Sequence Diagrams
* Class Diagrams
* State Diagrams

for detailed modeling.

---

# 21. Complexity Threshold

If a Use Case Diagram becomes difficult to read, automatically consider decomposition.

Warning signs:

* Too many use cases
* Too many crossing associations
* Too many `include` relationships
* Too many `extend` relationships
* Multiple unrelated modules
* Excessive actors
* Labels becoming unreadable

The AI should prefer:

> **Several coherent diagrams over one technically complete but unreadable diagram.**

---

# 22. Requirement Traceability

Every use case should be traceable to a requirement.

Before adding a use case, ask:

> "What requirement or user goal does this represent?"

If there is no justification:

**Do not add it.**

Every relationship should also have a semantic justification.

---

# 23. Ambiguous Requirements

If the requirement does not provide enough information, do not invent behavior.

Example:

> "The student can enroll in a course."

Safe:

```text
Student --> (Enroll in Course)
```

Do NOT automatically assume:

```text
(Enroll in Course)
      |
      +--<<include>>--> (Check Prerequisites)
      |
      +--<<include>>--> (Process Payment)
      |
      +--<<include>>--> (Send Email)
```

Those may be reasonable system features, but they are **not guaranteed by the requirement**.

Instead, either:

1. Ask for clarification, or
2. Clearly mark them as assumptions.

---

# 24. Final Validation

Before outputting a Use Case Diagram, the AI MUST verify:

* [ ] Correct UML diagram type.
* [ ] Actors are external to the system.
* [ ] Actors represent users or external entities.
* [ ] Use cases represent meaningful system goals.
* [ ] System boundary is clearly defined.
* [ ] Actor-use case associations are justified.
* [ ] `<<include>>` is used only for required behavior.
* [ ] `<<extend>>` is used only for optional/conditional behavior.
* [ ] Include relationship direction is correct.
* [ ] Extend relationship direction is correct.
* [ ] Generalization represents a genuine specialization.
* [ ] No unnecessary relationships were created.
* [ ] No internal database/API/controller implementation details were modeled as actors.
* [ ] No UI buttons were unnecessarily modeled as use cases.
* [ ] No database CRUD operations were unnecessarily modeled as use cases.
* [ ] Naming is consistent.
* [ ] Requirements are not invented.
* [ ] Assumptions are explicitly identified.
* [ ] The diagram is readable.
* [ ] Large systems are decomposed into multiple diagrams when necessary.

---

# 25. Core AI Rule

> **A Use Case Diagram models externally visible system functionality from the perspective of actors. It does not model how the system is implemented.**

The AI must prioritize:

**Requirements → Actors → User Goals → System Boundary → Relationships → Validation → Layout**

Never prioritize visual complexity over UML correctness.
