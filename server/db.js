/**
 * Clinic Management System — Database Layer (Phase 2 Booking Engine)
 * Native node:sqlite implementation with atomic concurrency guarantees
 * Zero external npm dependencies. ACID compliant with double-booking protection.
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'dental_square.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Enable WAL mode & foreign keys
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Initialize Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS practitioners (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    qualifications TEXT NOT NULL,
    specialization TEXT NOT NULL,
    affiliations TEXT,
    assigned_operatory TEXT,
    schedule_days TEXT NOT NULL,
    working_hours_start TEXT NOT NULL,
    working_hours_end TEXT NOT NULL,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    description TEXT,
    image_url TEXT,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    booking_reference TEXT UNIQUE NOT NULL,
    patient_name TEXT NOT NULL,
    patient_phone TEXT NOT NULL,
    patient_email TEXT,
    patient_type TEXT NOT NULL,
    doctor_id TEXT NOT NULL,
    doctor_name TEXT NOT NULL,
    service_id TEXT NOT NULL,
    service_name TEXT NOT NULL,
    appointment_date TEXT NOT NULL,
    appointment_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'CONFIRMED',
    source TEXT DEFAULT 'PATIENT_WEB',
    token_number INTEGER, -- Nullable field strictly reserved for Phase 3 queue integration
    payment_status TEXT DEFAULT 'PENDING',
    payment_reference TEXT,
    payment_amount INTEGER DEFAULT 500,
    hold_expires_at TEXT,
    notes TEXT,
    is_demo INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (doctor_id) REFERENCES practitioners(id),
    FOREIGN KEY (service_id) REFERENCES services(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_slot 
  ON appointments(doctor_id, appointment_date, appointment_time) 
  WHERE status != 'CANCELLED';

  CREATE INDEX IF NOT EXISTS idx_appointments_date_doc 
  ON appointments(appointment_date, doctor_id);

  CREATE INDEX IF NOT EXISTS idx_appointments_ref 
  ON appointments(booking_reference);

  CREATE TABLE IF NOT EXISTS queue_entries (
    id TEXT PRIMARY KEY,
    appointment_id TEXT NOT NULL,
    booking_reference TEXT NOT NULL,
    queue_date TEXT NOT NULL,
    token_number INTEGER NOT NULL,
    token_display TEXT NOT NULL,
    doctor_id TEXT NOT NULL,
    doctor_name TEXT NOT NULL,
    patient_name TEXT NOT NULL,
    service_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'WAITING',
    arrival_time TEXT NOT NULL,
    called_at TEXT,
    completed_at TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (appointment_id) REFERENCES appointments(id),
    FOREIGN KEY (doctor_id) REFERENCES practitioners(id)
  );

  -- Unique index prevents duplicate queue entries for the same appointment on the same clinic day
  CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_appt_day 
  ON queue_entries(appointment_id, queue_date);

  -- Strict sequential daily token uniqueness per clinic day
  CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_daily_token 
  ON queue_entries(queue_date, token_number);

  CREATE INDEX IF NOT EXISTS idx_queue_date_doc 
  ON queue_entries(queue_date, doctor_id);

  CREATE INDEX IF NOT EXISTS idx_queue_status 
  ON queue_entries(status);

  CREATE TABLE IF NOT EXISTS staff_sessions (
    token TEXT PRIMARY KEY,
    staff_id TEXT NOT NULL,
    staff_name TEXT NOT NULL,
    role TEXT NOT NULL,
    doctor_id TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_staff_sessions_expires 
  ON staff_sessions(expires_at);

  -- ========================================================================
  -- Phase 4 Clinical Entities
  -- ========================================================================
  CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    patient_reference TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    date_of_birth TEXT,
    gender TEXT CHECK(gender IN ('MALE', 'FEMALE', 'OTHER') OR gender IS NULL),
    mobile TEXT NOT NULL,
    email TEXT,
    patient_type TEXT NOT NULL DEFAULT 'NEW' CHECK(patient_type IN ('NEW', 'RETURNING')),
    dentist_entered_alerts TEXT,
    is_flagged_ambiguous INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_patients_mobile ON patients(mobile);
  CREATE INDEX IF NOT EXISTS idx_patients_ref ON patients(patient_reference);

  CREATE TABLE IF NOT EXISTS clinical_notes (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES patients(id),
    appointment_id TEXT REFERENCES appointments(id),
    note_type TEXT NOT NULL CHECK(note_type IN ('CONSULTATION', 'EXAMINATION', 'TREATMENT', 'GENERAL')),
    chief_complaint TEXT,
    clinical_observations TEXT,
    dentist_entered_diagnosis TEXT,
    advice TEXT,
    content TEXT NOT NULL,
    dentist_id TEXT NOT NULL REFERENCES practitioners(id),
    dentist_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_notes_patient ON clinical_notes(patient_id);
  CREATE INDEX IF NOT EXISTS idx_notes_appt ON clinical_notes(appointment_id);

  CREATE TABLE IF NOT EXISTS odontogram_findings (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES patients(id),
    appointment_id TEXT REFERENCES appointments(id),
    tooth_number INTEGER NOT NULL,
    surface TEXT NOT NULL CHECK(surface IN ('MESIAL', 'DISTAL', 'OCCLUSAL', 'BUCCAL', 'LINGUAL', 'WHOLE_TOOTH')),
    finding_type TEXT NOT NULL,
    severity TEXT CHECK(severity IN ('MILD', 'MODERATE', 'SEVERE') OR severity IS NULL),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'WATCH', 'RESOLVED', 'ARCHIVED')),
    notes TEXT,
    recorded_by TEXT NOT NULL REFERENCES practitioners(id),
    dentist_name TEXT NOT NULL,
    archived_at TEXT,
    archived_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_odontogram_patient ON odontogram_findings(patient_id);
  CREATE INDEX IF NOT EXISTS idx_odontogram_tooth ON odontogram_findings(patient_id, tooth_number);

  CREATE TABLE IF NOT EXISTS treatment_plans (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES patients(id),
    appointment_id TEXT REFERENCES appointments(id),
    procedure_name TEXT NOT NULL,
    service_id TEXT REFERENCES services(id),
    tooth_number INTEGER CHECK((tooth_number BETWEEN 11 AND 48) OR tooth_number IS NULL),
    status TEXT NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('NORMAL', 'HIGH', 'URGENT')),
    notes TEXT,
    dentist_id TEXT NOT NULL REFERENCES practitioners(id),
    dentist_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_treatments_patient ON treatment_plans(patient_id);

  CREATE TABLE IF NOT EXISTS treatment_records (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES patients(id),
    appointment_id TEXT REFERENCES appointments(id),
    treatment_plan_id TEXT REFERENCES treatment_plans(id),
    procedure_name TEXT NOT NULL,
    tooth_number INTEGER CHECK((tooth_number BETWEEN 11 AND 48) OR tooth_number IS NULL),
    surfaces_treated TEXT,
    materials_used TEXT,
    clinical_notes TEXT,
    performed_date TEXT NOT NULL,
    dentist_id TEXT NOT NULL REFERENCES practitioners(id),
    dentist_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_records_patient ON treatment_records(patient_id);

  CREATE TABLE IF NOT EXISTS prescriptions (
    id TEXT PRIMARY KEY,
    prescription_number TEXT UNIQUE NOT NULL,
    patient_id TEXT NOT NULL REFERENCES patients(id),
    appointment_id TEXT REFERENCES appointments(id),
    dentist_id TEXT NOT NULL REFERENCES practitioners(id),
    dentist_name TEXT NOT NULL,
    prescription_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ISSUED' CHECK(status IN ('ISSUED', 'CANCELLED', 'SUPERSEDED')),
    superseded_by TEXT REFERENCES prescriptions(id),
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_rx_patient ON prescriptions(patient_id);

  CREATE TABLE IF NOT EXISTS prescription_items (
    id TEXT PRIMARY KEY,
    prescription_id TEXT NOT NULL REFERENCES prescriptions(id) ON DELETE RESTRICT,
    medicine_name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    frequency TEXT NOT NULL,
    duration TEXT NOT NULL,
    instructions TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_rx_items ON prescription_items(prescription_id);

  -- ========================================================================
  -- Phase 5: Follow-ups + Communication / WhatsApp Schema
  -- ========================================================================
  CREATE TABLE IF NOT EXISTS follow_ups (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES patients(id),
    appointment_id TEXT REFERENCES appointments(id),
    treatment_record_id TEXT REFERENCES treatment_records(id),
    treatment_plan_id TEXT REFERENCES treatment_plans(id),
    follow_up_type TEXT NOT NULL,
    reason TEXT,
    preferred_channel TEXT DEFAULT 'WHATSAPP',
    due_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'DUE', 'CONTACTED', 'SCHEDULED', 'COMPLETED', 'SKIPPED', 'CANCELLED')),
    priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('NORMAL', 'HIGH', 'URGENT')),
    notes TEXT,
    assigned_to TEXT,
    contacted_via TEXT,
    contacted_at TEXT,
    completed_at TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_follow_ups_patient ON follow_ups(patient_id, due_date);
  CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status, due_date);

  CREATE TABLE IF NOT EXISTS communication_preferences (
    patient_id TEXT PRIMARY KEY REFERENCES patients(id),
    preferred_channel TEXT NOT NULL DEFAULT 'WHATSAPP' CHECK(preferred_channel IN ('WHATSAPP', 'PHONE', 'SMS', 'NONE')),
    whatsapp_opt_in INTEGER NOT NULL DEFAULT 1,
    preferred_contact_time TEXT DEFAULT 'ANYTIME',
    language_preference TEXT DEFAULT 'en',
    communication_notes TEXT,
    updated_by TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS message_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('APPOINTMENT_CONFIRMATION', 'APPOINTMENT_REMINDER', 'FOLLOW_UP_REMINDER', 'RECALL_REMINDER', 'APPOINTMENT_CHANGE')),
    channel TEXT NOT NULL DEFAULT 'WHATSAPP',
    template_identifier TEXT UNIQUE NOT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    body_preview TEXT NOT NULL,
    variables_schema TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS communications (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES patients(id),
    appointment_id TEXT REFERENCES appointments(id),
    follow_up_id TEXT REFERENCES follow_ups(id),
    channel TEXT NOT NULL DEFAULT 'WHATSAPP',
    communication_type TEXT NOT NULL CHECK(communication_type IN ('APPOINTMENT_CONFIRMATION', 'APPOINTMENT_REMINDER', 'FOLLOW_UP_REMINDER', 'RECALL_REMINDER', 'APPOINTMENT_CHANGE', 'MANUAL_MESSAGE')),
    template_id TEXT REFERENCES message_templates(id),
    recipient TEXT NOT NULL,
    body_rendered TEXT NOT NULL,
    provider_message_id TEXT,
    status TEXT NOT NULL CHECK(status IN ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CANCELLED')),
    scheduled_at TEXT,
    sent_at TEXT,
    delivered_at TEXT,
    read_at TEXT,
    failed_at TEXT,
    failure_reason TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_comms_patient ON communications(patient_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_comms_status ON communications(status, scheduled_at);

  CREATE TABLE IF NOT EXISTS communication_jobs (
    id TEXT PRIMARY KEY,
    idempotency_key TEXT UNIQUE NOT NULL,
    patient_id TEXT NOT NULL REFERENCES patients(id),
    appointment_id TEXT REFERENCES appointments(id),
    follow_up_id TEXT REFERENCES follow_ups(id),
    template_id TEXT NOT NULL REFERENCES message_templates(id),
    job_type TEXT NOT NULL,
    scheduled_for TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'SKIPPED')),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_attempt_at TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_comm_jobs_sched ON communication_jobs(status, scheduled_for);
`);

// Safe column additions to appointments & queue_entries if missing
try { db.exec('ALTER TABLE appointments ADD COLUMN arrival_time TEXT;'); } catch (_) {}
try { db.exec('ALTER TABLE appointments ADD COLUMN consultation_start_time TEXT;'); } catch (_) {}
try { db.exec('ALTER TABLE appointments ADD COLUMN completion_time TEXT;'); } catch (_) {}
try { db.exec('ALTER TABLE appointments ADD COLUMN patient_id TEXT REFERENCES patients(id);'); } catch (_) {}
try { db.exec("ALTER TABLE appointments ADD COLUMN payment_status TEXT DEFAULT 'PENDING';"); } catch (_) {}
try { db.exec("ALTER TABLE appointments ADD COLUMN payment_reference TEXT;"); } catch (_) {}
try { db.exec("ALTER TABLE appointments ADD COLUMN payment_amount INTEGER DEFAULT 500;"); } catch (_) {}
try { db.exec("ALTER TABLE appointments ADD COLUMN hold_expires_at TEXT;"); } catch (_) {}
try { db.exec('ALTER TABLE queue_entries ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;'); } catch (_) {}
try { db.exec("ALTER TABLE communication_preferences ADD COLUMN preferred_contact_time TEXT DEFAULT 'ANYTIME';"); } catch (_) {}
try { db.exec("ALTER TABLE communication_preferences ADD COLUMN language_preference TEXT DEFAULT 'en';"); } catch (_) {}
try { 
  db.exec('ALTER TABLE communications ADD COLUMN idempotency_key TEXT;');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_comms_idempotency ON communications(idempotency_key);');
} catch (_) {}
try {
  const cnt = db.prepare('SELECT COUNT(*) as count FROM follow_ups').get().count;
  if (cnt === 0) {
    db.exec('DROP TABLE IF EXISTS follow_ups;');
    db.exec(`
      CREATE TABLE IF NOT EXISTS follow_ups (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES patients(id),
        appointment_id TEXT REFERENCES appointments(id),
        treatment_record_id TEXT REFERENCES treatment_records(id),
        treatment_plan_id TEXT REFERENCES treatment_plans(id),
        follow_up_type TEXT NOT NULL,
        reason TEXT,
        preferred_channel TEXT DEFAULT 'WHATSAPP',
        due_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'DUE', 'CONTACTED', 'SCHEDULED', 'COMPLETED', 'SKIPPED', 'CANCELLED')),
        priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('NORMAL', 'HIGH', 'URGENT')),
        notes TEXT,
        assigned_to TEXT,
        contacted_via TEXT,
        contacted_at TEXT,
        completed_at TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_follow_ups_patient ON follow_ups(patient_id, due_date);
      CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status, due_date);
    `);
  }
} catch (_) {}
try { db.exec('ALTER TABLE follow_ups ADD COLUMN reason TEXT;'); } catch (_) {}
try { db.exec('ALTER TABLE follow_ups ADD COLUMN preferred_channel TEXT DEFAULT "WHATSAPP";'); } catch (_) {}
try { db.exec('ALTER TABLE follow_ups ADD COLUMN contacted_via TEXT;'); } catch (_) {}
try { db.exec('ALTER TABLE follow_ups ADD COLUMN contacted_at TEXT;'); } catch (_) {}
try { db.exec('ALTER TABLE follow_ups ADD COLUMN completed_at TEXT;'); } catch (_) {}
try { db.exec('ALTER TABLE appointments ADD COLUMN payment_status TEXT DEFAULT "PENDING";'); } catch (_) {}
try { db.exec('ALTER TABLE appointments ADD COLUMN payment_reference TEXT;'); } catch (_) {}
try { db.exec('ALTER TABLE appointments ADD COLUMN payment_amount INTEGER DEFAULT 500;'); } catch (_) {}
try { db.exec('ALTER TABLE appointments ADD COLUMN hold_expires_at TEXT;'); } catch (_) {}

// Seed Verified Practitioners
const practitionerCount = db.prepare('SELECT COUNT(*) as count FROM practitioners').get().count;
if (practitionerCount === 0) {
  const insertPractitioner = db.prepare(`
    INSERT INTO practitioners (
      id, full_name, qualifications, specialization, affiliations, 
      assigned_operatory, schedule_days, working_hours_start, working_hours_end, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  insertPractitioner.run(
    'doc_anuj_kumar',
    'Dr. Aryan Sharma',
    'BDS, MDS (Oral & Maxillofacial Surgery), Certified Implantologist',
    'Oral & Maxillofacial Surgeon, Specialist Implantologist',
    'Senior Specialist · Oral & Maxillofacial Surgery | 15+ Yrs Exp',
    'Operatory 1',
    JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']),
    '10:00',
    '19:30'
  );

  insertPractitioner.run(
    'doc_vandana_choudhary',
    'Dr. Priya Mehta',
    'BDS, MDS (Conservative Dentistry & Endodontics)',
    'Specialist Endodontist · Restorative Dentist',
    'Apex Dental Studio | 18+ Yrs Exp',
    'Operatory 2',
    JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']),
    '10:00',
    '19:30'
  );

  console.log('[DB] Seeded verified clinic practitioners.');
}

// Synchronize generic specialist credentials and names across database
try {
  db.exec(`
    UPDATE practitioners 
    SET full_name = 'Dr. Aryan Sharma',
        qualifications = 'BDS, MDS (Oral & Maxillofacial Surgery), Certified Implantologist',
        specialization = 'Oral & Maxillofacial Surgeon, Specialist Implantologist',
        affiliations = 'Senior Specialist · Oral & Maxillofacial Surgery | 15+ Yrs Exp',
        working_hours_end = '19:30'
    WHERE id = 'doc_anuj_kumar';

    UPDATE practitioners 
    SET full_name = 'Dr. Priya Mehta',
        qualifications = 'BDS, MDS (Conservative Dentistry & Endodontics)',
        specialization = 'Specialist Endodontist · Restorative Dentist',
        affiliations = 'Apex Dental Studio | 18+ Yrs Exp',
        working_hours_end = '19:30'
    WHERE id = 'doc_vandana_choudhary';

    UPDATE appointments
    SET doctor_name = 'Dr. Aryan Sharma'
    WHERE doctor_id = 'doc_anuj_kumar' OR doctor_name LIKE '%Anuj%';

    UPDATE appointments
    SET doctor_name = 'Dr. Priya Mehta'
    WHERE doctor_id = 'doc_vandana_choudhary' OR doctor_name LIKE '%Vandana%';

    UPDATE queue_entries
    SET doctor_name = 'Dr. Aryan Sharma'
    WHERE doctor_id = 'doc_anuj_kumar' OR doctor_name LIKE '%Anuj%';

    UPDATE queue_entries
    SET doctor_name = 'Dr. Priya Mehta'
    WHERE doctor_id = 'doc_vandana_choudhary' OR doctor_name LIKE '%Vandana%';
  `);
} catch (err) {
  console.error('[DB SYNC ERROR]', err.message);
}

// Seed 9 Verified Services
const serviceCount = db.prepare('SELECT COUNT(*) as count FROM services').get().count;
if (serviceCount === 0) {
  const insertService = db.prepare(`
    INSERT INTO services (id, name, category, duration_minutes, description, image_url, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  const services = [
    {
      id: 'serv_rct',
      name: 'Advanced RCT',
      category: 'Endodontics',
      duration_minutes: 45,
      description: 'Modern rotary root canal treatment focused on comfort, precision, and tooth preservation.',
      image_url: 'assets/images/service-rct-3d.png'
    },
    {
      id: 'serv_cosmetic',
      name: 'Cosmetic Dentistry',
      category: 'Aesthetic Dentistry',
      duration_minutes: 45,
      description: 'Custom porcelain veneers, smile design, aesthetic restorations, and professional whitening.',
      image_url: 'assets/images/service-cosmetic-3d.png'
    },
    {
      id: 'serv_implants',
      name: 'Dental Implants',
      category: 'Implantology',
      duration_minutes: 45,
      description: 'Permanent titanium tooth replacements restoring complete chewing function and natural aesthetics.',
      image_url: 'assets/images/service-implant-3d.png'
    },
    {
      id: 'serv_surgery',
      name: 'Maxillofacial Surgery',
      category: 'Oral Surgery',
      duration_minutes: 45,
      description: 'Specialist surgical extractions, impactions, jaw corrections, and oral trauma care.',
      image_url: 'assets/images/service-surgery-3d.png'
    },
    {
      id: 'serv_ortho',
      name: 'Orthodontic Aligners',
      category: 'Orthodontics',
      duration_minutes: 30,
      description: 'Clear invisible aligners and customized bite correction therapy for teens and adults.',
      image_url: 'assets/images/service-ortho-3d.png'
    },
    {
      id: 'serv_perio',
      name: 'Periodontics',
      category: 'Periodontology',
      duration_minutes: 30,
      description: 'Comprehensive gum disease management, ultrasonic scaling, and deep periodontal maintenance.',
      image_url: 'assets/images/service-perio-3d.png'
    },
    {
      id: 'serv_laser',
      name: 'Laser Surgery',
      category: 'Laser Dentistry',
      duration_minutes: 30,
      description: 'Minimally invasive, virtually bloodless soft-tissue surgical procedures with rapid healing.',
      image_url: 'assets/images/service-laser-3d.png'
    },
    {
      id: 'serv_pediatric',
      name: 'Pediatric Dentistry',
      category: 'Pediatric Care',
      duration_minutes: 30,
      description: 'Gentle, welcoming preventive dental care, fluoride therapies, and cavity protection for children.',
      image_url: 'assets/images/service-pediatric-3d.png'
    },
    {
      id: 'serv_hair',
      name: 'Hair Transplant',
      category: 'Clinical Restoration',
      duration_minutes: 60,
      description: 'Dedicated clinical facility for precision follicular unit micro-restoration and hair care.',
      image_url: 'assets/images/service-hair-3d.png'
    }
  ];

  for (const s of services) {
    insertService.run(s.id, s.name, s.category, s.duration_minutes, s.description, s.image_url);
  }

  console.log('[DB] Seeded 9 verified clinic services.');
}

// Seed Approved WhatsApp Message Templates (Phase 5)
const templateCount = db.prepare('SELECT COUNT(*) as count FROM message_templates').get().count;
const approvedTemplates = [
  {
    id: 'tpl_appt_confirm',
    name: 'Appointment Confirmation',
    category: 'APPOINTMENT_CONFIRMATION',
    identifier: 'ds_appointment_confirmation',
    body: 'Hello {{patient_name}}, your appointment at {{clinic_name}} with {{doctor_name}} is confirmed for {{appointment_date}} at {{appointment_time}}. Booking ref: {{booking_reference}}. Clinic: {{clinic_address}}.',
    vars: JSON.stringify(['patient_name', 'doctor_name', 'appointment_date', 'appointment_time', 'booking_reference', 'clinic_name', 'clinic_address'])
  },
  {
    id: 'tpl_appt_reminder',
    name: 'Appointment Reminder',
    category: 'APPOINTMENT_REMINDER',
    identifier: 'ds_appointment_reminder',
    body: 'Hello {{patient_name}}, this is a friendly reminder of your upcoming visit to {{clinic_name}} with {{doctor_name}} on {{appointment_date}} at {{appointment_time}}. Ref: {{booking_reference}}. Please arrive 10 minutes prior.',
    vars: JSON.stringify(['patient_name', 'doctor_name', 'appointment_date', 'appointment_time', 'booking_reference', 'clinic_name'])
  },
  {
    id: 'tpl_followup_reminder',
    name: 'Follow-up Reminder',
    category: 'FOLLOW_UP_REMINDER',
    identifier: 'ds_follow_up_reminder',
    body: 'Hello {{patient_name}}, this is a reminder from {{clinic_name}} regarding your scheduled follow-up on {{follow_up_date}}. Please reach out to our clinic if you need to adjust your timing.',
    vars: JSON.stringify(['patient_name', 'follow_up_date', 'clinic_name', 'clinic_phone'])
  },
  {
    id: 'tpl_recall_reminder',
    name: 'Routine Dental Recall',
    category: 'RECALL_REMINDER',
    identifier: 'ds_recall_reminder',
    body: 'Hello {{patient_name}}, it has been several months since your last dental review at {{clinic_name}}. Regular preventative care keeps your smile healthy. Please let us know if you would like to schedule your routine check-up.',
    vars: JSON.stringify(['patient_name', 'clinic_name', 'clinic_phone'])
  },
  {
    id: 'tpl_appt_change',
    name: 'Appointment Reschedule / Change',
    category: 'APPOINTMENT_CHANGE',
    identifier: 'ds_appointment_change',
    body: 'Hello {{patient_name}}, your appointment with {{doctor_name}} at {{clinic_name}} has been updated to {{appointment_date}} at {{appointment_time}}. Ref: {{booking_reference}}.',
    vars: JSON.stringify(['patient_name', 'doctor_name', 'appointment_date', 'appointment_time', 'booking_reference', 'clinic_name'])
  }
];

if (templateCount === 0) {
  const insertTemplate = db.prepare(`
    INSERT INTO message_templates (
      id, name, category, channel, template_identifier, language, body_preview, variables_schema, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, 'WHATSAPP', ?, 'en', ?, ?, 1, ?, ?)
  `);

  const nowIso = new Date().toISOString();
  for (const t of approvedTemplates) {
    insertTemplate.run(t.id, t.name, t.category, t.identifier, t.body, t.vars, nowIso, nowIso);
  }

  console.log('[DB] Seeded 5 approved clinic WhatsApp message templates.');
} else {
  // Synchronize templates to ensure generic placeholders
  const updateTemplate = db.prepare('UPDATE message_templates SET body_preview = ?, variables_schema = ? WHERE id = ?');
  for (const t of approvedTemplates) {
    updateTemplate.run(t.body, t.vars, t.id);
  }
}

// Generate unique booking reference: DS-XXXXXX (e.g. DS-849201)
function generateBookingReference() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let ref = 'DS-';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    ref += chars[bytes[i] % chars.length];
  }
  return ref;
}

// Generate unique demo payment reference: PAY-DEMO-XXXXXX
function generatePaymentReference() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let ref = 'PAY-DEMO-';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    ref += chars[bytes[i] % chars.length];
  }
  return ref;
}

// Lazy release of expired temporary slot holds (holds with status 'HELD' and hold_expires_at <= now)
function releaseExpiredHolds() {
  const nowIso = new Date().toISOString();
  try {
    const info = db.prepare(`
      UPDATE appointments 
      SET status = 'CANCELLED', payment_status = 'FAILED', updated_at = ? 
      WHERE status = 'HELD' AND hold_expires_at IS NOT NULL AND hold_expires_at <= ?
    `).run(nowIso, nowIso);
    if (info.changes > 0) {
      console.log(`[RESERVATION] Lazily released ${info.changes} expired slot hold(s).`);
    }
    return info.changes;
  } catch (err) {
    console.error('[RESERVATION] Error releasing expired holds:', err.message);
    return 0;
  }
}

// Concurrency-safe Next Daily Token Generator (T-01, T-02, ...)
function getNextDailyToken(dateStr) {
  const row = db.prepare(`
    SELECT COALESCE(MAX(token_number), 0) + 1 AS next_token 
    FROM queue_entries 
    WHERE queue_date = ?
  `).get(dateStr);
  const nextToken = row ? row.next_token : 1;
  const tokenDisplay = 'T-' + String(nextToken).padStart(2, '0');
  return { tokenNumber: nextToken, tokenDisplay };
}

/**
 * Atomic Patient Check-In & Daily Sequential Token Allocation
 * Transactionally verifies appointment status, generates clinic-day token (T-01, T-02...),
 * creates queue_entries record, and updates appointment state.
 */
function checkInPatientAtomic(bookingReference, clinicDate) {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const appt = db.prepare(`
      SELECT id, booking_reference, patient_name, patient_phone, patient_email, patient_type,
             doctor_id, doctor_name, service_id, service_name,
             appointment_date, appointment_time, status, token_number, arrival_time, is_demo
      FROM appointments 
      WHERE booking_reference = ?
    `).get(bookingReference);

    if (!appt) {
      throw new Error('Appointment not found with reference: ' + bookingReference);
    }

    if (appt.status === 'CANCELLED') {
      throw new Error('Cannot check in a cancelled appointment (' + bookingReference + ').');
    }

    if (appt.status === 'COMPLETED') {
      throw new Error('Appointment has already been completed.');
    }

    if (appt.status === 'NO_SHOW') {
      throw new Error('Appointment was marked as no-show.');
    }

    const qDate = clinicDate || appt.appointment_date;

    // Check for existing queue entry for this appointment today
    const existingQueue = db.prepare(`
      SELECT id, token_display, token_number, status, arrival_time, doctor_id, doctor_name, patient_name, service_name
      FROM queue_entries 
      WHERE appointment_id = ? AND queue_date = ?
    `).get(appt.id, qDate);

    if (existingQueue) {
      db.exec('COMMIT;');
      return {
        alreadyCheckedIn: true,
        queueId: existingQueue.id,
        tokenDisplay: existingQueue.token_display,
        tokenNumber: existingQueue.token_number,
        queueStatus: existingQueue.status,
        appointment: appt
      };
    }

    // Allocate next sequential clinic-day token
    const tokenRow = db.prepare(`
      SELECT COALESCE(MAX(token_number), 0) + 1 AS next_token 
      FROM queue_entries 
      WHERE queue_date = ?
    `).get(qDate);

    const nextToken = tokenRow ? tokenRow.next_token : 1;
    const tokenDisplay = 'T-' + String(nextToken).padStart(2, '0');
    const queueId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    // Insert into queue_entries
    db.prepare(`
      INSERT INTO queue_entries (
        id, appointment_id, booking_reference, queue_date, token_number, token_display,
        doctor_id, doctor_name, patient_name, service_name, status, arrival_time, is_demo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'WAITING', ?, ?, ?, ?)
    `).run(
      queueId,
      appt.id,
      appt.booking_reference,
      qDate,
      nextToken,
      tokenDisplay,
      appt.doctor_id,
      appt.doctor_name,
      appt.patient_name,
      appt.service_name,
      nowIso,
      appt.is_demo || 0,
      nowIso,
      nowIso
    );

    // Update appointment state (if PENDING, becomes CONFIRMED upon reception check-in)
    const updatedStatus = appt.status === 'PENDING' ? 'CONFIRMED' : appt.status;
    db.prepare(`
      UPDATE appointments
      SET status = ?, token_number = ?, arrival_time = ?, updated_at = ?
      WHERE id = ?
    `).run(updatedStatus, nextToken, nowIso, nowIso, appt.id);

    db.exec('COMMIT;');

    return {
      alreadyCheckedIn: false,
      queueId,
      tokenDisplay,
      tokenNumber: nextToken,
      queueStatus: 'WAITING',
      appointment: {
        ...appt,
        status: updatedStatus,
        token_number: nextToken,
        arrival_time: nowIso
      }
    };
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw err;
  }
}

// Staff Authentication System
const STAFF_CREDENTIALS = {
  '1024': { staffId: 'staff_reception', staffName: 'Clinic Reception', role: 'reception', doctorId: null },
  '2048': { staffId: 'doc_anuj_kumar', staffName: 'Dr. Aryan Sharma', role: 'dentist', doctorId: 'doc_anuj_kumar' },
  '4096': { staffId: 'doc_vandana_choudhary', staffName: 'Dr. Priya Mehta', role: 'dentist', doctorId: 'doc_vandana_choudhary' },
  '8192': { staffId: 'staff_owner', staffName: 'Clinic Owner (Admin)', role: 'owner', doctorId: null }
};

function authenticateStaff(pin) {
  const staff = STAFF_CREDENTIALS[String(pin).trim()];
  if (!staff) return null;

  const token = 'ds_staff_' + crypto.randomBytes(24).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12 hours

  db.prepare(`
    INSERT INTO staff_sessions (token, staff_id, staff_name, role, doctor_id, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    token,
    staff.staffId,
    staff.staffName,
    staff.role,
    staff.doctorId,
    now.toISOString(),
    expires.toISOString()
  );

  return {
    token,
    staffId: staff.staffId,
    staffName: staff.staffName,
    role: staff.role,
    doctorId: staff.doctorId,
    expiresAt: expires.toISOString()
  };
}

function getStaffSession(token) {
  if (!token) return null;
  const session = db.prepare(`
    SELECT token, staff_id, staff_name, role, doctor_id, created_at, expires_at
    FROM staff_sessions
    WHERE token = ? AND expires_at > datetime('now')
  `).get(token);
  return session || null;
}

function revokeStaffSession(token) {
  if (!token) return false;
  const info = db.prepare('DELETE FROM staff_sessions WHERE token = ?').run(token);
  return info.changes > 0;
}

// Optional helper to seed realistic demo data for a clinic date only when explicitly called
function seedDemoQueueData(dateStr) {
  const count = db.prepare('SELECT COUNT(*) as count FROM appointments WHERE appointment_date = ?').get(dateStr).count;
  if (count > 0) return false;

  const nowIso = new Date().toISOString();
  const insertAppt = db.prepare(`
    INSERT INTO appointments (
      id, booking_reference, patient_name, patient_phone, patient_email, patient_type,
      doctor_id, doctor_name, service_id, service_name, appointment_date, appointment_time,
      status, source, token_number, notes, is_demo, arrival_time, consultation_start_time, completion_time, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PATIENT_WEB', ?, ?, 1, ?, ?, ?, ?, ?)
  `);

  const insertQueue = db.prepare(`
    INSERT INTO queue_entries (
      id, appointment_id, booking_reference, queue_date, token_number, token_display,
      doctor_id, doctor_name, patient_name, service_name, status, arrival_time, called_at, completed_at, is_demo, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  const demoRecords = [
    {
      ref: 'DS-DEMO01',
      name: 'Vikram Singh',
      phone: '9835123401',
      docId: 'doc_anuj_kumar',
      docName: 'Dr. Aryan Sharma',
      servId: 'serv_implants',
      servName: 'Dental Implants',
      time: '09:30',
      status: 'COMPLETED',
      token: 1,
      tokenDisp: 'T-01',
      arrival: `${dateStr}T09:12:00.000Z`,
      called: `${dateStr}T09:30:00.000Z`,
      completed: `${dateStr}T10:15:00.000Z`,
      notes: 'Post-op follow-up for molar implant fixture'
    },
    {
      ref: 'DS-DEMO02',
      name: 'Sunita Kumari',
      phone: '9835123402',
      docId: 'doc_anuj_kumar',
      docName: 'Dr. Aryan Sharma',
      servId: 'serv_surgery',
      servName: 'Maxillofacial Surgery',
      time: '10:30',
      status: 'CONFIRMED',
      queueStatus: 'IN_CONSULTATION',
      token: 2,
      tokenDisp: 'T-02',
      arrival: `${dateStr}T10:18:00.000Z`,
      called: `${dateStr}T10:32:00.000Z`,
      completed: null,
      notes: 'Wisdom tooth surgical evaluation'
    },
    {
      ref: 'DS-DEMO03',
      name: 'Amit Verma',
      phone: '9835123403',
      docId: 'doc_vandana_choudhary',
      docName: 'Dr. Priya Mehta',
      servId: 'serv_rct',
      servName: 'Advanced RCT',
      time: '11:00',
      status: 'CONFIRMED',
      queueStatus: 'WAITING',
      token: 3,
      tokenDisp: 'T-03',
      arrival: `${dateStr}T10:48:00.000Z`,
      called: null,
      completed: null,
      notes: 'Lower right tooth sensitivity on hot/cold'
    },
    {
      ref: 'DS-DEMO04',
      name: 'Pooja Sharma',
      phone: '9835123404',
      docId: 'doc_vandana_choudhary',
      docName: 'Dr. Priya Mehta',
      servId: 'serv_cosmetic',
      servName: 'Cosmetic Dentistry',
      time: '11:30',
      status: 'CONFIRMED',
      queueStatus: 'WAITING',
      token: 4,
      tokenDisp: 'T-04',
      arrival: `${dateStr}T11:15:00.000Z`,
      called: null,
      completed: null,
      notes: 'Smile makeover & composite veneer consultation'
    },
    {
      ref: 'DS-DEMO05',
      name: 'Rajesh Mishra',
      phone: '9835123405',
      docId: 'doc_anuj_kumar',
      docName: 'Dr. Aryan Sharma',
      servId: 'serv_ortho',
      servName: 'Orthodontic Aligners',
      time: '16:00',
      status: 'CONFIRMED',
      token: null,
      tokenDisp: null,
      arrival: null,
      called: null,
      completed: null,
      notes: 'Clear aligners consultation'
    },
    {
      ref: 'DS-DEMO06',
      name: 'Master Aarav Gupta',
      phone: '9835123406',
      docId: 'doc_vandana_choudhary',
      docName: 'Dr. Priya Mehta',
      servId: 'serv_pediatric',
      servName: 'Pediatric Dentistry',
      time: '17:00',
      status: 'CONFIRMED',
      token: null,
      tokenDisp: null,
      arrival: null,
      called: null,
      completed: null,
      notes: 'Routine pediatric cleaning & dental checkup'
    }
  ];

  db.exec('BEGIN IMMEDIATE;');
  try {
    for (const rec of demoRecords) {
      const apptId = crypto.randomUUID();
      insertAppt.run(
        apptId,
        rec.ref,
        rec.name,
        rec.phone,
        null,
        'NEW',
        rec.docId,
        rec.docName,
        rec.servId,
        rec.servName,
        dateStr,
        rec.time,
        rec.status,
        rec.token,
        rec.notes,
        rec.arrival,
        rec.called,
        rec.completed,
        nowIso,
        nowIso
      );

      if (rec.token) {
        const queueId = crypto.randomUUID();
        insertQueue.run(
          queueId,
          apptId,
          rec.ref,
          dateStr,
          rec.token,
          rec.tokenDisp,
          rec.docId,
          rec.docName,
          rec.name,
          rec.servName,
          rec.queueStatus || rec.status,
          rec.arrival,
          rec.called,
          rec.completed,
          nowIso,
          nowIso
        );
      }
    }
    db.exec('COMMIT;');
    return true;
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    console.error('[DB DEMO ERROR]', err);
    return false;
  }
}


// ========================================================================
// PHASE 4: CLINICAL ENTITIES, TAXONOMY & VALIDATION
// ========================================================================

// Prototype Finding Taxonomy (Configurable, subject to clinician confirmation)
const PROTOTYPE_FINDING_TAXONOMY = [
  { id: 'CARIES', label: 'Dental Caries / Decay', category: 'Carious Lesion' },
  { id: 'RESTORED', label: 'Existing Restoration / Filling', category: 'Restorative' },
  { id: 'RCT_DONE', label: 'Root Canal Treated', category: 'Endodontic' },
  { id: 'MISSING', label: 'Missing / Extracted Tooth', category: 'Anatomical' },
  { id: 'IMPACTED', label: 'Impacted Tooth', category: 'Anatomical' },
  { id: 'FRACTURED_TOOTH', label: 'Tooth Fracture / Chip', category: 'Trauma' },
  { id: 'SENSITIVITY', label: 'Dentin Hypersensitivity', category: 'Symptomatic' },
  { id: 'GINGIVITIS', label: 'Gingival Inflammation', category: 'Periodontal' },
  { id: 'PERIODONTITIS', label: 'Periodontal Pocketing', category: 'Periodontal' },
  { id: 'CROWN', label: 'Full Coverage Crown', category: 'Prosthodontic' },
  { id: 'IMPLANT', label: 'Dental Implant Fixture', category: 'Implantology' },
  { id: 'OTHER', label: 'Other Clinical Observation', category: 'General' }
];

// FDI Two-Digit Permanent Adult Dentition (ISO 3950)
const VALID_FDI_TEETH = new Set([
  11, 12, 13, 14, 15, 16, 17, 18,
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48
]);

function isValidFdiTooth(num) {
  if (num === null || num === undefined) return false;
  const n = parseInt(num, 10);
  return VALID_FDI_TEETH.has(n);
}

// Controlled Surfaces Enum
const VALID_SURFACES = new Set([
  'MESIAL', 'DISTAL', 'OCCLUSAL', 'BUCCAL', 'LINGUAL', 'WHOLE_TOOTH'
]);

function isValidSurface(surface) {
  if (!surface) return false;
  return VALID_SURFACES.has(String(surface).toUpperCase().trim());
}

// Conservative Patient Migration
function runPatientMigration() {
  const unlinkedCount = db.prepare('SELECT COUNT(*) as count FROM appointments WHERE patient_id IS NULL').get().count;
  if (unlinkedCount === 0) return;

  console.log(`[MIGRATION] Found ${unlinkedCount} unlinked appointments. Running conservative patient migration...`);

  const appts = db.prepare(`
    SELECT id, patient_name, patient_phone, patient_email, patient_type, created_at 
    FROM appointments 
    WHERE patient_id IS NULL
    ORDER BY created_at ASC
  `).all();

  const byPhone = {};
  for (const a of appts) {
    const rawPhone = a.patient_phone || '';
    const normPhone = rawPhone.replace(/\D/g, '').slice(-10);
    if (!normPhone || normPhone.length < 10) continue;
    if (!byPhone[normPhone]) byPhone[normPhone] = [];
    byPhone[normPhone].push(a);
  }

  const refRow = db.prepare(`
    SELECT COALESCE(MAX(CAST(SUBSTR(patient_reference, 5) AS INTEGER)), 1000) AS max_ref 
    FROM patients 
    WHERE patient_reference LIKE 'DSP-%'
  `).get();
  let nextRefNum = refRow ? refRow.max_ref : 1000;

  db.exec('BEGIN IMMEDIATE;');
  try {
    for (const [phone, list] of Object.entries(byPhone)) {
      const existingPatients = db.prepare('SELECT * FROM patients WHERE mobile = ?').all(phone);
      const names = [...new Set(list.map(x => x.patient_name.trim()))];
      const isAmbiguous = names.length > 1 || (existingPatients.length > 0 && !existingPatients.some(p => names.map(n => n.toLowerCase()).includes(p.full_name.toLowerCase())));

      for (const name of names) {
        let patient = existingPatients.find(p => p.full_name.toLowerCase() === name.toLowerCase());
        if (!patient) {
          nextRefNum++;
          const patId = 'pat_' + crypto.randomUUID();
          const patRef = 'DSP-' + String(nextRefNum);
          const sampleAppt = list.find(x => x.patient_name.trim().toLowerCase() === name.toLowerCase());
          const nowIso = new Date().toISOString();

          db.prepare(`
            INSERT INTO patients (
              id, patient_reference, full_name, mobile, email, patient_type, is_flagged_ambiguous, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            patId,
            patRef,
            name,
            phone,
            sampleAppt.patient_email || null,
            list.length > 1 ? 'RETURNING' : (sampleAppt.patient_type || 'NEW'),
            isAmbiguous ? 1 : 0,
            sampleAppt.created_at || nowIso,
            nowIso
          );

          patient = { id: patId, patient_reference: patRef, full_name: name, mobile: phone };
          existingPatients.push(patient);
        }

        const apptIdsToLink = list.filter(x => x.patient_name.trim().toLowerCase() === name.toLowerCase()).map(x => x.id);
        const updateStmt = db.prepare('UPDATE appointments SET patient_id = ? WHERE id = ?');
        for (const aId of apptIdsToLink) {
          updateStmt.run(patient.id, aId);
        }
      }
    }
    db.exec('COMMIT;');
    console.log('[MIGRATION] Conservative patient migration successfully linked historical appointments.');
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    console.error('[MIGRATION ERROR]', err);
  }
}

// Run migration immediately
runPatientMigration();

// Find or Create Patient during Appointment Booking
function findOrCreatePatientFromBooking({ name, phone, email, patientType }) {
  const normPhone = (phone || '').replace(/\D/g, '').slice(-10);
  const cleanName = (name || '').trim();
  const nowIso = new Date().toISOString();

  const existing = db.prepare(`
    SELECT * FROM patients 
    WHERE mobile = ? AND LOWER(full_name) = LOWER(?)
  `).get(normPhone, cleanName);

  if (existing) {
    if (existing.patient_type !== 'RETURNING') {
      db.prepare("UPDATE patients SET patient_type = 'RETURNING', updated_at = ? WHERE id = ?").run(nowIso, existing.id);
      existing.patient_type = 'RETURNING';
    }
    return existing;
  }

  const otherSamePhone = db.prepare('SELECT id, full_name FROM patients WHERE mobile = ?').all(normPhone);
  const isAmbiguous = otherSamePhone.length > 0;

  if (isAmbiguous) {
    db.prepare('UPDATE patients SET is_flagged_ambiguous = 1, updated_at = ? WHERE mobile = ?').run(nowIso, normPhone);
  }

  const refRow = db.prepare(`
    SELECT COALESCE(MAX(CAST(SUBSTR(patient_reference, 5) AS INTEGER)), 1000) AS max_ref 
    FROM patients 
    WHERE patient_reference LIKE 'DSP-%'
  `).get();
  const nextNum = (refRow ? refRow.max_ref : 1000) + 1;
  const patRef = 'DSP-' + String(nextNum);
  const patId = 'pat_' + crypto.randomUUID();

  db.prepare(`
    INSERT INTO patients (
      id, patient_reference, full_name, mobile, email, patient_type, is_flagged_ambiguous, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    patId,
    patRef,
    cleanName,
    normPhone,
    email || null,
    patientType || 'NEW',
    isAmbiguous ? 1 : 0,
    nowIso,
    nowIso
  );

  return {
    id: patId,
    patient_reference: patRef,
    full_name: cleanName,
    mobile: normPhone,
    email: email || null,
    patient_type: patientType || 'NEW',
    is_flagged_ambiguous: isAmbiguous ? 1 : 0
  };
}

// Patient CRUD & Queries
function getPatientById(id) {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ? OR patient_reference = ?').get(id, id);
  return patient || null;
}

function searchPatients(query, limit = 20) {
  const q = String(query || '').trim();
  if (!q) {
    return db.prepare('SELECT * FROM patients ORDER BY updated_at DESC LIMIT ?').all(limit);
  }
  const term = `%${q}%`;
  return db.prepare(`
    SELECT * FROM patients 
    WHERE full_name LIKE ? OR mobile LIKE ? OR patient_reference LIKE ? OR email LIKE ?
    ORDER BY updated_at DESC 
    LIMIT ?
  `).all(term, term, term, term, limit);
}

function createPatient(data) {
  const normPhone = (data.mobile || data.phone || '').replace(/\D/g, '').slice(-10);
  const cleanName = (data.full_name || data.fullName || data.name || '').trim();
  if (!cleanName) throw new Error('Patient full name is required');
  if (!normPhone || normPhone.length < 10) throw new Error('Valid 10-digit mobile number is required');

  return findOrCreatePatientFromBooking({
    name: cleanName,
    phone: normPhone,
    email: data.email,
    patientType: data.patient_type || data.patientType || 'NEW'
  });
}

function updatePatientDemographics(id, data, staffAuth) {
  const existing = getPatientById(id);
  if (!existing) return null;

  const nowIso = new Date().toISOString();
  const fullName = data.full_name ? String(data.full_name).trim() : existing.full_name;
  const mobile = data.mobile ? String(data.mobile).replace(/\D/g, '').slice(-10) : existing.mobile;
  const email = data.email !== undefined ? data.email : existing.email;
  const dob = data.date_of_birth !== undefined ? data.date_of_birth : existing.date_of_birth;
  const gender = data.gender !== undefined ? data.gender : existing.gender;

  let alerts = existing.dentist_entered_alerts;
  if (data.dentist_entered_alerts !== undefined || data.medical_alerts !== undefined) {
    if (staffAuth && staffAuth.role === 'dentist') {
      alerts = data.dentist_entered_alerts !== undefined ? data.dentist_entered_alerts : data.medical_alerts;
    }
  }

  db.prepare(`
    UPDATE patients 
    SET full_name = ?, mobile = ?, email = ?, date_of_birth = ?, gender = ?, dentist_entered_alerts = ?, updated_at = ?
    WHERE id = ?
  `).run(fullName, mobile, email, dob, gender, alerts, nowIso, existing.id);

  return getPatientById(existing.id);
}

function getPatientAppointments(patientId) {
  const patient = getPatientById(patientId);
  if (!patient) return [];

  return db.prepare(`
    SELECT id, booking_reference, doctor_id, doctor_name, service_id, service_name,
           appointment_date, appointment_time, status, source, arrival_time, 
           consultation_start_time, completion_time, created_at, updated_at
    FROM appointments
    WHERE patient_id = ? OR (patient_phone LIKE ? AND LOWER(patient_name) = LOWER(?))
    ORDER BY appointment_date DESC, appointment_time DESC
  `).all(patient.id, '%' + patient.mobile, patient.full_name);
}

// Clinical Notes Functions
function createClinicalNote({ patientId, appointmentId, noteType, chiefComplaint, clinicalObservations, dentistEnteredDiagnosis, advice, content, dentistId, dentistName }) {
  if (!patientId) throw new Error('Patient ID is required');
  if (!content && !chiefComplaint && !clinicalObservations) throw new Error('Note content is required');
  if (!dentistId || !dentistName) throw new Error('Author dentist is required');

  const cleanNoteType = ['CONSULTATION', 'EXAMINATION', 'TREATMENT', 'GENERAL'].includes(noteType) ? noteType : 'CONSULTATION';
  const id = 'note_' + crypto.randomUUID();
  const nowIso = new Date().toISOString();

  db.prepare(`
    INSERT INTO clinical_notes (
      id, patient_id, appointment_id, note_type, chief_complaint, clinical_observations,
      dentist_entered_diagnosis, advice, content, dentist_id, dentist_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    patientId,
    appointmentId || null,
    cleanNoteType,
    chiefComplaint || null,
    clinicalObservations || null,
    dentistEnteredDiagnosis || null,
    advice || null,
    content || chiefComplaint || 'Clinical note recorded.',
    dentistId,
    dentistName,
    nowIso,
    nowIso
  );

  return db.prepare('SELECT * FROM clinical_notes WHERE id = ?').get(id);
}

function getClinicalNotes(patientId) {
  return db.prepare(`
    SELECT * FROM clinical_notes 
    WHERE patient_id = ? 
    ORDER BY created_at DESC
  `).all(patientId);
}

// Odontogram Finding Functions
function recordOdontogramFinding({ patientId, appointmentId, toothNumber, surface, findingType, severity, notes, recordedBy, dentistName }) {
  if (!patientId) throw new Error('Patient ID is required');
  if (!isValidFdiTooth(toothNumber)) {
    const err = new Error(`Invalid FDI tooth number: ${toothNumber}. Adult FDI dentition must be between 11-18, 21-28, 31-38, or 41-48.`);
    err.code = 'INVALID_TOOTH_NUMBER';
    throw err;
  }
  if (!isValidSurface(surface)) {
    const err = new Error(`Invalid surface: ${surface}. Allowed surfaces are: MESIAL, DISTAL, OCCLUSAL, BUCCAL, LINGUAL, WHOLE_TOOTH.`);
    err.code = 'INVALID_SURFACE';
    throw err;
  }
  if (!recordedBy || !dentistName) throw new Error('Author dentist is required');

  const id = 'find_' + crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const cleanSurface = String(surface).toUpperCase().trim();
  const cleanFindingType = String(findingType || 'OTHER').toUpperCase().trim();
  const cleanSeverity = severity ? String(severity).toUpperCase().trim() : null;

  db.prepare(`
    INSERT INTO odontogram_findings (
      id, patient_id, appointment_id, tooth_number, surface, finding_type,
      severity, status, notes, recorded_by, dentist_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)
  `).run(
    id,
    patientId,
    appointmentId || null,
    parseInt(toothNumber, 10),
    cleanSurface,
    cleanFindingType,
    cleanSeverity,
    notes || null,
    recordedBy,
    dentistName,
    nowIso,
    nowIso
  );

  return db.prepare('SELECT * FROM odontogram_findings WHERE id = ?').get(id);
}

function archiveOdontogramFinding(findingId, archivedBy) {
  const existing = db.prepare('SELECT * FROM odontogram_findings WHERE id = ?').get(findingId);
  if (!existing) return null;

  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE odontogram_findings 
    SET status = 'ARCHIVED', archived_at = ?, archived_by = ?, updated_at = ?
    WHERE id = ?
  `).run(nowIso, archivedBy || 'staff', nowIso, findingId);

  return db.prepare('SELECT * FROM odontogram_findings WHERE id = ?').get(findingId);
}

function getOdontogramFindings(patientId, includeArchived = false) {
  if (includeArchived) {
    return db.prepare('SELECT * FROM odontogram_findings WHERE patient_id = ? ORDER BY tooth_number ASC, created_at DESC').all(patientId);
  }
  return db.prepare("SELECT * FROM odontogram_findings WHERE patient_id = ? AND status != 'ARCHIVED' ORDER BY tooth_number ASC, created_at DESC").all(patientId);
}

// Treatment Planning Functions
function createTreatmentPlan({ patientId, appointmentId, procedureName, serviceId, toothNumber, priority, notes, dentistId, dentistName }) {
  if (!patientId) throw new Error('Patient ID is required');
  if (!procedureName) throw new Error('Procedure name is required');
  if (toothNumber && !isValidFdiTooth(toothNumber)) {
    const err = new Error(`Invalid tooth number for treatment plan: ${toothNumber}`);
    err.code = 'INVALID_TOOTH_NUMBER';
    throw err;
  }

  const id = 'plan_' + crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const cleanPriority = ['NORMAL', 'HIGH', 'URGENT'].includes(priority) ? priority : 'NORMAL';

  db.prepare(`
    INSERT INTO treatment_plans (
      id, patient_id, appointment_id, procedure_name, service_id, tooth_number,
      status, priority, notes, dentist_id, dentist_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'PLANNED', ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    patientId,
    appointmentId || null,
    procedureName.trim(),
    serviceId || null,
    toothNumber ? parseInt(toothNumber, 10) : null,
    cleanPriority,
    notes || null,
    dentistId,
    dentistName,
    nowIso,
    nowIso
  );

  return db.prepare('SELECT * FROM treatment_plans WHERE id = ?').get(id);
}

function updateTreatmentPlanStatus(planId, newStatus) {
  const allowed = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Invalid treatment plan status: ${newStatus}`);
  }

  const existing = db.prepare('SELECT * FROM treatment_plans WHERE id = ?').get(planId);
  if (!existing) return null;

  const nowIso = new Date().toISOString();
  db.prepare('UPDATE treatment_plans SET status = ?, updated_at = ? WHERE id = ?').run(newStatus, nowIso, planId);
  return db.prepare('SELECT * FROM treatment_plans WHERE id = ?').get(planId);
}

function getTreatmentPlans(patientId) {
  return db.prepare('SELECT * FROM treatment_plans WHERE patient_id = ? ORDER BY created_at DESC').all(patientId);
}

// Performed Treatment Records
function recordPerformedTreatment({ patientId, appointmentId, treatmentPlanId, procedureName, toothNumber, surfacesTreated, materialsUsed, clinicalNotes, performedDate, dentistId, dentistName }) {
  if (!patientId) throw new Error('Patient ID is required');
  if (!procedureName) throw new Error('Procedure name is required');
  if (toothNumber && !isValidFdiTooth(toothNumber)) {
    const err = new Error(`Invalid tooth number: ${toothNumber}`);
    err.code = 'INVALID_TOOTH_NUMBER';
    throw err;
  }

  const id = 'rec_' + crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const dateStr = performedDate || nowIso.split('T')[0];

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(`
      INSERT INTO treatment_records (
        id, patient_id, appointment_id, treatment_plan_id, procedure_name, tooth_number,
        surfaces_treated, materials_used, clinical_notes, performed_date, dentist_id, dentist_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      patientId,
      appointmentId || null,
      treatmentPlanId || null,
      procedureName.trim(),
      toothNumber ? parseInt(toothNumber, 10) : null,
      surfacesTreated || null,
      materialsUsed || null,
      clinicalNotes || null,
      dateStr,
      dentistId,
      dentistName,
      nowIso,
      nowIso
    );

    if (treatmentPlanId) {
      db.prepare("UPDATE treatment_plans SET status = 'COMPLETED', updated_at = ? WHERE id = ?").run(nowIso, treatmentPlanId);
    }

    db.exec('COMMIT;');
    return db.prepare('SELECT * FROM treatment_records WHERE id = ?').get(id);
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw err;
  }
}

function getTreatmentRecords(patientId) {
  return db.prepare('SELECT * FROM treatment_records WHERE patient_id = ? ORDER BY performed_date DESC, created_at DESC').all(patientId);
}

// Prescriptions Functions
function createPrescription({ patientId, appointmentId, dentistId, dentistName, notes, items }) {
  if (!patientId) throw new Error('Patient ID is required');
  if (!dentistId || !dentistName) throw new Error('Prescribing dentist is required');
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('Prescription must include at least one medication item');
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const dateCompact = dateStr.replace(/-/g, '');
  const countToday = db.prepare('SELECT COUNT(*) as count FROM prescriptions WHERE prescription_date = ?').get(dateStr).count;
  const rxNum = `RX-${dateCompact}-${String(countToday + 1).padStart(2, '0')}`;

  const rxId = 'rx_' + crypto.randomUUID();
  const nowIso = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(`
      INSERT INTO prescriptions (
        id, prescription_number, patient_id, appointment_id, dentist_id, dentist_name,
        prescription_date, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ISSUED', ?, ?, ?)
    `).run(
      rxId,
      rxNum,
      patientId,
      appointmentId || null,
      dentistId,
      dentistName,
      dateStr,
      notes || null,
      nowIso,
      nowIso
    );

    const insertItem = db.prepare(`
      INSERT INTO prescription_items (
        id, prescription_id, medicine_name, dosage, frequency, duration, instructions, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const it of items) {
      const medName = it.medicine_name || it.medicationName || it.medicineName || it.name;
      if (!medName) throw new Error('Medicine name is required for each item');
      insertItem.run(
        'rxi_' + crypto.randomUUID(),
        rxId,
        String(medName).trim(),
        String(it.dosage || '-').trim(),
        String(it.frequency || '-').trim(),
        String(it.duration || '-').trim(),
        it.instructions ? String(it.instructions).trim() : null,
        nowIso
      );
    }

    db.exec('COMMIT;');
    return getPrescriptionById(rxId);
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw err;
  }
}

function getPrescriptionById(rxId) {
  const rx = db.prepare('SELECT * FROM prescriptions WHERE id = ? OR prescription_number = ?').get(rxId, rxId);
  if (!rx) return null;

  const items = db.prepare('SELECT * FROM prescription_items WHERE prescription_id = ? ORDER BY rowid ASC').all(rx.id);
  const patient = db.prepare('SELECT id, patient_reference, full_name, mobile, gender, date_of_birth FROM patients WHERE id = ?').get(rx.patient_id);
  const doctor = db.prepare('SELECT id, full_name, qualifications, specialization FROM practitioners WHERE id = ?').get(rx.dentist_id);

  return {
    ...rx,
    patient: patient || null,
    doctor: doctor || { full_name: rx.dentist_name, qualifications: 'BDS, MDS', specialization: 'Dental Specialist' },
    items
  };
}

function getPrescriptions(patientId) {
  const list = db.prepare('SELECT * FROM prescriptions WHERE patient_id = ? ORDER BY prescription_date DESC, created_at DESC').all(patientId);
  return list.map(rx => ({
    ...rx,
    items: db.prepare('SELECT * FROM prescription_items WHERE prescription_id = ? ORDER BY rowid ASC').all(rx.id)
  }));
}

// Unified Chronological Patient Timeline
function getPatientTimeline(patientId) {
  const patient = getPatientById(patientId);
  if (!patient) return [];

  const events = [];

  // 1. Appointments
  const appts = db.prepare(`
    SELECT id, booking_reference, doctor_name, service_name, appointment_date, appointment_time, status, created_at
    FROM appointments
    WHERE patient_id = ?
  `).all(patient.id);

  for (const a of appts) {
    events.push({
      id: 'evt_appt_' + a.id,
      eventType: 'APPOINTMENT',
      type: 'APPOINTMENT',
      timestamp: `${a.appointment_date}T${a.appointment_time}:00.000Z`,
      title: `Appointment: ${a.service_name}`,
      description: `With ${a.doctor_name} (${a.status}) &bull; Ref: ${a.booking_reference}`,
      doctorName: a.doctor_name,
      recordId: a.booking_reference,
      status: a.status
    });
  }

  // 2. Clinical Notes
  const notes = db.prepare('SELECT * FROM clinical_notes WHERE patient_id = ?').all(patient.id);
  for (const n of notes) {
    events.push({
      id: 'evt_note_' + n.id,
      eventType: 'CLINICAL_NOTE',
      type: 'CLINICAL_NOTE',
      timestamp: n.created_at,
      title: `${n.note_type} Note`,
      description: n.chief_complaint || n.content.slice(0, 80),
      doctorName: n.dentist_name,
      recordId: n.id,
      status: 'RECORDED'
    });
  }

  // 3. Odontogram Findings
  const findings = db.prepare('SELECT * FROM odontogram_findings WHERE patient_id = ?').all(patient.id);
  for (const f of findings) {
    events.push({
      id: 'evt_find_' + f.id,
      eventType: 'ODONTOGRAM_FINDING',
      type: 'ODONTOGRAM_FINDING',
      timestamp: f.created_at,
      title: `Finding: Tooth ${f.tooth_number} (${f.surface})`,
      description: `${f.finding_type}${f.severity ? ' (' + f.severity + ')' : ''} &bull; ${f.status}`,
      doctorName: f.dentist_name,
      recordId: f.id,
      status: f.status
    });
  }

  // 4. Treatment Plans
  const plans = db.prepare('SELECT * FROM treatment_plans WHERE patient_id = ?').all(patient.id);
  for (const p of plans) {
    events.push({
      id: 'evt_plan_' + p.id,
      eventType: 'TREATMENT_PLAN',
      type: 'TREATMENT_PLAN',
      timestamp: p.created_at,
      title: `Treatment Planned: ${p.procedure_name}`,
      description: `${p.tooth_number ? 'Tooth ' + p.tooth_number + ' &bull; ' : ''}Status: ${p.status} (Priority: ${p.priority})`,
      doctorName: p.dentist_name,
      recordId: p.id,
      status: p.status
    });
  }

  // 5. Performed Treatments
  const records = db.prepare('SELECT * FROM treatment_records WHERE patient_id = ?').all(patient.id);
  for (const r of records) {
    events.push({
      id: 'evt_rec_' + r.id,
      eventType: 'TREATMENT_PERFORMED',
      type: 'TREATMENT_PERFORMED',
      timestamp: r.performed_date ? `${r.performed_date}T12:00:00.000Z` : r.created_at,
      title: `Treatment Performed: ${r.procedure_name}`,
      description: `${r.tooth_number ? 'Tooth ' + r.tooth_number + ' &bull; ' : ''}${r.materials_used || r.clinical_notes || 'Procedure successfully executed'}`,
      doctorName: r.dentist_name,
      recordId: r.id,
      status: 'PERFORMED'
    });
  }

  // 6. Prescriptions
  const rxList = db.prepare('SELECT * FROM prescriptions WHERE patient_id = ?').all(patient.id);
  for (const rx of rxList) {
    events.push({
      id: 'evt_rx_' + rx.id,
      eventType: 'PRESCRIPTION',
      type: 'PRESCRIPTION',
      timestamp: rx.created_at,
      title: `Prescription Issued: ${rx.prescription_number}`,
      description: `Issued by ${rx.dentist_name} (${rx.status})`,
      doctorName: rx.dentist_name,
      recordId: rx.id,
      status: rx.status
    });
  }

  // 7. Follow-ups
  const fuList = db.prepare('SELECT * FROM follow_ups WHERE patient_id = ?').all(patient.id);
  for (const fu of fuList) {
    events.push({
      id: 'evt_fu_' + fu.id,
      eventType: 'FOLLOW_UP',
      type: 'FOLLOW_UP',
      timestamp: fu.created_at,
      title: `Follow-up (${fu.follow_up_type}): Due ${fu.due_date}`,
      description: `${fu.notes || 'Routine follow-up'} &bull; Status: ${fu.status} (Priority: ${fu.priority})`,
      doctorName: fu.created_by,
      recordId: fu.id,
      status: fu.status
    });
  }

  // 8. Communications (WhatsApp)
  const commList = db.prepare(`
    SELECT c.*, t.name as template_name
    FROM communications c
    LEFT JOIN message_templates t ON c.template_id = t.id
    WHERE c.patient_id = ?
  `).all(patient.id);
  for (const c of commList) {
    events.push({
      id: 'evt_comm_' + c.id,
      eventType: 'COMMUNICATION',
      type: 'COMMUNICATION',
      timestamp: c.sent_at || c.created_at,
      title: `WhatsApp: ${c.template_name || c.communication_type}`,
      description: `Status: ${c.status} &bull; To: ${c.recipient}`,
      doctorName: c.created_by,
      recordId: c.id,
      status: c.status
    });
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return events;
}

// ============================================================================
// Phase 5: Follow-ups + Communication / WhatsApp Functions
// ============================================================================

// --- Follow-ups State Machine & CRUD ---
const VALID_FOLLOW_UP_STATUSES = ['PENDING', 'DUE', 'CONTACTED', 'SCHEDULED', 'COMPLETED', 'SKIPPED', 'CANCELLED'];
const VALID_FOLLOW_UP_TYPES = [
  'POST_EXTRACTION', 'ROUTINE', 'RECALL_6M', 'TREATMENT_FOLLOW_UP', 
  'POST_PROCEDURE', 'REVIEW', 'RECALL', 'OTHER'
];
const VALID_FOLLOW_UP_TRANSITIONS = {
  PENDING: ['DUE', 'CONTACTED', 'SCHEDULED', 'SKIPPED', 'CANCELLED'],
  DUE: ['CONTACTED', 'SCHEDULED', 'SKIPPED', 'CANCELLED'],
  CONTACTED: ['SCHEDULED', 'COMPLETED', 'SKIPPED', 'CANCELLED'],
  SCHEDULED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [], // Terminal
  SKIPPED: [],   // Terminal
  CANCELLED: []  // Terminal
};

function createFollowUp(options = {}) {
  const patientId = options.patient_id || options.patientId;
  const appointmentId = options.appointment_id || options.appointmentId || null;
  const treatmentRecordId = options.treatment_record_id || options.treatmentRecordId || null;
  const treatmentPlanId = options.treatment_plan_id || options.treatmentPlanId || null;
  const followUpType = options.type || options.follow_up_type || options.followUpType || 'OTHER';
  const dueDate = options.due_date || options.dueDate;
  const reason = options.reason || null;
  const preferredChannel = options.preferred_channel || options.preferredChannel || 'WHATSAPP';
  const priority = options.priority || 'NORMAL';
  const notes = options.notes || null;
  const assignedTo = options.assigned_to || options.assignedTo || null;
  const createdBy = options.created_by || options.createdBy || 'staff';

  if (!patientId) throw new Error('Patient ID is required');
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error('Valid due date (YYYY-MM-DD) is required');

  const patient = getPatientById(patientId);
  if (!patient) throw new Error('Patient not found');

  const nowIso = new Date().toISOString();
  const id = 'fu_' + crypto.randomUUID();
  const status = 'PENDING';
  const prio = (priority && ['NORMAL', 'HIGH', 'URGENT'].includes(String(priority).toUpperCase())) ? String(priority).toUpperCase() : 'NORMAL';

  db.prepare(`
    INSERT INTO follow_ups (
      id, patient_id, appointment_id, treatment_record_id, treatment_plan_id,
      follow_up_type, reason, preferred_channel, due_date, status, priority, notes, assigned_to, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    patient.id,
    appointmentId,
    treatmentRecordId,
    treatmentPlanId,
    followUpType,
    reason,
    preferredChannel,
    dueDate,
    status,
    prio,
    notes,
    assignedTo,
    createdBy,
    nowIso,
    nowIso
  );

  return getFollowUpById(id);
}

function getFollowUpById(id) {
  const fu = db.prepare(`
    SELECT f.*, f.follow_up_type as type, p.full_name as patient_name, p.mobile as patient_phone, p.patient_reference,
           d.full_name as assigned_doctor_name, d.specialization as assigned_doctor_spec,
           a.booking_reference, tr.procedure_name as treatment_procedure_name
    FROM follow_ups f
    JOIN patients p ON f.patient_id = p.id
    LEFT JOIN practitioners d ON f.assigned_to = d.id
    LEFT JOIN appointments a ON f.appointment_id = a.id
    LEFT JOIN treatment_records tr ON f.treatment_record_id = tr.id
    WHERE f.id = ?
  `).get(id);

  return fu || null;
}

function updateFollowUpStatus(id, newStatus, metadata = {}, updatedBy = 'staff') {
  const existing = db.prepare('SELECT * FROM follow_ups WHERE id = ?').get(id);
  if (!existing) return null;

  const targetStatus = (newStatus || '').toUpperCase();
  if (!VALID_FOLLOW_UP_STATUSES.includes(targetStatus)) {
    throw new Error(`Invalid status: ${newStatus}. Valid statuses: ${VALID_FOLLOW_UP_STATUSES.join(', ')}`);
  }

  if (existing.status === targetStatus) {
    if (metadata.notes) {
      const nowIso = new Date().toISOString();
      const notes = existing.notes ? `${existing.notes} | ${metadata.notes}` : metadata.notes;
      db.prepare('UPDATE follow_ups SET notes = ?, updated_at = ? WHERE id = ?').run(notes, nowIso, id);
    }
    return getFollowUpById(id);
  }

  const allowedTransitions = VALID_FOLLOW_UP_TRANSITIONS[existing.status] || [];
  if (!allowedTransitions.includes(targetStatus)) {
    throw new Error(`Illegal state transition from '${existing.status}' to '${targetStatus}'. Allowed: ${allowedTransitions.length > 0 ? allowedTransitions.join(', ') : 'None (Terminal state)'}`);
  }

  const nowIso = new Date().toISOString();
  let contactedVia = metadata.contacted_via || existing.contacted_via || null;
  let contactedAt = existing.contacted_at || null;
  let completedAt = existing.completed_at || null;

  if (targetStatus === 'CONTACTED') {
    contactedAt = contactedAt || nowIso;
    if (metadata.contacted_via) contactedVia = metadata.contacted_via;
  }

  if (targetStatus === 'COMPLETED') {
    completedAt = completedAt || nowIso;
  }

  let notes = existing.notes;
  if (metadata.notes) {
    notes = existing.notes ? `${existing.notes} | ${metadata.notes}` : metadata.notes;
  }

  let dueDate = existing.due_date;
  if (metadata.rescheduled_date) {
    dueDate = metadata.rescheduled_date;
  }

  db.prepare(`
    UPDATE follow_ups 
    SET status = ?, due_date = ?, notes = ?, contacted_via = ?, contacted_at = ?, completed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(targetStatus, dueDate, notes, contactedVia, contactedAt, completedAt, nowIso, id);

  return getFollowUpById(id);
}

function getFollowUps(filters = {}) {
  const patientId = filters.patient_id || filters.patientId;
  const doctorId = filters.assigned_to || filters.doctorId;
  const status = filters.status;
  const type = filters.type || filters.follow_up_type;
  const date = filters.due_date || filters.date;
  const isDue = filters.isDue;
  const fromDate = filters.from_date;
  const toDate = filters.to_date;
  const overdueOnly = filters.overdue_only === true || filters.overdue_only === 'true';
  const limit = filters.limit;

  let sql = `
    SELECT f.*, f.follow_up_type as type, p.full_name as patient_name, p.mobile as patient_phone, p.patient_reference,
           d.full_name as assigned_doctor_name,
           a.booking_reference, tr.procedure_name as treatment_procedure_name
    FROM follow_ups f
    JOIN patients p ON f.patient_id = p.id
    LEFT JOIN practitioners d ON f.assigned_to = d.id
    LEFT JOIN appointments a ON f.appointment_id = a.id
    LEFT JOIN treatment_records tr ON f.treatment_record_id = tr.id
    WHERE 1=1
  `;
  const params = [];

  if (patientId) {
    sql += ' AND f.patient_id = ?';
    params.push(patientId);
  }

  if (doctorId && doctorId !== 'all') {
    sql += ' AND (f.assigned_to = ? OR f.assigned_to IS NULL)';
    params.push(doctorId);
  }

  if (status && status !== 'ALL') {
    sql += ' AND f.status = ?';
    params.push(status);
  }

  if (type && type !== 'ALL') {
    sql += ' AND f.follow_up_type = ?';
    params.push(type);
  }

  if (date) {
    sql += ' AND f.due_date = ?';
    params.push(date);
  }

  if (fromDate) {
    sql += ' AND f.due_date >= ?';
    params.push(fromDate);
  }

  if (toDate) {
    sql += ' AND f.due_date <= ?';
    params.push(toDate);
  }

  if (overdueOnly) {
    const todayStr = new Date().toISOString().split('T')[0];
    sql += " AND f.due_date < ? AND f.status IN ('PENDING', 'DUE')";
    params.push(todayStr);
  } else if (isDue) {
    const todayStr = new Date().toISOString().split('T')[0];
    sql += " AND f.due_date <= ? AND f.status IN ('PENDING', 'DUE')";
    params.push(todayStr);
  }

  sql += ' ORDER BY f.due_date ASC, f.created_at DESC';
  if (limit) {
    sql += ' LIMIT ?';
    params.push(parseInt(limit, 10));
  }

  return db.prepare(sql).all(...params);
}

function getDueAndOverdueFollowUps(asOfDate) {
  const targetDate = asOfDate || new Date().toISOString().split('T')[0];

  const dueToday = db.prepare(`
    SELECT f.*, f.follow_up_type as type, p.full_name as patient_name, p.mobile as patient_phone, p.patient_reference, d.full_name as doctor_name
    FROM follow_ups f
    JOIN patients p ON f.patient_id = p.id
    LEFT JOIN practitioners d ON f.assigned_to = d.id
    WHERE f.due_date = ? AND f.status IN ('PENDING', 'DUE')
    ORDER BY f.priority = 'HIGH' DESC, f.created_at ASC
  `).all(targetDate);

  const overdue = db.prepare(`
    SELECT f.*, f.follow_up_type as type, p.full_name as patient_name, p.mobile as patient_phone, p.patient_reference, d.full_name as doctor_name
    FROM follow_ups f
    JOIN patients p ON f.patient_id = p.id
    LEFT JOIN practitioners d ON f.assigned_to = d.id
    WHERE f.due_date < ? AND f.status IN ('PENDING', 'DUE')
    ORDER BY f.due_date ASC
  `).all(targetDate);

  const upcoming7Days = db.prepare(`
    SELECT f.*, f.follow_up_type as type, p.full_name as patient_name, p.mobile as patient_phone, p.patient_reference, d.full_name as doctor_name
    FROM follow_ups f
    JOIN patients p ON f.patient_id = p.id
    LEFT JOIN practitioners d ON f.assigned_to = d.id
    WHERE f.due_date > ? AND f.due_date <= date(?, '+7 days') AND f.status IN ('PENDING', 'DUE')
    ORDER BY f.due_date ASC
  `).all(targetDate, targetDate);

  return {
    due_today: dueToday,
    dueToday,
    overdue,
    upcoming_7_days: upcoming7Days,
    upcoming7Days
  };
}

// --- Communication Preferences ---
function getCommunicationPreferences(patientId) {
  const row = db.prepare('SELECT * FROM communication_preferences WHERE patient_id = ?').get(patientId);
  if (row) {
    return {
      ...row,
      preferred_contact_time: row.preferred_contact_time || 'ANYTIME',
      language_preference: row.language_preference || 'en'
    };
  }
  return {
    patient_id: patientId,
    preferred_channel: 'WHATSAPP',
    whatsapp_opt_in: 1,
    preferred_contact_time: 'ANYTIME',
    language_preference: 'en',
    communication_notes: null,
    updated_at: new Date().toISOString()
  };
}

function updateCommunicationPreferences(patientId, updates = {}) {
  const patient = getPatientById(patientId);
  if (!patient) throw new Error('Patient not found');

  const nowIso = new Date().toISOString();
  
  const rawChannel = updates.preferred_channel !== undefined ? updates.preferred_channel : updates.preferredChannel;
  const rawOptIn = updates.whatsapp_opt_in !== undefined ? updates.whatsapp_opt_in : updates.whatsappOptIn;
  const rawContactTime = updates.preferred_contact_time !== undefined ? updates.preferred_contact_time : updates.preferredContactTime;
  const rawLanguage = updates.language_preference !== undefined ? updates.language_preference : updates.languagePreference;
  const rawNotes = updates.communication_notes !== undefined ? updates.communication_notes : updates.communicationNotes;
  const updatedBy = updates.updated_by || updates.updatedBy || 'staff';

  const existing = getCommunicationPreferences(patient.id);

  let channel = existing.preferred_channel;
  if (rawChannel !== undefined && rawChannel !== null) {
    const uc = String(rawChannel).toUpperCase();
    if (!['WHATSAPP', 'PHONE', 'SMS', 'NONE'].includes(uc)) {
      throw new Error(`Invalid preferred channel '${rawChannel}'. Allowed channels: WHATSAPP, PHONE, SMS, NONE.`);
    }
    channel = uc;
  }

  let optIn = existing.whatsapp_opt_in;
  if (rawOptIn !== undefined && rawOptIn !== null) {
    optIn = (rawOptIn === 1 || rawOptIn === true || rawOptIn === '1') ? 1 : 0;
  }

  let contactTime = existing.preferred_contact_time || 'ANYTIME';
  if (rawContactTime !== undefined && rawContactTime !== null) {
    contactTime = String(rawContactTime).toUpperCase();
  }

  let lang = existing.language_preference || 'en';
  if (rawLanguage !== undefined && rawLanguage !== null) {
    lang = String(rawLanguage).toLowerCase();
  }

  let notes = existing.communication_notes;
  if (rawNotes !== undefined) {
    notes = rawNotes || null;
  }

  db.prepare(`
    INSERT INTO communication_preferences (patient_id, preferred_channel, whatsapp_opt_in, preferred_contact_time, language_preference, communication_notes, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(patient_id) DO UPDATE SET
      preferred_channel = excluded.preferred_channel,
      whatsapp_opt_in = excluded.whatsapp_opt_in,
      preferred_contact_time = excluded.preferred_contact_time,
      language_preference = excluded.language_preference,
      communication_notes = excluded.communication_notes,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(patient.id, channel, optIn, contactTime, lang, notes, updatedBy, nowIso);

  return getCommunicationPreferences(patient.id);
}

// --- Message Templates ---
function getMessageTemplates() {
  return db.prepare('SELECT * FROM message_templates WHERE is_active = 1 ORDER BY category ASC').all();
}

function getMessageTemplateById(idOrIdentifier) {
  return db.prepare('SELECT * FROM message_templates WHERE id = ? OR template_identifier = ?').get(idOrIdentifier, idOrIdentifier) || null;
}

// --- Communications Log ---
function recordCommunication({
  patientId, appointmentId, followUpId, channel, communicationType,
  templateId, recipient, bodyRendered, providerMessageId, status,
  scheduledAt, sentAt, deliveredAt, failureReason, createdBy,
  idempotencyKey, idempotency_key
}) {
  if (!patientId) throw new Error('Patient ID is required');
  if (!recipient) throw new Error('Recipient is required');
  if (!bodyRendered) throw new Error('Rendered message body is required');

  const id = 'comm_' + crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const idempKey = idempotency_key || idempotencyKey || null;

  db.prepare(`
    INSERT INTO communications (
      id, patient_id, appointment_id, follow_up_id, channel, communication_type,
      template_id, recipient, body_rendered, provider_message_id, status,
      scheduled_at, sent_at, delivered_at, failure_reason, created_by, idempotency_key, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    patientId,
    appointmentId || null,
    followUpId || null,
    channel || 'WHATSAPP',
    communicationType || 'MANUAL_MESSAGE',
    templateId || null,
    recipient,
    bodyRendered,
    providerMessageId || null,
    status || 'SENT',
    scheduledAt || null,
    sentAt || nowIso,
    deliveredAt || null,
    failureReason || null,
    createdBy || 'staff',
    idempKey,
    nowIso,
    nowIso
  );

  return getCommunicationById(id);
}

function updateCommunicationStatus(providerMessageId, status, timestamp, failureReason) {
  const comm = db.prepare('SELECT * FROM communications WHERE provider_message_id = ?').get(providerMessageId);
  if (!comm) return null;

  const nowIso = new Date().toISOString();
  const eventTime = timestamp || nowIso;

  let updateSql = 'UPDATE communications SET status = ?, updated_at = ?';
  const params = [status, nowIso];

  if (status === 'DELIVERED') {
    updateSql += ', delivered_at = COALESCE(delivered_at, ?)';
    params.push(eventTime);
  } else if (status === 'READ') {
    updateSql += ', read_at = COALESCE(read_at, ?)';
    params.push(eventTime);
  } else if (status === 'FAILED') {
    updateSql += ', failed_at = ?, failure_reason = ?';
    params.push(eventTime, failureReason || 'Provider rejected message');
  }

  updateSql += ' WHERE id = ?';
  params.push(comm.id);

  db.prepare(updateSql).run(...params);
  return getCommunicationById(comm.id);
}

function getCommunicationById(id) {
  return db.prepare(`
    SELECT c.*, c.status as delivery_status, p.full_name as patient_name, p.patient_reference, t.name as template_name
    FROM communications c
    JOIN patients p ON c.patient_id = p.id
    LEFT JOIN message_templates t ON c.template_id = t.id
    WHERE c.id = ?
  `).get(id) || null;
}

function getCommunicationByIdempotencyKey(key) {
  if (!key) return null;
  return db.prepare(`
    SELECT c.*, c.status as delivery_status, p.full_name as patient_name, p.patient_reference, t.name as template_name
    FROM communications c
    JOIN patients p ON c.patient_id = p.id
    LEFT JOIN message_templates t ON c.template_id = t.id
    WHERE c.idempotency_key = ?
  `).get(key) || null;
}

function getPatientCommunications(patientId) {
  return db.prepare(`
    SELECT c.*, c.status as delivery_status, t.name as template_name
    FROM communications c
    LEFT JOIN message_templates t ON c.template_id = t.id
    WHERE c.patient_id = ?
    ORDER BY c.created_at DESC
  `).all(patientId);
}

function getAppointmentCommunications(bookingReference) {
  return db.prepare(`
    SELECT c.*, c.status as delivery_status, t.name as template_name
    FROM communications c
    JOIN appointments a ON c.appointment_id = a.id
    LEFT JOIN message_templates t ON c.template_id = t.id
    WHERE a.booking_reference = ?
    ORDER BY c.created_at DESC
  `).all(bookingReference);
}

// --- Idempotent Communication Jobs (Scheduler) ---
function scheduleCommunicationJob(options = {}) {
  const idempotencyKey = options.idempotency_key || options.idempotencyKey;
  const patientId = options.patient_id || options.patientId;
  const appointmentId = options.appointment_id || options.appointmentId || null;
  const followUpId = options.follow_up_id || options.followUpId || null;
  const templateId = options.template_id || options.templateId;
  const jobType = options.job_type || options.jobType || 'WHATSAPP_MESSAGE';
  const scheduledFor = options.scheduled_for || options.scheduledFor || new Date().toISOString();

  if (!idempotencyKey) throw new Error('Idempotency key is required');
  if (!patientId) throw new Error('Patient ID is required');
  if (!templateId) throw new Error('Template ID is required');
  const nowIso = new Date().toISOString();
  const id = 'job_' + crypto.randomUUID();

  try {
    db.prepare(`
      INSERT INTO communication_jobs (
        id, idempotency_key, patient_id, appointment_id, follow_up_id, template_id,
        job_type, scheduled_for, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `).run(
      id,
      idempotencyKey,
      patientId,
      appointmentId || null,
      followUpId || null,
      templateId,
      jobType,
      scheduledFor,
      nowIso,
      nowIso
    );
    return db.prepare('SELECT * FROM communication_jobs WHERE id = ?').get(id);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      // Duplicate protection: job already scheduled for this logical event!
      return db.prepare('SELECT * FROM communication_jobs WHERE idempotency_key = ?').get(idempotencyKey);
    }
    throw err;
  }
}

function getPendingCommunicationJobs(asOfTime, limit = 50) {
  const cutoff = asOfTime || new Date().toISOString();
  return db.prepare(`
    SELECT j.*, t.template_identifier, t.variables_schema, t.body_preview,
           p.full_name as patient_name, p.mobile as patient_phone
    FROM communication_jobs j
    JOIN message_templates t ON j.template_id = t.id
    JOIN patients p ON j.patient_id = p.id
    WHERE j.status = 'PENDING' AND j.scheduled_for <= ?
    ORDER BY j.scheduled_for ASC
    LIMIT ?
  `).all(cutoff, limit);
}

function markCommunicationJobProcessing(jobId) {
  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE communication_jobs
    SET status = 'PROCESSING', attempts = attempts + 1, last_attempt_at = ?, updated_at = ?
    WHERE id = ?
  `).run(nowIso, nowIso, jobId);
}

function markCommunicationJobCompleted(jobId) {
  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE communication_jobs
    SET status = 'COMPLETED', updated_at = ?
    WHERE id = ?
  `).run(nowIso, jobId);
}

function markCommunicationJobFailed(jobId, errorMessage) {
  const nowIso = new Date().toISOString();
  const job = db.prepare('SELECT attempts, max_attempts FROM communication_jobs WHERE id = ?').get(jobId);
  const isTerminal = job && job.attempts >= job.max_attempts;
  const status = isTerminal ? 'FAILED' : 'PENDING';

  db.prepare(`
    UPDATE communication_jobs
    SET status = ?, error_message = ?, updated_at = ?
    WHERE id = ?
  `).run(status, errorMessage || 'Unknown failure', nowIso, jobId);
}

module.exports = {
  db,
  generateBookingReference,
  generatePaymentReference,
  releaseExpiredHolds,
  getNextDailyToken,
  checkInPatientAtomic,
  authenticateStaff,
  getStaffSession,
  revokeStaffSession,
  seedDemoQueueData,

  // Phase 4 Clinical Exports
  PROTOTYPE_FINDING_TAXONOMY,
  isValidFdiTooth,
  isValidSurface,
  runPatientMigration,
  findOrCreatePatientFromBooking,
  createPatient,
  getPatientById,
  searchPatients,
  updatePatientDemographics,
  getPatientAppointments,
  createClinicalNote,
  getClinicalNotes,
  recordOdontogramFinding,
  archiveOdontogramFinding,
  getOdontogramFindings,
  createTreatmentPlan,
  updateTreatmentPlanStatus,
  getTreatmentPlans,
  recordPerformedTreatment,
  getTreatmentRecords,
  createPrescription,
  getPrescriptionById,
  getPrescriptions,
  getPatientTimeline,

  // Phase 5 Follow-ups & Communication Exports
  VALID_FOLLOW_UP_STATUSES,
  VALID_FOLLOW_UP_TYPES,
  VALID_FOLLOW_UP_TRANSITIONS,
  createFollowUp,
  getFollowUpById,
  updateFollowUpStatus,
  getFollowUps,
  getDueAndOverdueFollowUps,
  getCommunicationPreferences,
  updateCommunicationPreferences,
  getMessageTemplates,
  getMessageTemplateById,
  recordCommunication,
  updateCommunicationStatus,
  getCommunicationById,
  getCommunicationByIdempotencyKey,
  getPatientCommunications,
  getAppointmentCommunications,
  scheduleCommunicationJob,
  getPendingCommunicationJobs,
  markCommunicationJobProcessing,
  markCommunicationJobCompleted,
  markCommunicationJobFailed
};
