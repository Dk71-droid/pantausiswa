// Ganti URL ini dengan URL Web App Google Apps Script Anda setelah di-deploy
const GOOGLE_APPS_SCRIPT_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbyA74lf_vJL6Z6Xq6WmuD6kBJlcFiGvY-ei6I283YGESmLuOA0iP3hVol40JGEzbpAO3g/exec";
const PASS_MARK = 75; // Nilai minimum untuk status "Tuntas"

// Hardcoded list of subjects (needed for parent view subject filter)
const HARDCODED_SUBJECTS = [
  "PAI",
  "Pancasila",
  "Bahasa Indonesia",
  "Matematika",
  "IPAS",
  "Seni Rupa",
  "PJOK",
  "Bahasa Jawa",
  "Dawet Ayu",
];

let currentStudentNis = null; // Menyimpan NIS siswa yang sedang login
let currentStudentClass = null; // Menyimpan kelas siswa yang sedang login
let kehadiranChartInstance = null; // To store the Chart.js instance

// Client-side cache for fetched data to reduce API calls
const dataCache = {
  siswa: [],
  tugas: [],
  nilai: [],
  kehadiran: [],
  catatan_guru: [],
  jadwal_pelajaran: [],
  pengumuman: [],
};

// DOM Elements specific to parent view
const loadingOverlay = document.getElementById("loading-overlay");
const loginSection = document.getElementById("login-section");
const parentDashboardSection = document.getElementById(
  "parent-dashboard-section"
);
const toastContainer = document.getElementById("toast-container");
const logoutButtonSidebar = document.getElementById("logout-button-sidebar");
const sidebarMenuIcon = document.getElementById("sidebar-menu-icon");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");
// const announcementBellIcon = document.getElementById("announcement-bell-icon"); // Dihilangkan sesuai permintaan
// const notificationBadge = document.getElementById("notification-badge"); // Dihilangkan sesuai permintaan

const unifiedLoginCard = document.getElementById("unified-login-card");
const loginTitle = document.getElementById("login-title");
const loginForm = document.getElementById("login-form");
const parentNisGroup = document.getElementById("parent-nis-group");
const loginNisInput = document.getElementById("login-nis");
const mainLoginButton = document.getElementById("main-login-button");

// Parent dashboard specific elements
const subjectFilterSelect = document.getElementById("subject-filter-select");
const kehadiranFilterPeriodSelect = document.getElementById(
  "kehadiran-filter-period"
);
const kehadiranChartLegend = document.getElementById("kehadiran-chart-legend");
const jadwalFilterDaySelect = document.getElementById("jadwal-filter-day");

// Notification elements (Tetap dideklarasikan jika elemennya ada di HTML, tapi fungsionalitasnya dihilangkan)
const announcementModal = document.getElementById("announcement-modal");
const announcementList = document.getElementById("announcement-list");

// Confirmation Modal Elements
const confirmModal = document.getElementById("confirm-modal");
const confirmModalTitle = document.getElementById("confirm-modal-title");
const confirmModalMessage = document.getElementById("confirm-modal-message");
const confirmCancelBtn = document.getElementById("confirm-cancel-btn");
const confirmOkBtn = document.getElementById("confirm-ok-btn");
let onConfirmCallback = null; // Store callback for confirmation

// Summary Modal Elements
const summarizeNotesButton = document.getElementById("summarize-notes-button");
const summaryModal = document.getElementById("summary-modal");
const summaryContent = document.getElementById("summary-content");

// Refresh Data button (assuming it's now directly in HTML)
const refreshDataButton = document.getElementById("refresh-data-button");

// --- Loading Overlay Functions ---
function showLoading() {
  loadingOverlay.classList.add("visible");
}

function hideLoading() {
  loadingOverlay.classList.remove("visible");
}

// Fungsi untuk menampilkan atau menyembunyikan bagian aplikasi
function showSection(sectionId) {
  loginSection.classList.add("section-hidden");
  parentDashboardSection.classList.add("section-hidden");
  document.getElementById(sectionId).classList.remove("section-hidden");

  // Tampilkan ikon sidebar dan tombol refresh hanya jika di dashboard
  if (sectionId === "parent-dashboard-section") {
    sidebarMenuIcon.style.display = "block";
    if (refreshDataButton) {
      // Periksa keberadaan tombol sebelum menampilkan
      refreshDataButton.style.display = "block"; // Tampilkan tombol refresh
    }
  } else {
    sidebarMenuIcon.style.display = "none";
    if (refreshDataButton) {
      // Periksa keberadaan tombol sebelum menyembunyikan
      refreshDataButton.style.display = "none"; // Sembunyikan tombol refresh
    }
  }
}

// --- Sidebar Functions ---
function openSidebar() {
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("visible");
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("visible");
}
// Attach click listener to overlay to close sidebar
sidebarOverlay.addEventListener("click", closeSidebar);

// --- Toast Notification Function ---
function showToast(message, type = "info", duration = 3000) {
  const toast = document.createElement("div");
  toast.classList.add("toast", type);
  toast.textContent = message;
  toastContainer.appendChild(toast);

  void toast.offsetWidth; // Trigger reflow
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
    toast.addEventListener("transitionend", () => {
      toast.remove();
    });
  }, duration);
}

// --- Custom Confirmation Modal Functions ---
function showConfirmModal(message, onConfirm, title = "Konfirmasi") {
  confirmModalTitle.textContent = title;
  confirmModalMessage.textContent = message;
  onConfirmCallback = onConfirm;
  confirmModal.classList.add("open");
}

function hideConfirmModal() {
  confirmModal.classList.remove("open");
  onConfirmCallback = null;
}

confirmCancelBtn.addEventListener("click", hideConfirmModal);
confirmOkBtn.addEventListener("click", () => {
  if (onConfirmCallback) {
    onConfirmCallback();
  }
  hideConfirmModal();
});

// --- Summary Modal Functions ---
function openSummaryModal() {
  summaryModal.classList.add("open");
}

function closeSummaryModal() {
  summaryModal.classList.remove("open");
  summaryContent.innerHTML =
    '<p class="text-center text-gray-500">Membuat ringkasan...</p>';
}

// Universal tab switching function
function switchTab(targetTabId, buttons, prefix = "") {
  document.querySelectorAll(`.${prefix}tab-content`).forEach((content) => {
    content.classList.add("section-hidden");
  });

  buttons.forEach((btn) => {
    btn.classList.remove("text-blue-600", "border-blue-600", "border-b-2");
    btn.classList.add("text-gray-700");
  });

  document.getElementById(targetTabId).classList.remove("section-hidden");

  const clickedButton = Array.from(buttons).find(
    (btn) => btn.dataset.tab === targetTabId
  );
  if (clickedButton) {
    clickedButton.classList.remove("text-gray-700");
    clickedButton.classList.add(
      "text-blue-600",
      "border-b-2",
      "border-blue-600"
    );
  }
}

// --- Helper Functions for Session Storage (Caching tanpa waktu kedaluwarsa otomatis) ---
function saveDataToSessionStorage() {
  try {
    sessionStorage.setItem("loggedInNIS", currentStudentNis);
    sessionStorage.setItem("dataCache", JSON.stringify(dataCache));
  } catch (e) {
    console.error("Error saving data to session storage:", e);
    showToast("Gagal menyimpan data sesi.", "error");
  }
}

function loadDataFromSessionStorage() {
  try {
    const cachedNIS = sessionStorage.getItem("loggedInNIS");
    const cachedDataString = sessionStorage.getItem("dataCache");

    if (cachedNIS && cachedDataString) {
      currentStudentNis = cachedNIS;
      Object.assign(dataCache, JSON.parse(cachedDataString));
      console.log("Data loaded from session storage.");
      return true; // Data berhasil dimuat
    }
  } catch (e) {
    console.error("Error loading data from session storage:", e);
    sessionStorage.removeItem("loggedInNIS");
    sessionStorage.removeItem("dataCache");
    showToast("Sesi data rusak. Silakan login kembali.", "error");
  }
  return false; // Tidak ada data ditemukan atau ada error
}

// --- Login Form Submission (Parent Only) ---
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showLoading();

  try {
    const nis = loginNisInput.value.trim();
    if (!nis) {
      showToast("NIS tidak boleh kosong.", "error");
      hideLoading();
      return;
    }

    const studentData = await fetchData("Siswa", nis);

    if (studentData && studentData.length > 0) {
      const student = studentData[0];
      currentStudentNis = student.NIS;
      currentStudentClass = student.Kelas;

      document.getElementById("student-name").textContent = student.Nama;
      document.getElementById("student-nis").textContent = student.NIS;
      document.getElementById("student-class").textContent = student.Kelas;

      await loadParentDashboardData(currentStudentNis); // Ambil data dari server
      saveDataToSessionStorage(); // Simpan data yang baru diambil ke sessionStorage

      showSection("parent-dashboard-section");
      switchTab("tugas-status", document.querySelectorAll(".tab-button"));
    } else {
      showToast(
        "NIS tidak ditemukan. Mohon periksa kembali NIS Anda.",
        "error"
      );
    }
  } catch (error) {
    console.error("Login Error:", error);
    showToast("Terjadi kesalahan saat login.", "error");
  } finally {
    hideLoading();
  }
});

// --- Logout Function ---
function logout() {
  currentStudentNis = null;
  currentStudentClass = null;
  sessionStorage.removeItem("loggedInNIS"); // Clear persistent login
  sessionStorage.removeItem("dataCache"); // Clear cached data
  localStorage.clear(); // Clear all local storage for a clean logout
  // Clear all data cache in memory on logout
  for (const key in dataCache) {
    if (dataCache.hasOwnProperty(key)) {
      dataCache[key] = [];
    }
  }
  closeSidebar();

  loginNisInput.value = "";
  showSection("login-section");
  // Ensure login button text is reset
  mainLoginButton.textContent = "Cari Siswa";
}
// Attach logout function to the new sidebar logout button
logoutButtonSidebar.addEventListener("click", logout);

// --- Tab Switching Logic for Parent Dashboard ---
document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", async () => {
    const targetTab = button.dataset.tab;
    switchTab(targetTab, document.querySelectorAll(".tab-button"));
    showLoading();
    try {
      // Data sudah ada di dataCache, jadi langsung render
      if (targetTab === "kehadiran" && dataCache.kehadiran.length > 0) {
        const currentFilter = kehadiranFilterPeriodSelect.value;
        renderKehadiranChartAndTable(dataCache.kehadiran, currentFilter);
      } else if (
        targetTab === "jadwal-pelajaran" &&
        dataCache.jadwal_pelajaran.length > 0
      ) {
        const currentFilterDay = jadwalFilterDaySelect.value;
        renderJadwalPelajaran(
          dataCache.jadwal_pelajaran,
          currentStudentClass,
          currentFilterDay
        );
      }
    } catch (error) {
      console.error("Error loading tab data:", error);
      showToast("Gagal memuat data untuk tab ini.", "error");
    } finally {
      hideLoading();
    }
  });
});

// --- Data Fetching Function (GET) ---
async function fetchData(sheetName, param = null) {
  let url = `${GOOGLE_APPS_SCRIPT_WEB_APP_URL}?sheet=${sheetName}`;
  if (param) {
    if (
      sheetName === "Siswa" ||
      sheetName === "Kehadiran" ||
      sheetName === "Catatan_Guru"
    ) {
      if (typeof param === "object") {
        url += `&nis=${param.nis || ""}`;
      } else {
        url += `&nis=${param}`;
      }
    } else if (sheetName === "Nilai") {
      if (typeof param === "object" && param.nis && param.id_tugas) {
        url += `&nis=${param.nis}&id_tugas=${param.id_tugas}`;
      } else if (typeof param === "string") {
        url += `&nis=${param}`;
      }
    } else if (sheetName === "Jadwal_Pelajaran" && param.class) {
      url += `&class=${param.class}`;
    } else if (sheetName === "Pengumuman" && param.class) {
      url += `&class=${param.class}`;
    }
  }
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log(`Fetched data from ${sheetName}:`, data);
    return data;
  } catch (error) {
    console.error(`Error fetching data from ${sheetName}:`, error);
    showToast(
      `Gagal mengambil data dari ${sheetName}. Error: ${error.message}`,
      "error"
    );
    return null;
  }
}

// --- Parent Dashboard Data Loading and Rendering ---
// Fungsi ini akan selalu mengambil data terbaru dari server
async function loadParentDashboardData(nis) {
  const nilaiData = await fetchData("Nilai", nis);
  const tugasData = await fetchData("Tugas");
  const kehadiranData = await fetchData("Kehadiran", nis);
  const catatanGuruData = await fetchData("Catatan_Guru", nis);
  const studentInfo = await fetchData("Siswa", nis);

  dataCache.nilai = nilaiData;
  dataCache.tugas = tugasData;
  dataCache.kehadiran = kehadiranData;
  dataCache.catatan_guru = catatanGuruData;
  dataCache.siswa = studentInfo;

  populateSubjectFilterSelect();
  renderTugasStatus(dataCache.tugas, dataCache.nilai, nis, "Semua");

  kehadiranFilterPeriodSelect.value = "all";
  renderKehadiranChartAndTable(dataCache.kehadiran, "all");

  renderCatatanGuru(dataCache.catatan_guru);
  if (studentInfo && studentInfo.length > 0) {
    const studentClass = studentInfo[0].Kelas;
    const jadwalData = await fetchData("Jadwal_Pelajaran", {
      class: studentClass,
    });
    dataCache.jadwal_pelajaran = jadwalData;
    jadwalFilterDaySelect.value = "all";
    renderJadwalPelajaran(dataCache.jadwal_pelajaran, studentClass, "all");
  }
}

// Helper function to get header labels for data-label attribute
function getHeaderLabels(tableBodyId) {
  let headers = [];
  const table = document.getElementById(tableBodyId).closest("table");
  if (table && table.querySelector("thead tr")) {
    table.querySelectorAll("thead th").forEach((th) => {
      headers.push(th.textContent.trim());
    });
  }
  return headers;
}

function renderTugasStatus(
  allTugasData,
  nilaiData,
  currentNis,
  filterSubject = "Semua"
) {
  const tbody = document.getElementById("tugas-status-table-body");
  tbody.innerHTML = "";

  let filteredTugasData = allTugasData;
  if (filterSubject !== "Semua") {
    filteredTugasData = allTugasData.filter(
      (tugas) => tugas.Mata_Pelajaran === filterSubject
    );
  }

  if (!filteredTugasData || filteredTugasData.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="text-center py-4 text-gray-500">Tidak ada tugas yang terdaftar.</td></tr>';
    return;
  }

  const belumDikerjakan = [];
  const remedial = [];
  const tuntas = [];

  filteredTugasData.forEach((tugas) => {
    const studentNilai = nilaiData.find(
      (n) =>
        n.ID_Tugas === tugas.ID_Tugas && String(n.NIS) === String(currentNis)
    );

    if (!studentNilai) {
      belumDikerjakan.push({
        ...tugas,
        status: "Belum Dikerjakan",
        nilaiDisplay: "N/A",
      });
    } else if (studentNilai.Status_Pengerjaan === "Remedial") {
      remedial.push({
        ...tugas,
        status: "Remedial",
        nilaiDisplay: studentNilai.Nilai,
      });
    } else if (studentNilai.Status_Pengerjaan === "Tuntas") {
      tuntas.push({
        ...tugas,
        status: "Tuntas",
        nilaiDisplay: studentNilai.Nilai,
      });
    } else {
      belumDikerjakan.push({
        ...tugas,
        status: "Belum Dikerjakan",
        nilaiDisplay: "N/A",
      });
    }
  });

  const sortByBatasWaktu = (a, b) =>
    new Date(a.Batas_Waktu) - new Date(b.Batas_Waktu);

  belumDikerjakan.sort(sortByBatasWaktu);
  remedial.sort(sortByBatasWaktu);
  tuntas.sort(sortByBatasWaktu);

  const orderedTasks = [...belumDikerjakan, ...remedial, ...tuntas];

  orderedTasks.forEach((task) => {
    const row = document.createElement("tr");
    let statusColorClass;
    let statusText;

    if (task.status === "Tuntas") {
      statusColorClass = "text-green-600";
      statusText = `Tuntas! Nilai: ${task.nilaiDisplay}`;
      row.classList.add("bg-white");
    } else if (task.status === "Remedial") {
      statusColorClass = "text-red-600";
      statusText = `Remedial. Nilai: ${task.nilaiDisplay}`;
      row.classList.add("bg-white");
    } else {
      statusColorClass = "text-red-600";
      statusText = `Belum Dikerjakan. Batas: ${task.Batas_Waktu}`;
      row.classList.add("bg-white");
    }

    row.classList.add("tugas-simplified-row", "rounded-md", "mb-2");
    row.innerHTML = `
        <td colspan="5">
            <div class="flex flex-col md:flex-row md:justify-between items-start md:items-center py-2 px-2 border-b border-gray-100 last:border-none">
                <div class="flex-grow">
                    <span class="font-semibold text-gray-800">${task.Nama_Tugas} (${task.Mata_Pelajaran})</span>
                </div>
                <div class="text-right ${statusColorClass} mt-1 md:mt-0 font-medium">
                    ${statusText}
                </div>
            </div>
        </td>
    `;
    tbody.appendChild(row);
  });
}

function populateSubjectFilterSelect() {
  subjectFilterSelect.innerHTML =
    '<option value="Semua">Semua Mata Pelajaran</option>';

  HARDCODED_SUBJECTS.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    subjectFilterSelect.appendChild(option);
  });
}

subjectFilterSelect.addEventListener("change", (event) => {
  const selectedSubject = event.target.value;
  renderTugasStatus(
    dataCache.tugas,
    dataCache.nilai,
    currentStudentNis,
    selectedSubject
  );
});

// --- Filter Attendance Data ---
function filterAttendanceData(allData, period) {
  const now = new Date();
  let startDate = null;

  if (!allData || allData.length === 0) return [];

  const sortedData = [...allData].sort(
    (a, b) => new Date(b.Tanggal) - new Date(a.Tanggal)
  );
  const latestRecordDate =
    sortedData.length > 0 ? new Date(sortedData[0].Tanggal) : now;

  switch (period) {
    case "week":
      startDate = new Date(latestRecordDate);
      startDate.setDate(latestRecordDate.getDate() - 7);
      break;
    case "month":
      startDate = new Date(
        latestRecordDate.getFullYear(),
        latestRecordDate.getMonth(),
        1
      );
      break;
    case "3months":
      startDate = new Date(latestRecordDate);
      startDate.setMonth(latestRecordDate.getMonth() - 3);
      break;
    case "all":
    default:
      return allData;
  }

  return allData.filter((item) => {
    const itemDate = new Date(item.Tanggal);
    return itemDate >= startDate && itemDate <= latestRecordDate;
  });
}

// --- Render Kehadiran Chart and Table ---
function renderKehadiranChartAndTable(allKehadiranData, filterPeriod) {
  const filteredData = filterAttendanceData(allKehadiranData, filterPeriod);
  renderAttendanceChart(filteredData);
  renderKehadiranTable(filteredData);
}

// --- Render Kehadiran Table ---
function renderKehadiranTable(kehadiranData) {
  const tbody = document.getElementById("kehadiran-table-body");
  tbody.innerHTML = "";

  if (!kehadiranData || kehadiranData.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="2" class="text-center py-4 text-gray-500">Tidak ada data kehadiran untuk periode ini.</td></tr>';
    return;
  }
  const headers = getHeaderLabels("kehadiran-table-body");

  kehadiranData.sort((a, b) => new Date(b.Tanggal) - new Date(a.Tanggal));

  kehadiranData.forEach((data) => {
    const row = document.createElement("tr");
    row.innerHTML = `
                  <td data-label="${headers[0]}">${data.Tanggal}</td>
                  <td data-label="${headers[1]}">${data.Status}</td>
              `;
    tbody.appendChild(row);
  });
}

// --- Render Pie Chart for Kehadiran ---
function renderAttendanceChart(kehadiranData) {
  const canvas = document.getElementById("kehadiran-chart");
  const legendContainer = document.getElementById("kehadiran-chart-legend");
  if (!canvas) {
    console.warn("Canvas element 'kehadiran-chart' not found.");
    return;
  }

  if (kehadiranChartInstance) {
    kehadiranChartInstance.destroy();
  }

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cssWidth = canvas.offsetWidth;
  const cssHeight = canvas.offsetHeight;

  const devicePixelRatio = window.devicePixelRatio || 1;

  canvas.width = cssWidth * devicePixelRatio;
  canvas.height = cssHeight * devicePixelRatio;

  ctx.scale(devicePixelRatio, devicePixelRatio);

  const statusCounts = {
    Hadir: 0,
    Izin: 0,
    Sakit: 0,
    Alpha: 0,
  };

  kehadiranData.forEach((item) => {
    const status = item.Status;
    if (statusCounts.hasOwnProperty(status)) {
      statusCounts[status]++;
    }
  });

  const labels = Object.keys(statusCounts);
  const data = Object.values(statusCounts);
  const colors = ["#4CAF50", "#FFC107", "#2196F3", "#F44336"];
  const legendLabels = {
    Hadir: "Hadir",
    Izin: "Izin",
    Sakit: "Sakit",
    Alpha: "Alpha",
  };

  let total = data.reduce((sum, value) => sum + value, 0);

  if (total === 0) {
    ctx.fillStyle = "#6b7280";
    ctx.font = `bold ${16 / devicePixelRatio}px Inter`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      "Tidak ada data kehadiran untuk periode ini.",
      cssWidth / 2,
      cssHeight / 2
    );
    legendContainer.innerHTML = "";
    return;
  }

  kehadiranChartInstance = new Chart(canvas, {
    type: "pie",
    data: {
      labels: labels,
      datasets: [
        {
          data: data,
          backgroundColor: colors,
          borderColor: "#ffffff",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const label = context.label || "";
              const value = context.raw;
              const percentage = ((value / total) * 100).toFixed(1);
              return `${label}: ${value} (${percentage}%)`;
            },
          },
        },
      },
    },
  });

  legendContainer.innerHTML = "";
  labels.forEach((label, index) => {
    const color = colors[index];
    const count = statusCounts[label];
    const legendItem = document.createElement("div");
    legendItem.classList.add("flex", "items-center", "space-x-1");
    legendItem.innerHTML = `
                  <span class="inline-block w-3 h-3 rounded-full" style="background-color: ${color};"></span>
                  <span class="text-gray-700">${legendLabels[label]} (${count})</span>
              `;
    legendContainer.appendChild(legendItem);
  });
}

window.addEventListener("resize", () => {
  if (!parentDashboardSection.classList.contains("section-hidden")) {
    if (dataCache.kehadiran && dataCache.kehadiran.length > 0) {
      const currentFilter = kehadiranFilterPeriodSelect.value;
      renderKehadiranChartAndTable(dataCache.kehadiran, currentFilter);
    }
  }
});

kehadiranFilterPeriodSelect.addEventListener("change", (event) => {
  const selectedPeriod = event.target.value;
  renderKehadiranChartAndTable(dataCache.kehadiran, selectedPeriod);
});

function renderCatatanGuru(catatanData) {
  const tbody = document.getElementById("catatan-guru-table-body");
  tbody.innerHTML = "";

  if (!catatanData || catatanData.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="3" class="text-center py-4 text-gray-500">Tidak ada catatan guru.</td></tr>';
    return;
  }
  const headers = getHeaderLabels("catatan-guru-table-body");

  catatanData.forEach((data) => {
    const row = document.createElement("tr");
    row.innerHTML = `
                  <td data-label="${headers[0]}">${data.Minggu_Ke}</td>
                  <td data-label="${headers[1]}">${data.Catatan}</td>
                  <td data-label="${headers[2]}">${
      data.Tanggal_Input || "N/A"
    }</td>
              `;
    tbody.appendChild(row);
  });
}

function renderJadwalPelajaran(allJadwalData, studentClass, filterDay = "all") {
  const tbody = document.getElementById("jadwal-pelajaran-table-body");
  tbody.innerHTML = "";

  if (!allJadwalData || allJadwalData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">Tidak ada jadwal pelajaran untuk kelas ${studentClass}.</td></tr>`;
    return;
  }
  const headers = getHeaderLabels("jadwal-pelajaran-table-body");

  let filteredJadwal = allJadwalData;
  if (filterDay !== "all") {
    filteredJadwal = allJadwalData.filter(
      (jadwal) => jadwal.Hari === filterDay
    );
  }

  if (filteredJadwal.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">Tidak ada jadwal pelajaran untuk kelas ${studentClass} pada hari ${
      filterDay === "all" ? "ini" : filterDay
    }.</td></tr>`;
    return;
  }

  filteredJadwal.sort((a, b) => {
    const days = [
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
      "Minggu",
    ];
    const dayA = days.indexOf(a.Hari);
    const dayB = days.indexOf(b.Hari);
    if (dayA !== dayB) return dayA - dayB;
    return a.Jam.localeCompare(b.Jam);
  });

  filteredJadwal.forEach((data) => {
    const row = document.createElement("tr");
    row.innerHTML = `
                  <td data-label="${headers[0]}">${data.Hari}</td>
                  <td data-label="${headers[1]}">${data.Jam}</td>
                  <td data-label="${headers[2]}">${data.Mata_Pelajaran}</td>
                  <td data-label="${headers[3]}">${data.Guru}</td>
              `;
    tbody.appendChild(row);
  });
}

jadwalFilterDaySelect.addEventListener("change", (event) => {
  const selectedDay = event.target.value;
  if (currentStudentClass) {
    renderJadwalPelajaran(
      dataCache.jadwal_pelajaran,
      currentStudentClass,
      selectedDay
    );
  }
});

// --- Notification Logic (Fungsionalitas dihilangkan) ---
function getReadAnnouncements() {
  return new Set(); // Selalu kosong
}

function saveReadAnnouncements(readSet) {
  // Tidak melakukan apa-apa
}

function updateNotificationBadge() {
  // Tidak melakukan apa-apa, selalu pastikan badge tersembunyi
  const notificationBadge = document.getElementById("notification-badge");
  if (notificationBadge) notificationBadge.classList.add("hidden");
}

function openAnnouncementModal() {
  // Tidak melakukan apa-apa
  showToast("Fungsionalitas pengumuman tidak aktif.", "info");
}

function closeAnnouncementModal() {
  // Tidak melakukan apa-apa
}

function renderAnnouncementsInModal(announcements) {
  // Tidak melakukan apa-apa
  if (announcementList) {
    announcementList.innerHTML =
      '<p class="text-center text-gray-500">Fungsionalitas pengumuman tidak aktif.</p>';
  }
}

// --- Gemini API Call for Summarization ---
async function callGeminiAPI(prompt) {
  const apiKey = "";
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const chatHistory = [];
  chatHistory.push({ role: "user", parts: [{ text: prompt }] });

  const payload = { contents: chatHistory };

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (
      result.candidates &&
      result.candidates.length > 0 &&
      result.candidates[0].content &&
      result.candidates[0].content.parts &&
      result.candidates[0].content.parts.length > 0
    ) {
      return result.candidates[0].content.parts[0].text;
    } else {
      console.error("Unexpected Gemini API response structure:", result);
      throw new Error("Failed to get summary from AI.");
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error(`Error: ${error.message}`);
  }
}

// --- Summarize Notes Function ---
summarizeNotesButton.addEventListener("click", async () => {
  if (!currentStudentNis) {
    showToast(
      "Anda harus login sebagai wali murid untuk membuat ringkasan catatan.",
      "info"
    );
    return;
  }

  if (!dataCache.catatan_guru || dataCache.catatan_guru.length === 0) {
    showToast("Tidak ada catatan guru untuk diringkas.", "warning");
    return;
  }

  openSummaryModal();
  summaryContent.innerHTML =
    '<div class="text-center py-4 text-gray-500 flex flex-col items-center justify-center"><div class="spinner w-8 h-8"></div><p class="mt-2">Membuat ringkasan catatan...</p></div>';

  try {
    const allNotes = dataCache.catatan_guru
      .map((note) => `Minggu ${note.Minggu_Ke}: ${note.Catatan}`)
      .join("\n");

    const prompt = `Buat ringkasan padat dan mudah dipahami dalam Bahasa Indonesia dari catatan guru berikut ini untuk wali murid. Jelaskan poin-poin penting tentang kemajuan atau masalah siswa. Jika tidak ada poin penting yang menonjol, sebutkan bahwa tidak ada masalah khusus. Pisahkan poin-poin dengan bullet point.\n\nCatatan Guru:\n${allNotes}`;

    const summary = await callGeminiAPI(prompt);
    summaryContent.innerHTML = `<p>${summary.replace(/\n/g, "<br>")}</p>`;
  } catch (error) {
    summaryContent.innerHTML = `<p class="text-red-600">Gagal membuat ringkasan: ${error.message}. Silakan coba lagi.</p>`;
    showToast("Gagal membuat ringkasan catatan.", "error");
  }
});

// --- Handle Refresh Data Button Click ---
if (refreshDataButton) {
  // Pastikan tombol ada sebelum menambahkan event listener
  refreshDataButton.addEventListener("click", async () => {
    if (currentStudentNis) {
      showLoading();
      try {
        // Force re-fetch all data and update cache
        await loadParentDashboardData(currentStudentNis);
        saveDataToSessionStorage(); // Simpan data terbaru ke cache
        showToast("Data berhasil diperbarui dari server.", "success");
      } catch (error) {
        console.error("Error refreshing data:", error);
        showToast("Gagal memperbarui data dari server.", "error");
      } finally {
        hideLoading();
      }
    } else {
      showToast("Anda harus login untuk me-refresh data.", "info");
    }
  });
}

// --- Initialization Logic ---
document.addEventListener("DOMContentLoaded", async () => {
  const isDataRestored = loadDataFromSessionStorage(); // Hanya memeriksa keberadaan data di cache

  if (isDataRestored && currentStudentNis) {
    showLoading();
    try {
      // Re-populate student identity from dataCache.siswa
      const student = dataCache.siswa[0];
      if (student) {
        currentStudentClass = student.Kelas; // Ensure currentStudentClass is set
        document.getElementById("student-name").textContent = student.Nama;
        document.getElementById("student-nis").textContent = student.NIS;
        document.getElementById("student-class").textContent = student.Kelas;

        // Render sections directly from restored dataCache
        populateSubjectFilterSelect();
        renderTugasStatus(
          dataCache.tugas,
          dataCache.nilai,
          currentStudentNis,
          "Semua"
        );
        kehadiranFilterPeriodSelect.value = "all";
        renderKehadiranChartAndTable(dataCache.kehadiran, "all");
        renderCatatanGuru(dataCache.catatan_guru);
        jadwalFilterDaySelect.value = "all";
        renderJadwalPelajaran(
          dataCache.jadwal_pelajaran,
          currentStudentClass,
          "all"
        );
        // updateNotificationBadge(); // Dihilangkan

        showSection("parent-dashboard-section");
        switchTab("tugas-status", document.querySelectorAll(".tab-button"));
      } else {
        // Fallback if cached student data is somehow missing or invalid
        sessionStorage.removeItem("loggedInNIS");
        sessionStorage.removeItem("dataCache");
        showSection("login-section");
        showToast(
          "Sesi login tidak valid atau data cache tidak lengkap. Silakan login kembali.",
          "error"
        );
      }
    } catch (error) {
      console.error("Error restoring session from cache:", error);
      sessionStorage.removeItem("loggedInNIS");
      sessionStorage.removeItem("dataCache");
      showSection("login-section");
      showToast(
        "Terjadi kesalahan saat memulihkan sesi dari cache. Silakan login kembali.",
        "error"
      );
    } finally {
      hideLoading();
    }
  } else {
    // Jika tidak ada NIS yang tersimpan di sessionStorage, tampilkan halaman login
    // atau jika dataCache kosong (sesi pertama kali atau cache direset manual)
    showSection("login-section");
  }
});
