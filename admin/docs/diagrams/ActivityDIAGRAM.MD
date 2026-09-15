# Activity Diagram Guardrail

## 1. Purpose

An Activity Diagram represents the **workflow, process, and behavioral flow** of a system or business process.

It must show:

* What activities occur
* The order in which activities occur
* Decisions and alternative paths
* Conditions controlling those paths
* Parallel/concurrent activities when applicable
* Who or what is responsible for activities when useful
* Where the workflow begins and ends

The AI must model the **actual process described by the requirements** and must not invent workflow steps.

---

# 2. When to Use an Activity Diagram

Use an Activity Diagram when the user needs to model:

* Business processes
* System workflows
* Use case behavior
* Approval processes
* Enrollment processes
* Registration workflows
* Payment workflows
* Academic workflows
* Data-processing workflows
* Decision-making processes
* Parallel processing
* Exception or alternative flows

Do NOT use an Activity Diagram as the primary diagram for:

* Classes and object structure → Class Diagram
* Actor-system requirements → Use Case Diagram
* Time-ordered object interactions → Sequence Diagram
* System architecture → Component Diagram
* Physical infrastructure → Deployment Diagram
* Object lifecycle/state changes → State Machine Diagram

---

# 3. Activity Diagram Must Represent a Workflow

The AI must be able to describe the diagram as:

> "First this happens, then this happens, then a decision is made, and depending on the condition, the workflow follows one of several paths."

Example:

```text id="4v4d1h"
●
 |
Submit Application
 |
Validate Application
 |
◇ Application Complete?
 /                \
[Yes]             [No]
 |                 |
Approve           Return Application
 |                 |
Generate          Correct Information
Record              |
 \__________________/
          |
         ◎
```

Every flow must have a meaningful reason.

---

# 4. Initial Node

The initial node represents the beginning of a workflow.

Notation:

```text id="3w5w9q"
●
```

Normally, a simple workflow should have one clear starting point.

The AI may use multiple initial nodes only when the modeled process genuinely has multiple independent starting flows or concurrent initiation.

Do not add multiple initial nodes merely for visual convenience.

---

# 5. Action / Activity

Activities represent tasks performed during the workflow.

Use concise, action-oriented names.

Good:

```text id="d9o8xw"
Enter Student Information
Validate Application
Review Application
Approve Application
Generate Enrollment Record
Send Confirmation
```

Avoid:

```text id="y7k9e2"
Student Information
Application
Database
System
Validation
```

Activities should normally describe **something that happens**, not simply an object or noun.

---

# 6. Control Flow

Control flows show the direction of the workflow.

Example:

```text id="1s2y4p"
Activity A
    |
    v
Activity B
```

The AI must ensure that the flow represents the actual logical order.

Do not connect activities merely because they are related.

For example:

```text id="qf4x5a"
Register Student
      |
      v
Generate Report
```

should not be created unless the requirements indicate that generating the report follows registration.

---

# 7. Decision Node

A decision node represents a point where the workflow chooses between alternative paths.

Notation:

```text id="7b1j4z"
      ◇
```

A decision should normally have:

* One incoming flow
* Two or more outgoing flows
* Guards describing the conditions

Example:

```text id="y9b5p2"
        ◇
       / \
 [Valid] [Invalid]
    /       \
Approve   Return Form
```

---

# 8. Guard Conditions

Guards specify the condition under which a particular flow is followed.

Use square brackets:

```text id="3n4p6w"
[Application Complete]
[Application Incomplete]
[Payment Successful]
[Payment Failed]
[Student Eligible]
[Student Not Eligible]
```

Guards should be:

* Clear
* Mutually understandable
* Related to the decision
* Consistent with the requirements

Avoid vague guards such as:

```text id="y7e2lq"
[Yes]
[No]
[Other]
```

when a more meaningful condition can be stated.

Prefer:

```text id="f3k7as"
[Payment Successful]
[Payment Failed]
```

---

# 9. Decision vs Merge

The AI MUST distinguish between **decision nodes** and **merge nodes**.

## Decision

Splits one flow into alternative paths.

```text id="6n2h0c"
        ◇
       / \
      /   \
 [Yes]   [No]
```

Conceptually:

> Choose one of several alternatives.

## Merge

Combines alternative paths back into one flow.

```text id="r4k6wp"
 [Path A] \
           > ◇
 [Path B] /
            |
            v
```

Conceptually:

> Different alternative paths continue into the same subsequent activity.

Do NOT use a merge when activities are executing concurrently.

---

# 10. Fork

A fork represents **parallel/concurrent execution**.

Notation:

```text id="b8r2nc"
        |
   ━━━━━━━━━
    /     \
   v       v
Task A   Task B
```

Use a fork only when both activities can genuinely execute concurrently.

Example:

After enrollment approval:

```text id="x8f0q2"
Approve Enrollment
       |
   ━━━━━━━━━
    /     \
   v       v
Update   Send
Records  Notification
```

If one task must happen before the other, do NOT use a fork.

---

# 11. Join

A join synchronizes parallel flows.

Example:

```text id="j7z4em"
Task A ──\
          ━━━━━━━━━
Task B ──/
             |
             v
       Continue Process
```

The AI should use a join when subsequent processing requires the relevant parallel activities to complete.

---

# 12. Fork/Join vs Decision/Merge

This distinction is mandatory.

### Decision/Merge

```text
ONE path
   |
   v
   ◇
  / \
 A   B
```

Only an alternative path is selected.

### Fork/Join

```text
ONE path
   |
   v
━━━━━━━━
 /     \
A       B
 \     /
  ━━━━━
    |
    v
```

A and B can execute concurrently.

### Guardrail

> **Never use a fork merely because there are two possible outcomes.**

If only one path is selected → **Decision**.

If multiple paths execute simultaneously → **Fork**.

---

# 13. Swimlanes

Use swimlanes when responsibility needs to be shown.

Example:

```text id="r6m2pa"
┌───────────────┬─────────────────────┐
│ Student       │ System              │
├───────────────┼─────────────────────┤
│ Submit Form   │                     │
│───────────────> Validate Form       │
│               │                     │
│               │ Approve Application │
│<──────────────│                     │
└───────────────┴─────────────────────┘
```

Use swimlanes for:

* Student
* Teacher
* Administrator
* Registrar
* System
* External Service

Do not create a swimlane for every minor component.

---

# 14. Responsibility Rule

If the process involves multiple actors or organizational roles, the AI should consider swimlanes.

For example:

```text id="7n4c0v"
Student
   |
Submit Enrollment
   |
Registrar
   |
Review Enrollment
   |
System
   |
Validate Requirements
```

This makes responsibility clear.

---

# 15. Alternative and Exception Flows

Activity Diagrams should represent meaningful alternative paths.

Example:

```text id="m5y8dc"
Submit Application
        |
   Validate
        |
        ◇
      /   \
 [Valid] [Invalid]
    |        |
    v        v
Approve   Return for Correction
```

The AI should model exceptions when they are important to the process.

Do not create every imaginable error condition.

Only include exceptions that are:

* Requirements-based
* Business-significant
* Necessary for understanding the workflow

---

# 16. Final Node

A final node represents completion of the workflow.

Notation:

```text id="n4v9sk"
◎
```

A workflow may have multiple final nodes when different paths genuinely terminate differently.

Example:

```text id="e6w1qa"
[Approved] ---> Enrollment Complete ---> ◎

[Rejected] ---> Application Rejected ---> ◎
```

Do not force unrelated terminal paths into one final node merely for aesthetics.

---

# 17. Time Events

Use a time event when the workflow genuinely depends on time.

Examples:

```text id="q8w3fj"
Wait Until Registration Opens
Wait 24 Hours
Wait Until Payment Deadline
```

Do not use time events simply to indicate that an operation takes a long time.

A time event represents a **temporal condition/event in the workflow**, not merely performance duration.

---

# 18. Do Not Turn Every System Detail Into an Activity

Avoid activities such as:

```text id="g4j8qm"
Execute SQL Query
Open Database Connection
Send HTTP Request
Call Controller
Update React State
Render Component
```

unless the diagram specifically describes technical implementation behavior.

For a business/system workflow, prefer:

```text id="a2f6xz"
Save Enrollment
Validate Student
Generate Enrollment Record
Send Confirmation
```

---

# 19. Do Not Create Artificially Long Workflows

The AI must not add activities merely to make the diagram look complete.

Bad:

```text id="r2x7ck"
Click Button
Open Page
Load API
Parse JSON
Update State
Refresh UI
Display Button
```

when the actual business process is simply:

```text id="j4w9mp"
Submit Application
      |
Validate Application
      |
Process Application
```

The level of detail must match the purpose of the diagram.

---

# 20. Activity Diagram and Use Case Relationship

A Use Case Diagram identifies:

> **What functionality the actor wants.**

An Activity Diagram explains:

> **How that functionality/workflow proceeds.**

Example:

### Use Case

```text id="x1c8mz"
Student ─── (Enroll in Course)
```

### Activity Diagram

```text id="c5q7bd"
Start
  |
Select Course
  |
Check Prerequisites
  |
  ◇
 / \
Eligible? 
 /     \
Yes     No
 |       |
Enroll  Show Error
 |
Confirm Enrollment
 |
End
```

The AI should be able to generate an Activity Diagram from a Use Case when sufficient behavioral information is available.

---

# 21. Large Project Rule

For a large system, a single Activity Diagram should generally represent **one meaningful workflow or process**, not the entire system.

For example:

```text id="w3p8nv"
WCC SIS

├── Student Enrollment Activity
├── Applicant Processing Activity
├── Grade Submission Activity
├── Grade Approval Activity
├── Academic Year Rollover Activity
├── Student Promotion Activity
└── Payment Processing Activity
```

If the thesis specifically requires one complete Activity Diagram, the AI may produce a high-level end-to-end workflow, but it must avoid combining unrelated processes into an unreadable diagram.

---

# 22. Activity Diagram Complexity

A detailed Activity Diagram is acceptable when the workflow itself is complex.

However, the AI should avoid:

* Excessive crossing arrows
* Unnecessary decisions
* Unnecessary forks
* Repeated activities
* Redundant merge nodes
* Technical implementation details
* Unrelated processes
* Extremely long chains without logical grouping

The goal is:

> **Complete representation of the workflow without unnecessary complexity.**

---

# 23. Validation Rules

Before generating the final Activity Diagram, the AI MUST verify:

* [ ] The diagram represents a genuine workflow.
* [ ] The starting point is clearly identifiable.
* [ ] Activities are action-oriented.
* [ ] Control flows represent the correct sequence.
* [ ] Decisions represent genuine alternatives.
* [ ] Decision branches have meaningful guards when appropriate.
* [ ] Merge nodes combine alternative paths.
* [ ] Forks represent actual concurrency.
* [ ] Joins synchronize actual parallel flows.
* [ ] Swimlanes correctly represent responsibility when used.
* [ ] Time events represent genuine temporal behavior.
* [ ] Final nodes correctly represent workflow completion.
* [ ] No unnecessary activities were invented.
* [ ] No implementation details were added without justification.
* [ ] No unrelated workflows were combined unnecessarily.
* [ ] The diagram is consistent with the corresponding Use Case Diagram.
* [ ] Terminology matches the rest of the UML model.
* [ ] Requirements are not invented.
* [ ] Assumptions are explicitly identified.
* [ ] The diagram remains readable.

---

# 24. Core AI Rule

> **An Activity Diagram must model the flow of behavior, not merely list system features.**

The AI must prioritize:

**Requirements → Workflow → Activities → Control Flow → Decisions → Concurrency → Responsibilities → Validation → Layout**

The AI must never add workflow steps simply because they are technically plausible.

When the requirements do not explain what happens inside a process, the AI must either:

1. Ask for clarification, or
2. Explicitly identify the behavior as an assumption.

---

# 25. UML Integrity Rule

The AI must maintain consistency between diagrams.

If the Use Case Diagram contains:

```text
(Approve Enrollment)
```

and an Activity Diagram is generated for that use case, the Activity Diagram should describe the behavior of **Approve Enrollment**, rather than silently changing it into a different process.

Likewise, actors, terminology, and major system functions should remain consistent across:

* Use Case Diagrams
* Activity Diagrams
* Sequence Diagrams
* Class Diagrams
* Component Diagrams

The UML model should describe **one coherent system from different perspectives**.
