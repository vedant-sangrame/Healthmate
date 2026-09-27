// ============================================================
// Doctor Dashboard — Patient monitoring + Emergency Alerts
// + Prescriptions + Pathology Assignment
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useAlerts } from '../../contexts/AlertContext';
import { useToast } from '../../contexts/ToastContext';
import { getAllPatients, deleteUser } from '../../services/auth';
import { fetchChannelData, parseLatestFeed, parseAllFeeds } from '../../services/thingspeak';
import {
  getRecentPatients,
  saveRecentPatient,
  removeRecentPatient,
} from '../../services/patientMonitoring';
import {
  addPrescription,
  getPrescriptionsByDoctor,
  deletePrescription,
  getAllPathologyLabs,
  assignPathologyToPatient,
  getAssignmentsByDoctor,
  removeAssignment,
} from '../../services/prescriptions';
import Sidebar from '../common/Sidebar';
import DeleteAccountSection from '../common/DeleteAccountSection';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'alerts', label: 'Alerts', icon: '🔔' },
  { id: 'patients', label: 'Patients', icon: '👥' },
  { id: 'prescriptions', label: 'Prescriptions', icon: '💊' },
  { id: 'assign', label: 'Assign Lab', icon: '🔬' },
  { id: 'reports', label: 'Reports', icon: '📄' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function DoctorDashboard() {
  const { user } = useAuth();
  const { alerts, unacknowledgedAlerts, acknowledgeAlert, clearAlert } = useAlerts();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientData, setPatientData] = useState(null);
  const [patientHistory, setPatientHistory] = useState([]);
  const [dashDateFrom, setDashDateFrom] = useState('');
  const [dashDateTo, setDashDateTo] = useState('');

  // Channel-based Patient Monitoring & Recents
  const [inputChannelId, setInputChannelId] = useState('');
  const [inputReadKey, setInputReadKey] = useState('');
  const [inputPatientName, setInputPatientName] = useState('');
  const [recentPatients, setRecentPatients] = useState([]);

  // Prescriptions
  const [prescriptions, setPrescriptions] = useState([]);
  const [newPrescription, setNewPrescription] = useState('');
  const [rxPatientId, setRxPatientId] = useState('');

  // Pathology Assignment
  const [pathologyLabs, setPathologyLabs] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [assignPatientId, setAssignPatientId] = useState('');
  const [assignLabId, setAssignLabId] = useState('');
  
  // Reports
  const [reportPatientId, setReportPatientId] = useState('');
  const [reportPatientHistory, setReportPatientHistory] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  const intervalRef = useRef(null);

  // Load patients
  useEffect(() => {
    const loadPatients = () => {
      const pts = getAllPatients();
      setPatients(pts);
    };
    loadPatients();
    const interval = setInterval(loadPatients, 10000);
    return () => clearInterval(interval);
  }, []);

  // Load prescriptions (including those written by pathology labs for assigned patients)
  useEffect(() => {
    if (user?.id) {
      const loadRx = () => setPrescriptions(getPrescriptionsByDoctor(user.id));
      loadRx();
      const interval = setInterval(loadRx, 10000);
      return () => clearInterval(interval);
    }
  }, [user?.id]);

  // Load pathology labs and assignments
  useEffect(() => {
    const loadLabsAndAssignments = () => {
      setPathologyLabs(getAllPathologyLabs());
      if (user?.id) {
        setAssignments(getAssignmentsByDoctor(user.id));
      }
    };
    loadLabsAndAssignments();
    const interval = setInterval(loadLabsAndAssignments, 10000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Load recent monitored patients on mount
  useEffect(() => {
    if (user?.id) {
      setRecentPatients(getRecentPatients(user.id));
    }
  }, [user?.id]);

  // Combined selectable patients (registered + recent monitored custom channels)
  const allSelectablePatients = [
    ...patients,
    ...recentPatients
      .filter(rp => !patients.some(p => String(p.thingspeakChannelId).trim() === String(rp.channelId).trim()))
      .map(rp => ({
        id: rp.id || `channel_${rp.channelId}`,
        name: rp.name || `Patient #${rp.channelId}`,
        email: `ThingSpeak Channel #${rp.channelId}`,
        thingspeakChannelId: rp.channelId,
        thingspeakReadKey: rp.readKey || '',
        isCustom: true,
      })),
  ];

  // Fetch selected patient's data
  const fetchPatientData = useCallback(async () => {
    if (!selectedPatient?.thingspeakChannelId) return;

    try {
      const data = await fetchChannelData(
        selectedPatient.thingspeakChannelId,
        selectedPatient.thingspeakReadKey || '',
        10
      );
      const latest = parseLatestFeed(data);
      setPatientData(latest);

      const histData = await fetchChannelData(
        selectedPatient.thingspeakChannelId,
        selectedPatient.thingspeakReadKey || '',
        100
      );
      const allFeeds = parseAllFeeds(histData);
      setPatientHistory(allFeeds);
    } catch (err) {
      console.error('Error fetching patient data:', err);
    }
  }, [selectedPatient]);

  useEffect(() => {
    if (selectedPatient) {
      fetchPatientData();
      intervalRef.current = setInterval(fetchPatientData, 15000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [selectedPatient, fetchPatientData]);

  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient);
    setReportPatientId(patient.id);
    setPatientData(null);
    setPatientHistory([]);
    setDashDateFrom('');
    setDashDateTo('');
    setActiveTab('dashboard');
  };

  // Load patient by custom ThingSpeak Channel ID
  const handleLoadCustomPatient = (e) => {
    if (e) e.preventDefault();
    const cId = inputChannelId.trim();
    if (!cId) {
      toast.error('Please enter a ThingSpeak Channel ID.');
      return;
    }

    const rKey = inputReadKey.trim();
    const pName = inputPatientName.trim() || `Patient #${cId}`;

    const newMonitored = {
      id: `channel_${cId}`,
      name: pName,
      email: `ThingSpeak Channel #${cId}`,
      thingspeakChannelId: cId,
      thingspeakReadKey: rKey,
      isCustom: true,
    };

    saveRecentPatient(user.id, {
      id: newMonitored.id,
      name: pName,
      channelId: cId,
      readKey: rKey,
    });

    setRecentPatients(getRecentPatients(user.id));
    handleSelectPatient(newMonitored);
    setInputChannelId('');
    setInputReadKey('');
    setInputPatientName('');
    toast.success(`Now monitoring ${pName}!`);
  };

  // 1-Click select from recent patients
  const handleSelectRecentPatient = (recent) => {
    const monitored = {
      id: recent.id || `channel_${recent.channelId}`,
      name: recent.name || `Patient #${recent.channelId}`,
      email: `ThingSpeak Channel #${recent.channelId}`,
      thingspeakChannelId: recent.channelId,
      thingspeakReadKey: recent.readKey || '',
      isCustom: true,
    };
    saveRecentPatient(user.id, recent);
    setRecentPatients(getRecentPatients(user.id));
    handleSelectPatient(monitored);
    toast.success(`Loaded monitoring for ${monitored.name}`);
  };

  // Delete patient from recent monitored list
  const handleDeleteRecentPatient = (e, channelId) => {
    e.stopPropagation();
    const confirmed = window.confirm(`Remove Patient #${channelId} from recent patients?`);
    if (!confirmed) return;

    const updated = removeRecentPatient(user.id, channelId);
    setRecentPatients(updated);

    if (String(selectedPatient?.thingspeakChannelId).trim() === String(channelId).trim()) {
      setSelectedPatient(null);
      setPatientData(null);
      setPatientHistory([]);
    }
    toast.success(`Patient #${channelId} removed from recent list.`);
  };

  // Delete registered patient account
  const handleDeletePatient = (patient) => {
    const confirmed = window.confirm(
      `⚠️ Are you sure you want to delete patient "${patient.name}" (${patient.email})?\n\nThis will permanently remove the patient account and their records.`
    );
    if (!confirmed) return;

    deleteUser(patient.id);
    if (patient.thingspeakChannelId) {
      removeRecentPatient(user.id, patient.thingspeakChannelId);
      setRecentPatients(getRecentPatients(user.id));
    }
    setPatients(getAllPatients());

    if (selectedPatient?.id === patient.id) {
      setSelectedPatient(null);
      setPatientData(null);
      setPatientHistory([]);
    }
    toast.success(`Patient "${patient.name}" deleted successfully.`);
  };

  // Add prescription
  const handleAddPrescription = () => {
    if (!newPrescription.trim() || !rxPatientId) {
      toast.error('Please select a patient and write a prescription.');
      return;
    }

    const patient = allSelectablePatients.find(p => p.id === rxPatientId);
    const rx = addPrescription({
      doctorId: user.id,
      doctorName: user.name,
      patientId: rxPatientId,
      patientName: patient?.name || 'Unknown',
      text: newPrescription.trim(),
    });

    setPrescriptions(prev => [rx, ...prev]);
    setNewPrescription('');
    toast.success('Prescription added! It will be visible to the patient.');
  };

  // Delete prescription (doctor can only delete their own prescriptions)
  const handleDeletePrescription = (rxId) => {
    const rx = prescriptions.find(r => r.id === rxId);
    if (rx && rx.authorRole === 'pathology') {
      toast.error('You cannot delete prescriptions written by a pathology lab.');
      return;
    }
    if (window.confirm('Are you sure you want to delete this prescription?')) {
      deletePrescription(rxId);
      setPrescriptions(prev => prev.filter(r => r.id !== rxId));
      toast.success('Prescription deleted successfully.');
    }
  };

  // Assign pathology lab
  const handleAssignLab = () => {
    if (!assignPatientId || !assignLabId) {
      toast.error('Please select both a patient and a pathology lab.');
      return;
    }

    const patient = patients.find(p => p.id === assignPatientId);
    const lab = pathologyLabs.find(l => l.id === assignLabId);

    const result = assignPathologyToPatient({
      doctorId: user.id,
      doctorName: user.name,
      patientId: assignPatientId,
      patientName: patient?.name || 'Unknown',
      pathologyId: assignLabId,
      pathologyName: lab?.name || 'Unknown Lab',
    });

    if (result.success) {
      setAssignments(prev => [result.assignment, ...prev]);
      setAssignPatientId('');
      setAssignLabId('');
      toast.success(`${patient?.name} has been assigned to ${lab?.name} pathology lab!`);
    } else {
      toast.error(result.message);
    }
  };

  // Remove assignment
  const handleRemoveAssignment = (assignmentId, patientName, labName) => {
    removeAssignment(assignmentId);
    setAssignments(prev => prev.filter(a => a.id !== assignmentId));
    toast.success(`${patientName} has been removed from ${labName}.`);
  };

  const getStatusClass = (bpm, spo2) => {
    if (!bpm && !spo2) return 'info';
    if (bpm < 50 || bpm > 120 || spo2 < 90) return 'danger';
    if (bpm < 60 || bpm > 100 || spo2 < 95) return 'warning';
    return 'success';
  };

  const getStatusLabel = (bpm, spo2) => {
    if (!bpm && !spo2) return 'NO DATA';
    if (bpm < 50 || bpm > 120 || spo2 < 90) return 'CRITICAL';
    if (bpm < 60 || bpm > 100 || spo2 < 95) return 'CHECK';
    return 'NORMAL';
  };

  // Fetch history for report if different from selected patient
  useEffect(() => {
    if (!reportPatientId) return;
    if (reportPatientId === selectedPatient?.id) {
      setReportPatientHistory(patientHistory);
      return;
    }
    const pt = allSelectablePatients.find(p => p.id === reportPatientId);
    if (pt?.thingspeakChannelId) {
      fetchChannelData(pt.thingspeakChannelId, pt.thingspeakReadKey || '', 100)
        .then(data => {
          setReportPatientHistory(parseAllFeeds(data));
        })
        .catch(err => {
          console.error('Error fetching report patient history:', err);
          setReportPatientHistory([]);
        });
    } else {
      setReportPatientHistory([]);
    }
  }, [reportPatientId, selectedPatient, patientHistory, allSelectablePatients]);

  const last10PatientReadings = patientHistory.slice(-10);

  const historyChartData = {
    labels: last10PatientReadings.map(f => new Date(f.timestamp).toLocaleTimeString()),
    datasets: [
      {
        label: 'BPM',
        data: last10PatientReadings.map(f => f.bpm),
        borderColor: '#FF1744',
        backgroundColor: 'rgba(255, 23, 68, 0.05)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 2,
      },
      {
        label: 'SpO2 (%)',
        data: last10PatientReadings.map(f => f.spo2),
        borderColor: '#29B6F6',
        backgroundColor: 'rgba(41, 182, 246, 0.05)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 2,
      },
    ],
  };

  // Filtered checkings for Dashboard Recent Checkings section (from last 1 month, filtered by dashDateFrom/dashDateTo)
  const getFilteredPatientCheckings = () => {
    let list = patientHistory; // already within last 1 month from parseAllFeeds
    if (dashDateFrom || dashDateTo) {
      list = patientHistory.filter(f => {
        const ts = new Date(f.timestamp);
        if (dashDateFrom && ts < new Date(dashDateFrom)) return false;
        if (dashDateTo && ts > new Date(dashDateTo + 'T23:59:59')) return false;
        return true;
      });
    }
    return list;
  };

  const filteredPatientCheckings = getFilteredPatientCheckings();

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#6a6a80', font: { size: 10 }, maxTicksLimit: 10 },
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#6a6a80', font: { size: 10 } },
      },
    },
    plugins: {
      legend: {
        labels: { color: '#a0a0b5', font: { size: 12 }, usePointStyle: true },
      },
    },
  };

  // Report stats calculations (Filtered by date range if provided, up to last 10 checkings from within last 1 month)
  const currentReportData = reportPatientId === selectedPatient?.id ? patientHistory : reportPatientHistory;

  const getDoctorFilteredReportData = () => {
    let list = currentReportData;
    if (dateFrom || dateTo) {
      list = currentReportData.filter(f => {
        const ts = new Date(f.timestamp);
        if (dateFrom && ts < new Date(dateFrom)) return false;
        if (dateTo && ts > new Date(dateTo + 'T23:59:59')) return false;
        return true;
      });
    }
    return list.slice(-10); // Last 10 checkings of the selected range
  };

  const activeReportReadings = getDoctorFilteredReportData();
  const reportBpmVals = activeReportReadings.filter(f => f.bpm).map(f => f.bpm);
  const reportSpo2Vals = activeReportReadings.filter(f => f.spo2).map(f => f.spo2);
  const reportAvgBpm = reportBpmVals.length > 0 ? Math.round(reportBpmVals.reduce((a, b) => a + b, 0) / reportBpmVals.length) : 'N/A';
  const reportAvgSpo2 = reportSpo2Vals.length > 0 ? (reportSpo2Vals.reduce((a, b) => a + b, 0) / reportSpo2Vals.length).toFixed(1) : 'N/A';

  const handleDoctorGenerateReport = () => {
    const patient = allSelectablePatients.find(p => p.id === reportPatientId);
    if (!patient) {
      toast.error('Please select a patient to generate report.');
      return;
    }
    const data = activeReportReadings;
    if (data.length === 0) {
      toast.error('No checking data available for this patient.');
      return;
    }

    const patientRx = prescriptions.filter(rx => rx.patientId === patient.id);

    let csv = 'AI Health Monitor - Patient Medical Report\n';
    csv += `Report Source: Doctor (Dr. ${user.name})\n`;
    csv += `Patient: ${patient.name}\n`;
    csv += `Email: ${patient.email}\n`;
    csv += `Generated On: ${new Date().toLocaleString()}\n`;
    csv += `Readings Included: Last ${data.length} Checkings\n`;
    csv += `Average BPM (Last ${data.length}): ${reportAvgBpm}\n`;
    csv += `Average SpO2 (Last ${data.length}): ${reportAvgSpo2}%\n`;
    csv += '\n--- Prescriptions & Clinical Notes ---\n';
    patientRx.forEach(rx => {
      const author = rx.authorRole === 'pathology' ? `${rx.authorName || 'Pathology Lab'} (Pathology)` : `Dr. ${rx.doctorName || user.name} (Doctor)`;
      csv += `[${new Date(rx.createdAt).toLocaleString()}] ${author}: ${rx.text.replace(/\n/g, ' ')}\n`;
    });
    csv += '\n--- Last 10 Detailed Readings ---\n';
    csv += 'Timestamp,BPM,SpO2(%),ECG,Status\n';
    data.slice().reverse().forEach(f => {
      csv += `${f.timestamp},${f.bpm || ''},${f.spo2 || ''},${f.ecg || ''},${getStatusLabel(f.bpm, f.spo2)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `doctor_health_report_${patient.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success('Report downloaded with last 10 checkings!');
  };

  const handleDoctorPrintReport = () => {
    const patient = allSelectablePatients.find(p => p.id === reportPatientId);
    if (!patient) {
      toast.error('Please select a patient to print report.');
      return;
    }
    const data = activeReportReadings;
    if (data.length === 0) {
      toast.error('No checking data available to print.');
      return;
    }

    const patientRx = prescriptions.filter(rx => rx.patientId === patient.id);

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
      <head>
        <title>Health Report - ${patient.name}</title>
        <style>
          @page {
            size: auto;
            margin: 0mm;
          }
          @media print {
            @page {
              margin: 0mm;
            }
            body {
              padding: 12mm 15mm !important;
            }
          }
          body {
            font-family: Arial, sans-serif;
            padding: 12mm 15mm;
            margin: 0;
            color: #333;
            box-sizing: border-box;
          }
          .report-top-bar {
            text-align: right;
            font-size: 13px;
            font-weight: 600;
            color: #64748b;
            margin-bottom: 12px;
            padding-bottom: 6px;
            border-bottom: 1px solid #e2e8f0;
            width: 100%;
          }
          .report-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #6C63FF;
            padding-bottom: 12px;
            margin-bottom: 15px;
          }
          h1 { color: #6C63FF; margin: 0; font-size: 22px; }
          .source-badge { display: inline-block; background: #EDE9FE; color: #6C63FF; font-weight: bold; padding: 4px 12px; border-radius: 4px; font-size: 13px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 20px 0; }
          .info-item { padding: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
          .info-label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; }
          .info-value { font-size: 16px; font-weight: bold; margin-top: 4px; color: #1e293b; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background: #6C63FF; color: white; padding: 10px; text-align: left; font-size: 13px; }
          td { padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 13px; }
          tr:nth-child(even) { background: #f9f9f9; }
          .rx-section { margin: 20px 0; padding: 15px; background: #f0f0ff; border-radius: 8px; }
          .rx-item { margin: 8px 0; padding: 10px; background: white; border-radius: 6px; border-left: 3px solid #6C63FF; }
          .footer { margin-top: 30px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="report-top-bar">Health Report - ${patient.name}</div>
        <div class="report-header">
          <h1>🏥 AI Health Monitor — Patient Medical Report</h1>
          <div class="source-badge">Generated By: Dr. ${user.name} (Doctor)</div>
        </div>
        <div class="info-grid">
          <div class="info-item"><div class="info-label">Patient Name</div><div class="info-value">${patient.name}</div></div>
          <div class="info-item"><div class="info-label">Email</div><div class="info-value">${patient.email}</div></div>
          <div class="info-item"><div class="info-label">Checkings Included</div><div class="info-value">Last ${data.length} Readings</div></div>
          <div class="info-item"><div class="info-label">Generated On</div><div class="info-value">${new Date().toLocaleString()}</div></div>
          <div class="info-item"><div class="info-label">Avg BPM (Last ${data.length})</div><div class="info-value">${reportAvgBpm}</div></div>
          <div class="info-item"><div class="info-label">Avg SpO2 (Last ${data.length})</div><div class="info-value">${reportAvgSpo2}%</div></div>
        </div>
        ${patientRx.length > 0 ? `
          <h2>💊 Prescriptions & Clinical Notes</h2>
          <div class="rx-section">
            ${patientRx.map(rx => `
              <div class="rx-item">
                <strong>${rx.authorRole === 'pathology' ? '🔬 ' + (rx.authorName || 'Pathology Lab') + ' (Pathology Lab)' : '👨‍⚕️ Dr. ' + (rx.doctorName || user.name) + ' (Doctor)'}</strong> — ${new Date(rx.createdAt).toLocaleString()}<br/>
                ${rx.text}
              </div>
            `).join('')}
          </div>
        ` : ''}
        <h2>📊 Last ${data.length} Checkings / Readings</h2>
        <table>
          <thead><tr><th>Time</th><th>BPM</th><th>SpO2 (%)</th><th>ECG</th><th>Status</th></tr></thead>
          <tbody>
            ${data.slice().reverse().map(f => `
              <tr>
                <td>${new Date(f.timestamp).toLocaleString()}</td>
                <td><strong>${f.bpm || '--'}</strong></td>
                <td><strong>${f.spo2 || '--'}%</strong></td>
                <td>${f.ecg ? Math.round(f.ecg) : '--'}</td>
                <td>${getStatusLabel(f.bpm, f.spo2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="footer">Generated by Dr. ${user.name} (Doctor) via AI Health Monitor &bull; ${new Date().toLocaleString()}</div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="dashboard-layout">
      <div className="app-bg"></div>
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} tabs={TABS} />

      <main className="main-content">
        {/* Emergency Alerts Banner */}
        {unacknowledgedAlerts.length > 0 && (
          <div>
            {unacknowledgedAlerts.map(alert => (
              <div key={alert.id} className="alert-banner">
                <span className="alert-banner-icon">🚨</span>
                <div className="alert-banner-content">
                  <div className="alert-banner-title">
                    EMERGENCY — {alert.patientName}
                  </div>
                  <div className="alert-banner-desc">
                    SOS at {new Date(alert.timestamp).toLocaleString()} •
                    BPM: {alert.bpm} | SpO2: {alert.spo2}%
                  </div>
                </div>
                <div className="alert-banner-actions">
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => {
                      const patient = patients.find(p => p.id === alert.patientId);
                      if (patient) handleSelectPatient(patient);
                    }}
                  >
                    Monitor
                  </button>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      acknowledgeAlert(alert.id);
                      toast.success('Alert acknowledged.');
                    }}
                  >
                    Acknowledge
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'dashboard' && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">Doctor Dashboard</h1>
                <p className="page-subtitle">
                  {selectedPatient
                    ? `Monitoring: ${selectedPatient.name} (ThingSpeak Channel: ${selectedPatient.thingspeakChannelId})`
                    : 'Connect a patient by ThingSpeak Channel ID to monitor real-time vitals'}
                </p>
              </div>
              {selectedPatient && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setSelectedPatient(null);
                    setPatientData(null);
                    setPatientHistory([]);
                  }}
                >
                  ✕ Deselect
                </button>
              )}
            </div>

            {/* Patient Channel Connection Bar */}
            <div className="glass-card" style={{ padding: '20px 24px', marginBottom: '24px', border: '1px solid rgba(108, 99, 255, 0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📡</span> Connect Patient ThingSpeak Channel
                </h3>
                {selectedPatient && (
                  <span className="badge badge-success">
                    <span className="stat-status-dot"></span>
                    Live Connected: {selectedPatient.name} (#{selectedPatient.thingspeakChannelId})
                  </span>
                )}
              </div>

              <form onSubmit={handleLoadCustomPatient} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Patient Name (Optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Rahul Verma"
                    value={inputPatientName}
                    onChange={(e) => setInputPatientName(e.target.value)}
                  />
                </div>
                <div style={{ flex: '1 1 180px' }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>ThingSpeak Channel ID *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 2851234"
                    value={inputChannelId}
                    onChange={(e) => setInputChannelId(e.target.value)}
                    required
                  />
                </div>
                <div style={{ flex: '1 1 180px' }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Read API Key (Optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. ABC123XYZ456"
                    value={inputReadKey}
                    onChange={(e) => setInputReadKey(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" className="btn btn-primary" style={{ padding: '10px 18px', whiteSpace: 'nowrap' }}>
                    ⚡ Load / Monitor Patient
                  </button>
                  {selectedPatient && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setSelectedPatient(null);
                        setPatientData(null);
                        setPatientHistory([]);
                      }}
                      style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}
                    >
                      ✕ Deselect
                    </button>
                  )}
                </div>
              </form>

              {/* Recent Monitored Patients with 1-Click Select and Delete (Trash) */}
              {recentPatients.length > 0 && (
                <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    📋 Recently Monitored Patients ({recentPatients.length}):
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {recentPatients.map(rp => (
                      <div
                        key={rp.channelId}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 12px',
                          background: String(selectedPatient?.thingspeakChannelId).trim() === String(rp.channelId).trim() ? 'rgba(108, 99, 255, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                          border: `1px solid ${String(selectedPatient?.thingspeakChannelId).trim() === String(rp.channelId).trim() ? 'var(--primary)' : 'rgba(255, 255, 255, 0.1)'}`,
                          borderRadius: '20px',
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        onClick={() => handleSelectRecentPatient(rp)}
                        title={`Click to load Channel #${rp.channelId}`}
                      >
                        <span style={{ fontWeight: 600, color: String(selectedPatient?.thingspeakChannelId).trim() === String(rp.channelId).trim() ? '#a5b4fc' : '#f1f5f9' }}>
                          👤 {rp.name || `Patient #${rp.channelId}`}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '10px' }}>
                          #{rp.channelId}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteRecentPatient(e, rp.channelId)}
                          title="Delete from recent list"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            padding: '0 2px',
                            fontSize: '0.85rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {selectedPatient ? (
              <>
                {/* Patient Vitals */}
                <div className="stats-grid">
                  <div className="stat-card glass-card bpm">
                    <div className="stat-icon">❤️</div>
                    <div className="stat-label">Heart Rate</div>
                    <div className={`stat-value ${getStatusClass(patientData?.bpm, 100)}`}>
                      {patientData?.bpm || '--'}
                    </div>
                    <div className="stat-unit">BPM</div>
                  </div>

                  <div className="stat-card glass-card spo2">
                    <div className="stat-icon">🫁</div>
                    <div className="stat-label">Blood Oxygen</div>
                    <div className={`stat-value ${getStatusClass(100, patientData?.spo2)}`}>
                      {patientData?.spo2 || '--'}
                    </div>
                    <div className="stat-unit">SpO2 %</div>
                  </div>

                  <div className="stat-card glass-card ecg">
                    <div className="stat-icon">⚡</div>
                    <div className="stat-label">ECG</div>
                    <div className="stat-value info">
                      {patientData?.ecg ? Math.round(patientData.ecg) : '--'}
                    </div>
                    <div className="stat-unit">Raw ADC</div>
                  </div>

                  <div className="stat-card glass-card status">
                    <div className="stat-icon">🩺</div>
                    <div className="stat-label">Status</div>
                    <div className={`stat-value ${getStatusClass(patientData?.bpm, patientData?.spo2)}`}>
                      {getStatusLabel(patientData?.bpm, patientData?.spo2)}
                    </div>
                  </div>
                </div>

                {/* Patient Chart - Last 10 readings */}
                <div className="chart-container glass-card">
                  <div className="chart-header">
                    <h3 className="chart-title">📊 {selectedPatient.name}'s Vitals (Last 10 Checkings)</h3>
                    <span className="badge badge-info">{last10PatientReadings.length} readings (Last 10)</span>
                  </div>
                  <div className="chart-wrapper" style={{ height: '300px' }}>
                    {last10PatientReadings.length > 0 ? (
                      <Line data={historyChartData} options={chartOptions} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                        {selectedPatient.thingspeakChannelId
                          ? 'Loading patient data...'
                          : 'Patient has not configured ThingSpeak yet.'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Recent Checkings Table (Last 1 Month with Date Range filter) */}
                <div className="glass-card" style={{ padding: '24px', marginTop: '24px', overflowX: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                      📋 Patient Checkings ({filteredPatientCheckings.length} Readings — Last 1 Month)
                    </h3>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => {
                        setReportPatientId(selectedPatient.id);
                        setActiveTab('reports');
                      }}
                    >
                      📄 Generate Report
                    </button>
                  </div>

                  {/* Date Range Selector */}
                  <div className="date-range" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>Filter by Date:</span>
                    <input
                      type="date"
                      value={dashDateFrom}
                      onChange={(e) => setDashDateFrom(e.target.value)}
                    />
                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                    <input
                      type="date"
                      value={dashDateTo}
                      onChange={(e) => setDashDateTo(e.target.value)}
                    />
                    {(dashDateFrom || dashDateTo) && (
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => { setDashDateFrom(''); setDashDateTo(''); }}
                      >
                        Clear Filter
                      </button>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Showing {filteredPatientCheckings.length} checkings (Last 1 Month)
                    </span>
                  </div>

                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>BPM</th>
                        <th>SpO2</th>
                        <th>ECG</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPatientCheckings.slice().reverse().map((feed, i) => (
                        <tr key={i}>
                          <td>{new Date(feed.timestamp).toLocaleString()}</td>
                          <td style={{ fontWeight: 600 }}>{feed.bpm || '--'}</td>
                          <td style={{ fontWeight: 600 }}>{feed.spo2 || '--'}%</td>
                          <td>{feed.ecg ? Math.round(feed.ecg) : '--'}</td>
                          <td>
                            <span className={`badge badge-${getStatusClass(feed.bpm, feed.spo2)}`}>
                              {getStatusLabel(feed.bpm, feed.spo2)}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {filteredPatientCheckings.length === 0 && (
                        <tr>
                          <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                            No checkings recorded in the selected range.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              // Quick Patient Overview
              <div className="glass-card" style={{ padding: '24px' }}>
                <h3 style={{ marginBottom: '16px' }}>👥 My Patients ({patients.length})</h3>
                {patients.length > 0 ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Patient</th>
                        <th>Email</th>
                        <th>ThingSpeak</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patients.map(p => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600 }}>{p.name}</td>
                          <td style={{ color: 'var(--text-secondary)' }}>{p.email}</td>
                          <td>
                            <span className={`badge ${p.thingspeakChannelId ? 'badge-success' : 'badge-warning'}`}>
                              {p.thingspeakChannelId ? 'Configured' : 'Not Set'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => handleSelectPatient(p)}
                              >
                                ⚡ Monitor
                              </button>
                              <button
                                className="btn btn-sm btn-ghost"
                                style={{ color: 'var(--danger)' }}
                                onClick={() => handleDeletePatient(p)}
                                title="Delete Patient"
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                    No patients registered yet.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === 'alerts' && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">Emergency Alerts</h1>
                <p className="page-subtitle">All emergency SOS from patients</p>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '24px' }}>
              {alerts.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Patient</th>
                      <th>BPM</th>
                      <th>SpO2</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map(alert => (
                      <tr key={alert.id}>
                        <td>{new Date(alert.timestamp).toLocaleString()}</td>
                        <td style={{ fontWeight: 600 }}>{alert.patientName}</td>
                        <td>{alert.bpm}</td>
                        <td>{alert.spo2}%</td>
                        <td>
                          <span className={`badge ${alert.acknowledged ? 'badge-success' : 'badge-danger'}`}>
                            {alert.acknowledged ? 'ACKNOWLEDGED' : 'ACTIVE'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {!alert.acknowledged && (
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => acknowledgeAlert(alert.id)}
                              >
                                Acknowledge
                              </button>
                            )}
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={() => clearAlert(alert.id)}
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                  No emergency alerts.
                </p>
              )}
            </div>
          </>
        )}

        {activeTab === 'patients' && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">Patient List</h1>
                <p className="page-subtitle">{patients.length} registered patients & {recentPatients.length} custom monitored channels</p>
              </div>
            </div>

            {/* Recent Custom Monitored Patients (with Delete option) */}
            {recentPatients.length > 0 && (
              <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
                <h3 style={{ marginBottom: '16px' }}>📡 Recent Monitored Channels ({recentPatients.length})</h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Patient Name</th>
                      <th>ThingSpeak Channel</th>
                      <th>Read Key</th>
                      <th>Last Checked</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPatients.map(rp => (
                      <tr key={rp.channelId}>
                        <td style={{ fontWeight: 600 }}>{rp.name || `Patient #${rp.channelId}`}</td>
                        <td>
                          <span className="badge badge-success">Channel #{rp.channelId}</span>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {rp.readKey ? '••••••••' : 'Public'}
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          {rp.lastMonitored ? new Date(rp.lastMonitored).toLocaleString() : 'Recent'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => handleSelectRecentPatient(rp)}
                            >
                              ⚡ Monitor
                            </button>
                            <button
                              className="btn btn-sm btn-ghost"
                              style={{ color: 'var(--danger)' }}
                              onClick={(e) => handleDeleteRecentPatient(e, rp.channelId)}
                              title="Delete from recents"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="glass-card" style={{ padding: '24px' }}>
              <h3 style={{ marginBottom: '16px' }}>👥 Registered Portal Patients ({patients.length})</h3>
              {patients.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Registered</th>
                      <th>ThingSpeak</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patients.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{p.email}</td>
                        <td style={{ color: 'var(--text-muted)' }}>
                          {new Date(p.createdAt).toLocaleDateString()}
                        </td>
                        <td>
                          <span className={`badge ${p.thingspeakChannelId ? 'badge-success' : 'badge-warning'}`}>
                            {p.thingspeakChannelId ? 'Active' : 'Not Set'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => handleSelectPatient(p)}
                            >
                              ⚡ Monitor
                            </button>
                            <button
                              className="btn btn-sm btn-ghost"
                              style={{ color: 'var(--danger)' }}
                              onClick={() => handleDeletePatient(p)}
                              title="Delete Patient"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                  No patients registered yet.
                </p>
              )}
            </div>
          </>
        )}

        {activeTab === 'prescriptions' && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">Prescriptions</h1>
                <p className="page-subtitle">Write prescriptions — automatically visible to patients and assigned pathology labs</p>
              </div>
            </div>

            <div className="notes-section glass-card">
              <h3>💊 Write New Prescription</h3>
              <div className="form-group" style={{ marginTop: '12px' }}>
                <label className="form-label">Select Patient</label>
                <select
                  className="form-select"
                  value={rxPatientId}
                  onChange={(e) => setRxPatientId(e.target.value)}
                >
                  <option value="">-- Select Patient --</option>
                  {allSelectablePatients.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.email || `Channel #${p.thingspeakChannelId}`})</option>
                  ))}
                </select>
              </div>
              <div className="note-input-area">
                <textarea
                  placeholder="Write your prescription... (medicines, dosage, instructions, observations)"
                  value={newPrescription}
                  onChange={(e) => setNewPrescription(e.target.value)}
                />
                <button className="btn btn-primary" onClick={handleAddPrescription}>
                  Add Prescription
                </button>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '24px', marginTop: '24px' }}>
              <h3 style={{ marginBottom: '16px' }}>📋 All Prescriptions ({prescriptions.length})</h3>
              <div className="notes-list">
                {prescriptions.length > 0 ? prescriptions.map(rx => (
                  <div key={rx.id} className="note-item">
                    <div className="note-date" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <span>
                        {new Date(rx.createdAt).toLocaleString()} — Patient: <strong>{rx.patientName}</strong>
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={`badge ${rx.authorRole === 'pathology' ? 'badge-primary' : 'badge-info'}`}>
                          {rx.authorRole === 'pathology' ? `🔬 ${rx.authorName || 'Pathology Lab'}` : `👨‍⚕️ Dr. ${rx.doctorName || user.name}`}
                        </span>
                        {/* Doctor can ONLY delete prescriptions written by doctor */}
                        {rx.authorRole !== 'pathology' && (rx.doctorId === user.id || !rx.authorRole) && (
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ color: 'var(--danger)', padding: '2px 8px', fontSize: '0.75rem' }}
                            onClick={() => handleDeletePrescription(rx.id)}
                            title="Delete Prescription"
                          >
                            ✕ Delete
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="note-text" style={{ whiteSpace: 'pre-wrap', marginTop: '8px' }}>{rx.text}</div>
                  </div>
                )) : (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                    No prescriptions written yet.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === 'assign' && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">Assign Pathology Lab</h1>
                <p className="page-subtitle">Assign patients to pathology labs — only then will patient data and prescriptions be shared with them</p>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '24px' }}>
              <h3 style={{ marginBottom: '16px' }}>🔬 New Assignment</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '600px' }}>
                <div className="form-group">
                  <label className="form-label">Select Patient</label>
                  <select
                    className="form-select"
                    value={assignPatientId}
                    onChange={(e) => setAssignPatientId(e.target.value)}
                  >
                    <option value="">-- Select Patient --</option>
                    {patients.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.email})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Select Pathology Lab</label>
                  <select
                    className="form-select"
                    value={assignLabId}
                    onChange={(e) => setAssignLabId(e.target.value)}
                  >
                    <option value="">-- Select Lab --</option>
                    {pathologyLabs.map(l => (
                      <option key={l.id} value={l.id}>{l.name} ({l.email})</option>
                    ))}
                  </select>
                </div>
              </div>

              {pathologyLabs.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '8px' }}>
                  ⚠️ No pathology labs are registered yet. A lab must first register with the "Pathology" role.
                </p>
              )}

              <button
                className="btn btn-primary"
                onClick={handleAssignLab}
                style={{ marginTop: '16px' }}
                disabled={!assignPatientId || !assignLabId}
              >
                🔗 Assign Patient to Lab
              </button>
            </div>

            {/* Current Assignments */}
            <div className="glass-card" style={{ padding: '24px', marginTop: '24px' }}>
              <h3 style={{ marginBottom: '16px' }}>📋 Active Assignments ({assignments.length})</h3>
              {assignments.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Pathology Lab</th>
                      <th>Assigned On</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map(a => (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 600 }}>{a.patientName}</td>
                        <td>
                          <span className="badge badge-info">🔬 {a.pathologyName}</span>
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>
                          {new Date(a.createdAt).toLocaleString()}
                        </td>
                        <td>
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => handleRemoveAssignment(a.id, a.patientName, a.pathologyName)}
                          >
                            ✕ Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px' }}>
                  No assignments yet. Select a patient and a lab above to create an assignment.
                </p>
              )}
            </div>
          </>
        )}

        {activeTab === 'reports' && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">Generate Medical Reports</h1>
                <p className="page-subtitle">
                  Generate downloadable & printable clinical reports for patients (includes last 10 checkings & prescriptions)
                </p>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '24px' }}>
              <h3 style={{ marginBottom: '16px' }}>📄 Select Patient for Report</h3>
              <div className="form-group" style={{ maxWidth: '500px' }}>
                <label className="form-label">Patient</label>
                <select
                  className="form-select"
                  value={reportPatientId}
                  onChange={(e) => setReportPatientId(e.target.value)}
                >
                  <option value="">-- Select Patient --</option>
                  {allSelectablePatients.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.email || `Channel #${p.thingspeakChannelId}`})</option>
                  ))}
                </select>
              </div>

              {reportPatientId && (
                <div style={{ marginTop: '24px' }}>
                  {/* Date Range Selector */}
                  <div className="date-range" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>Filter Date Range:</span>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                    {(dateFrom || dateTo) && (
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => { setDateFrom(''); setDateTo(''); }}
                      >
                        Clear Filter
                      </button>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {activeReportReadings.length} readings included (from last 1 month)
                    </span>
                  </div>

                  {/* Report Preview Stats */}
                  <div className="agg-stats" style={{ marginBottom: '24px' }}>
                    <div className="agg-stat-item">
                      <div className="agg-stat-value">{activeReportReadings.length}</div>
                      <div className="agg-stat-label">Readings (Last 10)</div>
                    </div>
                    <div className="agg-stat-item">
                      <div className="agg-stat-value">{reportAvgBpm}</div>
                      <div className="agg-stat-label">Avg BPM</div>
                    </div>
                    <div className="agg-stat-item">
                      <div className="agg-stat-value" style={{ color: 'var(--info)' }}>{reportAvgSpo2}%</div>
                      <div className="agg-stat-label">Avg SpO2</div>
                    </div>
                    <div className="agg-stat-item">
                      <div className="agg-stat-value" style={{ color: 'var(--warning)' }}>
                        {prescriptions.filter(rx => rx.patientId === reportPatientId).length}
                      </div>
                      <div className="agg-stat-label">Prescriptions</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                    <button className="btn btn-primary" onClick={handleDoctorGenerateReport}>
                      📥 Download CSV Report
                    </button>
                    <button className="btn btn-ghost" onClick={handleDoctorPrintReport}>
                      🖨️ Print Medical Report
                    </button>
                  </div>

                  {/* Table preview */}
                  <h4 style={{ marginBottom: '12px', fontSize: '0.95rem' }}>
                    Preview: Last {activeReportReadings.length} Checkings
                  </h4>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>BPM</th>
                        <th>SpO2</th>
                        <th>ECG</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeReportReadings.slice().reverse().map((feed, i) => (
                        <tr key={i}>
                          <td>{new Date(feed.timestamp).toLocaleString()}</td>
                          <td style={{ fontWeight: 600 }}>{feed.bpm || '--'}</td>
                          <td style={{ fontWeight: 600 }}>{feed.spo2 || '--'}%</td>
                          <td>{feed.ecg ? Math.round(feed.ecg) : '--'}</td>
                          <td>
                            <span className={`badge badge-${getStatusClass(feed.bpm, feed.spo2)}`}>
                              {getStatusLabel(feed.bpm, feed.spo2)}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {activeReportReadings.length === 0 && (
                        <tr>
                          <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                            No checking data found for this patient.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'settings' && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">Settings</h1>
                <p className="page-subtitle">Manage doctor account and security</p>
              </div>
            </div>

            <DeleteAccountSection />
          </>
        )}
      </main>
    </div>
  );
}
