// ============================================================
// Prescriptions & Pathology Assignment Service
// Manages doctor prescriptions, pathology assignments
// Uses localStorage for persistence
// ============================================================

const PRESCRIPTIONS_KEY = 'ahm_prescriptions';
const ASSIGNMENTS_KEY = 'ahm_pathology_assignments';

// ==================== PRESCRIPTIONS ====================

/**
 * Get all prescriptions
 */
function getAllPrescriptions() {
  const data = localStorage.getItem(PRESCRIPTIONS_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Save prescriptions
 */
function savePrescriptions(prescriptions) {
  localStorage.setItem(PRESCRIPTIONS_KEY, JSON.stringify(prescriptions));
}

/**
 * Doctor or Pathology adds a prescription/note for a patient
 */
export function addPrescription({
  doctorId,
  doctorName,
  patientId,
  patientName,
  text,
  pathologyId,
  pathologyName,
  authorRole = 'doctor',
  authorName,
}) {
  const prescriptions = getAllPrescriptions();

  const prescription = {
    id: 'rx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    authorRole,
    authorName: authorName || (authorRole === 'pathology' ? (pathologyName || 'Pathology Lab') : (doctorName ? `Dr. ${doctorName}` : 'Doctor')),
    doctorId: doctorId || null,
    doctorName: doctorName || null,
    pathologyId: pathologyId || null,
    pathologyName: pathologyName || null,
    patientId,
    patientName,
    text,
    createdAt: new Date().toISOString(),
  };

  prescriptions.unshift(prescription); // newest first
  savePrescriptions(prescriptions);
  return prescription;
}

/**
 * Get prescriptions visible to a specific doctor:
 * 1. Prescriptions written by the doctor
 * 2. Prescriptions written by pathology labs for patients assigned by this doctor
 */
export function getPrescriptionsByDoctor(doctorId) {
  const myAssignments = getAssignmentsByDoctor(doctorId);
  const myAssignedPatientIds = myAssignments.map(a => a.patientId);

  return getAllPrescriptions().filter(rx => {
    if (rx.doctorId === doctorId) return true;
    if (rx.authorRole === 'pathology' && myAssignedPatientIds.includes(rx.patientId)) {
      return true;
    }
    return false;
  });
}

/**
 * Get prescriptions for a specific patient (patient can see their own)
 */
export function getPrescriptionsForPatient(patientId) {
  return getAllPrescriptions().filter(rx => rx.patientId === patientId);
}

/**
 * Get prescriptions for patients assigned to a specific pathology lab
 * Returns doctor prescriptions and the lab's own prescriptions for assigned patients
 */
export function getPrescriptionsForPathology(pathologyId) {
  const assignments = getAssignmentsForPathology(pathologyId);
  const assignedPatientIds = assignments.map(a => a.patientId);
  return getAllPrescriptions().filter(rx =>
    assignedPatientIds.includes(rx.patientId) || rx.pathologyId === pathologyId
  );
}

/**
 * Delete a prescription by ID
 */
export function deletePrescription(prescriptionId) {
  const prescriptions = getAllPrescriptions();
  const filtered = prescriptions.filter(rx => rx.id !== prescriptionId);
  savePrescriptions(filtered);
  return { success: true };
}

// ==================== PATHOLOGY ASSIGNMENTS ====================

/**
 * Get all assignments
 */
function getAllAssignments() {
  const data = localStorage.getItem(ASSIGNMENTS_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Save assignments
 */
function saveAssignments(assignments) {
  localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(assignments));
}

/**
 * Doctor assigns a pathology lab to a patient
 * A patient can be assigned to multiple pathology labs by the same or different doctors.
 * But the same doctor can't assign the same patient to the same lab twice.
 */
export function assignPathologyToPatient({ doctorId, doctorName, patientId, patientName, pathologyId, pathologyName }) {
  const assignments = getAllAssignments();

  // Check if this exact assignment already exists
  const existing = assignments.find(
    a => a.doctorId === doctorId && a.patientId === patientId && a.pathologyId === pathologyId
  );
  if (existing) {
    return { success: false, message: `${patientName} is already assigned to ${pathologyName} by you.` };
  }

  const assignment = {
    id: 'assign_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    doctorId,
    doctorName,
    patientId,
    patientName,
    pathologyId,
    pathologyName,
    createdAt: new Date().toISOString(),
  };

  assignments.unshift(assignment);
  saveAssignments(assignments);
  return { success: true, assignment };
}

/**
 * Remove a pathology assignment
 */
export function removeAssignment(assignmentId) {
  const assignments = getAllAssignments();
  const filtered = assignments.filter(a => a.id !== assignmentId);
  saveAssignments(filtered);
  return { success: true };
}

/**
 * Get all assignments made by a specific doctor
 */
export function getAssignmentsByDoctor(doctorId) {
  return getAllAssignments().filter(a => a.doctorId === doctorId);
}

/**
 * Get all assignments for a specific patient (patient sees which pathology labs are assigned)
 */
export function getAssignmentsForPatient(patientId) {
  return getAllAssignments().filter(a => a.patientId === patientId);
}

/**
 * Get all assignments for a specific pathology lab (pathology sees which patients are assigned to them)
 */
export function getAssignmentsForPathology(pathologyId) {
  return getAllAssignments().filter(a => a.pathologyId === pathologyId);
}

/**
 * Get all registered pathology labs (for doctor to choose from when assigning)
 */
export function getAllPathologyLabs() {
  const data = localStorage.getItem('ahm_users');
  const users = data ? JSON.parse(data) : [];
  return users
    .filter(u => u.role === 'pathology')
    .map(u => {
      const { password, ...safe } = u;
      return safe;
    });
}
