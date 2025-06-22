// Ganti URL ini dengan URL Web App Google Apps Script Anda setelah di-deploy
// Catatan: URL ini mungkin tidak lagi digunakan secara langsung untuk FETCH
// karena kita akan menggunakan google.script.run
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
  admin_users: null, // This is now less critical as auth is server-side via Google
};

// DOM Elements specific to admin view
const loadingOverlay = document.getElementById("loading-overlay");
const loginSection = document.getElementById("login-section"); // For admin login form (now status message)
const adminWelcomeDashboardSection = document.getElementById(
  "admin-welcome-dashboard-section"
); // NEW Welcome Dashboard
const adminDataManagementDashboardSection = document.getElementById(
  "admin-data-management-dashboard-section"
); // OLD Dashboard, renamed for clarity
const toastContainer = document.getElementById("toast-container");
const unifiedLoginCard = document.getElementById("unified-login-card");
const loginTitle = document.getElementById("login-title"); // Now used for status messages
const loginStatusMessage = document.getElementById("login-status-message"); // NEW element for messages
const accessDeniedMessage = document.getElementById("access-denied-message"); // NEW element for access denied

const sidebarMenuIcon = document.getElementById("sidebar-menu-icon"); // NEW for admin sidebar
const sidebar = document.getElementById("sidebar"); // NEW for admin sidebar
const sidebarOverlay = document.getElementById("sidebar-overlay"); // NEW for admin sidebar
const logoutButtonSidebar = document.getElementById("logout-button-sidebar"); // NEW for admin sidebar

const adminLoggedInEmailSpan = document.getElementById("admin-logged-in-email"); // To display logged in email

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
  // Sembunyikan semua bagian utama terlebih dahulu
  loginSection.classList.add("section-hidden");
  adminWelcomeDashboardSection.classList.add("section-hidden");
  adminDataManagementDashboardSection.classList.add("section-hidden");

  // Tampilkan bagian target
  const targetElement = document.getElementById(sectionId);
  if (targetElement) {
    targetElement.classList.remove("section-hidden");
  }

  // Kelola visibilitas ikon sidebar
  if (
    sectionId === "admin-welcome-dashboard-section" ||
    sectionId === "admin-data-management-dashboard-section"
  ) {
    sidebarMenuIcon.style.display = "block";
  } else {
    sidebarMenuIcon.style.display = "none";
  }
}

// --- Sidebar Functions ---
function openSidebar() {
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("visible");
  document
    .querySelector(".main-content-area")
    .classList.add("sidebar-open-main");
  document
    .querySelector(".fixed-app-header")
    .classList.add("sidebar-open-main");
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("visible");
  document
    .querySelector(".main-content-area")
    .classList.remove("sidebar-open-main");
  document
    .querySelector(".fixed-app-header")
    .classList.remove("sidebar-open-main");
}
// Pasang event listener klik ke overlay untuk menutup sidebar
sidebarOverlay.addEventListener("click", closeSidebar);
// Pasang fungsi logout ke tombol logout sidebar baru
logoutButtonSidebar.addEventListener("click", logout);

// --- Toast Notification Function ---
function showToast(message, type = "info", duration = 3000) {
  const toast = document.createElement("div");
  toast.classList.add("toast", type);
  toast.textContent = message;
  toastContainer.appendChild(toast);

  void toast.offsetWidth; // Memaksa reflow
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
// Fungsi ini sekarang menangani peralihan antara bagian admin utama (selamat datang vs manajemen data)
// dan juga tab internal di dalam manajemen data
function switchTab(targetTabId, buttons) {
  // Jika beralih ke bagian utama
  if (targetTabId.startsWith("admin-")) {
    showSection(targetTabId); // Tampilkan bagian utama
    // Nonaktifkan semua tombol sidebar
    document.querySelectorAll(".sidebar-menu-item").forEach((btn) => {
      btn.classList.remove("text-green-600", "border-green-600", "font-bold");
      btn.classList.add("text-gray-800");
    });
    // Aktifkan tombol sidebar tertentu jika ditemukan
    const sidebarButton = Array.from(
      document.querySelectorAll(".sidebar-menu-item")
    ).find((btn) => btn.dataset.tab === targetTabId);
    if (sidebarButton) {
      sidebarButton.classList.remove("text-gray-800");
      sidebarButton.classList.add("text-green-600", "font-bold");
    }
    closeSidebar(); // Tutup sidebar setelah pemilihan
  } else {
    // Ini untuk tab internal di dalam adminDataManagementDashboardSection
    document.querySelectorAll(".admin-tab-content").forEach((content) => {
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
}

// --- Panggilan Balik Apps Script untuk Google Login ---
function onAdminStatusReceived(response) {
  hideLoading();
  if (response.isAdmin) {
    adminLoggedInEmailSpan.textContent = response.email;
    showSection("admin-welcome-dashboard-section");
    // Aktifkan tombol sidebar 'Dashboard Admin' di awal
    switchTab(
      "admin-welcome-dashboard-section",
      document.querySelectorAll(".sidebar-menu-item")
    );
  } else {
    // Tampilkan bagian login dengan pesan akses ditolak
    showSection("login-section");
    accessDeniedMessage.classList.remove("section-hidden");
    loginStatusMessage.innerHTML = `
            <p class="text-red-600 font-bold text-xl mb-2">AKSES DITOLAK</p>
            <p class="text-gray-700">Email Anda: <span class="font-semibold">${
              response.email || "Tidak Terdeteksi"
            }</span> tidak terdaftar sebagai admin.</p>
            <p class="text-gray-700 mt-2">Silakan hubungi administrator sistem jika Anda yakin ini adalah kesalahan.</p>
            <p class="text-gray-700 mt-4">Pastikan Anda login dengan akun Google yang benar.</p>
        `;
    // Sembunyikan judul login normal jika akses ditolak
    loginTitle.classList.add("section-hidden");
  }
}

function onAdminStatusError(error) {
  hideLoading();
  console.error("Error fetching admin status:", error);
  showSection("login-section");
  accessDeniedMessage.classList.remove("section-hidden");
  loginStatusMessage.innerHTML = `
        <p class="text-red-600 font-bold text-xl mb-2">TERJADI KESALAHAN</p>
        <p class="text-gray-700">Gagal memverifikasi status admin. Pesan: ${error.message}</p>
        <p class="text-gray-700 mt-2">Silakan coba lagi atau hubungi administrator sistem.</p>
    `;
  loginTitle.classList.add("section-hidden");
  showToast("Gagal memverifikasi status admin.", "error");
}

// --- Fungsi Logout ---
function logout() {
  // Ini akan memuat ulang halaman, yang akan memaksa Aplikasi Web Apps Script untuk mengevaluasi ulang status login Google mereka.
  showToast("Logging out...", "info");
  setTimeout(() => {
    window.location.reload(); // Muat ulang halaman untuk memicu pemeriksaan Google Auth
  }, 500);
}

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

// --- Fungsi Pengambilan Data (GET) dengan Cache ---
// Dimodifikasi untuk menggunakan google.script.run untuk permintaan GET setelah otentikasi awal
async function fetchData(sheetName, param = null) {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler((response) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      })
      .withFailureHandler(reject)
      .getData(sheetName, param); // Panggil fungsi Apps Script getData
  });
}

// --- Fungsi Pengiriman/Pembaruan/Penghapusan Data (POST) ---
async function sendData(sheetName, data, action) {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler(reject)
      .doPostBackend({ sheet: sheetName, action: action, data: data }); // Panggil fungsi Apps Script yang baru untuk POST
  });
}

// Helper function to get header labels for data-label attribute
function getHeaderLabels(tableBodyId) {
  let headers = [];
  const table = document.getElementById(tableBodyId).closest("table");
  if (table && table.querySelector("thead tr")) {
    // Hanya pilih header yang terlihat untuk data-label
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

// --- Muat Data untuk Dropdown dan Tabel Admin ---
async function loadAdminDropdownData() {
  populateDropdown(nilaiNisSelect, null, "", "", "Memuat siswa...");
  populateDropdown(kehadiranNisSelect, null, "", "", "Memuat siswa...");
  populateDropdown(catatanNisSelect, null, "", "", "Memuat siswa...");

  try {
    const siswaData = await fetchData("Siswa"); // Tidak perlu parameter forceRefresh di sini karena fetchData tidak menggunakan cache
    if (siswaData) {
      dataCache.siswa = siswaData; // Perbarui cache secara eksplisit
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
      const tugasData = await fetchData("Tugas");
      if (tugasData) {
        dataCache.tugas = tugasData; // Perbarui cache secara eksplisit
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
  } catch (error) {
    console.error("Error loading admin dropdown data:", error);
    showToast("Gagal memuat data dropdown admin.", "error");
  }
}

async function loadAdminTableData(sheetName) {
  let tableBodyElement;
  let idKey;
  let dataFetch;
  let renderFunction;

  // Tetapkan tableBodyElement terlebih dahulu
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

  tableBodyElement.innerHTML = `<tr><td colspan="99" class="text-center py-4 text-gray-500">Memuat data...</td></tr>`; // Tampilkan loading di tabel

  try {
    dataFetch = await fetchData(sheetName); // Tidak perlu parameter forceRefresh di sini karena fetchData tidak menggunakan cache
    dataCache[sheetName.toLowerCase().replace("_", "")] = dataFetch; // Perbarui cache secara eksplisit
  } catch (error) {
    console.error(`Error fetching table data for ${sheetName}:`, error);
    showToast(`Gagal memuat data tabel ${sheetName}.`, "error");
    tableBodyElement.innerHTML = `<tr><td colspan="99" class="text-center py-4 text-red-500">Gagal memuat data.</td></tr>`;
    return;
  }

  if (!dataFetch || dataFetch.length === 0) {
    tableBodyElement.innerHTML = `<tr><td colspan="99" class="text-center py-4 text-gray-500">Tidak ada data ${sheetName}.</td></tr>`;
    return;
  }

  // Definisikan renderFunction setelah dataFetch dan caching ditangani
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
      // Kasus ini seharusnya tidak tercapai karena switch awal
      console.error("renderFunction not defined for sheet:", sheetName);
      return;
  }

  tableBodyElement.innerHTML = ""; // Bersihkan pesan loading

  const headers = getHeaderLabels(tableBodyElement.id); // Dapatkan header dari tabel tertentu

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
    tbody.appendChild(row);
  });
}

// --- Konfigurasi Formulir Nilai berdasarkan pemilihan NIS dan ID Tugas ---
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

    // Ambil Nilai yang sudah ada untuk kombinasi siswa dan tugas ini
    const existingNilai = await fetchData("Nilai", {
      nis: nis,
      id_tugas: tugasId,
    });

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

// --- Perbarui bidang ID Tugas berdasarkan pemilihan Mata Pelajaran ---
async function updateTugasIdField() {
  const selectedSubject = tugasMapelSelect.value;
  const tugasIdInput = document.getElementById("tugas-id");

  if (selectedSubject) {
    const subjectAbbr = SUBJECT_ABBREVIATIONS[selectedSubject] || "OTH";
    const currentMonth = new Date().getMonth() + 1;

    // Ambil semua tugas yang sudah ada untuk menentukan nomor urut berikutnya
    const allTugas = (await fetchData("Tugas")) || [];
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

// --- Perbarui bidang ID Pengumuman ---
async function updatePengumumanIdField() {
  const pengumumanIdInput = document.getElementById("pengumuman-id");
  // Ambil semua pengumuman
  const allPengumuman = (await fetchData("Pengumuman")) || [];
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

// --- Fungsi Edit Entri ---
async function editEntry(sheetName, id) {
  let formElement;
  let idInput;
  let modeInput;
  let submitButton;
  let itemToEdit;
  let idKey;

  try {
    showLoading();

    // Ambil data terbaru untuk pengeditan
    const currentData = await fetchData(sheetName);
    if (!currentData) {
      showToast("Gagal memuat data untuk edit.", "error");
      return;
    }
    // Perbarui entri cache tertentu untuk sheet ini
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
      // Beralih ke tab yang benar untuk pengeditan
      switchTab(
        `input-${sheetName.toLowerCase().replace("_", "")}`,
        document.querySelectorAll(".admin-data-tab-button")
      );
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

// --- Fungsi Hapus Entri ---
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
        // case "Admin_Users": idKey = "Email"; break; // Admin_Users tidak dapat diedit melalui CRUD frontend
        default:
          showToast("Aksi hapus tidak didukung untuk sheet ini.", "error");
          return;
      }

      const dataToDelete = {};
      dataToDelete[idKey] = id;

      try {
        showLoading();
        const result = await sendData(sheetName, dataToDelete, "delete"); // sendData sekarang menangani pembatalan cache
        if (result.success) {
          showToast(
            `${sheetName} dengan ID ${id} berhasil dihapus!`,
            "success"
          );
          await loadAdminTableData(sheetName); // Muat ulang tabel setelah penghapusan
          if (sheetName === "Siswa" || sheetName === "Tugas") {
            await loadAdminDropdownData(); // Muat ulang dropdown jika data yang relevan dimodifikasi
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

// --- Pengiriman Formulir Admin ---
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

      await loadAdminTableData(sheetName); // Muat ulang tabel setelah pengiriman
      await loadAdminDropdownData(); // Muat ulang dropdown jika ada (misalnya, tugas baru ditambahkan atau mata pelajaran)
      if (idKeyName === "ID_Nilai") {
        configureNilaiFormBasedOnSelection(); // Memicu konfigurasi awal untuk formulir Nilai
      } else if (idKeyName === "ID_Tugas") {
        updateTugasIdField(); // Memicu pembuatan ID awal untuk formulir Tugas
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

// --- Logika Pergantian Tab untuk Dashboard Admin ---
// Event listener untuk item menu sidebar (bagian utama)
document.querySelectorAll(".sidebar-menu-item").forEach((button) => {
  button.addEventListener("click", async () => {
    const targetTab = button.dataset.tab;
    switchTab(targetTab, document.querySelectorAll(".sidebar-menu-item")); // Tangani peralihan bagian utama

    if (targetTab === "admin-data-management-dashboard-section") {
      showLoading();
      try {
        // Aktifkan tab manajemen data pertama secara default
        const firstDataTabButton = document.querySelector(
          ".admin-data-tab-button"
        );
        if (firstDataTabButton) {
          switchTab(
            firstDataTabButton.dataset.tab,
            document.querySelectorAll(".admin-data-tab-button")
          );
          await loadAdminDropdownData();
          await loadAdminTableData("Tugas"); // Muat tabel awal untuk manajemen data
        }
      } catch (error) {
        console.error("Error loading data management dashboard:", error);
        showToast("Gagal memuat dashboard manajemen data.", "error");
      } finally {
        hideLoading();
      }
    }
    // Tidak ada tindakan yang diperlukan untuk admin-welcome-dashboard-section karena bersifat statis
  });
});

// Event listener untuk tab manajemen data internal
document.querySelectorAll(".admin-data-tab-button").forEach((button) => {
  button.addEventListener("click", async () => {
    const targetTab = button.dataset.tab;
    switchTab(targetTab, document.querySelectorAll(".admin-data-tab-button"));
    showLoading();
    try {
      // Reset formulir ke mode 'create' saat beralih tab dan hapus data lama
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

      // Muat ulang dropdown dan tabel jika menavigasi ke formulir yang menggunakannya
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
        await loadAdminDropdownData(); // Pastikan dropdown diisi dengan data terbaru
        if (targetTab === "input-nilai") {
          configureNilaiFormBasedOnSelection(); // Memicu konfigurasi awal untuk formulir Nilai
        } else if (targetTab === "input-tugas") {
          updateTugasIdField(); // Memicu pembuatan ID awal untuk formulir Tugas
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
        await loadAdminTableData(sheetNameForTable); // Muat data tabel untuk tab saat ini
      }
    } catch (error) {
      console.error("Error loading admin tab data:", error);
      showToast("Gagal memuat data untuk tab admin ini.", "error");
    } finally {
      hideLoading();
    }
  });
});

// Status 'Dihasilkan Otomatis' awal dan status hanya-baca untuk bidang ID
document.addEventListener("DOMContentLoaded", () => {
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

  // Panggil Apps Script untuk memeriksa status admin saat halaman dimuat
  showLoading();
  google.script.run
    .withSuccessHandler(onAdminStatusReceived)
    .withFailureHandler(onAdminStatusError)
    .getAdminStatus();
});
