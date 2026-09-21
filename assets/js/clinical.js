/**
 * Clinical Workspace Logic
 * Phase 4 Implementation
 * Powers the interactive FDI odontogram, tooth inspector, treatment planning,
 * clinical notes, immutable prescriptions, and longitudinal patient timeline.
 */

(function () {
  'use strict';

  // --- STATE ---
  const state = {
    token: sessionStorage.getItem('ds_staff_token') || null,
    role: sessionStorage.getItem('ds_staff_role') || 'dentist',
    staffName: sessionStorage.getItem('ds_staff_name') || 'Dr. Aryan Sharma',
    doctorId: sessionStorage.getItem('ds_doctor_id') || 'doc_anuj_kumar',
    patientId: null,
    appointmentRef: null,
    patient: null,
    selectedTooth: 16,
    selectedSurface: 'WHOLE_TOOTH',
    findings: [],
    taxonomy: [],
    notes: [],
    treatmentPlans: [],
    treatmentRecords: [],
    prescriptions: [],
    timeline: [],
    appointments: [],
    // Phase 5 State
    followUps: [],
    communications: [],
    preferences: null,
    currentWaFuId: null
  };

  // Adult FDI Tooth Name Map
  const TOOTH_NAMES = {
    18: 'Upper Right Third Molar (Wisdom)', 17: 'Upper Right Second Molar', 16: 'Upper Right First Molar',
    15: 'Upper Right Second Premolar', 14: 'Upper Right First Premolar', 13: 'Upper Right Canine',
    12: 'Upper Right Lateral Incisor', 11: 'Upper Right Central Incisor',
    21: 'Upper Left Central Incisor', 22: 'Upper Left Lateral Incisor', 23: 'Upper Left Canine',
    24: 'Upper Left First Premolar', 25: 'Upper Left Second Premolar', 26: 'Upper Left First Molar',
    27: 'Upper Left Second Molar', 28: 'Upper Left Third Molar (Wisdom)',
    31: 'Lower Left Central Incisor', 32: 'Lower Left Lateral Incisor', 33: 'Lower Left Canine',
    34: 'Lower Left First Premolar', 35: 'Lower Left Second Premolar', 36: 'Lower Left First Molar',
    37: 'Lower Left Second Molar', 38: 'Lower Left Third Molar (Wisdom)',
    41: 'Lower Right Central Incisor', 42: 'Lower Right Lateral Incisor', 43: 'Lower Right Canine',
    44: 'Lower Right First Premolar', 45: 'Lower Right Second Premolar', 46: 'Lower Right First Molar',
    47: 'Lower Right Second Molar', 48: 'Lower Right Third Molar (Wisdom)'
  };

  // --- DOM ELEMENTS ---
  const el = {
    // Header & Staff Session
    staffRoleBadge: document.getElementById('staffRoleBadge'),
    staffNameDisplay: document.getElementById('staffNameDisplay'),
    staffSwitchBtn: document.getElementById('staffSwitchBtn'),
    openSearchBtn: document.getElementById('openSearchBtn'),

    // Patient Banner
    patientName: document.getElementById('patientName'),
    patientAvatar: document.getElementById('patientAvatar'),
    patientRef: document.getElementById('patientRef'),
    patientAgeGender: document.getElementById('patientAgeGender'),
    patientMobile: document.getElementById('patientMobile'),
    patientTypeTag: document.getElementById('patientTypeTag'),
    ambiguousNotice: document.getElementById('ambiguousNotice'),
    alertsTextDisplay: document.getElementById('alertsTextDisplay'),
    openAlertsModalBtn: document.getElementById('openAlertsModalBtn'),
    consultationContextStrip: document.getElementById('consultationContextStrip'),
    contextApptRef: document.getElementById('contextApptRef'),
    contextApptService: document.getElementById('contextApptService'),
    contextApptDoctor: document.getElementById('contextApptDoctor'),
    completeConsultationBtn: document.getElementById('completeConsultationBtn'),

    // Tabs
    tabButtons: document.querySelectorAll('.tab-btn'),
    panels: document.querySelectorAll('.clinical-panel'),

    // Overview Panel
    overviewChiefConcern: document.getElementById('overviewChiefConcern'),
    overviewPlansList: document.getElementById('overviewPlansList'),
    overviewFullName: document.getElementById('overviewFullName'),
    overviewPhone: document.getElementById('overviewPhone'),
    overviewEmail: document.getElementById('overviewEmail'),
    overviewGenderDob: document.getElementById('overviewGenderDob'),
    overviewAlertsText: document.getElementById('overviewAlertsText'),
    openEditDemographicsBtn: document.getElementById('openEditDemographicsBtn'),
    jumpToTreatmentTabBtn: document.getElementById('jumpToTreatmentTabBtn'),

    // Odontogram Panel
    upperTeethGrid: document.getElementById('upperTeethGrid'),
    lowerTeethGrid: document.getElementById('lowerTeethGrid'),
    selectedToothDisplay: document.getElementById('selectedToothDisplay'),
    inspectorToothNum: document.getElementById('inspectorToothNum'),
    inspectorQuadrantTag: document.getElementById('inspectorQuadrantTag'),
    inspectorToothName: document.getElementById('inspectorToothName'),
    surfacePicker: document.getElementById('surfacePicker'),
    findingTypeSelect: document.getElementById('findingTypeSelect'),
    findingSeveritySelect: document.getElementById('findingSeveritySelect'),
    findingNotesInput: document.getElementById('findingNotesInput'),
    saveFindingBtn: document.getElementById('saveFindingBtn'),
    findingRoleNotice: document.getElementById('findingRoleNotice'),
    toothFindingsList: document.getElementById('toothFindingsList'),

    // Treatment Panel
    treatmentPlansContainer: document.getElementById('treatmentPlansContainer'),
    treatmentRecordsContainer: document.getElementById('treatmentRecordsContainer'),
    openAddPlanModalBtn: document.getElementById('openAddPlanModalBtn'),
    openRecordTreatmentModalBtn: document.getElementById('openRecordTreatmentModalBtn'),

    // Notes Panel
    clinicalNotesFeed: document.getElementById('clinicalNotesFeed'),
    openAddNoteModalBtn: document.getElementById('openAddNoteModalBtn'),

    // Prescriptions Panel
    prescriptionsContainer: document.getElementById('prescriptionsContainer'),
    openNewPrescriptionModalBtn: document.getElementById('openNewPrescriptionModalBtn'),

    // Timeline & Appointments
    clinicalTimelineTrack: document.getElementById('clinicalTimelineTrack'),
    appointmentsTableBody: document.getElementById('appointmentsTableBody'),

    // Modals
    staffLoginModal: document.getElementById('staffLoginModal'),
    loginModalClose: document.getElementById('loginModalClose'),
    staffPinForm: document.getElementById('staffPinForm'),
    pinInput: document.getElementById('pinInput'),
    loginErrorText: document.getElementById('loginErrorText'),
    addNoteModal: document.getElementById('addNoteModal'),
    addNoteClose: document.getElementById('addNoteClose'),
    clinicalNoteForm: document.getElementById('clinicalNoteForm'),
    addPlanModal: document.getElementById('addPlanModal'),
    addPlanClose: document.getElementById('addPlanClose'),
    treatmentPlanForm: document.getElementById('treatmentPlanForm'),
    recordTreatmentModal: document.getElementById('recordTreatmentModal'),
    recordTreatmentClose: document.getElementById('recordTreatmentClose'),
    performedTreatmentForm: document.getElementById('performedTreatmentForm'),
    perfPlanSelect: document.getElementById('perfPlanSelect'),
    newPrescriptionModal: document.getElementById('newPrescriptionModal'),
    newRxClose: document.getElementById('newRxClose'),
    prescriptionForm: document.getElementById('prescriptionForm'),
    rxItemsContainer: document.getElementById('rxItemsContainer'),
    addRxItemRowBtn: document.getElementById('addRxItemRowBtn'),
    printPrescriptionModal: document.getElementById('printPrescriptionModal'),
    printRxClose: document.getElementById('printRxClose'),
    editAlertsModal: document.getElementById('editAlertsModal'),
    editAlertsClose: document.getElementById('editAlertsClose'),
    clinicianAlertsForm: document.getElementById('clinicianAlertsForm'),
    alertsInput: document.getElementById('alertsInput'),
    editDemographicsModal: document.getElementById('editDemographicsModal'),
    editDemoClose: document.getElementById('editDemoClose'),
    demographicsForm: document.getElementById('demographicsForm'),
    demoFullName: document.getElementById('demoFullName'),
    demoMobile: document.getElementById('demoMobile'),
    demoEmail: document.getElementById('demoEmail'),
    demoDob: document.getElementById('demoDob'),
    demoGender: document.getElementById('demoGender'),

    // Phase 5 Elements
    prefChannelSelect: document.getElementById('prefChannelSelect'),
    prefWaOptInCheck: document.getElementById('prefWaOptInCheck'),
    prefContactTimeSelect: document.getElementById('prefContactTimeSelect'),
    prefLangSelect: document.getElementById('prefLangSelect'),
    patientCommPrefsForm: document.getElementById('patientCommPrefsForm'),
    savePrefsBtn: document.getElementById('savePrefsBtn'),
    openPatientWaModalBtn: document.getElementById('openPatientWaModalBtn'),
    openScheduleFollowUpBtn: document.getElementById('openScheduleFollowUpBtn'),
    patientFollowUpsTbody: document.getElementById('patientFollowUpsTbody'),
    patientCommsTbody: document.getElementById('patientCommsTbody'),

    // Phase 5 Modals
    scheduleFollowUpModal: document.getElementById('scheduleFollowUpModal'),
    scheduleFuClose: document.getElementById('scheduleFuClose'),
    scheduleFollowUpForm: document.getElementById('scheduleFollowUpForm'),
    pFuTypeSelect: document.getElementById('pFuTypeSelect'),
    pFuDueDateInput: document.getElementById('pFuDueDateInput'),
    pFuReasonInput: document.getElementById('pFuReasonInput'),
    pFuChannelSelect: document.getElementById('pFuChannelSelect'),
    pFuAssignedInput: document.getElementById('pFuAssignedInput'),
    pFuNotesInput: document.getElementById('pFuNotesInput'),
    pFuErrorMsg: document.getElementById('pFuErrorMsg'),
    pFuSubmitBtn: document.getElementById('pFuSubmitBtn'),

    patientWhatsAppModal: document.getElementById('patientWhatsAppModal'),
    patientWaClose: document.getElementById('patientWaClose'),
    pWaRecipientDisplay: document.getElementById('pWaRecipientDisplay'),
    pWaConsentDisplay: document.getElementById('pWaConsentDisplay'),
    pWaTemplateSelect: document.getElementById('pWaTemplateSelect'),
    pWaBubbleText: document.getElementById('pWaBubbleText'),
    pWaBubbleTime: document.getElementById('pWaBubbleTime'),
    pWaOverrideWrap: document.getElementById('pWaOverrideWrap'),
    pWaOverrideCheck: document.getElementById('pWaOverrideCheck'),
    pWaErrorMsg: document.getElementById('pWaErrorMsg'),
    pWaSendBtn: document.getElementById('pWaSendBtn'),
    pWaCancelBtn: document.getElementById('pWaCancelBtn')
  };

  // --- INITIALIZATION ---
  async function init() {
    setupEventListeners();
    parseQueryParams();
    updateStaffUI();

    // Authenticate / restore session
    if (!state.token) {
      await loginWithPin('2048'); // Default bootstrap: Dr. Aryan Sharma
    } else {
      try {
        const res = await apiFetch('/api/auth/me');
        if (res.ok) {
          const auth = await res.json();
          updateStaffState(auth.role, auth.staffName, auth.doctorId);
        }
      } catch (_) {}
    }

    // Load Patient Data
    if (state.patientId) {
      await loadPatientData();
    } else {
      // Find first patient or redirect
      await autoLoadInitialPatient();
    }
  }

  // --- QUERY PARAM PARSER ---
  function parseQueryParams() {
    const params = new URLSearchParams(window.location.search);
    state.patientId = params.get('id') || params.get('patientId');
    state.appointmentRef = params.get('appointment') || params.get('ref');
  }

  async function autoLoadInitialPatient() {
    try {
      const res = await apiFetch('/api/patients?limit=1');
      if (res.ok) {
        const data = await res.json();
        if (data.patients && data.patients.length > 0) {
          state.patientId = data.patients[0].id;
          await loadPatientData();
        }
      }
    } catch (_) {}
  }

  // --- API FETCH WRAPPER ---
  async function apiFetch(url, options = {}) {
    options.headers = options.headers || {};
    if (state.token) {
      options.headers['Authorization'] = `Bearer ${state.token}`;
      options.headers['X-Staff-Token'] = state.token;
    }
    options.headers['X-Clinic-Role'] = state.role;
    const res = await fetch(url, options);
    if (res.status === 401) {
      showModal(el.staffLoginModal);
    }
    return res;
  }

  // --- STAFF AUTHENTICATION ---
  async function loginWithPin(pin) {
    try {
      const res = await fetch('/api/auth/staff-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: String(pin).trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        if (el.loginErrorText) {
          el.loginErrorText.textContent = data.error || 'Invalid PIN.';
          el.loginErrorText.style.display = 'block';
        }
        return false;
      }
      state.token = data.token;
      sessionStorage.setItem('ds_staff_token', data.token);
      updateStaffState(data.role, data.staffName, data.doctorId);
      hideModal(el.staffLoginModal);
      return true;
    } catch (err) {
      return false;
    }
  }

  function updateStaffState(role, name, doctorId) {
    state.role = role;
    state.staffName = name;
    state.doctorId = doctorId;
    sessionStorage.setItem('ds_staff_role', role);
    sessionStorage.setItem('ds_staff_name', name);
    if (doctorId) sessionStorage.setItem('ds_doctor_id', doctorId);
    updateStaffUI();
  }

  function updateStaffUI() {
    el.staffRoleBadge.textContent = (state.role || 'STAFF').toUpperCase();
    el.staffRoleBadge.className = 'staff-role-tag mono ' + (state.role || '');
    el.staffNameDisplay.textContent = state.staffName || 'Clinic Staff';

    const isDentist = state.role === 'dentist';
    if (el.findingRoleNotice) {
      el.findingRoleNotice.style.display = isDentist ? 'none' : 'block';
    }
    if (el.saveFindingBtn) {
      el.saveFindingBtn.disabled = !isDentist;
      el.saveFindingBtn.style.opacity = isDentist ? '1' : '0.5';
    }
    if (el.openAddNoteModalBtn) {
      el.openAddNoteModalBtn.style.display = isDentist ? 'inline-flex' : 'none';
    }
    if (el.openAddPlanModalBtn) {
      el.openAddPlanModalBtn.style.display = isDentist ? 'inline-flex' : 'none';
    }
    if (el.openRecordTreatmentModalBtn) {
      el.openRecordTreatmentModalBtn.style.display = isDentist ? 'inline-flex' : 'none';
    }
    if (el.openNewPrescriptionModalBtn) {
      el.openNewPrescriptionModalBtn.style.display = isDentist ? 'inline-flex' : 'none';
    }
  }

  // --- LOAD ALL PATIENT DATA ---
  async function loadPatientData() {
    if (!state.patientId) return;

    try {
      // 1. Patient Profile
      const pRes = await apiFetch(`/api/patients/${state.patientId}`);
      if (!pRes.ok) return;
      const pData = await pRes.json();
      state.patient = pData.patient;
      renderPatientBanner();

      // 2. Odontogram Findings
      const oRes = await apiFetch(`/api/patients/${state.patientId}/odontogram`);
      if (oRes.ok) {
        const oData = await oRes.json();
        state.findings = oData.findings || [];
        state.taxonomy = oData.taxonomy || [];
        populateTaxonomyDropdown();
        renderOdontogram();
        renderToothInspector();
      }

      // 3. Treatment Plans
      const tRes = await apiFetch(`/api/patients/${state.patientId}/treatment-plans`);
      if (tRes.ok) {
        const tData = await tRes.json();
        state.treatmentPlans = tData.plans || [];
        renderTreatmentPlans();
      }

      // 4. Treatment Records (Performed)
      const rRes = await apiFetch(`/api/patients/${state.patientId}/treatment-records`);
      if (rRes.ok) {
        const rData = await rRes.json();
        state.treatmentRecords = rData.records || [];
        renderTreatmentRecords();
      }

      // 5. Clinical Notes
      const nRes = await apiFetch(`/api/patients/${state.patientId}/notes`);
      if (nRes.ok) {
        const nData = await nRes.json();
        state.notes = nData.notes || [];
        renderClinicalNotes();
      }

      // 6. Prescriptions
      const rxRes = await apiFetch(`/api/patients/${state.patientId}/prescriptions`);
      if (rxRes.ok) {
        const rxData = await rxRes.json();
        state.prescriptions = rxData.prescriptions || [];
        renderPrescriptions();
      }

      // 7. Timeline
      const timeRes = await apiFetch(`/api/patients/${state.patientId}/timeline`);
      if (timeRes.ok) {
        const timeData = await timeRes.json();
        state.timeline = timeData.events || [];
        renderTimeline();
      }

      // 8. Appointments
      const apptRes = await apiFetch(`/api/patients/${state.patientId}/appointments`);
      if (apptRes.ok) {
        const apptData = await apptRes.json();
        state.appointments = apptData.appointments || [];
        renderAppointments();
      }

      // 9. Follow-ups (Phase 5)
      await loadFollowUps();

      // 10. Communication Audit History (Phase 5)
      await loadCommunications();

      // 11. Communication Preferences (Phase 5)
      await loadCommunicationPreferences();

      // Check Active Consultation Context
      if (state.appointmentRef) {
        setupConsultationContext();
      }

    } catch (err) {
      console.error('[CLINICAL LOAD ERROR]', err);
    }
  }

  // --- RENDER PATIENT BANNER & OVERVIEW ---
  function renderPatientBanner() {
    const p = state.patient;
    if (!p) return;

    el.patientName.textContent = p.full_name;
    el.patientAvatar.textContent = (p.full_name || 'P').charAt(0).toUpperCase();
    el.patientRef.textContent = p.patient_reference;
    el.patientMobile.textContent = '+91 ' + p.mobile;

    // Age / Gender
    let ageGenderText = '';
    if (p.date_of_birth) {
      const age = calculateAge(p.date_of_birth);
      ageGenderText += age + ' YRS';
    }
    if (p.gender) {
      ageGenderText += (ageGenderText ? ' &middot; ' : '') + p.gender;
    }
    el.patientAgeGender.innerHTML = ageGenderText || 'Age / Gender Unspecified';

    // Tags
    el.patientTypeTag.textContent = p.patient_type || 'NEW';
    el.patientTypeTag.className = 'chip-tag ' + (p.patient_type === 'RETURNING' ? 'returning' : 'new');
    el.ambiguousNotice.style.display = p.is_flagged_ambiguous ? 'inline-flex' : 'none';

    // Alerts
    const alerts = p.dentist_entered_alerts;
    if (alerts && alerts.trim()) {
      el.alertsTextDisplay.textContent = alerts.trim();
      el.alertsTextDisplay.style.color = '#991B1B';
      el.overviewAlertsText.textContent = alerts.trim();
    } else {
      el.alertsTextDisplay.textContent = 'Clinician Alerts (None)';
      el.alertsTextDisplay.style.color = 'inherit';
      el.overviewAlertsText.textContent = 'None recorded';
    }

    // Overview Tab fields
    el.overviewFullName.textContent = p.full_name;
    el.overviewPhone.textContent = '+91 ' + p.mobile;
    el.overviewEmail.textContent = p.email || 'None recorded';
    el.overviewGenderDob.textContent = (p.gender || 'Not specified') + (p.date_of_birth ? ` (DOB: ${p.date_of_birth})` : '');
  }

  function calculateAge(dobStr) {
    try {
      const dob = new Date(dobStr);
      const diff = Date.now() - dob.getTime();
      const ageDt = new Date(diff);
      return Math.abs(ageDt.getUTCFullYear() - 1970);
    } catch (_) {
      return '';
    }
  }

  // --- CONSULTATION CONTEXT ---
  function setupConsultationContext() {
    const appt = state.appointments.find(a => a.booking_reference === state.appointmentRef);
    el.consultationContextStrip.style.display = 'flex';
    el.contextApptRef.textContent = state.appointmentRef;
    if (appt) {
      el.contextApptService.textContent = appt.service_name;
      el.contextApptDoctor.textContent = appt.doctor_name;
      el.overviewChiefConcern.textContent = `Patient scheduled for ${appt.service_name} with ${appt.doctor_name} at ${appt.appointment_time}. Status: ${appt.status}.`;
    }
  }

  // --- POPULATE TAXONOMY DROPDOWN ---
  function populateTaxonomyDropdown() {
    el.findingTypeSelect.innerHTML = '';
    for (const tax of state.taxonomy) {
      const opt = document.createElement('option');
      opt.value = tax.id;
      opt.textContent = `${tax.label} [${tax.category}]`;
      el.findingTypeSelect.appendChild(opt);
    }
  }

  // --- FDI ODONTOGRAM RENDERER ---
  function renderOdontogram() {
    // Adult Quadrants
    // Upper Arch: 18..11 (Right), 21..28 (Left)
    // Lower Arch: 48..41 (Right), 31..38 (Left)
    const upperRight = [18, 17, 16, 15, 14, 13, 12, 11];
    const upperLeft = [21, 22, 23, 24, 25, 26, 27, 28];
    const lowerRight = [48, 47, 46, 45, 44, 43, 42, 41];
    const lowerLeft = [31, 32, 33, 34, 35, 36, 37, 38];

    renderArchGrid(el.upperTeethGrid, upperRight, upperLeft, true);
    renderArchGrid(el.lowerTeethGrid, lowerRight, lowerLeft, false);
  }

  function renderArchGrid(container, rightTeeth, leftTeeth, isUpper) {
    container.innerHTML = '';

    // Right Quad Teeth
    for (const toothNum of rightTeeth) {
      container.appendChild(createToothElement(toothNum, isUpper, true));
    }

    // Midline
    const divider = document.createElement('div');
    divider.className = 'midline-divider';
    divider.title = 'Dental Midline';
    container.appendChild(divider);

    // Left Quad Teeth
    for (const toothNum of leftTeeth) {
      container.appendChild(createToothElement(toothNum, isUpper, false));
    }
  }

  function createToothElement(toothNum, isUpper, isRight) {
    const wrap = document.createElement('div');
    wrap.className = 'tooth-widget';
    if (toothNum === state.selectedTooth) wrap.classList.add('selected');

    // Check findings on this tooth
    const toothFindings = state.findings.filter(f => f.tooth_number === toothNum && f.status !== 'ARCHIVED');
    const hasMissing = toothFindings.some(f => f.finding_type === 'MISSING');
    if (hasMissing) wrap.classList.add('is-missing');

    // Number Label
    const numLabel = document.createElement('span');
    numLabel.className = 'tooth-num-badge mono';
    numLabel.textContent = toothNum;

    // 5-Surface Anatomical SVG
    const svgBox = document.createElement('div');
    svgBox.className = 'tooth-svg-box';
    svgBox.innerHTML = buildToothSvg(toothNum, toothFindings, isUpper, isRight);

    if (isUpper) {
      wrap.appendChild(numLabel);
      wrap.appendChild(svgBox);
    } else {
      wrap.appendChild(svgBox);
      wrap.appendChild(numLabel);
    }

    wrap.addEventListener('click', () => {
      selectTooth(toothNum);
    });

    return wrap;
  }

  function buildToothSvg(toothNum, findings, isUpper, isRight) {
    // Controlled Surfaces: MESIAL, DISTAL, OCCLUSAL, BUCCAL, LINGUAL
    // SVG Size: 44x44
    // Polygons:
    // Center: Occlusal (14,14 30,14 30,30 14,30)
    // Top: (0,0 44,0 30,14 14,14) -> Upper Buccal / Lower Lingual
    // Bottom: (14,30 30,30 44,44 0,44) -> Upper Lingual / Lower Buccal
    // Left: (0,0 14,14 14,30 0,44)
    // Right: (44,0 44,44 30,30 30,14)

    const occClass = getSurfaceClass(findings, 'OCCLUSAL');
    const buccalSurfaceName = isUpper ? 'BUCCAL' : 'LINGUAL';
    const lingualSurfaceName = isUpper ? 'LINGUAL' : 'BUCCAL';
    const topClass = getSurfaceClass(findings, buccalSurfaceName);
    const btmClass = getSurfaceClass(findings, lingualSurfaceName);

    // Left vs Right mesial/distal orientation:
    // For Quadrants 1 & 4 (Right side): Midline is to the RIGHT of the tooth, so Right = Mesial, Left = Distal
    // For Quadrants 2 & 3 (Left side): Midline is to the LEFT of the tooth, so Left = Mesial, Right = Distal
    const leftSurfaceName = isRight ? 'DISTAL' : 'MESIAL';
    const rightSurfaceName = isRight ? 'MESIAL' : 'DISTAL';
    const leftClass = getSurfaceClass(findings, leftSurfaceName);
    const rightClass = getSurfaceClass(findings, rightSurfaceName);

    return `
      <svg viewBox="0 0 44 44" role="img" aria-label="Tooth ${toothNum}">
        <!-- Top Surface -->
        <polygon class="tooth-surface ${topClass}" points="0,0 44,0 30,14 14,14" data-surface="${buccalSurfaceName}"></polygon>
        <!-- Bottom Surface -->
        <polygon class="tooth-surface ${btmClass}" points="14,30 30,30 44,44 0,44" data-surface="${lingualSurfaceName}"></polygon>
        <!-- Left Surface -->
        <polygon class="tooth-surface ${leftClass}" points="0,0 14,14 14,30 0,44" data-surface="${leftSurfaceName}"></polygon>
        <!-- Right Surface -->
        <polygon class="tooth-surface ${rightClass}" points="44,0 44,44 30,30 30,14" data-surface="${rightSurfaceName}"></polygon>
        <!-- Center Surface (Occlusal / Incisal) -->
        <polygon class="tooth-surface ${occClass}" points="14,14 30,14 30,30 14,30" data-surface="OCCLUSAL"></polygon>
      </svg>
    `;
  }

  function getSurfaceClass(findings, surfaceName) {
    // If there is a whole-tooth finding, apply to all
    const whole = findings.find(f => f.surface === 'WHOLE_TOOTH');
    const specific = findings.find(f => f.surface === surfaceName);
    const activeFinding = specific || whole;
    if (!activeFinding) return '';

    switch (activeFinding.finding_type) {
      case 'CARIES': return 'surface-caries';
      case 'RESTORED': return 'surface-restored';
      case 'RCT_DONE': return 'surface-rct';
      case 'CROWN': return 'surface-crown';
      case 'MISSING': return 'surface-missing';
      default: return 'surface-caries';
    }
  }

  function selectTooth(toothNum) {
    state.selectedTooth = toothNum;
    renderOdontogram();
    renderToothInspector();
  }

  // --- TOOTH INSPECTOR RENDERER ---
  function renderToothInspector() {
    const num = state.selectedTooth;
    el.inspectorToothNum.textContent = num;
    el.selectedToothDisplay.textContent = `SELECTED TOOTH: ${num}`;

    // Quadrant Tag
    const qNum = Math.floor(num / 10);
    const qNames = { 1: 'Q1 MAXILLARY RIGHT', 2: 'Q2 MAXILLARY LEFT', 3: 'Q3 MANDIBULAR LEFT', 4: 'Q4 MANDIBULAR RIGHT' };
    el.inspectorQuadrantTag.textContent = qNames[qNum] || 'QUADRANT';
    el.inspectorToothName.textContent = TOOTH_NAMES[num] || `Tooth ${num}`;

    // Findings on this tooth
    const toothFindings = state.findings.filter(f => f.tooth_number === num && f.status !== 'ARCHIVED');
    el.toothFindingsList.innerHTML = '';

    if (toothFindings.length === 0) {
      el.toothFindingsList.innerHTML = '<div style="font-size: 0.8rem; color: var(--ds-muted);">No findings recorded on this tooth.</div>';
    } else {
      for (const f of toothFindings) {
        const row = document.createElement('div');
        row.className = 'finding-item-row';
        row.innerHTML = `
          <div class="finding-info">
            <span class="finding-tag">${f.finding_type}</span>
            <span class="finding-surface">&bull; ${f.surface} ${f.severity ? '(' + f.severity + ')' : ''}</span>
            ${f.notes ? `<div style="font-size: 0.75rem; color: var(--ds-charcoal); margin-top: 2px;">${f.notes}</div>` : ''}
            <div style="font-size: 0.68rem; color: var(--ds-muted); margin-top: 2px;">By ${f.dentist_name} &bull; ${formatDate(f.created_at)}</div>
          </div>
          ${state.role === 'dentist' ? `<button type="button" class="btn-archive-finding" data-id="${f.id}" title="Archive finding">Archive</button>` : ''}
        `;
        el.toothFindingsList.appendChild(row);
      }

      // Wire Archive buttons
      el.toothFindingsList.querySelectorAll('.btn-archive-finding').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const findingId = e.currentTarget.getAttribute('data-id');
          await archiveFinding(findingId);
        });
      });
    }
  }

  // --- RECORD FINDING ACTION ---
  async function saveFinding() {
    if (state.role !== 'dentist') {
      alert('Only licensed dentists are authorized to record clinical findings.');
      return;
    }

    const payload = {
      toothNumber: state.selectedTooth,
      surface: state.selectedSurface,
      findingType: el.findingTypeSelect.value,
      severity: el.findingSeveritySelect.value || null,
      notes: el.findingNotesInput.value.trim() || null,
      appointmentId: state.appointmentRef || null
    };

    try {
      const res = await apiFetch(`/api/patients/${state.patientId}/odontogram/findings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to record finding.');
        return;
      }

      state.findings.push(data.finding);
      el.findingNotesInput.value = '';
      renderOdontogram();
      renderToothInspector();
      await refreshTimeline();
    } catch (err) {
      alert('Network error while saving finding.');
    }
  }

  async function archiveFinding(findingId) {
    if (state.role !== 'dentist') return;

    try {
      const res = await apiFetch(`/api/odontogram/findings/${findingId}/archive`, {
        method: 'POST'
      });

      if (res.ok) {
        state.findings = state.findings.filter(f => f.id !== findingId);
        renderOdontogram();
        renderToothInspector();
        await refreshTimeline();
      }
    } catch (_) {}
  }

  // --- CLINICAL NOTES RENDERER ---
  function renderClinicalNotes() {
    el.clinicalNotesFeed.innerHTML = '';
    if (state.notes.length === 0) {
      el.clinicalNotesFeed.innerHTML = '<p style="color: var(--ds-muted); font-size: 0.85rem;">No clinical notes recorded yet.</p>';
      return;
    }

    for (const note of state.notes) {
      const card = document.createElement('div');
      card.className = 'clinical-note-card';
      card.innerHTML = `
        <div class="note-header-row">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="note-type-badge mono">${note.note_type}</span>
            <span class="note-author-meta">By <strong>${note.dentist_name}</strong></span>
          </div>
          <span class="note-author-meta mono">${formatDateTime(note.created_at)}</span>
        </div>
        ${note.chief_complaint ? `<div style="font-weight: 700; color: var(--ds-navy); margin-bottom: 6px; font-size: 0.9rem;">Chief Concern: ${note.chief_complaint}</div>` : ''}
        <div class="note-body">${note.content}</div>
        ${note.dentist_entered_diagnosis ? `
          <div class="note-diag-box">
            <span class="note-diag-label">Dentist-Entered Diagnosis:</span> ${note.dentist_entered_diagnosis}
          </div>
        ` : ''}
        ${note.advice ? `<div style="margin-top: 8px; font-size: 0.82rem; color: var(--ds-muted);"><strong>Advice:</strong> ${note.advice}</div>` : ''}
      `;
      el.clinicalNotesFeed.appendChild(card);
    }
  }

  // --- TREATMENT PLANS & RECORDS RENDERER ---
  function renderTreatmentPlans() {
    el.treatmentPlansContainer.innerHTML = '';
    el.overviewPlansList.innerHTML = '';

    if (state.treatmentPlans.length === 0) {
      el.treatmentPlansContainer.innerHTML = '<p style="color: var(--ds-muted); font-size: 0.85rem;">No active treatment plans recorded.</p>';
      el.overviewPlansList.innerHTML = '<p style="color: var(--ds-muted); font-size: 0.85rem;">No active treatment plans currently scheduled.</p>';
      return;
    }

    // Populate plan select in Performed Treatment modal
    el.perfPlanSelect.innerHTML = '<option value="">-- Direct Procedure (Not planned) --</option>';

    for (const plan of state.treatmentPlans) {
      // Add to modal dropdown
      const opt = document.createElement('option');
      opt.value = plan.id;
      opt.textContent = `${plan.procedure_name} ${plan.tooth_number ? '(Tooth ' + plan.tooth_number + ')' : ''} [${plan.status}]`;
      el.perfPlanSelect.appendChild(opt);

      // Card
      const card = document.createElement('div');
      card.className = 'treatment-item-card';
      card.innerHTML = `
        <div class="treatment-header">
          <span class="treatment-proc-title">${plan.procedure_name}</span>
          <select class="treatment-status-select mono" data-id="${plan.id}" ${state.role !== 'dentist' ? 'disabled' : ''}>
            <option value="PLANNED" ${plan.status === 'PLANNED' ? 'selected' : ''}>PLANNED</option>
            <option value="IN_PROGRESS" ${plan.status === 'IN_PROGRESS' ? 'selected' : ''}>IN_PROGRESS</option>
            <option value="COMPLETED" ${plan.status === 'COMPLETED' ? 'selected' : ''}>COMPLETED</option>
            <option value="CANCELLED" ${plan.status === 'CANCELLED' ? 'selected' : ''}>CANCELLED</option>
          </select>
        </div>
        <div style="font-size: 0.78rem; color: var(--ds-muted);">
          ${plan.tooth_number ? `Tooth: <strong class="mono">${plan.tooth_number}</strong> &bull; ` : ''}
          Priority: <strong>${plan.priority}</strong> &bull; Planned by <strong>${plan.dentist_name}</strong>
        </div>
        ${plan.notes ? `<div style="font-size: 0.82rem; color: var(--ds-charcoal); margin-top: 4px;">${plan.notes}</div>` : ''}
      `;
      el.treatmentPlansContainer.appendChild(card);

      // Overview item
      if (plan.status === 'PLANNED' || plan.status === 'IN_PROGRESS') {
        const ovItem = document.createElement('div');
        ovItem.style.cssText = 'padding: 8px 12px; background: #F8FAFC; border-radius: 6px; margin-bottom: 8px; font-size: 0.82rem; border-left: 3px solid var(--ds-teal);';
        ovItem.innerHTML = `<strong>${plan.procedure_name}</strong> ${plan.tooth_number ? '(Tooth ' + plan.tooth_number + ')' : ''} &bull; <span class="mono">${plan.status}</span>`;
        el.overviewPlansList.appendChild(ovItem);
      }
    }

    // Wire status select change
    el.treatmentPlansContainer.querySelectorAll('.treatment-status-select').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const planId = e.currentTarget.getAttribute('data-id');
        const newStatus = e.currentTarget.value;
        await updatePlanStatus(planId, newStatus);
      });
    });
  }

  async function updatePlanStatus(planId, newStatus) {
    if (state.role !== 'dentist') return;
    try {
      const res = await apiFetch(`/api/treatment-plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        const plan = state.treatmentPlans.find(p => p.id === planId);
        if (plan) plan.status = newStatus;
        renderTreatmentPlans();
        await refreshTimeline();
      }
    } catch (_) {}
  }

  function renderTreatmentRecords() {
    el.treatmentRecordsContainer.innerHTML = '';
    if (state.treatmentRecords.length === 0) {
      el.treatmentRecordsContainer.innerHTML = '<p style="color: var(--ds-muted); font-size: 0.85rem;">No performed treatments recorded yet.</p>';
      return;
    }

    for (const rec of state.treatmentRecords) {
      const card = document.createElement('div');
      card.className = 'treatment-item-card';
      card.innerHTML = `
        <div class="treatment-header">
          <span class="treatment-proc-title">${rec.procedure_name}</span>
          <span class="chip-tag returning mono">PERFORMED</span>
        </div>
        <div style="font-size: 0.78rem; color: var(--ds-muted);">
          ${rec.tooth_number ? `Tooth: <strong class="mono">${rec.tooth_number}</strong> &bull; ` : ''}
          ${rec.surfaces_treated ? `Surfaces: ${rec.surfaces_treated} &bull; ` : ''}
          Performed: <span class="mono">${rec.performed_date}</span> by <strong>${rec.dentist_name}</strong>
        </div>
        ${rec.materials_used ? `<div style="font-size: 0.8rem; color: var(--ds-charcoal); margin-top: 4px;"><strong>Materials:</strong> ${rec.materials_used}</div>` : ''}
        ${rec.clinical_notes ? `<div style="font-size: 0.8rem; color: var(--ds-charcoal); margin-top: 2px;">${rec.clinical_notes}</div>` : ''}
      `;
      el.treatmentRecordsContainer.appendChild(card);
    }
  }

  // --- PRESCRIPTIONS RENDERER ---
  function renderPrescriptions() {
    el.prescriptionsContainer.innerHTML = '';
    if (state.prescriptions.length === 0) {
      el.prescriptionsContainer.innerHTML = '<p style="color: var(--ds-muted); font-size: 0.85rem;">No prescriptions issued yet.</p>';
      return;
    }

    for (const rx of state.prescriptions) {
      const card = document.createElement('div');
      card.className = 'treatment-item-card';
      card.innerHTML = `
        <div class="treatment-header">
          <span class="treatment-proc-title mono">${rx.prescription_number}</span>
          <button type="button" class="btn-outline btn-view-slip" data-id="${rx.id}" style="padding: 3px 8px; font-size: 0.75rem;">
            View / Print Slip &rarr;
          </button>
        </div>
        <div style="font-size: 0.78rem; color: var(--ds-muted);">
          Prescribed: <span class="mono">${rx.prescription_date}</span> &bull; By <strong>${rx.dentist_name}</strong> &bull; 
          <span class="mono">${rx.items ? rx.items.length : 0} items</span>
        </div>
        ${rx.items && rx.items.length > 0 ? `
          <ul style="margin-top: 8px; padding-left: 18px; font-size: 0.82rem;">
            ${rx.items.map(it => `<li><strong>${it.medicine_name}</strong> &middot; ${it.dosage} &middot; ${it.frequency} &middot; ${it.duration}</li>`).join('')}
          </ul>
        ` : ''}
        ${rx.notes ? `<div style="font-size: 0.78rem; color: var(--ds-muted); margin-top: 6px;">Notes: ${rx.notes}</div>` : ''}
      `;
      el.prescriptionsContainer.appendChild(card);
    }

    el.prescriptionsContainer.querySelectorAll('.btn-view-slip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const rxId = e.currentTarget.getAttribute('data-id');
        openPrintablePrescription(rxId);
      });
    });
  }

  async function openPrintablePrescription(rxId) {
    try {
      const res = await apiFetch(`/api/prescriptions/${rxId}`);
      if (!res.ok) return;
      const data = await res.json();
      const rx = data.prescription;

      document.getElementById('slipNumber').textContent = rx.prescription_number;
      document.getElementById('slipPatientName').textContent = rx.patient ? rx.patient.full_name : state.patient.full_name;
      document.getElementById('slipPatientRef').textContent = rx.patient ? rx.patient.patient_reference : state.patient.patient_reference;
      document.getElementById('slipAgeGender').textContent = (rx.patient && rx.patient.gender) || 'Not specified';
      document.getElementById('slipDate').textContent = rx.prescription_date;
      document.getElementById('slipDoctorName').textContent = rx.doctor ? rx.doctor.full_name : rx.dentist_name;
      document.getElementById('slipDoctorQual').textContent = (rx.doctor && rx.doctor.qualifications) || 'BDS, MDS';

      const tbody = document.getElementById('slipItemsBody');
      tbody.innerHTML = '';
      if (rx.items) {
        rx.items.forEach((it, idx) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td class="mono">${idx + 1}</td>
            <td><strong>${it.medicine_name}</strong></td>
            <td class="mono">${it.dosage}</td>
            <td class="mono">${it.frequency}</td>
            <td class="mono">${it.duration}</td>
            <td>${it.instructions || '-'}</td>
          `;
          tbody.appendChild(tr);
        });
      }

      document.getElementById('slipNotesText').textContent = rx.notes || 'Follow oral hygiene routine as advised.';
      showModal(el.printPrescriptionModal);
    } catch (_) {}
  }

  // --- TIMELINE RENDERER ---
  function renderTimeline() {
    el.clinicalTimelineTrack.innerHTML = '';
    if (state.timeline.length === 0) {
      el.clinicalTimelineTrack.innerHTML = '<p style="color: var(--ds-muted); font-size: 0.85rem;">No clinical events recorded yet.</p>';
      return;
    }

    for (const evt of state.timeline) {
      const item = document.createElement('div');
      item.className = 'timeline-event-item';
      item.innerHTML = `
        <div class="timeline-event-card">
          <div class="timeline-event-top">
            <span class="timeline-event-title">${evt.title}</span>
            <span class="timeline-event-time mono">${formatDateTime(evt.timestamp)}</span>
          </div>
          <div class="timeline-event-desc">${evt.description}</div>
          <div style="font-size: 0.72rem; color: var(--ds-muted); margin-top: 4px;">
            Recorded by: <strong>${evt.doctorName || 'Staff'}</strong>
          </div>
        </div>
      `;
      el.clinicalTimelineTrack.appendChild(item);
    }
  }

  async function refreshTimeline() {
    try {
      const timeRes = await apiFetch(`/api/patients/${state.patientId}/timeline`);
      if (timeRes.ok) {
        const timeData = await timeRes.json();
        state.timeline = timeData.events || [];
        renderTimeline();
      }
    } catch (_) {}
  }

  // --- APPOINTMENTS RENDERER ---
  function renderAppointments() {
    el.appointmentsTableBody.innerHTML = '';
    if (state.appointments.length === 0) {
      el.appointmentsTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--ds-muted);">No visits on record.</td></tr>';
      return;
    }

    for (const a of state.appointments) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono"><strong>${a.appointment_date}</strong> ${a.appointment_time}</td>
        <td class="mono"><span class="chip-tag returning">${a.booking_reference}</span></td>
        <td>${a.service_name}</td>
        <td>${a.doctor_name}</td>
        <td><span class="chip-tag ${a.status === 'COMPLETED' ? 'returning' : 'new'} mono">${a.status}</span></td>
        <td>
          <button type="button" class="btn-outline btn-set-context" data-ref="${a.booking_reference}" style="padding: 2px 8px; font-size: 0.72rem;">
            Set As Active Context
          </button>
        </td>
      `;
      el.appointmentsTableBody.appendChild(tr);
    }

    el.appointmentsTableBody.querySelectorAll('.btn-set-context').forEach(btn => {
      btn.addEventListener('click', (e) => {
        state.appointmentRef = e.currentTarget.getAttribute('data-ref');
        setupConsultationContext();
      });
    });
  }

  // --- PHASE 5: FOLLOW-UPS, COMMUNICATION & PREFERENCES ---

  async function loadFollowUps() {
    if (!state.patientId) return;
    try {
      const res = await apiFetch(`/api/patients/${state.patientId}/follow-ups`);
      if (res.ok) {
        const data = await res.json();
        state.followUps = data.follow_ups || [];
        renderFollowUps();
      }
    } catch (err) {
      console.error('Follow-ups error:', err);
    }
  }

  function renderFollowUps() {
    if (!el.patientFollowUpsTbody) return;
    if (state.followUps.length === 0) {
      el.patientFollowUpsTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--ds-muted); padding: 18px;">No follow-ups or recalls scheduled for this patient.</td></tr>';
      return;
    }

    el.patientFollowUpsTbody.innerHTML = '';
    const todayStr = new Date().toISOString().split('T')[0];

    state.followUps.forEach(fu => {
      const tr = document.createElement('tr');
      const isOverdue = fu.due_date < todayStr && fu.status !== 'COMPLETED' && fu.status !== 'CANCELLED' && fu.status !== 'SKIPPED';
      const isDueToday = fu.due_date === todayStr;

      let dateHtml = `<span class="mono" style="font-weight: 600;">${fu.due_date}</span>`;
      if (isOverdue) dateHtml += `<div style="font-size: 0.68rem; color: #DC2626; font-weight: 700;">OVERDUE</div>`;
      else if (isDueToday) dateHtml += `<div style="font-size: 0.68rem; color: #D97706; font-weight: 700;">DUE TODAY</div>`;

      const typeDisplay = (fu.type || 'ROUTINE').replace(/_/g, ' ');
      const statusPill = `<span class="delivery-status-pill delivery-status-${(fu.status || 'pending').toLowerCase()}">${fu.status}</span>`;

      let actionHtml = '';
      if (fu.status === 'COMPLETED' || fu.status === 'CANCELLED' || fu.status === 'SKIPPED') {
        actionHtml = `<span class="mono" style="font-size: 0.72rem; color: var(--ds-muted);">&check; Closed</span>`;
      } else {
        actionHtml = `
          <div style="display: inline-flex; align-items: center; gap: 5px; justify-content: flex-end; white-space: nowrap;">
            <button type="button" class="btn-table-wa" onclick="window.clinicalActions.sendWhatsAppForFollowUp('${fu.id}')" title="Send WhatsApp">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
              <span>WA</span>
            </button>
            <button type="button" class="btn-outline" style="height: 26px; padding: 0 8px; font-size: 0.75rem;" onclick="window.clinicalActions.completeFollowUp('${fu.id}')" title="Mark Done">
              &check; Done
            </button>
          </div>
        `;
      }

      tr.innerHTML = `
        <td>${dateHtml}</td>
        <td>
          <div style="font-weight: 700; color: var(--ds-navy); font-size: 0.85rem;">${typeDisplay}</div>
          <div style="font-size: 0.78rem; color: var(--ds-charcoal);">${fu.reason || ''}</div>
        </td>
        <td class="mono" style="font-size: 0.75rem;">${fu.preferred_channel || 'WHATSAPP'}</td>
        <td>${statusPill}</td>
        <td style="text-align: right;">${actionHtml}</td>
      `;

      el.patientFollowUpsTbody.appendChild(tr);
    });
  }

  async function loadCommunications() {
    if (!state.patientId) return;
    try {
      const res = await apiFetch(`/api/patients/${state.patientId}/communications`);
      if (res.ok) {
        const data = await res.json();
        state.communications = data.communications || [];
        renderCommunications();
      }
    } catch (err) {
      console.error('Communications audit log error:', err);
    }
  }

  function renderCommunications() {
    if (!el.patientCommsTbody) return;
    if (state.communications.length === 0) {
      el.patientCommsTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--ds-muted); padding: 18px;">No communication records found for this patient.</td></tr>';
      return;
    }

    el.patientCommsTbody.innerHTML = '';
    state.communications.forEach(c => {
      const tr = document.createElement('tr');
      const statusClass = `delivery-status-${(c.delivery_status || 'SENT').toLowerCase()}`;
      const statusPill = `<span class="delivery-status-pill ${statusClass}">${c.delivery_status || 'SENT'}</span>`;

      tr.innerHTML = `
        <td class="mono" style="font-size: 0.78rem;">${formatDateTime(c.created_at)}</td>
        <td style="font-weight: 600; color: var(--ds-navy);">${c.template_title || c.template_id}</td>
        <td class="mono" style="font-size: 0.75rem;">${c.channel}</td>
        <td class="mono" style="font-size: 0.78rem;">${c.recipient_phone}</td>
        <td>${statusPill}</td>
        <td class="mono" style="font-size: 0.72rem; color: var(--ds-muted);">
          ${c.created_by || 'System'} &middot; <span title="${c.provider_message_id || ''}">${(c.provider_message_id || '').substring(0, 16)}...</span>
        </td>
      `;
      el.patientCommsTbody.appendChild(tr);
    });
  }

  async function loadCommunicationPreferences() {
    if (!state.patientId) return;
    try {
      const res = await apiFetch(`/api/patients/${state.patientId}/communication-preferences`);
      if (res.ok) {
        const data = await res.json();
        state.preferences = data.preferences;
        if (el.prefChannelSelect) el.prefChannelSelect.value = data.preferences.preferred_channel || 'WHATSAPP';
        if (el.prefWaOptInCheck) el.prefWaOptInCheck.checked = data.preferences.whatsapp_opt_in === 1;
        if (el.prefContactTimeSelect) el.prefContactTimeSelect.value = data.preferences.preferred_contact_time || 'ANYTIME';
        if (el.prefLangSelect) el.prefLangSelect.value = data.preferences.language_preference || 'en';
      }
    } catch (err) {
      console.error('Preferences error:', err);
    }
  }

  async function handleSavePreferences(e) {
    e.preventDefault();
    if (!state.patientId) return;

    try {
      if (el.savePrefsBtn) {
        el.savePrefsBtn.disabled = true;
        el.savePrefsBtn.textContent = 'Saving...';
      }

      const res = await apiFetch(`/api/patients/${state.patientId}/communication-preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferred_channel: el.prefChannelSelect.value,
          whatsapp_opt_in: el.prefWaOptInCheck.checked ? 1 : 0,
          preferred_contact_time: el.prefContactTimeSelect.value,
          language_preference: el.prefLangSelect.value
        })
      });

      if (el.savePrefsBtn) {
        el.savePrefsBtn.disabled = false;
        el.savePrefsBtn.textContent = 'Save Preferences →';
      }

      if (res.ok) {
        alert('Communication preferences saved successfully.');
        await loadCommunicationPreferences();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to update preferences.');
      }
    } catch (err) {
      if (el.savePrefsBtn) {
        el.savePrefsBtn.disabled = false;
        el.savePrefsBtn.textContent = 'Save Preferences →';
      }
      alert('Error updating preferences.');
    }
  }

  function openScheduleFollowUpModal() {
    if (el.pFuDueDateInput) {
      const d = new Date();
      d.setMonth(d.getMonth() + 6);
      el.pFuDueDateInput.value = d.toISOString().split('T')[0];
    }
    if (el.pFuErrorMsg) el.pFuErrorMsg.style.display = 'none';
    showModal(el.scheduleFollowUpModal);
  }

  async function handleCreateFollowUp(e) {
    e.preventDefault();
    if (!state.patientId) return;

    try {
      el.pFuSubmitBtn.disabled = true;
      el.pFuSubmitBtn.textContent = 'Saving Follow-up...';
      if (el.pFuErrorMsg) el.pFuErrorMsg.style.display = 'none';

      const res = await apiFetch(`/api/patients/${state.patientId}/follow-ups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: el.pFuTypeSelect.value,
          due_date: el.pFuDueDateInput.value,
          reason: el.pFuReasonInput.value,
          preferred_channel: el.pFuChannelSelect.value,
          assigned_to: el.pFuAssignedInput.value,
          notes: el.pFuNotesInput.value
        })
      });

      el.pFuSubmitBtn.disabled = false;
      el.pFuSubmitBtn.textContent = 'Save Follow-up →';

      if (res.ok) {
        hideModal(el.scheduleFollowUpModal);
        await loadFollowUps();
        await refreshTimeline();
      } else {
        const err = await res.json();
        el.pFuErrorMsg.textContent = err.error || 'Failed to save follow-up.';
        el.pFuErrorMsg.style.display = 'block';
      }
    } catch (err) {
      el.pFuSubmitBtn.disabled = false;
      el.pFuSubmitBtn.textContent = 'Save Follow-up →';
      el.pFuErrorMsg.textContent = 'Connection error.';
      el.pFuErrorMsg.style.display = 'block';
    }
  }

  async function openPatientWhatsAppModal(templateId, fuId = null) {
    if (!state.patient) return;
    state.currentWaFuId = fuId;

    el.pWaRecipientDisplay.textContent = `Patient: ${state.patient.full_name} (${state.patient.mobile || 'No phone'})`;
    el.pWaErrorMsg.style.display = 'none';
    el.pWaOverrideWrap.style.display = 'none';
    if (el.pWaOverrideCheck) el.pWaOverrideCheck.checked = false;
    el.pWaSendBtn.disabled = false;
    el.pWaSendBtn.textContent = 'Send via WhatsApp →';

    const optedIn = state.preferences ? state.preferences.whatsapp_opt_in === 1 : true;
    if (optedIn) {
      el.pWaConsentDisplay.className = 'delivery-status-pill delivery-status-delivered';
      el.pWaConsentDisplay.innerHTML = '&check; WhatsApp Opted-In';
      el.pWaOverrideWrap.style.display = 'none';
    } else {
      el.pWaConsentDisplay.className = 'delivery-status-pill delivery-status-failed';
      el.pWaConsentDisplay.innerHTML = '&times; WhatsApp Opted-Out';
      el.pWaOverrideWrap.style.display = 'block';
    }

    if (templateId && el.pWaTemplateSelect) {
      el.pWaTemplateSelect.value = templateId;
    }

    await updatePatientWhatsAppPreview();
    showModal(el.patientWhatsAppModal);
  }

  async function updatePatientWhatsAppPreview() {
    if (!state.patient) return;
    const templateId = el.pWaTemplateSelect.value;
    const p = state.patient;

    const variables = {
      patient_name: p.full_name || 'Valued Patient',
      doctor_name: state.staffName || 'Dr. Aryan Sharma',
      appointment_date: new Date().toISOString().split('T')[0],
      appointment_time: '10:00 AM',
      booking_reference: state.appointmentRef || 'DS-000000',
      follow_up_date: new Date().toISOString().split('T')[0]
    };

    try {
      const res = await apiFetch('/api/communication/whatsapp/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: templateId,
          variables,
          patient_id: p.id,
          recipient_phone: p.mobile
        })
      });

      if (res.ok) {
        const data = await res.json();
        el.pWaBubbleText.textContent = data.interpolated_body;
        el.pWaBubbleTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        const err = await res.json();
        el.pWaBubbleText.textContent = err.error || 'Preview failed.';
      }
    } catch (_) {
      el.pWaBubbleText.textContent = 'Preview error.';
    }
  }

  async function handleSendPatientWhatsApp() {
    if (!state.patient) return;
    const templateId = el.pWaTemplateSelect.value;
    const p = state.patient;
    const override = el.pWaOverrideCheck ? el.pWaOverrideCheck.checked : false;

    const variables = {
      patient_name: p.full_name || 'Valued Patient',
      doctor_name: state.staffName || 'Dr. Aryan Sharma',
      appointment_date: new Date().toISOString().split('T')[0],
      appointment_time: '10:00 AM',
      booking_reference: state.appointmentRef || 'DS-000000',
      follow_up_date: new Date().toISOString().split('T')[0]
    };

    try {
      el.pWaSendBtn.disabled = true;
      el.pWaSendBtn.textContent = 'Sending...';
      el.pWaErrorMsg.style.display = 'none';

      const res = await apiFetch('/api/communication/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: templateId,
          variables,
          patient_id: p.id,
          recipient_phone: p.mobile,
          follow_up_id: state.currentWaFuId,
          override_opt_out: override
        })
      });

      const data = await res.json();
      el.pWaSendBtn.disabled = false;
      el.pWaSendBtn.textContent = 'Send via WhatsApp →';

      if (res.ok && data.success) {
        alert(`WhatsApp notification dispatched successfully (${data.provider_message_id})`);
        hideModal(el.patientWhatsAppModal);
        if (state.currentWaFuId) {
          await apiFetch(`/api/follow-ups/${state.currentWaFuId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'CONTACTED', contacted_via: 'WHATSAPP', notes: 'WhatsApp message sent.' })
          });
        }
        await loadFollowUps();
        await loadCommunications();
        await refreshTimeline();
      } else {
        el.pWaErrorMsg.textContent = data.error || 'Failed to dispatch WhatsApp message.';
        el.pWaErrorMsg.style.display = 'block';
      }
    } catch (err) {
      el.pWaSendBtn.disabled = false;
      el.pWaSendBtn.textContent = 'Send via WhatsApp →';
      el.pWaErrorMsg.textContent = 'Server connection error.';
      el.pWaErrorMsg.style.display = 'block';
    }
  }

  // Clinical Actions on window.clinicalActions
  window.clinicalActions = {
    sendWhatsAppForFollowUp: function (fuId) {
      const fu = state.followUps.find(f => f.id === fuId);
      const tpl = fu && fu.type && fu.type.includes('RECALL') ? 'tpl_recall_reminder' : 'tpl_followup_reminder';
      openPatientWhatsAppModal(tpl, fuId);
    },

    completeFollowUp: async function (fuId) {
      if (!window.confirm('Mark this follow-up as completed?')) return;
      try {
        const res = await apiFetch(`/api/follow-ups/${fuId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'COMPLETED', notes: 'Completed in clinical chart.' })
        });
        if (res.ok) {
          await loadFollowUps();
          await refreshTimeline();
        }
      } catch (_) {}
    }
  };

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    // Tabs Navigation
    el.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        el.tabButtons.forEach(b => b.classList.remove('active'));
        el.panels.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const targetPanel = document.getElementById(targetId);
        if (targetPanel) targetPanel.classList.add('active');
      });
    });

    if (el.jumpToTreatmentTabBtn) {
      el.jumpToTreatmentTabBtn.addEventListener('click', () => {
        document.getElementById('tabTreatment').click();
      });
    }

    // Phase 5 Listeners
    if (el.patientCommPrefsForm) el.patientCommPrefsForm.addEventListener('submit', handleSavePreferences);
    if (el.openScheduleFollowUpBtn) el.openScheduleFollowUpBtn.addEventListener('click', openScheduleFollowUpModal);
    if (el.scheduleFuClose) el.scheduleFuClose.addEventListener('click', () => hideModal(el.scheduleFollowUpModal));
    if (el.scheduleFollowUpForm) el.scheduleFollowUpForm.addEventListener('submit', handleCreateFollowUp);
    if (el.openPatientWaModalBtn) el.openPatientWaModalBtn.addEventListener('click', () => openPatientWhatsAppModal('tpl_followup_reminder'));
    if (el.patientWaClose) el.patientWaClose.addEventListener('click', () => hideModal(el.patientWhatsAppModal));
    if (el.pWaCancelBtn) el.pWaCancelBtn.addEventListener('click', () => hideModal(el.patientWhatsAppModal));
    if (el.pWaTemplateSelect) el.pWaTemplateSelect.addEventListener('change', updatePatientWhatsAppPreview);
    if (el.pWaSendBtn) el.pWaSendBtn.addEventListener('click', handleSendPatientWhatsApp);

    // Staff PIN Switching
    el.staffSwitchBtn.addEventListener('click', () => showModal(el.staffLoginModal));
    el.loginModalClose.addEventListener('click', () => hideModal(el.staffLoginModal));

    document.querySelectorAll('.preset-pin-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const pin = e.currentTarget.getAttribute('data-pin');
        el.pinInput.value = pin;
        await loginWithPin(pin);
      });
    });

    el.staffPinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await loginWithPin(el.pinInput.value);
    });

    // Surface Selection Buttons
    el.surfacePicker.querySelectorAll('.surface-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        el.surfacePicker.querySelectorAll('.surface-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        state.selectedSurface = e.currentTarget.getAttribute('data-surface');
      });
    });

    // Save Finding Button
    el.saveFindingBtn.addEventListener('click', saveFinding);

    // Complete Consultation Button
    if (el.completeConsultationBtn) {
      el.completeConsultationBtn.addEventListener('click', async () => {
        if (!state.appointmentRef) return;
        if (confirm(`Complete active consultation for booking ${state.appointmentRef}?`)) {
          alert('Consultation marked completed.');
          el.consultationContextStrip.style.display = 'none';
        }
      });
    }

    // Clinical Note Modal
    if (el.openAddNoteModalBtn) {
      el.openAddNoteModalBtn.addEventListener('click', () => showModal(el.addNoteModal));
    }
    el.addNoteClose.addEventListener('click', () => hideModal(el.addNoteModal));

    el.clinicalNoteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.role !== 'dentist') return;

      const payload = {
        noteType: document.getElementById('noteTypeSelect').value,
        chiefComplaint: document.getElementById('noteChiefComplaintInput').value.trim(),
        clinicalObservations: document.getElementById('noteObservationsInput').value.trim(),
        dentistEnteredDiagnosis: document.getElementById('noteDiagnosisInput').value.trim(),
        advice: document.getElementById('noteAdviceInput').value.trim(),
        content: document.getElementById('noteContentInput').value.trim(),
        appointmentId: state.appointmentRef || null
      };

      try {
        const res = await apiFetch(`/api/patients/${state.patientId}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok) {
          state.notes.unshift(data.note);
          renderClinicalNotes();
          hideModal(el.addNoteModal);
          el.clinicalNoteForm.reset();
          await refreshTimeline();
        } else {
          alert(data.error || 'Failed to save note.');
        }
      } catch (_) {}
    });

    // Treatment Plan Modal
    if (el.openAddPlanModalBtn) {
      el.openAddPlanModalBtn.addEventListener('click', () => showModal(el.addPlanModal));
    }
    el.addPlanClose.addEventListener('click', () => hideModal(el.addPlanModal));

    el.treatmentPlanForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.role !== 'dentist') return;

      const payload = {
        procedureName: document.getElementById('planProcedureInput').value.trim(),
        toothNumber: document.getElementById('planToothInput').value ? parseInt(document.getElementById('planToothInput').value, 10) : null,
        priority: document.getElementById('planPrioritySelect').value,
        notes: document.getElementById('planNotesInput').value.trim() || null,
        appointmentId: state.appointmentRef || null
      };

      try {
        const res = await apiFetch(`/api/patients/${state.patientId}/treatment-plans`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok) {
          state.treatmentPlans.unshift(data.plan);
          renderTreatmentPlans();
          hideModal(el.addPlanModal);
          el.treatmentPlanForm.reset();
          await refreshTimeline();
        } else {
          alert(data.error || 'Failed to save plan.');
        }
      } catch (_) {}
    });

    // Record Performed Treatment Modal
    if (el.openRecordTreatmentModalBtn) {
      el.openRecordTreatmentModalBtn.addEventListener('click', () => showModal(el.recordTreatmentModal));
    }
    el.recordTreatmentClose.addEventListener('click', () => hideModal(el.recordTreatmentModal));

    el.performedTreatmentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.role !== 'dentist') return;

      const payload = {
        patientId: state.patientId,
        treatmentPlanId: el.perfPlanSelect.value || null,
        procedureName: document.getElementById('perfProcedureInput').value.trim(),
        toothNumber: document.getElementById('perfToothInput').value ? parseInt(document.getElementById('perfToothInput').value, 10) : null,
        surfacesTreated: document.getElementById('perfSurfacesInput').value.trim() || null,
        materialsUsed: document.getElementById('perfMaterialsInput').value.trim() || null,
        clinicalNotes: document.getElementById('perfNotesInput').value.trim() || null,
        performedDate: new Date().toISOString().split('T')[0],
        appointmentId: state.appointmentRef || null
      };

      try {
        const res = await apiFetch('/api/treatment-records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok) {
          state.treatmentRecords.unshift(data.record);
          renderTreatmentRecords();
          hideModal(el.recordTreatmentModal);
          el.performedTreatmentForm.reset();
          // Also refresh plans if linked
          if (payload.treatmentPlanId) {
            const p = state.treatmentPlans.find(x => x.id === payload.treatmentPlanId);
            if (p) p.status = 'COMPLETED';
            renderTreatmentPlans();
          }
          await refreshTimeline();
        } else {
          alert(data.error || 'Failed to record treatment.');
        }
      } catch (_) {}
    });

    // Prescription Modal
    if (el.openNewPrescriptionModalBtn) {
      el.openNewPrescriptionModalBtn.addEventListener('click', () => {
        resetRxItemRows();
        showModal(el.newPrescriptionModal);
      });
    }
    el.newRxClose.addEventListener('click', () => hideModal(el.newPrescriptionModal));
    el.addRxItemRowBtn.addEventListener('click', addRxItemRow);

    el.prescriptionForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.role !== 'dentist') return;

      const items = [];
      const rows = el.rxItemsContainer.querySelectorAll('.rx-item-input-row');
      rows.forEach(r => {
        const medName = r.querySelector('.rx-med-name').value.trim();
        if (medName) {
          items.push({
            medicine_name: medName,
            dosage: r.querySelector('.rx-dosage').value.trim(),
            frequency: r.querySelector('.rx-freq').value.trim(),
            duration: r.querySelector('.rx-dur').value.trim(),
            instructions: r.querySelector('.rx-inst').value.trim()
          });
        }
      });

      if (items.length === 0) {
        alert('Please add at least one medication item.');
        return;
      }

      const payload = {
        appointmentId: state.appointmentRef || null,
        notes: document.getElementById('rxNotesInput').value.trim() || null,
        items
      };

      try {
        const res = await apiFetch(`/api/patients/${state.patientId}/prescriptions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok) {
          state.prescriptions.unshift(data.prescription);
          renderPrescriptions();
          hideModal(el.newPrescriptionModal);
          await refreshTimeline();
          openPrintablePrescription(data.prescription.id);
        } else {
          alert(data.error || 'Failed to issue prescription.');
        }
      } catch (_) {}
    });

    // Print Rx Modal Close
    el.printRxClose.addEventListener('click', () => hideModal(el.printPrescriptionModal));

    // Alerts Modal
    el.openAlertsModalBtn.addEventListener('click', () => {
      el.alertsInput.value = (state.patient && state.patient.dentist_entered_alerts) || '';
      showModal(el.editAlertsModal);
    });
    el.editAlertsClose.addEventListener('click', () => hideModal(el.editAlertsModal));

    el.clinicianAlertsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.role !== 'dentist') {
        alert('Only dentists can update clinician alerts.');
        return;
      }

      const newAlerts = el.alertsInput.value.trim();
      try {
        const res = await apiFetch(`/api/patients/${state.patientId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dentist_entered_alerts: newAlerts })
        });

        if (res.ok) {
          const data = await res.json();
          state.patient = data.patient;
          renderPatientBanner();
          hideModal(el.editAlertsModal);
        }
      } catch (_) {}
    });

    // Demographics Modal
    el.openEditDemographicsBtn.addEventListener('click', () => {
      if (!state.patient) return;
      el.demoFullName.value = state.patient.full_name || '';
      el.demoMobile.value = state.patient.mobile || '';
      el.demoEmail.value = state.patient.email || '';
      el.demoDob.value = state.patient.date_of_birth || '';
      el.demoGender.value = state.patient.gender || '';
      showModal(el.editDemographicsModal);
    });
    el.editDemoClose.addEventListener('click', () => hideModal(el.editDemographicsModal));

    el.demographicsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        full_name: el.demoFullName.value.trim(),
        mobile: el.demoMobile.value.trim(),
        email: el.demoEmail.value.trim() || null,
        date_of_birth: el.demoDob.value || null,
        gender: el.demoGender.value || null
      };

      try {
        const res = await apiFetch(`/api/patients/${state.patientId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const data = await res.json();
          state.patient = data.patient;
          renderPatientBanner();
          hideModal(el.editDemographicsModal);
        }
      } catch (_) {}
    });
  }

  // --- PRESCRIPTION ROW HELPERS ---
  function resetRxItemRows() {
    el.rxItemsContainer.innerHTML = '';
    addRxItemRow();
  }

  function addRxItemRow() {
    const row = document.createElement('div');
    row.className = 'rx-item-input-row';
    row.innerHTML = `
      <input type="text" class="form-input rx-med-name" placeholder="Medication Name *" required>
      <input type="text" class="form-input mono rx-dosage" placeholder="Dosage (e.g. 500mg)">
      <input type="text" class="form-input mono rx-freq" placeholder="Freq (e.g. 1-0-1)">
      <input type="text" class="form-input mono rx-dur" placeholder="Duration (e.g. 5d)">
      <input type="text" class="form-input rx-inst" placeholder="Instructions (e.g. After food)">
      <button type="button" class="btn-outline" style="padding: 6px; color: #DC2626;" onclick="this.parentElement.remove()">&times;</button>
    `;
    el.rxItemsContainer.appendChild(row);
  }

  // --- MODAL UTILS ---
  function showModal(modal) {
    if (modal) modal.style.display = 'flex';
  }

  function hideModal(modal) {
    if (modal) modal.style.display = 'none';
  }

  function formatDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
           d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  // Run init on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', init);
})();
