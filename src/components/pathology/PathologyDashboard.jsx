// ============================================================
// Pathology Dashboard — Only shows ASSIGNED patients data
// Doctor must assign a patient to this lab first
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { getUserById } from '../../services/auth';
import { fetchChannelData, parseLatestFeed, parseAllFeeds } from '../../services/thingspeak';
import {
  getRecentPatients,
  saveRecentPatient,
  removeRecentPatient,
} from '../../services/patientMonitoring';
import {
  getAssignmentsForPathology,
  getPrescriptionsForPathology,
  addPrescription,
  deletePrescription,
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
  { id: 'records', label: 'Live Monitoring', icon: '🩺' },
  { id: 'prescriptions', label: 'Prescriptions', icon: '💊' },
  { id: 'analytics', label: 'Analytics', icon: '📊' },
  { id: 'reports', label: 'Reports', icon: '📄' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function PathologyDashboard() {
  const { user } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('records');
  const [assignedPatients, setAssignedPatients] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientData, setPatientData] = useState(null);
  const [patientHistory, setPatientHistory] = useState([]);
  const [aggStats, setAggStats] = useState({ avgBpm: 0, avgSpo2: 0, alertCount: 0, totalReadings: 0 });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [recentDateFrom, setRecentDateFrom] = useState('');
  const [recentDateTo, setRecentDateTo] = useState('');
  const [rxPatientId, setRxPatientId] = useState('');
  const [newPrescription, setNewPrescription] = useState('');

  // Custom Channel Monitoring & Recents
  const [inputChannelId, setInputChannelId] = useState('');
  const [inputReadKey, setInputReadKey] = useState('');
  const [inputPatientName, setInputPatientName] = useState('');
  const [recentPatients, setRecentPatients] = useState([]);

  const intervalRef = useRef(null);

  // Load assigned patients and prescriptions
  useEffect(() => {
    if (!user?.id) return;
    
    const loadAssignedData = () => {
      const assignments = getAssignmentsForPathology(user.id);
      
      // Get unique patient details from assignments
      const patientMap = new Map();
      assignments.forEach(a => {
        if (!patientMap.has(a.patientId)) {
          const patientDetails = getUserById(a.patientId);
          if (patientDetails) {
            patientMap.set(a.patientId, {
              ...patientDetails,
              assignedBy: a.doctorName,
              assignedAt: a.createdAt,
            });
          }
        }
      });
      
      setAssignedPatients(Array.from(patientMap.values()));
      setPrescriptions(getPrescriptionsForPathology(user.id));
    };
    
    loadAssignedData();
    const interval = setInterval(loadAssignedData, 10000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Load recent monitored patients on mount
  useEffect(() => {
    if (user?.id) {
      setRecentPatients(getRecentPatients(user.id));
    }
  }, [user?.id]);

  // Combined selectable patients (assigned + recent custom monitored channels)
  const allSelectablePatients = [
    ...assignedPatients,
    ...recentPatients
      .filter(rp => !assignedPatients.some(p => String(p.thingspeakChannelId).trim() === String(rp.channelId).trim()))
      .map(rp => ({
        id: rp.id || `channel_${rp.channelId}`,
        name: rp.name || `Patient #${rp.channelId}`,
        email: `ThingSpeak Channel #${rp.channelId}`,
        thingspeakChannelId: rp.channelId,
        thingspeakReadKey: rp.readKey || '',
        assignedBy: 'Custom Channel',
        isCustom: true,
      })),
  ];

  // Fetch selected patient data (Live vitals + history)
  const fetchPatientData = useCallback(async () => {
    if (!selectedPatient?.thingspeakChannelId) return;

    try {
      // 1. Fetch latest live feed (request 10 to find latest valid feed)
      const latestRaw = await fetchChannelData(
        selectedPatient.thingspeakChannelId,
        selectedPatient.thingspeakReadKey || '',
        10
      );
      const latest = parseLatestFeed(latestRaw);
      setPatientData(latest);

      // 2. Fetch history
      const histData = await fetchChannelData(
        selectedPatient.thingspeakChannelId,
        selectedPatient.thingspeakReadKey || '',
        100
      );
      const allFeeds = parseAllFeeds(histData);
      setPatientHistory(allFeeds);

      // Calculate aggregate stats for last 10 readings
      if (allFeeds.length > 0) {
        const last10 = allFeeds.slice(-10);
        const bpmValues = last10.filter(f => f.bpm).map(f => f.bpm);
        const spo2Values = last10.filter(f => f.spo2).map(f => f.spo2);
        const alertCount = last10.filter(f => f.bpm < 50 || f.bpm > 120 || f.spo2 < 90).length;

        setAggStats({
          avgBpm: bpmValues.length > 0 ? Math.round(bpmValues.reduce((a, b) => a + b, 0) / bpmValues.length) : 0,
          avgSpo2: spo2Values.length > 0 ? Math.round(spo2Values.reduce((a, b) => a + b, 0) / spo2Values.length * 10) / 10 : 0,
          alertCount,
          totalReadings: last10.length,
        });
      }
    } catch (err) {
      console.error('Error fetching patient data in pathology:', err);
    }
  }, [selectedPatient]);

  useEffect(() => {
    if (selectedPatient) {
      fetchPatientData();
      intervalRef.current = setInterval(fetchPatientData, 15000); // Live poll every 15s
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [selectedPatient, fetchPatientData]);

  const handleSelectPatient = (patient) => {
    if (selectedPatient?.id === patient.id) {
      setSelectedPatient(null);
      setPatientData(null);
      setPatientHistory([]);
      setRecentDateFrom('');
      setRecentDateTo('');
    } else {
      setSelectedPatient(patient);
      setPatientData(null);
      setPatientHistory([]);
      setRecentDateFrom('');
      setRecentDateTo('');
    }
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
      assignedBy: 'Custom Channel',
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
      assignedBy: 'Custom Channel',
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

  // Remove / Delete assigned patient from lab records
  const handleDeleteAssignedPatient = (patient) => {
    const confirmed = window.confirm(
      `Remove patient "${patient.name}" from your pathology lab records?`
    );
    if (!confirmed) return;

    // Remove assignment if assigned by doctor
    const assignments = getAssignmentsForPathology(user.id);
    const assignment = assignments.find(a => a.patientId === patient.id);
    if (assignment) {
      removeAssignment(assignment.id);
    }

    // Remove from recent monitored list if present
    if (patient.thingspeakChannelId) {
      const updatedRecents = removeRecentPatient(user.id, patient.thingspeakChannelId);
      setRecentPatients(updatedRecents);
    }

    setAssignedPatients(prev => prev.filter(p => p.id !== patient.id));

    if (selectedPatient?.id === patient.id) {
      setSelectedPatient(null);
      setPatientData(null);
      setPatientHistory([]);
    }
    toast.success(`Patient "${patient.name}" removed from lab records.`);
  };

  const filteredPatients = assignedPatients.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Live Graph: strictly latest 10 readings
  const last10PatientReadings = patientHistory.slice(-10);

  const liveChartData = {
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
        pointBackgroundColor: '#FF1744',
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
        pointBackgroundColor: '#29B6F6',
      },
    ],
  };

  // Report readings: filtered by date range within 1 month, capped at last 10
  const getFilteredHistory = () => {
    let list = patientHistory; // already within last 1 month from parseAllFeeds
    if (dateFrom || dateTo) {
      list = patientHistory.filter(f => {
        const ts = new Date(f.timestamp);
        if (dateFrom && ts < new Date(dateFrom)) return false;
        if (dateTo && ts > new Date(dateTo + 'T23:59:59')) return false;
        return true;
      });
    }
    return list.slice(-10);
  };

  const filteredHistory = getFilteredHistory();

  // Filtered readings for Recent Readings section (from last 1 month, filtered by recentDateFrom/recentDateTo)
  const getFilteredRecentReadings = () => {
    let list = patientHistory; // already within last 1 month from parseAllFeeds
    if (recentDateFrom || recentDateTo) {
      list = patientHistory.filter(f => {
        const ts = new Date(f.timestamp);
        if (recentDateFrom && ts < new Date(recentDateFrom)) return false;
        if (recentDateTo && ts > new Date(recentDateTo + 'T23:59:59')) return false;
        return true;
      });
    }
    return list;
  };

  const filteredRecentReadings = getFilteredRecentReadings();

  // Get prescriptions for the selected patient only
  const selectedPatientRx = selectedPatient
    ? prescriptions.filter(rx => rx.patientId === selectedPatient.id)
    : [];

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

  const historyChartData = liveChartData;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#6a6a80', font: { size: 10 }, maxTicksLimit: 12 },
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

  const handleAddPrescription = () => {
    if (!newPrescription.trim() || !rxPatientId) {
      toast.error('Please select an assigned patient and enter prescription details.');
      return;
    }

    const patient = allSelectablePatients.find(p => p.id === rxPatientId);
    if (!patient) {
      toast.error('Selected patient not found.');
      return;
    }

    const assignments = getAssignmentsForPathology(user.id);
    const assignment = assignments.find(a => a.patientId === rxPatientId);

    const rx = addPrescription({
      pathologyId: user.id,
      pathologyName: user.name,
      authorRole: 'pathology',
      authorName: user.name,
      doctorId: assignment ? assignment.doctorId : null,
      doctorName: assignment ? assignment.doctorName : null,
      patientId: rxPatientId,
      patientName: patient.name,
      text: newPrescription.trim(),
    });

    setPrescriptions(prev => [rx, ...prev]);
    setNewPrescription('');
    setRxPatientId('');
    toast.success('Prescription / Lab Report saved! Both patient and assigning doctor can now view it.');
  };

  const handleDeletePrescription = (rxId) => {
    const rx = prescriptions.find(r => r.id === rxId);
    if (rx && rx.authorRole !== 'pathology') {
      toast.error('You cannot delete prescriptions written by a doctor.');
      return;
    }
    if (window.confirm('Are you sure you want to delete this prescription / lab report?')) {
      deletePrescription(rxId);
      setPrescriptions(prev => prev.filter(r => r.id !== rxId));
      toast.success('Prescription / Lab Report deleted successfully.');
    }
  };

  const handleGenerateReport = () => {
    if (!selectedPatient) {
      toast.error('Please select a patient first.');
      return;
    }

    const data = getFilteredHistory();
    if (data.length === 0) {
      toast.error('No checking data available to generate report.');
      return;
    }

    // Last 10 readings used for report
    const bpmValues = data.filter(f => f.bpm).map(f => f.bpm);
    const spo2Values = data.filter(f => f.spo2).map(f => f.spo2);

    let csv = 'AI Health Monitor - Patient Report\n';
    csv += `Report Source: Pathology Lab (${user.name})\n`;
    csv += `Patient: ${selectedPatient.name}\n`;
    csv += `Email: ${selectedPatient.email}\n`;
    csv += `Generated On: ${new Date().toLocaleString()}\n`;
    csv += `Readings Included: Last ${data.length} Checkings\n`;
    csv += `Average BPM (Last ${data.length}): ${bpmValues.length > 0 ? Math.round(bpmValues.reduce((a, b) => a + b, 0) / bpmValues.length) : 'N/A'}\n`;
    csv += `Average SpO2 (Last ${data.length}): ${spo2Values.length > 0 ? (spo2Values.reduce((a, b) => a + b, 0) / spo2Values.length).toFixed(1) : 'N/A'}%\n`;
    csv += '\n--- Prescriptions & Lab Notes ---\n';
    selectedPatientRx.forEach(rx => {
      const author = rx.authorRole === 'pathology' ? `${rx.authorName || 'Pathology Lab'} (Pathology)` : `Dr. ${rx.doctorName || rx.authorName} (Doctor)`;
      csv += `[${new Date(rx.createdAt).toLocaleString()}] ${author}: ${rx.text.replace(/\n/g, ' ')}\n`;
    });
    csv += '\n--- Last 10 Detailed Readings ---\n';
    csv += 'Timestamp,BPM,SpO2(%),ECG,Status\n';
    data.forEach(f => {
      csv += `${f.timestamp},${f.bpm || ''},${f.spo2 || ''},${f.ecg || ''},${getStatusLabel(f.bpm, f.spo2)}\n`;
    });

    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `health_report_${selectedPatient.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success('Report downloaded with last 10 checkings!');
  };

  const handlePrintReport = () => {
    const data = getFilteredHistory();
    if (!selectedPatient || data.length === 0) {
      toast.error('No checking data available to print.');
      return;
    }

    const bpmValues = data.filter(f => f.bpm).map(f => f.bpm);
    const spo2Values = data.filter(f => f.spo2).map(f => f.spo2);

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
      <head>
        <title>Health Report - ${selectedPatient.name}</title>
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
        <div class="report-top-bar">Health Report - ${selectedPatient.name}</div>
        <div class="report-header">
          <h1>🏥 AI Health Monitor — Patient Report</h1>
          <div class="source-badge">Generated By: ${user.name} (Pathology Lab)</div>
        </div>
        <div class="info-grid">
          <div class="info-item"><div class="info-label">Patient Name</div><div class="info-value">${selectedPatient.name}</div></div>
          <div class="info-item"><div class="info-label">Email</div><div class="info-value">${selectedPatient.email}</div></div>
          <div class="info-item"><div class="info-label">Checkings Included</div><div class="info-value">Last ${data.length} Readings</div></div>
          <div class="info-item"><div class="info-label">Generated On</div><div class="info-value">${new Date().toLocaleString()}</div></div>
          <div class="info-item"><div class="info-label">Avg BPM (Last ${data.length})</div><div class="info-value">${bpmValues.length > 0 ? Math.round(bpmValues.reduce((a, b) => a + b, 0) / bpmValues.length) : 'N/A'}</div></div>
          <div class="info-item"><div class="info-label">Avg SpO2 (Last ${data.length})</div><div class="info-value">${spo2Values.length > 0 ? (spo2Values.reduce((a, b) => a + b, 0) / spo2Values.length).toFixed(1) + '%' : 'N/A'}</div></div>
        </div>
        ${selectedPatientRx.length > 0 ? `
          <h2>💊 Prescriptions & Lab Notes</h2>
          <div class="rx-section">
            ${selectedPatientRx.map(rx => `
              <div class="rx-item">
                <strong>${rx.authorRole === 'pathology' ? '🔬 ' + (rx.authorName || 'Pathology Lab') + ' (Pathology Lab)' : '👨‍⚕️ Dr. ' + (rx.doctorName || rx.authorName) + ' (Doctor)'}</strong> — ${new Date(rx.createdAt).toLocaleString()}<br/>
                ${rx.text}
              </div>
            `).join('')}
          </div>
        ` : ''}
        <h2>📊 Last ${data.length} Checkings / Readings</h2>
        <table>
          <thead><tr><th>Time</th><th>BPM</th><th>SpO2 (%)</th><th>ECG</th><th>Status</th></tr></thead>
          <tbody>
            ${data.map(f => `
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
        <div class="footer">Generated by ${user.name} (Pathology Lab) via AI Health Monitor &bull; ${new Date().toLocaleString()}</div>
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
        {activeTab === 'records' && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">
                  {selectedPatient ? 'Live Patient Monitoring' : 'Pathology Lab Monitoring'}
                </h1>
                <p className="page-subtitle">
                  {selectedPatient
                    ? `Live Monitoring: ${selectedPatient.name} (ThingSpeak Channel: ${selectedPatient.thingspeakChannelId})`
                    : 'Connect a patient by ThingSpeak Channel ID or select from assigned patients below'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {allSelectablePatients.length > 1 && (
                  <select
                    className="form-select form-select-sm"
                    style={{ minWidth: '180px' }}
                    value={selectedPatient?.id || ''}
                    onChange={(e) => {
                      const found = allSelectablePatients.find(p => p.id === e.target.value);
                      if (found) handleSelectPatient(found);
                      else {
                        setSelectedPatient(null);
                        setPatientData(null);
                        setPatientHistory([]);
                      }
                    }}
                  >
                    <option value="">-- Switch Patient --</option>
                    {allSelectablePatients.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
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
                    placeholder="e.g. Meera Patel"
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

            {!selectedPatient && (
              <div className="glass-card" style={{ padding: '36px 20px', textAlign: 'center', marginBottom: '24px' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>🔬</div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }}>No Patient Currently Selected</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', maxWidth: '500px', margin: '0 auto' }}>
                  Enter a patient's <strong>ThingSpeak Channel ID</strong> above or click <strong>Monitor</strong> on any assigned patient below to start live vitals monitoring.
                </p>
              </div>
            )}

            {selectedPatient && (
              <>
                {/* Live Patient Vitals Cards */}
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
                <div className="chart-container glass-card" style={{ marginTop: '24px' }}>
                  <div className="chart-header">
                    <h3 className="chart-title">📊 {selectedPatient.name}'s Vitals (Latest 10 Checkings)</h3>
                    <span className="badge badge-info">{last10PatientReadings.length} readings (Latest 10)</span>
                  </div>
                  <div className="chart-wrapper" style={{ height: '300px' }}>
                    {last10PatientReadings.length > 0 ? (
                      <Line data={liveChartData} options={chartOptions} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                        {selectedPatient.thingspeakChannelId
                          ? 'Loading live patient readings...'
                          : 'Patient has not configured ThingSpeak yet.'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Selected patient data - Recent readings table (Last 1 Month with Date Range filter) */}
                <div className="glass-card" style={{ padding: '24px', marginTop: '24px', overflowX: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                    <h3 style={{ margin: 0 }}>
                      📋 {selectedPatient.name}'s Recent Readings ({filteredRecentReadings.length} Readings — Last 1 Month)
                    </h3>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => setActiveTab('reports')}
                    >
                      📄 Generate Report
                    </button>
                  </div>

                  {/* Date Range Selector */}
                  <div className="date-range" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>Filter by Date:</span>
                    <input
                      type="date"
                      value={recentDateFrom}
                      onChange={(e) => setRecentDateFrom(e.target.value)}
                    />
                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                    <input
                      type="date"
                      value={recentDateTo}
                      onChange={(e) => setRecentDateTo(e.target.value)}
                    />
                    {(recentDateFrom || recentDateTo) && (
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => { setRecentDateFrom(''); setRecentDateTo(''); }}
                      >
                        Clear Filter
                      </button>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Showing {filteredRecentReadings.length} readings (Last 1 Month)
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
                      {filteredRecentReadings.slice().reverse().map((f, i) => (
                        <tr key={i}>
                          <td>{new Date(f.timestamp).toLocaleString()}</td>
                          <td style={{ fontWeight: 600 }}>{f.bpm || '--'}</td>
                          <td style={{ fontWeight: 600 }}>{f.spo2 || '--'}%</td>
                          <td>{f.ecg ? Math.round(f.ecg) : '--'}</td>
                          <td>
                            <span className={`badge badge-${getStatusClass(f.bpm, f.spo2)}`}>
                              {getStatusLabel(f.bpm, f.spo2)}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {filteredRecentReadings.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                            No readings recorded in the selected range.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Recent Custom Monitored Patients (with Delete option) */}
            {recentPatients.length > 0 && (
              <div className="glass-card" style={{ padding: '24px', marginTop: '24px' }}>
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

            {/* Assigned Patients List */}
            <div className="glass-card" style={{ padding: '24px', marginTop: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <h3 style={{ margin: 0 }}>👥 Assigned Patients ({assignedPatients.length})</h3>
                {assignedPatients.length > 0 && (
                  <div className="search-bar" style={{ margin: 0, maxWidth: '300px' }}>
                    <span className="search-bar-icon">🔍</span>
                    <input
                      id="patient-search"
                      type="text"
                      placeholder="Search patients..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {filteredPatients.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Assigned By</th>
                      <th>ThingSpeak</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPatients.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{p.email}</td>
                        <td>Dr. {p.assignedBy}</td>
                        <td>
                          <span className={`badge ${p.thingspeakChannelId ? 'badge-success' : 'badge-warning'}`}>
                            {p.thingspeakChannelId ? 'Active' : 'Not Set'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              className={`btn btn-sm ${selectedPatient?.id === p.id ? 'btn-success' : 'btn-primary'}`}
                              onClick={() => handleSelectPatient(p)}
                            >
                              {selectedPatient?.id === p.id ? '✓ Monitoring' : '⚡ Monitor'}
                            </button>
                            <button
                              className="btn btn-sm btn-ghost"
                              style={{ color: 'var(--danger)' }}
                              onClick={() => handleDeleteAssignedPatient(p)}
                              title="Remove patient from lab"
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
                  {assignedPatients.length === 0
                    ? '🔬 No patients assigned yet. A doctor must first assign patients to your lab via "Assign Lab".'
                    : 'No patients found matching your search.'}
                </p>
              )}
            </div>
          </>
        )}

        {activeTab === 'prescriptions' && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">Prescriptions & Lab Reports</h1>
                <p className="page-subtitle">Write lab prescriptions & view doctor notes for your assigned patients</p>
              </div>
            </div>

            {/* Write Prescription Form */}
            <div className="notes-section glass-card">
              <h3>🔬 Write Lab Prescription / Report Note</h3>
              <div className="form-group" style={{ marginTop: '12px' }}>
                <label className="form-label">Select Assigned Patient</label>
                <select
                  className="form-select"
                  value={rxPatientId}
                  onChange={(e) => setRxPatientId(e.target.value)}
                >
                  <option value="">-- Select Patient --</option>
                  {allSelectablePatients.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.email}) {p.assignedBy ? `— ${p.assignedBy}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="note-input-area">
                <textarea
                  placeholder="Write test observations, lab findings, recommendations, or medication adjustments..."
                  value={newPrescription}
                  onChange={(e) => setNewPrescription(e.target.value)}
                />
                <button className="btn btn-primary" onClick={handleAddPrescription}>
                  Add Lab Prescription
                </button>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '24px', marginTop: '24px' }}>
              <h3 style={{ marginBottom: '16px' }}>📋 All Prescriptions & Notes ({prescriptions.length})</h3>
              {prescriptions.length > 0 ? (
                <div className="notes-list">
                  {prescriptions.map(rx => (
                    <div key={rx.id} className="note-item">
                      <div className="note-date" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <span>
                          {new Date(rx.createdAt).toLocaleString()} — Patient: <strong>{rx.patientName}</strong>
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`badge ${rx.authorRole === 'pathology' ? 'badge-primary' : 'badge-info'}`}>
                            {rx.authorRole === 'pathology' ? `🔬 ${rx.authorName || 'Pathology Lab'}` : `👨‍⚕️ Dr. ${rx.doctorName || rx.authorName}`}
                          </span>
                          {/* Pathology can ONLY delete prescriptions written by pathology */}
                          {rx.authorRole === 'pathology' && (rx.pathologyId === user.id || rx.authorName === user.name) && (
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
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                  💊 No prescriptions available for assigned patients.
                </p>
              )}
            </div>
          </>
        )}

        {activeTab === 'analytics' && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">Analytics</h1>
                <p className="page-subtitle">
                  {selectedPatient
                    ? `Analyzing: ${selectedPatient.name}`
                    : 'Select a patient from the Patient Records tab first'}
                </p>
              </div>
            </div>

            {selectedPatient ? (
              <>
                {/* Aggregate Stats */}
                <div className="glass-card" style={{ padding: '24px' }}>
                  <h3 style={{ marginBottom: '16px' }}>📈 Aggregate Statistics</h3>
                  <div className="agg-stats">
                    <div className="agg-stat-item">
                      <div className="agg-stat-value">{aggStats.avgBpm}</div>
                      <div className="agg-stat-label">Avg BPM</div>
                    </div>
                    <div className="agg-stat-item">
                      <div className="agg-stat-value" style={{ color: 'var(--info)' }}>{aggStats.avgSpo2}%</div>
                      <div className="agg-stat-label">Avg SpO2</div>
                    </div>
                    <div className="agg-stat-item">
                      <div className="agg-stat-value" style={{ color: 'var(--danger)' }}>{aggStats.alertCount}</div>
                      <div className="agg-stat-label">Alert Events</div>
                    </div>
                    <div className="agg-stat-item">
                      <div className="agg-stat-value" style={{ color: 'var(--success)' }}>{aggStats.totalReadings}</div>
                      <div className="agg-stat-label">Total Readings</div>
                    </div>
                  </div>
                </div>

                {/* Trend Chart */}
                <div className="chart-container glass-card" style={{ marginTop: '24px' }}>
                  <div className="chart-header">
                    <h3 className="chart-title">📊 Vitals Trend (Last 10 Checkings)</h3>
                    <span className="badge badge-info">{last10PatientReadings.length} readings (Last 10)</span>
                  </div>

                  <div className="chart-wrapper" style={{ height: '350px' }}>
                    {last10PatientReadings.length > 0 ? (
                      <Line data={liveChartData} options={chartOptions} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                        No data available.
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="glass-card" style={{ padding: '60px', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                  📋 Select a patient from the <strong>Patient Records</strong> tab to view analytics.
                </p>
              </div>
            )}
          </>
        )}

        {activeTab === 'reports' && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">Generate Reports</h1>
                <p className="page-subtitle">
                  {selectedPatient
                    ? `Report for: ${selectedPatient.name}`
                    : 'Select a patient from the Patient Records tab first'}
                </p>
              </div>
            </div>

            {selectedPatient ? (
              <div className="report-section glass-card">
                <h3>📄 Health Report</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
                  Generate a downloadable health report for {selectedPatient.name} (includes prescriptions).
                </p>

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
                    {filteredHistory.length} readings included (from last 1 month)
                  </span>
                </div>

                {/* Report Preview Stats */}
                <div className="agg-stats" style={{ marginBottom: '24px' }}>
                  <div className="agg-stat-item">
                    <div className="agg-stat-value">{filteredHistory.length}</div>
                    <div className="agg-stat-label">Readings</div>
                  </div>
                  <div className="agg-stat-item">
                    <div className="agg-stat-value">{aggStats.avgBpm}</div>
                    <div className="agg-stat-label">Avg BPM</div>
                  </div>
                  <div className="agg-stat-item">
                    <div className="agg-stat-value" style={{ color: 'var(--info)' }}>{aggStats.avgSpo2}%</div>
                    <div className="agg-stat-label">Avg SpO2</div>
                  </div>
                  <div className="agg-stat-item">
                    <div className="agg-stat-value" style={{ color: 'var(--danger)' }}>{aggStats.alertCount}</div>
                    <div className="agg-stat-label">Alerts</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="btn btn-primary" onClick={handleGenerateReport}>
                    📥 Download CSV Report
                  </button>
                  <button className="btn btn-ghost" onClick={handlePrintReport}>
                    🖨️ Print Report
                  </button>
                </div>
              </div>
            ) : (
              <div className="glass-card" style={{ padding: '60px', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                  📋 Select a patient from the <strong>Patient Records</strong> tab to generate reports.
                </p>
              </div>
            )}
          </>
        )}

        {activeTab === 'settings' && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">Settings</h1>
                <p className="page-subtitle">Manage pathology lab account and security</p>
              </div>
            </div>

            <DeleteAccountSection />
          </>
        )}
      </main>
    </div>
  );
}
