// Ganti URL ini dengan URL Web App Google Apps Script Anda setelah di-deploy
const GOOGLE_APPS_SCRIPT_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbzN1daif0NyrrL-ojAYIVQvmtVhU7LHWwzBgRbHrTt_87udBmLt42mkssUmEqoJtb0p/exec";
const PASS_MARK = 75; // Nilai minimum untuk status "Tuntas"

// Hardcoded list of subjects (needed for dropdowns)
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

// Client-side cache for fetched data
const dataCache = {
  admin_users: [], // Dibiarkan sebagai placeholder jika ada kebutuhan admin di masa depan, tapi tidak digunakan untuk login guru
  siswa: [],
  guru: [], // Data guru dari sheet 'Guru'
  tugas: [],
  nilai: [], // Data nilai akan dimuat on-demand
  kehadiran: [],
  catatan_guru: [],
  jadwal_pelajaran: [],
  pengumuman: [],
};

let currentLoggedInEmail = null; // Menyimpan email guru yang sedang login
let currentLoggedInTeacherData = null; // Menyimpan objek guru yang sedang login (jika ada)

let activeSectionId = "login-section"; // Initial active section

// --- Utility Functions (shared) ---
function showLoadingOverlay() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    overlay.classList.remove("section-hidden");
    overlay.style.opacity = "1";
    overlay.style.visibility = "visible";
  }
}

function hideLoadingOverlay() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    overlay.style.opacity = "0";
    overlay.style.visibility = "hidden";
    setTimeout(() => {
      overlay.classList.add("section-hidden");
    }, 300);
  }
}

function showToast(message, type = "info") {
  const toastContainer = document.getElementById("toast-container");
  if (!toastContainer) {
    console.error("Toast container not found!");
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type} p-3 rounded-md shadow-md text-white`;
  toast.textContent = message;

  toastContainer.appendChild(toast);
  void toast.offsetWidth;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
    toast.classList.add("hide");
    toast.addEventListener("transitionend", () => {
      toast.remove();
    });
  }, 3000);
}

function updateUrlHash(sectionId) {
  // Update URL hash without causing a full page reload
  // This helps maintain history and allows direct linking to sections
  history.pushState(null, "", `#${sectionId}`);
}

async function showSection(sectionId) {
  // Made async to await data fetching
  const sections = document.querySelectorAll("section");
  sections.forEach((section) => {
    section.classList.add("section-hidden");
  });
  const targetSection = document.getElementById(sectionId);
  if (targetSection) {
    targetSection.classList.remove("section-hidden");
    activeSectionId = sectionId; // Update active section
    updateHeaderTitle(sectionId); // Update header title
    updateSidebarActiveState(sectionId); // Update sidebar active state
    updateUrlHash(sectionId); // Update URL hash

    // Tidak ada showLoadingOverlay() di sini untuk memungkinkan tampilan bagian langsung
    // Fungsi pemuatan data individual akan menangani indikator mereka sendiri
    try {
      if (sectionId === "guru-dashboard-section") {
        console.log(
          "--> Mengaktifkan bagian Dashboard Guru. Data guru sudah di-cache."
        );
        // Data guru sudah di-cache saat login oleh fetchInitialDashboardData
        // Tidak perlu fetch tambahan di sini untuk menghindari duplikasi
        console.log("<-- Bagian Dashboard Guru diaktifkan.");
      } else if (sectionId === "manajemen-data-section") {
        console.log("--> Mengaktifkan bagian Manajemen Data. Memeriksa data.");
        // Ambil data yang dibutuhkan untuk tab Manajemen Data (Tugas, Catatan Guru, Jadwal, Pengumuman)
        // Pastikan data siswa juga sudah ada untuk dropdown catatan guru
        if (!dataCache.siswa || dataCache.siswa.length === 0) {
          console.log(
            "    Data siswa kosong atau null. Mengambil data Siswa untuk dropdown manajemen."
          );
          dataCache.siswa = await fetchSheetData("Siswa");
        } else {
          console.log(
            "    Data siswa sudah ada di cache. Menggunakan data yang di-cache."
          );
        }
        if (!dataCache.tugas || dataCache.tugas.length === 0) {
          console.log("    Data tugas kosong atau null. Mengambil data Tugas.");
          dataCache.tugas = await fetchSheetData("Tugas");
        } else {
          console.log(
            "    Data tugas sudah ada di cache. Menggunakan data yang di-cache."
          );
        }
        if (!dataCache.catatan_guru || dataCache.catatan_guru.length === 0) {
          console.log(
            "    Data catatan_guru kosong atau null. Mengambil data Catatan_Guru."
          );
          dataCache.catatan_guru = await fetchSheetData("Catatan_Guru");
        } else {
          console.log(
            "    Data catatan_guru sudah ada di cache. Menggunakan data yang di-cache."
          );
        }
        if (
          !dataCache.jadwal_pelajaran ||
          dataCache.jadwal_pelajaran.length === 0
        ) {
          console.log(
            "    Data jadwal_pelajaran kosong atau null. Mengambil data Jadwal_Pelajaran."
          );
          dataCache.jadwal_pelajaran = await fetchSheetData("Jadwal_Pelajaran");
        } else {
          console.log(
            "    Data jadwal_pelajaran sudah ada di cache. Menggunakan data yang di-cache."
          );
        }
        if (!dataCache.pengumuman || dataCache.pengumuman.length === 0) {
          console.log(
            "    Data pengumuman kosong atau null. Mengambil data Pengumuman."
          );
          dataCache.pengumuman = await fetchSheetData("Pengumuman");
        } else {
          console.log(
            "    Data pengumuman sudah ada di cache. Menggunakan data yang di-cache."
          );
        }
        // Mengisi dropdown yang relevan dengan bagian ini
        populateSiswaDropdownsGuru(); // Untuk formulir Catatan Guru
        populateMapelDropdownsGuru(); // Untuk formulir Tugas dan Jadwal
        console.log("<-- Bagian Manajemen Data diaktifkan dan dirender.");
      } else if (sectionId === "input-nilai-kehadiran-section") {
        console.log(
          "--> Mengaktifkan bagian Input Nilai & Kehadiran. Memeriksa data."
        );
        // Ambil data yang dibutuhkan untuk tab Input Nilai & Kehadiran
        if (!dataCache.siswa || dataCache.siswa.length === 0) {
          console.log(
            "    Data siswa kosong atau null. Mengambil data Siswa untuk Input Nilai/Kehadiran."
          );
          dataCache.siswa = await fetchSheetData("Siswa");
          populateSiswaDropdownsInput(); // Isi ulang untuk Nilai/Kehadiran jika baru diambil
        } else {
          console.log(
            "    Data siswa sudah ada di cache. Menggunakan data yang di-cache."
          );
        }
        if (!dataCache.tugas || dataCache.tugas.length === 0) {
          console.log(
            "    Data tugas kosong atau null. Mengambil data Tugas untuk Input Nilai."
          );
          dataCache.tugas = await fetchSheetData("Tugas");
          populateTugasDropdownsInput(); // Isi ulang untuk Nilai jika baru diambil
        } else {
          console.log(
            "    Data tugas sudah ada di cache. Menggunakan data yang di-cache."
          );
        }
        if (!dataCache.kehadiran || dataCache.kehadiran.length === 0) {
          console.log(
            "    Data kehadiran kosong atau null. Mengambil data Kehadiran."
          );
          dataCache.kehadiran = await fetchSheetData("Kehadiran");
        } else {
          console.log(
            "    Data kehadiran sudah ada di cache. Menggunakan data yang di-cache."
          );
        }
        console.log(
          "<-- Bagian Input Nilai & Kehadiran diaktifkan dan dirender."
        );
      } else if (sectionId === "rekap-data-section") {
        console.log(
          "--> Mengaktifkan bagian Rekap Data. Memeriksa data Nilai..."
        );
        // Tampilkan pesan loading di dalam tabel segera
        rekapNilaiTableBody.innerHTML =
          '<tr><td colspan="7" class="text-center py-4 text-gray-500">Memuat data nilai...</td></tr>';

        // Ambil data 'nilai' khusus untuk bagian ini, jika belum diambil
        if (!dataCache.nilai || dataCache.nilai.length === 0) {
          // Periksa apakah kosong atau null
          console.log(
            "    Data nilai kosong atau null. Mengambil data Nilai untuk Rekap..."
          );
          dataCache.nilai = await fetchSheetData("Nilai");
        } else {
          console.log(
            "    Data nilai sudah ada di cache. Menggunakan data yang di-cache."
          );
        }
        // Pastikan data siswa dan tugas juga tersedia untuk rendering rekap
        if (!dataCache.siswa || dataCache.siswa.length === 0) {
          console.log(
            "    Data siswa kosong atau null. Mengambil data Siswa untuk Rekap..."
          );
          dataCache.siswa = await fetchSheetData("Siswa");
        } else {
          console.log(
            "    Data siswa sudah ada di cache. Menggunakan data yang di-cache."
          );
        }
        if (!dataCache.tugas || dataCache.tugas.length === 0) {
          console.log(
            "    Data tugas kosong atau null. Mengambil data Tugas untuk Rekap..."
          );
          dataCache.tugas = await fetchSheetData("Tugas");
        } else {
          console.log(
            "    Data tugas sudah ada di cache. Menggunakan data yang di-cache."
          );
        }
        populateRekapFilters(); // Mengisi dropdown filter
        renderRekapNilaiTable(); // Merender tabel
        console.log("<-- Bagian Rekap Data diaktifkan dan dirender.");
      }
    } catch (error) {
      console.error(`Error loading data for section ${sectionId}:`, error);
      showToast("Gagal memuat data untuk bagian ini.", "error");
    } finally {
      // Tidak ada hideLoadingOverlay() di sini. Indikator granular mengelola diri sendiri.
    }
  }
  // Di perangkat seluler, tutup sidebar setelah perubahan bagian
  const sidebar = document.querySelector(".sidebar");
  const sidebarOverlay = document.getElementById("sidebar-overlay");
  const mainContentWrapper = document.querySelector(".main-content-wrapper");
  if (
    sidebar &&
    sidebarOverlay &&
    mainContentWrapper &&
    window.innerWidth <= 768
  ) {
    sidebar.classList.remove("active");
    sidebarOverlay.classList.remove("active");
    mainContentWrapper.classList.remove("sidebar-active");
  }
}

function updateHeaderTitle(sectionId) {
  const headerTitleElement = document.getElementById("header-title");
  let title = "Sistem Monitoring Siswa";
  switch (sectionId) {
    case "login-section":
      title = "Sistem Monitoring Siswa";
      break;
    case "guru-dashboard-section":
      title = "Dashboard Guru";
      break;
    case "manajemen-data-section":
      title = "Manajemen Data";
      break;
    case "input-nilai-kehadiran-section":
      title = "Input Nilai & Kehadiran";
      break;
    case "rekap-data-section":
      title = "Rekap Data Nilai";
      break;
  }
  if (headerTitleElement) {
    headerTitleElement.textContent = title;
  }
}

function updateSidebarActiveState(activeSectionId) {
  const sidebarButtons = document.querySelectorAll(".sidebar-button");
  sidebarButtons.forEach((button) => {
    button.classList.remove("text-blue-600", "bg-blue-100", "font-semibold");
    button.classList.add("text-gray-700", "hover:bg-gray-100");
    if (button.dataset.targetSection === activeSectionId) {
      button.classList.add("text-blue-600", "bg-blue-100", "font-semibold");
      button.classList.remove("text-gray-700", "hover:bg-gray-100");
    }
  });
}

function switchTab(targetId, tabSectionId) {
  // Renamed parameter for clarity
  const tabButtons = document.querySelectorAll(`#${tabSectionId} .tab-button`);

  let tabContentsContainer;
  // Disesuaikan untuk menemukan kontainer dengan benar berdasarkan tabSectionId
  if (tabSectionId === "manajemen-data-section") {
    tabContentsContainer = document.getElementById(
      "tab-content-container-manajemen"
    );
  } else if (tabSectionId === "input-nilai-kehadiran-section") {
    tabContentsContainer = document.getElementById(
      "tab-content-container-input"
    );
  } else {
    console.error(
      `Tab content container not found for unknown section: ${tabSectionId}`
    );
    return;
  }

  if (!tabContentsContainer) {
    console.error(
      `Tab content container with ID '${tabContentsContainer.id}' not found for section ${tabSectionId}`
    );
    return;
  }

  const tabContents = tabContentsContainer.querySelectorAll(".tab-content");

  tabContents.forEach((content) => {
    content.classList.add("section-hidden");
  });
  document.getElementById(targetId).classList.remove("section-hidden");

  tabButtons.forEach((button) => {
    button.classList.remove("active");
  });
  document
    .querySelector(`#${tabSectionId} .tab-button[data-target="${targetId}"]`)
    .classList.add("active");
}

function showConfirmModal(title, message, onConfirm) {
  const confirmModal = document.getElementById("confirm-modal");
  const confirmModalTitle = document.getElementById("confirm-modal-title");
  const confirmModalMessage = document.getElementById("confirm-modal-message");
  const confirmOkBtn = document.getElementById("confirm-ok-btn");
  const confirmCancelBtn = document.getElementById("confirm-cancel-btn");

  confirmModalTitle.textContent = title;
  confirmModalMessage.textContent = message;

  confirmModal.classList.add("active");

  const handleOk = () => {
    onConfirm();
    confirmModal.classList.remove("active");
    confirmOkBtn.removeEventListener("click", handleOk);
    confirmCancelBtn.removeEventListener("click", handleCancel);
  };

  const handleCancel = () => {
    confirmModal.classList.remove("active");
    confirmOkBtn.removeEventListener("click", handleOk);
    confirmCancelBtn.removeEventListener("click", handleCancel);
  };

  confirmOkBtn.addEventListener("click", handleOk);
  confirmCancelBtn.addEventListener("click", handleCancel);
}

// --- Fetch, Post, Update, Delete Data from Apps Script ---
async function fetchSheetData(sheetName, params = {}) {
  const url = new URL(GOOGLE_APPS_SCRIPT_WEB_APP_URL);
  url.searchParams.append("sheet", sheetName);
  for (const key in params) {
    url.searchParams.append(key, params[key]);
  }

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching data from ${sheetName}:`, error);
    showToast(`Gagal memuat data dari ${sheetName}.`, "error");
    return null;
  }
}

async function postSheetData(sheetName, data) {
  try {
    const response = await fetch(GOOGLE_APPS_SCRIPT_WEB_APP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        sheet: sheetName,
        action: "add",
        data: JSON.stringify(data),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    if (result.success) {
      showToast(result.message, "success");
    } else {
      showToast(result.message, "error");
    }
    return result;
  } catch (error) {
    console.error(`Error posting data to ${sheetName}:`, error);
    showToast(`Gagal menambahkan data ke ${sheetName}.`, "error");
    return { success: false, message: "Terjadi kesalahan jaringan." };
  }
}

async function updateSheetData(sheetName, idColumn, newData) {
  try {
    const response = await fetch(GOOGLE_APPS_SCRIPT_WEB_APP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        sheet: sheetName,
        action: "update",
        idColumn: idColumn,
        data: JSON.stringify(newData),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    if (result.success) {
      showToast(result.message, "success");
    } else {
      showToast(result.message, "error");
    }
    return result;
  } catch (error) {
    console.error(`Error updating data in ${sheetName}:`, error);
    showToast(`Gagal memperbarui data di ${sheetName}.`, "error");
    return { success: false, message: "Terjadi kesalahan jaringan." };
  }
}

async function deleteSheetData(sheetName, idColumn, idValue) {
  try {
    const response = await fetch(GOOGLE_APPS_SCRIPT_WEB_APP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        sheet: sheetName,
        action: "delete",
        idColumn: idColumn,
        idValue: idValue,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    if (result.success) {
      showToast(result.message, "success");
    } else {
      showToast(result.message, "error");
    }
    return result;
  } catch (error) {
    console.error(`Error deleting data from ${sheetName}:`, error);
    showToast(`Gagal menghapus data dari ${sheetName}.`, "error");
    return { success: false, message: "Terjadi kesalahan jaringan." };
  }
}

// --- Admin Logout ---
function handleAdminLogout() {
  currentLoggedInEmail = null;
  currentLoggedInTeacherData = null;
  sessionStorage.removeItem("loggedInAdminEmail");
  showSection("login-section");
  document.getElementById("login-form").reset();
  history.replaceState(null, "", window.location.pathname); // Clear hash on logout
  showToast("Anda telah logout.", "info");
}

// openStudentModal dipertahankan karena modal masih ada untuk menambah/mengedit siswa melalui cara lain jika diperlukan.
function openStudentModal(isEdit = false, nis = null) {
  const modal = document.getElementById("student-modal");
  const title = modal.querySelector("#student-modal-title");
  const form = modal.querySelector("#student-form");
  form.reset(); // Hapus data sebelumnya
  document.getElementById("student-nis").readOnly = false; // NIS bisa diedit untuk yang baru

  if (isEdit) {
    title.textContent = "Edit Data Siswa";
    const student = dataCache.siswa.find((s) => s.NIS === nis);
    if (student) {
      document.getElementById("student-nis").value = student.NIS;
      document.getElementById("student-nis").readOnly = true; // NIS tidak bisa diedit untuk edit
      document.getElementById("student-nama").value = student.Nama;
      document.getElementById("student-kelas").value = student.Kelas;
      document.getElementById("student-wali_murid").value = student.Wali_Murid;
    }
  } else {
    title.textContent = "Tambah Siswa Baru";
  }
  modal.classList.add("active");
}

// --- Login Handler ---
async function handleLogin(event) {
  event.preventDefault();
  showLoadingOverlay();

  const email = document.getElementById("email-input").value;

  try {
    // Hanya periksa sheet Guru untuk login guru
    // Ini adalah satu-satunya panggilan jaringan untuk data Guru saat login.
    dataCache.guru = await fetchSheetData("Guru");
    const isTeacher = dataCache.guru.some((teacher) => teacher.Email === email);
    currentLoggedInTeacherData =
      dataCache.guru.find((teacher) => teacher.Email === email) || null;

    if (isTeacher) {
      currentLoggedInEmail = email;
      sessionStorage.setItem("loggedInAdminEmail", email); // Masih gunakan "loggedInAdminEmail" untuk konsistensi dengan logika logout yang ada
      showToast("Login berhasil!", "success");

      // Panggil fungsi inisialisasi dashboard awal.
      // Fungsi ini TIDAK AKAN melakukan fetch data Guru lagi karena sudah ada di dataCache.
      await fetchInitialDashboardData();

      // Putuskan dashboard mana yang akan ditampilkan secara default (sekarang selalu dashboard guru jika valid)
      showSection("guru-dashboard-section");
      console.log(
        "handleLogin: Memanggil showSection untuk guru-dashboard-section"
      );
    } else {
      showToast("Email tidak ditemukan. Silakan coba lagi.", "error");
    }
  } catch (error) {
    console.error("Login error:", error);
    showToast("Terjadi kesalahan saat login. Silakan coba lagi.", "error");
  } finally {
    hideLoadingOverlay();
  }
}

// --- Tampilan Identitas Guru ---
function displayTeacherIdentity(teacherData) {
  if (teacherData) {
    document.getElementById("guru-name-display").textContent =
      teacherData.Nama_Guru || "Guru";
    document.getElementById("detail-nama-guru").textContent =
      teacherData.Nama_Guru || "-";
    document.getElementById("detail-mata-pelajaran").textContent =
      teacherData.Mata_Pelajaran || "-";
    document.getElementById("detail-kelas-diampu").textContent =
      teacherData.Kelas_Diampu || "-";
    document.getElementById("detail-email-guru").textContent =
      teacherData.Email || "-";
  }
}

// --- Pengambilan Data Awal untuk Dashboard (Tidak termasuk data operasional) ---
async function fetchInitialDashboardData() {
  console.log(
    "--> Memulai pengambilan data dashboard awal (hanya Guru yang sudah di-cache)..."
  );
  // dataCache.admin_users tidak lagi diambil di sini
  // dataCache.guru sudah diisi oleh handleLogin. TIDAK PERLU fetch ulang.
  console.log(
    "    Data Guru sudah ada di cache. Menggunakan data yang di-cache."
  );

  // Data Siswa, Tugas, Nilai, Kehadiran, Catatan_Guru, Jadwal_Pelajaran, Pengumuman
  // TIDAK diambil di sini. Akan dimuat sesuai permintaan (on-demand).
  console.log(
    "    Data Siswa dan operasional lainnya TIDAK diambil saat login. Akan dimuat on-demand."
  );

  // Isi identitas guru menggunakan data yang sudah di-cache
  if (currentLoggedInEmail) {
    currentLoggedInTeacherData =
      dataCache.guru.find(
        (teacher) => teacher.Email === currentLoggedInEmail
      ) || null;
    displayTeacherIdentity(currentLoggedInTeacherData);
  }
  console.log("<-- Pengambilan data dashboard awal selesai.");
}

// --- Fungsi Pembuatan ID ---
function generateTugasId(mapel) {
  const prefix = SUBJECT_ABBREVIATIONS[mapel] || "TGS";
  const numTugas = dataCache.tugas ? dataCache.tugas.length : 0;
  return `${prefix}-${String(numTugas + 1).padStart(3, "0")}`;
}

function generateNilaiId(nis) {
  const numNilai = dataCache.nilai ? dataCache.nilai.length : 0;
  return `NIL-${nis}-${String(numNilai + 1).padStart(3, "0")}`;
}

function generateKehadiranId(nis, dateStr) {
  const formattedDate = dateStr.replace(/-/g, ""); //YYYYMMDD
  const numKehadiran = dataCache.kehadiran ? dataCache.kehadiran.length : 0;
  return `KHD-${formattedDate}-${String(numKehadiran + 1).padStart(3, "0")}`;
}

function generateCatatanId(nis, mingguKe) {
  const numCatatan = dataCache.catatan_guru ? dataCache.catatan_guru.length : 0;
  return `CST-${nis}-${String(mingguKe).padStart(2, "0")}-${String(
    numCatatan + 1
  ).padStart(3, "0")}`;
}

function generateJadwalId(kelas, hari) {
  const classAbbr = kelas.replace(/\s/g, "");
  const dayAbbr = hari.substring(0, 3).toUpperCase();
  const numJadwal = dataCache.jadwal_pelajaran
    ? dataCache.jadwal_pelajaran.length
    : 0;
  return `JWL-${classAbbr}-${dayAbbr}-${String(numJadwal + 1).padStart(
    3,
    "0"
  )}`;
}

function generatePengumumanId() {
  const numPengumuman = dataCache.pengumuman ? dataCache.pengumuman.length : 0;
  return `PGM-${String(numPengumuman + 1).padStart(3, "0")}`;
}

// --- Pengisian Dropdown Dinamis (Disesuaikan untuk formulir spesifik) ---
function populateSiswaDropdownsGuru() {
  // Untuk Catatan Guru
  const nisSelect = document.getElementById("catatan-nis");
  if (nisSelect) {
    const currentSelectedValue = nisSelect.value;
    nisSelect.innerHTML = '<option value="">Pilih Siswa (NIS - Nama)</option>';
    if (dataCache.siswa) {
      dataCache.siswa.forEach((siswa) => {
        const option = document.createElement("option");
        option.value = siswa.NIS;
        option.textContent = `${siswa.NIS} - ${siswa.Nama}`;
        nisSelect.appendChild(option);
      });
    }
    if (
      currentSelectedValue &&
      nisSelect.querySelector(`option[value="${currentSelectedValue}"]`)
    ) {
      nisSelect.value = currentSelectedValue;
    }
  }
}

function populateSiswaDropdownsInput() {
  // Untuk Nilai dan Kehadiran
  const nisSelects = document.querySelectorAll("#nilai-nis, #kehadiran-nis");
  nisSelects.forEach((select) => {
    const currentSelectedValue = select.value;
    select.innerHTML = '<option value="">Pilih Siswa (NIS - Nama)</option>';
    if (dataCache.siswa) {
      dataCache.siswa.forEach((siswa) => {
        const option = document.createElement("option");
        option.value = siswa.NIS;
        option.textContent = `${siswa.NIS} - ${siswa.Nama}`;
        select.appendChild(option);
      });
    }
    if (
      currentSelectedValue &&
      select.querySelector(`option[value="${currentSelectedValue}"]`)
    ) {
      select.value = currentSelectedValue;
    }
  });
}

function populateTugasDropdownsInput() {
  // Untuk Nilai
  const idTugasSelect = document.getElementById("nilai-id_tugas");
  const currentSelectedValue = idTugasSelect ? idTugasSelect.value : "";
  if (idTugasSelect) {
    idTugasSelect.innerHTML =
      '<option value="">Pilih Tugas (ID - Nama Tugas)</option>';
    if (dataCache.tugas) {
      dataCache.tugas.forEach((tugas) => {
        const option = document.createElement("option");
        option.value = tugas.ID_Tugas;
        option.textContent = `${tugas.ID_Tugas} - ${tugas.Nama_Tugas}`;
        idTugasSelect.appendChild(option);
      });
    }
    if (
      currentSelectedValue &&
      idTugasSelect.querySelector(`option[value="${currentSelectedValue}"]`)
    ) {
      idTugasSelect.value = currentSelectedValue;
    }
  }
}

function populateMapelDropdownsGuru() {
  // Untuk Tugas dan Jadwal
  const tugasMapelSelect = document.getElementById("tugas-mata_pelajaran");
  const jadwalMapelSelect = document.getElementById("jadwal-mata_pelajaran");

  const currentTugasMapel = tugasMapelSelect ? tugasMapelSelect.value : "";
  const currentJadwalMapel = jadwalMapelSelect ? jadwalMapelSelect.value : "";

  if (tugasMapelSelect) {
    tugasMapelSelect.innerHTML =
      '<option value="">Pilih Mata Pelajaran</option>';
  }
  if (jadwalMapelSelect) {
    jadwalMapelSelect.innerHTML =
      '<option value="">Pilih Mata Pelajaran</option>';
  }

  HARDCODED_SUBJECTS.forEach((subject) => {
    if (tugasMapelSelect) {
      const option1 = document.createElement("option");
      option1.value = subject;
      option1.textContent = subject;
      tugasMapelSelect.appendChild(option1);
    }

    if (jadwalMapelSelect) {
      const option2 = document.createElement("option");
      option2.value = subject;
      option2.textContent = subject;
      jadwalMapelSelect.appendChild(option2);
    }
  });

  if (
    tugasMapelSelect &&
    currentTugasMapel &&
    tugasMapelSelect.querySelector(`option[value="${currentTugasMapel}"]`)
  ) {
    tugasMapelSelect.value = currentTugasMapel;
  }
  if (
    jadwalMapelSelect &&
    currentJadwalMapel &&
    jadwalMapelSelect.querySelector(`option[value="${currentJadwalMapel}"]`)
  ) {
    jadwalMapelSelect.value = currentJadwalMapel;
  }
}

// --- Pembaruan Bidang ID (Digabungkan dan disesuaikan) ---
function updateTugasIdField() {
  const tugasMapel = document.getElementById("tugas-mata_pelajaran")?.value;
  const tugasIdField = document.getElementById("tugas-id_tugas");
  if (tugasIdField) {
    tugasIdField.value = generateTugasId(tugasMapel || "");
  }
}

function updateNilaiIdField() {
  const nilaiNis = document.getElementById("nilai-nis")?.value;
  const nilaiIdField = document.getElementById("nilai-id_nilai");
  if (nilaiIdField) {
    if (nilaiNis) {
      nilaiIdField.value = generateNilaiId(nilaiNis);
    } else {
      nilaiIdField.value = "Pilih Siswa";
    }
  }
}

function updateKehadiranIdField() {
  const kehadiranNis = document.getElementById("kehadiran-nis")?.value;
  const kehadiranTanggal = document.getElementById("kehadiran-tanggal")?.value;
  const kehadiranIdField = document.getElementById("kehadiran-id_kehadiran");
  if (kehadiranIdField) {
    if (kehadiranNis && kehadiranTanggal) {
      kehadiranIdField.value = generateKehadiranId(
        kehadiranNis,
        kehadiranTanggal
      );
    } else {
      kehadiranIdField.value = "Pilih Siswa dan Tanggal";
    }
  }
}

function updateCatatanIdField() {
  const catatanNis = document.getElementById("catatan-nis")?.value;
  const catatanMingguKe = document.getElementById("catatan-minggu_ke")?.value;
  const catatanIdField = document.getElementById("catatan-id_catatan");
  if (catatanIdField) {
    if (catatanNis && catatanMingguKe) {
      catatanIdField.value = generateCatatanId(catatanNis, catatanMingguKe);
    } else {
      catatanIdField.value = "Pilih Siswa dan Minggu";
    }
  }
}

function updateJadwalIdField() {
  const jadwalKelas = document.getElementById("jadwal-kelas")?.value;
  const jadwalHari = document.getElementById("jadwal-hari")?.value;
  const jadwalIdField = document.getElementById("jadwal-id_jadwal");
  if (jadwalIdField) {
    if (jadwalKelas && jadwalHari) {
      jadwalIdField.value = generateJadwalId(jadwalKelas, jadwalHari);
    } else {
      jadwalIdField.value = "Masukkan Kelas dan Hari";
    }
  }
}

function updatePengumumanIdField() {
  const pengumumanIdField = document.getElementById("pengumuman-id_pengumuman");
  if (pengumumanIdField) {
    pengumumanIdField.value = generatePengumumanId();
  }
}

// --- Penangan Modal (Digabungkan untuk modal yang tersisa) ---
// Fungsi ini sekarang HANYA akan menangani 'student-modal', 'nilai-modal', 'kehadiran-modal'
function openModal(modalId, isEdit = false, data = null) {
  const modal = document.getElementById(modalId);
  if (!modal) {
    console.warn(
      `openModal: Elemen modal dengan ID '${modalId}' tidak ditemukan.`
    );
    return; // Keluar jika elemen modal tidak ditemukan
  }

  // Pastikan itu adalah salah satu jenis modal *aktual* yang diharapkan oleh fungsi ini
  const validModalIds = ["student-modal", "nilai-modal", "kehadiran-modal"];
  if (!validModalIds.includes(modalId)) {
    console.error(
      `openModal: Fungsi dipanggil dengan ID tidak terduga '${modalId}'. Fungsi ini hanya menangani: ${validModalIds.join(
        ", "
      )}.`
    );
    return; // Keluar jika ID bukan salah satu modal yang diharapkan
  }

  const modalContent = modal.querySelector(".modal-content");
  if (!modalContent) {
    console.error(
      `openModal: Modal dengan ID '${modalId}' ditemukan, tetapi tidak berisi elemen dengan kelas 'modal-content'.`
    );
    return; // Keluar jika .modal-content tidak ada
  }

  const titleElement = modalContent.querySelector("h3");
  const form = modalContent.querySelector("form");

  if (!titleElement) {
    console.error(
      `openModal: Konten modal untuk ID '${modalId}' ditemukan, tetapi tidak berisi elemen h3.`
    );
    // Lanjutkan tanpa mengatur judul jika h3 tidak ada, untuk menghindari pemblokiran
  }
  if (!form) {
    console.error(
      `openModal: Konten modal untuk ID '${modalId}' ditemukan, tetapi tidak berisi elemen form.`
    );
    return; // Modal tanpa formulir mungkin tidak berfungsi, jadi keluar.
  }

  form.reset(); // Reset bidang formulir

  if (titleElement) {
    // Hanya atur teks jika titleElement ditemukan
    let defaultTitle = `Tambah ${modalId
      .replace("-modal", "")
      .replace("guru-data-", "")
      .replace("input-", "")}`;
    titleElement.textContent = defaultTitle;
  }

  // Logika spesifik untuk setiap modal
  switch (modalId) {
    case "student-modal":
      document.getElementById("student-nis").readOnly = false;
      if (isEdit && data) {
        if (titleElement) titleElement.textContent = "Edit Data Siswa";
        document.getElementById("student-nis").value = data.NIS;
        document.getElementById("student-nis").readOnly = true;
        document.getElementById("student-nama").value = data.Nama;
        document.getElementById("student-kelas").value = data.Kelas;
        document.getElementById("student-wali_murid").value = data.Wali_Murid;
      }
      break;
    case "nilai-modal":
      updateNilaiIdField();
      populateSiswaDropdownsInput(); // Pastikan dropdown siswa segar untuk nilai
      populateTugasDropdownsInput(); // Pastikan dropdown tugas segar untuk nilai
      break;
    case "kehadiran-modal":
      updateKehadiranIdField();
      populateSiswaDropdownsInput(); // Pastikan dropdown siswa segar untuk kehadiran
      break;
  }
  modal.classList.add("active");
}

// Fungsi ini sekarang HANYA akan menangani 'student-modal', 'nilai-modal', 'kehadiran-modal'
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return; // Klausa penjaga

  modal.classList.remove("active");

  // Isi ulang dropdown yang relevan setelah ditutup untuk memastikan mereka mencerminkan data terbaru untuk input berikutnya
  switch (modalId) {
    case "student-modal":
      break;
    case "nilai-modal":
      populateSiswaDropdownsInput();
      populateTugasDropdownsInput();
      break;
    case "kehadiran-modal":
      populateSiswaDropdownsInput();
      break;
    default:
      console.warn(
        `closeModal dipanggil untuk ID yang tidak terduga: ${modalId}`
      );
      break;
  }
}

// Fungsi baru untuk mengalihkan visibilitas formulir inline
function toggleInlineForm(formContainerId, show = null) {
  const formContainer = document.getElementById(formContainerId);
  if (!formContainer) {
    console.error(
      `Kontainer formulir dengan ID '${formContainerId}' tidak ditemukan.`
    );
    return;
  }

  if (show === true) {
    formContainer.classList.remove("section-hidden");
  } else if (show === false) {
    formContainer.classList.add("section-hidden");
    formContainer.querySelector("form").reset(); // Reset formulir saat disembunyikan
  } else {
    // Perilaku alih
    formContainer.classList.toggle("section-hidden");
    if (formContainer.classList.contains("section-hidden")) {
      formContainer.querySelector("form").reset(); // Reset saat disembunyikan
    }
  }
}

async function handleSubmitForm(event, sheetName, formType = "add") {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const data = {};

  const inputs = form.querySelectorAll(
    "input[id^='" +
      sheetName.toLowerCase().replace(/_/, "-") +
      "-'], select[id^='" +
      sheetName.toLowerCase().replace(/_/, "-") +
      "-'], textarea[id^='" +
      sheetName.toLowerCase().replace(/_/, "-") +
      "-']"
  );

  inputs.forEach((input) => {
    const headerKey = input.id
      .replace(sheetName.toLowerCase().replace(/_/, "-") + "-", "")
      .replace(/-/g, "_")
      .split("_")
      .map((word, index) =>
        index === 0
          ? word.charAt(0).toUpperCase() + word.slice(1)
          : word.charAt(0).toUpperCase() + word.slice(1)
      )
      .join("_");

    data[headerKey] = input.value;
  });

  let result;
  showLoadingOverlay(); // Pertahankan overlay untuk pengiriman, karena ini adalah panggilan jaringan yang memblokir
  try {
    if (formType === "add") {
      result = await postSheetData(sheetName, data);
    } else if (formType === "edit") {
      // Untuk mengedit data siswa, NIS (atau ID yang relevan) sudah ada di `data`
      result = await updateSheetData(sheetName, "NIS", data);
    }
  } finally {
    // hideLoadingOverlay() akan dipanggil setelah pembaruan data.
  }

  if (result.success) {
    // Tentukan apakah itu formulir inline atau modal untuk ditutup
    const parentContainer =
      form.closest(".modal") ||
      form.closest("div[id$='-inline-form-container']");
    if (parentContainer) {
      if (parentContainer.classList.contains("modal")) {
        closeModal(parentContainer.id);
      } else {
        toggleInlineForm(parentContainer.id, false);
      }
    }

    try {
      // Hanya ambil ulang dataCache spesifik yang diperbarui
      switch (sheetName) {
        case "Siswa":
          dataCache.siswa = await fetchSheetData("Siswa");
          populateSiswaDropdownsInput(); // Refresh dropdown siswa di Nilai/Kehadiran
          populateSiswaDropdownsGuru(); // Refresh dropdown siswa di Catatan Guru
          break;
        case "Tugas":
          dataCache.tugas = await fetchSheetData("Tugas");
          populateTugasDropdownsInput(); // Refresh dropdown tugas di Nilai
          // Tidak perlu memanggil updateTugasIdField di sini, itu dipanggil saat tombol 'Tambah' diklik
          break;
        case "Nilai":
          dataCache.nilai = await fetchSheetData("Nilai");
          updateNilaiIdField(); // Pastikan ID berikutnya benar
          if (activeSectionId === "rekap-data-section") {
            renderRekapNilaiTable();
          }
          break;
        case "Kehadiran":
          dataCache.kehadiran = await fetchSheetData("Kehadiran");
          updateKehadiranIdField(); // Pastikan ID berikutnya benar
          break;
        case "Catatan_Guru":
          dataCache.catatan_guru = await fetchSheetData("Catatan_Guru");
          // Tidak perlu memanggil updateCatatanIdField di sini
          break;
        case "Jadwal_Pelajaran":
          dataCache.jadwal_pelajaran = await fetchSheetData("Jadwal_Pelajaran");
          // Tidak perlu memanggil updateJadwalIdField di sini
          break;
        case "Pengumuman":
          dataCache.pengumuman = await fetchSheetData("Pengumuman");
          // Tidak perlu memanggil updatePengumumanIdField di sini
          break;
        default:
          console.warn(
            `sheetName tidak tertangani di handleSubmitForm refresh: ${sheetName}`
          );
          // Jika sheet tidak ditangani secara eksplisit di atas, lakukan pembaruan data dashboard awal penuh
          await fetchInitialDashboardData();
      }
    } catch (refreshError) {
      console.error(
        "Error selama pembaruan data parsial setelah pengiriman:",
        refreshError
      );
      showToast(
        "Terjadi kesalahan saat memperbarui data setelah simpan.",
        "error"
      );
    } finally {
      hideLoadingOverlay(); // Sembunyikan overlay setelah semua operasi refresh selesai
    }
  } else {
    hideLoadingOverlay(); // Sembunyikan overlay jika pengiriman gagal
  }
}

// --- Logika Rekap Data Nilai ---
const rekapNisFilter = document.getElementById("rekap-nis-filter");
const rekapMapelFilter = document.getElementById("rekap-mapel-filter");
const rekapStatusFilter = document.getElementById("rekap-status-filter");
const rekapNilaiTableBody = document.getElementById("rekap-nilai-table-body");
const noRekapDataMessage = document.getElementById("no-rekap-data-message");

function populateRekapFilters() {
  // Isi filter NIS/Nama
  const currentNisFilter = rekapNisFilter.value;
  rekapNisFilter.innerHTML = '<option value="all">Semua Siswa</option>';
  // Urutkan siswa berdasarkan Nama untuk UX yang lebih baik
  const sortedSiswa = [...dataCache.siswa].sort((a, b) =>
    a.Nama.localeCompare(b.Nama)
  );
  const uniqueNis = [...new Set(sortedSiswa.map((s) => s.NIS))]; // Pertahankan NIS unik berdasarkan nama yang diurutkan

  uniqueNis.forEach((nis) => {
    const student = dataCache.siswa.find((s) => s.NIS === nis);
    const option = document.createElement("option");
    option.value = nis;
    option.textContent = `${nis} - ${
      student ? student.Nama : "Nama tidak ditemukan"
    }`;
    rekapNisFilter.appendChild(option);
  });
  if (
    currentNisFilter &&
    rekapNisFilter.querySelector(`option[value="${currentNisFilter}"]`)
  ) {
    rekapNisFilter.value = currentNisFilter;
  }

  // Isi filter Mata Pelajaran
  const currentMapelFilter = rekapMapelFilter.value;
  rekapMapelFilter.innerHTML =
    '<option value="all">Semua Mata Pelajaran</option>';
  HARDCODED_SUBJECTS.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    rekapMapelFilter.appendChild(option);
  });
  if (
    currentMapelFilter &&
    rekapMapelFilter.querySelector(`option[value="${currentMapelFilter}"]`)
  ) {
    rekapMapelFilter.value = currentMapelFilter;
  }

  // Filter Status bersifat statis di HTML, tidak perlu diisi di sini.
}

function renderRekapNilaiTable() {
  rekapNilaiTableBody.innerHTML = ""; // Bersihkan isi tabel sebelum merender
  // Pastikan dataCache.nilai diisi sebelum merender
  if (!dataCache.nilai || dataCache.nilai.length === 0) {
    noRekapDataMessage.classList.remove("section-hidden");
    noRekapDataMessage.textContent =
      "Data nilai belum dimuat atau tidak ada data.";
    return;
  }

  let filteredData = dataCache.nilai;

  const nisFilter = rekapNisFilter.value;
  const mapelFilter = rekapMapelFilter.value;
  const statusFilter = rekapStatusFilter.value;

  filteredData = filteredData.filter((nilai) => {
    const student = dataCache.siswa.find((s) => s.NIS === nilai.NIS);
    const tugas = dataCache.tugas.find((t) => t.ID_Tugas === nilai.ID_Tugas);

    // Lewati jika data siswa atau tugas tidak ada (data salah bentuk)
    if (!student || !tugas) {
      console.warn(
        `Melewati entri nilai karena data siswa atau tugas tidak ditemukan: ${JSON.stringify(
          nilai
        )}`
      );
      return false;
    }

    const matchesNis = nisFilter === "all" || nilai.NIS === nisFilter;
    const matchesMapel =
      mapelFilter === "all" || tugas.Mata_Pelajaran === mapelFilter;
    const matchesStatus =
      statusFilter === "all" || nilai.Status_Pengerjaan === statusFilter;

    return matchesNis && matchesMapel && matchesStatus;
  });

  if (filteredData.length === 0) {
    noRekapDataMessage.classList.remove("section-hidden");
    noRekapDataMessage.textContent =
      "Tidak ada data nilai ditemukan dengan filter ini.";
    return;
  }
  noRekapDataMessage.classList.add("section-hidden");

  filteredData.forEach((nilai) => {
    const student = dataCache.siswa.find((s) => s.NIS === nilai.NIS);
    const tugas = dataCache.tugas.find((t) => t.ID_Tugas === nilai.ID_Tugas);

    const row = rekapNilaiTableBody.insertRow();
    row.className = "hover:bg-gray-50";
    row.innerHTML = `
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${
        nilai.NIS
      }</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${
        student ? student.Nama : "N/A"
      }</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${
        tugas ? tugas.Mata_Pelajaran : "N/A"
      }</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${
        tugas ? tugas.Nama_Tugas : "N/A"
      }</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${
        nilai.Nilai
      }</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${
        nilai.Status_Pengerjaan
      }</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${
        nilai.Tanggal_Input
      }</td>
    `;
  });
}

// --- Event Listener ---
function addAllEventListeners() {
  // Login Form
  document
    .getElementById("login-form")
    ?.addEventListener("submit", handleLogin);

  // Sidebar Buttons
  document.querySelectorAll(".sidebar-button").forEach((button) => {
    button.addEventListener("click", (e) => {
      const targetSection = e.currentTarget.dataset.targetSection;
      showSection(targetSection);
    });
  });

  // Logout Button
  document
    .getElementById("logout-admin-btn")
    ?.addEventListener("click", handleAdminLogout);

  // student-form submit listener: The modal still exists, so the form listener is kept, but it will only be triggered if some other part of the app calls openModal('student-modal')
  document
    .getElementById("student-form")
    ?.addEventListener("submit", (e) =>
      handleSubmitForm(
        e,
        "Siswa",
        e.target.querySelector("#student-nis").readOnly ? "edit" : "add"
      )
    );

  // Guru Dashboard (Teacher Inputs) Events
  document
    .getElementById("refresh-guru-data-btn")
    ?.addEventListener("click", () => {
      showLoadingOverlay();
      // Pemicu ulang pemuatan bagian untuk memastikan data awal (Guru) segar
      showSection("guru-dashboard-section").finally(hideLoadingOverlay);
    });

  // Manajemen Data Events (Bagian Baru)
  document
    .getElementById("refresh-manajemen-data-btn")
    ?.addEventListener("click", () => {
      // Untuk refresh, tampilkan overlay penuh karena ini adalah tindakan eksplisit pengguna untuk me-refresh semua data di bagian ini.
      showLoadingOverlay();
      // Pemicu ulang pemuatan bagian untuk mengambil/refresh semua data yang dibutuhkan untuk bagian ini
      showSection("manajemen-data-section").finally(hideLoadingOverlay);
    });
  const manajemenTabButtons = document.querySelectorAll(
    "#manajemen-data-section .tab-button"
  );
  manajemenTabButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      switchTab(event.target.dataset.target, "manajemen-data-section");
    });
  });

  // Formulir Inline Tugas
  document.getElementById("add-tugas-btn")?.addEventListener("click", () => {
    toggleInlineForm("tugas-inline-form-container", true);
    updateTugasIdField();
    populateMapelDropdownsGuru(); // Pastikan dropdown segar
  });
  document
    .getElementById("cancel-tugas-btn")
    ?.addEventListener("click", () =>
      toggleInlineForm("tugas-inline-form-container", false)
    );
  document
    .getElementById("tugas-form")
    ?.addEventListener("submit", (e) => handleSubmitForm(e, "Tugas"));
  document
    .getElementById("tugas-mata_pelajaran")
    ?.addEventListener("change", updateTugasIdField);

  // Formulir Inline Catatan Guru
  document
    .getElementById("add-catatan-guru-btn")
    ?.addEventListener("click", () => {
      toggleInlineForm("catatan-inline-form-container", true);
      updateCatatanIdField();
      populateSiswaDropdownsGuru(); // Pastikan dropdown segar
    });
  document
    .getElementById("cancel-catatan-btn")
    ?.addEventListener("click", () =>
      toggleInlineForm("catatan-inline-form-container", false)
    );
  document
    .getElementById("catatan-form")
    ?.addEventListener("submit", (e) => handleSubmitForm(e, "Catatan_Guru"));
  document
    .getElementById("catatan-nis")
    ?.addEventListener("change", updateCatatanIdField);
  document
    .getElementById("catatan-minggu_ke")
    ?.addEventListener("input", updateCatatanIdField);

  // Formulir Inline Jadwal Pelajaran
  document
    .getElementById("add-jadwal-pelajaran-btn")
    ?.addEventListener("click", () => {
      toggleInlineForm("jadwal-inline-form-container", true);
      updateJadwalIdField();
      if (currentLoggedInTeacherData) {
        document.getElementById("jadwal-guru").value =
          currentLoggedInTeacherData.Nama_Guru || "";
        document.getElementById("jadwal-guru").readOnly = true;
        document
          .getElementById("jadwal-guru")
          .classList.add("bg-gray-100", "cursor-not-allowed");
      }
      populateMapelDropdownsGuru(); // Pastikan dropdown segar
    });
  document
    .getElementById("cancel-jadwal-btn")
    ?.addEventListener("click", () =>
      toggleInlineForm("jadwal-inline-form-container", false)
    );
  document
    .getElementById("jadwal-form")
    ?.addEventListener("submit", (e) =>
      handleSubmitForm(e, "Jadwal_Pelajaran")
    );
  document
    .getElementById("jadwal-kelas")
    ?.addEventListener("input", updateJadwalIdField);
  document
    .getElementById("jadwal-hari")
    ?.addEventListener("change", updateJadwalIdField);

  // Formulir Inline Pengumuman
  document
    .getElementById("add-pengumuman-btn")
    ?.addEventListener("click", () => {
      toggleInlineForm("pengumuman-inline-form-container", true);
      updatePengumumanIdField();
    });
  document
    .getElementById("cancel-pengumuman-btn")
    ?.addEventListener("click", () =>
      toggleInlineForm("pengumuman-inline-form-container", false)
    );
  document
    .getElementById("pengumuman-form")
    ?.addEventListener("submit", (e) => handleSubmitForm(e, "Pengumuman"));

  // Input Nilai & Kehadiran Events
  document
    .getElementById("refresh-input-data-btn")
    ?.addEventListener("click", () => {
      // Untuk refresh, tampilkan overlay penuh karena ini adalah tindakan eksplisit pengguna untuk me-refresh semua data di bagian ini.
      showLoadingOverlay();
      // Pemicu ulang pemuatan bagian untuk mengambil/refresh semua data yang dibutuhkan untuk bagian ini
      showSection("input-nilai-kehadiran-section").finally(hideLoadingOverlay);
    });
  const inputTabButtons = document.querySelectorAll(
    "#input-nilai-kehadiran-section .tab-button"
  );
  inputTabButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      switchTab(event.target.dataset.target, "input-nilai-kehadiran-section");
    });
  });
  // Modal Nilai
  document
    .getElementById("open-nilai-modal-btn")
    ?.addEventListener("click", () => openModal("nilai-modal"));
  document
    .getElementById("nilai-form")
    ?.addEventListener("submit", (e) => handleSubmitForm(e, "Nilai"));
  document
    .getElementById("nilai-nis")
    ?.addEventListener("change", updateNilaiIdField);
  document
    .getElementById("nilai-id_tugas")
    ?.addEventListener("change", updateNilaiIdField);
  // Modal Kehadiran
  document
    .getElementById("open-kehadiran-modal-btn")
    ?.addEventListener("click", () => openModal("kehadiran-modal"));
  document
    .getElementById("kehadiran-form")
    ?.addEventListener("submit", (e) => handleSubmitForm(e, "Kehadiran"));
  document
    .getElementById("kehadiran-nis")
    ?.addEventListener("change", updateKehadiranIdField);
  document
    .getElementById("kehadiran-tanggal")
    ?.addEventListener("change", updateKehadiranIdField);

  // Rekap Data Nilai Events
  document
    .getElementById("refresh-rekap-btn")
    ?.addEventListener("click", async () => {
      showLoadingOverlay(); // Tampilkan overlay penuh untuk refresh rekap eksplisit
      console.log(
        "--> Menyegarkan Rekap Data. Secara eksplisit mengambil data Nilai, Siswa, Tugas."
      );
      // Ambil nilai, siswa, dan data tugas secara eksplisit untuk rekap saat me-refresh
      dataCache.nilai = await fetchSheetData("Nilai");
      dataCache.siswa = await fetchSheetData("Siswa");
      dataCache.tugas = await fetchSheetData("Tugas");
      populateRekapFilters(); // Isi ulang filter dengan data baru yang mungkin
      renderRekapNilaiTable(); // Render ulang tabel
      hideLoadingOverlay();
      console.log("<-- Rekap Data disegarkan.");
    });
  document
    .getElementById("apply-rekap-filter-btn")
    ?.addEventListener("click", renderRekapNilaiTable);
  rekapNisFilter?.addEventListener("change", renderRekapNilaiTable);
  rekapMapelFilter?.addEventListener("change", renderRekapNilaiTable);
  rekapStatusFilter?.addEventListener("change", renderRekapNilaiTable);

  // Tombol tutup untuk semua modal
  document.querySelectorAll(".modal-close-button").forEach((button) => {
    button.addEventListener("click", (e) => {
      const modal = e.target.closest(".modal");
      if (modal) {
        closeModal(modal.id);
      }
    });
  });

  // Tutup modal saat mengklik di luar (pada backdrop modal)
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        // Periksa apakah klik langsung pada backdrop modal
        closeModal(modal.id);
      }
    });
  });

  // Toggle sidebar untuk seluler
  const sidebar = document.querySelector(".sidebar");
  const sidebarToggleBtn = document.getElementById("sidebar-toggle-btn");
  const sidebarOverlay = document.getElementById("sidebar-overlay");
  const mainContentWrapper = document.querySelector(".main-content-wrapper");

  if (sidebarToggleBtn && sidebar && sidebarOverlay && mainContentWrapper) {
    sidebarToggleBtn.addEventListener("click", () => {
      sidebar.classList.toggle("active");
      sidebarOverlay.classList.toggle("active");
      mainContentWrapper.classList.toggle("sidebar-active");
    });

    sidebarOverlay.addEventListener("click", () => {
      sidebar.classList.remove("active");
      sidebarOverlay.classList.remove("active");
      mainContentWrapper.classList.remove("sidebar-active");
    });
  }

  // Tangani tombol maju/mundur browser untuk perubahan hash
  window.addEventListener("hashchange", () => {
    const hash = window.location.hash.substring(1); // Hapus '#'
    if (hash && document.getElementById(hash)) {
      // Hanya tampilkan jika pengguna masuk
      if (currentLoggedInEmail) {
        // Pastikan hanya bagian yang diizinkan yang dapat dinavigasi melalui hash
        const allowedGuruSections = [
          "guru-dashboard-section",
          "manajemen-data-section",
          "input-nilai-kehadiran-section",
          "rekap-data-section",
        ];
        if (allowedSections.includes(hash)) {
          showSection(hash); // Ini akan memicu pengambilan data spesifik untuk setiap bagian
        } else {
          showSection("guru-dashboard-section"); // Hash tidak valid, pergi ke default
          history.replaceState(
            null,
            "",
            window.location.pathname + "#guru-dashboard-section"
          );
        }
      } else {
        // Jika tidak masuk, paksa bagian login dan hapus hash
        showSection("login-section");
        history.replaceState(null, "", window.location.pathname);
      }
    } else if (currentLoggedInEmail) {
      // Jika tidak ada hash yang valid tetapi sudah masuk, arahkan ke dashboard guru default
      showSection("guru-dashboard-section");
      history.replaceState(
        null,
        "",
        window.location.pathname + "#guru-dashboard-section"
      );
    } else {
      // Jika tidak ada hash dan tidak masuk, pastikan bagian login ditampilkan
      showSection("login-section");
    }
  });
}

// --- Logika Inisialisasi Utama ---
document.addEventListener("DOMContentLoaded", async () => {
  addAllEventListeners(); // Pasang semua event listener setelah DOM siap
  updateHeaderTitle("login-section"); // Atur judul header awal

  const loggedInEmailFromSession = sessionStorage.getItem("loggedInAdminEmail");
  if (loggedInEmailFromSession) {
    currentLoggedInEmail = loggedInEmailFromSession;
    showLoadingOverlay();
    try {
      // Ambil data Guru untuk autentikasi ulang dan dapatkan info guru
      // Pengambilan fetchSheetData("Admin_Users") telah dihapus dari sini untuk efisiensi
      dataCache.guru = await fetchSheetData("Guru");
      currentLoggedInTeacherData =
        dataCache.guru.find(
          (teacher) => teacher.Email === currentLoggedInEmail
        ) || null;

      // Tidak lagi memeriksa isAdminUser di sini, karena dashboard ini untuk guru
      const isTeacherUser = currentLoggedInTeacherData !== null;

      if (isTeacherUser) {
        showToast("Sesi dipulihkan. Selamat datang kembali!", "info");
        // Hanya ambil data inti yang dibutuhkan untuk login dan identitas guru.
        // Data operasional lainnya akan diambil sesuai permintaan oleh showSection.
        await fetchInitialDashboardData();

        // Periksa hash URL untuk navigasi langsung, jika tidak, default ke dashboard guru
        const hash = window.location.hash.substring(1);
        const defaultSection = "guru-dashboard-section"; // Selalu default ke dashboard guru

        if (hash && document.getElementById(hash)) {
          const allowedSections = [
            "guru-dashboard-section",
            "manajemen-data-section",
            "input-nilai-kehadiran-section",
            "rekap-data-section",
          ];
          if (allowedSections.includes(hash)) {
            showSection(hash); // Ini akan memicu pengambilan data spesifik untuk setiap bagian
          } else {
            showSection(defaultSection); // Hash tidak valid, pergi ke default
            history.replaceState(
              null,
              "",
              window.location.pathname + "#" + defaultSection
            );
          }
        } else {
          showSection(defaultSection); // Tidak ada hash atau hash tidak valid, pergi ke default
          history.replaceState(
            null,
            "",
            window.location.pathname + "#" + defaultSection
          );
        }
      } else {
        // Jika email ada di sesi tetapi tidak ditemukan di sheet guru, hapus sesi dan pergi ke login
        handleAdminLogout();
      }
    } catch (error) {
      console.error("Error memulihkan sesi:", error);
      showToast("Gagal memulihkan sesi. Silakan login kembali.", "error");
      handleAdminLogout();
    } finally {
      hideLoadingOverlay();
    }
  } else {
    showSection("login-section"); // Tampilkan login jika tidak ada sesi
    history.replaceState(null, "", window.location.pathname); // Hapus hash apa pun
  }

  // Atur tab aktif awal untuk dashboard guru dan input nilai/kehadiran jika bagian mereka aktif
  // Ini perlu dijalankan *setelah* bagian awal ditentukan dan ditampilkan.
  // Menggunakan setTimeout untuk memastikan elemen terlihat sebelum mencoba mengakses anak-anaknya untuk pengalihan tab.
  setTimeout(() => {
    const manajemenTabsContainer = document.getElementById(
      "tab-content-container-manajemen"
    );
    if (
      manajemenTabsContainer &&
      !manajemenTabsContainer.classList.contains("section-hidden")
    ) {
      switchTab("manajemen-data-tugas", "manajemen-data-section"); // Default ke tab Tugas di Manajemen Data
    }

    const inputTabsContainer = document.getElementById(
      "tab-content-container-input"
    );
    if (
      inputTabsContainer &&
      !inputTabsContainer.classList.contains("section-hidden")
    ) {
      switchTab("input-nilai", "input-nilai-kehadiran-section"); // Default ke tab Input Nilai
    }
  }, 100); // Penundaan kecil untuk memastikan bagian dirender
});
