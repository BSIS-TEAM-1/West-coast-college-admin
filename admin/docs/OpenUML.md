# WCC System - Complete Use Case Diagram

Single whole-system use case diagram for the WCC system.

```plantuml
@startuml
skinparam backgroundColor #FFFFFF
skinparam defaultFontName "Segoe UI"
skinparam packageStyle rectangle
skinparam shadowing false

title WCC System — Whole System Use Case Diagram

left to right direction

actor "Admin" as Adm
actor "Registrar" as Reg
actor "Applicant" as App

rectangle "WCC System" {

  package "Common" {
    usecase "Create Account" as UC1
    usecase "Login" as UC2
    usecase "Dashboard" as UC3
    usecase "Logout" as LOG
  }

  package "Admin" {
    usecase "Manage Accounts" as AD1
    usecase "View Audit Logs" as AD2
    usecase "View Staff Logs" as AD3
    usecase "System Health" as AD4
    usecase "Manage Security" as AD5
    usecase "Manage Calendar" as M2
  }

  package "Applicant" {
    usecase "Submit Application" as U1
    usecase "Submit Requirements" as U2
    usecase "Complete Enrollment" as U3
  }

  package "Registrar — Admissions" {
    usecase "Manage Applications" as A1
    usecase "Enroll Students" as A2
  }

  package "Registrar — Records" {
    usecase "Manage Students" as S1
    usecase "Manage Blocks" as S2
    usecase "School Year Rollover" as S3
  }

  package "Registrar — Academic" {
    usecase "Manage Subjects" as C1
    usecase "Manage Curriculums" as C2
    usecase "Verify Grades" as G1
    usecase "Publish Grades" as G2
    usecase "Return Grades" as G3
    usecase "Review Grade Changes" as G4
  }

  package "Registrar — Services" {
    usecase "Generate COR" as D1
    usecase "Manage Documents" as D2
    usecase "View Reports" as D3
    usecase "Post Announcements" as M1
  }

  package "Professor" {
    usecase "View My Courses" as P1
    usecase "Manage Class Students" as P2
    usecase "Enter Grades" as P3
    usecase "Submit Grades for Review" as P4
    usecase "Request Grade Change" as P5
  }

  package "Student" {
    usecase "View Dashboard" as T1
    usecase "View Grades" as T2
    usecase "View Schedule" as T3
    usecase "View Announcements" as T4
    usecase "Download COR" as T5
    usecase "Edit Profile" as T6
  }
}

actor "Professor" as Prof
actor "Student" as Stu

' Force right actors to stay right
Prof -[hidden]right- Stu

' === Admin ===
Adm --> UC2
Adm --> UC3
Adm --> AD1
Adm --> AD2
Adm --> AD3
Adm --> AD4
Adm --> AD5
Adm --> M1
Adm --> M2
Adm --> LOG

' === Registrar ===
Reg --> UC2
Reg --> UC3
Reg --> A1
Reg --> A2
Reg --> S1
Reg --> S2
Reg --> S3
Reg --> C1
Reg --> C2
Reg --> G1
Reg --> G2
Reg --> G3
Reg --> G4
Reg --> D1
Reg --> D2
Reg --> D3
Reg --> LOG

' === Applicant ===
App --> U1
App --> U2
App --> U3

' === Professor ===
Prof --> UC2
Prof --> UC3
Prof --> P1
Prof --> P2
Prof --> P3
Prof --> P4
Prof --> P5
Prof --> T4
Prof --> LOG

' === Student ===
Stu --> UC2
Stu --> UC3
Stu --> T1
Stu --> T2
Stu --> T3
Stu --> T4
Stu --> T5
Stu --> T6
Stu --> LOG

' === Include / Extend / Triggers ===
UC1 ..> UC2 : <<include>>
UC2 ..> UC3 : <<include>>
UC3 ..> LOG : <<extend>>

AD1 ..> AD3 : <<include>>
AD2 ..> AD1 : <<audits>>

U1 ..> U2 : <<include>>
U2 ..> A1 : <<triggers>>
A1 ..> A2 : <<extend>>
A2 ..> S1 : <<include>>
U3 ..> D1 : <<enables>>

S2 ..> C1 : <<uses>>
S2 ..> C2 : <<uses>>
S3 ..> S2 : <<include>>

P1 ..> P2 : <<include>>
P3 ..> P4 : <<include>>
P4 ..> G1 : <<triggers>>
P5 ..> G4 : <<triggers>>
G1 ..> G2 : <<extend>>
G1 ..> G3 : <<extend>>
G4 ..> G2 : <<may lead to>>

G2 ..> T2 : <<enables>>
D1 ..> T5 : <<enables>>
M1 ..> T4 : <<enables>>

T1 ..> T2 : <<include>>
T1 ..> T3 : <<include>>
T1 ..> T4 : <<include>>

@enduml
```

## Reading this diagram

- **Left side actors:** Admin, Registrar, Applicant
- **Right side actors:** Professor, Student
- **Center use cases:** All features grouped by portal
- **Solid lines:** Which actor can access which feature
- **Dashed lines:** relationships between use cases
  - `<<include>>` = one feature always needs another
  - `<<extend>>` = one feature may lead to another
  - `<<triggers>>` = one action starts another
  - `<<enables>>` = one action unlocks another
