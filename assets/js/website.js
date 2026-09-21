/**
 * Patient Website Script
 * Features:
 *   1. Mobile Navigation Drawer (Open / Close / Focus Management)
 *   2. Phase 2 Booking Bridge Modal Dialog
 *   3. FAQ Accordion Expansion
 *   4. Sticky Header Dynamic Shadow
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. Mobile Menu Drawer Navigation
  // ==========================================================================
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const mobileDrawer = document.getElementById('mobileDrawer');
  const mobileDrawerOverlay = document.getElementById('mobileDrawerOverlay');
  const drawerCloseBtn = document.getElementById('drawerCloseBtn');
  const drawerLinks = document.querySelectorAll('.drawer-link');

  let lastFocusedElement = null;

  function openDrawer() {
    if (!mobileDrawer || !mobileDrawerOverlay) return;
    lastFocusedElement = document.activeElement;
    mobileDrawer.classList.add('active');
    mobileDrawerOverlay.classList.add('active');
    mobileDrawer.setAttribute('aria-hidden', 'false');
    if (mobileMenuToggle) {
      mobileMenuToggle.setAttribute('aria-expanded', 'true');
    }
    document.body.style.overflow = 'hidden';

    if (drawerCloseBtn) {
      setTimeout(() => drawerCloseBtn.focus(), 100);
    }
  }

  function closeDrawer() {
    if (!mobileDrawer || !mobileDrawerOverlay) return;
    mobileDrawer.classList.remove('active');
    mobileDrawerOverlay.classList.remove('active');
    mobileDrawer.setAttribute('aria-hidden', 'true');
    if (mobileMenuToggle) {
      mobileMenuToggle.setAttribute('aria-expanded', 'false');
    }
    document.body.style.overflow = '';

    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  }

  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', openDrawer);
  }

  if (drawerCloseBtn) {
    drawerCloseBtn.addEventListener('click', closeDrawer);
  }

  if (mobileDrawerOverlay) {
    mobileDrawerOverlay.addEventListener('click', closeDrawer);
  }

  drawerLinks.forEach(link => {
    link.addEventListener('click', closeDrawer);
  });

  // ==========================================================================
  // 2. Phase 2 Live Appointment Booking
  // ==========================================================================
  // In Phase 2, booking buttons and service cards navigate directly to book.html
  // and specialist/service sub-paths.

  // ==========================================================================
  // 3. FAQ Accordion Toggle
  // ==========================================================================
  const faqItems = document.querySelectorAll('.faq-row-item');
  faqItems.forEach(item => {
    const trigger = item.querySelector('.faq-header-btn');
    if (!trigger) return;

    trigger.addEventListener('click', function () {
      const isOpen = item.classList.contains('active');

      // Close all other items for a clean single-open accordion feel
      faqItems.forEach(otherItem => {
        otherItem.classList.remove('active');
        const otherTrigger = otherItem.querySelector('.faq-header-btn');
        if (otherTrigger) {
          otherTrigger.setAttribute('aria-expanded', 'false');
        }
      });

      // Toggle clicked item
      if (!isOpen) {
        item.classList.add('active');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // ==========================================================================
  // 4. Global Keyboard Listener (Escape key)
  // ==========================================================================
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      if (bookingModal && bookingModal.classList.contains('active')) {
        closeBookingModal();
      } else if (mobileDrawer && mobileDrawer.classList.contains('active')) {
        closeDrawer();
      }
    }
  });

  // ==========================================================================
  // 5. Sticky Header Scroll Indicator
  // ==========================================================================
  const siteHeader = document.querySelector('.site-header');
  window.addEventListener('scroll', function () {
    if (!siteHeader) return;
    if (window.scrollY > 20) {
      siteHeader.style.boxShadow = '0 2px 10px rgba(15, 44, 89, 0.08)';
    } else {
      siteHeader.style.boxShadow = 'none';
    }
  }, { passive: true });

  // ==========================================================================
  // 6. 360° Virtual Tour Redirection
  // ==========================================================================
  const tourTriggers = document.querySelectorAll('.tour-mockup-frame, [data-tour-trigger="true"]');
  tourTriggers.forEach(el => {
    if (el.tagName !== 'A') {
      el.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        const clinicSection = document.getElementById('clinic');
        if (clinicSection) {
          clinicSection.scrollIntoView({ behavior: 'smooth' });
        }
      });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const clinicSection = document.getElementById('clinic');
          if (clinicSection) {
            clinicSection.scrollIntoView({ behavior: 'smooth' });
          }
        }
      });
    }
  });

  // ==========================================================================
  // 7. Search Button Scroll to Services
  // ==========================================================================
  const searchBtn = document.querySelector('.header-search-icon');
  if (searchBtn) {
    searchBtn.addEventListener('click', function () {
      const target = document.getElementById('services');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

})();
