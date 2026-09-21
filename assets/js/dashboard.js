/**
 * Clinic Dashboard & Live Queue Script
 * Phase 3 Implementation
 * Handles operational state, live polling, role switching, queue actions & search
 */

(function () {
  'use strict';

  // --- STATE ---
  const state = {
    token: sessionStorage.getItem('ds_staff_token') || null,
    role: sessionStorage.getItem('ds_staff_role') || 'reception',
    staffName: sessionStorage.getItem('ds_staff_name') || 'Clinic Reception',
    doctorId: sessionStorage.getItem('ds_doctor_id') || null,
    date: new Date().toISOString().split('T')[0],
    activeTab: 'todayFlow',
    todayData: null,
    appointments: [],
    queue: [],
    queueFilterDoc: 'all',
    pendingCheckInAppt: null,
    pollTimer: null,
    searchDebounce: null,
    followUps: [],
    waContext: null
  };

  // --- DOM ELEMENTS ---
  const el = {
    // Header
    liveClock: document.getElementById('dashLiveClock'),
    dateHeader: document.getElementById('dashDateHeader'),
    openSearchBtn: document.getElementById('openSearchBtn'),
    staffRoleBadge: document.getElementById('staffRoleBadge'),
    staffNameDisplay: document.getElementById('staffNameDisplay'),
    staffSwitchBtn: document.getElementById('staffSwitchBtn'),
    roleBadge: document.getElementById('roleBadge'),
    roleBannerText: document.getElementById('roleBannerText'),
    seedDemoDataBtn: document.getElementById('seedDemoDataBtn'),
    dashAlertBar: document.getElementById('dashAlertBar'),
    dashAlertText: document.getElementById('dashAlertText'),
    dashAlertClose: document.getElementById('dashAlertClose'),

    // Sub-Nav Tabs
    tabTodayFlow: document.getElementById('tabTodayFlow'),
    tabAppointments: document.getElementById('tabAppointments'),
    tabLiveQueue: document.getElementById('tabLiveQueue'),
    tabFollowUps: document.getElementById('tabFollowUps'),
    panelTodayFlow: document.getElementById('panelTodayFlow'),
    panelAppointments: document.getElementById('panelAppointments'),
    panelLiveQueue: document.getElementById('panelLiveQueue'),
    panelFollowUps: document.getElementById('panelFollowUps'),
    badgeFollowUpCount: document.getElementById('badgeFollowUpCount'),

    // Date Controls
    prevDayBtn: document.getElementById('prevDayBtn'),
    nextDayBtn: document.getElementById('nextDayBtn'),
    jumpTodayBtn: document.getElementById('jumpTodayBtn'),
    dashDateInput: document.getElementById('dashDateInput'),
    manualRefreshBtn: document.getElementById('manualRefreshBtn'),
    pollStatusIndicator: document.getElementById('pollStatusIndicator'),

    // KPIs
    kpiTotal: document.getElementById('kpiTotal'),
    kpiWaiting: document.getElementById('kpiWaiting'),
    kpiInConsult: document.getElementById('kpiInConsult'),
    kpiCompleted: document.getElementById('kpiCompleted'),
    kpiNoShow: document.getElementById('kpiNoShow'),

    // Lanes (Today Flow)
    laneDrAnuj: document.getElementById('laneDrAnuj'),
    laneDrVandana: document.getElementById('laneDrVandana'),
    queueDepthAnuj: document.getElementById('queueDepthAnuj'),
    queueDepthVandana: document.getElementById('queueDepthVandana'),
    nowElapsedAnuj: document.getElementById('nowElapsedAnuj'),
    nowElapsedVandana: document.getElementById('nowElapsedVandana'),
    nowContentAnuj: document.getElementById('nowContentAnuj'),
    nowContentVandana: document.getElementById('nowContentVandana'),
    nowFooterAnuj: document.getElementById('nowFooterAnuj'),
    nowFooterVandana: document.getElementById('nowFooterVandana'),
    nextOrderAnuj: document.getElementById('nextOrderAnuj'),
    nextOrderVandana: document.getElementById('nextOrderVandana'),
    nextContentAnuj: document.getElementById('nextContentAnuj'),
    nextContentVandana: document.getElementById('nextContentVandana'),
    nextFooterAnuj: document.getElementById('nextFooterAnuj'),
    nextFooterVandana: document.getElementById('nextFooterVandana'),

    // Appointments Tab
    filterDoctor: document.getElementById('filterDoctor'),
    filterStatus: document.getElementById('filterStatus'),
    apptFilteredCount: document.getElementById('apptFilteredCount'),
    appointmentsTbody: document.getElementById('appointmentsTbody'),

    // Queue Tab
    queueListContainer: document.getElementById('queueListContainer'),

    // Follow-ups Tab (Phase 5)
    filterFollowUpStatus: document.getElementById('filterFollowUpStatus'),
    filterFollowUpType: document.getElementById('filterFollowUpType'),
    btnRunScheduler: document.getElementById('btnRunScheduler'),
    followUpCountLabel: document.getElementById('followUpCountLabel'),
    btnNewFollowUp: document.getElementById('btnNewFollowUp'),
    fuKpiOverdue: document.getElementById('fuKpiOverdue'),
    fuKpiDueToday: document.getElementById('fuKpiDueToday'),
    fuKpiContacted: document.getElementById('fuKpiContacted'),
    fuKpiCompleted: document.getElementById('fuKpiCompleted'),
    followUpsTbody: document.getElementById('followUpsTbody'),

    // Modals
    checkInModalOverlay: document.getElementById('checkInModalOverlay'),
    checkInModalClose: document.getElementById('checkInModalClose'),
    checkInCancelBtn: document.getElementById('checkInCancelBtn'),
    checkInConfirmBtn: document.getElementById('checkInConfirmBtn'),
    checkInPatientName: document.getElementById('checkInPatientName'),
    checkInDoctorName: document.getElementById('checkInDoctorName'),
    checkInServiceName: document.getElementById('checkInServiceName'),
    checkInRefCode: document.getElementById('checkInRefCode'),

    searchModalOverlay: document.getElementById('searchModalOverlay'),
    searchModalClose: document.getElementById('searchModalClose'),
    dashSearchInput: document.getElementById('dashSearchInput'),
    searchResultsBox: document.getElementById('searchResultsBox'),

    // Login Modal
    loginModalOverlay: document.getElementById('loginModalOverlay'),
    staffLoginForm: document.getElementById('staffLoginForm'),
    staffPinInput: document.getElementById('staffPinInput'),
    loginErrorMsg: document.getElementById('loginErrorMsg'),
    loginSubmitBtn: document.getElementById('loginSubmitBtn'),

    // Phase 5 Modals
    whatsappModalOverlay: document.getElementById('whatsappModalOverlay'),
    whatsappModalClose: document.getElementById('whatsappModalClose'),
    whatsappCancelBtn: document.getElementById('whatsappCancelBtn'),
    waRecipientInfo: document.getElementById('waRecipientInfo'),
    waConsentStatus: document.getElementById('waConsentStatus'),
    waTemplateSelect: document.getElementById('waTemplateSelect'),
    waBubbleContent: document.getElementById('waBubbleContent'),
    waPreviewTime: document.getElementById('waPreviewTime'),
    waOverrideOptOutWrap: document.getElementById('waOverrideOptOutWrap'),
    waOverrideOptOutCheck: document.getElementById('waOverrideOptOutCheck'),
    waErrorMsg: document.getElementById('waErrorMsg'),
    waSendBtn: document.getElementById('waSendBtn'),

    createFuModalOverlay: document.getElementById('createFuModalOverlay'),
    createFuModalClose: document.getElementById('createFuModalClose'),
    createFuCancelBtn: document.getElementById('createFuCancelBtn'),
    createFuForm: document.getElementById('createFuForm'),
    fuPatientSelect: document.getElementById('fuPatientSelect'),
    fuTypeSelect: document.getElementById('fuTypeSelect'),
    fuDueDateInput: document.getElementById('fuDueDateInput'),
    fuReasonInput: document.getElementById('fuReasonInput'),
    fuChannelSelect: document.getElementById('fuChannelSelect'),
    fuAssignedInput: document.getElementById('fuAssignedInput'),
    fuNotesInput: document.getElementById('fuNotesInput'),
    fuErrorMsg: document.getElementById('fuErrorMsg'),
    fuSubmitBtn: document.getElementById('fuSubmitBtn')
  };

  // --- INITIALIZATION ---
  async function init() {
    setupClock();
    setupEventListeners();
    el.dashDateInput.value = state.date;

    // Check existing staff authentication
    if (state.token) {
      try {
        const res = await apiFetch('/api/auth/me');
        if (res.ok) {
          const authData = await res.json();
          updateStaffState(authData.role, authData.staffName, authData.doctorId);
          fetchAllData();
          startPolling();
          return;
        }
      } catch (_) {}
    }

    // Default bootstrap: Authenticate as Reception (PIN 1024) for instant operational readiness
    await loginWithPin('1024');
    fetchAllData();
    startPolling();
  }

  // --- CLOCK ---
  function setupClock() {
    function tick() {
      const now = new Date();
      el.liveClock.textContent = now.toLocaleTimeString('en-US', { hour12: true });
      const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
      el.dateHeader.textContent = now.toLocaleDateString('en-US', options);
    }
    tick();
    setInterval(tick, 1000);
  }

  // --- API HELPER WITH STAFF TOKEN & DEV HEADER ---
  async function apiFetch(url, options = {}) {
    options.headers = options.headers || {};
    if (state.token) {
      options.headers['Authorization'] = `Bearer ${state.token}`;
      options.headers['X-Staff-Token'] = state.token;
    }
    options.headers['X-Clinic-Role'] = state.role;

    const res = await fetch(url, options);
    if (res.status === 401) {
      showLoginModal();
    }
    return res;
  }

  // --- NOTIFICATION BANNER ---
  function showToast(msg, isError = false) {
    el.dashAlertText.textContent = msg;
    el.dashAlertBar.style.display = 'flex';
    if (isError) {
      el.dashAlertBar.style.background = '#FEE2E2';
      el.dashAlertBar.style.color = '#991B1B';
      el.dashAlertBar.style.borderColor = '#FECACA';
    } else {
      el.dashAlertBar.style.background = '#FEF3C7';
      el.dashAlertBar.style.color = '#92400E';
      el.dashAlertBar.style.borderColor = '#FDE68A';
    }
    setTimeout(() => {
      el.dashAlertBar.style.display = 'none';
    }, 4500);
  }

  // --- STAFF AUTHENTICATION MANAGEMENT ---
  async function loginWithPin(pin) {
    try {
      const res = await fetch('/api/auth/staff-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: String(pin).trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        if (el.loginErrorMsg) {
          el.loginErrorMsg.textContent = data.error || 'Invalid passcode.';
          el.loginErrorMsg.style.display = 'block';
        }
        return false;
      }

      state.token = data.token;
      sessionStorage.setItem('ds_staff_token', data.token);
      updateStaffState(data.role, data.staffName, data.doctorId);
      hideLoginModal();
      showToast(`Authenticated as ${data.staffName} (${data.role.toUpperCase()})`);
      fetchAllData();
      return true;
    } catch (err) {
      if (el.loginErrorMsg) {
        el.loginErrorMsg.textContent = 'Server connection error.';
        el.loginErrorMsg.style.display = 'block';
      }
      return false;
    }
  }

  function updateStaffState(role, staffName, doctorId) {
    state.role = role;
    state.staffName = staffName;
    state.doctorId = doctorId;

    sessionStorage.setItem('ds_staff_role', role);
    sessionStorage.setItem('ds_staff_name', staffName);
    if (doctorId) {
      sessionStorage.setItem('ds_doctor_id', doctorId);
    } else {
      sessionStorage.removeItem('ds_doctor_id');
    }

    if (el.staffRoleBadge) el.staffRoleBadge.textContent = role.toUpperCase();
    if (el.staffNameDisplay) el.staffNameDisplay.textContent = staffName;

    // Adjust UI views based on role
    if (role === 'reception') {
      el.roleBadge.textContent = 'RECEPTION CONSOLE';
      el.roleBannerText.textContent = 'Full operational view: check in arriving patients, manage doctor queues, and track consultations.';
      el.laneDrAnuj.style.opacity = '1';
      el.laneDrVandana.style.opacity = '1';
      if (el.filterDoctor) el.filterDoctor.value = 'all';
    } else if (role === 'dentist') {
      const isAnuj = doctorId === 'doc_anuj_kumar';
      el.roleBadge.textContent = isAnuj ? 'DENTIST · DR. ARYAN SHARMA' : 'DENTIST · DR. PRIYA MEHTA';
      el.roleBannerText.textContent = `Specialist consultation view for ${staffName}. Call next patient and complete consultations.`;
      el.laneDrAnuj.style.opacity = isAnuj ? '1' : '0.45';
      el.laneDrVandana.style.opacity = isAnuj ? '0.45' : '1';
      if (el.filterDoctor) el.filterDoctor.value = doctorId;
    } else if (role === 'owner') {
      el.roleBadge.textContent = 'CLINIC OWNER OVERSIGHT';
      el.roleBannerText.textContent = 'Read-only operational overview across all specialist schedules, patient arrivals, and clinic flow.';
      el.laneDrAnuj.style.opacity = '1';
      el.laneDrVandana.style.opacity = '1';
      if (el.filterDoctor) el.filterDoctor.value = 'all';
    }
  }

  function showLoginModal() {
    if (el.loginModalOverlay) {
      el.loginModalOverlay.style.display = 'flex';
      el.loginModalOverlay.classList.add('active');
      if (el.loginErrorMsg) el.loginErrorMsg.style.display = 'none';
      if (el.staffPinInput) {
        el.staffPinInput.value = '';
        el.staffPinInput.focus();
      }
    }
  }

  function hideLoginModal() {
    if (el.loginModalOverlay) {
      el.loginModalOverlay.style.display = 'none';
      el.loginModalOverlay.classList.remove('active');
    }
  }

  // --- DATA FETCHING & POLLING ---
  async function fetchAllData() {
    el.pollStatusIndicator.textContent = 'Syncing...';
    try {
      await Promise.all([fetchTodayData(), fetchAppointments(), fetchQueue(), fetchFollowUps()]);
      el.pollStatusIndicator.textContent = 'Live';
    } catch (err) {
      console.error('Data fetch error:', err);
      el.pollStatusIndicator.textContent = 'Stale';
    }
  }

  function startPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(fetchAllData, 4500);
  }

  // 1. Fetch Today Dashboard
  async function fetchTodayData() {
    const res = await apiFetch(`/api/dashboard/today?date=${state.date}`);
    if (!res.ok) throw new Error('Failed to fetch today data');
    const data = await res.json();
    state.todayData = data;
    renderKPIs(data.metrics);
    renderDoctorLanes(data.doctorStates);
  }

  // 2. Fetch Appointments
  async function fetchAppointments() {
    const doc = el.filterDoctor ? el.filterDoctor.value : 'all';
    const status = el.filterStatus ? el.filterStatus.value : 'ALL';
    const res = await apiFetch(`/api/dashboard/appointments?date=${state.date}&doctorId=${doc}&status=${status}`);
    if (!res.ok) throw new Error('Failed to fetch appointments');
    const data = await res.json();
    state.appointments = data.appointments || [];
    renderAppointmentsTable(state.appointments);
  }

  // 3. Fetch Queue
  async function fetchQueue() {
    const res = await apiFetch(`/api/queue?date=${state.date}&doctorId=${state.queueFilterDoc}`);
    if (!res.ok) throw new Error('Failed to fetch queue');
    const data = await res.json();
    state.queue = data.queue || [];
    renderQueueList(state.queue);
  }

  // --- RENDER KPI STRIP ---
  function renderKPIs(metrics) {
    if (!metrics) return;
    el.kpiTotal.textContent = metrics.totalAppointments;
    el.kpiWaiting.textContent = metrics.waiting;
    el.kpiInConsult.textContent = metrics.inConsultation;
    el.kpiCompleted.textContent = metrics.completed;
    el.kpiNoShow.textContent = `${metrics.noShow} / ${metrics.cancelled}`;
  }

  // --- RENDER DOCTOR LANES ---
  function renderDoctorLanes(doctorStates) {
    if (!doctorStates) return;

    doctorStates.forEach(doc => {
      const isAnuj = doc.doctorId === 'doc_anuj_kumar';

      const depthBadge = isAnuj ? el.queueDepthAnuj : el.queueDepthVandana;
      const nowElapsed = isAnuj ? el.nowElapsedAnuj : el.nowElapsedVandana;
      const nowContent = isAnuj ? el.nowContentAnuj : el.nowContentVandana;
      const nowFooter = isAnuj ? el.nowFooterAnuj : el.nowFooterVandana;
      const nextOrder = isAnuj ? el.nextOrderAnuj : el.nextOrderVandana;
      const nextContent = isAnuj ? el.nextContentAnuj : el.nextContentVandana;
      const nextFooter = isAnuj ? el.nextFooterAnuj : el.nextFooterVandana;

      if (!depthBadge) return;

      depthBadge.textContent = `Queue: ${doc.queueDepth} Waiting`;

      const isDentistForThisDoc = state.role === 'dentist' && state.doctorId === doc.doctorId;
      const canOperate = state.role === 'reception' || isDentistForThisDoc;

      // NOW Card
      if (doc.currentPatient) {
        const p = doc.currentPatient;
        const mins = p.called_at ? Math.max(1, Math.round((new Date() - new Date(p.called_at)) / 60000)) : 0;
        nowElapsed.textContent = `${mins} min in consultation`;

        nowContent.innerHTML = `
          <div class="stage-patient-row">
            <span class="token-pill token-pill-now">${p.token_display}</span>
            <span class="stage-patient-name">${p.patient_name}</span>
          </div>
          <div class="stage-service-text">${p.service_name}</div>
          <div class="stage-meta-mono mono">Arrival: ${p.arrival_time ? new Date(p.arrival_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--'}</div>
        `;

        const workspaceUrl = p.patient_id ? `patient.html?id=${encodeURIComponent(p.patient_id)}&appointment=${encodeURIComponent(p.booking_reference || '')}` : 'patient.html';
        const chartLinkHtml = `
          <a href="${workspaceUrl}" class="btn btn-teal" style="text-decoration: none; padding: 6px 12px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 4px;" title="Open Clinical Workspace">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Clinical Workspace &rarr;
          </a>
        `;

        if (canOperate) {
          nowFooter.innerHTML = `
            <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
              ${chartLinkHtml}
              <button type="button" class="btn btn-action-complete" onclick="window.dashboardActions.completeConsultation('${p.id}')">
                Complete Consultation &check;
              </button>
            </div>
          `;
        } else {
          nowFooter.innerHTML = `
            <div style="display: flex; gap: 8px; align-items: center;">
              ${chartLinkHtml}
              ${state.role === 'owner' ? `<span class="mono text-muted" style="font-size: 11px;">Consultation In Progress</span>` : ''}
            </div>
          `;
        }
      } else {
        nowElapsed.textContent = '--';
        nowContent.innerHTML = `<div class="stage-empty-text">Ready for consultation with ${doc.doctorName}</div>`;
        nowFooter.innerHTML = '';
      }

      // NEXT Card
      if (doc.nextPatient) {
        const n = doc.nextPatient;
        nextOrder.textContent = `Token ${n.token_display}`;

        nextContent.innerHTML = `
          <div class="stage-patient-row">
            <span class="token-pill token-pill-next">${n.token_display}</span>
            <span class="stage-patient-name">${n.patient_name}</span>
          </div>
          <div class="stage-service-text">${n.service_name}</div>
          <div class="stage-meta-mono mono">Waiting since: ${n.arrival_time ? new Date(n.arrival_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--'}</div>
        `;

        if (canOperate) {
          nextFooter.innerHTML = `
            <button type="button" class="btn btn-action-call" onclick="window.dashboardActions.callPatient('${n.id}')">
              Call Patient &rarr;
            </button>
          `;
        } else {
          nextFooter.innerHTML = state.role === 'owner' ? `<span class="mono text-muted" style="font-size: 11px;">Waiting in Queue</span>` : '';
        }
      } else {
        nextOrder.textContent = '--';
        nextContent.innerHTML = `<div class="stage-empty-text">No patients waiting in queue</div>`;
        nextFooter.innerHTML = '';
      }
    });
  }

  // --- RENDER APPOINTMENTS TABLE ---
  function renderAppointmentsTable(appointments) {
    el.apptFilteredCount.textContent = `Showing ${appointments.length} appointment${appointments.length === 1 ? '' : 's'}`;

    if (appointments.length === 0) {
      el.appointmentsTbody.innerHTML = `
        <tr>
          <td colspan="7" class="table-loading-cell">No appointments found for this filter criteria.</td>
        </tr>
      `;
      return;
    }

    el.appointmentsTbody.innerHTML = '';

    appointments.forEach(a => {
      const tr = document.createElement('tr');

      // Status pill class
      const statusKey = (a.effectiveStatus || 'CONFIRMED').toLowerCase();
      let statusBadge = `<span class="status-pill status-${statusKey}">${a.effectiveStatus}</span>`;

      // Token Display
      let tokenBadge = a.token_display
        ? `<strong class="mono" style="color: var(--ds-navy);">${a.token_display}</strong>`
        : `<span class="mono text-muted">&ndash;</span>`;

      // Operational Actions
      let actionHtml = '';
      const isReception = state.role === 'reception';
      const isMyDoctor = state.role === 'dentist' && a.doctor_id === state.doctorId;

      if (state.role === 'owner') {
        actionHtml = `<span class="table-action-status oversight">Oversight</span>`;
      } else if ((a.appointment_status === 'CONFIRMED' || a.appointment_status === 'PENDING') && !a.queue_id) {
        if (isReception) {
          actionHtml = `
            <button type="button" class="btn-checkin-sm" onclick="window.dashboardActions.openCheckInModal('${a.booking_reference}')">
              Check In &rarr;
            </button>
          `;
        } else {
          actionHtml = `<span class="table-action-status awaiting">Awaiting Check-In</span>`;
        }
      } else if (a.queue_status === 'WAITING') {
        if (isReception || isMyDoctor) {
          actionHtml = `
            <button type="button" class="btn-action-call" onclick="window.dashboardActions.callPatient('${a.queue_id}')">
              Call &rarr;
            </button>
            <button type="button" class="btn-noshow-sm" onclick="window.dashboardActions.markNoShow('${a.queue_id}')" title="Mark No-Show">
              No Show
            </button>
          `;
        } else {
          actionHtml = `<span class="table-action-status waiting">Waiting in Line</span>`;
        }
      } else if (a.queue_status === 'IN_CONSULTATION') {
        if (isReception || isMyDoctor) {
          actionHtml = `
            <button type="button" class="btn-action-complete" onclick="window.dashboardActions.completeConsultation('${a.queue_id}')">
              Complete &check;
            </button>
          `;
        } else {
          actionHtml = `<span class="table-action-status consulting">In Consultation</span>`;
        }
      } else if (a.effectiveStatus === 'COMPLETED') {
        actionHtml = `<span class="table-action-status done">&check; Done</span>`;
      } else if (a.effectiveStatus === 'NO_SHOW' || a.effectiveStatus === 'CANCELLED') {
        actionHtml = `<span class="table-action-status closed">Closed</span>`;
      }

      const patientUrl = a.patient_id ? `patient.html?id=${encodeURIComponent(a.patient_id)}&appointment=${encodeURIComponent(a.booking_reference)}` : null;
      const chartLinkBtn = patientUrl ? `
        <a href="${patientUrl}" class="btn-table-chart" title="Open Clinical Chart">
          Chart &rarr;
        </a>
      ` : '';

      tr.innerHTML = `
        <td class="mono" style="font-weight: 600; color: var(--ds-navy);">${a.displayTime}</td>
        <td>${tokenBadge}</td>
        <td>
          <div style="font-weight: 700; color: var(--ds-navy);">
            ${patientUrl ? `<a href="${patientUrl}" style="color: var(--ds-navy); text-decoration: underline; text-underline-offset: 2px;" title="Open Clinical Workspace">${a.patient_name}</a>` : a.patient_name}
          </div>
          <div class="mono" style="font-size: 11.5px; color: var(--ds-text-secondary);">${a.patient_phone}</div>
        </td>
        <td>
          <div>${a.service_name}</div>
          <div class="mono" style="font-size: 11px; color: var(--ds-text-muted);">${a.booking_reference}</div>
        </td>
        <td>
          <div style="font-weight: 600; color: var(--ds-navy);">${a.doctor_name}</div>
        </td>
        <td>${statusBadge}</td>
        <td class="col-action" style="text-align: right;">
          <div class="table-actions-cell">
            ${chartLinkBtn}
            <button type="button" class="btn-table-wa" onclick="window.dashboardActions.openWhatsAppForAppt('${a.booking_reference}')" title="Send WhatsApp Notification">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
              <span>WA</span>
            </button>
            ${actionHtml}
          </div>
        </td>
      `;

      el.appointmentsTbody.appendChild(tr);
    });
  }

  // --- RENDER LIVE QUEUE LIST ---
  function renderQueueList(queue) {
    if (queue.length === 0) {
      el.queueListContainer.innerHTML = `
        <div class="queue-empty-state">
          No patients currently checked in for the queue on this date.
        </div>
      `;
      return;
    }

    el.queueListContainer.innerHTML = '';

    queue.forEach(q => {
      const card = document.createElement('div');
      const isConsult = q.status === 'IN_CONSULTATION';
      const isWaiting = q.status === 'WAITING';

      card.className = `queue-entry-card ${isConsult ? 'entry-consult' : (isWaiting ? 'entry-waiting' : '')}`;

      const isReception = state.role === 'reception';
      const isMyDoctor = state.role === 'dentist' && q.doctor_id === state.doctorId;

      let actionButtons = '';
      if (state.role === 'owner') {
        actionButtons = '';
      } else if (isWaiting && (isReception || isMyDoctor)) {
        actionButtons = `
          <button type="button" class="btn btn-teal btn-action-call" style="width: auto;" onclick="window.dashboardActions.callPatient('${q.id}')">
            Call Patient &rarr;
          </button>
          <button type="button" class="btn-noshow-sm" onclick="window.dashboardActions.markNoShow('${q.id}')">
            No Show
          </button>
        `;
      } else if (isConsult && (isReception || isMyDoctor)) {
        actionButtons = `
          <button type="button" class="btn btn-action-complete" style="width: auto;" onclick="window.dashboardActions.completeConsultation('${q.id}')">
            Complete Consultation &check;
          </button>
        `;
      }

      const qPatientUrl = q.patient_id ? `patient.html?id=${encodeURIComponent(q.patient_id)}&appointment=${encodeURIComponent(q.booking_reference || '')}` : null;
      const qChartBtn = qPatientUrl ? `
        <a href="${qPatientUrl}" class="btn-chart-sm" style="text-decoration: none; padding: 4px 10px; font-size: 11.5px; font-weight: 600; background: var(--ds-cream, #FAF8F5); color: var(--ds-teal, #0D5C58); border: 1px solid var(--ds-border, #E2E8F0); border-radius: 4px; display: inline-flex; align-items: center; gap: 3px;" title="Open Clinical Chart">
          Chart &rarr;
        </a>
      ` : '';

      card.innerHTML = `
        <div class="queue-entry-left">
          <div class="queue-entry-token">${q.token_display}</div>
          <div class="queue-entry-info">
            <div class="queue-patient-name">
              ${qPatientUrl ? `<a href="${qPatientUrl}" style="color: inherit; text-decoration: underline; text-underline-offset: 2px;" title="Open Clinical Chart">${q.patient_name}</a>` : q.patient_name}
            </div>
            <div class="queue-meta-text">
              <strong>${q.doctor_name}</strong> &middot; ${q.service_name} &middot;
              <span class="mono">Arrived: ${q.arrival_time ? new Date(q.arrival_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--'}</span>
            </div>
          </div>
        </div>

        <div class="queue-entry-actions">
          <span class="status-pill status-${q.status.toLowerCase()}">${q.status}</span>
          ${qChartBtn}
          ${actionButtons}
        </div>
      `;

      el.queueListContainer.appendChild(card);
    });
  }

  // --- ACTIONS (EXPOSED ON window.dashboardActions) ---
  window.dashboardActions = {
    openCheckInModal: function (reference) {
      const appt = state.appointments.find(a => a.booking_reference === reference);
      if (!appt) return;

      state.pendingCheckInAppt = appt;
      el.checkInPatientName.textContent = appt.patient_name;
      el.checkInDoctorName.textContent = appt.doctor_name;
      el.checkInServiceName.textContent = appt.service_name;
      el.checkInRefCode.textContent = appt.booking_reference;

      el.checkInModalOverlay.classList.add('active');
    },

    confirmCheckIn: async function () {
      if (!state.pendingCheckInAppt) return;
      const ref = state.pendingCheckInAppt.booking_reference;

      try {
        el.checkInConfirmBtn.textContent = 'Assigning Token...';
        el.checkInConfirmBtn.disabled = true;

        const res = await apiFetch(`/api/appointments/${encodeURIComponent(ref)}/check-in?date=${state.date}`, {
          method: 'POST'
        });

        el.checkInConfirmBtn.textContent = 'Confirm Check-In & Assign Token →';
        el.checkInConfirmBtn.disabled = false;
        el.checkInModalOverlay.classList.remove('active');

        if (res.ok) {
          const result = await res.json();
          showToast(`Patient checked in successfully! Daily Token assigned: ${result.tokenDisplay}`);
          fetchAllData();
        } else {
          const err = await res.json();
          showToast(err.error || 'Check-in failed.', true);
        }
      } catch (e) {
        console.error('Check-in error:', e);
        el.checkInConfirmBtn.textContent = 'Confirm Check-In & Assign Token →';
        el.checkInConfirmBtn.disabled = false;
        showToast('Connection error. Please try again.', true);
      }
    },

    callPatient: async function (queueId) {
      try {
        const res = await apiFetch(`/api/queue/${encodeURIComponent(queueId)}/call`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          showToast(`Token ${data.tokenDisplay} called into consultation with ${data.doctorName}`);
          fetchAllData();
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to call patient.', true);
        }
      } catch (e) {
        showToast('Connection error calling patient.', true);
      }
    },

    completeConsultation: async function (queueId) {
      if (!window.confirm('Mark this consultation as completed?')) return;

      try {
        const res = await apiFetch(`/api/queue/${encodeURIComponent(queueId)}/complete`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          showToast(`Consultation for token ${data.tokenDisplay} marked completed.`);
          fetchAllData();
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to complete consultation.', true);
        }
      } catch (e) {
        showToast('Connection error completing consultation.', true);
      }
    },

    markNoShow: async function (queueId) {
      if (!window.confirm('Mark this patient as No-Show for today?')) return;

      try {
        const res = await apiFetch(`/api/queue/${encodeURIComponent(queueId)}/no-show`, { method: 'POST' });
        if (res.ok) {
          showToast('Patient marked as No-Show.');
          fetchAllData();
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to mark as No-Show.', true);
        }
      } catch (e) {
        showToast('Connection error.', true);
      }
    },

    // Phase 5 Follow-up & WhatsApp Actions
    openWhatsAppForAppt: function (reference) {
      const appt = state.appointments.find(a => a.booking_reference === reference);
      if (!appt) return;
      openWhatsAppModal({
        patient_id: appt.patient_id,
        patient_name: appt.patient_name,
        patient_phone: appt.patient_phone,
        booking_reference: appt.booking_reference,
        doctor_name: appt.doctor_name,
        appointment_date: appt.appointment_date,
        appointment_time: appt.displayTime,
        appointment_id: appt.id,
        template_id: 'tpl_appt_reminder'
      });
    },

    openWhatsAppForFollowUp: function (fuId) {
      const fu = state.followUps.find(f => f.id === fuId);
      if (!fu) return;
      openWhatsAppModal({
        patient_id: fu.patient_id,
        patient_name: fu.patient_name,
        patient_phone: fu.patient_phone,
        doctor_name: fu.doctor_name || 'Dr. Aryan Sharma',
        due_date: fu.due_date,
        follow_up_id: fu.id,
        appointment_id: fu.appointment_id,
        template_id: fu.type && fu.type.includes('RECALL') ? 'tpl_recall_reminder' : 'tpl_followup_reminder'
      });
    },

    markFollowUpContacted: async function (fuId) {
      const notes = window.prompt('Enter contact notes (optional):', 'Patient contacted by phone.');
      if (notes === null) return;
      try {
        const res = await apiFetch(`/api/follow-ups/${fuId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'CONTACTED', contacted_via: 'PHONE', notes })
        });
        if (res.ok) {
          showToast('Follow-up marked as contacted.');
          fetchFollowUps();
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to update status.', true);
        }
      } catch (_) {
        showToast('Connection error.', true);
      }
    },

    completeFollowUp: async function (fuId) {
      if (!window.confirm('Mark this follow-up as completed?')) return;
      try {
        const res = await apiFetch(`/api/follow-ups/${fuId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'COMPLETED', notes: 'Completed via clinic console.' })
        });
        if (res.ok) {
          showToast('Follow-up marked as completed.');
          fetchFollowUps();
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to complete follow-up.', true);
        }
      } catch (_) {
        showToast('Connection error.', true);
      }
    },

    skipFollowUp: async function (fuId) {
      const reason = window.prompt('Enter reason for skipping follow-up:', 'Patient indicated no longer needed.');
      if (reason === null) return;
      try {
        const res = await apiFetch(`/api/follow-ups/${fuId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'SKIPPED', notes: reason })
        });
        if (res.ok) {
          showToast('Follow-up marked as skipped.');
          fetchFollowUps();
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to skip follow-up.', true);
        }
      } catch (_) {
        showToast('Connection error.', true);
      }
    }
  };

  // --- PHASE 5: FOLLOW-UPS & WHATSAPP LOGIC ---
  async function fetchFollowUps() {
    try {
      const statusVal = el.filterFollowUpStatus ? el.filterFollowUpStatus.value : 'due_overdue';
      const typeVal = el.filterFollowUpType ? el.filterFollowUpType.value : 'all';

      let endpoint = '/api/follow-ups';
      const params = [];

      if (statusVal === 'due_overdue') {
        endpoint = `/api/follow-ups/due?date=${state.date}`;
      } else {
        if (statusVal !== 'all') params.push(`status=${encodeURIComponent(statusVal)}`);
        if (typeVal !== 'all') params.push(`type=${encodeURIComponent(typeVal)}`);
        if (params.length > 0) endpoint += `?${params.join('&')}`;
      }

      const res = await apiFetch(endpoint);
      if (!res.ok) return;

      const data = await res.json();
      let list = [];
      if (statusVal === 'due_overdue') {
        const overdue = data.overdue || [];
        const due = data.due_today || [];
        list = [...overdue, ...due];
      } else {
        list = data.follow_ups || [];
      }

      state.followUps = list;
      renderFollowUps(list);
      updateFollowUpBadge();
    } catch (err) {
      console.error('Follow-ups fetch error:', err);
    }
  }

  function updateFollowUpBadge() {
    apiFetch(`/api/follow-ups/due?date=${state.date}`).then(async res => {
      if (res.ok) {
        const d = await res.json();
        const totalActionable = (d.overdue ? d.overdue.length : 0) + (d.due_today ? d.due_today.length : 0);
        if (el.badgeFollowUpCount) {
          if (totalActionable > 0) {
            el.badgeFollowUpCount.textContent = totalActionable;
            el.badgeFollowUpCount.style.display = 'inline-flex';
          } else {
            el.badgeFollowUpCount.style.display = 'none';
          }
        }
        if (el.fuKpiOverdue) el.fuKpiOverdue.textContent = d.overdue ? d.overdue.length : 0;
        if (el.fuKpiDueToday) el.fuKpiDueToday.textContent = d.due_today ? d.due_today.length : 0;
      }
    }).catch(() => {});

    apiFetch('/api/follow-ups?status=CONTACTED').then(async res => {
      if (res.ok) {
        const d = await res.json();
        if (el.fuKpiContacted) el.fuKpiContacted.textContent = d.count || 0;
      }
    }).catch(() => {});

    apiFetch('/api/follow-ups?status=COMPLETED').then(async res => {
      if (res.ok) {
        const d = await res.json();
        if (el.fuKpiCompleted) el.fuKpiCompleted.textContent = d.count || 0;
      }
    }).catch(() => {});
  }

  function renderFollowUps(list) {
    if (!el.followUpsTbody) return;
    if (el.followUpCountLabel) {
      el.followUpCountLabel.textContent = `${list.length} follow-up${list.length === 1 ? '' : 's'}`;
    }

    if (list.length === 0) {
      el.followUpsTbody.innerHTML = `
        <tr>
          <td colspan="7" class="table-loading-cell">No follow-ups match the selected criteria.</td>
        </tr>
      `;
      return;
    }

    el.followUpsTbody.innerHTML = '';
    const todayStr = state.date;

    list.forEach(fu => {
      const tr = document.createElement('tr');
      const isOverdue = fu.due_date < todayStr && fu.status !== 'COMPLETED' && fu.status !== 'CANCELLED' && fu.status !== 'SKIPPED';
      const isDueToday = fu.due_date === todayStr;

      let dateBadge = `<span class="mono" style="font-weight: 600;">${fu.due_date}</span>`;
      if (isOverdue) {
        dateBadge += `<div style="font-size: 10px; color: #DC2626; font-weight: 700;">OVERDUE</div>`;
      } else if (isDueToday) {
        dateBadge += `<div style="font-size: 10px; color: #D97706; font-weight: 700;">TODAY</div>`;
      }

      const patientUrl = fu.patient_id ? `patient.html?id=${encodeURIComponent(fu.patient_id)}` : null;
      const patientNameHtml = patientUrl
        ? `<a href="${patientUrl}" style="color: var(--ds-navy); font-weight: 700; text-decoration: underline; text-underline-offset: 2px;">${fu.patient_name || 'Patient'}</a>`
        : `<strong>${fu.patient_name || 'Patient'}</strong>`;

      const typeDisplay = (fu.type || 'ROUTINE').replace(/_/g, ' ');
      const channelPill = `<span class="comm-channel-badge ${fu.preferred_channel === 'PHONE' ? 'phone' : ''}">${fu.preferred_channel || 'WHATSAPP'}</span>`;
      const statusPill = `<span class="status-fu-pill status-fu-${(fu.status || 'PENDING').toLowerCase()}">${fu.status}</span>`;

      let actionButtons = '';
      if (fu.status === 'COMPLETED' || fu.status === 'CANCELLED' || fu.status === 'SKIPPED') {
        actionButtons = `<span class="mono text-muted" style="font-size: 11px;">Terminal (${fu.status})</span>`;
      } else {
        actionButtons = `
          <div class="table-actions-cell">
            <button type="button" class="btn-table-wa" onclick="window.dashboardActions.openWhatsAppForFollowUp('${fu.id}')" title="Send WhatsApp Message">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
              <span>WA</span>
            </button>
            <button type="button" class="btn-table-chart" onclick="window.dashboardActions.markFollowUpContacted('${fu.id}')" title="Mark as Contacted">
              Contacted
            </button>
            <button type="button" class="btn-checkin-sm" onclick="window.dashboardActions.completeFollowUp('${fu.id}')" title="Mark Completed">
              &check; Done
            </button>
            <button type="button" class="btn-noshow-sm" onclick="window.dashboardActions.skipFollowUp('${fu.id}')" title="Skip Follow-up">
              Skip
            </button>
          </div>
        `;
      }

      tr.innerHTML = `
        <td>${dateBadge}</td>
        <td>
          <div>${patientNameHtml}</div>
          <div class="mono" style="font-size: 11.5px; color: var(--ds-text-secondary);">${fu.patient_phone || ''}</div>
        </td>
        <td>
          <div style="font-weight: 600; color: var(--ds-navy); font-size: 13px;">${typeDisplay}</div>
          <div style="font-size: 12px; color: var(--ds-text-secondary);">${fu.reason || ''}</div>
        </td>
        <td>${channelPill}</td>
        <td>${statusPill}</td>
        <td style="font-size: 12px; color: var(--ds-text-secondary);">${fu.assigned_to || '--'}</td>
        <td class="col-action" style="text-align: right;">${actionButtons}</td>
      `;

      el.followUpsTbody.appendChild(tr);
    });
  }

  async function openWhatsAppModal(ctx) {
    state.waContext = ctx;
    el.waErrorMsg.style.display = 'none';
    el.waOverrideOptOutWrap.style.display = 'none';
    if (el.waOverrideOptOutCheck) el.waOverrideOptOutCheck.checked = false;
    el.waSendBtn.disabled = false;
    el.waSendBtn.textContent = 'Send via WhatsApp →';

    el.waRecipientInfo.textContent = `Patient: ${ctx.patient_name} (${ctx.patient_phone || 'No phone'})`;

    let optedIn = true;
    if (ctx.patient_id) {
      try {
        const prefRes = await apiFetch(`/api/patients/${ctx.patient_id}/communication-preferences`);
        if (prefRes.ok) {
          const prefData = await prefRes.json();
          optedIn = prefData.preferences.whatsapp_opt_in === 1;
        }
      } catch (_) {}
    }

    if (optedIn) {
      el.waConsentStatus.className = 'whatsapp-optin-status opted-in';
      el.waConsentStatus.innerHTML = '&check; WhatsApp Opted-In';
      el.waOverrideOptOutWrap.style.display = 'none';
    } else {
      el.waConsentStatus.className = 'whatsapp-optin-status opted-out';
      el.waConsentStatus.innerHTML = '&times; WhatsApp Opted-Out';
      el.waOverrideOptOutWrap.style.display = 'block';
    }

    if (ctx.template_id && el.waTemplateSelect) {
      el.waTemplateSelect.value = ctx.template_id;
    }

    await updateWhatsAppPreview();
    el.whatsappModalOverlay.style.display = 'flex';
    el.whatsappModalOverlay.classList.add('active');
  }

  async function updateWhatsAppPreview() {
    if (!state.waContext) return;
    const templateId = el.waTemplateSelect.value;
    const ctx = state.waContext;

    const variables = {
      patient_name: ctx.patient_name || 'Valued Patient',
      doctor_name: ctx.doctor_name || 'Dr. Aryan Sharma',
      appointment_date: ctx.appointment_date || state.date,
      appointment_time: ctx.appointment_time || '10:00 AM',
      booking_reference: ctx.booking_reference || 'DS-000000',
      follow_up_date: ctx.due_date || state.date
    };

    try {
      const res = await apiFetch('/api/communication/whatsapp/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: templateId,
          variables,
          patient_id: ctx.patient_id,
          recipient_phone: ctx.patient_phone
        })
      });

      if (res.ok) {
        const data = await res.json();
        el.waBubbleContent.textContent = data.interpolated_body;
        el.waPreviewTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        const err = await res.json();
        el.waBubbleContent.textContent = err.error || 'Failed to render preview.';
      }
    } catch (err) {
      el.waBubbleContent.textContent = 'Preview rendering error.';
    }
  }

  async function handleSendWhatsAppMessage() {
    if (!state.waContext) return;
    const templateId = el.waTemplateSelect.value;
    const ctx = state.waContext;
    const override = el.waOverrideOptOutCheck ? el.waOverrideOptOutCheck.checked : false;

    const variables = {
      patient_name: ctx.patient_name || 'Valued Patient',
      doctor_name: ctx.doctor_name || 'Dr. Aryan Sharma',
      appointment_date: ctx.appointment_date || state.date,
      appointment_time: ctx.appointment_time || '10:00 AM',
      booking_reference: ctx.booking_reference || 'DS-000000',
      follow_up_date: ctx.due_date || state.date
    };

    try {
      el.waSendBtn.disabled = true;
      el.waSendBtn.textContent = 'Sending Message...';
      el.waErrorMsg.style.display = 'none';

      const res = await apiFetch('/api/communication/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: templateId,
          variables,
          patient_id: ctx.patient_id,
          recipient_phone: ctx.patient_phone,
          appointment_id: ctx.appointment_id,
          follow_up_id: ctx.follow_up_id,
          override_opt_out: override
        })
      });

      const data = await res.json();
      el.waSendBtn.disabled = false;
      el.waSendBtn.textContent = 'Send via WhatsApp →';

      if (res.ok && data.success) {
        showToast(`WhatsApp message dispatched successfully to ${ctx.patient_name} (${data.provider_message_id})`);
        closeWhatsAppModal();
        if (ctx.follow_up_id) {
          apiFetch(`/api/follow-ups/${ctx.follow_up_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'CONTACTED', contacted_via: 'WHATSAPP', notes: 'WhatsApp reminder sent.' })
          }).then(() => fetchFollowUps());
        }
      } else {
        el.waErrorMsg.textContent = data.error || 'Failed to send WhatsApp message.';
        el.waErrorMsg.style.display = 'block';
      }
    } catch (err) {
      el.waSendBtn.disabled = false;
      el.waSendBtn.textContent = 'Send via WhatsApp →';
      el.waErrorMsg.textContent = err.message || 'Server connection error.';
      el.waErrorMsg.style.display = 'block';
    }
  }

  function closeWhatsAppModal() {
    if (el.whatsappModalOverlay) {
      el.whatsappModalOverlay.style.display = 'none';
      el.whatsappModalOverlay.classList.remove('active');
    }
    state.waContext = null;
  }

  async function openCreateFollowUpModal() {
    await populatePatientsDropdown();
    if (el.fuDueDateInput) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      el.fuDueDateInput.value = tomorrow.toISOString().split('T')[0];
    }
    if (el.createFuModalOverlay) {
      el.createFuModalOverlay.style.display = 'flex';
      el.createFuModalOverlay.classList.add('active');
    }
  }

  function closeCreateFollowUpModal() {
    if (el.createFuModalOverlay) {
      el.createFuModalOverlay.style.display = 'none';
      el.createFuModalOverlay.classList.remove('active');
    }
  }

  async function populatePatientsDropdown() {
    if (!el.fuPatientSelect) return;
    try {
      const res = await apiFetch('/api/patients?limit=50');
      if (res.ok) {
        const data = await res.json();
        el.fuPatientSelect.innerHTML = '<option value="">Select Patient...</option>';
        (data.patients || []).forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = `${p.full_name} (${p.phone})`;
          el.fuPatientSelect.appendChild(opt);
        });
      }
    } catch (_) {}
  }

  // --- SEARCH FUNCTIONALITY ---
  async function performSearch(query) {
    if (query.trim().length < 2) {
      el.searchResultsBox.innerHTML = `<div class="search-hint-text">Type at least 2 characters to search clinic records...</div>`;
      return;
    }

    el.searchResultsBox.innerHTML = `<div class="search-hint-text">Searching records...</div>`;

    try {
      const res = await apiFetch(`/api/dashboard/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();

      if (!data.results || data.results.length === 0) {
        el.searchResultsBox.innerHTML = `<div class="search-hint-text">No patients or appointments found matching "${query}".</div>`;
        return;
      }

      el.searchResultsBox.innerHTML = '';

      data.results.forEach(item => {
        const row = document.createElement('div');
        row.className = 'search-result-item';

        const tokenSpan = item.token_display
          ? `<span class="token-pill token-pill-next" style="font-size: 12px;">${item.token_display}</span>`
          : '';

        const patientWorkspaceUrl = item.patient_id ? `patient.html?id=${encodeURIComponent(item.patient_id)}&appointment=${encodeURIComponent(item.booking_reference || '')}` : null;

        row.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <strong style="color: var(--ds-navy); font-size: 14px;">${item.patient_name}</strong>
                ${tokenSpan}
                <span class="status-pill status-${(item.status || 'CONFIRMED').toLowerCase()}">${item.status}</span>
              </div>
              <div class="mono" style="font-size: 11.5px; color: var(--ds-text-secondary); margin-top: 3px;">
                ${item.patient_phone} &middot; ${item.booking_reference} &middot; ${item.appointment_date} at ${item.displayTime}
              </div>
              <div style="font-size: 12px; color: var(--ds-text-secondary); margin-top: 2px;">
                ${item.doctor_name} &ndash; ${item.service_name}
              </div>
            </div>
            ${patientWorkspaceUrl ? `
              <a href="${patientWorkspaceUrl}" class="btn btn-teal" style="text-decoration: none; padding: 5px 12px; font-size: 12px; font-weight: 600; white-space: nowrap; margin-left: 12px;" onclick="event.stopPropagation();">
                Chart &rarr;
              </a>
            ` : ''}
          </div>
        `;

        if (patientWorkspaceUrl) {
          row.style.cursor = 'pointer';
          row.addEventListener('click', (e) => {
            if (e.target.tagName !== 'A') {
              window.location.href = patientWorkspaceUrl;
            }
          });
        }

        el.searchResultsBox.appendChild(row);
      });
    } catch (e) {
      console.error('Search error:', e);
      el.searchResultsBox.innerHTML = `<div class="search-hint-text">Error querying search results.</div>`;
    }
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    // Switch Staff PIN button
    if (el.staffSwitchBtn) {
      el.staffSwitchBtn.addEventListener('click', showLoginModal);
    }

    // Staff Login Form submission
    if (el.staffLoginForm) {
      el.staffLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pin = el.staffPinInput ? el.staffPinInput.value : '';
        await loginWithPin(pin);
      });
    }

    // Quick Role Preset buttons
    document.querySelectorAll('.preset-role-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pin = btn.dataset.pin;
        if (el.staffPinInput) el.staffPinInput.value = pin;
        await loginWithPin(pin);
      });
    });

    // Sub-Nav Tab switching
    if (el.tabTodayFlow) el.tabTodayFlow.addEventListener('click', () => switchTab('todayFlow'));
    if (el.tabAppointments) el.tabAppointments.addEventListener('click', () => switchTab('appointments'));
    if (el.tabLiveQueue) el.tabLiveQueue.addEventListener('click', () => switchTab('liveQueue'));
    if (el.tabFollowUps) el.tabFollowUps.addEventListener('click', () => switchTab('followUps'));

    function switchTab(tabKey) {
      state.activeTab = tabKey;
      [el.tabTodayFlow, el.tabAppointments, el.tabLiveQueue, el.tabFollowUps].forEach(t => t && t.classList.remove('active'));
      [el.panelTodayFlow, el.panelAppointments, el.panelLiveQueue, el.panelFollowUps].forEach(p => {
        if (p) {
          p.classList.remove('active');
          p.style.display = 'none';
        }
      });

      if (tabKey === 'todayFlow') {
        el.tabTodayFlow.classList.add('active');
        el.panelTodayFlow.classList.add('active');
        el.panelTodayFlow.style.display = '';
      } else if (tabKey === 'appointments') {
        el.tabAppointments.classList.add('active');
        el.panelAppointments.classList.add('active');
        el.panelAppointments.style.display = '';
        fetchAppointments();
      } else if (tabKey === 'liveQueue') {
        el.tabLiveQueue.classList.add('active');
        el.panelLiveQueue.classList.add('active');
        el.panelLiveQueue.style.display = '';
        fetchQueue();
      } else if (tabKey === 'followUps') {
        if (el.tabFollowUps) el.tabFollowUps.classList.add('active');
        if (el.panelFollowUps) {
          el.panelFollowUps.classList.add('active');
          el.panelFollowUps.style.display = '';
        }
        fetchFollowUps();
      }
    }

    // Phase 5 Listeners
    if (el.filterFollowUpStatus) el.filterFollowUpStatus.addEventListener('change', fetchFollowUps);
    if (el.filterFollowUpType) el.filterFollowUpType.addEventListener('change', fetchFollowUps);
    if (el.btnRunScheduler) {
      el.btnRunScheduler.addEventListener('click', async () => {
        try {
          el.btnRunScheduler.disabled = true;
          el.btnRunScheduler.textContent = 'Processing...';
          const res = await apiFetch('/api/communication/scheduler/run', { method: 'POST' });
          const data = await res.json();
          el.btnRunScheduler.disabled = false;
          el.btnRunScheduler.textContent = '⚡ Process Due Queue';
          if (res.ok) {
            showToast(`Scheduler completed: ${data.processed} jobs processed (${data.sent} sent, ${data.failed} failed, ${data.skipped} skipped)`);
            fetchAllData();
          } else {
            showToast(data.error || 'Failed to run scheduler.', true);
          }
        } catch (_) {
          el.btnRunScheduler.disabled = false;
          el.btnRunScheduler.textContent = '⚡ Process Due Queue';
          showToast('Connection error running scheduler.', true);
        }
      });
    }

    if (el.btnNewFollowUp) el.btnNewFollowUp.addEventListener('click', openCreateFollowUpModal);

    // WhatsApp modal listeners
    if (el.whatsappModalClose) el.whatsappModalClose.addEventListener('click', closeWhatsAppModal);
    if (el.whatsappCancelBtn) el.whatsappCancelBtn.addEventListener('click', closeWhatsAppModal);
    if (el.waTemplateSelect) el.waTemplateSelect.addEventListener('change', updateWhatsAppPreview);
    if (el.waSendBtn) el.waSendBtn.addEventListener('click', handleSendWhatsAppMessage);
    if (el.whatsappModalOverlay) {
      el.whatsappModalOverlay.addEventListener('click', (e) => {
        if (e.target === el.whatsappModalOverlay) closeWhatsAppModal();
      });
    }

    // Create follow-up modal listeners
    if (el.createFuModalClose) el.createFuModalClose.addEventListener('click', closeCreateFollowUpModal);
    if (el.createFuCancelBtn) el.createFuCancelBtn.addEventListener('click', closeCreateFollowUpModal);
    if (el.createFuModalOverlay) {
      el.createFuModalOverlay.addEventListener('click', (e) => {
        if (e.target === el.createFuModalOverlay) closeCreateFollowUpModal();
      });
    }
    if (el.createFuForm) {
      el.createFuForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const patientId = el.fuPatientSelect.value;
        if (!patientId) {
          if (el.fuErrorMsg) {
            el.fuErrorMsg.textContent = 'Please select a patient.';
            el.fuErrorMsg.style.display = 'block';
          }
          return;
        }

        try {
          el.fuSubmitBtn.disabled = true;
          el.fuSubmitBtn.textContent = 'Saving Follow-up...';
          if (el.fuErrorMsg) el.fuErrorMsg.style.display = 'none';

          const res = await apiFetch(`/api/patients/${patientId}/follow-ups`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: el.fuTypeSelect.value,
              due_date: el.fuDueDateInput.value,
              reason: el.fuReasonInput.value,
              preferred_channel: el.fuChannelSelect.value,
              assigned_to: el.fuAssignedInput.value,
              notes: el.fuNotesInput.value
            })
          });

          el.fuSubmitBtn.disabled = false;
          el.fuSubmitBtn.textContent = 'Save Follow-up →';

          if (res.ok) {
            showToast('Follow-up scheduled successfully!');
            closeCreateFollowUpModal();
            fetchFollowUps();
          } else {
            const err = await res.json();
            if (el.fuErrorMsg) {
              el.fuErrorMsg.textContent = err.error || 'Failed to schedule follow-up.';
              el.fuErrorMsg.style.display = 'block';
            }
          }
        } catch (err) {
          el.fuSubmitBtn.disabled = false;
          el.fuSubmitBtn.textContent = 'Save Follow-up →';
          if (el.fuErrorMsg) {
            el.fuErrorMsg.textContent = 'Connection error.';
            el.fuErrorMsg.style.display = 'block';
          }
        }
      });
    }

    // Date step navigation
    el.prevDayBtn.addEventListener('click', () => {
      const d = new Date(state.date);
      d.setDate(d.getDate() - 1);
      state.date = d.toISOString().split('T')[0];
      el.dashDateInput.value = state.date;
      fetchAllData();
    });

    el.nextDayBtn.addEventListener('click', () => {
      const d = new Date(state.date);
      d.setDate(d.getDate() + 1);
      state.date = d.toISOString().split('T')[0];
      el.dashDateInput.value = state.date;
      fetchAllData();
    });

    el.jumpTodayBtn.addEventListener('click', () => {
      state.date = new Date().toISOString().split('T')[0];
      el.dashDateInput.value = state.date;
      fetchAllData();
    });

    el.dashDateInput.addEventListener('change', (e) => {
      state.date = e.target.value;
      fetchAllData();
    });

    el.manualRefreshBtn.addEventListener('click', fetchAllData);

    // Filters on Appointments tab
    if (el.filterDoctor) el.filterDoctor.addEventListener('change', fetchAppointments);
    if (el.filterStatus) el.filterStatus.addEventListener('change', fetchAppointments);

    // Filter tabs on Queue tab
    document.querySelectorAll('.q-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.q-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.queueFilterDoc = btn.dataset.qDoc || 'all';
        fetchQueue();
      });
    });

    // Check-In Modal events
    el.checkInModalClose.addEventListener('click', () => el.checkInModalOverlay.classList.remove('active'));
    el.checkInCancelBtn.addEventListener('click', () => el.checkInModalOverlay.classList.remove('active'));
    el.checkInConfirmBtn.addEventListener('click', window.dashboardActions.confirmCheckIn);

    // Search trigger & modal
    el.openSearchBtn.addEventListener('click', () => {
      el.searchModalOverlay.classList.add('active');
      setTimeout(() => el.dashSearchInput.focus(), 100);
    });

    el.searchModalClose.addEventListener('click', () => {
      el.searchModalOverlay.classList.remove('active');
    });

    el.searchModalOverlay.addEventListener('click', (e) => {
      if (e.target === el.searchModalOverlay) {
        el.searchModalOverlay.classList.remove('active');
      }
    });

    // Keyboard shortcuts: Ctrl+K or / opens search, Esc closes modals
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey && e.key.toLowerCase() === 'k') || (e.key === '/' && document.activeElement.tagName !== 'INPUT')) {
        e.preventDefault();
        el.searchModalOverlay.classList.add('active');
        setTimeout(() => el.dashSearchInput.focus(), 100);
      } else if (e.key === 'Escape') {
        el.checkInModalOverlay.classList.remove('active');
        el.searchModalOverlay.classList.remove('active');
        hideLoginModal();
      }
    });

    // Search input debounce
    el.dashSearchInput.addEventListener('input', (e) => {
      clearTimeout(state.searchDebounce);
      state.searchDebounce = setTimeout(() => {
        performSearch(e.target.value);
      }, 250);
    });

    // Explicit Demo Data Seeder button
    el.seedDemoDataBtn.addEventListener('click', async () => {
      try {
        const res = await apiFetch('/api/dashboard/seed-demo', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          showToast(data.message || 'Demo queue data loaded.');
          fetchAllData();
        } else {
          showToast(data.error || 'Failed to seed demo data.', true);
        }
      } catch (e) {
        showToast('Failed to seed demo data.', true);
      }
    });

    // Toast alert close
    el.dashAlertClose.addEventListener('click', () => {
      el.dashAlertBar.style.display = 'none';
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
