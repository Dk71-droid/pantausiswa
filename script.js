// Ganti URL ini dengan URL Web App Google Apps Script Anda setelah di-deploy
const GOOGLE_APPS_SCRIPT_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbzY3vKWP0c1TwYCGXcQ9ITCgImDpFLJyc4gjzI-Eu5cAp6YJrExlIRSxEpUDQSjm5ov/exec";
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
  siswa: [], // Still fetched from original Siswa sheet
  tugas: [], // Now derived from ExportWeb -> statustugas
  nilai: [], // Now derived from ExportWeb -> statustugas (embedded with tugas)
  kehadiran: [], // Now derived from ExportWeb -> kehadiran
  catatan_guru: [], // Now derived from ExportWeb -> catatanguru
  jadwal_pelajaran: [], // Now derived from ExportWeb -> jadwalpelajaran
  pengumuman: [], // Now derived from ExportWeb -> pengumuman
  ExportWeb_raw_data: null, // To store the raw fetched ExportWeb data
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

const unifiedLoginCard = document.getElementById("unified-login-card");
const loginTitle = document.getElementById("login-title");
const loginForm = document.getElementById("login-form");
const parentNisGroup = document.getElementById("parent-nis-group");
const loginNisInput = document.getElementById("login-nis");
const mainLoginButton = document.getElementById("main-login-button");

// Parent dashboard specific elements
const studentNameSpan = document.getElementById("student-name");
const studentNisSpan = document.getElementById("student-nis");
const studentClassSpan = document.getElementById("student-class");

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

// Refresh Data button
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
      refreshDataButton.style.display = "block"; // Tampilkan tombol refresh
    }
  } else {
    sidebarMenuIcon.style.display = "none";
    if (refreshDataButton) {
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

// --- Helper Functions for Session Storage (Caching) ---
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
      // Use a temporary object to parse and then assign properties individually
      // to avoid overwriting methods if dataCache had any, though it doesn't currently.
      const parsedCache = JSON.parse(cachedDataString);
      Object.assign(dataCache, parsedCache);
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

/**
 * Parses a single string entry from ExportWeb (e.g., from statustugas, kehadiran).
 * Handles quoted commas within fields.
 * @param {string} entryString - The string representing one record (e.g., "714,\"Bab 1 | Formatif 1\",...").
 * @returns {Array<string>} An array of parsed field values.
 */
function parseExportWebEntry(entryString) {
  const result = [];
  let inQuote = false;
  let currentField = "";
  for (let i = 0; i < entryString.length; i++) {
    const char = entryString[i];
    if (char === '"') {
      if (i + 1 < entryString.length && entryString[i + 1] === '"') {
        // Escaped quote: "" -> "
        currentField += '"';
        i++; // Skip next quote
      } else {
        inQuote = !inQuote;
      }
    } else if (char === "," && !inQuote) {
      result.push(currentField);
      currentField = "";
    } else {
      currentField += char;
    }
  }
  result.push(currentField); // Add the last field
  return result;
}

/**
 * Processes the raw ExportWeb data for a specific student/class based on the requested sheet.
 * This function iterates through all rows of rawExportWebData and extracts relevant records.
 *
 * @param {Array<Object>} rawExportWebData - The raw data array from ExportWeb sheet (each object is a row).
 * @param {string} requestedSheetName - The specific 'sheet' (e.g., 'Tugas', 'Kehadiran') being requested.
 * @param {string} nisFilter - The NIS of the student to filter data for.
 * @param {string} classFilter - The class of the student to filter data for.
 * @returns {Array<Object>} Parsed and filtered data for the requested sheet.
 */
function processAndFilterExportWebData(
  rawExportWebData,
  requestedSheetName,
  nisFilter,
  classFilter
) {
  if (!rawExportWebData || rawExportWebData.length === 0) {
    return [];
  }

  const results = [];

  try {
    for (const row of rawExportWebData) {
      switch (requestedSheetName) {
        case "Tugas":
        case "Nilai": // Nilai is embedded in Tugas for parent view
          if (row.statustugas && row.statustugas.trim() !== "") {
            const parts = parseExportWebEntry(row.statustugas); // Each cell is one record
            if (parts.length === 6) {
              // NIM,Nama Tugas,Mata Pelajaran,hari tanggal bulan tahun,Nilai,Status
              if (String(parts[0]) === nisFilter) {
                // Filter by NIM
                results.push({
                  NIS: parts[0],
                  Nama_Tugas: parts[1],
                  Mata_Pelajaran: parts[2],
                  Batas_Waktu: parts[3],
                  Nilai:
                    parts[4] === "" || parts[4] === "null"
                      ? null
                      : parseInt(parts[4]),
                  Status_Pengerjaan: parts[5],
                });
              }
            } else {
              console.warn(
                "Invalid statustugas entry format:",
                row.statustugas
              );
            }
          }
          break;

        case "Kehadiran":
          if (row.kehadiran && row.kehadiran.trim() !== "") {
            const parts = parseExportWebEntry(row.kehadiran); // Each cell is one record
            if (parts.length === 6) {
              // NIM,hadir jumlah,izin jumlah,sakit jumlah,alpha jumlah,mmddyyyy
              if (String(parts[0]) === nisFilter) {
                // Filter by NIM
                results.push({
                  NIS: parts[0],
                  Hadir: parseInt(parts[1] || 0),
                  Izin: parseInt(parts[2] || 0),
                  Sakit: parseInt(parts[3] || 0),
                  Alpha: parseInt(parts[4] || 0),
                  TanggalTerakhir: parts[5],
                });
              }
            } else {
              console.warn("Invalid kehadiran entry format:", row.kehadiran);
            }
          }
          break;

        case "Catatan_Guru":
          if (row.catatanguru && row.catatanguru.trim() !== "") {
            const parts = parseExportWebEntry(row.catatanguru); // Each cell is one record
            // FIX: Changed expected parts length from 2 to 3, and adjusted parsing
            if (parts.length === 3) {
              // Expected: NIM,Minggu_Ke,Catatan
              const nisFromData = parts[0];
              const mingguKe = parts[1];
              const catatanText = parts[2];
              if (String(nisFromData) === nisFilter) {
                // Filter by NIM
                results.push({
                  ID_Catatan: `${nisFromData}_${mingguKe}`, // Reconstruct ID if needed
                  NIS: nisFromData,
                  Minggu_Ke: mingguKe,
                  Catatan: catatanText,
                  Tanggal_Input: "N/A", // Not available in ExportWeb format
                });
              }
            } else {
              console.warn(
                "Invalid catatanguru entry format:",
                row.catatanguru
              );
            }
          }
          break;

        case "Jadwal_Pelajaran":
          if (row.jadwalpelajaran && row.jadwalpelajaran.trim() !== "") {
            const parts = parseExportWebEntry(row.jadwalpelajaran); // Each cell is one record
            if (parts.length === 5) {
              // ID_Jadwal,Kelas,Hari,Jam,Mata_Pelajaran
              const kelasInJadwal = String(parts[1]).toLowerCase();
              if (kelasInJadwal === classFilter.toLowerCase()) {
                // Filter by Class
                results.push({
                  ID_Jadwal: parts[0],
                  Kelas: parts[1],
                  Hari: parts[2],
                  Jam: parts[3],
                  Mata_Pelajaran: parts[4],
                  Guru: "N/A", // Not available in ExportWeb format
                });
              }
            } else {
              console.warn(
                "Invalid jadwalpelajaran entry format:",
                row.jadwalpelajaran
              );
            }
          }
          break;

        case "Pengumuman":
          if (row.pengumuman && row.pengumuman.trim() !== "") {
            const parts = parseExportWebEntry(row.pengumuman); // Each cell is one record
            // FIX: Adjusted parts length for Pengumuman to 4
            if (parts.length === 4) {
              // Untuk_Kelas,Tanggal_Pengumuman,Judul,Isi_Pengumuman
              const untukKelas = String(parts[0]).toLowerCase();
              if (
                untukKelas === "semua" ||
                untukKelas.includes(classFilter.toLowerCase())
              ) {
                // Filter by Class or 'Semua'
                results.push({
                  Untuk_Kelas: parts[0],
                  Tanggal_Pengumuman: parts[1],
                  Judul: parts[2],
                  Isi_Pengumuman: parts[3],
                });
              }
            } else {
              console.warn("Invalid pengumuman entry format:", row.pengumuman);
            }
          }
          break;
        default:
          // This case should ideally not be reached if fetchData correctly uses "ExportWeb_fetch_raw"
          console.warn(
            `Requested sheet name '${requestedSheetName}' not handled by ExportWeb processing directly.`
          );
          break;
      }
    }
  } catch (e) {
    console.error(
      `Error processing ExportWeb data for ${requestedSheetName}:`,
      e
    );
    return [];
  }
  return results;
}

/**
 * Fetches data from the Google Apps Script Web App.
 * This function has two primary modes:
 * 1. `sheetName = "ExportWeb_fetch_raw"`: Fetches the entire raw ExportWeb sheet data.
 * 2. `sheetName = "Siswa"` or other original sheets: Fetches directly from the original sheet (for admin CRUD or initial student lookup).
 *
 * @param {string} sheetName - The name of the sheet to retrieve data from, or "ExportWeb_fetch_raw".
 * @param {string | object} param - Optional NIS (string) or object with filters ({class: "Kelas", id_tugas: "ID"}).
 * @param {boolean} forceRefresh - True to bypass cache and force a new fetch.
 * @returns {Promise<Array<Object> | null>} An array of data objects, or null if an error occurred.
 */
async function fetchData(sheetName, param = null, forceRefresh = false) {
  // Mode 1: Fetch raw ExportWeb data
  if (sheetName === "ExportWeb_fetch_raw") {
    const exportWebCacheKey = "ExportWeb_raw_data";

    if (!forceRefresh && dataCache[exportWebCacheKey]) {
      console.log(`Mengambil raw ExportWeb data dari cache.`);
      return dataCache[exportWebCacheKey];
    }

    // If not in cache or forceRefresh, fetch raw ExportWeb data
    let url = `${GOOGLE_APPS_SCRIPT_WEB_APP_URL}?sheet=ExportWeb`; // Requesting the actual 'ExportWeb' sheet
    try {
      console.log(`Mengambil raw ExportWeb data dari server: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const rawExportWebData = await response.json();
      console.log(`Raw ExportWeb data diterima:`, rawExportWebData);

      dataCache[exportWebCacheKey] = rawExportWebData; // Cache the raw data
      return rawExportWebData;
    } catch (error) {
      console.error(`Error fetching raw ExportWeb data:`, error);
      showToast(
        `Gagal mengambil data konsolidasi. Error: ${error.message}`,
        "error"
      );
      return null;
    }
  } else {
    // Mode 2: Fetch data from original sheets (Siswa, Admin_Users, or for admin CRUD ops)
    let cacheKey = sheetName;
    if (param) {
      const paramString =
        typeof param === "object" ? JSON.stringify(param) : String(param);
      cacheKey += `_${paramString}`;
    }

    // Check cache for original sheet data (only if dataCache[sheetName.toLowerCase().replace("_", "")] is explicitly defined and not empty)
    // Note: For 'siswa', it's better to always re-fetch on login to ensure latest student info from original sheet.
    // So, the `if` condition below would largely apply to admin-side caching, or if we decide to cache 'Siswa' for later use within the same session.
    if (!forceRefresh && dataCache[sheetName.toLowerCase().replace("_", "")]) {
      // Additional check for array length for data that might be an empty array
      const cachedData = dataCache[sheetName.toLowerCase().replace("_", "")];
      if (Array.isArray(cachedData) && cachedData.length > 0) {
        console.log(`Mengambil data dari cache (original sheet): ${cacheKey}`);
        return cachedData;
      }
    }

    let url = `${GOOGLE_APPS_SCRIPT_WEB_APP_URL}?sheet=${sheetName}`;
    if (param) {
      if (
        sheetName === "Siswa" ||
        sheetName === "Kehadiran" ||
        sheetName === "Catatan_Guru"
      ) {
        // For NIS-based lookups
        if (typeof param === "object") {
          url += `&nis=${param.nis || ""}`;
        } else {
          url += `&nis=${param}`;
        }
      } else if (sheetName === "Nilai") {
        // Specific Nilai lookup for admin
        if (typeof param === "object" && param.nis && param.id_tugas) {
          url += `&nis=${param.nis}&id_tugas=${param.id_tugas}`;
        } else if (typeof param === "string") {
          url += `&nis=${param}`;
        }
      } else if (
        sheetName === "Tugas" ||
        sheetName === "Jadwal_Pelajaran" ||
        sheetName === "Pengumuman" ||
        sheetName === "Admin_Users"
      ) {
        // For class-based or general lookups
        if (param.class) {
          url += `&class=${param.class}`;
        }
      }
    }

    try {
      console.log(`Mengambil data dari server (original sheet): ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log(`Data diterima dari ${sheetName} (original sheet):`, data);
      dataCache[sheetName.toLowerCase().replace("_", "")] = data; // Cache original sheet data
      return data;
    } catch (error) {
      console.error(
        `Error fetching data from ${sheetName} (original sheet):`,
        error
      );
      showToast(
        `Gagal mengambil data dari ${sheetName}. Error: ${error.message}`,
        "error"
      );
      return null;
    }
  }
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

    // 1. Fetch basic student data from the original "Siswa" sheet for name and class
    // This part still uses direct sheet access as ExportWeb might not have full student profiles.
    const studentData = await fetchData("Siswa", nis, true); // Force refresh for Siswa data on login

    if (studentData && studentData.length > 0) {
      const student = studentData[0];
      currentStudentNis = String(student.NIS);
      currentStudentClass = String(student.Kelas);

      // Populate student identity
      studentNameSpan.textContent = student.Nama;
      studentNisSpan.textContent = student.NIS;
      studentClassSpan.textContent = student.Kelas;

      // 2. Fetch all raw consolidated data from ExportWeb
      // Use "ExportWeb_fetch_raw" to tell fetchData to just get the raw data from ExportWeb sheet
      const rawExportWebData = await fetchData(
        "ExportWeb_fetch_raw",
        null,
        true
      );

      if (rawExportWebData && rawExportWebData.length > 0) {
        // 3. Process and filter the raw ExportWeb data for the current student/class
        dataCache.siswa = studentData; // Keep original student data for display
        dataCache.tugas = processAndFilterExportWebData(
          rawExportWebData,
          "Tugas",
          currentStudentNis,
          currentStudentClass
        );
        dataCache.nilai = dataCache.tugas; // Nilai is embedded in tugas for parent view
        dataCache.kehadiran = processAndFilterExportWebData(
          rawExportWebData,
          "Kehadiran",
          currentStudentNis,
          currentStudentClass
        );
        dataCache.catatan_guru = processAndFilterExportWebData(
          rawExportWebData,
          "Catatan_Guru",
          currentStudentNis,
          currentStudentClass
        );
        dataCache.jadwal_pelajaran = processAndFilterExportWebData(
          rawExportWebData,
          "Jadwal_Pelajaran",
          currentStudentNis,
          currentStudentClass
        ); // Pass both NIS and Class for filtering
        dataCache.pengumuman = processAndFilterExportWebData(
          rawExportWebData,
          "Pengumuman",
          currentStudentNis,
          currentStudentClass
        ); // Pass both NIS and Class for filtering

        await loadParentDashboardData();
        saveDataToSessionStorage(); // Simpan data yang baru diambil ke sessionStorage

        showSection("parent-dashboard-section");
        switchTab("tugas-status", document.querySelectorAll(".tab-button"));
      } else {
        showToast(
          "Gagal memuat data dari ExportWeb. Data kosong atau tidak valid.",
          "error"
        );
        logout(); // Fallback to logout if ExportWeb data is critical and missing
      }
    } else {
      showToast(
        "NIS tidak ditemukan atau tidak ada data untuk siswa ini. Mohon periksa kembali NIS Anda.",
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
  // Clear all data cache in memory on logout
  Object.keys(dataCache).forEach((key) => {
    dataCache[key] = []; // Clear all data caches, including siswa, to ensure fresh state
  });
  dataCache.ExportWeb_raw_data = null; // Ensure this specific cache is cleared

  loginNisInput.value = "";
  showSection("login-section");
  // Ensure login button text is reset
  mainLoginButton.textContent = "Cari Siswa";
  closeSidebar(); // FIX: Close sidebar on logout
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
      await loadParentDashboardData(targetTab);
    } catch (error) {
      console.error("Error loading tab data:", error);
      showToast("Gagal memuat data untuk tab ini.", "error");
    } finally {
      hideLoading();
    }
  });
});

// --- Load and Render Parent Dashboard Data ---
async function loadParentDashboardData(activeTab = "tugas-status") {
  // Populate subject filter dropdown once
  populateSubjectFilterSelect();

  // Data is now assumed to be directly in dataCache after login or refresh
  const tasksForStudent = dataCache.tugas;
  const gradesForStudent = dataCache.nilai; // Already combined in dataCache.tugas for parent view
  const attendanceForStudent = dataCache.kehadiran;
  const notesForStudent = dataCache.catatan_guru;
  const schedulesForClass = dataCache.jadwal_pelajaran;
  const announcementsForClass = dataCache.pengumuman;

  if (activeTab === "tugas-status") {
    renderTugasStatus(
      tasksForStudent,
      gradesForStudent,
      subjectFilterSelect.value
    );
  } else if (activeTab === "kehadiran") {
    renderKehadiranChartAndTable(
      attendanceForStudent,
      kehadiranFilterPeriodSelect.value
    );
  } else if (activeTab === "catatan-guru") {
    renderCatatanGuru(notesForStudent);
  } else if (activeTab === "jadwal-pelajaran") {
    renderJadwalPelajaran(
      schedulesForClass,
      currentStudentClass,
      jadwalFilterDaySelect.value
    );
  } else if (activeTab === "pengumuman") {
    renderAnnouncementsInModal(announcementsForClass); // This will only render in the modal, not a tab
  } else {
    // Initial load, render all tabs
    renderTugasStatus(
      tasksForStudent,
      gradesForStudent,
      subjectFilterSelect.value
    );
    renderKehadiranChartAndTable(
      attendanceForStudent,
      kehadiranFilterPeriodSelect.value
    );
    renderCatatanGuru(notesForStudent);
    renderJadwalPelajaran(
      schedulesForClass,
      currentStudentClass,
      jadwalFilterDaySelect.value
    );
    renderAnnouncementsInModal(announcementsForClass);
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

function renderTugasStatus(tugasData, nilaiData, filterSubject = "Semua") {
  const tbody = document.getElementById("tugas-status-table-body");
  tbody.innerHTML = "";

  if (!tugasData || tugasData.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="text-center py-4 text-gray-500">Tidak ada data tugas untuk siswa ini.</td></tr>';
    return;
  }

  let filteredTugas = tugasData;
  if (filterSubject !== "Semua") {
    filteredTugas = tugasData.filter(
      (tugas) => tugas.Mata_Pelajaran === filterSubject
    );
  }

  if (filteredTugas.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="text-center py-4 text-gray-500">Tidak ada tugas yang terdaftar untuk mata pelajaran ini.</td></tr>';
    return;
  }

  const tugasStatusMap = new Map();

  filteredTugas.forEach((tugas) => {
    // In this new setup, `tugasData` already contains the combined info from ExportWeb
    // So, `nilaiData` is effectively `tugasData` itself, and we just use `task.Nilai` directly
    // Let's remove the `nilaiData.find` logic here as it's redundant.

    let status = "Belum Dikerjakan";
    let nilaiDisplay = "N/A";
    let statusColorClass = "text-red-600";

    // The 'Nilai' field from ExportWeb now represents the actual grade
    if (
      tugas.Nilai !== null &&
      tugas.Nilai !== undefined &&
      tugas.Nilai !== ""
    ) {
      nilaiDisplay = tugas.Nilai;
      if (tugas.Nilai >= PASS_MARK) {
        status = "Tuntas";
        statusColorClass = "text-green-600";
      } else {
        status = "Remedial";
        statusColorClass = "text-red-600";
      }
    } else {
      // If Nilai is null/empty, check Status_Pengerjaan from ExportWeb
      if (tugas.Status_Pengerjaan === "Sudah Dikerjakan") {
        // Assuming this status if no grade yet but submitted
        status = "Menunggu Penilaian";
        statusColorClass = "text-yellow-600";
      } else if (tugas.Status_Pengerjaan) {
        // Fallback if other specific statuses are used
        status = tugas.Status_Pengerjaan;
        // Determine color based on status if needed
        if (status === "Tuntas") statusColorClass = "text-green-600";
        else if (status === "Remedial") statusColorClass = "text-red-600";
        else if (status === "Belum Dikerjakan")
          statusColorClass = "text-red-600";
        else statusColorClass = "text-gray-600";
      }
    }

    tugasStatusMap.set(
      tugas.NIS + "_" + tugas.Nama_Tugas + "_" + tugas.Mata_Pelajaran,
      {
        // Using a composite key
        ...tugas,
        nilai: nilaiDisplay,
        status: status,
        statusColorClass: statusColorClass,
      }
    );
  });

  const tugasArray = Array.from(tugasStatusMap.values());

  const belumDikerjakan = tugasArray.filter(
    (tugas) => tugas.status === "Belum Dikerjakan"
  );
  const remedial = tugasArray.filter((tugas) => tugas.status === "Remedial");
  const tuntas = tugasArray.filter((tugas) => tugas.status === "Tuntas");
  const menungguPenilaian = tugasArray.filter(
    (tugas) => tugas.status === "Menunggu Penilaian"
  );

  // Sort by Batas_Waktu
  const sortByBatasWaktu = (a, b) => {
    // The date format is "hari, tanggal bulan tahun" e.g., "Kamis, 19 Juni 2025"
    // We need to parse this. A robust solution might involve a library,
    // but for simple sorting, converting to a comparable string or Date object is best.
    // Let's create a temporary Date object for comparison.
    try {
      // Remove the "hari, " part for Date parsing
      const dateStringA = a.Batas_Waktu.split(", ")[1];
      const dateStringB = b.Batas_Waktu.split(", ")[1];
      // Replace month names for consistent parsing if necessary
      const monthMap = {
        Januari: "January",
        February: "February",
        Maret: "March",
        April: "April",
        Mei: "May",
        Juni: "June",
        Juli: "July",
        Agustus: "August",
        September: "September",
        Oktober: "October",
        November: "November",
        Desember: "December",
      };
      const parseDateString = (str) => {
        let parts = str.split(" ");
        let day = parts[0];
        let month = monthMap[parts[1]];
        let year = parts[2];
        return new Date(`${month} ${day}, ${year}`);
      };
      return parseDateString(dateStringA) - parseDateString(dateStringB);
    } catch (e) {
      console.error("Error parsing Batas_Waktu for sorting:", e);
      return 0; // Fallback, don't sort
    }
  };

  belumDikerjakan.sort(sortByBatasWaktu);
  remedial.sort(sortByBatasWaktu);
  tuntas.sort(sortByBatasWaktu);
  menungguPenilaian.sort(sortByBatasWaktu);

  const orderedTasks = [
    ...belumDikerjakan,
    ...remedial,
    ...menungguPenilaian,
    ...tuntas,
  ];

  // FIX: Ensure the tugas-simplified-row structure is used to make it 2 lines on mobile
  orderedTasks.forEach((task) => {
    const row = document.createElement("tr");
    row.classList.add("tugas-simplified-row", "rounded-md", "mb-2");
    row.innerHTML = `
        <td colspan="5">
            <div class="flex flex-col md:flex-row md:justify-between items-start md:items-center py-2 px-2 border-b border-gray-100 last:border-none">
                <div class="flex-grow">
                    <span class="font-semibold text-gray-800">${
                      task.Nama_Tugas
                    } (${task.Mata_Pelajaran})</span>
                    <div class="text-xs text-gray-500">Batas: ${
                      task.Batas_Waktu
                    }</div>
                </div>
                <div class="text-right ${
                  task.statusColorClass
                } mt-1 md:mt-0 font-medium">
                    ${
                      task.status === "Belum Dikerjakan"
                        ? `Belum Dikerjakan`
                        : `${task.status}! Nilai: ${task.nilai}`
                    }
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
  renderTugasStatus(dataCache.tugas, dataCache.nilai, selectedSubject);
});

// --- Filter Attendance Data ---
function filterAttendanceData(allData, period) {
  // `allData` is now the array of attendance summary objects for the current student
  // [{NIS, Hadir, Izin, Sakit, Alpha, TanggalTerakhir}]
  if (!allData || allData.length === 0) return [];

  // If there's only one summary object per student, time period filtering doesn't apply to individual records
  // It only applies to whether this summary is relevant to the selected period.
  // For the current implementation, we just return the summary as is.
  return allData;
}

// --- Render Kehadiran Chart and Table ---
function renderKehadiranChartAndTable(kehadiranData, filterPeriod) {
  // `kehadiranData` here is now the summary object from `processAndFilterExportWebData`
  // [{NIS, Hadir, Izin, Sakit, Alpha, TanggalTerakhir}]
  const filteredData = filterAttendanceData(kehadiranData, filterPeriod);

  if (!filteredData || filteredData.length === 0) {
    // Pass empty data to render functions to show "no data" message
    renderAttendanceChart({}); // Pass empty object for chart
    renderKehadiranTable([]);
    return;
  }

  // Assuming filteredData has only ONE entry for the current student's summary
  const studentSummary = filteredData[0];

  // Prepare data for Chart.js
  const chartData = {
    Hadir: studentSummary.Hadir || 0,
    Izin: studentSummary.Izin || 0,
    Sakit: studentSummary.Sakit || 0,
    Alpha: studentSummary.Alpha || 0,
  };

  renderAttendanceChart(chartData); // Pass the summary counts

  // Prepare data for the table. Since ExportWeb provides summary,
  // we'll display the summary in the table as a single row with the latest date.
  const tableData = studentSummary.TanggalTerakhir
    ? [
        {
          Tanggal: formatMMDDYYYYToReadableDate(studentSummary.TanggalTerakhir), // Convert mmddyyyy to readable
          Status: `Hadir: ${studentSummary.Hadir}, Izin: ${studentSummary.Izin}, Sakit: ${studentSummary.Sakit}, Alpha: ${studentSummary.Alpha}`,
        },
      ]
    : [];
  renderKehadiranTable(tableData);
}

// Helper to convert mmddyyyy to readable date
function formatMMDDYYYYToReadableDate(mmddyyyy) {
  if (!mmddyyyy || mmddyyyy.length !== 8) return mmddyyyy;
  const month = mmddyyyy.substring(0, 2);
  const day = mmddyyyy.substring(2, 4);
  const year = mmddyyyy.substring(4, 8);
  return `${day}/${month}/${year}`;
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

  // `kehadiranData` is already formatted for table in `renderKehadiranChartAndTable`
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
function renderAttendanceChart(summaryCounts) {
  // Now accepts summary counts directly
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

  const labels = ["Hadir", "Izin", "Sakit", "Alpha"];
  const data = [
    summaryCounts.Hadir || 0,
    summaryCounts.Izin || 0,
    summaryCounts.Sakit || 0,
    summaryCounts.Alpha || 0,
  ];
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
    const count = summaryCounts[label] || 0; // Use summaryCounts directly
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

function renderCatatanGuru(catatanGuruData) {
  const tbody = document.getElementById("catatan-guru-table-body");
  tbody.innerHTML = "";

  if (!catatanGuruData || catatanGuruData.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="3" class="text-center py-4 text-gray-500">Tidak ada catatan guru.</td></tr>';
    return;
  }
  const headers = getHeaderLabels("catatan-guru-table-body");

  catatanGuruData.forEach((catatan) => {
    const row = document.createElement("tr");
    row.innerHTML = `
                  <td data-label="${headers[0]}">${catatan.Minggu_Ke}</td>
                  <td data-label="${headers[1]}">${catatan.Catatan}</td>
                  <td data-label="${headers[2]}">${
      catatan.Tanggal_Input || "N/A"
    }</td>
              `;
    tbody.appendChild(row);
  });
}

function renderJadwalPelajaran(
  jadwalPelajaranData,
  studentClass,
  filterDay = "all"
) {
  const tbody = document.getElementById("jadwal-pelajaran-table-body");
  tbody.innerHTML = "";

  if (!jadwalPelajaranData || jadwalPelajaranData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">Tidak ada jadwal pelajaran untuk kelas ${studentClass}.</td></tr>`;
    return;
  }
  const headers = getHeaderLabels("jadwal-pelajaran-table-body");

  let filteredJadwal = jadwalPelajaranData.filter(
    (jadwal) =>
      String(jadwal.Kelas).toLowerCase() === studentClass.toLowerCase()
  );

  if (filterDay !== "all") {
    filteredJadwal = filteredJadwal.filter(
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
  renderJadwalPelajaran(
    dataCache.jadwal_pelajaran,
    currentStudentClass,
    selectedDay
  );
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
  const apiKey = ""; // API key will be provided by the environment
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
      .map((catatan) => `Minggu ${catatan.Minggu_Ke}: ${catatan.Catatan}`)
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
  refreshDataButton.addEventListener("click", async () => {
    if (currentStudentNis) {
      showLoading();
      try {
        // Clear all relevant caches to force re-fetch
        sessionStorage.removeItem("dataCache");
        dataCache.ExportWeb_raw_data = null; // Clear raw ExportWeb cache
        Object.keys(dataCache).forEach((key) => {
          if (key !== "siswa") {
            // Keep original student data if still needed
            dataCache[key] = [];
          }
        });

        // 1. Fetch basic student data again to ensure `currentStudentClass` is up-to-date if it was reset.
        const studentData = await fetchData("Siswa", currentStudentNis, true);
        if (!studentData || studentData.length === 0) {
          showToast(
            "Gagal me-refresh data. Informasi siswa tidak ditemukan.",
            "error"
          );
          logout();
          return;
        }
        currentStudentClass = String(studentData[0].Kelas); // Update current student class
        studentNameSpan.textContent = studentData[0].Nama;
        studentNisSpan.textContent = studentData[0].NIS;
        studentClassSpan.textContent = studentData[0].Kelas;

        // 2. Re-fetch all raw consolidated data from ExportWeb
        const rawExportWebData = await fetchData(
          "ExportWeb_fetch_raw",
          null,
          true
        );

        if (rawExportWebData && rawExportWebData.length > 0) {
          // 3. Re-process and filter for the current student/class
          dataCache.tugas = processAndFilterExportWebData(
            rawExportWebData,
            "Tugas",
            currentStudentNis,
            currentStudentClass
          );
          dataCache.nilai = dataCache.tugas; // Nilai is embedded in tugas for parent view
          dataCache.kehadiran = processAndFilterExportWebData(
            rawExportWebData,
            "Kehadiran",
            currentStudentNis,
            currentStudentClass
          );
          dataCache.catatan_guru = processAndFilterExportWebData(
            rawExportWebData,
            "Catatan_Guru",
            currentStudentNis,
            currentStudentClass
          );
          dataCache.jadwal_pelajaran = processAndFilterExportWebData(
            rawExportWebData,
            "Jadwal_Pelajaran",
            currentStudentNis,
            currentStudentClass
          ); // Pass both NIS and Class for filtering
          dataCache.pengumuman = processAndFilterExportWebData(
            rawExportWebData,
            "Pengumuman",
            currentStudentNis,
            currentStudentClass
          ); // Pass both NIS and Class for filtering

          await loadParentDashboardData(
            document.querySelector(".tab-button.text-blue-600")?.dataset.tab ||
              "tugas-status"
          );
          saveDataToSessionStorage(); // Simpan data terbaru ke cache
          showToast("Data berhasil diperbarui dari server.", "success");
        } else {
          showToast(
            "Gagal me-refresh data dari ExportWeb. Data kosong atau tidak valid.",
            "error"
          );
        }
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
  const isDataRestored = loadDataFromSessionStorage();

  // FIX: Ensure currentStudentNis is explicitly null if session is not valid or complete
  if (
    !isDataRestored ||
    !currentStudentNis ||
    !dataCache.siswa ||
    dataCache.siswa.length === 0
  ) {
    // If no valid session or student data, show login
    showSection("login-section");
    // Also explicitly clear cache if it was partially loaded but invalid
    sessionStorage.removeItem("loggedInNIS");
    sessionStorage.removeItem("dataCache");
    Object.keys(dataCache).forEach((key) => {
      dataCache[key] = [];
    });
    dataCache.ExportWeb_raw_data = null;
    return; // Exit here to prevent further execution for invalid session
  }

  // Proceed only if session is valid and student data exists
  showLoading();
  try {
    // Re-populate student identity from dataCache.siswa
    studentNameSpan.textContent = dataCache.siswa[0].Nama;
    studentNisSpan.textContent = dataCache.siswa[0].NIS;
    currentStudentClass = dataCache.siswa[0].Kelas; // Ensure currentStudentClass is set from cached student data
    studentClassSpan.textContent = dataCache.siswa[0].Kelas;

    // When restoring from cache, ExportWeb_raw_data needs to be refreshed to populate other dataCache categories correctly.
    // FIX: Force fresh fetch for ExportWeb_raw_data to ensure latest data on page load after session restore.
    const rawExportWebData = await fetchData("ExportWeb_fetch_raw", null, true); // Force fresh fetch

    if (rawExportWebData && rawExportWebData.length > 0) {
      // Re-process and filter for the current student/class
      dataCache.tugas = processAndFilterExportWebData(
        rawExportWebData,
        "Tugas",
        currentStudentNis,
        currentStudentClass
      );
      dataCache.nilai = dataCache.tugas;
      dataCache.kehadiran = processAndFilterExportWebData(
        rawExportWebData,
        "Kehadiran",
        currentStudentNis,
        currentStudentClass
      );
      dataCache.catatan_guru = processAndFilterExportWebData(
        rawExportWebData,
        "Catatan_Guru",
        currentStudentNis,
        currentStudentClass
      );
      dataCache.jadwal_pelajaran = processAndFilterExportWebData(
        rawExportWebData,
        "Jadwal_Pelajaran",
        currentStudentNis,
        currentStudentClass
      ); // Pass both NIS and Class for filtering
      dataCache.pengumuman = processAndFilterExportWebData(
        rawExportWebData,
        "Pengumuman",
        currentStudentNis,
        currentStudentClass
      ); // Pass both NIS and Class for filtering

      await loadParentDashboardData();
      kehadiranFilterPeriodSelect.value = "all";
      renderKehadiranChartAndTable(dataCache.kehadiran, "all");
      renderCatatanGuru(dataCache.catatan_guru);
      jadwalFilterDaySelect.value = "all";
      renderJadwalPelajaran(
        dataCache.jadwal_pelajaran,
        currentStudentClass,
        "all"
      );

      showSection("parent-dashboard-section");
      switchTab("tugas-status", document.querySelectorAll(".tab-button"));
    } else {
      console.error(
        "Error: ExportWeb data missing after session restore or initial fetch."
      );
      sessionStorage.removeItem("loggedInNIS");
      sessionStorage.removeItem("dataCache");
      showSection("login-section");
      showToast(
        "Terjadi kesalahan saat memulihkan sesi. Silakan login kembali.",
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
});
