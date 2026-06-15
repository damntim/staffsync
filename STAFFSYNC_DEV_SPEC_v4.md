# STAFFSYNC — Full System Development Specification
> Version: 4.0 | Audience: Developers & AI Assistants | Project: DevX Ltd
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
17. [Cross-Module Integrations](#17-cross-module-integrations)
18. [Data Models (Reference)](#18-data-models-reference)
19. [Security & Compliance Notes](#19-security--compliance-notes)
20. [Notification Events Reference](#20-notification-events-reference)

---

## 1. System Overview

**STAFFSYNC** is a web-based staff synchronization management system designed to automate and integrate employee attendance and leave management processes within organizations.

### Core Goals
- Centralize attendance and leave tracking in one platform
- Automate approval workflows and conflict detection
- Provide real-time sync between all HR data points
- Support QR code + geofence + face verification check-in/check-out
- Enable task assignment and progress tracking across teams
- Export clean data to payroll and compliance systems

### Technology Stack
- **Frontend:** React.js + Tailwind CSS + face-api.js (browser-based face verification)
- **Backend:** Pure PHP — minimal files, each file may handle multiple related routes/roles
- **Database:** MySQL
- **Email:** SMTP (PHP `mail()` or PHPMailer via local SMTP config)
- **File Storage:** Local server storage (uploads saved to disk on the host machine)
- **Hosting:** Localhost (XAMPP / Laragon) or free hosting (InfinityFree, 000webhost, etc.)
- **Real-time:** PHP polling (frontend polls backend at interval) — no WebSockets required
- **QR codes:** Generated server-side in PHP (e.g. `endroid/qr-code` or `phpqrcode`)
- **Face descriptors:** Computed client-side by face-api.js; only the 128D float array is sent to PHP and stored encrypted in MySQL

---

## 2. Tech Stack

### Frontend
| Layer | Technology |
|---|---|
| UI Framework | React.js |
| Styling | Tailwind CSS |
| Face Verification | face-api.js (runs fully in browser — no images sent to server) |
| State / Data Fetching | React Query (polls PHP backend) |
| QR Scanning | `html5-qrcode` (browser camera QR reader) |
| Real-time updates | Polling via `setInterval` + React Query refetch |

### Backend
| Layer | Technology |
|---|---|
| Language | PHP (pure, no framework) |
| File structure | Minimal — one PHP file can handle multiple related actions |
| Routing | Query params or path-based (`?action=login`, `/api/attendance.php`) |
| Auth | PHP sessions + JWT tokens (stored in MySQL, validated per request) |
| QR generation | `phpqrcode` library or `endroid/qr-code` via Composer |
| Email | PHPMailer via SMTP (configured to local or free SMTP provider) |
| Encryption | `openssl_encrypt` / `openssl_decrypt` (AES-256-CBC) for face descriptors |
| File uploads | `move_uploaded_file()` — saved to local `uploads/` directory |

### Database
| Layer | Technology |
|---|---|
| Database | MySQL |
| Access | PHP `PDO` with prepared statements (prevents SQL injection) |

### Storage & Hosting
| Layer | Technology |
|---|---|
| File storage | Local disk — `uploads/` folder on the server |
| Dev environment | XAMPP or Laragon (localhost) |
| Free hosting | InfinityFree / 000webhost / Netlify (frontend) + free PHP host (backend) |

### Suggested PHP File Structure (minimal)
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
/uploads            — leave documents, task attachments (local disk)
/qrcodes            — generated QR code images (local disk)
```

---

## 3. User Roles

| Role | Code | Description |
|------|------|-------------|
| Employee | `EMPLOYEE` | Regular staff member |
| Manager | `MANAGER` | Team lead / department head |
| HR Officer | `HR_OFFICER` | Human resources staff |
| HR Admin | `HR_ADMIN` | Senior HR with system config access |
| IT Admin | `IT_ADMIN` | System and device administrator |
| System | `SYSTEM` | Automated background processes |

### Role Permission Summary

| Capability | EMPLOYEE | MANAGER | HR_OFFICER | HR_ADMIN | IT_ADMIN |
|---|:---:|:---:|:---:|:---:|:---:|
| View own records | ✅ | ✅ | ✅ | ✅ | ✅ |
| View team records | ❌ | ✅ | ✅ | ✅ | ❌ |
| Approve leave | ❌ | ✅ | ✅ | ✅ | ❌ |
| Override attendance | ❌ | ✅ | ✅ | ✅ | ❌ |
| Create/assign tasks | ❌ | ✅ | ✅ | ✅ | ❌ |
| Enroll employee face | ❌ | ❌ | ✅ | ✅ | ✅ |
| Generate/manage QR codes | ❌ | ❌ | ✅ | ✅ | ✅ |
| Configure geofence zones | ❌ | ❌ | ❌ | ✅ | ✅ |
| Manage roles/permissions | ❌ | ❌ | ❌ | ✅ | ✅ |
| View audit logs | ❌ | ❌ | ❌ | ✅ | ✅ |
| System config | ❌ | ❌ | ❌ | ✅ | ✅ |
| Send registration invites | ❌ | ❌ | ✅ | ✅ | ✅ |

---

## 4. Module 01 — Registration & Authentication

### Purpose
Controls identity, onboarding, and secure access for all users across the system. **Registration is invite-only** — no user can self-register. HR must send an invitation link to the employee's email before any account can be created.

### Registration Flow (HR-Invite-Only)
```
HR enters employee email + role + department
    → System generates a unique, time-limited invite token (expires in 48 hours)
    → System sends invite email to employee with a one-time registration link
    → Employee opens link → completes registration form (name, password, 2FA setup)
    → Employee completes face enrollment wizard (captured via face-api.js in browser)
    → Account becomes active after face enrollment is confirmed
    → HR is notified that the employee has completed registration
```

### UI Elements
- **HR Invite Panel** — enter employee email, assign role, department, and position; send invite
- **Invite management table** — list of pending, accepted, and expired invites (HR/Admin view)
- **Resend / revoke invite** — per-invite actions for HR
- **Employee registration form** — accessed via invite link only; collects name, password, 2FA
- **Face enrollment wizard** — step-by-step guided face capture using device camera (face-api.js); requires 3 successful captures to confirm enrollment
- **Secure login screen** — email / employee ID + password, followed by face verification on each login
- **Password reset and recovery interface**
- **Two-factor authentication (2FA) setup screen**
- **Profile completion wizard** — department, position, contact info
- **Session management panel**
- **Account deactivation / reactivation controls**

### Features
- **HR-initiated invite-only registration** — no public sign-up endpoint exists
- Invite tokens are single-use, expire after 48 hours, and are invalidated on use
- Face enrollment is mandatory during registration (cannot be skipped)
- **Face verification on every login** — after password is accepted, face-api.js runs a liveness + descriptor match before session is granted
- Role-based authentication and post-login redirection
- Secure session handling (JWT or session tokens)
- Password policy enforcement (min length, complexity, expiry)
- Bulk invite via CSV upload (HR Admin only) — upload a list of emails + roles to send batch invites
- Integration with existing HR directories (LDAP/AD optional)

### Key Business Rules
- No user can access the registration page without a valid, unexpired invite token
- Invite tokens are tied to a specific email address — cannot be used with a different email
- Face enrollment must succeed before the account is activated
- Each user has exactly one primary role; additional roles can be granted via RBAC
- Deactivated accounts cannot log in but their records are preserved
- Bulk invite imports must validate employee ID and email uniqueness before sending
- 2FA is optional per policy configuration by HR Admin
- If an invite expires, HR must manually resend a new invite — no self-service re-invite

### Face Login Flow
```
1. Employee enters email + password → credentials validated
2. System triggers face-api.js in the browser
3. Employee looks at camera → liveness check runs
4. Descriptor compared against enrolled face descriptor (stored encrypted)
5. Match confidence must exceed configured threshold (default: 0.6 Euclidean distance)
6. On success → session token issued, redirect to role-based dashboard
7. On failure (3 consecutive attempts) → account temporarily locked, HR + employee notified
```

### Users
| Role | Access Level |
|------|-------------|
| HR Officer / HR Admin | Send invites, manage invite list, view enrollment status |
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
- If an employee is on approved leave, attendance is auto-set to `ON_LEAVE` — no scan required
- QR + geofence + face scan records (Module 11) automatically create attendance events

### Users
| Role | Access |
|------|--------|
| Employee | View own records, submit regularisation requests |
| Manager | Override records, approve regularisation requests, view team |
| HR Officer | Full view and edit, audit corrections |

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
- Auto-reply and out-of-office setup integration (optional)

### Features
- Configurable leave types: `annual` | `sick` | `casual` | `maternity` | `paternity` | `unpaid` | `other`
- Multi-level approval workflows (e.g. Manager → HR Officer)
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
| HR Officer | Configure leave types, manage policies, override balances |

---

## 7. Module 04 — Synchronization Engine

### Purpose
The invisible backbone that keeps attendance and leave data consistent in real time. Also receives and reconciles QR + geofence + face scan attendance events.

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
- Conflict prevention and resolution (e.g. scan on a leave day, face mismatch)
- Audit trail of all sync events
- Data validation during synchronization
- Integration hooks for external HR/payroll systems

### Conflict Scenarios & Resolutions

| Conflict | Auto Action | Alert To |
|---|---|---|
| QR scan on approved leave day | Flag, mark `CONFLICT`, notify | Manager + HR Officer |
| Leave approved for past present day | Flag, request manual resolution | HR Officer |
| Double scan (check-in twice) | Ignore second, log anomaly | IT Admin |
| Geofence validation failed | Reject check-in, log attempt | HR Officer |
| Face match failed during check-in | Reject check-in, alert employee | HR Officer |
| Leave cancelled after attendance posted | Revert attendance to `PRESENT` | System auto |

### Key Business Rules
- Sync runs on every state change event (leave approval, QR scan, manual override)
- Failed sync events are queued and retried up to 3 times before escalation
- All sync operations are logged with timestamp, actor, and result

### Users
| Role | Access |
|------|--------|
| System | Runs all sync automatically |
| HR Admin | Resolves conflicts, triggers manual sync |
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
- Role-based dashboard preview (see what a role sees)
- Access log viewer
- Bulk permission update tool

### Features
- Granular permission controls at module + action level
- Department-based access policies
- Temporary access granting with expiry date
- Audit-ready permission logs
- Self-service access requests with manager/admin approval

### Permission Structure
```
{
  "role": "MANAGER",
  "module": "TASK_MANAGEMENT",
  "actions": ["CREATE", "ASSIGN", "VIEW_TEAM", "CLOSE", "EXPORT"]
}
```

### Key Business Rules
- No user can assign a role higher than their own
- Temporary access automatically revokes on expiry date
- Permission changes are logged with before/after state
- Role deletion is blocked if active users are assigned to it

### Users
| Role | Access |
|------|--------|
| HR Admin | Full RBAC management |
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
| Daily attendance summary | HR Officer, Manager |
| Leave utilization by department | HR Admin |
| Overtime report | HR Admin, Payroll |
| Absenteeism trends | Manager, HR Admin |
| Task completion rate by employee | Manager |
| Overdue task summary | Manager, HR Admin |
| Face verification failure log | IT Admin, HR Admin |
| QR scan anomalies and geofence violations | IT Admin, HR Admin |
| Payroll-ready export | HR Admin |
| Compliance checklist status | HR Admin |
| Pending / expired invite report | HR Admin |

### Key Business Rules
- Scheduled reports are sent at configured intervals (daily, weekly, monthly)
- Custom reports can be saved and shared within the same role tier
- Export includes date-range filter and department filter at minimum

### Users
| Role | Access |
|------|--------|
| Manager | Team-level reports, task reports |
| HR Officer | Department-level attendance and leave |
| HR Admin | All reports, payroll exports |
| IT Admin | Biometric and device reports |

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
- Full audit trail for all transactions (attendance edits, leave approvals, task changes, permission changes)
- Biometric enrollment and deletion events logged
- Automated backup schedules (configurable frequency)
- GDPR / local data protection compliance support
- Suspicious activity alerts (brute force, off-hours access)
- Data integrity verification tools
- Biometric data access restricted by RBAC and logged on every access

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
PERMISSION_CHANGED | SYNC_CONFLICT_FLAGGED | SYNC_CONFLICT_RESOLVED
```

### Key Business Rules
- Audit logs are append-only and cannot be edited or deleted by any user role
- Biometric data events have a separate restricted audit trail
- Backup failure triggers an immediate alert to IT Admin
- GDPR right-to-erasure requests are handled by HR Admin with IT Admin confirmation; audit log is redacted but not deleted

### Users
| Role | Access |
|------|--------|
| IT Admin | Full audit log, security config, backup management |
| HR Admin | Compliance-related audit log, GDPR tools |

---

## 11. Module 08 — Employee Self-Service Portal

### Purpose
Personal dashboard for every employee — their own attendance, leave, tasks, payslips, and requests in one place.

### UI Elements
- Personal dashboard: attendance summary, leave balance, upcoming time off, assigned tasks
- Request summary and status tracker (leave requests, regularisation requests)
- Downloadable payslips and tax documents (if payroll is integrated)
- Team directory and contact info
- Announcements and HR policy documents
- Feedback and support ticket submission
- Profile and preference updates
- Biometric enrollment status (link to re-enrollment request)
- Face enrollment status and re-enrollment request (if face verification fails repeatedly)

### Features
- Self-service leave and regularisation requests
- Mobile-responsive design
- Push/email notifications for request status updates
- Document repository access (policies, contracts)
- View own task assignments and update progress

### Key Business Rules
- Employees can only view their own data (not teammates')
- Support tickets are routed to HR Officer by default
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
- Team capacity planning calendar
- Performance metrics: punctuality trends, leave patterns, task completion rates
- Quick approve / reject actions (inline, no navigation required)
- Team communication panel
- Export team reports for meetings

### Features
- One-click leave approvals from the queue
- Team availability visualization (who is in, who is out, who is on leave)
- Automated reminders for pending actions beyond SLA
- Performance trend alerts (e.g. employee has been late 5+ times this month)
- Delegation of approval authority to another manager (during own leave)

### Key Business Rules
- Dashboard only shows direct reports (configurable if matrix management is needed)
- Pending approvals older than `N` days (configurable) trigger escalation reminders
- Delegation requires HR Admin approval

### Users
| Role | Access |
|------|--------|
| Manager | Full team dashboard |

---

## 13. Module 10 — HR Admin Panel

### Purpose
Central control panel for HR operations — policy configuration, bulk operations, system health, and workforce analytics.

### UI Elements
- System configuration dashboard
- Holiday and policy calendar management
- Bulk update tools (shift changes, leave allocation, department moves)
- Compliance reporting dashboard
- User management and onboarding checklist management
- System health and usage analytics
- Integration settings (payroll, LDAP, external APIs)
- **Invite management panel** — send, track, resend, and revoke employee registration invites
- **QR code zone management** — configure check-in locations, geofence boundaries per site
- **Face enrollment health overview** — enrollment rates per department, re-enrollment requests

### Features
- Centralized policy management (leave types, overtime rules, attendance thresholds)
- Batch processing of HR updates
- Advanced workforce planning analytics
- System maintenance controls
- Full onboarding workflow builder (integrates with Task Management module)

### Key Business Rules
- Policy changes take effect from a configurable effective date, not immediately
- Bulk operations require a confirmation step and are logged in full
- Holiday calendar changes retroactively update any affected attendance records

### Users
| Role | Access |
|------|--------|
| HR Admin | Full panel |

---

## 14. Module 11 — QR + Geofence + Face Attendance (UPDATED)

### Purpose
Replaces IoT fingerprint hardware entirely. Manages check-in/check-out using a three-layer verification pipeline: **rotating QR code scan → GPS geofence validation → face-api.js face verification**. This approach requires no physical devices beyond the employee's own smartphone or the office's existing display screens, while being significantly harder to spoof than a simple QR or PIN system.

### How It Works — The Three-Layer Pipeline

```
STEP 1 — QR Scan
  HR displays a rotating, time-limited QR code on a screen at each check-in point
  (or embeds it in the web portal for remote/WFH workers)
  Employee scans the QR code with their phone or opens it in the browser
  System validates: token is active, not expired, not already consumed by this user today

STEP 2 — Geofence Validation
  On QR scan, system requests the employee's GPS coordinates (browser Geolocation API)
  System checks coordinates fall within the registered geofence for that QR zone
  If outside geofence → check-in rejected, attempt logged, HR Officer notified

STEP 3 — Face Verification (Anti-Spoofing / Anti-Proxy Layer)
  If QR + geofence both pass → browser activates camera via face-api.js
  Employee looks at camera → liveness detection runs (blink / head movement prompt)
  face-api.js computes a 128-dimension face descriptor
  Descriptor compared against the enrolled descriptor stored for this employee
  Euclidean distance must be below threshold (configurable, default 0.5)
  On success → attendance event created, sync engine triggered
  On failure → attempt logged, employee prompted to retry (max 3 attempts before HR alert)
```

### UI Elements
- **Check-in screen** — scannable QR code display (kiosk/screen view for the office) and employee-facing scan + face verification flow
- **Face enrollment wizard** — guided step-by-step face capture during registration (3 captures required); accessible to HR for re-enrollment
- **Face profile management** — per-employee enrollment status, last verified date, re-enrollment request handling
- **QR code management panel** — generate, rotate, expire, and assign QR codes per location/zone (HR Admin and IT Admin)
- **Geofence zone configuration** — draw/configure GPS boundary per office site or department (HR Admin / IT Admin)
- **Attendance event log** — live feed of check-in/check-out events with step-by-step result (QR ✅ / Geo ✅ / Face ✅ or which step failed)
- **Re-enrollment request form** — employee-initiated, requires HR Officer approval
- **Check-in anomaly dashboard** — list of rejected attempts with reason, timestamp, and employee

### Face Verification Technology
- Library: **face-api.js** (browser-based, runs fully client-side — no face image ever leaves the browser)
- Models required: `ssd_mobilenetv1` (detection), `face_landmark_68_net` (landmarks), `face_recognition_net` (128D descriptor)
- Models are loaded from the app's CDN/static assets on first use and cached in the browser
- **What is stored server-side:** only the 128-dimension Float32Array descriptor (encrypted at rest, AES-256)
- **What is never stored:** raw images, video frames, or any reconstructable representation of the face
- Liveness check: prompt employee to blink or turn head slightly; verify descriptor changes across 2 frames to prevent photo spoofing

### QR Code Specification
```json
{
  "qr_token": "uuid-v4",
  "zone_id": "ZONE-NAIROBI-MAIN",
  "event_type": "CHECK_IN",
  "issued_at": "2025-08-14T07:55:00Z",
  "expires_at": "2025-08-14T08:10:00Z",
  "rotation_interval_seconds": 30,
  "single_use_per_employee": true
}
```
- QR codes rotate every 30 seconds by default (configurable per zone)
- Each code is single-use per employee per day — scanning the same rotated code twice is rejected
- QR codes are JWT-signed — tampering invalidates the token server-side

### Geofence Zone Model
```
zone_id           UUID, PK
zone_name         string
site_label        string (e.g. "Nairobi HQ – Main Entrance")
department_id     FK → Department, nullable (null = all departments)
center_lat        float
center_lng        float
radius_meters     integer (default: 100)
is_active         boolean
created_by        FK → User (HR Admin / IT Admin)
created_at        timestamp
```

### Face Profile Data Model
```
face_profile_id   UUID, PK
employee_id       FK → User, unique
descriptor        float[128], encrypted at rest (AES-256)
enrollment_date   timestamp
enrolled_by       FK → User (HR Officer / self during registration)
is_active         boolean
consent_captured  boolean
consent_date      timestamp
last_verified     timestamp, nullable
```

### Attendance Check-In Event Payload (created by this module)
```json
{
  "employee_id": "EMP-4521",
  "zone_id": "ZONE-NAIROBI-MAIN",
  "qr_token": "uuid-v4",
  "event_type": "CHECK_IN",
  "timestamp": "2025-08-14T08:02:15Z",
  "geofence_passed": true,
  "gps_coords": { "lat": -1.2921, "lng": 36.8219 },
  "face_verified": true,
  "face_confidence": 0.42,
  "liveness_passed": true
}
```

### Key Business Rules
- All three layers (QR valid, geofence pass, face match) must succeed for attendance to be recorded
- If geofence fails → check-in is rejected immediately (face step not reached)
- If face verification fails 3 consecutive times → account check-in locked for the day, HR Officer + employee notified
- Face enrollment is mandatory at registration — cannot be skipped
- Face descriptors are deleted immediately on employee offboarding
- GDPR consent must be captured before enrollment; consent is recorded in the face profile
- A WFH employee can check in via a special WFH QR code (no geofence restriction, face verification still required)
- QR codes displayed on office screens must refresh automatically — HR Admin configures rotation interval per zone
- Re-enrollment requires HR Officer initiation or HR-approved employee self-request

### Check-In Flow States
```
QR_SCANNED → GEOFENCE_VALIDATING → GEOFENCE_PASSED → FACE_VERIFYING → VERIFIED → ATTENDANCE_CREATED
                                 ↓                                    ↓
                          GEOFENCE_FAILED                      FACE_FAILED (retry or lock)
```

### Face Verification Security Rules
- Face descriptors are **never** sent to a third-party API — all processing is client-side (face-api.js)
- Only the encrypted 128D descriptor is stored on the server
- Descriptor access is restricted by RBAC — HR Officer and IT Admin only
- Every access to a face descriptor is logged in the audit trail
- Right to erasure: descriptor deletion must be executed immediately on request (GDPR)

### Users
| Role | Access |
|------|--------|
| Employee | Check in/out via QR + geofence + face flow; request re-enrollment |
| HR Officer | Enroll and manage face profiles; view check-in event log; handle re-enrollment requests |
| HR Admin | Configure geofence zones, QR rotation settings, check-in anomaly review |
| IT Admin | QR code generation and rotation management, system config, anomaly dashboard |
| System | Process check-in events, trigger sync engine, send alerts on failures |

---

## 15. Module 12 — Task Management (NEW)

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
- Notification preferences per task
- Task reports dashboard

### Task Creation Fields
```
title           string, required
description     text, optional
priority        enum: LOW | MEDIUM | HIGH | URGENT
status          enum: TODO | IN_PROGRESS | BLOCKED | IN_REVIEW | DONE
assigned_to     array of employee_ids
assigned_by     employee_id (manager or HR)
department      string, optional
project_tag     string, optional
start_date      date, optional
due_date        date, required
attachments     array of file URLs, optional
subtasks        array of subtask objects, optional
```

### Task Lifecycle
```
TODO → IN_PROGRESS → IN_REVIEW → DONE
              ↓
           BLOCKED → IN_PROGRESS (unblocked)
```

### Subtask Object
```json
{
  "subtask_id": "ST-001",
  "parent_task_id": "TASK-042",
  "title": "Draft initial report",
  "assigned_to": "EMP-4521",
  "status": "DONE",
  "due_date": "2025-08-10"
}
```

### Progress Auto-Calculation
- If subtasks exist: `progress = (completed_subtasks / total_subtasks) * 100`
- If no subtasks: progress is set manually by the assignee

### Notification Triggers

| Event | Notify |
|-------|--------|
| Task assigned | Assignee |
| Task due in 24 hours | Assignee + Manager |
| Task overdue | Assignee + Manager |
| Task overdue > 48 hours | Manager + HR Officer |
| Status changed to BLOCKED | Manager |
| Task completed | Assigner |
| Comment added | All task participants |
| Subtask completed | Task owner |

### Key Business Rules
- Only managers and HR roles can create and assign tasks
- Employees can only update tasks assigned to them
- A task cannot be closed by the assignee — only the assigner or a manager
- Overdue escalation: Day 1 → alert assignee; Day 2+ → alert manager
- Tasks linked to employees on approved leave are flagged as at-risk automatically
- Deleted tasks are soft-deleted and remain in the audit log
- Assignee workload warning: if an employee has more than `N` open tasks (configurable), a warning appears on assignment

### Integration with Other Modules
- Leave Management: if assignee has approved leave overlapping task due date → auto-warning on task creation
- Attendance: if assignee is absent (unexpected) → open tasks flagged as at-risk
- Reporting: task completion data feeds into the analytics module
- HR Admin Panel: onboarding checklists are built as task sequences assigned to new joiners
- Audit: all task state changes, comments, and assignments logged

### Users
| Role | Access |
|------|--------|
| Employee | View assigned tasks, update progress, add comments/files, complete subtasks |
| Manager | Create, assign, track team board, review, close tasks, view team reports |
| HR Officer | Assign HR/compliance tasks, manage onboarding checklists, view completion reports |
| HR Admin | Configure task categories, set workflow automation rules, full report access |
| IT Admin | Configure system settings for task module, audit log access |

---

---

## 16. Module 13 — Continuous Presence Monitoring

### Purpose
Solves the proxy attendance problem: an employee checks in successfully (QR + geofence + face), then leaves the office. The system detects their absence by silently polling their GPS location in the foreground while StaffSync is open in their browser. No action is required from the employee — it runs completely in the background as long as the tab is open.

> **Approach: Option A — Foreground GPS Polling (Web-only)**
> The browser's `navigator.geolocation.watchPosition()` API is used to continuously stream GPS coordinates to the backend while the StaffSync tab is active. This is the only reliable GPS method available in a web app without a native mobile app. Polling stops if the tab is closed or the browser is minimised — this itself is treated as a signal and triggers an inactive timer.

### How It Works

```
Employee checks in at 08:07 ✅ (QR + Geofence + Face all passed)
        ↓
System sets presence_status = CHECKED_IN
Starts expecting GPS heartbeats every 10 minutes
        ↓
Browser sends GPS coordinates silently every 10 min
        ↓
Each heartbeat → PHP validates coordinates against geofence zone
        ↓
INSIDE GEOFENCE ✅              OUTSIDE GEOFENCE ❌
Log heartbeat, all good         Trigger OUT_OF_ZONE alert (see flow below)
        ↓
Tab closed / browser inactive → no heartbeat received
After 30 min silence → INACTIVE alert triggered
```

### Out-of-Zone Detection Flow
```
GPS poll received → coordinates outside geofence radius
        ↓
FIRST violation → Grace period starts (configurable, default 10 min)
Employee receives in-app warning: "You appear to be outside the office.
Please return or your attendance will be flagged."
        ↓
Next poll (10 min later):
  Still outside → attendance flagged PRESENCE_DOUBT
  Manager + HR Officer notified immediately
  Audit log entry created
        ↓
Back inside geofence on any poll → flag cleared automatically
Status returns to CHECKED_IN, log entry updated
```

### Tab Inactive / No Signal Flow
```
Last heartbeat received → timer starts (configurable, default 30 min)
        ↓
30 min passes with no heartbeat:
  Attendance flagged: INACTIVE_SIGNAL
  In-app notification sent (appears when tab is reopened)
  HR Officer notified
        ↓
Employee reopens tab → GPS resumes automatically
  If back in geofence → status restored to CHECKED_IN
  If outside geofence → treat as OUT_OF_ZONE flow above
```

### UI Elements
- **Presence status indicator** — small dot on employee dashboard (🟢 Active / 🟡 Warning / 🔴 Flagged). Employee always knows their current monitoring status.
- **Live presence board** (Manager + HR view) — real-time grid of all employees: status, last heartbeat timestamp, location status
- **Monitoring event log** — per-employee timeline of all GPS heartbeats, zone entries/exits, and inactive periods
- **Geofence override panel** — Manager or HR Officer can mark an employee as `ON_FIELD` or `EXEMPT` to pause monitoring (e.g. for site visits, external meetings)
- **Monitoring configuration panel** (HR Admin) — configure poll interval, grace period, inactive threshold, and what triggers alerts

### Configuration Options (HR Admin)

| Setting | Default | Description |
|---|---|---|
| Poll interval | 10 min | How often browser sends GPS to backend |
| Grace period on exit | 10 min | Time before OUT_OF_ZONE is escalated |
| Inactive signal threshold | 30 min | Minutes of silence before INACTIVE flag |
| Auto-restore on return | Yes | Clear flag automatically when back in zone |
| Monitoring hours | Shift hours only | Only monitor between check-in and check-out |

### Presence Status Values
```
CHECKED_IN         — checked in, inside geofence, heartbeats normal
INACTIVE_SIGNAL    — no GPS heartbeat received within threshold (tab closed)
OUT_OF_ZONE        — GPS received but outside geofence boundary
PRESENCE_DOUBT     — escalated: was out-of-zone for more than grace period
EXEMPT             — manually marked by manager (field visit, external meeting)
CHECKED_OUT        — normal check-out, monitoring stops
```

### GPS Heartbeat Data Model
```
heartbeat_id       UUID, PK
employee_id        FK → User
session_id         string (ties all heartbeats for one shift together)
timestamp          timestamp
lat                float
lng                float
zone_id            FK → GeofenceZone
in_zone            boolean
distance_from_center float (meters)
flag_triggered     boolean
```

### Monitoring Event Log Model
```
event_id           UUID, PK
employee_id        FK → User
event_type         enum (HEARTBEAT_OK | OUT_OF_ZONE | BACK_IN_ZONE | INACTIVE_START | INACTIVE_RESOLVED | FLAG_RAISED | FLAG_CLEARED | EXEMPT_GRANTED | EXEMPT_REMOVED)
timestamp          timestamp
details            JSON (coords, distance, triggered_by)
resolved_at        timestamp, nullable
resolved_by        FK → User, nullable
```

### Frontend Implementation Notes (React)
```javascript
// Start monitoring after successful check-in
const watchId = navigator.geolocation.watchPosition(
  (position) => {
    // Send coords to PHP backend every poll interval
    sendHeartbeat(position.coords.latitude, position.coords.longitude);
  },
  (error) => { handleGPSError(error); },
  { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 }
);

// On check-out or tab unload — stop watching
navigator.geolocation.clearWatch(watchId);

// Detect tab visibility change
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Tab went inactive — backend will detect missing heartbeat after threshold
  } else {
    // Tab active again — GPS resumes automatically via watchPosition
  }
});
```

### Backend PHP Logic (monitoring.php)
```
POST /api/monitoring.php?action=heartbeat
  → Validate JWT
  → Receive lat, lng, employee_id
  → Load employee's active geofence zone from MySQL
  → Calculate distance from zone center (Haversine formula)
  → If distance > radius → trigger OUT_OF_ZONE logic
  → If distance <= radius → log HEARTBEAT_OK, clear any active flags
  → Return status to frontend

GET /api/monitoring.php?action=live_board
  → HR Officer / Manager only
  → Return all active employees with latest heartbeat timestamp + status

POST /api/monitoring.php?action=exempt
  → Manager / HR Officer only
  → Set employee presence_status = EXEMPT for given time window
```

### Key Business Rules
- Monitoring only runs between check-in and check-out — never outside shift hours
- The employee's presence status indicator is always visible to them — no hidden surveillance without awareness
- One missed heartbeat is never enough to flag — the inactive threshold (default 30 min) accounts for brief tab switches
- If an employee checks out normally, all monitoring for that shift stops immediately
- EXEMPT status can only be granted by a Manager or HR Officer, not by the employee themselves
- All GPS coordinates are stored only for the current working day — purged after 24 hours (data minimisation)
- Monitoring events are retained in the audit log for the standard retention period
- If GPS permission is denied by the browser after check-in, employee is notified and HR Officer is alerted — they cannot remain checked-in without GPS consent

### Users
| Role | Access |
|---|---|
| Employee | See own presence status indicator; receive warnings; no access to monitoring log |
| Manager | Live presence board for their team; grant EXEMPT status; view monitoring event log |
| HR Officer | Live presence board all employees; view + resolve flags; grant EXEMPT |
| HR Admin | Full config (poll interval, thresholds, monitoring hours); all reports |
| IT Admin | View monitoring system health; GPS error logs |

---

## 17. Cross-Module Integrations

This table maps key events that trigger actions across modules.

| Trigger Event | Source Module | Action | Target Module |
|---|---|---|---|
| Employee QR + geofence + face check-in | QR+Face Attendance | Create attendance record + start GPS monitoring | Attendance Management + Presence Monitoring |
| GPS heartbeat outside geofence | Presence Monitoring | Start grace period timer, warn employee | Sync Engine + Notification |
| Grace period expired, still outside zone | Presence Monitoring | Flag attendance PRESENCE_DOUBT, alert HR + Manager | Attendance Management + Audit |
| Employee returns to zone | Presence Monitoring | Auto-clear flag, log BACK_IN_ZONE | Attendance Management + Audit |
| No heartbeat for 30 min (tab inactive) | Presence Monitoring | Flag INACTIVE_SIGNAL, notify HR Officer | Attendance Management + Notification |
| Employee checks out | QR+Face Attendance | Stop GPS monitoring for that session | Presence Monitoring |
| Leave request approved | Leave Management | Update attendance to `ON_LEAVE` | Sync Engine → Attendance |
| QR scan on approved leave day | QR+Face Attendance | Flag conflict | Sync Engine |
| Geofence validation failed | QR+Face Attendance | Log attempt, notify HR Officer | Sync Engine + Audit |
| Face verification failed (3x) | QR+Face Attendance | Lock check-in, notify HR + employee | Notification + Audit |
| Task due date overlaps leave | Task Management | Warn manager on assignment | Leave Management |
| Employee absent unexpectedly | Attendance Management | Flag open tasks as at-risk | Task Management |
| New employee onboarded (invite accepted) | Registration | Create onboarding task sequence | Task Management |
| Leave approved | Leave Management | Manager approval delegation check | Manager Dashboard |
| Face enrollment complete | QR+Face Attendance | Link descriptor to user account | Registration & Auth |
| Task overdue Day 2+ | Task Management | Escalate to manager | Notification + Manager Dashboard |
| Attendance override | Attendance Management | Write audit log entry | Audit & Security |
| Permission changed | RBAC | Write audit log entry | Audit & Security |
| Invite sent / accepted / expired | Registration | Write audit log entry | Audit & Security |

---

## 18. Data Models (Reference)

> These are simplified logical models. Implement with your chosen database (relational recommended for STAFFSYNC).

### User
```
user_id           UUID, PK
employee_id       string, unique
email             string, unique
full_name         string
role              enum (EMPLOYEE | MANAGER | HR_OFFICER | HR_ADMIN | IT_ADMIN)
department_id     FK → Department
position          string
is_active         boolean
face_profile_id   string, nullable (FK → FaceProfile)
invite_token      string, nullable (cleared after registration completes)
invite_status     enum (PENDING | ACCEPTED | EXPIRED | REVOKED), nullable
invited_by        FK → User (HR Officer / HR Admin), nullable
invited_at        timestamp, nullable
registered_at     timestamp, nullable
created_at        timestamp
updated_at        timestamp
```

### AttendanceRecord
```
record_id         UUID, PK
employee_id       FK → User
date              date
check_in          timestamp, nullable
check_out         timestamp, nullable
status            enum (PRESENT | LATE | ABSENT | ON_LEAVE | HALF_DAY | WFH | HOLIDAY)
source            enum (QR_FACE_SCAN | MANUAL_ENTRY | SYSTEM_AUTO)
zone_id           FK → GeofenceZone, nullable
geofence_passed   boolean, nullable
face_verified     boolean, nullable
face_confidence   float, nullable
override_by       FK → User, nullable
override_reason   text, nullable
created_at        timestamp
```

### LeaveRequest
```
request_id        UUID, PK
employee_id       FK → User
leave_type        enum
start_date        date
end_date          date
reason            text
status            enum (DRAFT | SUBMITTED | UNDER_REVIEW | APPROVED | REJECTED | CANCELLED)
approved_by       FK → User, nullable
rejection_reason  text, nullable
document_url      string, nullable
created_at        timestamp
updated_at        timestamp
```

### FaceProfile
```
face_profile_id   UUID, PK
employee_id       FK → User, unique
descriptor        float[128] (encrypted at rest, AES-256)
enrollment_date   timestamp
enrolled_by       FK → User (HR Officer or self during registration)
is_active         boolean
consent_captured  boolean
consent_date      timestamp
last_verified     timestamp, nullable
```

### GeofenceZone
```
zone_id           UUID, PK
zone_name         string
site_label        string
department_id     FK → Department, nullable
center_lat        float
center_lng        float
radius_meters     integer (default: 100)
is_active         boolean
created_by        FK → User
created_at        timestamp
```

### QRCode
```
qr_id             UUID, PK
qr_token          string, unique (JWT-signed)
zone_id           FK → GeofenceZone
event_type        enum (CHECK_IN | CHECK_OUT)
issued_at         timestamp
expires_at        timestamp
is_active         boolean
rotation_interval integer (seconds)
created_by        FK → User
```

### EmployeeInvite
```
invite_id         UUID, PK
email             string
role              enum
department_id     FK → Department
position          string
token             string, unique (hashed)
status            enum (PENDING | ACCEPTED | EXPIRED | REVOKED)
invited_by        FK → User (HR Officer / HR Admin)
invited_at        timestamp
expires_at        timestamp (invited_at + 48 hours)
accepted_at       timestamp, nullable
revoked_by        FK → User, nullable
revoked_at        timestamp, nullable
```

### GPSHeartbeat
```
heartbeat_id         UUID, PK
employee_id          FK → User
session_id           string (groups all heartbeats for one shift)
timestamp            timestamp
lat                  float
lng                  float
zone_id              FK → GeofenceZone
in_zone              boolean
distance_from_center float (meters)
flag_triggered       boolean
```

### PresenceMonitoringEvent
```
event_id             UUID, PK
employee_id          FK → User
event_type           enum (HEARTBEAT_OK | OUT_OF_ZONE | BACK_IN_ZONE | INACTIVE_START | INACTIVE_RESOLVED | FLAG_RAISED | FLAG_CLEARED | EXEMPT_GRANTED | EXEMPT_REMOVED)
timestamp            timestamp
details              JSON
resolved_at          timestamp, nullable
resolved_by          FK → User, nullable
```

### Task
title             string
description       text
priority          enum (LOW | MEDIUM | HIGH | URGENT)
status            enum (TODO | IN_PROGRESS | BLOCKED | IN_REVIEW | DONE)
assigned_by       FK → User
assigned_to       array of FK → User
department_id     FK → Department, nullable
project_tag       string, nullable
start_date        date, nullable
due_date          date
progress_pct      integer (0–100)
is_deleted        boolean (soft delete)
created_at        timestamp
updated_at        timestamp
```

### Subtask
```
subtask_id        UUID, PK
parent_task_id    FK → Task
title             string
assigned_to       FK → User, nullable
status            enum (TODO | IN_PROGRESS | DONE)
due_date          date, nullable
```

### AuditLog
```
log_id            UUID, PK
event_type        string (from Auditable Events list)
actor_id          FK → User (nullable for SYSTEM events)
target_type       string (user | task | leave | attendance | device | ...)
target_id         UUID
before_state      JSON, nullable
after_state       JSON, nullable
ip_address        string
timestamp         timestamp
```

---

## 19. Security & Compliance Notes

### Authentication & Sessions
- PHP sessions for server-side session management (session_start, session_destroy)
- JWT tokens used for stateless API calls — signed with a secret key stored in PHP config
- Short JWT expiry (15–30 min) + refresh tokens stored in MySQL (revocable)
- All PHP API files validate the JWT or session token before processing any request
- Passwords hashed with `password_hash()` / `password_verify()` (bcrypt)

### Face Data (HIGHEST PRIORITY)
- **Never store raw face images** — only the 128-dimension descriptor computed by face-api.js
- All face processing runs **client-side in the browser** (face-api.js) — no images leave the device
- Descriptors are encrypted at rest (AES-256 minimum)
- Descriptors are encrypted in transit (TLS 1.2+)
- Descriptor access is restricted via RBAC — only HR Officer and IT Admin
- Log every access to face descriptor data in the audit log
- Capture explicit GDPR consent before enrollment; consent stored with timestamp and actor
- Delete descriptor immediately on employee offboarding
- Never transmit descriptors to third parties
- Face verification threshold is configurable (Euclidean distance, default 0.5); HR Admin controls this

### GDPR / Data Protection
- Face descriptor data is sensitive personal data under GDPR Article 9
- Right to erasure: implement descriptor deletion + audit log redaction workflow
- Data minimization: collect only what is needed (128D descriptor, no images)
- Data retention policy: configure per organization, enforce via scheduled jobs
- Consent must be re-captured if the employee's face profile is re-enrolled

### General Security
- Use PHP PDO with prepared statements on every MySQL query — prevents SQL injection
- Sanitize all outputs to prevent XSS (`htmlspecialchars()`)
- Rate limit login attempts using a `login_attempts` MySQL table (track IP + timestamp)
- Log all authentication failures (password + face)
- Use HTTPS in production; on localhost, ensure PHP is not exposing errors to the browser (`display_errors = Off` in production)
- CORS headers set explicitly in each PHP API file
- RBAC checked at the top of every PHP API file before any logic runs
- QR tokens are JWT-signed with server secret (`qr_secret` in PHP config) — tampering is detectable
- GPS coordinates from the browser are validated server-side in PHP against MySQL geofence zone records
- Invite tokens are single-use, hashed in MySQL — raw token sent only via email, never stored plain
- File uploads validated by MIME type and extension in PHP before saving to disk

---

## 20. Notification Events Reference

| Event | Channel | Recipients |
|---|---|---|
| Employee invite sent | Email | Employee (invite email) |
| Employee invite accepted (registration complete) | In-app | HR Officer who sent invite |
| Employee invite expired (no action in 48h) | In-app + email | HR Officer |
| Leave request submitted | In-app + email | Manager |
| Leave approved | In-app + email | Employee |
| Leave rejected | In-app + email | Employee |
| Attendance conflict detected | In-app | HR Officer, Manager |
| Regularisation request submitted | In-app | Manager |
| Task assigned | In-app + email | Assignee |
| Task due in 24h | In-app + email | Assignee, Manager |
| Task overdue (Day 1) | In-app + email | Assignee |
| Task overdue (Day 2+) | In-app + email | Assignee, Manager |
| Task blocked | In-app | Manager |
| Face verification failed (single attempt) | In-app | Employee |
| Face verification failed (3 consecutive — locked) | In-app + email | Employee, HR Officer |
| Face enrollment complete | In-app | Employee, HR Officer |
| Face re-enrollment requested | In-app | HR Officer |
| Geofence check-in failure | In-app | HR Officer |
| QR code anomaly (scan outside zone) | In-app | IT Admin, HR Officer |
| GPS out-of-zone warning (grace period started) | In-app | Employee |
| GPS out-of-zone escalated (PRESENCE_DOUBT) | In-app + email | Employee, Manager, HR Officer |
| Employee returned to zone (flag auto-cleared) | In-app | Manager, HR Officer |
| GPS signal inactive for 30 min (tab closed) | In-app (on reopen) + email | Employee, HR Officer |
| GPS signal resumed after inactive | In-app | HR Officer |
| GPS permission denied after check-in | In-app + email | Employee, HR Officer |
| Exempt status granted | In-app | Employee |
| Suspicious login attempt | In-app + email | IT Admin |
| Backup failure | In-app + email | IT Admin |

---

*End of StaffSync Development Specification v4.0*
*Prepared for DevX Ltd — 20 sections, 13 modules*
*v4.0: Module 13 added — Continuous Presence Monitoring (foreground GPS polling, web-only, Option A).*
*v3.0: Tech stack finalised (React + Tailwind + face-api.js frontend, pure PHP backend, MySQL, SMTP email, local file storage). API Endpoints reference section removed.*
*v2.0: IoT fingerprint replaced with QR + Geofence + face-api.js. HR-invite-only registration added.*
