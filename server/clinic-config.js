/**
 * Apex Dental Studio / Generic Clinic Configuration Loader
 * Loads centralized clinic branding and allows instant customization for pitching.
 */

const fs = require('fs');
const path = require('path');

const configPath = path.resolve(__dirname, '..', 'clinic.config.json');

const DEFAULT_CONFIG = {
  clinicName: 'Apex Dental Studio',
  tagline: 'Modern Specialist Dental Care & Advanced Practice',
  shortLocation: 'Medical Arts Plaza',
  address: 'Suite 400, Healthcare Plaza, Medical Center Boulevard, Metro City 560001',
  phone: '+91 98765 43210',
  displayPhone: '+91 98765 43210',
  email: 'contact@apexdentaldemo.com',
  website: 'https://apexdentalstudio.com',
  mapsUrl: 'https://maps.google.com/?q=Healthcare+Plaza+Medical+Center',
  hours: {
    weekdays: 'Monday – Saturday: 10:00 AM – 07:30 PM',
    sunday: 'Sunday: 10:00 AM – 02:00 PM (By Appointment)'
  },
  practitioners: [
    {
      id: 'doc_aryan_sharma',
      legacyId: 'doc_anuj_kumar',
      name: 'Dr. Aryan Sharma',
      qualifications: 'BDS, MDS (Oral & Maxillofacial Surgery) · Certified Implantologist',
      specialization: 'Oral & Maxillofacial Surgeon, Specialist Implantologist',
      affiliations: 'Senior Specialist · Maxillofacial Surgery | 15+ Yrs Exp',
      operatory: 'Operatory 1',
      pin: '2048',
      avatar: 'assets/images/doctor-aryan.jpg'
    },
    {
      id: 'doc_priya_mehta',
      legacyId: 'doc_vandana_choudhary',
      name: 'Dr. Priya Mehta',
      qualifications: 'BDS, MDS (Conservative Dentistry & Endodontics)',
      specialization: 'Specialist Endodontist · Restorative Dentist',
      affiliations: 'Apex Dental Studio | 18+ Yrs Exp',
      operatory: 'Operatory 2',
      pin: '4096',
      avatar: 'assets/images/doctor-priya.jpg'
    }
  ]
};

function loadClinicConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.warn('[CONFIG] Failed to parse clinic.config.json, using defaults:', err.message);
  }
  return DEFAULT_CONFIG;
}

module.exports = {
  clinicConfig: loadClinicConfig(),
  loadClinicConfig
};
