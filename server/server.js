/**
 * Clinic Management System — HTTP Server & Appointment Booking API
 * Built with Node.js Native HTTP & SQLite (node:sqlite)
 */

// Ensure node:sqlite is available (required flag in Node.js 22.x LTS)
if (require.main === module) {
  try {
    require('node:sqlite');
  } catch (err) {
    if (err.code === 'ERR_UNKNOWN_BUILTIN_MODULE' && !process.env._SQLITE_RESPAWNED) {
      console.log('[STARTUP] Enabling --experimental-sqlite for Node.js 22 runtime...');
      const { spawn } = require('child_process');
      const args = ['--experimental-sqlite', ...process.execArgv, ...process.argv.slice(1)];
      const child = spawn(process.execPath, args, {
        stdio: 'inherit',
        env: { ...process.env, _SQLITE_RESPAWNED: '1' }
      });
      process.on('SIGTERM', () => child.kill('SIGTERM'));
      process.on('SIGINT', () => child.kill('SIGINT'));
      child.on('exit', (code, signal) => {
        process.exit(code !== null ? code : (signal ? 1 : 0));
      });
      return;
    }
    throw err;
  }
}

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { 
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
  // Phase 5 DB operations
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
  getPatientCommunications,
  getAppointmentCommunications,
  scheduleCommunicationJob,
  getPendingCommunicationJobs,
  markCommunicationJobProcessing,
  markCommunicationJobCompleted,
  markCommunicationJobFailed
} = require('./db');
const { communicationService } = require('./communication');
const { clinicConfig } = require('./clinic-config');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3000;
const CLINIC_PHONE = process.env.CLINIC_PHONE || clinicConfig.phone || '+91 98765 43210';
const CLINIC_LOCATION = clinicConfig.address || 'Suite 400, Healthcare Plaza, Medical Center Boulevard, Metro City 560001';

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.ics': 'text/calendar; charset=UTF-8'
};

// ============================================================================
// Helper: Send JSON Response
// ============================================================================
function sendJson(res, statusCode, data) {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Content-Length': Buffer.byteLength(json),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(json);
}

// Helper: Parse JSON Body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) { // 1MB limit
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      try {
        const data = body ? JSON.parse(body) : {};
        resolve(data);
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

// Helper: Format Time for ICS (YYYYMMDDTHHMMSSZ)
function formatIcsDateTime(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day, hours - 5, minutes - 30));
  return dt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function formatDisplayTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  const displayM = m.toString().padStart(2, '0');
  return `${displayH}:${displayM} ${period}`;
}

// ============================================================================
// REST API Handlers
// ============================================================================

// 1. GET /api/services
function handleGetServices(req, res) {
  const services = db.prepare(`
    SELECT id, name, category, duration_minutes, description, image_url 
    FROM services 
    WHERE is_active = 1 
    ORDER BY id
  `).all();
  sendJson(res, 200, { services });
}

// 2. GET /api/doctors
function handleGetDoctors(req, res) {
  const doctors = db.prepare(`
    SELECT id, full_name, qualifications, specialization, affiliations, assigned_operatory, schedule_days, working_hours_start, working_hours_end 
    FROM practitioners 
    WHERE is_active = 1 
    ORDER BY id
  `).all();

  const formatted = doctors.map(d => ({
    ...d,
    schedule_days: JSON.parse(d.schedule_days)
  }));

  sendJson(res, 200, { doctors: formatted });
}

// 3. GET /api/availability?doctorId={id}&date={YYYY-MM-DD}
function handleGetAvailability(req, res, query) {
  const { doctorId = 'any', date } = query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return sendJson(res, 400, { error: 'Valid date parameter in YYYY-MM-DD format is required.' });
  }

  const todayStr = new Date().toISOString().split('T')[0];
  if (date < todayStr) {
    return sendJson(res, 400, { error: 'Appointments cannot be booked for past dates.' });
  }

  const targetDate = new Date(date + 'T00:00:00');
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = daysOfWeek[targetDate.getDay()];
  const isSunday = targetDate.getDay() === 0;

  let activeDoctors = [];
  if (doctorId !== 'any') {
    const doc = db.prepare('SELECT id, full_name FROM practitioners WHERE id = ? AND is_active = 1').get(doctorId);
    if (!doc) {
      return sendJson(res, 404, { error: 'Specialist not found.' });
    }
    activeDoctors = [doc];
  } else {
    activeDoctors = db.prepare('SELECT id, full_name FROM practitioners WHERE is_active = 1').all();
  }

  // Clinic working hours
  const morningTimes = ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30'];
  const eveningTimes = isSunday ? [] : ['16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'];

  const now = new Date();
  const currentHours = now.getHours();
  const currentMinutes = now.getMinutes();

  // Lazily release any expired slot holds before calculating availability
  releaseExpiredHolds();

  const bookedRows = db.prepare(`
    SELECT doctor_id, appointment_time 
    FROM appointments 
    WHERE appointment_date = ? AND status != 'CANCELLED'
  `).all(date);

  const bookedMap = new Set(bookedRows.map(r => `${r.doctor_id}_${r.appointment_time}`));

  function calculateSlot(timeStr) {
    const [slotH, slotM] = timeStr.split(':').map(Number);
    const isPast = (date === todayStr && (slotH < currentHours || (slotH === currentHours && slotM <= currentMinutes)));

    if (isPast) {
      return {
        time: timeStr,
        displayTime: formatDisplayTime(timeStr),
        status: 'PAST',
        available: false
      };
    }

    if (doctorId !== 'any') {
      const isBooked = bookedMap.has(`${doctorId}_${timeStr}`);
      return {
        time: timeStr,
        displayTime: formatDisplayTime(timeStr),
        status: isBooked ? 'FULL' : 'AVAILABLE',
        available: !isBooked
      };
    } else {
      const availableDoc = activeDoctors.find(d => !bookedMap.has(`${d.id}_${timeStr}`));
      return {
        time: timeStr,
        displayTime: formatDisplayTime(timeStr),
        status: availableDoc ? 'AVAILABLE' : 'FULL',
        available: !!availableDoc,
        assignedDoctorId: availableDoc ? availableDoc.id : null
      };
    }
  }

  const morningSlots = morningTimes.map(calculateSlot);
  const eveningSlots = eveningTimes.map(calculateSlot);

  const totalAvailable = [...morningSlots, ...eveningSlots].filter(s => s.available).length;

  sendJson(res, 200, {
    date,
    dayName,
    doctorId,
    isSunday,
    clinicHours: isSunday ? '10:00 AM – 2:00 PM (Sunday Hours)' : '10:00 AM – 7:30 PM',
    morningSlots,
    eveningSlots,
    totalAvailableSlots: totalAvailable
  });
}

// 4. POST /api/appointments
async function handleCreateAppointment(req, res) {
  let body;
  try {
    body = await parseJsonBody(req);
  } catch (e) {
    return sendJson(res, 400, { error: 'Invalid JSON payload.' });
  }

  // Lazily release any expired slot holds before handling booking
  releaseExpiredHolds();

  const {
    patientEmail,
    patientType = 'NEW',
    doctorId = 'any',
    serviceId,
    notes = ''
  } = body;


  const patientName = body.patientName || body.fullName;
  const patientPhone = body.patientPhone || body.mobileNumber;
  const appointmentDate = body.appointmentDate || body.preferredDate;
  const appointmentTime = body.appointmentTime || body.preferredTime;

  // Validation
  if (!patientName || typeof patientName !== 'string' || patientName.trim().length < 2) {
    return sendJson(res, 400, { error: 'Please enter a valid full name.' });
  }

  const cleanPhone = (patientPhone || '').toString().replace(/[\s\-\(\)]/g, '');
  const phoneRegex = /^(?:\+91|0)?[6-9]\d{9}$/;
  if (!phoneRegex.test(cleanPhone)) {
    return sendJson(res, 400, { error: 'Please enter a valid 10-digit Indian mobile number.' });
  }

  if (patientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientEmail)) {
    return sendJson(res, 400, { error: 'Please enter a valid email address.' });
  }

  if (!serviceId) {
    return sendJson(res, 400, { error: 'Please select a dental service.' });
  }

  let service = db.prepare('SELECT id, name FROM services WHERE id = ? AND is_active = 1').get(serviceId);
  if (!service) {
    if (serviceId === 'svc_root_canal' || serviceId === 'root_canal') {
      service = db.prepare('SELECT id, name FROM services WHERE id = ?').get('serv_rct');
    } else {
      service = db.prepare('SELECT id, name FROM services WHERE id LIKE ? OR name LIKE ? LIMIT 1').get(`%${serviceId}%`, `%${serviceId}%`);
    }
  }
  if (!service) {
    return sendJson(res, 400, { error: 'Selected dental service is not recognized.' });
  }

  if (!appointmentDate || !/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)) {
    return sendJson(res, 400, { error: 'Please select a valid appointment date.' });
  }

  if (!appointmentTime || !/^\d{2}:\d{2}$/.test(appointmentTime)) {
    return sendJson(res, 400, { error: 'Please select a valid appointment time slot.' });
  }

  // Doctor assignment
  let targetDoctorId = doctorId;
  let targetDoctorName = '';

  if (doctorId === 'any') {
    const activeDocs = db.prepare('SELECT id, full_name FROM practitioners WHERE is_active = 1').all();
    const busyDocs = db.prepare(`
      SELECT doctor_id FROM appointments 
      WHERE appointment_date = ? AND appointment_time = ? AND status != 'CANCELLED'
    `).all(appointmentDate, appointmentTime).map(r => r.doctor_id);

    const freeDoc = activeDocs.find(d => !busyDocs.includes(d.id));
    if (!freeDoc) {
      return sendJson(res, 409, {
        error: 'That time is no longer available. Please choose another slot.',
        code: 'SLOT_UNAVAILABLE'
      });
    }
    targetDoctorId = freeDoc.id;
    targetDoctorName = freeDoc.full_name;
  } else {
    const doc = db.prepare('SELECT id, full_name FROM practitioners WHERE id = ? AND is_active = 1').get(doctorId);
    if (!doc) {
      return sendJson(res, 400, { error: 'Selected specialist is not available.' });
    }
    targetDoctorName = doc.full_name;
  }

  // Atomic SQLite Reservation with Double-Booking Protection
  try {
    db.exec('BEGIN IMMEDIATE;');

    // Conflict Check
    const existing = db.prepare(`
      SELECT id FROM appointments 
      WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? AND status != 'CANCELLED'
    `).get(targetDoctorId, appointmentDate, appointmentTime);

    if (existing) {
      db.exec('ROLLBACK;');
      return sendJson(res, 409, {
        error: 'That time is no longer available. Please choose another slot.',
        code: 'SLOT_UNAVAILABLE'
      });
    }

    // Find or create persistent patient entity
    const patientEntity = findOrCreatePatientFromBooking({
      name: patientName.trim(),
      phone: cleanPhone,
      email: patientEmail ? patientEmail.trim() : null,
      patientType: patientType === 'RETURNING' ? 'RETURNING' : 'NEW'
    });

    // Generate Booking Reference & Demo Payment Reference
    const bookingReference = generateBookingReference();
    const paymentReference = generatePaymentReference();
    const appointmentId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    // Insert Appointment — links to patient_id, token_number is strictly null in Phase 2
    const insertStmt = db.prepare(`
      INSERT INTO appointments (
        id, patient_id, booking_reference, patient_name, patient_phone, patient_email, patient_type,
        doctor_id, doctor_name, service_id, service_name, appointment_date, appointment_time,
        status, source, token_number, payment_status, payment_reference, payment_amount, notes, is_demo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', 'PATIENT_WEB', NULL, 'SUCCESS', ?, 500, ?, 0, ?, ?)
    `);

    insertStmt.run(
      appointmentId,
      patientEntity.id,
      bookingReference,
      patientName.trim(),
      cleanPhone,
      patientEmail ? patientEmail.trim() : null,
      patientEntity.patient_type,
      targetDoctorId,
      targetDoctorName,
      service.id,
      service.name,
      appointmentDate,
      appointmentTime,
      paymentReference,
      notes ? notes.trim() : null,
      nowIso,
      nowIso
    );

    db.exec('COMMIT;');

    console.log(`[BOOKING] Appointment confirmed: ${bookingReference} (Payment: ${paymentReference}) for ${patientName.trim()} with ${targetDoctorName} on ${appointmentDate} at ${appointmentTime}`);

    // Phase 5: Schedule automatic WhatsApp confirmation job
    try {
      scheduleCommunicationJob({
        patient_id: patientEntity.id,
        appointment_id: appointmentId,
        template_id: 'tpl_appt_confirm',
        variables: {
          patient_name: patientName.trim(),
          doctor_name: targetDoctorName,
          appointment_date: appointmentDate,
          appointment_time: formatDisplayTime(appointmentTime),
          booking_reference: bookingReference
        },
        scheduled_for: nowIso,
        idempotency_key: `appt_confirm_${appointmentId}`
      });
    } catch (schedErr) {
      console.warn('[SCHEDULER] Could not schedule confirmation communication job:', schedErr.message);
    }

    const apptObj = {
      bookingReference,
      paymentReference,
      paymentStatus: 'SUCCESS',
      paymentAmount: 500,
      doctorName: targetDoctorName,
      serviceName: service.name,
      appointmentDate,
      appointmentTime,
      displayTime: formatDisplayTime(appointmentTime),
      patientName: patientName.trim(),
      patientPhone: cleanPhone,
      status: 'CONFIRMED',
      token_number: null
    };

    sendJson(res, 201, {
      success: true,
      ...apptObj,
      appointment: apptObj,
      clinicLocation: CLINIC_LOCATION,
      clinicPhone: CLINIC_PHONE
    });
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch (_) {}

    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return sendJson(res, 409, {
        error: 'That time is no longer available. Please choose another slot.',
        code: 'SLOT_UNAVAILABLE'
      });
    }

    console.error('[BOOKING ERROR]', err);
    sendJson(res, 500, {
      error: 'Unable to complete your booking right now. Please try again or contact the clinic.'
    });
  }
}

// 4b. POST /api/appointments/hold (Temporary 10-minute slot reservation)
async function handleHoldAppointment(req, res) {
  let body;
  try {
    body = await parseJsonBody(req);
  } catch (e) {
    return sendJson(res, 400, { error: 'Invalid JSON payload.' });
  }

  // Lazily release any expired slot holds before handling hold request
  releaseExpiredHolds();

  const {
    patientEmail,
    patientType = 'NEW',
    doctorId = 'any',
    serviceId,
    notes = ''
  } = body;

  const patientName = body.patientName || body.fullName;
  const patientPhone = body.patientPhone || body.mobileNumber;
  const appointmentDate = body.appointmentDate || body.preferredDate;
  const appointmentTime = body.appointmentTime || body.preferredTime;

  // Validation
  if (!patientName || typeof patientName !== 'string' || patientName.trim().length < 2) {
    return sendJson(res, 400, { error: 'Please enter a valid full name.' });
  }

  const cleanPhone = (patientPhone || '').toString().replace(/[\s\-\(\)]/g, '');
  const phoneRegex = /^(?:\+91|0)?[6-9]\d{9}$/;
  if (!phoneRegex.test(cleanPhone)) {
    return sendJson(res, 400, { error: 'Please enter a valid 10-digit Indian mobile number.' });
  }

  if (patientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientEmail)) {
    return sendJson(res, 400, { error: 'Please enter a valid email address.' });
  }

  if (!serviceId) {
    return sendJson(res, 400, { error: 'Please select a dental service.' });
  }

  let service = db.prepare('SELECT id, name FROM services WHERE id = ? AND is_active = 1').get(serviceId);
  if (!service) {
    if (serviceId === 'svc_root_canal' || serviceId === 'root_canal') {
      service = db.prepare('SELECT id, name FROM services WHERE id = ?').get('serv_rct');
    } else {
      service = db.prepare('SELECT id, name FROM services WHERE id LIKE ? OR name LIKE ? LIMIT 1').get(`%${serviceId}%`, `%${serviceId}%`);
    }
  }
  if (!service) {
    return sendJson(res, 400, { error: 'Selected dental service is not recognized.' });
  }

  if (!appointmentDate || !/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)) {
    return sendJson(res, 400, { error: 'Please select a valid appointment date.' });
  }

  if (!appointmentTime || !/^\d{2}:\d{2}$/.test(appointmentTime)) {
    return sendJson(res, 400, { error: 'Please select a valid appointment time slot.' });
  }

  // Doctor assignment
  let targetDoctorId = doctorId;
  let targetDoctorName = '';

  if (doctorId === 'any') {
    const activeDocs = db.prepare('SELECT id, full_name FROM practitioners WHERE is_active = 1').all();
    const busyDocs = db.prepare(`
      SELECT doctor_id FROM appointments 
      WHERE appointment_date = ? AND appointment_time = ? AND status != 'CANCELLED'
    `).all(appointmentDate, appointmentTime).map(r => r.doctor_id);

    const freeDoc = activeDocs.find(d => !busyDocs.includes(d.id));
    if (!freeDoc) {
      return sendJson(res, 409, {
        error: 'That time is currently being reserved or already booked. Please choose another slot.',
        code: 'SLOT_UNAVAILABLE'
      });
    }
    targetDoctorId = freeDoc.id;
    targetDoctorName = freeDoc.full_name;
  } else {
    const doc = db.prepare('SELECT id, full_name FROM practitioners WHERE id = ? AND is_active = 1').get(doctorId);
    if (!doc) {
      return sendJson(res, 400, { error: 'Selected specialist is not available.' });
    }
    targetDoctorName = doc.full_name;
  }

  try {
    db.exec('BEGIN IMMEDIATE;');

    // Conflict Check (includes both CONFIRMED and active HELD appointments)
    const existing = db.prepare(`
      SELECT id FROM appointments 
      WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? AND status != 'CANCELLED'
    `).get(targetDoctorId, appointmentDate, appointmentTime);

    if (existing) {
      db.exec('ROLLBACK;');
      return sendJson(res, 409, {
        error: 'That time is currently being reserved or already booked. Please choose another slot.',
        code: 'SLOT_UNAVAILABLE'
      });
    }

    // Find or create persistent patient entity
    const patientEntity = findOrCreatePatientFromBooking({
      name: patientName.trim(),
      phone: cleanPhone,
      email: patientEmail ? patientEmail.trim() : null,
      patientType: patientType === 'RETURNING' ? 'RETURNING' : 'NEW'
    });

    const bookingReference = generateBookingReference();
    const appointmentId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    // Temporary 10-minute hold
    const holdExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const insertStmt = db.prepare(`
      INSERT INTO appointments (
        id, patient_id, booking_reference, patient_name, patient_phone, patient_email, patient_type,
        doctor_id, doctor_name, service_id, service_name, appointment_date, appointment_time,
        status, source, token_number, payment_status, payment_reference, payment_amount, hold_expires_at, notes, is_demo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'HELD', 'PATIENT_WEB', NULL, 'PENDING', NULL, 500, ?, ?, 0, ?, ?)
    `);

    insertStmt.run(
      appointmentId,
      patientEntity.id,
      bookingReference,
      patientName.trim(),
      cleanPhone,
      patientEmail ? patientEmail.trim() : null,
      patientEntity.patient_type,
      targetDoctorId,
      targetDoctorName,
      service.id,
      service.name,
      appointmentDate,
      appointmentTime,
      holdExpiresAt,
      notes ? notes.trim() : null,
      nowIso,
      nowIso
    );

    db.exec('COMMIT;');

    console.log(`[RESERVATION] Slot held: ${bookingReference} for ${patientName.trim()} with ${targetDoctorName} on ${appointmentDate} at ${appointmentTime} (hold expires at ${holdExpiresAt})`);

    const apptObj = {
      bookingReference,
      doctorId: targetDoctorId,
      doctorName: targetDoctorName,
      serviceId: service.id,
      serviceName: service.name,
      appointmentDate,
      appointmentTime,
      displayTime: formatDisplayTime(appointmentTime),
      patientName: patientName.trim(),
      patientPhone: cleanPhone,
      status: 'HELD',
      paymentStatus: 'PENDING',
      paymentAmount: 500,
      holdExpiresAt,
      holdDurationSeconds: 600,
      token_number: null
    };

    sendJson(res, 201, {
      success: true,
      ...apptObj,
      appointment: apptObj
    });
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch (_) {}

    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return sendJson(res, 409, {
        error: 'That time is currently being reserved or already booked. Please choose another slot.',
        code: 'SLOT_UNAVAILABLE'
      });
    }

    console.error('[RESERVATION ERROR]', err);
    sendJson(res, 500, {
      error: 'Unable to reserve your slot right now. Please try again or contact the clinic.'
    });
  }
}

// 4c. POST /api/appointments/:reference/pay (Simulated demo payment confirmation)
async function handleDemoPayAppointment(req, res, reference) {
  let body = {};
  try {
    body = await parseJsonBody(req);
  } catch (_) {}

  // Lazily release expired holds
  releaseExpiredHolds();

  const { simulateFailure = false, paymentMethod = 'UPI' } = body;

  const appt = db.prepare('SELECT * FROM appointments WHERE booking_reference = ?').get(reference);
  if (!appt) {
    return sendJson(res, 404, { error: 'Appointment reservation not found. Please verify your reference.' });
  }

  if (appt.status === 'CONFIRMED') {
    return sendJson(res, 200, {
      success: true,
      message: 'Appointment is already confirmed.',
      bookingReference: appt.booking_reference,
      paymentReference: appt.payment_reference,
      paymentStatus: appt.payment_status,
      status: 'CONFIRMED',
      token_number: null
    });
  }

  if (appt.status === 'CANCELLED') {
    return sendJson(res, 400, {
      error: 'This slot reservation has been cancelled or has expired. Please select a slot again.',
      code: 'RESERVATION_CANCELLED'
    });
  }

  const now = Date.now();
  const nowIso = new Date().toISOString();

  // Check if hold has expired
  if (appt.hold_expires_at && new Date(appt.hold_expires_at).getTime() <= now) {
    db.prepare("UPDATE appointments SET status = 'CANCELLED', payment_status = 'FAILED', updated_at = ? WHERE booking_reference = ?")
      .run(nowIso, reference);
    return sendJson(res, 400, {
      error: 'Slot reservation hold has expired (10 minutes limit exceeded). Please choose another slot.',
      code: 'HOLD_EXPIRED'
    });
  }

  // Simulated Payment Failure Mode
  if (simulateFailure) {
    db.prepare("UPDATE appointments SET payment_status = 'FAILED', updated_at = ? WHERE booking_reference = ?")
      .run(nowIso, reference);
    return sendJson(res, 402, {
      success: false,
      error: 'Simulated payment failed (card declined or transaction rejected). You can retry payment before your 10-minute slot hold expires.',
      code: 'SIMULATED_PAYMENT_FAILED',
      bookingReference: reference,
      paymentStatus: 'FAILED'
    });
  }

  // Demo Payment Success
  const paymentReference = generatePaymentReference();

  db.prepare(`
    UPDATE appointments 
    SET status = 'CONFIRMED', payment_status = 'SUCCESS', payment_reference = ?, hold_expires_at = NULL, updated_at = ?
    WHERE booking_reference = ?
  `).run(paymentReference, nowIso, reference);

  console.log(`[PAYMENT] Demo payment succeeded: ${paymentReference} for booking ${reference} (${appt.patient_name}, Rs ${appt.payment_amount || 500})`);

  // Phase 5: Schedule automatic WhatsApp confirmation job
  try {
    scheduleCommunicationJob({
      patient_id: appt.patient_id,
      appointment_id: appt.id,
      template_id: 'tpl_appt_confirm',
      variables: {
        patient_name: appt.patient_name,
        doctor_name: appt.doctor_name,
        appointment_date: appt.appointment_date,
        appointment_time: formatDisplayTime(appt.appointment_time),
        booking_reference: reference
      },
      scheduled_for: nowIso,
      idempotency_key: `appt_confirm_${appt.id}`
    });
  } catch (schedErr) {
    console.warn('[SCHEDULER] Could not schedule confirmation communication job:', schedErr.message);
  }

  const apptObj = {
    bookingReference: reference,
    paymentReference,
    paymentStatus: 'SUCCESS',
    paymentAmount: appt.payment_amount || 500,
    status: 'CONFIRMED',
    doctorName: appt.doctor_name,
    serviceName: appt.service_name,
    appointmentDate: appt.appointment_date,
    appointmentTime: appt.appointment_time,
    displayTime: formatDisplayTime(appt.appointment_time),
    patientName: appt.patient_name,
    patientPhone: appt.patient_phone,
    token_number: null,
    clinicLocation: CLINIC_LOCATION,
    clinicPhone: CLINIC_PHONE
  };

  sendJson(res, 200, {
    success: true,
    ...apptObj,
    appointment: apptObj
  });
}

// 4d. POST /api/appointments/:reference/release-hold (Patient cancels slot hold voluntarily)
async function handleReleaseHoldAppointment(req, res, reference) {
  const row = db.prepare('SELECT id, status FROM appointments WHERE booking_reference = ?').get(reference);
  if (!row) {
    return sendJson(res, 404, { error: 'Reservation not found.' });
  }

  if (row.status === 'HELD') {
    const nowIso = new Date().toISOString();
    db.prepare("UPDATE appointments SET status = 'CANCELLED', payment_status = 'CANCELLED', updated_at = ? WHERE booking_reference = ?")
      .run(nowIso, reference);
    console.log(`[RESERVATION] Slot hold voluntarily released by patient: ${reference}`);
  }

  sendJson(res, 200, {
    success: true,
    message: 'Slot reservation released successfully.'
  });
}

// 5. GET /api/appointments/:reference
function handleGetAppointmentByRef(req, res, reference) {
  const row = db.prepare(`
    SELECT booking_reference, patient_name, patient_phone, patient_email, patient_type,
           doctor_name, service_name, appointment_date, appointment_time, status,
           payment_status, payment_reference, payment_amount, hold_expires_at,
           created_at
    FROM appointments 
    WHERE booking_reference = ?
  `).get(reference);

  if (!row) {
    return sendJson(res, 404, { error: 'Appointment not found. Please verify your booking reference.' });
  }

  sendJson(res, 200, {
    bookingReference: row.booking_reference,
    patientName: row.patient_name,
    patientPhone: row.patient_phone,
    patientEmail: row.patient_email,
    patientType: row.patient_type,
    doctorName: row.doctor_name,
    serviceName: row.service_name,
    appointmentDate: row.appointment_date,
    appointmentTime: row.appointment_time,
    displayTime: formatDisplayTime(row.appointment_time),
    status: row.status,
    paymentStatus: row.payment_status,
    paymentReference: row.payment_reference,
    paymentAmount: row.payment_amount,
    holdExpiresAt: row.hold_expires_at,
    clinicLocation: CLINIC_LOCATION,
    clinicPhone: CLINIC_PHONE
  });
}

// 6. POST /api/appointments/:reference/cancel (Requires phone number verification to prevent unauthorized cancellation)
async function handleCancelAppointment(req, res, reference) {
  let body = {};
  try {
    body = await parseJsonBody(req);
  } catch (_) {}

  const row = db.prepare('SELECT id, patient_id, patient_name, patient_phone, doctor_name, appointment_date, appointment_time, status FROM appointments WHERE booking_reference = ?').get(reference);
  if (!row) {
    return sendJson(res, 404, { error: 'Appointment not found.' });
  }

  if (row.status === 'CANCELLED') {
    return sendJson(res, 400, { error: 'Appointment is already cancelled.' });
  }

  // Verification: require mobile number matching the appointment
  const inputPhone = (body.phone || body.mobileNumber || '').toString().replace(/[\s\-\(\)]/g, '');
  const storedPhone = (row.patient_phone || '').toString().replace(/[\s\-\(\)]/g, '');

  if (!inputPhone || !storedPhone.endsWith(inputPhone.slice(-10))) {
    return sendJson(res, 403, {
      error: 'Please provide the registered mobile number to cancel this appointment.',
      code: 'VERIFICATION_REQUIRED'
    });
  }

  const nowIso = new Date().toISOString();
  db.prepare('UPDATE appointments SET status = ?, updated_at = ? WHERE booking_reference = ?')
    .run('CANCELLED', nowIso, reference);

  // Phase 5: Schedule automatic WhatsApp cancellation / change notification job
  try {
    let targetPatientId = row.patient_id;
    if (!targetPatientId) {
      const p = db.prepare('SELECT id FROM patients WHERE mobile = ? OR phone = ?').get(storedPhone.slice(-10), storedPhone);
      if (p) targetPatientId = p.id;
    }

    if (targetPatientId) {
      scheduleCommunicationJob({
        patient_id: targetPatientId,
        appointment_id: row.id,
        template_id: 'tpl_appt_change',
        job_type: 'APPOINTMENT_CANCEL',
        variables: {
          patient_name: row.patient_name,
          doctor_name: row.doctor_name,
          appointment_date: row.appointment_date,
          appointment_time: formatDisplayTime(row.appointment_time),
          booking_reference: reference
        },
        scheduled_for: nowIso,
        idempotency_key: `appt_cancel_${row.id}`
      });
    }
  } catch (schedErr) {
    console.warn('[SCHEDULER] Could not schedule cancellation notification job:', schedErr.message);
  }

  console.log(`[BOOKING] Appointment ${reference} cancelled after mobile verification.`);
  sendJson(res, 200, {
    success: true,
    message: 'Your appointment has been cancelled. The time slot is now open.'
  });
}

// 7. GET /api/appointments/:reference/calendar.ics
function handleCalendarIcs(req, res, reference) {
  const row = db.prepare(`
    SELECT booking_reference, patient_name, doctor_name, service_name, 
           appointment_date, appointment_time, status 
    FROM appointments 
    WHERE booking_reference = ?
  `).get(reference);

  if (!row) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
    return res.end('Appointment not found.');
  }

  const startUtc = formatIcsDateTime(row.appointment_date, row.appointment_time);
  const [h, m] = row.appointment_time.split(':').map(Number);
  const endMinutes = (m + 45) % 60;
  const endHours = h + Math.floor((m + 45) / 60);
  const endTimeStr = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
  const endUtc = formatIcsDateTime(row.appointment_date, endTimeStr);

  const phoneDesc = CLINIC_PHONE ? `\\nPhone: ${CLINIC_PHONE}` : '';
  const isCancelled = row.status === 'CANCELLED';
  const clinicTitle = clinicConfig.clinicName || 'Apex Dental Studio';
  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${clinicTitle}//Appointment Booking Engine//EN`,
    'CALSCALE:GREGORIAN',
    isCancelled ? 'METHOD:CANCEL' : 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${row.booking_reference}@apexdentaldemo.com`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    `DTSTART:${startUtc}`,
    `DTEND:${endUtc}`,
    `SUMMARY:${clinicTitle}: ${row.service_name} with ${row.doctor_name}${isCancelled ? ' (CANCELLED)' : ''}`,
    `DESCRIPTION:Booking Reference: ${row.booking_reference}\\nPatient: ${row.patient_name}\\nDoctor: ${row.doctor_name}\\nService: ${row.service_name}\\nClinic: ${clinicTitle}, ${CLINIC_LOCATION}${phoneDesc}`,
    `LOCATION:${clinicTitle}\\, ${CLINIC_LOCATION.replace(/,/g, '\\,')}`,
    isCancelled ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  const icsContent = icsLines.join('\r\n');

  res.writeHead(200, {
    'Content-Type': 'text/calendar; charset=UTF-8',
    'Content-Disposition': `attachment; filename="Appointment-${row.booking_reference}.ics"`,
    'Content-Length': Buffer.byteLength(icsContent)
  });
  res.end(icsContent);
}

// ============================================================================
// Phase 3 Internal Dashboard & Queue Handlers
// ============================================================================

/**
 * Validates staff authentication from session token or authorized dev header.
 * Prevents unauthorized or spoofed access in production.
 */
function getStaffAuth(req) {
  // 1. Check for real staff session token (Bearer token or X-Staff-Token)
  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-staff-token']) {
    token = req.headers['x-staff-token'].trim();
  }

  if (token) {
    const session = getStaffSession(token);
    if (session) {
      return {
        isAuthenticated: true,
        staffId: session.staff_id,
        staffName: session.staff_name,
        role: session.role, // 'reception', 'dentist', 'owner'
        doctorId: session.doctor_id
      };
    }
  }

  // 2. Reject explicit patient role immediately
  const roleHeader = req.headers['x-clinic-role'];
  if (roleHeader && roleHeader.toLowerCase().trim() === 'patient') {
    return { isAuthenticated: false, role: 'patient' };
  }

  // 3. Allow dev role switching ONLY if explicitly configured in non-production mode
  const isDevAllowed = process.env.NODE_ENV === 'development' || process.env.ALLOW_DEV_ROLE === 'true';
  if (isDevAllowed && roleHeader) {
    const clean = roleHeader.toLowerCase().trim();
    if (clean === 'reception') {
      return { isAuthenticated: true, staffId: 'dev_reception', staffName: 'Dev Receptionist', role: 'reception', doctorId: null };
    }
    if (clean === 'doctor-anuj' || clean === 'dentist_anuj' || clean === 'dentist-anuj' || clean === 'doctor-aryan' || clean === 'aryan') {
      return { isAuthenticated: true, staffId: 'doc_anuj_kumar', staffName: 'Dr. Aryan Sharma', role: 'dentist', doctorId: 'doc_anuj_kumar' };
    }
    if (clean === 'doctor-vandana' || clean === 'dentist_vandana' || clean === 'dentist-vandana' || clean === 'doctor-priya' || clean === 'priya' || clean === 'doctor-yashika' || clean === 'dentist_yashika' || clean === 'dentist-yashika' || clean === 'yashika') {
      return { isAuthenticated: true, staffId: 'doc_vandana_choudhary', staffName: 'Dr. Priya Mehta', role: 'dentist', doctorId: 'doc_vandana_choudhary' };
    }
    if (clean === 'owner') {
      return { isAuthenticated: true, staffId: 'dev_owner', staffName: 'Dev Clinic Owner', role: 'owner', doctorId: null };
    }
  }

  return { isAuthenticated: false, role: 'unauthenticated' };
}

// 7. POST /api/auth/staff-login
async function handleStaffLogin(req, res) {
  try {
    const body = await parseJsonBody(req);
    const pin = body.pin || '';
    const authResult = authenticateStaff(pin);
    if (!authResult) {
      return sendJson(res, 401, {
        error: 'Invalid staff passcode. Please verify your PIN and try again.',
        code: 'INVALID_CREDENTIALS'
      });
    }

    sendJson(res, 200, {
      success: true,
      token: authResult.token,
      staffName: authResult.staffName,
      role: authResult.role,
      doctorId: authResult.doctorId,
      expiresAt: authResult.expiresAt
    });
  } catch (err) {
    sendJson(res, 400, { error: 'Invalid login request.', code: 'BAD_REQUEST' });
  }
}

// 8. POST /api/auth/staff-logout
function handleStaffLogout(req, res) {
  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-staff-token']) {
    token = req.headers['x-staff-token'].trim();
  }

  if (token) {
    revokeStaffSession(token);
  }
  sendJson(res, 200, { success: true, message: 'Logged out successfully.' });
}

// 9. GET /api/auth/me
function handleStaffMe(req, res) {
  const auth = getStaffAuth(req);
  if (!auth.isAuthenticated) {
    return sendJson(res, 401, { authenticated: false, error: 'Not authenticated.', code: 'UNAUTHORIZED' });
  }
  sendJson(res, 200, {
    authenticated: true,
    staffName: auth.staffName,
    role: auth.role,
    doctorId: auth.doctorId
  });
}

// 10. GET /api/dashboard/today
function handleGetDashboardToday(req, res, query) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') {
    return sendJson(res, 403, { error: 'Access denied. Internal clinic staff only.', code: 'FORBIDDEN' });
  }
  if (!auth.isAuthenticated) {
    return sendJson(res, 401, { error: 'Authentication required. Please log in with your staff PIN.', code: 'UNAUTHORIZED' });
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const dateStr = query.date || todayStr;

  // STRICT RULE: No automatic demo seeding on query!

  // Calculate operational counts (excluding temporary unpaid slot holds)
  const totalAppts = db.prepare("SELECT COUNT(*) as c FROM appointments WHERE appointment_date = ? AND status != 'HELD'").get(dateStr).c;
  const waitingCount = db.prepare(`SELECT COUNT(*) as c FROM queue_entries WHERE queue_date = ? AND status = 'WAITING'`).get(dateStr).c;
  const inConsultationCount = db.prepare(`SELECT COUNT(*) as c FROM queue_entries WHERE queue_date = ? AND status = 'IN_CONSULTATION'`).get(dateStr).c;
  const completedCount = db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE appointment_date = ? AND status = 'COMPLETED'`).get(dateStr).c;
  const noShowCount = db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE appointment_date = ? AND status = 'NO_SHOW'`).get(dateStr).c;
  const cancelledCount = db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE appointment_date = ? AND status = 'CANCELLED'`).get(dateStr).c;

  // Query practitioners - STRICT: NO operatory fields
  let docQuery = 'SELECT id, full_name, specialization FROM practitioners WHERE is_active = 1';
  const docParams = [];
  if (auth.role === 'dentist' && auth.doctorId) {
    docQuery += ' AND id = ?';
    docParams.push(auth.doctorId);
  }
  docQuery += ' ORDER BY id';

  const doctors = db.prepare(docQuery).all(...docParams);

  const doctorStates = doctors.map(doc => {
    const current = db.prepare(`
      SELECT q.id, q.token_display, q.token_number, q.patient_name, q.service_name, q.arrival_time, q.called_at, q.booking_reference, a.patient_id
      FROM queue_entries q
      LEFT JOIN appointments a ON q.appointment_id = a.id
      WHERE q.queue_date = ? AND q.doctor_id = ? AND q.status = 'IN_CONSULTATION'
      ORDER BY q.called_at DESC
      LIMIT 1
    `).get(dateStr, doc.id);

    const next = db.prepare(`
      SELECT q.id, q.token_display, q.token_number, q.patient_name, q.service_name, q.arrival_time, q.booking_reference, a.patient_id
      FROM queue_entries q
      LEFT JOIN appointments a ON q.appointment_id = a.id
      WHERE q.queue_date = ? AND q.doctor_id = ? AND q.status = 'WAITING'
      ORDER BY q.token_number ASC
      LIMIT 1
    `).get(dateStr, doc.id);

    const queueDepth = db.prepare(`
      SELECT COUNT(*) as c 
      FROM queue_entries 
      WHERE queue_date = ? AND doctor_id = ? AND status = 'WAITING'
    `).get(dateStr, doc.id).c;

    return {
      doctorId: doc.id,
      doctorName: doc.full_name,
      specialization: doc.specialization,
      currentPatient: current || null,
      nextPatient: next || null,
      queueDepth
    };
  });

  sendJson(res, 200, {
    success: true,
    date: dateStr,
    isToday: dateStr === todayStr,
    user: {
      staffName: auth.staffName,
      role: auth.role,
      doctorId: auth.doctorId
    },
    metrics: {
      totalAppointments: totalAppts,
      waiting: waitingCount,
      inConsultation: inConsultationCount,
      completed: completedCount,
      noShow: noShowCount,
      cancelled: cancelledCount
    },
    counts: {
      total: totalAppts,
      waiting: waitingCount,
      inConsultation: inConsultationCount,
      completed: completedCount,
      noShow: noShowCount,
      cancelled: cancelledCount
    },
    doctors: doctorStates,
    doctorStates,
    clinicStatus: 'OPEN'
  });
}

// 11. GET /api/dashboard/appointments
function handleGetDashboardAppointments(req, res, query) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') {
    return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  }
  if (!auth.isAuthenticated) {
    return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const dateStr = query.date || todayStr;
  let doctorId = query.doctorId || query.doctor;
  const status = query.status;

  // Dentist isolation: dentist can ONLY view their own appointments
  if (auth.role === 'dentist' && auth.doctorId) {
    doctorId = auth.doctorId;
  }

  let sql = `
    SELECT 
      a.id, a.patient_id, a.booking_reference, a.patient_name, a.patient_phone, a.patient_email, a.patient_type,
      a.doctor_id, a.doctor_name, a.service_id, a.service_name, a.appointment_date, a.appointment_time,
      a.status as appointment_status, a.token_number, a.notes, a.is_demo,
      q.id as queue_id, q.token_display, q.status as queue_status, q.arrival_time, q.called_at, q.completed_at
    FROM appointments a
    LEFT JOIN queue_entries q ON a.id = q.appointment_id
    WHERE a.appointment_date = ? AND a.status != 'HELD'
  `;
  const params = [dateStr];

  if (doctorId && doctorId !== 'all') {
    sql += ` AND a.doctor_id = ?`;
    params.push(doctorId);
  }

  if (status && status !== 'ALL') {
    if (status === 'WAITING' || status === 'IN_CONSULTATION') {
      sql += ` AND q.status = ?`;
      params.push(status);
    } else {
      sql += ` AND a.status = ?`;
      params.push(status);
    }
  }

  sql += ` ORDER BY a.appointment_time ASC, q.token_number ASC`;

  const appointments = db.prepare(sql).all(...params).map(a => ({
    ...a,
    displayTime: formatDisplayTime(a.appointment_time),
    effectiveStatus: a.queue_status || a.appointment_status
  }));

  sendJson(res, 200, {
    success: true,
    date: dateStr,
    count: appointments.length,
    appointments
  });
}

// 12. POST /api/appointments/:reference/check-in
async function handleCheckInAppointment(req, res, reference, query) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') {
    return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  }
  if (!auth.isAuthenticated) {
    return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });
  }

  // Owners have read-only operational oversight
  if (auth.role === 'owner') {
    return sendJson(res, 403, { error: 'Owner role has read-only operational oversight; check-in must be handled by reception staff.', code: 'FORBIDDEN' });
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const clinicDate = (query && query.date) || todayStr;

  try {
    const result = checkInPatientAtomic(reference, clinicDate);
    if (result.alreadyCheckedIn) {
      return sendJson(res, 200, {
        success: true,
        alreadyCheckedIn: true,
        message: `Patient is already checked in with token ${result.tokenDisplay}.`,
        queueId: result.queueId,
        tokenDisplay: result.tokenDisplay,
        tokenNumber: result.tokenNumber,
        status: result.queueStatus,
        bookingReference: result.appointment.booking_reference,
        patientName: result.appointment.patient_name,
        doctorName: result.appointment.doctor_name
      });
    }

    console.log(`[QUEUE] Patient ${result.appointment.patient_name} checked in: Token ${result.tokenDisplay} for ${result.appointment.doctor_name}`);

    sendJson(res, 200, {
      success: true,
      alreadyCheckedIn: false,
      queueId: result.queueId,
      tokenNumber: result.tokenNumber,
      tokenDisplay: result.tokenDisplay,
      bookingReference: result.appointment.booking_reference,
      patientName: result.appointment.patient_name,
      doctorName: result.appointment.doctor_name,
      status: 'WAITING',
      arrivalTime: result.appointment.arrival_time
    });
  } catch (err) {
    const msg = err.message || 'Failed to check in patient.';
    const statusCode = msg.includes('not found') ? 404 : 400;
    sendJson(res, statusCode, { error: msg, code: 'CHECK_IN_ERROR' });
  }
}

// 13. POST /api/queue/:id/call
async function handleCallQueuePatient(req, res, queueId) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') {
    return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  }
  if (!auth.isAuthenticated) {
    return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });
  }

  if (auth.role === 'owner') {
    return sendJson(res, 403, { error: 'Owner has read-only operational oversight; consultation actions must be initiated by clinical staff.', code: 'FORBIDDEN' });
  }

  const q = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(queueId);
  if (!q) {
    return sendJson(res, 404, { error: 'Queue entry not found.', code: 'NOT_FOUND' });
  }

  // Dentist isolation: Dentist can only operate their own queue
  if (auth.role === 'dentist' && auth.doctorId && q.doctor_id !== auth.doctorId) {
    return sendJson(res, 403, { error: 'You are only authorized to call patients assigned to your queue.', code: 'ROLE_MISMATCH' });
  }

  if (q.status !== 'WAITING') {
    return sendJson(res, 400, {
      error: `Invalid transition: patient is currently '${q.status}', cannot call unless 'WAITING'.`,
      code: 'INVALID_TRANSITION'
    });
  }

  const nowIso = new Date().toISOString();
  try {
    db.exec('BEGIN IMMEDIATE;');

    db.prepare(`
      UPDATE queue_entries 
      SET status = 'IN_CONSULTATION', called_at = ?, updated_at = ? 
      WHERE id = ?
    `).run(nowIso, nowIso, queueId);

    db.prepare(`
      UPDATE appointments 
      SET consultation_start_time = ?, updated_at = ? 
      WHERE id = ?
    `).run(nowIso, nowIso, q.appointment_id);

    db.exec('COMMIT;');

    console.log(`[QUEUE] Token ${q.token_display} called into consultation with ${q.doctor_name}`);

    sendJson(res, 200, {
      success: true,
      queueId,
      tokenDisplay: q.token_display,
      doctorName: q.doctor_name,
      patientName: q.patient_name,
      status: 'IN_CONSULTATION',
      calledAt: nowIso
    });
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    console.error('[CALL ERROR]', err);
    sendJson(res, 500, { error: 'Failed to call patient.' });
  }
}

// 14. POST /api/queue/:id/complete
async function handleCompleteQueuePatient(req, res, queueId) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') {
    return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  }
  if (!auth.isAuthenticated) {
    return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });
  }

  if (auth.role === 'owner') {
    return sendJson(res, 403, { error: 'Owner has read-only operational oversight.', code: 'FORBIDDEN' });
  }

  const q = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(queueId);
  if (!q) {
    return sendJson(res, 404, { error: 'Queue entry not found.', code: 'NOT_FOUND' });
  }

  // Dentist isolation
  if (auth.role === 'dentist' && auth.doctorId && q.doctor_id !== auth.doctorId) {
    return sendJson(res, 403, { error: 'You are only authorized to complete patients assigned to your queue.', code: 'ROLE_MISMATCH' });
  }

  if (q.status !== 'IN_CONSULTATION') {
    return sendJson(res, 400, {
      error: `Invalid transition: patient is currently '${q.status}', cannot complete unless 'IN_CONSULTATION'.`,
      code: 'INVALID_TRANSITION'
    });
  }

  const nowIso = new Date().toISOString();
  try {
    db.exec('BEGIN IMMEDIATE;');

    db.prepare(`
      UPDATE queue_entries 
      SET status = 'COMPLETED', completed_at = ?, updated_at = ? 
      WHERE id = ?
    `).run(nowIso, nowIso, queueId);

    db.prepare(`
      UPDATE appointments 
      SET status = 'COMPLETED', completion_time = ?, updated_at = ? 
      WHERE id = ?
    `).run(nowIso, nowIso, q.appointment_id);

    db.exec('COMMIT;');

    console.log(`[QUEUE] Token ${q.token_display} completed consultation with ${q.doctor_name}`);

    sendJson(res, 200, {
      success: true,
      queueId,
      tokenDisplay: q.token_display,
      status: 'COMPLETED',
      completedAt: nowIso
    });
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    console.error('[COMPLETE ERROR]', err);
    sendJson(res, 500, { error: 'Failed to complete consultation.' });
  }
}

// 15. POST /api/queue/:id/no-show
async function handleNoShowQueuePatient(req, res, queueId) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') {
    return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  }
  if (!auth.isAuthenticated) {
    return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });
  }

  if (auth.role === 'owner') {
    return sendJson(res, 403, { error: 'Owner has read-only operational oversight.', code: 'FORBIDDEN' });
  }

  const q = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(queueId);
  if (!q) {
    return sendJson(res, 404, { error: 'Queue entry not found.', code: 'NOT_FOUND' });
  }

  // Dentist isolation
  if (auth.role === 'dentist' && auth.doctorId && q.doctor_id !== auth.doctorId) {
    return sendJson(res, 403, { error: 'You are only authorized to update patients assigned to your queue.', code: 'ROLE_MISMATCH' });
  }

  if (q.status === 'COMPLETED') {
    return sendJson(res, 400, { error: 'Completed consultations cannot be marked as No-Show.', code: 'INVALID_TRANSITION' });
  }

  const nowIso = new Date().toISOString();
  try {
    db.exec('BEGIN IMMEDIATE;');

    db.prepare(`UPDATE queue_entries SET status = 'NO_SHOW', updated_at = ? WHERE id = ?`).run(nowIso, queueId);
    db.prepare(`UPDATE appointments SET status = 'NO_SHOW', updated_at = ? WHERE id = ?`).run(nowIso, q.appointment_id);

    db.exec('COMMIT;');

    sendJson(res, 200, {
      success: true,
      queueId,
      tokenDisplay: q.token_display,
      status: 'NO_SHOW'
    });
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    sendJson(res, 500, { error: 'Failed to update status to No-Show.' });
  }
}

// 16. GET /api/queue
function handleGetLiveQueue(req, res, query) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') {
    return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  }
  if (!auth.isAuthenticated) {
    return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const dateStr = query.date || todayStr;
  let doctorId = query.doctorId || query.doctor;

  // Dentist isolation: dentist can only query their own queue
  if (auth.role === 'dentist' && auth.doctorId) {
    doctorId = auth.doctorId;
  }

  let sql = `
    SELECT q.*, a.patient_id 
    FROM queue_entries q
    LEFT JOIN appointments a ON q.appointment_id = a.id
    WHERE q.queue_date = ?
  `;
  const params = [dateStr];

  if (doctorId && doctorId !== 'all') {
    sql += ` AND q.doctor_id = ?`;
    params.push(doctorId);
  }

  sql += `
    ORDER BY 
      CASE q.status 
        WHEN 'IN_CONSULTATION' THEN 1 
        WHEN 'WAITING' THEN 2 
        WHEN 'COMPLETED' THEN 3 
        WHEN 'NO_SHOW' THEN 4 
        ELSE 5 
      END,
      q.token_number ASC
  `;

  const queue = db.prepare(sql).all(...params);
  sendJson(res, 200, {
    success: true,
    date: dateStr,
    count: queue.length,
    queue
  });
}

// 17. GET /api/dashboard/search
function handleDashboardSearch(req, res, query) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') {
    return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  }
  if (!auth.isAuthenticated) {
    return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });
  }

  const q = (query.q || '').trim();
  if (q.length < 2) {
    return sendJson(res, 400, { error: 'Search query must be at least 2 characters.' });
  }

  const likePattern = `%${q}%`;
  const results = db.prepare(`
    SELECT 
      a.id, a.patient_id, a.booking_reference, a.patient_name, a.patient_phone, a.patient_type,
      a.doctor_name, a.service_name, a.appointment_date, a.appointment_time,
      a.status as appointment_status, a.token_number,
      q.id as queue_id, q.token_display, q.status as queue_status
    FROM appointments a
    LEFT JOIN queue_entries q ON a.id = q.appointment_id
    WHERE a.patient_name LIKE ? 
       OR a.patient_phone LIKE ? 
       OR a.booking_reference LIKE ?
    ORDER BY a.appointment_date DESC, a.appointment_time DESC
    LIMIT 20
  `).all(likePattern, likePattern, likePattern).map(r => ({
    ...r,
    displayTime: formatDisplayTime(r.appointment_time),
    status: r.queue_status || r.appointment_status
  }));

  sendJson(res, 200, {
    success: true,
    query: q,
    count: results.length,
    results
  });
}

// 18. POST /api/dashboard/seed-demo (Explicit Manual Demo Seeding Utility)
function handleSeedDemo(req, res) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') {
    return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  }
  if (!auth.isAuthenticated) {
    return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const seeded = seedDemoQueueData(todayStr);
  sendJson(res, 200, {
    success: true,
    seeded,
    message: seeded ? 'Demo queue data seeded successfully (tagged is_demo = 1).' : 'Appointments already exist for today. Seeding skipped.'
  });
}

// ============================================================================
// Phase 4 Patient Profile & Clinical Workflow Handlers
// ============================================================================

// 1. GET /api/patients
function handleGetPatients(req, res, query) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  const q = query.q || '';
  const limit = parseInt(query.limit, 10) || 50;
  const patients = searchPatients(q, limit);
  sendJson(res, 200, { patients });
}

// 2. POST /api/patients
async function handleCreatePatient(req, res) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });
  if (auth.role === 'owner') return sendJson(res, 403, { error: 'Owner role has read-only access.', code: 'FORBIDDEN' });

  try {
    const body = await parseJsonBody(req);
    const patient = createPatient(body);
    sendJson(res, 201, { success: true, patient });
  } catch (err) {
    sendJson(res, 400, { error: err.message || 'Failed to create patient.', code: 'BAD_REQUEST' });
  }
}

// 3. GET /api/patients/:id
function handleGetPatient(req, res, id) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  const patient = getPatientById(id);
  if (!patient) return sendJson(res, 404, { error: 'Patient not found.', code: 'NOT_FOUND' });

  sendJson(res, 200, { patient });
}

// 4. PATCH /api/patients/:id
async function handleUpdatePatient(req, res, id) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });
  if (auth.role === 'owner') return sendJson(res, 403, { error: 'Owner role has read-only access.', code: 'FORBIDDEN' });

  try {
    const body = await parseJsonBody(req);
    if ((body.dentist_entered_alerts !== undefined || body.medical_alerts !== undefined) && auth.role !== 'dentist') {
      return sendJson(res, 403, { error: 'Only dentists can modify clinician alerts.', code: 'CLINICAL_ACCESS_RESTRICTED' });
    }

    const patient = updatePatientDemographics(id, body, auth);
    if (!patient) return sendJson(res, 404, { error: 'Patient not found.', code: 'NOT_FOUND' });
    sendJson(res, 200, { success: true, patient });
  } catch (err) {
    sendJson(res, 400, { error: err.message || 'Failed to update patient.', code: 'BAD_REQUEST' });
  }
}

// 5. GET /api/patients/:id/appointments
function handleGetPatientAppointments(req, res, id) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  const patient = getPatientById(id);
  if (!patient) return sendJson(res, 404, { error: 'Patient not found.', code: 'NOT_FOUND' });

  const appointments = getPatientAppointments(patient.id);
  sendJson(res, 200, { appointments });
}

// 6. GET /api/patients/:id/timeline
function handleGetPatientTimeline(req, res, id) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  const patient = getPatientById(id);
  if (!patient) return sendJson(res, 404, { error: 'Patient not found.', code: 'NOT_FOUND' });

  const events = getPatientTimeline(patient.id);
  sendJson(res, 200, { events });
}

// 7. GET /api/patients/:id/odontogram
function handleGetPatientOdontogram(req, res, id, query) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  const patient = getPatientById(id);
  if (!patient) return sendJson(res, 404, { error: 'Patient not found.', code: 'NOT_FOUND' });

  const includeArchived = query.includeArchived === 'true';
  const findings = getOdontogramFindings(patient.id, includeArchived);
  sendJson(res, 200, { 
    findings,
    taxonomy: PROTOTYPE_FINDING_TAXONOMY 
  });
}

// 7b. GET /api/clinical/taxonomy
function handleGetClinicalTaxonomy(req, res) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  sendJson(res, 200, {
    success: true,
    isPrototype: true,
    disclaimer: 'This finding taxonomy is a provisional prototype pending clinician confirmation. Do not present as official clinic diagnostic vocabulary.',
    taxonomy: PROTOTYPE_FINDING_TAXONOMY
  });
}

// 8. POST /api/patients/:id/odontogram/findings
async function handleRecordOdontogramFinding(req, res, id) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });
  if (auth.role !== 'dentist') {
    return sendJson(res, 403, { error: 'Only dentists are authorized to record odontogram findings.', code: 'CLINICAL_ACCESS_RESTRICTED' });
  }

  const patient = getPatientById(id);
  if (!patient) return sendJson(res, 404, { error: 'Patient not found.', code: 'NOT_FOUND' });

  try {
    const body = await parseJsonBody(req);
    const toothNumber = body.toothNumber !== undefined ? body.toothNumber : body.tooth_number;
    const surface = body.surface;

    if (!isValidFdiTooth(toothNumber)) {
      const toothZeroMsg = (toothNumber === 0 || toothNumber === '0') ? ' Tooth 0 is not permitted.' : '';
      return sendJson(res, 400, { 
        error: `Invalid FDI tooth number: ${toothNumber}. Adult FDI dentition must be between 11-18, 21-28, 31-38, or 41-48.${toothZeroMsg}`, 
        code: 'INVALID_TOOTH_NUMBER' 
      });
    }

    if (!isValidSurface(surface)) {
      return sendJson(res, 400, { 
        error: `Invalid surface: ${surface}. Allowed surfaces are: MESIAL, DISTAL, OCCLUSAL, BUCCAL, LINGUAL, WHOLE_TOOTH.`, 
        code: 'INVALID_SURFACE' 
      });
    }

    const finding = recordOdontogramFinding({
      patientId: patient.id,
      appointmentId: body.appointmentId || body.appointment_id,
      toothNumber,
      surface,
      findingType: body.findingType || body.finding_type,
      severity: body.severity,
      notes: body.notes,
      recordedBy: auth.doctorId || auth.staffId,
      dentistName: auth.staffName
    });

    sendJson(res, 201, { success: true, finding });
  } catch (err) {
    sendJson(res, 400, { error: err.message || 'Failed to record odontogram finding.', code: err.code || 'BAD_REQUEST' });
  }
}

// 9. POST /api/odontogram/findings/:id/archive & DELETE (Soft audit archival, never hard delete)
function handleArchiveOdontogramFinding(req, res, findingId) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });
  if (auth.role !== 'dentist') {
    return sendJson(res, 403, { error: 'Only dentists can archive clinical findings.', code: 'CLINICAL_ACCESS_RESTRICTED' });
  }

  const archived = archiveOdontogramFinding(findingId, auth.staffName);
  if (!archived) return sendJson(res, 404, { error: 'Finding not found.', code: 'NOT_FOUND' });

  sendJson(res, 200, { success: true, archived: true, finding: archived });
}

// 10. GET /api/patients/:id/notes
function handleGetClinicalNotes(req, res, id) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  const patient = getPatientById(id);
  if (!patient) return sendJson(res, 404, { error: 'Patient not found.', code: 'NOT_FOUND' });

  const notes = getClinicalNotes(patient.id);
  sendJson(res, 200, { notes });
}

// 11. POST /api/patients/:id/notes
async function handleCreateClinicalNote(req, res, id) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });
  if (auth.role !== 'dentist') {
    return sendJson(res, 403, { error: 'Only dentists are authorized to author clinical notes.', code: 'CLINICAL_ACCESS_RESTRICTED' });
  }

  const patient = getPatientById(id);
  if (!patient) return sendJson(res, 404, { error: 'Patient not found.', code: 'NOT_FOUND' });

  try {
    const body = await parseJsonBody(req);
    const note = createClinicalNote({
      patientId: patient.id,
      appointmentId: body.appointmentId || body.appointment_id,
      noteType: body.noteType || body.note_type || 'CONSULTATION',
      chiefComplaint: body.chiefComplaint || body.chief_complaint,
      clinicalObservations: body.clinicalObservations || body.clinical_observations,
      dentistEnteredDiagnosis: body.dentistEnteredDiagnosis || body.dentist_entered_diagnosis || body.diagnosis,
      advice: body.advice || body.planNotes || body.plan_notes,
      content: body.content,
      dentistId: auth.doctorId || auth.staffId,
      dentistName: auth.staffName
    });

    sendJson(res, 201, { success: true, note });
  } catch (err) {
    sendJson(res, 400, { error: err.message || 'Failed to record clinical note.', code: 'BAD_REQUEST' });
  }
}

// 12. PATCH /api/notes/:id (Cross-dentist overwrite protection)
async function handleUpdateClinicalNote(req, res, noteId) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });
  if (auth.role !== 'dentist') {
    return sendJson(res, 403, { error: 'Only dentists can edit clinical notes.', code: 'CLINICAL_ACCESS_RESTRICTED' });
  }

  const existing = db.prepare('SELECT * FROM clinical_notes WHERE id = ?').get(noteId);
  if (!existing) return sendJson(res, 404, { error: 'Clinical note not found.', code: 'NOT_FOUND' });

  if (existing.dentist_id !== auth.doctorId && existing.dentist_id !== auth.staffId) {
    return sendJson(res, 403, { 
      error: `A dentist cannot overwrite another dentist's authored clinical note. Original author: ${existing.dentist_name}`, 
      code: 'CROSS_DENTIST_EDIT_FORBIDDEN' 
    });
  }

  try {
    const body = await parseJsonBody(req);
    const nowIso = new Date().toISOString();
    const updatedContent = body.content || existing.content;
    const updatedObservations = body.clinical_observations !== undefined ? body.clinical_observations : existing.clinical_observations;
    const updatedAdvice = body.advice !== undefined ? body.advice : existing.advice;

    db.prepare(`
      UPDATE clinical_notes 
      SET content = ?, clinical_observations = ?, advice = ?, updated_at = ?
      WHERE id = ?
    `).run(updatedContent, updatedObservations, updatedAdvice, nowIso, noteId);

    const updated = db.prepare('SELECT * FROM clinical_notes WHERE id = ?').get(noteId);
    sendJson(res, 200, { success: true, note: updated });
  } catch (err) {
    sendJson(res, 400, { error: err.message || 'Failed to update note.', code: 'BAD_REQUEST' });
  }
}

// 13. GET /api/patients/:id/treatment-plans
function handleGetTreatmentPlans(req, res, id) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  const patient = getPatientById(id);
  if (!patient) return sendJson(res, 404, { error: 'Patient not found.', code: 'NOT_FOUND' });

  const plans = getTreatmentPlans(patient.id);
  sendJson(res, 200, { plans });
}

// 14. POST /api/patients/:id/treatment-plans
async function handleCreateTreatmentPlan(req, res, id) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });
  if (auth.role !== 'dentist') {
    return sendJson(res, 403, { error: 'Only dentists can create treatment plans.', code: 'CLINICAL_ACCESS_RESTRICTED' });
  }

  const patient = getPatientById(id);
  if (!patient) return sendJson(res, 404, { error: 'Patient not found.', code: 'NOT_FOUND' });

  try {
    const body = await parseJsonBody(req);
    const toothNumber = body.toothNumber !== undefined ? body.toothNumber : (body.tooth_number !== undefined ? body.tooth_number : (Array.isArray(body.teethInvolved) ? body.teethInvolved[0] : undefined));
    if (toothNumber && !isValidFdiTooth(toothNumber)) {
      return sendJson(res, 400, { 
        error: `Invalid FDI tooth number for treatment plan: ${toothNumber}`, 
        code: 'INVALID_TOOTH_NUMBER' 
      });
    }

    const plan = createTreatmentPlan({
      patientId: patient.id,
      appointmentId: body.appointmentId || body.appointment_id,
      procedureName: body.procedureName || body.procedure_name || body.title,
      serviceId: body.serviceId || body.service_id,
      toothNumber,
      priority: body.priority,
      notes: body.notes || body.description,
      dentistId: auth.doctorId || auth.staffId,
      dentistName: auth.staffName
    });

    sendJson(res, 201, { success: true, plan });
  } catch (err) {
    sendJson(res, 400, { error: err.message || 'Failed to create treatment plan.', code: err.code || 'BAD_REQUEST' });
  }
}

// 15. PATCH /api/treatment-plans/:id
async function handleUpdateTreatmentPlan(req, res, planId) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });
  if (auth.role !== 'dentist') {
    return sendJson(res, 403, { error: 'Only dentists can update treatment plans.', code: 'CLINICAL_ACCESS_RESTRICTED' });
  }

  try {
    const body = await parseJsonBody(req);
    const updated = updateTreatmentPlanStatus(planId, body.status);
    if (!updated) return sendJson(res, 404, { error: 'Treatment plan not found.', code: 'NOT_FOUND' });
    sendJson(res, 200, { success: true, plan: updated });
  } catch (err) {
    sendJson(res, 400, { error: err.message || 'Failed to update treatment plan.', code: 'BAD_REQUEST' });
  }
}

// 16. GET /api/patients/:id/treatment-records
function handleGetTreatmentRecords(req, res, id) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  const patient = getPatientById(id);
  if (!patient) return sendJson(res, 404, { error: 'Patient not found.', code: 'NOT_FOUND' });

  const records = getTreatmentRecords(patient.id);
  sendJson(res, 200, { records });
}

// 17. POST /api/treatment-records & POST /api/patients/:id/treatment-records
async function handleRecordPerformedTreatment(req, res, urlPatientId) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });
  if (auth.role !== 'dentist') {
    return sendJson(res, 403, { error: 'Only dentists can record performed treatments.', code: 'CLINICAL_ACCESS_RESTRICTED' });
  }

  try {
    const body = await parseJsonBody(req);
    const patientId = urlPatientId || body.patientId || body.patient_id;
    const toothNumber = body.toothNumber !== undefined ? body.toothNumber : (body.tooth_number !== undefined ? body.tooth_number : (Array.isArray(body.teethInvolved) ? body.teethInvolved[0] : undefined));

    if (toothNumber && !isValidFdiTooth(toothNumber)) {
      return sendJson(res, 400, { error: `Invalid FDI tooth number: ${toothNumber}`, code: 'INVALID_TOOTH_NUMBER' });
    }

    const surfacesTreated = body.surfacesTreated || body.surfaces_treated || (Array.isArray(body.surfacesInvolved) ? body.surfacesInvolved.join(',') : body.surfacesInvolved);

    const record = recordPerformedTreatment({
      patientId,
      appointmentId: body.appointmentId || body.appointment_id,
      treatmentPlanId: body.treatmentPlanId || body.treatment_plan_id || body.planId || body.plan_id,
      procedureName: body.procedureName || body.procedure_name,
      toothNumber,
      surfacesTreated,
      materialsUsed: body.materialsUsed || body.materials_used,
      clinicalNotes: body.clinicalNotes || body.clinical_notes || body.notes,
      performedDate: body.performedDate || body.performed_date,
      dentistId: auth.doctorId || auth.staffId,
      dentistName: auth.staffName
    });

    sendJson(res, 201, { success: true, record });
  } catch (err) {
    sendJson(res, 400, { error: err.message || 'Failed to record performed treatment.', code: err.code || 'BAD_REQUEST' });
  }
}

// 18. GET /api/patients/:id/prescriptions
function handleGetPatientPrescriptions(req, res, id) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  const patient = getPatientById(id);
  if (!patient) return sendJson(res, 404, { error: 'Patient not found.', code: 'NOT_FOUND' });

  const prescriptions = getPrescriptions(patient.id);
  sendJson(res, 200, { prescriptions });
}

// 19. POST /api/patients/:id/prescriptions (Immutable once issued)
async function handleCreatePrescription(req, res, id) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });
  if (auth.role !== 'dentist') {
    return sendJson(res, 403, { error: 'Only dentists are authorized to issue prescriptions.', code: 'CLINICAL_ACCESS_RESTRICTED' });
  }

  const patient = getPatientById(id);
  if (!patient) return sendJson(res, 404, { error: 'Patient not found.', code: 'NOT_FOUND' });

  try {
    const body = await parseJsonBody(req);
    const prescription = createPrescription({
      patientId: patient.id,
      appointmentId: body.appointmentId || body.appointment_id,
      dentistId: auth.doctorId || auth.staffId,
      dentistName: auth.staffName,
      notes: body.notes,
      items: body.items
    });

    sendJson(res, 201, { success: true, prescription });
  } catch (err) {
    sendJson(res, 400, { error: err.message || 'Failed to issue prescription.', code: 'BAD_REQUEST' });
  }
}

// 20. GET /api/prescriptions/:id
function handleGetPrescription(req, res, rxId) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  const prescription = getPrescriptionById(rxId);
  if (!prescription) return sendJson(res, 404, { error: 'Prescription not found.', code: 'NOT_FOUND' });

  sendJson(res, 200, { prescription });
}

// 21. PATCH /api/prescriptions/:id (Prescription Immutability)
function handleMutatePrescription(req, res) {
  sendJson(res, 403, {
    error: 'Prescriptions are immutable once issued to maintain audit integrity. If a correction is needed, please issue a new prescription.',
    code: 'PRESCRIPTION_IMMUTABLE'
  });
}

// ============================================================================
// Phase 5: Follow-ups & WhatsApp Communication Handlers
// ============================================================================

// 22. GET /api/follow-ups
function handleGetFollowUps(req, res, query = {}) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  const filters = {
    status: query.status,
    type: query.type,
    due_date: query.due_date,
    assigned_to: query.assigned_to,
    from_date: query.from_date,
    to_date: query.to_date,
    overdue_only: query.overdue_only === 'true'
  };
  const followUps = getFollowUps(filters);
  sendJson(res, 200, { follow_ups: followUps, count: followUps.length });
}

// 23. GET /api/follow-ups/due
function handleGetDueFollowUps(req, res, query = {}) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  const date = query.date || new Date().toISOString().split('T')[0];
  const result = getDueAndOverdueFollowUps(date);
  sendJson(res, 200, result);
}

// 24. GET /api/patients/:id/follow-ups
function handleGetPatientFollowUps(req, res, patientId) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  const patient = getPatientById(patientId);
  if (!patient) return sendJson(res, 404, { error: 'Patient not found.', code: 'NOT_FOUND' });

  const followUps = getFollowUps({ patient_id: patient.id });
  sendJson(res, 200, { follow_ups: followUps, count: followUps.length });
}

// 25. POST /api/patients/:id/follow-ups
async function handleCreatePatientFollowUp(req, res, patientId) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  const patient = getPatientById(patientId);
  if (!patient) return sendJson(res, 404, { error: 'Patient not found.', code: 'NOT_FOUND' });

  try {
    const body = await parseJsonBody(req);
    const followUp = createFollowUp({
      patient_id: patient.id,
      appointment_id: body.appointment_id || body.appointmentId,
      treatment_record_id: body.treatment_record_id || body.treatmentRecordId,
      type: body.type,
      reason: body.reason,
      due_date: body.due_date || body.dueDate,
      preferred_channel: body.preferred_channel || body.preferredChannel || 'WHATSAPP',
      assigned_to: body.assigned_to || body.assignedTo || auth.staffName,
      notes: body.notes
    });

    sendJson(res, 201, { success: true, follow_up: followUp });
  } catch (err) {
    sendJson(res, 400, { error: err.message, code: 'BAD_REQUEST' });
  }
}

// 26. GET /api/follow-ups/:id
function handleGetFollowUp(req, res, followUpId) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  const fu = getFollowUpById(followUpId);
  if (!fu) return sendJson(res, 404, { error: 'Follow-up not found.', code: 'NOT_FOUND' });

  sendJson(res, 200, { follow_up: fu });
}

// 27. PATCH /api/follow-ups/:id
async function handleUpdateFollowUp(req, res, followUpId) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  try {
    const body = await parseJsonBody(req);
    if (!body.status) {
      return sendJson(res, 400, { error: 'Target status is required.', code: 'MISSING_STATUS' });
    }

    const updated = updateFollowUpStatus(followUpId, body.status, {
      notes: body.notes,
      contacted_via: body.contacted_via,
      rescheduled_date: body.rescheduled_date
    }, auth.staffName);

    sendJson(res, 200, { success: true, follow_up: updated });
  } catch (err) {
    sendJson(res, 400, { error: err.message, code: 'BAD_REQUEST' });
  }
}

// 28. GET /api/patients/:id/communications
function handleGetPatientCommunications(req, res, patientId) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  const patient = getPatientById(patientId);
  if (!patient) return sendJson(res, 404, { error: 'Patient not found.', code: 'NOT_FOUND' });

  const communications = getPatientCommunications(patient.id);
  sendJson(res, 200, { communications, count: communications.length });
}

// 29. GET /api/appointments/:ref/communications
function handleGetAppointmentCommunications(req, res, bookingRef) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  const communications = getAppointmentCommunications(bookingRef);
  sendJson(res, 200, { communications, count: communications.length });
}

// 30. GET /api/communication/templates
function handleGetMessageTemplates(req, res) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  const templates = getMessageTemplates();
  sendJson(res, 200, { templates });
}

// 31. POST /api/communication/whatsapp/preview
async function handlePreviewWhatsApp(req, res) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  try {
    const body = await parseJsonBody(req);
    const preview = communicationService.previewMessage(body);
    sendJson(res, 200, { success: true, ...preview, interpolated_body: preview.body });
  } catch (err) {
    sendJson(res, 400, { error: err.message, code: err.code || 'BAD_REQUEST' });
  }
}

// 32. POST /api/communication/whatsapp/send
async function handleSendWhatsApp(req, res) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  try {
    const body = await parseJsonBody(req);
    const result = await communicationService.sendMessage({
      template_id: body.template_id || body.templateId,
      variables: body.variables || {},
      patient_id: body.patient_id || body.patientId,
      recipient_phone: body.recipient_phone || body.recipientPhone || body.recipient,
      appointment_id: body.appointment_id || body.appointmentId,
      follow_up_id: body.follow_up_id || body.followUpId,
      idempotency_key: body.idempotency_key || body.idempotencyKey,
      override_opt_out: body.override_opt_out === true || body.overrideOptOut === true,
      created_by: auth.staffName
    });

    sendJson(res, 200, result);
  } catch (err) {
    sendJson(res, 400, { error: err.message, code: err.code || 'BAD_REQUEST' });
  }
}

// 33. GET /api/patients/:id/communication-preferences
function handleGetCommunicationPreferences(req, res, patientId) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  const patient = getPatientById(patientId);
  if (!patient) return sendJson(res, 404, { error: 'Patient not found.', code: 'NOT_FOUND' });

  const preferences = getCommunicationPreferences(patient.id);
  sendJson(res, 200, { preferences });
}

// 34. PATCH /api/patients/:id/communication-preferences
async function handleUpdateCommunicationPreferences(req, res, patientId) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  const patient = getPatientById(patientId);
  if (!patient) return sendJson(res, 404, { error: 'Patient not found.', code: 'NOT_FOUND' });

  try {
    const body = await parseJsonBody(req);
    const updated = updateCommunicationPreferences(patient.id, body);
    sendJson(res, 200, { success: true, preferences: updated });
  } catch (err) {
    sendJson(res, 400, { error: err.message, code: 'BAD_REQUEST' });
  }
}

// 35. GET /api/webhooks/whatsapp (Meta Verification Challenge)
function handleWhatsAppWebhookGet(req, res, query = {}) {
  const challenge = communicationService.verifyWebhookChallenge(query);
  if (challenge) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=UTF-8' });
    return res.end(challenge);
  }
  sendJson(res, 403, { error: 'Webhook verification challenge failed.', code: 'FORBIDDEN' });
}

// 36. POST /api/webhooks/whatsapp (Meta Delivery Receipts & Statuses)
async function handleWhatsAppWebhookPost(req, res) {
  try {
    const body = await parseJsonBody(req);
    const result = communicationService.handleWebhookPayload(body);
    sendJson(res, 200, { received: true, ...result });
  } catch (err) {
    sendJson(res, 400, { error: err.message, code: 'BAD_REQUEST' });
  }
}

// 37. POST /api/communication/scheduler/run
async function handleRunScheduler(req, res) {
  const auth = getStaffAuth(req);
  if (auth.role === 'patient') return sendJson(res, 403, { error: 'Access denied.', code: 'FORBIDDEN' });
  if (!auth.isAuthenticated) return sendJson(res, 401, { error: 'Authentication required.', code: 'UNAUTHORIZED' });

  try {
    const stats = await communicationService.processScheduledJobs();
    sendJson(res, 200, { success: true, ...stats });
  } catch (err) {
    sendJson(res, 500, { error: err.message, code: 'INTERNAL_ERROR' });
  }
}

// ============================================================================
// Static File Server
// ============================================================================
function serveStaticFile(req, res, targetPath) {
  fs.stat(targetPath, (err, stats) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('404 Not Found');
      return;
    }

    if (stats.isDirectory()) {
      targetPath = path.join(targetPath, 'index.html');
    }

    const ext = path.extname(targetPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(targetPath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('500 Internal Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
}

// ============================================================================
// Main HTTP Server Request Router
// ============================================================================
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = decodeURI(parsedUrl.pathname);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // --- REST API ROUTES ---
  if (pathname.startsWith('/api/')) {
    if (req.method === 'GET' && pathname === '/api/clinic-config') {
      return sendJson(res, 200, { success: true, config: clinicConfig });
    }
    if (req.method === 'GET' && pathname === '/api/services') {
      return handleGetServices(req, res);
    }
    if (req.method === 'GET' && pathname === '/api/doctors') {
      return handleGetDoctors(req, res);
    }
    if (req.method === 'GET' && pathname === '/api/availability') {
      return handleGetAvailability(req, res, parsedUrl.query);
    }
    if (req.method === 'POST' && pathname === '/api/appointments') {
      return handleCreateAppointment(req, res);
    }
    if (req.method === 'POST' && pathname === '/api/appointments/hold') {
      return handleHoldAppointment(req, res);
    }

    // Match /api/appointments/:reference/pay
    const payMatch = pathname.match(/^\/api\/appointments\/([A-Za-z0-9\-]+)\/pay$/);
    if (payMatch && req.method === 'POST') {
      return handleDemoPayAppointment(req, res, payMatch[1].toUpperCase());
    }

    // Match /api/appointments/:reference/release-hold
    const releaseHoldMatch = pathname.match(/^\/api\/appointments\/([A-Za-z0-9\-]+)\/release-hold$/);
    if (releaseHoldMatch && req.method === 'POST') {
      return handleReleaseHoldAppointment(req, res, releaseHoldMatch[1].toUpperCase());
    }

    // Match /api/appointments/:reference
    const refMatch = pathname.match(/^\/api\/appointments\/([A-Za-z0-9\-]+)$/);
    if (refMatch && req.method === 'GET') {
      return handleGetAppointmentByRef(req, res, refMatch[1].toUpperCase());
    }

    // Match /api/appointments/:reference/cancel
    const cancelMatch = pathname.match(/^\/api\/appointments\/([A-Za-z0-9\-]+)\/cancel$/);
    if (cancelMatch && req.method === 'POST') {
      return handleCancelAppointment(req, res, cancelMatch[1].toUpperCase());
    }

    // Match /api/appointments/:reference/calendar.ics
    const icsMatch = pathname.match(/^\/api\/appointments\/([A-Za-z0-9\-]+)\/calendar(?:\.ics)?$/);
    if (icsMatch && req.method === 'GET') {
      return handleCalendarIcs(req, res, icsMatch[1].toUpperCase());
    }

    if (req.method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        nodeVersion: process.version
      });
    }

    // --- Staff Authentication APIs ---
    if (req.method === 'POST' && pathname === '/api/auth/staff-login') {
      return handleStaffLogin(req, res);
    }
    if (req.method === 'POST' && pathname === '/api/auth/staff-logout') {
      return handleStaffLogout(req, res);
    }
    if (req.method === 'GET' && pathname === '/api/auth/me') {
      return handleStaffMe(req, res);
    }

    // --- Phase 3 Internal Dashboard APIs ---
    if (req.method === 'GET' && pathname === '/api/dashboard/today') {
      return handleGetDashboardToday(req, res, parsedUrl.query);
    }
    if (req.method === 'GET' && pathname === '/api/dashboard/appointments') {
      return handleGetDashboardAppointments(req, res, parsedUrl.query);
    }
    if (req.method === 'GET' && pathname === '/api/dashboard/search') {
      return handleDashboardSearch(req, res, parsedUrl.query);
    }
    if (req.method === 'POST' && pathname === '/api/dashboard/seed-demo') {
      return handleSeedDemo(req, res);
    }

    // Match /api/appointments/:reference/check-in
    const checkInMatch = pathname.match(/^\/api\/appointments\/([A-Za-z0-9\-]+)\/check-in$/);
    if (checkInMatch && req.method === 'POST') {
      return handleCheckInAppointment(req, res, checkInMatch[1].toUpperCase(), parsedUrl.query);
    }

    // Queue APIs
    if (req.method === 'GET' && pathname === '/api/queue') {
      return handleGetLiveQueue(req, res, parsedUrl.query);
    }

    const queueCallMatch = pathname.match(/^\/api\/queue\/([A-Za-z0-9\-]+)\/call$/);
    if (queueCallMatch && req.method === 'POST') {
      return handleCallQueuePatient(req, res, queueCallMatch[1]);
    }

    const queueCompleteMatch = pathname.match(/^\/api\/queue\/([A-Za-z0-9\-]+)\/complete$/);
    if (queueCompleteMatch && req.method === 'POST') {
      return handleCompleteQueuePatient(req, res, queueCompleteMatch[1]);
    }

    const queueNoShowMatch = pathname.match(/^\/api\/queue\/([A-Za-z0-9\-]+)\/no-show$/);
    if (queueNoShowMatch && req.method === 'POST') {
      return handleNoShowQueuePatient(req, res, queueNoShowMatch[1]);
    }

    // --- Phase 4 Patient & Clinical APIs ---
    if (pathname === '/api/patients') {
      if (req.method === 'GET') return handleGetPatients(req, res, parsedUrl.query);
      if (req.method === 'POST') return handleCreatePatient(req, res);
    }

    // Match /api/patients/:id/appointments
    const patApptMatch = pathname.match(/^\/api\/patients\/([A-Za-z0-9\-_]+)\/appointments$/);
    if (patApptMatch && req.method === 'GET') {
      return handleGetPatientAppointments(req, res, patApptMatch[1]);
    }

    // Match /api/patients/:id/timeline
    const patTimelineMatch = pathname.match(/^\/api\/patients\/([A-Za-z0-9\-_]+)\/timeline$/);
    if (patTimelineMatch && req.method === 'GET') {
      return handleGetPatientTimeline(req, res, patTimelineMatch[1]);
    }

    // Match /api/patients/:id/odontogram/findings
    const patOdontoFindMatch = pathname.match(/^\/api\/patients\/([A-Za-z0-9\-_]+)\/odontogram\/findings$/);
    if (patOdontoFindMatch && req.method === 'POST') {
      return handleRecordOdontogramFinding(req, res, patOdontoFindMatch[1]);
    }

    // Match /api/clinical/taxonomy
    if (pathname === '/api/clinical/taxonomy' && req.method === 'GET') {
      return handleGetClinicalTaxonomy(req, res);
    }

    // Match /api/patients/:id/odontogram
    const patOdontoMatch = pathname.match(/^\/api\/patients\/([A-Za-z0-9\-_]+)\/odontogram$/);
    if (patOdontoMatch && req.method === 'GET') {
      return handleGetPatientOdontogram(req, res, patOdontoMatch[1], parsedUrl.query);
    }

    // Match /api/odontogram/findings/:id/archive
    const odontoArchiveMatch = pathname.match(/^\/api\/odontogram\/findings\/([A-Za-z0-9\-_]+)\/archive$/);
    if (odontoArchiveMatch && req.method === 'POST') {
      return handleArchiveOdontogramFinding(req, res, odontoArchiveMatch[1]);
    }

    // Match /api/odontogram/findings/:id (DELETE -> soft archive)
    const odontoDeleteMatch = pathname.match(/^\/api\/odontogram\/findings\/([A-Za-z0-9\-_]+)$/);
    if (odontoDeleteMatch && req.method === 'DELETE') {
      return handleArchiveOdontogramFinding(req, res, odontoDeleteMatch[1]);
    }

    // Match /api/patients/:id/notes
    const patNotesMatch = pathname.match(/^\/api\/patients\/([A-Za-z0-9\-_]+)\/notes$/);
    if (patNotesMatch) {
      if (req.method === 'GET') return handleGetClinicalNotes(req, res, patNotesMatch[1]);
      if (req.method === 'POST') return handleCreateClinicalNote(req, res, patNotesMatch[1]);
    }

    // Match /api/notes/:id
    const noteIdMatch = pathname.match(/^\/api\/notes\/([A-Za-z0-9\-_]+)$/);
    if (noteIdMatch && req.method === 'PATCH') {
      return handleUpdateClinicalNote(req, res, noteIdMatch[1]);
    }

    // Match /api/patients/:id/treatment-plans
    const patPlansMatch = pathname.match(/^\/api\/patients\/([A-Za-z0-9\-_]+)\/treatment-plans$/);
    if (patPlansMatch) {
      if (req.method === 'GET') return handleGetTreatmentPlans(req, res, patPlansMatch[1]);
      if (req.method === 'POST') return handleCreateTreatmentPlan(req, res, patPlansMatch[1]);
    }

    // Match /api/treatment-plans/:id
    const planIdMatch = pathname.match(/^\/api\/treatment-plans\/([A-Za-z0-9\-_]+)$/);
    if (planIdMatch && req.method === 'PATCH') {
      return handleUpdateTreatmentPlan(req, res, planIdMatch[1]);
    }

    // Match /api/patients/:id/treatment-records
    const patRecordsMatch = pathname.match(/^\/api\/patients\/([A-Za-z0-9\-_]+)\/treatment-records$/);
    if (patRecordsMatch) {
      if (req.method === 'GET') return handleGetTreatmentRecords(req, res, patRecordsMatch[1]);
      if (req.method === 'POST') return handleRecordPerformedTreatment(req, res, patRecordsMatch[1]);
    }

    // Match /api/treatment-records
    if (pathname === '/api/treatment-records' && req.method === 'POST') {
      return handleRecordPerformedTreatment(req, res);
    }

    // Match /api/patients/:id/prescriptions
    const patRxMatch = pathname.match(/^\/api\/patients\/([A-Za-z0-9\-_]+)\/prescriptions$/);
    if (patRxMatch) {
      if (req.method === 'GET') return handleGetPatientPrescriptions(req, res, patRxMatch[1]);
      if (req.method === 'POST') return handleCreatePrescription(req, res, patRxMatch[1]);
    }

    // Match /api/prescriptions/:id
    const rxIdMatch = pathname.match(/^\/api\/prescriptions\/([A-Za-z0-9\-_]+)$/);
    if (rxIdMatch) {
      if (req.method === 'GET') return handleGetPrescription(req, res, rxIdMatch[1]);
      if (req.method === 'PATCH') return handleMutatePrescription(req, res);
    }

    // Match /api/patients/:id
    const patMatch = pathname.match(/^\/api\/patients\/([A-Za-z0-9\-_]+)$/);
    if (patMatch) {
      if (req.method === 'GET') return handleGetPatient(req, res, patMatch[1]);
      if (req.method === 'PATCH') return handleUpdatePatient(req, res, patMatch[1]);
    }

    // --- Phase 5 Follow-ups & WhatsApp Communication APIs ---
    // Match /api/follow-ups/due
    if (pathname === '/api/follow-ups/due' && req.method === 'GET') {
      return handleGetDueFollowUps(req, res, parsedUrl.query);
    }

    // Match /api/follow-ups
    if (pathname === '/api/follow-ups' && req.method === 'GET') {
      return handleGetFollowUps(req, res, parsedUrl.query);
    }

    // Match /api/follow-ups/:id
    const fuIdMatch = pathname.match(/^\/api\/follow-ups\/([A-Za-z0-9\-_]+)$/);
    if (fuIdMatch) {
      if (req.method === 'GET') return handleGetFollowUp(req, res, fuIdMatch[1]);
      if (req.method === 'PATCH') return handleUpdateFollowUp(req, res, fuIdMatch[1]);
    }

    // Match /api/patients/:id/follow-ups
    const patFuMatch = pathname.match(/^\/api\/patients\/([A-Za-z0-9\-_]+)\/follow-ups$/);
    if (patFuMatch) {
      if (req.method === 'GET') return handleGetPatientFollowUps(req, res, patFuMatch[1]);
      if (req.method === 'POST') return handleCreatePatientFollowUp(req, res, patFuMatch[1]);
    }

    // Match /api/patients/:id/communications
    const patCommMatch = pathname.match(/^\/api\/patients\/([A-Za-z0-9\-_]+)\/communications$/);
    if (patCommMatch && req.method === 'GET') {
      return handleGetPatientCommunications(req, res, patCommMatch[1]);
    }

    // Match /api/appointments/:ref/communications
    const apptCommMatch = pathname.match(/^\/api\/appointments\/([A-Za-z0-9\-_]+)\/communications$/);
    if (apptCommMatch && req.method === 'GET') {
      return handleGetAppointmentCommunications(req, res, apptCommMatch[1]);
    }

    // Match /api/patients/:id/communication-preferences
    const patPrefMatch = pathname.match(/^\/api\/patients\/([A-Za-z0-9\-_]+)\/communication-preferences$/);
    if (patPrefMatch) {
      if (req.method === 'GET') return handleGetCommunicationPreferences(req, res, patPrefMatch[1]);
      if (req.method === 'PATCH') return handleUpdateCommunicationPreferences(req, res, patPrefMatch[1]);
    }

    // Match /api/communication/templates
    if (pathname === '/api/communication/templates' && req.method === 'GET') {
      return handleGetMessageTemplates(req, res);
    }

    // Match /api/communication/whatsapp/preview
    if (pathname === '/api/communication/whatsapp/preview' && req.method === 'POST') {
      return handlePreviewWhatsApp(req, res);
    }

    // Match /api/communication/whatsapp/send
    if (pathname === '/api/communication/whatsapp/send' && req.method === 'POST') {
      return handleSendWhatsApp(req, res);
    }

    // Match /api/communication/scheduler/run
    if (pathname === '/api/communication/scheduler/run' && req.method === 'POST') {
      return handleRunScheduler(req, res);
    }

    // Match /api/webhooks/whatsapp
    if (pathname === '/api/webhooks/whatsapp') {
      if (req.method === 'GET') return handleWhatsAppWebhookGet(req, res, parsedUrl.query);
      if (req.method === 'POST') return handleWhatsAppWebhookPost(req, res);
    }

    return sendJson(res, 404, { error: 'API endpoint not found.' });
  }

  // --- STATIC FILE SERVING ---
  let servePath = pathname;
  if (servePath === '/dashboard' || servePath === '/dashboard/') {
    servePath = '/dashboard.html';
  }
  if (servePath === '/patient' || servePath === '/patient/' || servePath.startsWith('/patients')) {
    servePath = '/patient.html';
  }

  let safePath = path.normalize(path.join(ROOT, servePath));
  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
    return res.end('403 Forbidden');
  }

  serveStaticFile(req, res, safePath);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`  Clinic Platform Server & Booking Engine Running (${clinicConfig.clinicName || 'Apex Dental Studio'})`);
  console.log(`  Local URL:   http://0.0.0.0:${PORT}`);
  console.log(`  Booking URL: http://localhost:${PORT}/book.html`);
  console.log(`  Serving Dir: ${ROOT}`);
  console.log(`======================================================\n`);

  // Start background communication job scheduler (runs every 30 seconds)
  setInterval(() => {
    communicationService.processScheduledJobs().catch(err => {
      console.error('[SCHEDULER] Periodic runner error:', err.message);
    });
  }, 30000);
});

module.exports = server;
