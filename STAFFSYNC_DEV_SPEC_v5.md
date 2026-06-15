# STAFFSYNC — Full System Development Specification
> Version: 5.0 | Audience: Developers & AI Assistants | Project: DevX Ltd
> **Changelog v5.0:** Module 14 added — Finance & Payroll Management (fully implemented). Module 15 added — Internal Chat & Messaging (planned). Role `FINANCE` added. Face Verify UX updated (manual trigger). Global UI brightness lift applied.
> **Changelog v4.0:** Module 13 added — Continuous Presence Monitoring (foreground GPS polling, web-only, Option A).
> **Changelog v3.0:** Tech stack finalised. API Endpoints reference section removed. Technology Assumptions updated to reflect chosen stack.
> **Changelog v2.0:** Module 11 replaced — IoT Biometric removed, replaced with QR + Geofence + Face Verification (face-api.js). Module 01 updated — HR-invite-only registration flow added.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Tech Stack](#2-tech-stack)
3. [User Roles](#3-user-roles)
4. [Module 01 — Registration & Authentication](#4-module-01--registration--authentication)
5. [Module 02 — Attendance Management](#5-module-02--attendance-management)
6. [Module 03 — Leave Management](#6-module-03--leave-management)
7. [Module 04 — Synchronization Engine](#7-module-04--synchronization-engine)
8. [Module 05 — Role-Based Access Control (RBAC)](#8-module-05--role-based-access-control-rbac)
9. [Module 06 — Reporting & Analytics](#9-module-06--reporting--analytics)
10. [Module 07 — Audit & Security](#10-module-07--audit--security)
11. [Module 08 — Employee Self-Service Portal](#11-module-08--employee-self-service-portal)
12. [Module 09 — Manager Dashboard](#12-module-09--manager-dashboard)
13. [Module 10 — HR Admin Panel](#13-module-10--hr-admin-panel)
14. [Module 11 — QR + Geofence + Face Attendance](#14-module-11--qr--geofence--face-attendance)
15. [Module 12 — Task Management](#15-module-12--task-management)
16. [Module 13 — Continuous Presence Monitoring](#16-module-13--continuous-presence-monitoring)
17. [Module 14 — Finance & Payroll Management](#17-module-14--finance--payroll-management) ✅ **IMPLEMENTED**
18. [Module 15 — Internal Chat & Messaging](#18-module-15--internal-chat--messaging) *(Planned)*
19. [Cross-Module Integrations](#19-cross-module-integrations)
20. [Data Models (Reference)](#20-data-models-reference)
21. [Security & Compliance Notes](#21-security--compliance-notes)
22. [Notification Events Reference](#22-notification-events-reference)

---

## 1. System Overview

**STAFFSYNC** is a web-based staff synchronization management system designed to automate and integrate employee attendance, leave management, payroll, and communication processes within organizations.

### Core Goals
- Centralize attendance, leave, and payroll tracking in one platform
- Automate approval workflows and conflict detection
- Provide real-time sync between all HR data points
- Support QR code + geofence + face verification check-in/check-out
- Enable task assignment and progress tracking across teams
- Manage payroll runs with multi-level approval and automated payslip delivery
- Provide internal team communication via structured chat channels
- Export clean data to payroll and compliance systems

### Technology Stack
- **Frontend:** React.js + Tailwind CSS + face-api.js (browser-based face verification)
- **Backend:** Pure PHP — minimal files, each file may handle multiple related routes/roles
- **Database:** MySQL
- **Email:** SMTP (PHPMailer via Gmail SMTP)
- **File Storage:** Local server storage (uploads saved to disk on the host machine)
- **Hosting:** Localhost (XAMPP) — `http://localhost/staff_cecile/`
- **Real-time:** PHP polling (frontend polls backend at interval) — no WebSockets required
- **QR codes:** Generated server-side in PHP (`phpqrcode`)
- **Face descriptors:** Computed client-side by face-api.js; only the 128D float array is sent to PHP and stored encrypted in MySQL

---

## 2. Tech Stack

### Frontend
| Layer | Technology |
|---|---|
| UI Framework | React 18 + Vite |
| Styling | Tailwind CSS v4 (custom dark-glass design system) |
| Face Verification | face-api.js (runs fully in browser — no images sent to server) |
| State Management | Zustand |
| Data Fetching | TanStack React Query (polls PHP backend) |
| Routing | React Router v7 |
| QR Scanning | `html5-qrcode` (browser camera QR reader) |
| Real-time updates | Polling via `setInterval` + React Query refetch |

### Backend
| Layer | Technology |
|---|---|
| Language | PHP 8.2 (pure, no framework) |
| File structure | Minimal — one PHP file per domain (`auth.php`, `payroll.php`, etc.) |
| Routing | Query params (`?action=login`, `?action=payslip_get`) |
| Auth | JWT tokens stored in MySQL `active_sessions`, validated per request |
| QR generation | `phpqrcode` library |
| Email | PHPMailer via Gmail SMTP |
| Encryption | `openssl_encrypt` / `openssl_decrypt` (AES-256-CBC) for face descriptors |
| File uploads | `move_uploaded_file()` — saved to local `uploads/` directory |

### Database
| Layer | Technology |
|---|---|
| Database | MySQL (`staffsync` schema) |
| Access | PHP PDO with prepared statements |

### PHP File Structure
```
/api
  auth.php          — login, logout, register, face verify, invite
  attendance.php    — check-in, check-out, manual entry, regularisation
  leave.php         — apply, approve, reject, cancel, balance
  tasks.php         — create, assign, update, subtasks, comments
  qr.php            — generate QR, rotate, validate scan, geofence check
  face.php          — enroll, verify descriptor, delete, re-enroll
  users.php         — list, update, deactivate, bulk invite
  reports.php       — attendance, leave, task, payroll export
  audit.php         — log viewer, timeline
  sync.php          — conflict detection, resolution, sync triggers
  notifications.php — send email via SMTP, in-app notification store
  shifts.php        — shift management, shift members, holidays
  monitoring.php    — GPS heartbeat, presence board, exempt status
  payroll.php       — salary configs, deduction templates, payroll runs,
                       payslips, complaints (Module 14) ✅
  chat.php          — channels, messages, read receipts (Module 15, planned)
  migrate_finance.php   — one-time migration: adds FINANCE role + payroll tables
  migrate_qr_zones.php  — one-time migration: adds GPS columns to attendance
/uploads            — leave documents, task attachments (local disk)
/qrcodes            — generated QR code images (local disk)
```

---

## 3. User Roles

| Role | Code | Description |
|------|------|-------------|
| Employee | `EMPLOYEE` | Regular staff member |
| Manager | `MANAGER` | Team lead / department head |
| HR Admin | `HR` | Human resources + system config access |
| IT Admin | `IT_ADMIN` | System and device administrator |
| Finance | `FINANCE` | Payroll management and financial operations |
| System | `SYSTEM` | Automated background processes |

### Role Permission Summary

| Capability | EMPLOYEE | MANAGER | HR | IT_ADMIN | FINANCE |
|---|:---:|:---:|:---:|:---:|:---:|
| View own records | ✅ | ✅ | ✅ | ✅ | ✅ |
| View team records | ❌ | ✅ | ✅ | ❌ | ❌ |
| Approve leave | ❌ | ✅ | ✅ | ❌ | ❌ |
| Override attendance | ❌ | ✅ | ✅ | ❌ | ❌ |
| Create/assign tasks | ❌ | ✅ | ✅ | ❌ | ❌ |
| Enroll employee face | ❌ | ❌ | ✅ | ✅ | ❌ |
| Generate/manage QR codes | ❌ | ❌ | ✅ | ✅ | ❌ |
| Configure geofence zones | ❌ | ❌ | ✅ | ✅ | ❌ |
| Manage roles/permissions | ❌ | ❌ | ✅ | ✅ | ❌ |
| View audit logs | ❌ | ❌ | ✅ | ✅ | ❌ |
| Create payroll runs | ❌ | ❌ | ❌ | ❌ | ✅ |
| Approve payroll (Manager step) | ❌ | ✅ | ❌ | ❌ | ❌ |
| Approve payroll (HR step) | ❌ | ❌ | ✅ | ❌ | ❌ |
| Finalize payroll & send payslips | ❌ | ❌ | ❌ | ❌ | ✅ |
| View own payslips | ✅ | ✅ | ✅ | ✅ | ✅ |
| Raise payslip complaint | ✅ | ✅ | ✅ | ✅ | ❌ |
| Respond to payslip complaints | ❌ | ❌ | ❌ | ❌ | ✅ |
| System config | ❌ | ❌ | ❌ | ✅ | ❌ |
| Send registration invites | ❌ | ❌ | ✅ | ✅ | ❌ |

### Role Dashboard Routing
| Role | Default Dashboard |
|------|------------------|
| EMPLOYEE | `/dashboard/employee` |
| MANAGER | `/dashboard/manager` |
| HR | `/dashboard/hr` |
| IT_ADMIN | `/dashboard/it-admin` |
| FINANCE | `/dashboard/finance` |

---

## 4. Module 01 — Registration & Authentication

### Purpose
Controls identity, onboarding, and secure access for all users across the system. **Registration is invite-only** — no user can self-register. HR must send an invitation link to the employee's email before any account can be created.

### Registration Flow (HR-Invite-Only)
```
HR enters employee email + role + department
    → System generates a unique, time-limited invite token (expires in 48 hours)
    → System sends invite email to employee with a one-time registration link
    → Employee opens link → completes registration form (name, password)
    → Employee completes face enrollment wizard (captured via face-api.js in browser)
    → Account becomes active after face enrollment is confirmed
    → HR is notified that the employee has completed registration
```

### Face Verification UX (v5.0 update)
The face verify page was redesigned to give the user control over when scanning starts:
```
1. Page loads → camera opens immediately (so user can see their face in the frame)
2. face-api.js models load in parallel with camera
3. User sees live camera preview with a clear "Verify my face" button
4. User clicks the button ONLY when they are ready and positioned correctly
5. Scanning begins → progress bar → match → success or retry
6. On failure: retry returns to camera preview (ready state), not a blank screen
7. 3 consecutive failures → account temporarily locked, HR notified
```

**Face Verify Page UI (light theme):**
- White/lavender gradient background (`#f0f4ff → #e8eeff → #f5f0ff`)
- Camera ring with live preview — nearly transparent overlay in ready phase
- White glass status card with explicit light-theme text colors
- Indigo/green/red ring border per phase (ready / success / failed)
- Progress ring around the camera frame during scanning

### UI Elements
- **HR Invite Panel** — enter employee email, assign role, department, and position; send invite
- **Invite management table** — list of pending, accepted, and expired invites (HR view)
- **Resend / revoke invite** — per-invite actions for HR
- **Employee registration form** — accessed via invite link only; collects name, password
- **Face enrollment wizard** — step-by-step guided face capture using device camera
- **Secure login screen** — email / employee ID + password, followed by face verification
- **Face verify page** — camera preview first, manual "Verify my face" button trigger
- **Password reset and recovery interface**
- **Profile completion wizard** — department, position, contact info
- **Session management panel**
- **Account deactivation / reactivation controls**

### Key Business Rules
- No user can access the registration page without a valid, unexpired invite token
- Invite tokens are tied to a specific email address — cannot be used with a different email
- Face enrollment must succeed before the account is activated
- IT_ADMIN role skips face verification (bypasses biometric step with simulated delay)
- Each user has exactly one primary role; additional roles can be granted via RBAC
- Deactivated accounts cannot log in but their records are preserved
- If an invite expires, HR must manually resend a new invite
- On 3 consecutive face verification failures → account locked, HR notified

### Users
| Role | Access Level |
|------|-------------|
| HR | Send invites, manage invite list, view enrollment status |
| IT Admin | Bulk invite upload, account deactivation, session management |
| All roles | Login (face + password), password reset, profile update |

---

## 5. Module 02 — Attendance Management

### Purpose
Central record of all attendance events — who was present, when, how long, and under what status.

### UI Elements
- Clock-in / clock-out interface with timestamp and optional location
- Daily attendance calendar view
- Attendance status indicators: `present` | `late` | `absent` | `on_leave`
- Manual entry / override form for managers
- Attendance regularisation request form (employee-initiated correction)
- Timesheet summary with total hours worked
- Geolocation / IP-based validation (optional toggle)

### Features
- Real-time attendance tracking (records created by QR + geofence + face scan, or manual entry)
- Automated late detection based on shift schedule
- Automated absence detection if no check-in by threshold time
- Shift and schedule integration
- Overtime calculation
- Export to payroll systems (CSV, Excel, API)

### Attendance Status Enum
```
PRESENT
LATE
ABSENT
ON_LEAVE
HALF_DAY
WORK_FROM_HOME
HOLIDAY
```

### Key Business Rules
- A check-in without a corresponding check-out triggers an alert after `X` hours (configurable)
- Regularisation requests require manager approval
- Manual overrides are logged with reason and actor in the audit trail
- If an employee is on approved leave, attendance is auto-set to `ON_LEAVE`
- QR + geofence + face scan records (Module 11) automatically create attendance events

### Users
| Role | Access |
|------|--------|
| Employee | View own records, submit regularisation requests |
| Manager | Override records, approve regularisation requests, view team |
| HR | Full view and edit, audit corrections |

---

## 6. Module 03 — Leave Management

### Purpose
Handles the full leave lifecycle from application through approval to balance update.

### UI Elements
- Leave application form: type, start date, end date, reason, supporting documents
- Leave balance dashboard: available / taken / pending per leave type
- Approval workflow interface for managers
- Team leave calendar (visual overview of who is absent on which dates)
- Leave history and trends per employee
- Cancel or modify leave request option

### Features
- Configurable leave types: `annual` | `sick` | `casual` | `maternity` | `paternity` | `unpaid` | `other`
- Multi-level approval workflows (Manager → HR)
- Conflict detection: alerts when leave overlaps with team leave or critical dates
- Automated leave balance updates on approval
- Notification system for approvals, rejections, and cancellations

### Leave Request States
```
DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED | REJECTED | CANCELLED
```

### Key Business Rules
- Leave cannot be applied for dates already marked as holidays in the system calendar
- Overlapping approved leave by multiple team members triggers a configurable warning
- Cancelled approved leave restores the balance immediately
- Sick leave may require document upload (configurable per policy)
- On approval, sync engine (Module 04) updates attendance records automatically

### Users
| Role | Access |
|------|--------|
| Employee | Apply, cancel, view own history and balance |
| Manager | Approve / reject, view team calendar |
| HR | Configure leave types, manage policies, override balances |

---

## 7. Module 04 — Synchronization Engine

### Purpose
The invisible backbone that keeps attendance and leave data consistent in real time.

### UI Elements (Admin-facing only)
- Sync status dashboard: attendance ↔ leave, scan events ↔ attendance
- Conflict detection and resolution panel
- Manual sync trigger and logs
- Data integrity alerts
- Sync history and error report log
- Override and reconciliation tools
- Real-time sync activity monitor

### Features
- Automatic real-time sync between attendance and leave records
- QR + geofence + face scan events ingestion and translation to attendance records
- Conflict prevention and resolution
- Audit trail of all sync events
- Data validation during synchronization
- Integration hooks for external HR/payroll systems

### Conflict Scenarios & Resolutions

| Conflict | Auto Action | Alert To |
|---|---|---|
| QR scan on approved leave day | Flag, mark `CONFLICT`, notify | Manager + HR |
| Leave approved for past present day | Flag, request manual resolution | HR |
| Double scan (check-in twice) | Ignore second, log anomaly | IT Admin |
| Geofence validation failed | Reject check-in, log attempt | HR |
| Face match failed during check-in | Reject check-in, alert employee | HR |
| Leave cancelled after attendance posted | Revert attendance to `PRESENT` | System auto |

### Users
| Role | Access |
|------|--------|
| System | Runs all sync automatically |
| HR | Resolves conflicts, triggers manual sync |
| IT Admin | Monitors health, reviews error logs |

---

## 8. Module 05 — Role-Based Access Control (RBAC)

### Purpose
Granular control of who can see and do what across every module and action in the system.

### UI Elements
- Role management table (create, edit, delete roles)
- Permission matrix editor (module-wise, action-wise)
- User-role assignment interface
- Access request and approval workflow (self-service)
- Role-based dashboard preview
- Access log viewer
- Bulk permission update tool

### Features
- Granular permission controls at module + action level
- Department-based access policies
- Temporary access granting with expiry date
- Audit-ready permission logs
- Self-service access requests with manager/admin approval

### Key Business Rules
- No user can assign a role higher than their own
- Temporary access automatically revokes on expiry date
- Permission changes are logged with before/after state
- Role deletion is blocked if active users are assigned to it

### Users
| Role | Access |
|------|--------|
| HR | Full RBAC management |
| IT Admin | System-level permissions, device access |

---

## 9. Module 06 — Reporting & Analytics

### Purpose
Insight layer across all modules — attendance patterns, leave trends, task performance, payroll export, and compliance.

### UI Elements
- Report gallery with pre-built templates
- Custom report builder (drag-and-drop field selection)
- Visual charts: attendance heatmaps, leave trends, task completion rates
- Scheduled report distribution (email, set frequency)
- Export options: PDF, Excel, CSV
- Dashboard widgets for managers and HR
- Real-time analytics refresh

### Report Types

| Report | Primary Users |
|--------|--------------|
| Daily attendance summary | HR, Manager |
| Leave utilization by department | HR |
| Overtime report | HR, Finance |
| Absenteeism trends | Manager, HR |
| Task completion rate by employee | Manager |
| Overdue task summary | Manager, HR |
| Face verification failure log | IT Admin, HR |
| QR scan anomalies and geofence violations | IT Admin, HR |
| Payroll-ready export | Finance, HR |
| Compliance checklist status | HR |
| Pending / expired invite report | HR |
| Monthly payroll totals | Finance |

### Users
| Role | Access |
|------|--------|
| Manager | Team-level reports, task reports |
| HR | Department-level attendance and leave, all reports |
| IT Admin | Biometric and device reports |
| Finance | Payroll exports, salary reports |

---

## 10. Module 07 — Audit & Security

### Purpose
Complete, tamper-proof traceability of every action in the system, plus security controls and data protection tools.

### UI Elements
- Comprehensive audit log with filtering (by user, module, action, date)
- User activity timeline
- Data change history (who changed what and when)
- Security policy configuration panel
- Login attempt monitoring (failed logins, unusual IPs)
- Data backup and restore interface
- Compliance checklist and reporting dashboard

### Features
- Full audit trail for all transactions
- Biometric enrollment and deletion events logged
- Automated backup schedules
- GDPR / local data protection compliance support
- Suspicious activity alerts (brute force, off-hours access)
- Data integrity verification tools

### Auditable Events (non-exhaustive)
```
AUTH_LOGIN | AUTH_LOGOUT | AUTH_FAILED
AUTH_FACE_VERIFIED | AUTH_FACE_FAILED | AUTH_FACE_LOCKED
USER_CREATED | USER_DEACTIVATED | USER_ROLE_CHANGED
USER_INVITE_SENT | USER_INVITE_ACCEPTED | USER_INVITE_EXPIRED | USER_INVITE_REVOKED
ATTENDANCE_OVERRIDE | ATTENDANCE_REGULARISATION_APPROVED
ATTENDANCE_QR_CHECKIN | ATTENDANCE_QR_CHECKOUT | ATTENDANCE_GEOFENCE_FAILED
LEAVE_APPROVED | LEAVE_REJECTED | LEAVE_CANCELLED
FACE_ENROLLED | FACE_DELETED | FACE_VERIFIED | FACE_VERIFICATION_FAILED
QR_CODE_GENERATED | QR_CODE_EXPIRED | QR_CODE_REVOKED
PRESENCE_OUT_OF_ZONE | PRESENCE_BACK_IN_ZONE | PRESENCE_FLAG_RAISED | PRESENCE_FLAG_CLEARED
PRESENCE_INACTIVE_START | PRESENCE_INACTIVE_RESOLVED | PRESENCE_EXEMPT_GRANTED | PRESENCE_EXEMPT_REMOVED
TASK_CREATED | TASK_ASSIGNED | TASK_STATUS_CHANGED | TASK_CLOSED
PAYROLL_RUN_CREATED | PAYROLL_RUN_SUBMITTED | PAYROLL_RUN_APPROVED | PAYROLL_RUN_REJECTED
PAYROLL_RUN_FINALIZED | PAYSLIP_SENT | PAYSLIP_COMPLAINT_RAISED | PAYSLIP_COMPLAINT_RESOLVED
PERMISSION_CHANGED | SYNC_CONFLICT_FLAGGED | SYNC_CONFLICT_RESOLVED
CHAT_CHANNEL_CREATED | CHAT_CHANNEL_ARCHIVED | CHAT_MESSAGE_DELETED
```

### Key Business Rules
- Audit logs are append-only and cannot be edited or deleted by any user role
- Biometric data events have a separate restricted audit trail
- Backup failure triggers an immediate alert to IT Admin

### Users
| Role | Access |
|------|--------|
| IT Admin | Full audit log, security config, backup management |
| HR | Compliance-related audit log, GDPR tools |

---

## 11. Module 08 — Employee Self-Service Portal

### Purpose
Personal dashboard for every employee — their own attendance, leave, tasks, payslips, and requests in one place.

### UI Elements
- Personal dashboard: attendance summary, leave balance, upcoming time off, assigned tasks
- Request summary and status tracker (leave requests, regularisation requests)
- **Payslips page** — list of own payslips, view detail, download PDF, raise dispute
- **Payslip complaint form** — subject + message, submitted to Finance team
- **My disputes panel** — history of complaints with Finance replies
- Team directory and contact info
- Announcements and HR policy documents
- Profile and preference updates
- Biometric enrollment status (link to re-enrollment request)

### Features
- Self-service leave and regularisation requests
- Mobile-responsive design
- Push/email notifications for request status updates
- Document repository access (policies, contracts)
- View own task assignments and update progress
- View and download payslips (PDF via browser)
- Raise disputes on payslip calculations

### Key Business Rules
- Employees can only view their own data (not teammates')
- Payslip complaints are routed to Finance by default
- Profile changes that affect system data (department, position) require HR approval

### Users
| Role | Access |
|------|--------|
| Employee | Full personal dashboard |

---

## 12. Module 09 — Manager Dashboard

### Purpose
Team-level command centre — real-time view of attendance, leave, tasks, and pending approvals for the manager's direct reports.

### UI Elements
- Team overview grid: attendance/leave status per employee (live)
- Pending approval queue (leave requests, regularisation requests, task reviews)
- **Payroll approval panel** — review and approve/reject payroll runs submitted by Finance
- Team capacity planning calendar
- Performance metrics: punctuality trends, leave patterns, task completion rates
- Quick approve / reject actions (inline)
- Team communication panel

### Features
- One-click leave approvals from the queue
- Team availability visualization (who is in, who is out, who is on leave)
- Payroll run review: see breakdown of entries, totals, approve or reject with reason
- Automated reminders for pending actions beyond SLA
- Performance trend alerts

### Key Business Rules
- Payroll run approval is only available when run status is `pending_manager`
- Rejection requires a written reason that is stored against the run
- Dashboard only shows direct reports

### Users
| Role | Access |
|------|--------|
| Manager | Full team dashboard, payroll approval step |

---

## 13. Module 10 — HR Admin Panel

### Purpose
Central control panel for HR operations — policy configuration, bulk operations, system health, workforce analytics, and payroll approval.

### UI Elements
- System configuration dashboard
- Holiday and policy calendar management
- Bulk update tools (shift changes, leave allocation, department moves)
- Compliance reporting dashboard
- User management and onboarding checklist management
- **Invite management panel** — send, track, resend, and revoke employee registration invites
- **QR code zone management** — configure check-in locations, geofence boundaries per site
- **Face enrollment health overview** — enrollment rates per department, re-enrollment requests
- **Payroll approval panel** — review and approve/reject payroll runs (HR step, after Manager)

### Features
- Centralized policy management (leave types, overtime rules, attendance thresholds)
- Batch processing of HR updates
- Advanced workforce planning analytics
- Full onboarding workflow builder
- Payroll run review: second approval step in Finance → Manager → HR → Finance chain

### Key Business Rules
- Policy changes take effect from a configurable effective date, not immediately
- Bulk operations require a confirmation step and are logged in full
- HR payroll approval is only available when run status is `pending_hr` (manager already approved)
- Rejection at the HR step sends the run back to Finance with a reason

### Users
| Role | Access |
|------|--------|
| HR | Full panel including payroll approval |

---

## 14. Module 11 — QR + Geofence + Face Attendance

### Purpose
Manages check-in/check-out using a three-layer verification pipeline: **rotating QR code scan → GPS geofence validation → face-api.js face verification**. Requires no physical devices beyond the employee's own smartphone or a display screen.

### How It Works — The Three-Layer Pipeline

```
STEP 1 — QR Scan
  HR displays a rotating, time-limited QR code on a screen at each check-in point
  Employee scans the QR code with their phone or opens it in the browser
  System validates: token is active, not expired, not already consumed by this user today

STEP 2 — Geofence Validation
  On QR scan, system requests the employee's GPS coordinates (browser Geolocation API)
  System checks coordinates fall within the registered geofence for that QR zone
  If outside geofence → check-in rejected, attempt logged, HR notified

STEP 3 — Face Verification (Anti-Spoofing / Anti-Proxy Layer)
  If QR + geofence both pass → browser activates camera via face-api.js
  Employee looks at camera → liveness detection runs
  face-api.js computes a 128-dimension face descriptor
  Descriptor compared against the enrolled descriptor stored for this employee
  Euclidean distance must be below threshold (configurable, default 0.5)
  On success → attendance event created, sync engine triggered
  On failure → attempt logged, employee prompted to retry (max 3 attempts before HR alert)
```

### QR Code Specification
```json
{
  "qr_token": "uuid-v4",
  "zone_id": "ZONE-KIGALI-HQ",
  "event_type": "CHECK_IN",
  "issued_at": "2026-01-14T07:55:00Z",
  "expires_at": "2026-01-14T08:10:00Z",
  "rotation_interval_seconds": 30,
  "single_use_per_employee": true
}
```

### Key Business Rules
- All three layers must succeed for attendance to be recorded
- Face enrollment is mandatory at registration
- Face descriptors are deleted immediately on employee offboarding
- QR codes rotate every 30 seconds (configurable per zone)

### Users
| Role | Access |
|------|--------|
| Employee | Check in/out via QR + geofence + face flow |
| HR | Enroll and manage face profiles; configure geofence zones; QR management |
| IT Admin | QR code generation and rotation management, anomaly dashboard |

---

## 15. Module 12 — Task Management

### Purpose
Enables managers and HR to create, assign, and track tasks for individuals or teams — with progress visibility, collaboration tools, and completion reporting.

### UI Elements
- Task creation form
- Assignment panel (single or multi-assignee, team-level)
- Kanban board view (columns: To Do / In Progress / Blocked / In Review / Done)
- List view with filter and sort (by priority, assignee, due date, status)
- Calendar view (tasks plotted by due date)
- Subtask and checklist panel per task
- Comment thread per task (with @mention support)
- File and document attachment per task
- Progress tracker (% complete slider + status toggle)

### Task Lifecycle
```
TODO → IN_PROGRESS → IN_REVIEW → DONE
              ↓
           BLOCKED → IN_PROGRESS (unblocked)
```

### Key Business Rules
- Only managers and HR roles can create and assign tasks
- Employees can only update tasks assigned to them
- A task cannot be closed by the assignee — only the assigner or a manager
- Overdue escalation: Day 1 → alert assignee; Day 2+ → alert manager
- Tasks linked to employees on approved leave are flagged as at-risk automatically

### Users
| Role | Access |
|------|--------|
| Employee | View assigned tasks, update progress, add comments/files |
| Manager | Create, assign, track team board, review, close tasks |
| HR | Assign HR/compliance tasks, manage onboarding checklists |
| IT Admin | Configure system settings for task module |

---

## 16. Module 13 — Continuous Presence Monitoring

### Purpose
Solves the proxy attendance problem: an employee checks in successfully then leaves the office. The system detects their absence by silently polling their GPS location in the foreground while StaffSync is open in their browser.

> **Approach: Option A — Foreground GPS Polling (Web-only)**
> The browser's `navigator.geolocation.watchPosition()` API continuously streams GPS coordinates to the backend while the StaffSync tab is active. Polling stops if the tab is closed — this itself is treated as a signal and triggers an inactive timer.

### Presence Status Values
```
CHECKED_IN         — checked in, inside geofence, heartbeats normal
INACTIVE_SIGNAL    — no GPS heartbeat received within threshold (tab closed)
OUT_OF_ZONE        — GPS received but outside geofence boundary
PRESENCE_DOUBT     — escalated: was out-of-zone for more than grace period
EXEMPT             — manually marked by manager (field visit, external meeting)
CHECKED_OUT        — normal check-out, monitoring stops
```

### Configuration Options (HR Admin)

| Setting | Default | Description |
|---|---|---|
| Poll interval | 10 min | How often browser sends GPS to backend |
| Grace period on exit | 10 min | Time before OUT_OF_ZONE is escalated |
| Inactive signal threshold | 30 min | Minutes of silence before INACTIVE flag |
| Auto-restore on return | Yes | Clear flag automatically when back in zone |
| Monitoring hours | Shift hours only | Only monitor between check-in and check-out |

### Key Business Rules
- Monitoring only runs between check-in and check-out
- Employee's presence status indicator is always visible to them — no hidden surveillance
- One missed heartbeat is never enough to flag
- GPS coordinates are stored only for the current working day — purged after 24 hours

### Users
| Role | Access |
|---|---|
| Employee | See own presence status indicator; receive warnings |
| Manager | Live presence board for their team; grant EXEMPT status |
| HR | Live presence board all employees; view + resolve flags |
| HR Admin | Full config (poll interval, thresholds) |
| IT Admin | View monitoring system health; GPS error logs |

---

## 17. Module 14 — Finance & Payroll Management ✅ IMPLEMENTED

### Purpose
End-to-end payroll processing for all employees — salary configuration, automated deduction calculation, multi-level approval workflow, payslip generation (email + browser PDF), and employee dispute handling. The Finance role manages the entire lifecycle.

### Implementation Status
**Fully implemented as of 2026-06-14.** All backend and frontend components are live.

### Key Specification Decisions
- **Currency:** RWF (Rwandan Franc)
- **Deductions:** PAYE + RSSB Pension + RSSB Medical + BRD Student Loan (per employee flag) + Custom templates
- **Payslip delivery:** Email HTML (PHPMailer) + browser PDF (styled HTML printed/saved)
- **Approval chain:** Finance → Manager → HR → Finance finalize
- **Complaints:** Employees can raise disputes on payslips; Finance responds
- **Overtime + Bonuses:** Adjustable per employee per payroll run during processing phase

### Payroll Run State Machine
```
draft → processing → pending_manager → pending_hr → approved → paid
                                    ↓
                              rejected (with reason, returns to Finance)
```

**State transitions:**
- `draft` → `processing` : Finance clicks "Process" (calculates all entries)
- `processing` → `pending_manager` : Finance clicks "Submit for Approval"
- `pending_manager` → `pending_hr` : Manager approves
- `pending_hr` → `approved` : HR approves
- `approved` → `paid` : Finance clicks "Finalize & Send Payslips"
- Any pending state → `rejected` : Approver rejects with written reason

### Statutory Deductions (Rwanda)

| Deduction | Rate | Applied To |
|---|---|---|
| PAYE (Income Tax) | 30% of gross | All employees |
| RSSB Pension | 5% of basic salary | All employees |
| RSSB Medical | 2.5% of basic salary | All employees |
| BRD Student Loan | 8% of gross | Employees flagged `has_brd_loan = true` in salary config |

### Custom Deduction Templates
Finance can define additional named deductions (fixed amount or percentage). These can be set as `applies_to = all` (applied every run) or `applies_to = individual` (applied per entry manually).

### Gross Calculation
```
gross = basic_salary + (overtime_hours × (basic_salary / 160) × overtime_rate) + bonus
```
where `overtime_rate` defaults to 1.5× (configurable per employee).

### Payslip
- Full HTML payslip with earnings breakdown, deductions table, and net pay
- Delivered via email (PHPMailer, HTML body) to the employee's registered email
- Also available to view in the browser and download as PDF (browser print-to-PDF)
- Employee can view payslips at `/dashboard/employee/payslips`

### UI Pages

| Page | Route | Role | Purpose |
|------|-------|------|---------|
| Finance Dashboard | `/dashboard/finance` | FINANCE | Stats, latest run status, monthly trend chart |
| Payroll Runs | `/dashboard/finance/payroll` | FINANCE | Create runs, process, submit, finalize |
| Salary Configuration | `/dashboard/finance/salaries` | FINANCE | Set/edit basic salary, BRD flag, overtime rate |
| Payslips | `/dashboard/finance/payslips` | FINANCE | View/resend all payslips |
| Deductions | `/dashboard/finance/deductions` | FINANCE | Built-in deductions info + custom template management |
| Complaints | `/dashboard/finance/complaints` | FINANCE | Respond to and resolve employee payslip complaints |
| Manager Payroll | `/dashboard/manager/payroll` | MANAGER | Approve/reject `pending_manager` runs |
| HR Payroll | `/dashboard/hr/payroll` | HR | Approve/reject `pending_hr` runs |
| Employee Payslips | `/dashboard/employee/payslips` | EMPLOYEE | View payslips, download PDF, raise complaint |

### Database Tables (auto-created by `boot_payroll_tables()`)
```
salary_configs        — basic salary, overtime rate, BRD loan flag per employee
deduction_templates   — named custom deduction rules (percentage or fixed)
payroll_runs          — one record per payroll period (monthly/biweekly)
payroll_entries       — one record per employee per run (all earnings + deduction columns)
payslip_complaints    — employee-raised disputes on individual payslip entries
```

### Backend API (`api/payroll.php`)
All actions accessed via `?action=<name>`:

| Action | Method | Description |
|--------|--------|-------------|
| `salary_list` | GET | List all salary configs |
| `salary_set` | POST | Create or update an employee's salary config |
| `deduction_list` | GET | List custom deduction templates |
| `deduction_add` | POST | Add a custom deduction template |
| `deduction_delete` | POST | Delete a custom deduction template |
| `run_list` | GET | List all payroll runs |
| `run_create` | POST | Create a new draft payroll run |
| `run_process` | POST | Calculate all entries for a run (draft → processing) |
| `run_submit` | POST | Submit run for Manager approval (processing → pending_manager) |
| `run_approve` | POST | Manager or HR approves their respective step |
| `run_reject` | POST | Manager or HR rejects with reason |
| `run_finalize` | POST | Finance finalizes, sends all payslips (approved → paid) |
| `entry_list` | GET | List entries for a specific run |
| `entry_adjust` | POST | Edit overtime/bonus/deductions for an entry (during processing) |
| `payslip_list` | GET | List payslips (with optional filters) |
| `payslip_get` | GET | Get single payslip detail |
| `payslip_send` | POST | Resend payslip email to employee |
| `payslip_pdf` | GET | Return styled HTML payslip (for browser PDF) |
| `complaint_list` | GET | List payslip complaints |
| `complaint_add` | POST | Employee raises a complaint |
| `complaint_reply` | POST | Finance replies to a complaint |
| `complaint_resolve` | POST | Finance marks complaint as resolved |
| `dashboard_stats` | GET | Finance dashboard summary stats |

### Frontend API Client (`payrollApi` in `src/lib/api.js`)
```js
payrollApi.salaryList()
payrollApi.salarySet(data)
payrollApi.deductionList()
payrollApi.deductionAdd(data)
payrollApi.deductionDelete(id)
payrollApi.runList()
payrollApi.runCreate(data)           // { period_label, period_start, period_end }
payrollApi.runProcess(runId)
payrollApi.runSubmit(runId)
payrollApi.runApprove(runId)
payrollApi.runReject(runId, reason)
payrollApi.runFinalize(runId)
payrollApi.entryList(runId)
payrollApi.entryAdjust(data)         // { entry_id, overtime_hours, bonus, other_deductions }
payrollApi.payslipList(params)
payrollApi.payslipGet(entryId)
payrollApi.payslipSend(entryId)
payrollApi.payslipPdfUrl(entryId, token)
payrollApi.complaintList()
payrollApi.complaintAdd(data)        // { entry_id, subject, message }
payrollApi.complaintReply(id, reply)
payrollApi.complaintResolve(id)
payrollApi.dashboardStats()
```

### Setup / Migration
Run once to add the `FINANCE` role to the database and create all payroll tables:
```
http://localhost/staff_cecile/api/migrate_finance.php
```

### Key Business Rules
- Only Finance can create, process, submit, and finalize payroll runs
- Manager approves before HR — HR approval gate only opens after Manager approves
- Finance cannot approve their own run at the Manager or HR step
- Rejection at any step sends the run back to Finance (status resets) with a written reason
- Payslips are sent only when Finance finalizes (not on approval)
- Employees can only view their own payslips
- Complaints are linked to a specific payslip entry, not a general message
- BRD loan deduction is applied only if `has_brd_loan = true` on the employee's salary config
- Overtime is calculated as: `hours × (basic / 160) × overtime_rate`
- Custom deduction templates marked `is_mandatory = true` are automatically applied every run

### Users
| Role | Access |
|------|--------|
| Finance | Full payroll management, complaint responses |
| Manager | Approve/reject payroll runs at Manager step |
| HR | Approve/reject payroll runs at HR step |
| Employee | View own payslips, download PDF, raise complaints |

---

## 18. Module 15 — Internal Chat & Messaging *(Planned)*

### Purpose
Provides structured internal communication channels for teams and departments — reducing reliance on external messaging apps and keeping work conversations inside StaffSync alongside the HR and attendance data.

### Planned Channel Types

| Channel Type | Description |
|---|---|
| Department channel | One channel per department — all department members auto-joined |
| Team channel | Manager-created channel for their direct reports |
| Announcement channel | HR/management broadcasts; employees read-only |
| Peer-to-peer (DM) | One-on-one direct messages between any two users |
| Public channel | Open to all staff (e.g. "General", "Random") |

### Planned UI Elements
- **Channel list sidebar** — categorized by type, unread count badge per channel
- **Message thread view** — chronological messages with sender avatar, name, timestamp
- **Message composer** — text input with emoji support, file attachment, @mention
- **@mention notification** — in-app alert when user is mentioned in any channel
- **Channel management panel** — create, archive, configure channel (HR / Manager)
- **DM initiator** — start a 1:1 conversation from any user profile
- **Unread indicator** — bold channel name + dot badge when messages unread
- **Message search** — search within a channel or globally
- **Read receipts** — "seen by N members" indicator per message

### Planned Features
- Real-time message delivery via PHP SSE (Server-Sent Events) or polling
- File attachment support (images, documents) — stored in `uploads/chat/`
- Soft-delete messages (author or admin can delete; content replaced with "Message deleted")
- Message reactions (emoji reactions per message)
- Pinned messages per channel (HR / Manager can pin important messages)
- Channel member management (add/remove members, set channel moderator)
- Notification preferences per channel (mute channel, DM-only alerts)

### Planned Database Tables
```sql
chat_channels   — id, name, type (department|team|dm|public|announcement),
                  created_by, department_id (nullable), is_archived, created_at

chat_members    — id, channel_id, user_id, role (member|moderator),
                  joined_at, muted (boolean)

chat_messages   — id, channel_id, sender_id, body (text), attachment_url (nullable),
                  is_deleted (boolean), created_at, updated_at

chat_reads      — id, channel_id, user_id, last_read_message_id, last_read_at
```

### Planned Backend (`api/chat.php`)
```
POST ?action=channel_create     — create channel (HR / Manager)
GET  ?action=channel_list       — list channels the user belongs to
GET  ?action=message_list       — paginated messages for a channel
POST ?action=message_send       — send a message
POST ?action=message_delete     — soft-delete a message
GET  ?action=unread_counts      — unread count per channel for current user
POST ?action=mark_read          — mark up to message_id as read in a channel
GET  ?action=sse                — Server-Sent Events stream for real-time delivery
```

### Planned Access Rules
| Channel Type | Who can create | Who joins |
|---|---|---|
| Department | System (auto on dept creation) | All dept members (auto) |
| Team | Manager | Their direct reports (auto) |
| Announcement | HR | All employees (read-only) |
| DM | Any user | Just the two participants |
| Public | HR / Manager | Any user can join |

### Key Business Rules
- Users cannot send messages to channels they are not a member of
- DM channel is created on first message — no explicit "start DM" creation step required
- Archived channels are read-only; messages are preserved
- @mentions generate an in-app notification even if the channel is muted
- File attachments are validated by MIME type before storage
- All chat activity is included in the audit log (channel created, member added, message deleted)
- HR can view all channels for compliance purposes
- Messages cannot be edited after sending (only deleted, with deletion notice)

### Integration with Other Modules
- When a payroll run is submitted for approval, a notification is sent via chat to the approver's DM
- When a leave request is approved/rejected, employee receives a chat DM notification
- Task assignments can trigger a DM to the assignee with task details

### Users
| Role | Access |
|------|--------|
| Employee | Join dept/team/public channels, DMs, send messages |
| Manager | Create team channels, pin messages, add/remove members |
| HR | Create announcement channels, view all channels, compliance |
| Finance | Access own dept channel, DMs |
| IT Admin | System-level access, channel archive, audit log |

---

## 19. Cross-Module Integrations

| Trigger Event | Source Module | Action | Target Module |
|---|---|---|---|
| Employee QR + geofence + face check-in | Module 11 | Create attendance record + start GPS monitoring | Module 02 + Module 13 |
| GPS heartbeat outside geofence | Module 13 | Start grace period timer, warn employee | Module 04 + Notification |
| Grace period expired, still outside zone | Module 13 | Flag attendance PRESENCE_DOUBT, alert HR + Manager | Module 02 + Audit |
| Employee returns to zone | Module 13 | Auto-clear flag, log BACK_IN_ZONE | Module 02 + Audit |
| No heartbeat for 30 min (tab inactive) | Module 13 | Flag INACTIVE_SIGNAL, notify HR | Module 02 + Notification |
| Employee checks out | Module 11 | Stop GPS monitoring for that session | Module 13 |
| Leave request approved | Module 03 | Update attendance to `ON_LEAVE` | Module 04 → Module 02 |
| QR scan on approved leave day | Module 11 | Flag conflict | Module 04 |
| Geofence validation failed | Module 11 | Log attempt, notify HR | Module 04 + Audit |
| Face verification failed (3x) | Module 11 | Lock check-in, notify HR + employee | Notification + Audit |
| Task due date overlaps leave | Module 12 | Warn manager on assignment | Module 03 |
| Employee absent unexpectedly | Module 02 | Flag open tasks as at-risk | Module 12 |
| New employee onboarded | Module 01 | Create onboarding task sequence | Module 12 |
| Task overdue Day 2+ | Module 12 | Escalate to manager | Notification + Module 09 |
| Attendance override | Module 02 | Write audit log entry | Module 07 |
| Permission changed | Module 05 | Write audit log entry | Module 07 |
| Payroll run submitted | Module 14 | Notify Manager to approve | Module 09 + Notification |
| Manager approves payroll | Module 14 | Move run to HR approval queue | Module 10 + Notification |
| HR approves payroll | Module 14 | Notify Finance to finalize | Notification |
| Finance finalizes payroll | Module 14 | Send payslips via email, update run status to `paid` | Module 08 + Notification |
| Employee raises payslip complaint | Module 14 | Notify Finance team | Notification |
| Finance resolves complaint | Module 14 | Notify employee, close complaint | Notification |
| Chat message @mentions user | Module 15 | Trigger in-app notification | Notification |
| Leave approved | Module 03 | Send DM notification to employee | Module 15 |
| Task assigned | Module 12 | Send DM to assignee with task link | Module 15 |

---

## 20. Data Models (Reference)

### User
```
user_id           INT UNSIGNED, PK, AUTO_INCREMENT
employee_id       string, unique
email             string, unique
full_name         string
role              ENUM('EMPLOYEE','MANAGER','HR','IT_ADMIN','FINANCE','SYSTEM')
department        string
phone             string, nullable
address           text, nullable
is_active         TINYINT(1)
face_enrolled     TINYINT(1)
last_login        DATETIME, nullable
created_at        DATETIME
```

### AttendanceRecord
```
id                INT UNSIGNED, PK
user_id           FK → users
date              DATE
check_in          DATETIME, nullable
check_out         DATETIME, nullable
status            ENUM('present','late','absent','on_leave','half_day','wfh','holiday')
source            ENUM('qr_face','manual','system_auto')
zone_id           FK → qr_zones, nullable
geofence_passed   TINYINT(1), nullable
face_verified     TINYINT(1), nullable
override_by       FK → users, nullable
override_reason   TEXT, nullable
```

### LeaveRequest
```
id                INT UNSIGNED, PK
user_id           FK → users
leave_type        ENUM('annual','sick','casual','maternity','paternity','unpaid','other')
start_date        DATE
end_date          DATE
reason            TEXT
status            ENUM('pending','approved','rejected','cancelled')
approved_by       FK → users, nullable
rejection_reason  TEXT, nullable
document_url      VARCHAR(255), nullable
created_at        DATETIME
```

### FaceDescriptor
```
id                INT UNSIGNED, PK
user_id           FK → users, UNIQUE
descriptor        TEXT (encrypted JSON float[128])
enrolled_by       FK → users
last_verified     DATETIME, nullable
created_at        DATETIME
```

### GeofenceZone (qr_zones)
```
id                INT UNSIGNED, PK
name              VARCHAR(100)
latitude          FLOAT
longitude         FLOAT
radius_metres     INT (default 100)
token             VARCHAR(255) (rotating QR token)
address           VARCHAR(255)
is_active         TINYINT(1)
created_by        FK → users
created_at        DATETIME
```

### SalaryConfig
```
id                INT UNSIGNED, PK
user_id           FK → users, UNIQUE
basic_salary      DECIMAL(14,2)
currency          VARCHAR(5) DEFAULT 'RWF'
pay_frequency     ENUM('monthly','biweekly')
has_brd_loan      TINYINT(1) DEFAULT 0
overtime_rate     DECIMAL(5,2) DEFAULT 1.5
effective_from    DATE
notes             TEXT, nullable
created_by        FK → users, nullable
updated_at        DATETIME
```

### DeductionTemplate
```
id                INT UNSIGNED, PK
name              VARCHAR(100)
type              ENUM('percentage','fixed')
value             DECIMAL(10,4)
applies_to        ENUM('all','individual')
is_mandatory      TINYINT(1)
description       TEXT, nullable
created_by        FK → users, nullable
created_at        DATETIME
```

### PayrollRun
```
id                  INT UNSIGNED, PK
period_label        VARCHAR(30)
period_start        DATE
period_end          DATE
status              ENUM('draft','processing','pending_manager','pending_hr','approved','rejected','paid')
total_gross         DECIMAL(16,2)
total_deductions    DECIMAL(16,2)
total_net           DECIMAL(16,2)
employee_count      SMALLINT
notes               TEXT, nullable
rejection_reason    TEXT, nullable
created_by          FK → users
approved_by_manager FK → users, nullable
approved_by_hr      FK → users, nullable
finalized_by        FK → users, nullable
created_at          DATETIME
processed_at        DATETIME, nullable
paid_at             DATETIME, nullable
```

### PayrollEntry
```
id                INT UNSIGNED, PK
run_id            FK → payroll_runs
user_id           FK → users
basic_salary      DECIMAL(14,2)
overtime_hours    DECIMAL(6,2)
overtime_amount   DECIMAL(14,2)
bonus             DECIMAL(14,2)
gross             DECIMAL(14,2)
paye              DECIMAL(14,2)
rssb_pension      DECIMAL(14,2)
rssb_medical      DECIMAL(14,2)
brd_loan          DECIMAL(14,2)
other_deductions  DECIMAL(14,2)
total_deductions  DECIMAL(14,2)
net_pay           DECIMAL(14,2)
deduction_details JSON (full breakdown)
adjusted_by       FK → users, nullable
adjusted_at       DATETIME, nullable
UNIQUE (run_id, user_id)
```

### PayslipComplaint
```
id                INT UNSIGNED, PK
entry_id          FK → payroll_entries
user_id           FK → users
subject           VARCHAR(200)
message           TEXT
status            ENUM('open','in_review','resolved')
reply             TEXT, nullable
replied_by        FK → users, nullable
created_at        DATETIME
resolved_at       DATETIME, nullable
```

### ChatChannel *(Planned)*
```
id                INT UNSIGNED, PK
name              VARCHAR(100)
type              ENUM('department','team','dm','public','announcement')
created_by        FK → users
department_id     FK → departments, nullable
is_archived       TINYINT(1)
created_at        DATETIME
```

### ChatMessage *(Planned)*
```
id                INT UNSIGNED, PK
channel_id        FK → chat_channels
sender_id         FK → users
body              TEXT
attachment_url    VARCHAR(255), nullable
is_deleted        TINYINT(1)
created_at        DATETIME
updated_at        DATETIME
```

### ChatMember *(Planned)*
```
id                INT UNSIGNED, PK
channel_id        FK → chat_channels
user_id           FK → users
role              ENUM('member','moderator')
joined_at         DATETIME
muted             TINYINT(1)
```

### ChatRead *(Planned)*
```
id                      INT UNSIGNED, PK
channel_id              FK → chat_channels
user_id                 FK → users
last_read_message_id    FK → chat_messages, nullable
last_read_at            DATETIME
```

### GPSHeartbeat
```
id                   INT UNSIGNED, PK
user_id              FK → users
session_id           VARCHAR(64)
timestamp            DATETIME
lat                  FLOAT
lng                  FLOAT
zone_id              FK → qr_zones
in_zone              TINYINT(1)
distance_from_center FLOAT
flag_triggered       TINYINT(1)
```

### Task
```
id                INT UNSIGNED, PK
title             VARCHAR(255)
description       TEXT
priority          ENUM('low','medium','high','urgent')
status            ENUM('todo','in_progress','blocked','in_review','done')
assigned_by       FK → users
department        VARCHAR(100), nullable
project_tag       VARCHAR(100), nullable
start_date        DATE, nullable
due_date          DATE
progress_pct      TINYINT (0–100)
is_deleted        TINYINT(1)
created_at        DATETIME
updated_at        DATETIME
```

### AuditLog
```
id                INT UNSIGNED, PK
event_type        VARCHAR(80)
actor_id          FK → users, nullable
target_type       VARCHAR(40)
target_id         VARCHAR(40)
details           TEXT
ip_address        VARCHAR(45)
created_at        DATETIME
```

---

## 21. Security & Compliance Notes

### Authentication & Sessions
- JWT tokens used for stateless API calls — signed with server secret in `config.php`
- Short JWT expiry + sessions stored in MySQL `active_sessions` table (revocable)
- All PHP API files validate JWT before any logic runs
- Passwords hashed with `password_hash()` / `password_verify()` (bcrypt, cost 12)
- Rate limiting via `failed_logins` and `locked_until` columns on the `users` table

### Face Data (HIGHEST PRIORITY)
- **Never store raw face images** — only the 128-dimension descriptor computed by face-api.js
- All face processing runs **client-side in the browser** — no images leave the device
- Descriptors are encrypted at rest (AES-256)
- Descriptor access is restricted via RBAC — HR and IT Admin only
- Log every access to face descriptor data in the audit log
- Delete descriptor immediately on employee offboarding
- Never transmit descriptors to third parties
- Face verification threshold is configurable (Euclidean distance, default 0.5)

### Payroll Data Security
- All payroll endpoints require JWT authentication
- Finance role is required to create/process/finalize runs
- Employees can only access their own payslips (enforced server-side by `user_id = auth_user()`)
- Payroll totals and individual salaries are not exposed to EMPLOYEE or MANAGER roles
- Payslip PDF is served via authenticated token: `?action=payslip_pdf&_token=<jwt>`

### General Security
- PHP PDO prepared statements on every MySQL query
- `htmlspecialchars()` on all outputs to prevent XSS
- CORS headers set explicitly in each PHP API file
- RBAC checked at the top of every PHP API file before any logic runs
- QR tokens are JWT-signed — tampering is detectable
- GPS coordinates validated server-side against MySQL geofence zone records
- Invite tokens are single-use, hashed in MySQL — raw token sent only via email
- File uploads validated by MIME type and extension before saving to disk
- Chat file attachments validated by MIME type and stored outside web root

### GDPR / Data Protection
- Face descriptor data is sensitive personal data under GDPR Article 9
- Right to erasure: descriptor deletion + audit log redaction workflow
- Data minimization: collect only what is needed (128D descriptor, no images)
- GPS coordinates stored only for current working day — purged after 24 hours
- Chat messages may be retained per organization policy (configurable retention period)
- Payslips retained for statutory period (minimum 5 years per Rwanda tax law)

---

## 22. Notification Events Reference

| Event | Channel | Recipients |
|---|---|---|
| Employee invite sent | Email | Employee (invite email) |
| Employee invite accepted | In-app | HR who sent invite |
| Employee invite expired | In-app + email | HR |
| Leave request submitted | In-app + email | Manager |
| Leave approved | In-app + email | Employee |
| Leave rejected | In-app + email | Employee |
| Attendance conflict detected | In-app | HR, Manager |
| Regularisation request submitted | In-app | Manager |
| Task assigned | In-app + email | Assignee |
| Task due in 24h | In-app + email | Assignee, Manager |
| Task overdue (Day 1) | In-app + email | Assignee |
| Task overdue (Day 2+) | In-app + email | Assignee, Manager |
| Task blocked | In-app | Manager |
| Face verification failed (single) | In-app | Employee |
| Face verification failed (3 consecutive — locked) | In-app + email | Employee, HR |
| Face enrollment complete | In-app | Employee, HR |
| Geofence check-in failure | In-app | HR |
| QR code anomaly | In-app | IT Admin, HR |
| GPS out-of-zone warning (grace period started) | In-app | Employee |
| GPS out-of-zone escalated (PRESENCE_DOUBT) | In-app + email | Employee, Manager, HR |
| Employee returned to zone (flag auto-cleared) | In-app | Manager, HR |
| GPS signal inactive for 30 min | In-app (on reopen) + email | Employee, HR |
| Suspicious login attempt | In-app + email | IT Admin |
| Backup failure | In-app + email | IT Admin |
| Payroll run submitted for Manager approval | In-app + email | Manager |
| Manager approves payroll run | In-app | Finance, HR |
| Manager rejects payroll run | In-app + email | Finance |
| HR approves payroll run | In-app | Finance |
| HR rejects payroll run | In-app + email | Finance |
| Payroll finalized — payslips sent | Email (payslip HTML) | All employees in run |
| Employee raises payslip complaint | In-app | Finance |
| Finance replies to payslip complaint | In-app + email | Employee |
| Payslip complaint resolved | In-app | Employee |
| Chat @mention | In-app | Mentioned user |
| DM received | In-app | Recipient |
| Unread messages in channel | In-app (badge) | Channel members |

---

*End of StaffSync Development Specification v5.0*
*Prepared for DevX Ltd — 22 sections, 15 modules (13 implemented, 2 planned)*
*v5.0: Module 14 Finance & Payroll (implemented), Module 15 Chat (planned), FINANCE role, Face Verify UX, UI brightness lift.*
*v4.0: Module 13 added — Continuous Presence Monitoring (foreground GPS polling, web-only, Option A).*
*v3.0: Tech stack finalised (React + Tailwind + face-api.js frontend, pure PHP backend, MySQL, SMTP email, local file storage).*
*v2.0: IoT fingerprint replaced with QR + Geofence + face-api.js. HR-invite-only registration added.*
