// Ganti URL ini dengan URL Web App Google Apps Script Anda setelah di-deploy
const GOOGLE_APPS_SCRIPT_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbyA74lf_vJL6Z6Xq6WmuD6kBJlcFiGvY-ei6I283YGESmLuOA0iP3hVol40JGEzbpAO3g/exec";
const PASS_MARK = 75; // Nilai minimum untuk status "Tuntas" - (used in value configuration)

// Hardcoded list of subjects
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

// Mapping for subject abbreviations for ID Tugas
const SUBJECT_ABBREVIATIONS = {
  PAI: "PAI",
  Pancasila: "PANC",
  "Bahasa Indonesia": "BHSIN",
  Matematika: "MTK",
  IPAS: "IPAS",
  "Seni Rupa": "SNI",
  PJOK: "PJOK",
  "Bahasa Jawa": "BHSJW",
  "Dawet Ayu": "DWA",
};

// Client-side cache for fetched data to reduce API calls
const dataCache = {
  siswa: null, // Initialize with null to indicate not fetched yet
  tugas: null,
  nilai: null,
  kehadiran: null,
  catatan_guru: null,
  jadwal_pelajaran: null,
  pengumuman: null,
  admin_users: null,
};

// DOM Elements specific to admin view
const loadingOverlay = document.getElementById("loading-overlay");
const loginSection = document.getElementById("login-section"); // For admin login form
const adminDashboardSection = document.getElementById(
  "admin-dashboard-section"
);
const toastContainer = document.getElementById("toast-container");
const unifiedLoginCard = document.getElementById("unified-login-card");
const loginTitle = document.getElementById("login-title");
const loginForm = document.getElementById("login-form");
const loginAdminEmailInput = document.getElementById("login-email-admin");
const mainLoginButton = document.getElementById("main-login-button");

// Admin form dropdowns
const nilaiNisSelect = document.getElementById("nilai-nis");
const nilaiTugasIdSelect = document.getElementById("nilai-tugas-id");
const kehadiranNisSelect = document.getElementById("kehadiran-nis");
const catatanNisSelect = document.getElementById("catatan-nis");
const tugasMapelSelect = document.getElementById("tugas-mapel");
const jadwalMapelSelect = document.getElementById("jadwal-mapel");

// Admin form specific inputs for Nilai
const nilaiInput = document.getElementById("nilai-input");
const nilaiStatusSelect = document.getElementById("nilai-status");

// Admin form mode inputs
const tugasFormMode = document.getElementById("tugas-form-mode");
const nilaiFormMode = document.getElementById("nilai-form-mode");
const kehadiranFormMode = document.getElementById("kehadiran-form-mode");
const catatanFormMode = document.getElementById("catatan-form-mode");
const jadwalFormMode = document.getElementById("jadwal-form-mode");
const pengumumanFormMode = document.getElementById("pengumuman-form-mode");

// Admin form edit ID inputs
const tugasEditId = document.getElementById("tugas-edit-id");
const nilaiEditId = document.getElementById("nilai-edit-id");
const kehadiranEditId = document.getElementById("kehadiran-edit-id");
const catatanEditId = document.getElementById("catatan-edit-id");
const jadwalEditId = document.getElementById("jadwal-edit-id");
const pengumumanEditId = document.getElementById("pengumuman-edit-id");

// Admin form submit buttons
const submitTugasBtn = document.getElementById("submit-tugas");
const submitNilaiBtn = document.getElementById("submit-nilai");
const submitKehadiranBtn = document.getElementById("submit-kehadiran");
const submitCatatanBtn = document.getElementById("submit-catatan");
const submitJadwalBtn = document.getElementById("submit-jadwal");
const submitPengumumanBtn = document.getElementById("submit-pengumuman");

// Confirmation Modal Elements (copied from main script for shared functionality)
const confirmModal = document.getElementById("confirm-modal");
const confirmModalTitle = document.getElementById("confirm-modal-title");
const confirmModalMessage = document.getElementById("confirm-modal-message");
const confirmCancelBtn = document.getElementById("confirm-cancel-btn");
const confirmOkBtn = document.getElementById("confirm-ok-btn");
let onConfirmCallback = null;

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
  adminDashboardSection.classList.add("section-hidden");
  document.getElementById(sectionId).classList.remove("section-hidden");
}

// --- Toast Notification Function ---
function showToast(message, type = "info", duration = 3000) {
  const toast = document.createElement("div");
  toast.classList.add("toast", type);
  toast.textContent = message;
  toastContainer.appendChild(toast);

  void toast.offsetWidth;
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

// --- Generate Unique ID (Generic) ---
function generateUniqueId(prefix) {
  return (
    prefix +
    "_" +
    Date.now().toString(36) +
    Math.random().toString(36).substring(2, 5).toUpperCase()
  );
}

// --- Generate Task ID based on subject, task number, and month ---
function generateTugasId(subjectAbbr, taskNumber, month) {
  const formattedTaskNumber = String(taskNumber).padStart(2, "0");
  const formattedMonth = String(month).padStart(2, "0");
  return `${subjectAbbr}${formattedTaskNumber}${formattedMonth}`;
}

// Universal tab switching function
function switchTab(targetTabId, buttons, prefix = "") {
  document.querySelectorAll(`.${prefix}tab-content`).forEach((content) => {
    content.classList.add("section-hidden");
  });

  buttons.forEach((btn) => {
    btn.classList.remove("text-green-600", "border-green-600", "border-b-2");
    btn.classList.add("text-gray-700");
  });

  document.getElementById(targetTabId).classList.remove("section-hidden");

  const clickedButton = Array.from(buttons).find(
    (btn) => btn.dataset.tab === targetTabId
  );
  if (clickedButton) {
    clickedButton.classList.remove("text-gray-700");
    clickedButton.classList.add(
      "text-green-600",
      "border-b-2",
      "border-green-600"
    );
  }
}

// --- Admin Login Form Submission ---
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showLoading();

  try {
    const adminEmail = loginAdminEmailInput.value.trim();
    if (!adminEmail) {
      showToast("Email admin tidak boleh kosong.", "error");
      hideLoading();
      return;
    }

    // Fetch authorized emails from Google Apps Script
    // Force refresh admin users as it's a critical initial fetch
    const authorizedEmails = await fetchData("Admin_Users", null, true);
    dataCache.admin_users = authorizedEmails; // Cache admin users

    // Check if the entered email exists in the list of authorized emails (case-insensitive)
    const emailExists = authorizedEmails.some(
      (user) =>
        user.Email && user.Email.toLowerCase() === adminEmail.toLowerCase()
    );

    if (emailExists) {
      showToast("Login admin berhasil!", "success");
      await loadAdminDropdownData(); // Load dropdowns for forms
      await loadAdminTableData("Tugas"); // Load initial table for admin dashboard
      updateTugasIdField(); // Initial generation for Tugas ID
      showSection("admin-dashboard-section"); // Show admin dashboard
      switchTab("input-tugas", document.querySelectorAll(".admin-tab-button")); // Activate default tab
    } else {
      showToast("Email admin tidak terdaftar. Akses ditolak.", "error");
    }
  } catch (error) {
    console.error("Login Error:", error);
    showToast(
      "Terjadi kesalahan saat login. Periksa konsol untuk detail.",
      "error"
    );
  } finally {
    hideLoading();
  }
});

// Helper function to reset admin forms to create mode
function resetAdminForm(
  formElement,
  formModeInput,
  idKey,
  submitButton,
  defaultButtonText,
  idInputElement
) {
  formElement.reset();
  formModeInput.value = "create";
  if (idInputElement) {
    idInputElement.readOnly = true;
    if (idKey === "ID_Nilai") {
      idInputElement.placeholder = "Akan Dihasilkan Otomatis";
      idInputElement.value = "";
      nilaiInput.disabled = false;
      nilaiStatusSelect.disabled = false;
      if (nilaiNisSelect) nilaiNisSelect.disabled = false;
      if (nilaiTugasIdSelect) nilaiTugasIdSelect.disabled = false;
    } else {
      idInputElement.value = "Dihasilkan Otomatis";
    }
    idInputElement.classList.add("bg-gray-100", "cursor-not-allowed");
    idInputElement.classList.remove("bg-white");
  }
  submitButton.textContent = defaultButtonText;
  submitButton.disabled = false;
}

// --- Data Fetching Function (GET) with Caching ---
async function fetchData(sheetName, param = null, forceRefresh = false) {
  let cacheKey = sheetName;
  if (param) {
    // Convert param object to a consistent string for cache key, or use param directly if string
    const paramString =
      typeof param === "object" ? JSON.stringify(param) : String(param);
    cacheKey += `_${paramString}`;
  }

  // Check cache first if not forced to refresh
  if (!forceRefresh && dataCache[cacheKey]) {
    console.log(`Mengambil data dari cache: ${cacheKey}`);
    return dataCache[cacheKey];
  }

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
    console.log(`Mengambil data dari server: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log(`Data diterima dari ${sheetName}:`, data);
    dataCache[cacheKey] = data; // Store in cache
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

// --- Data Posting/Updating/Deleting Function (POST) ---
async function sendData(sheetName, data, action) {
  const url = `${GOOGLE_APPS_SCRIPT_WEB_APP_URL}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        sheet: sheetName,
        action: action,
        data: JSON.stringify(data),
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    console.log(`Response from ${sheetName} (${action}):`, result);

    // Invalidate relevant cache entries after a successful CRUD operation
    // For simplicity, invalidate all data for the affected sheet.
    // More granular invalidation could be implemented if needed.
    for (const key in dataCache) {
      if (key.startsWith(sheetName)) {
        dataCache[key] = null; // Mark as stale
      }
    }

    return result;
  } catch (error) {
    console.error(`Error sending data to ${sheetName} (${action}):`, error);
    showToast(
      `Gagal ${action} data ke ${sheetName}. Error: ${error.message}`,
      "error"
    );
    return { success: false, message: `Error: ${error.message}` };
  }
}

// Helper function to get header labels for data-label attribute
function getHeaderLabels(tableBodyId) {
  let headers = [];
  const table = document.getElementById(tableBodyId).closest("table");
  if (table && table.querySelector("thead tr")) {
    // Only pick visible headers for data-label
    table.querySelectorAll("thead th").forEach((th) => {
      headers.push(th.textContent.trim());
    });
  }
  return headers;
}

// --- Helper function to populate dropdowns ---
function populateDropdown(
  selectElement,
  data,
  valueKey,
  textKey,
  initialOptionText = "Pilih..."
) {
  selectElement.innerHTML = `<option value="">${initialOptionText}</option>`;
  if (data && data.length > 0) {
    data.forEach((item) => {
      const option = document.createElement("option");
      option.value = item[valueKey];
      option.textContent = item[textKey];
      selectElement.appendChild(option);
    });
  } else {
    selectElement.innerHTML = `<option value="">Tidak ada data tersedia</option>`;
  }
}

// --- Load Data for Admin Dropdowns and Tables ---
async function loadAdminDropdownData() {
  populateDropdown(nilaiNisSelect, null, "", "", "Memuat siswa...");
  populateDropdown(kehadiranNisSelect, null, "", "", "Memuat siswa...");
  populateDropdown(catatanNisSelect, null, "", "", "Memuat siswa...");

  // Force refresh for dropdown data to ensure latest options
  const siswaData = await fetchData("Siswa", null, true);
  if (siswaData) {
    dataCache.siswa = siswaData; // Update cache explicitly
    populateDropdown(
      nilaiNisSelect,
      siswaData,
      "NIS",
      "Nama",
      "Pilih Siswa..."
    );
    populateDropdown(
      kehadiranNisSelect,
      siswaData,
      "NIS",
      "Nama",
      "Pilih Siswa..."
    );
    populateDropdown(
      catatanNisSelect,
      siswaData,
      "NIS",
      "Nama",
      "Pilih Siswa..."
    );
  } else {
    showToast("Gagal memuat daftar siswa untuk dropdown.", "error");
  }

  const subjectOptions = HARDCODED_SUBJECTS.map((s) => ({
    value: s,
    text: s,
  }));
  populateDropdown(
    tugasMapelSelect,
    subjectOptions,
    "value",
    "text",
    "Pilih Mata Pelajaran..."
  );
  populateDropdown(
    jadwalMapelSelect,
    subjectOptions,
    "value",
    "text",
    "Pilih Mata Pelajaran..."
  );

  if (nilaiTugasIdSelect) {
    populateDropdown(nilaiTugasIdSelect, null, "", "", "Memuat tugas...");
    // Force refresh for task data
    const tugasData = await fetchData("Tugas", null, true);
    if (tugasData) {
      dataCache.tugas = tugasData; // Update cache explicitly
      populateDropdown(
        nilaiTugasIdSelect,
        tugasData,
        "ID_Tugas",
        "Nama_Tugas",
        "Pilih Tugas..."
      );
    } else {
      showToast("Gagal memuat daftar tugas untuk dropdown.", "error");
    }
  }
}

async function loadAdminTableData(sheetName) {
  let tableBodyElement;
  let idKey;
  let dataFetch;
  let renderFunction;

  // Assign tableBodyElement first
  switch (sheetName) {
    case "Tugas":
      tableBodyElement = document.getElementById("tugas-list-table-body");
      break;
    case "Nilai":
      tableBodyElement = document.getElementById("nilai-list-table-body");
      break;
    case "Kehadiran":
      tableBodyElement = document.getElementById("kehadiran-list-table-body");
      break;
    case "Catatan_Guru":
      tableBodyElement = document.getElementById("catatan-list-table-body");
      break;
    case "Jadwal_Pelajaran":
      tableBodyElement = document.getElementById("jadwal-list-table-body");
      break;
    case "Pengumuman":
      tableBodyElement = document.getElementById("pengumuman-list-table-body");
      break;
    default:
      showToast("Nama sheet tidak valid untuk tabel admin.", "error");
      return;
  }

  if (!tableBodyElement) {
    console.error(`Elemen tabel untuk sheet "${sheetName}" tidak ditemukan.`);
    showToast(
      `Error: Elemen tabel untuk sheet "${sheetName}" tidak ditemukan.`,
      "error"
    );
    return;
  }

  tableBodyElement.innerHTML = `<tr><td colspan="99" class="text-center py-4 text-gray-500">Memuat data...</td></tr>`; // Show loading in table

  // Force refresh for all table data to ensure latest state
  dataFetch = await fetchData(sheetName, null, true);
  dataCache[sheetName.toLowerCase().replace("_", "")] = dataFetch; // Update cache explicitly

  if (!dataFetch || dataFetch.length === 0) {
    tableBodyElement.innerHTML = `<tr><td colspan="99" class="text-center py-4 text-gray-500">Tidak ada data ${sheetName}.</td></tr>`;
    return;
  }

  // Define renderFunction after dataFetch and caching is handled
  switch (sheetName) {
    case "Tugas":
      idKey = "ID_Tugas";
      renderFunction = (item, headers) => `
                  <td data-label="${headers[0]}">${item.Nama_Tugas}</td>
                  <td data-label="${headers[1]}">${item.Mata_Pelajaran}</td>
                  <td data-label="${headers[2]}">${item.Batas_Waktu}</td>
                  <td data-label="${headers[3]}">${item.Untuk_Kelas}</td>
              `;
      break;
    case "Nilai":
      idKey = "ID_Nilai";
      renderFunction = (item, headers) => `
                  <td data-label="${headers[0]}">${item.NIS}</td>
                  <td data-label="${headers[1]}">${item.ID_Tugas}</td>
                  <td data-label="${headers[2]}">${item.Nilai}</td>
                  <td data-label="${headers[3]}">${item.Status_Pengerjaan}</td>
                  <td data-label="${headers[4]}">${
        item.Tanggal_Input || "N/A"
      }</td>
              `;
      break;
    case "Kehadiran":
      idKey = "ID_Kehadiran";
      renderFunction = (item, headers) => `
                  <td data-label="${headers[0]}">${item.ID_Kehadiran}</td>
                  <td data-label="${headers[1]}">${item.NIS}</td>
                  <td data-label="${headers[2]}">${item.Tanggal}</td>
                  <td data-label="${headers[3]}">${item.Status}</td>
              `;
      break;
    case "Catatan_Guru":
      idKey = "ID_Catatan";
      renderFunction = (item, headers) => `
                  <td data-label="${headers[0]}">${item.ID_Catatan}</td>
                  <td data-label="${headers[1]}">${item.NIS}</td>
                  <td data-label="${headers[2]}">${item.Minggu_Ke}</td>
                  <td data-label="${headers[3]}">${item.Catatan}</td>
                  <td data-label="${headers[4]}">${
        item.Tanggal_Input || "N/A"
      }</td>
              `;
      break;
    case "Jadwal_Pelajaran":
      idKey = "ID_Jadwal";
      renderFunction = (item, headers) => `
                  <td data-label="${headers[0]}">${item.ID_Jadwal}</td>
                  <td data-label="${headers[1]}">${item.Kelas}</td>
                  <td data-label="${headers[2]}">${item.Hari}</td>
                  <td data-label="${headers[3]}">${item.Jam}</td>
                  <td data-label="${headers[4]}">${item.Mata_Pelajaran}</td>
                  <td data-label="${headers[5]}">${item.Guru}</td>
              `;
      break;
    case "Pengumuman":
      idKey = "ID_Pengumuman";
      renderFunction = (item, headers) => `
                  <td data-label="${headers[0]}">${item.ID_Pengumuman}</td>
                  <td data-label="${headers[1]}">${item.Judul}</td>
                  <td data-label="${headers[2]}">${item.Tanggal_Pengumuman}</td>
                  <td data-label="${headers[3]}">${
        item.Untuk_Kelas || "Semua Kelas"
      }</td>
              `;
      break;
    default:
      // This case should ideally not be reached due to the initial switch
      console.error("renderFunction not defined for sheet:", sheetName);
      return;
  }

  tableBodyElement.innerHTML = ""; // Clear loading message

  const headers = getHeaderLabels(tableBodyElement.id); // Get headers from the specific table

  dataFetch.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML =
      renderFunction(item, headers) +
      `
                  <td class="py-2 px-4 border-b text-sm text-gray-700">
                      <button onclick="editEntry('${sheetName}', ${JSON.stringify(
        item[idKey]
      )})" class="bg-yellow-500 hover:bg-yellow-600 text-white py-1 px-2 rounded-md text-xs mr-2">Edit</button>
                      <button onclick="deleteEntry('${sheetName}', ${JSON.stringify(
        item[idKey]
      )})" class="bg-red-500 hover:bg-red-600 text-white py-1 px-2 rounded-md text-xs">Hapus</button>
                  </td>
              `;
    tableBodyElement.appendChild(row);
  });
}

// --- Configure Nilai Form based on NIS and ID Tugas selection ---
async function configureNilaiFormBasedOnSelection() {
  const nis = nilaiNisSelect.value;
  const tugasId = nilaiTugasIdSelect.value;
  const nilaiIdInput = document.getElementById("nilai-id");

  nilaiInput.disabled = false;
  nilaiStatusSelect.disabled = false;
  submitNilaiBtn.disabled = false;
  nilaiInput.value = "";
  nilaiStatusSelect.value = "";
  nilaiEditId.value = "";
  nilaiFormMode.value = "create";
  submitNilaiBtn.textContent = "Simpan Nilai";

  if (nis && tugasId) {
    nilaiIdInput.value = `${nis}_${tugasId}`;
    nilaiIdInput.classList.remove("bg-gray-100", "cursor-not-allowed");
    nilaiIdInput.classList.add("bg-white");

    // Fetch existing Nilai for this student and task combination (force refresh)
    const existingNilai = await fetchData(
      "Nilai",
      {
        nis: nis,
        id_tugas: tugasId,
      },
      true
    );

    if (existingNilai && existingNilai.length > 0) {
      const foundNilai = existingNilai[0];
      showToast(
        "Nilai untuk siswa dan tugas ini sudah ada. Mode Edit diaktifkan.",
        "info"
      );

      nilaiInput.value = foundNilai.Nilai;
      nilaiStatusSelect.value = foundNilai.Status_Pengerjaan;
      nilaiEditId.value = foundNilai.ID_Nilai;
      nilaiFormMode.value = "edit";
      submitNilaiBtn.textContent = "Perbarui Nilai";

      if (foundNilai.Status_Pengerjaan === "Tuntas") {
        showToast(
          "Nilai ini sudah Tuntas. Input tidak bisa dilakukan ulang.",
          "warning",
          5000
        );
        nilaiInput.disabled = true;
        nilaiStatusSelect.disabled = true;
        submitNilaiBtn.disabled = true;
      }
    }
  } else {
    nilaiIdInput.value = "";
    nilaiIdInput.placeholder = "Akan Dihasilkan Otomatis";
    nilaiIdInput.classList.add("bg-gray-100", "cursor-not-allowed");
    nilaiIdInput.classList.remove("bg-white");
  }
}

if (nilaiNisSelect)
  nilaiNisSelect.addEventListener("change", configureNilaiFormBasedOnSelection);
if (nilaiTugasIdSelect)
  nilaiTugasIdSelect.addEventListener(
    "change",
    configureNilaiFormBasedOnSelection
  );

// --- Update Tugas ID field based on Mata Pelajaran selection ---
async function updateTugasIdField() {
  const selectedSubject = tugasMapelSelect.value;
  const tugasIdInput = document.getElementById("tugas-id");

  if (selectedSubject) {
    const subjectAbbr = SUBJECT_ABBREVIATIONS[selectedSubject] || "OTH";
    const currentMonth = new Date().getMonth() + 1;

    // Fetch all existing tasks to determine the next sequential number (force refresh)
    const allTugas = (await fetchData("Tugas", null, true)) || [];
    dataCache.tugas = allTugas;

    const tasksForSubjectInMonth = allTugas.filter((task) => {
      const taskSubject = task.Mata_Pelajaran;
      let taskMonth = currentMonth;
      if (task.ID_Tugas && task.ID_Tugas.length >= 6) {
        const monthFromId = parseInt(
          task.ID_Tugas.substring(task.ID_Tugas.length - 2)
        );
        if (!isNaN(monthFromId) && monthFromId >= 1 && monthFromId <= 12) {
          taskMonth = monthFromId;
        }
      }

      return taskSubject === selectedSubject && taskMonth === currentMonth;
    });

    const nextTaskNumber = tasksForSubjectInMonth.length + 1;
    const newTugasId = generateTugasId(
      subjectAbbr,
      nextTaskNumber,
      currentMonth
    );

    tugasIdInput.value = newTugasId;
    tugasIdInput.classList.remove("bg-gray-100", "cursor-not-allowed");
    tugasIdInput.classList.add("bg-white");
  } else {
    tugasIdInput.value = "Dihasilkan Otomatis";
    tugasIdInput.classList.add("bg-gray-100", "cursor-not-allowed");
    tugasIdInput.classList.remove("bg-white");
  }
}

tugasMapelSelect.addEventListener("change", updateTugasIdField);

// --- Update Pengumuman ID field ---
async function updatePengumumanIdField() {
  const pengumumanIdInput = document.getElementById("pengumuman-id");
  // Force refresh for all announcements
  const allPengumuman = (await fetchData("Pengumuman", null, true)) || [];
  dataCache.pengumuman = allPengumuman;

  const nextPengumumanNumber = allPengumuman.length + 1;
  const newPengumumanId = `PGM_${String(nextPengumumanNumber).padStart(
    3,
    "0"
  )}`;

  pengumumanIdInput.value = newPengumumanId;
  pengumumanIdInput.classList.remove("bg-gray-100", "cursor-not-allowed");
  pengumumanIdInput.classList.add("bg-white");
}

// --- Edit Entry Function ---
async function editEntry(sheetName, id) {
  let formElement;
  let idInput;
  let modeInput;
  let submitButton;
  let itemToEdit;
  let idKey;

  try {
    showLoading();

    // Fetch the latest data for editing, always force refresh for edit operations
    const currentData = await fetchData(sheetName, null, true);
    if (!currentData) {
      showToast("Gagal memuat data untuk edit.", "error");
      return;
    }
    // Update the specific cache entry for this sheet
    dataCache[sheetName.toLowerCase().replace("_", "")] = currentData;

    switch (sheetName) {
      case "Tugas":
        formElement = document.getElementById("form-input-tugas");
        idInput = document.getElementById("tugas-id");
        modeInput = tugasFormMode;
        submitButton = submitTugasBtn;
        itemToEdit = dataCache.tugas.find((item) => item.ID_Tugas === id);
        idKey = "ID_Tugas";
        document.getElementById("tugas-nama").value = itemToEdit.Nama_Tugas;
        tugasMapelSelect.value = itemToEdit.Mata_Pelajaran;
        document.getElementById("tugas-deadline").value =
          itemToEdit.Batas_Waktu;
        document.getElementById("tugas-kelas").value = itemToEdit.Untuk_Kelas;
        tugasEditId.value = itemToEdit.ID_Tugas;
        break;
      case "Nilai":
        formElement = document.getElementById("form-input-nilai");
        idInput = document.getElementById("nilai-id");
        modeInput = nilaiFormMode;
        submitButton = submitNilaiBtn;
        itemToEdit = dataCache.nilai.find((item) => item.ID_Nilai === id);
        idKey = "ID_Nilai";
        if (nilaiNisSelect) nilaiNisSelect.value = itemToEdit.NIS;
        if (nilaiTugasIdSelect) nilaiTugasIdSelect.value = itemToEdit.ID_Tugas;
        nilaiInput.value = itemToEdit.Nilai;
        nilaiStatusSelect.value = itemToEdit.Status_Pengerjaan;
        nilaiEditId.value = itemToEdit.ID_Nilai;
        nilaiInput.disabled = false;
        nilaiStatusSelect.disabled = false;
        if (nilaiNisSelect) nilaiNisSelect.disabled = true;
        if (nilaiTugasIdSelect) nilaiTugasIdSelect.disabled = true;
        break;
      case "Kehadiran":
        formElement = document.getElementById("form-input-kehadiran");
        idInput = document.getElementById("kehadiran-id");
        modeInput = kehadiranFormMode;
        submitButton = submitKehadiranBtn;
        itemToEdit = dataCache.kehadiran.find(
          (item) => item.ID_Kehadiran === id
        );
        idKey = "ID_Kehadiran";
        kehadiranNisSelect.value = itemToEdit.NIS;
        document.getElementById("kehadiran-tanggal").value = itemToEdit.Tanggal;
        document.getElementById("kehadiran-status").value = itemToEdit.Status;
        kehadiranEditId.value = itemToEdit.ID_Kehadiran;
        break;
      case "Catatan_Guru":
        formElement = document.getElementById("form-input-catatan");
        idInput = document.getElementById("catatan-id");
        modeInput = catatanFormMode;
        submitButton = submitCatatanBtn;
        itemToEdit = dataCache.catatan_guru.find(
          (item) => item.ID_Catatan === id
        );
        idKey = "ID_Catatan";
        catatanNisSelect.value = itemToEdit.NIS;
        document.getElementById("catatan-minggu").value = itemToEdit.Minggu_Ke;
        document.getElementById("catatan-isi").value = itemToEdit.Catatan;
        catatanEditId.value = itemToEdit.ID_Catatan;
        break;
      case "Jadwal_Pelajaran":
        formElement = document.getElementById("form-input-jadwal");
        idInput = document.getElementById("jadwal-id");
        modeInput = jadwalFormMode;
        submitButton = submitJadwalBtn;
        itemToEdit = dataCache.jadwal_pelajaran.find(
          (item) => item.ID_Jadwal === id
        );
        idKey = "ID_Jadwal";
        document.getElementById("jadwal-kelas").value = itemToEdit.Kelas;
        document.getElementById("jadwal-hari").value = itemToEdit.Hari;
        document.getElementById("jadwal-jam").value = itemToEdit.Jam;
        jadwalMapelSelect.value = itemToEdit.Mata_Pelajaran;
        document.getElementById("jadwal-guru").value = itemToEdit.Guru;
        jadwalEditId.value = itemToEdit.ID_Jadwal;
        break;
      case "Pengumuman":
        formElement = document.getElementById("form-input-pengumuman");
        idInput = document.getElementById("pengumuman-id");
        modeInput = pengumumanFormMode;
        submitButton = submitPengumumanBtn;
        itemToEdit = dataCache.pengumuman.find(
          (item) => item.ID_Pengumuman === id
        );
        idKey = "ID_Pengumuman";
        document.getElementById("pengumuman-judul").value = itemToEdit.Judul;
        document.getElementById("pengumuman-isi").value =
          itemToEdit.Isi_Pengumuman;
        document.getElementById("pengumuman-tanggal").value =
          itemToEdit.Tanggal_Pengumuman;
        document.getElementById("pengumuman-untuk-kelas").value =
          itemToEdit.Untuk_Kelas || "";
        pengumumanEditId.value = itemToEdit.ID_Pengumuman;
        break;
      default:
        showToast("Aksi edit tidak didukung untuk sheet ini.", "error");
        return;
    }

    if (itemToEdit) {
      idInput.value = itemToEdit[idKey];
      idInput.readOnly = true;
      idInput.classList.remove("bg-gray-100", "cursor-not-allowed");
      idInput.classList.add("bg-white");
      modeInput.value = "edit";
      submitButton.textContent = "Perbarui Data";
      submitButton.disabled = false;

      showToast(`Mode Edit: ${sheetName} ID ${id}`, "info");
    } else {
      showToast(
        `Data dengan ID ${id} tidak ditemukan di ${sheetName}.`,
        "error"
      );
    }
  } catch (error) {
    console.error("Edit Entry Error:", error);
    showToast("Terjadi kesalahan saat mencoba mengedit data.", "error");
  } finally {
    hideLoading();
  }
}

// --- Delete Entry Function ---
async function deleteEntry(sheetName, id) {
  showConfirmModal(
    `Apakah Anda yakin ingin menghapus data dengan ID ${id} dari ${sheetName}?`,
    async () => {
      let idKey;
      switch (sheetName) {
        case "Tugas":
          idKey = "ID_Tugas";
          break;
        case "Nilai":
          idKey = "ID_Nilai";
          break;
        case "Kehadiran":
          idKey = "ID_Kehadiran";
          break;
        case "Catatan_Guru":
          idKey = "ID_Catatan";
          break;
        case "Jadwal_Pelajaran":
          idKey = "ID_Jadwal";
          break;
        case "Pengumuman":
          idKey = "ID_Pengumuman";
          break;
        case "Siswa":
          idKey = "NIS";
          break;
        case "Admin_Users":
          idKey = "Email";
          break;
        default:
          showToast("Aksi hapus tidak didukung untuk sheet ini.", "error");
          return;
      }

      const dataToDelete = {};
      dataToDelete[idKey] = id;

      try {
        showLoading();
        const result = await sendData(sheetName, dataToDelete, "delete"); // sendData now handles cache invalidation
        if (result.success) {
          showToast(
            `${sheetName} dengan ID ${id} berhasil dihapus!`,
            "success"
          );
          await loadAdminTableData(sheetName); // Reload table after deletion
          if (sheetName === "Siswa" || sheetName === "Tugas") {
            await loadAdminDropdownData(); // Refresh dropdowns if relevant data is modified
          }
        } else {
          showToast(
            `Gagal menghapus ${sheetName} dengan ID ${id}: ${result.message}`,
            "error"
          );
        }
      } catch (error) {
        console.error("Delete Entry Error:", error);
        showToast("Terjadi kesalahan saat menghapus data.", "error");
      } finally {
        hideLoading();
      }
    }
  );
}

// --- Admin Form Submissions ---
async function handleAdminFormSubmit(
  e,
  sheetName,
  idKeyName,
  formModeElement,
  editIdElement,
  submitButtonElement
) {
  e.preventDefault();
  showLoading();

  try {
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    let action = formModeElement.value;
    let idInputElement = e.target.querySelector(`input[name="${idKeyName}"]`);

    let result;

    if (action === "create") {
      if (
        idKeyName === "ID_Tugas" &&
        idInputElement.value === "Dihasilkan Otomatis"
      ) {
        showToast(
          "Silakan pilih Mata Pelajaran untuk menghasilkan ID Tugas.",
          "error"
        );
        hideLoading();
        return;
      } else if (
        idKeyName === "ID_Nilai" &&
        (!idInputElement.value || idInputElement.value.trim() === "")
      ) {
        showToast(
          "NIS dan ID Tugas harus dipilih untuk menghasilkan ID Nilai.",
          "error"
        );
        hideLoading();
        return;
      } else if (
        idKeyName === "ID_Pengumuman" &&
        idInputElement.value === "Dihasilkan Otomatis"
      ) {
        showToast("Silakan tunggu ID Pengumuman dihasilkan.", "error");
        hideLoading();
        return;
      }

      if (
        idKeyName !== "ID_Nilai" &&
        idKeyName !== "ID_Tugas" &&
        idKeyName !== "ID_Pengumuman" &&
        idInputElement &&
        (idInputElement.value === "Dihasilkan Otomatis" ||
          idInputElement.value.trim() === "")
      ) {
        data[idKeyName] = generateUniqueId(
          idKeyName.split("_")[0].substring(0, 3).toUpperCase()
        );
      } else if (idInputElement && idInputElement.value.trim() !== "") {
        data[idKeyName] = idInputElement.value;
      }

      result = await sendData(sheetName, data, "create");
    } else if (action === "edit") {
      data.originalId = editIdElement.value;
      result = await sendData(sheetName, data, "update");
    }

    if (result.success) {
      showToast(
        `${sheetName} berhasil ${
          action === "create" ? "disimpan" : "diperbarui"
        }!`,
        "success"
      );
      e.target.reset();

      resetAdminForm(
        e.target,
        formModeElement,
        idKeyName,
        submitButtonElement,
        `Simpan ${sheetName.replace("_", " ")}`,
        idInputElement
      );

      await loadAdminTableData(sheetName); // Reload table after submission
      await loadAdminDropdownData(); // Reload dropdowns just in case (e.g., new tasks added or subjects)
      if (idKeyName === "ID_Nilai") {
        configureNilaiFormBasedOnSelection(); // Re-trigger for Nilai to reset its field state
      } else if (idKeyName === "ID_Tugas") {
        updateTugasIdField(); // Re-trigger for Tugas to reset its field state
      } else if (idKeyName === "ID_Pengumuman") {
        updatePengumumanIdField();
      }
    } else {
      showToast(`Gagal ${action} ${sheetName}: ${result.message}`, "error");
    }
  } catch (error) {
    console.error("Admin Form Submit Error:", error);
    showToast("Terjadi kesalahan saat submit data.", "error");
  } finally {
    hideLoading();
  }
}

document.getElementById("form-input-tugas").addEventListener("submit", (e) => {
  handleAdminFormSubmit(
    e,
    "Tugas",
    "ID_Tugas",
    tugasFormMode,
    tugasEditId,
    submitTugasBtn
  );
});

document.getElementById("form-input-nilai").addEventListener("submit", (e) => {
  handleAdminFormSubmit(
    e,
    "Nilai",
    "ID_Nilai",
    nilaiFormMode,
    nilaiEditId,
    submitNilaiBtn
  );
});

document
  .getElementById("form-input-kehadiran")
  .addEventListener("submit", (e) => {
    handleAdminFormSubmit(
      e,
      "Kehadiran",
      "ID_Kehadiran",
      kehadiranFormMode,
      kehadiranEditId,
      submitKehadiranBtn
    );
  });

document
  .getElementById("form-input-catatan")
  .addEventListener("submit", (e) => {
    handleAdminFormSubmit(
      e,
      "Catatan_Guru",
      "ID_Catatan",
      catatanFormMode,
      catatanEditId,
      submitCatatanBtn
    );
  });

document.getElementById("form-input-jadwal").addEventListener("submit", (e) => {
  handleAdminFormSubmit(
    e,
    "Jadwal_Pelajaran",
    "ID_Jadwal",
    jadwalFormMode,
    jadwalEditId,
    submitJadwalBtn
  );
});

document
  .getElementById("form-input-pengumuman")
  .addEventListener("submit", (e) => {
    handleAdminFormSubmit(
      e,
      "Pengumuman",
      "ID_Pengumuman",
      pengumumanFormMode,
      pengumumanEditId,
      submitPengumumanBtn
    );
  });

// --- Tab Switching Logic for Admin Dashboard ---
document.querySelectorAll(".admin-tab-button").forEach((button) => {
  button.addEventListener("click", async () => {
    const targetTab = button.dataset.tab;
    switchTab(
      targetTab,
      document.querySelectorAll(".admin-tab-button"),
      "admin-"
    );
    showLoading();
    try {
      // Reset forms to 'create' mode when switching tabs and clear old data
      resetAdminForm(
        document.getElementById("form-input-tugas"),
        tugasFormMode,
        "ID_Tugas",
        submitTugasBtn,
        "Simpan Tugas",
        document.getElementById("tugas-id")
      );
      resetAdminForm(
        document.getElementById("form-input-nilai"),
        nilaiFormMode,
        "ID_Nilai",
        submitNilaiBtn,
        "Simpan Nilai",
        document.getElementById("nilai-id")
      );
      resetAdminForm(
        document.getElementById("form-input-kehadiran"),
        kehadiranFormMode,
        "ID_Kehadiran",
        submitKehadiranBtn,
        "Simpan Kehadiran",
        document.getElementById("kehadiran-id")
      );
      resetAdminForm(
        document.getElementById("form-input-catatan"),
        catatanFormMode,
        "ID_Catatan",
        submitCatatanBtn,
        "Simpan Catatan",
        document.getElementById("catatan-id")
      );
      resetAdminForm(
        document.getElementById("form-input-jadwal"),
        jadwalFormMode,
        "ID_Jadwal",
        submitJadwalBtn,
        "Simpan Jadwal",
        document.getElementById("jadwal-id")
      );
      resetAdminForm(
        document.getElementById("form-input-pengumuman"),
        pengumumanFormMode,
        "ID_Pengumuman",
        submitPengumumanBtn,
        "Simpan Pengumuman",
        document.getElementById("pengumuman-id")
      );

      // Reload dropdowns and tables if navigating to a form that uses them
      if (
        [
          "input-nilai",
          "input-kehadiran",
          "input-catatan",
          "input-tugas",
          "input-jadwal",
          "input-pengumuman",
        ].includes(targetTab)
      ) {
        await loadAdminDropdownData(); // Ensure dropdowns are populated with latest data
        if (targetTab === "input-nilai") {
          configureNilaiFormBasedOnSelection(); // Trigger initial configuration for Nilai form
        } else if (targetTab === "input-tugas") {
          updateTugasIdField(); // Trigger initial ID generation for Tugas form
        } else if (targetTab === "input-pengumuman") {
          updatePengumumanIdField();
        }
      }

      let sheetNameForTable;
      switch (targetTab) {
        case "input-tugas":
          sheetNameForTable = "Tugas";
          break;
        case "input-nilai":
          sheetNameForTable = "Nilai";
          break;
        case "input-kehadiran":
          sheetNameForTable = "Kehadiran";
          break;
        case "input-catatan":
          sheetNameForTable = "Catatan_Guru";
          break;
        case "input-jadwal":
          sheetNameForTable = "Jadwal_Pelajaran";
          break;
        case "input-pengumuman":
          sheetNameForTable = "Pengumuman";
          break;
        default:
          sheetNameForTable = "";
      }
      if (sheetNameForTable) {
        await loadAdminTableData(sheetNameForTable); // Load table data for the current tab
      }
    } catch (error) {
      console.error("Error loading admin tab data:", error);
      showToast("Gagal memuat data untuk tab admin ini.", "error");
    } finally {
      hideLoading();
    }
  });
});

// Initialize admin view: show login by default, hide dashboard
showSection("login-section");

// Apply initial 'Dihasilkan Otomatis' and readonly state to admin ID fields
document.getElementById("tugas-id").readOnly = true;
document.getElementById("tugas-id").value = "Dihasilkan Otomatis";
document
  .getElementById("tugas-id")
  .classList.add("bg-gray-100", "cursor-not-allowed");

document.getElementById("nilai-id").readOnly = true;
document.getElementById("nilai-id").value = "";
document.getElementById("nilai-id").placeholder = "Akan Dihasilkan Otomatis";
document
  .getElementById("nilai-id")
  .classList.add("bg-gray-100", "cursor-not-allowed");

document.getElementById("kehadiran-id").readOnly = true;
document.getElementById("kehadiran-id").value = "Dihasilkan Otomatis";
document
  .getElementById("kehadiran-id")
  .classList.add("bg-gray-100", "cursor-not-allowed");

document.getElementById("catatan-id").readOnly = true;
document.getElementById("catatan-id").value = "Dihasilkan Otomatis";
document
  .getElementById("catatan-id")
  .classList.add("bg-gray-100", "cursor-not-allowed");

document.getElementById("jadwal-id").readOnly = true;
document.getElementById("jadwal-id").value = "Dihasilkan Otomatis";
document
  .getElementById("jadwal-id")
  .classList.add("bg-gray-100", "cursor-not-allowed");

document.getElementById("pengumuman-id").readOnly = true;
document.getElementById("pengumuman-id").value = "Dihasilkan Otomatis";
document
  .getElementById("pengumuman-id")
  .classList.add("bg-gray-100", "cursor-not-allowed");
