# Modern Dental Clinic Platform & Clinical Management System

A production-grade, white-label healthcare practice management platform built for modern dental clinics. Designed to be customized in under 60 seconds for any clinic pitch or deployment, powered by Node.js native standard library (`node:http`, `node:sqlite`, `node:crypto`) with zero external npm dependencies, ACID compliance, atomic double-booking protection, and enterprise privacy standards.

---

## ⚡ 60-Second Customization (`clinic.config.json`)

To rebrand this platform for any prospective dental clinic, simply update `clinic.config.json` in the project root. The server, booking engine, calendar generator, and communication system automatically load this configuration:

```json
{
  "clinic": {
    "name": "Apex Dental Studio",
    "tagline": "Advanced Dental Care & Maxillofacial Studio",
    "shortName": "Apex Dental",
    "phone": "+91 98765 43210",
    "email": "contact@apexdentalstudio.example.com",
    "address": {
      "line1": "Suite 400, Healthcare Plaza",
      "line2": "Medical Center Boulevard",
      "city": "Metro City",
      "state": "State",
      "pincode": "100001",
      "landmark": "Tower B, Level 4 · Valet Parking Available"
    }
  },
  "practitioners": [
    {
      "id": "doc_aryan_sharma",
      "name": "Dr. Aryan Sharma",
      "degrees": "BDS, MDS (Oral & Maxillofacial Surgery)",
      "speciality": "Oral & Maxillofacial Surgeon, Implantologist"
    },
    {
      "id": "doc_priya_mehta",
      "name": "Dr. Priya Mehta",
      "degrees": "BDS, MDS (Endodontics & Conservative Dentistry)",
      "speciality": "Endodontist & Restorative Dentist"
    }
  ]
}
```

---

## Core System Architecture & Features

### 1. Public Patient Website & Procedure Showcase (`index.html`)
- High-definition responsive layout with clean operatory and clinical visuals.
- Showcase of 9 major dental specialities: Dental Implants, Root Canal Treatments, Oral & Maxillofacial Surgery, Laser Dentistry, Teeth Cleaning & Polishing, Orthodontics, Pediatric Dentistry, Periodontics, and Hair Restoration.
- Interactive FAQ, emergency assistance hotline, and interactive maps integration.

### 2. Online Appointment Booking Engine (`book.html`)
- **Seamless 8-Step Stepper Flow**:
  1. Service Selection
  2. Specialist Selection (Dr. Aryan Sharma, Dr. Priya Mehta, or Any Available)
  3. Dynamic Date Picker (Next 21 days with weekday/Sunday clinic hour awareness)
  4. Time Slot Availability (Real-time availability status)
  5. Patient Contact Information
  6. Review & Slot Deposit Notice (₹500 simulated deposit)
  7. Demo Payment Simulation & 10-Minute Temporary Slot Hold (Live countdown timer, mock UPI/Card selectors, simulated failure mode)
  8. Instant Booking Confirmation (Reference code, payment code, and RFC-5545 `.ics` Calendar integration)
- **Concurrency & Double-Booking Protection**:
  - SQLite atomic transactions (`BEGIN IMMEDIATE`) backed by unique partial indexes guarantee zero double-booking even under concurrent traffic spikes.
  - Temporary slot holds expire automatically after 10 minutes via lazy cleanup.

### 3. Staff Dashboard & Live Queue System (`dashboard.html`)
- Role-based cryptographic PIN authentication:
  - Reception (PIN: `1024`)
  - Dr. Aryan Sharma (PIN: `2048`)
  - Dr. Priya Mehta (PIN: `4096`)
  - Clinic Owner (PIN: `8192`)
- Live reception patient check-in generating daily sequential clinic tokens (`T-01`, `T-02`, ...).
- Real-time operatory states: Waiting, In Consultation, Completed, and No-Show.
- Strict clinician isolation: Specialists can call and manage their own assigned queue.

### 4. Clinical EHR & Workspace (`patient.html`)
- Unified longitudinal patient records with conservative identity resolution.
- **Interactive 5-Surface Adult Permanent FDI Dentition Odontogram**:
  - Full support for adult permanent teeth (11–18, 21–28, 31–38, 41–48).
  - 5 anatomical surfaces: Mesial, Distal, Occlusal, Buccal, Lingual, plus Whole Tooth.
  - Clinical finding taxonomy (Caries, Missing, Restored, RCT, Fracture, Impacted, Crown) with soft-archive audit preservation.
- Consultation notes, multi-stage treatment plans, and printable prescription slips with customizable clinic letterhead.

### 5. Follow-ups & WhatsApp Messaging Platform
- Deterministic clinical follow-up state machine (`PENDING` &rarr; `DUE` &rarr; `CONTACTED` &rarr; `SCHEDULED` &rarr; `COMPLETED`).
- Automated WhatsApp communication service with Meta Cloud API integration and mock fallback.
- Standardized clinic message templates with dynamic variable replacement (`{{clinic_name}}`, `{{clinic_phone}}`, `{{clinic_address}}`).
- Webhook delivery receipt processing (`SENT` &rarr; `DELIVERED` &rarr; `READ`) and background job scheduler.

---

## Technology Stack

- **Runtime**: Node.js (v20+ recommended, tested on Node.js v25)
- **Database**: SQLite via Node.js Native SQLite (`node:sqlite`)
- **Server**: Native Node HTTP (`node:http`) & Crypto (`node:crypto`)
- **Dependencies**: **0 external npm packages** (Zero attack surface, instant startup)
- **Frontend**: Semantic HTML5, Vanilla JavaScript, CSS3 with modern Design Tokens

---

## Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) version 20.0.0 or higher.

### 2. Start the Server
```bash
npm start
# or
node server/server.js
```

The database (`data/dental_square.db`) is automatically initialized and synced with `clinic.config.json` on startup.

### 3. Access the Application
- **Public Homepage**: [http://localhost:3000/](http://localhost:3000/)
- **Online Booking**: [http://localhost:3000/book.html](http://localhost:3000/book.html)
- **Clinic Dashboard**: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- **Clinical Workspace**: [http://localhost:3000/patient.html](http://localhost:3000/patient.html)
- **API Health Check**: [http://localhost:3000/api/health](http://localhost:3000/api/health)
- **Clinic Configuration API**: [http://localhost:3000/api/clinic-config](http://localhost:3000/api/clinic-config)

---

## License
MIT License / Proprietary for Dental Practice Deployments.
