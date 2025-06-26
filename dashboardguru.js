// Ganti URL ini dengan URL Web App Google Apps Script Anda setelah di-deploy
const GOOGLE_APPS_SCRIPT_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbzN1daif0NyrrL-ojAYIVQvmtVhU7LHWwzBgRbHrTt_87udBmLt42mkssUmEqoJtb0p/exec"; // Dummy URL, please update with your actual deployed URL
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
  admin_users: [],
  siswa: [],
  guru: [], // Data guru dari sheet 'Guru' - sekarang akan berisi Dashboard_Insights
  tugas: [],
  nilai: [], // Data nilai akan dimuat on-demand
  kehadiran: [],
  catatan_guru: [],
  jadwal_pelajaran: [],
  pengumuman: [],
};

let currentLoggedInEmail = null; // Menyimpan email guru yang sedang login
// Menyimpan objek guru yang sedang login, dengan Kelas_Diampu sudah diparsing menjadi array
let currentLoggedInTeacherData = null;

let activeSectionId = "login-section"; // Initial active section

let dashboardChartInstance = null; // To store the Chart.js instance for the dashboard

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

// NEW FUNCTION: Preloads all operational data in the background
async function preloadOperationalData() {
  console.log("--> Memulai preloading data operasional di latar belakang...");
  try {
    dataCache.siswa = await fetchSheetData("Siswa");
    populateSiswaDropdownsGuru();
    populateSiswaDropdownsInput();

    setTimeout(async () => {
      dataCache.tugas = await fetchSheetData("Tugas");
      populateTugasDropdownsInput();
      updateTugasIdField();
    }, 50);

    setTimeout(async () => {
      dataCache.catatan_guru = await fetchSheetData("Catatan_Guru");
      updateCatatanIdField();
    }, 100);

    setTimeout(async () => {
      dataCache.jadwal_pelajaran = await fetchSheetData("Jadwal_Pelajaran");
      updateJadwalIdField();
    }, 150);

    setTimeout(async () => {
      dataCache.pengumuman = await fetchSheetData("Pengumuman");
      updatePengumumanIdField();
    }, 200);

    setTimeout(async () => {
      dataCache.kehadiran = await fetchSheetData("Kehadiran");
      updateKehadiranIdField();
    }, 250);

    setTimeout(async () => {
      dataCache.nilai = await fetchSheetData("Nilai");
    }, 300);

    console.log("<-- Preloading data operasional selesai.");
  } catch (error) {
    console.error("Error selama preloading data operasional:", error);
  }
}

// Function to control sidebar visibility
const toggleSidebar = (show = null) => {
  const sidebar = document.getElementById("main-sidebar");
  const sidebarOverlay = document.getElementById("sidebar-overlay");
  const mainContentWrapper = document.getElementById("main-content-wrapper");

  if (!sidebar || !sidebarOverlay || !mainContentWrapper) {
    console.error("Sidebar elements not found.");
    return;
  }

  const isActive = sidebar.classList.contains("active");

  if (show === true || (show === null && !isActive)) {
    // Show sidebar
    sidebar.classList.add("active");
    sidebarOverlay.classList.add("active");
    if (window.innerWidth >= 768) {
      mainContentWrapper.classList.add("sidebar-active-desktop");
    }
  } else if (show === false || (show === null && isActive)) {
    // Hide sidebar
    sidebar.classList.remove("active");
    sidebarOverlay.classList.remove("active");
    mainContentWrapper.classList.remove("sidebar-active-desktop");
  }
};

async function showSection(sectionId) {
  const sections = document.querySelectorAll("section");
  sections.forEach((section) => {
    section.classList.add("hidden", "section-hidden");
  });
  const targetSection = document.getElementById(sectionId);
  if (targetSection) {
    targetSection.classList.remove("hidden", "section-hidden");
    activeSectionId = sectionId;
    updateHeaderDisplay(); // Memanggil fungsi baru untuk mengelola tampilan header dan padding main
    updateSidebarActiveState(sectionId);
    updateUrlHash(sectionId);

    // Otomatis tutup sidebar saat pindah section
    toggleSidebar(false); // Call with 'false' to explicitly close

    try {
      if (sectionId === "guru-dashboard-section") {
        console.log(
          "--> Mengaktifkan bagian Dashboard Guru. Menggunakan data insight yang sudah dihitung."
        );
        // dataCache.siswa, dataCache.tugas, dataCache.nilai tidak lagi dibutuhkan untuk render dashboard
        // karena data insight sudah ada di currentLoggedInTeacherData.Dashboard_Insights

        // Update teacher name and title on dashboard only if not already set by login
        // This acts as a fallback for direct URL access or refresh
        if (currentLoggedInTeacherData) {
          document.getElementById("guru-name-display").textContent =
            currentLoggedInTeacherData.Nama_Guru || "";
          let guruClassesText = "";
          // Memastikan Kelas_Diampu adalah array sebelum memanggil join()
          if (
            Array.isArray(currentLoggedInTeacherData.Kelas_Diampu) &&
            currentLoggedInTeacherData.Kelas_Diampu.length > 0
          ) {
            guruClassesText = `Guru Kelas ${currentLoggedInTeacherData.Kelas_Diampu.join(
              ", "
            )}`;
          } else if (currentLoggedInTeacherData.Status) {
            guruClassesText = currentLoggedInTeacherData.Status; // Fallback to Status if no classes are assigned
          }
          document.getElementById("guru-title-display").textContent =
            guruClassesText;
        }
        renderDashboardInsights(); // Memanggil renderDashboardInsights tanpa perlu fetch ulang data
        console.log("<-- Bagian Dashboard Guru diaktifkan dan dirender.");
      } else if (sectionId === "manajemen-data-section") {
        console.log(
          "--> Mengaktifkan bagian Manajemen Data. Menggunakan data cache atau mengambil jika kosong."
        );
        if (!dataCache.siswa || dataCache.siswa.length === 0) {
          dataCache.siswa = await fetchSheetData("Siswa");
          console.log("    Fallback: Data Siswa diambil untuk Manajemen Data.");
        }
        if (!dataCache.tugas || dataCache.tugas.length === 0) {
          dataCache.tugas = await fetchSheetData("Tugas");
          console.log("    Fallback: Data Tugas diambil untuk Manajemen Data.");
        }
        if (!dataCache.catatan_guru || dataCache.catatan_guru.length === 0) {
          dataCache.catatan_guru = await fetchSheetData("Catatan_Guru");
          console.log(
            "    Fallback: Data Catatan Guru diambil untuk Manajemen Data."
          );
        }
        if (
          !dataCache.jadwal_pelajaran ||
          dataCache.jadwal_pelajaran.length === 0
        ) {
          dataCache.jadwal_pelajaran = await fetchSheetData("Jadwal_Pelajaran");
          console.log(
            "    Fallback: Data Jadwal Pelajaran diambil untuk Manajemen Data."
          );
        }
        if (!dataCache.pengumuman || dataCache.pengumuman.length === 0) {
          dataCache.pengumuman = await fetchSheetData("Pengumuman");
          console.log(
            "    Fallback: Data Pengumuman diambil untuk Manajemen Data."
          );
        }

        populateSiswaDropdownsGuru();
        populateMapelDropdownsGuru();

        document
          .getElementById("no-tugas-data-message")
          .classList.remove("section-hidden");
        document.getElementById("no-tugas-data-message").textContent =
          "Tidak ada data tugas.";
        document
          .getElementById("no-catatan-data-message")
          .classList.remove("section-hidden");
        document.getElementById("no-catatan-data-message").textContent =
          "Tidak ada data catatan guru.";
        document
          .getElementById("no-jadwal-data-message")
          .classList.remove("section-hidden");
        document.getElementById("no-jadwal-data-message").textContent =
          "Tidak ada data jadwal pelajaran.";
        document
          .getElementById("no-pengumuman-data-message")
          .classList.remove("section-hidden");
        document.getElementById("no-pengumuman-data-message").textContent =
          "Tidak ada data pengumuman.";

        console.log("<-- Bagian Manajemen Data diaktifkan dan dirender.");
      } else if (sectionId === "input-nilai-kehadiran-section") {
        console.log(
          "--> Mengaktifkan bagian Input Nilai. Menggunakan data cache atau mengambil jika kosong."
        );
        if (!dataCache.siswa || dataCache.siswa.length === 0) {
          dataCache.siswa = await fetchSheetData("Siswa");
          console.log("    Fallback: Data Siswa diambil untuk Input Nilai.");
        }
        if (!dataCache.tugas || dataCache.tugas.length === 0) {
          dataCache.tugas = await fetchSheetData("Tugas");
          console.log("    Fallback: Data Tugas diambil untuk Input Nilai.");
        }
        if (!dataCache.kehadiran || dataCache.kehadiran.length === 0) {
          dataCache.kehadiran = await fetchSheetData("Kehadiran");
          console.log(
            "    Fallback: Data Kehadiran diambil untuk Input Nilai."
          );
        }

        populateSiswaDropdownsInput();
        populateTugasDropdownsInput();
        console.log(
          "<-- Bagian Input Nilai diaktifkan dan dirender dengan data terbaru."
        );
      } else if (sectionId === "rekap-data-section") {
        console.log(
          "--> Mengaktifkan bagian Rekap Data. Menggunakan data cache atau mengambil jika kosong."
        );
        rekapNilaiTableBody.innerHTML = "";

        if (!dataCache.nilai || dataCache.nilai.length === 0) {
          dataCache.nilai = await fetchSheetData("Nilai");
          console.log("    Fallback: Data Nilai diambil untuk Rekap Data.");
        }
        if (!dataCache.siswa || dataCache.siswa.length === 0) {
          dataCache.siswa = await fetchSheetData("Siswa");
          console.log("    Fallback: Data Siswa diambil untuk Rekap Data.");
        }
        if (!dataCache.tugas || dataCache.tugas.length === 0) {
          dataCache.tugas = await fetchSheetData("Tugas");
          console.log("    Fallback: Data Tugas diambil untuk Rekap Data.");
        }

        renderRekapNilaiTable();
        console.log(
          "<-- Bagian Rekap Data diaktifkan dan menampilkan data default."
        );
      } else if (sectionId === "settings-section") {
        console.log(
          "--> Mengaktifkan bagian Pengaturan. Memastikan data guru untuk profil."
        );
        // Data guru seharusnya sudah ada di cache dari login, tapi refresh untuk kepastian
        if (!dataCache.guru || dataCache.guru.length === 0) {
          dataCache.guru = await fetchSheetData("Guru");
          console.log("    Fallback: Data Guru diambil untuk Profil.");
        }
        if (currentLoggedInEmail) {
          const teacherData = dataCache.guru.find(
            // Use a new variable to avoid conflict
            (teacher) => teacher.Email === currentLoggedInEmail
          );
          if (teacherData) {
            // Check if teacherData is found
            currentLoggedInTeacherData = {
              ...teacherData,
              // Memastikan Kelas_Diampu adalah string sebelum split, jika tidak, default ke array kosong
              Kelas_Diampu:
                typeof teacherData.Kelas_Diampu === "string" &&
                teacherData.Kelas_Diampu
                  ? teacherData.Kelas_Diampu.split(",").map((c) => c.trim())
                  : [],
              Status: teacherData.Status || "",
              // Parse Dashboard_Insights string to JSON object
              Dashboard_Insights: teacherData.Dashboard_Insights
                ? JSON.parse(teacherData.Dashboard_Insights)
                : {},
            };
          } else {
            // If teacherData is not found, clear currentLoggedInTeacherData
            currentLoggedInTeacherData = null;
          }
        }
        displayTeacherProfileSettings(currentLoggedInTeacherData);
        switchTab("profile-settings", "settings-section"); // Default to profile tab
        console.log("<-- Bagian Pengaturan diaktifkan.");
      }
    } catch (error) {
      console.error(`Error loading data for section ${sectionId}:`, error);
      showToast("Gagal memuat data untuk bagian ini.", "error");
    }
  }
}

// UPDATE: Memperbarui fungsi untuk mengelola visibilitas header dan padding main
function updateHeaderDisplay() {
  const header = document.querySelector("header");
  const mainContent = document.querySelector("main"); // Dapatkan referensi ke elemen main

  if (!header || !mainContent) {
    console.error("Header or main content not found.");
    return;
  }

  if (activeSectionId === "login-section") {
    header.style.display = "none"; // Sembunyikan seluruh header
    mainContent.style.paddingTop = "0px"; // Hapus padding-top pada main
  } else {
    header.style.display = "flex"; // Tampilkan header (sesuai display flex yang ada)
    mainContent.style.paddingTop = "64px"; // Set padding-top untuk konten di bawah header
  }
  updateHeaderTitle(activeSectionId); // Set title berdasarkan section aktif
}

// Perubahan di sini: Mengosongkan teks judul header
function updateHeaderTitle(sectionId) {
  const headerTitleElement = document.getElementById("header-title");

  if (headerTitleElement) {
    // Hanya perbarui jika bukan halaman login, karena halaman login menyembunyikan header
    if (sectionId !== "login-section") {
      headerTitleElement.textContent = ""; // Mengosongkan teks judul
    }
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
  let tabButtons;
  let tabContentsContainer;

  // Determine the correct tab buttons and container based on the sectionId
  if (tabSectionId === "manajemen-data-section") {
    tabButtons = document.querySelectorAll(`#${tabSectionId} .tab-button`);
    tabContentsContainer = document.getElementById(
      "tab-content-container-manajemen"
    );
  } else if (tabSectionId === "input-nilai-kehadiran-section") {
    tabButtons = document.querySelectorAll(`#${tabSectionId} .tab-button`);
    tabContentsContainer = document.getElementById(
      "tab-content-container-input"
    );
  } else if (tabSectionId === "settings-section") {
    // NEW: Handle settings section tabs
    tabButtons = document.querySelectorAll(`#${tabSectionId} .tab-button`);
    tabContentsContainer = document.getElementById(
      "tab-content-container-settings"
    );
  } else {
    console.error(
      `Tab content container not found for unknown section: ${tabSectionId}`
    );
    return;
  }

  if (!tabContentsContainer || !tabButtons) {
    console.error(
      `Tab content elements not found for section ${tabSectionId}.`
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

// --- Login Handler Guru ---
async function handleLogin(event) {
  event.preventDefault();
  showLoadingOverlay();

  const email = document.getElementById("email-input").value;

  try {
    dataCache.guru = await fetchSheetData("Guru");
    const teacherFound = dataCache.guru.find(
      (teacher) => teacher.Email === email
    );

    if (teacherFound) {
      currentLoggedInEmail = email;
      currentLoggedInTeacherData = {
        ...teacherFound,
        // Pastikan Kelas_Diampu adalah string sebelum split, jika tidak, default ke array kosong
        Kelas_Diampu:
          typeof teacherFound.Kelas_Diampu === "string" &&
          teacherFound.Kelas_Diampu
            ? teacherFound.Kelas_Diampu.split(",").map((c) => c.trim())
            : [],
        Status: teacherFound.Status || "",
        // Parse Dashboard_Insights string to JSON object immediately after login
        Dashboard_Insights: teacherFound.Dashboard_Insights
          ? JSON.parse(teacherFound.Dashboard_Insights)
          : {},
      };
      sessionStorage.setItem("loggedInAdminEmail", email);

      // LANGSUNG UPDATE UI UNTUK NAMA DAN GELAR GURU SETELAH LOGIN
      document.getElementById("guru-name-display").textContent =
        currentLoggedInTeacherData.Nama_Guru || "";
      let guruClassesText = "";
      if (
        Array.isArray(currentLoggedInTeacherData.Kelas_Diampu) && // Tambahkan pengecekan Array.isArray()
        currentLoggedInTeacherData.Kelas_Diampu.length > 0
      ) {
        guruClassesText = `Guru Kelas ${currentLoggedInTeacherData.Kelas_Diampu.join(
          ", "
        )}`;
      } else if (currentLoggedInTeacherData.Status) {
        guruClassesText = currentLoggedInTeacherData.Status;
      }
      document.getElementById("guru-title-display").textContent =
        guruClassesText;

      showToast("Login berhasil!", "success");

      // await fetchInitialDashboardData(); // No longer needed here as dashboard insights are pre-calculated
      showSection("guru-dashboard-section"); // This will now just reveal the section with pre-filled welcome text
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

// --- Handle NIS Search (for redirect to index.html) ---
async function handleNisSearch(event) {
  event.preventDefault();
  showLoadingOverlay();

  const nis = document.getElementById("nis-search-input").value.trim();

  if (!nis) {
    showToast("Mohon masukkan NIS siswa.", "error");
    hideLoadingOverlay();
    return;
  }

  try {
    // Fetch siswa data if not already cached
    if (!dataCache.siswa || dataCache.siswa.length === 0) {
      dataCache.siswa = await fetchSheetData("Siswa");
    }

    const studentFound = dataCache.siswa.find((s) => String(s.NIS) === nis);

    if (studentFound) {
      // Store NIS in sessionStorage for index.html to pick up
      sessionStorage.setItem("tempRedirectNIS", nis);
      showToast(
        `NIS ${nis} ditemukan. Mengarahkan ke dashboard siswa...`,
        "info"
      );
      // Redirect to index.html
      window.location.href = "index.html";
    } else {
      showToast(`NIS '${nis}' tidak ditemukan.`, "error");
    }
  } catch (error) {
    console.error("Error searching NIS:", error);
    showToast("Terjadi kesalahan saat mencari NIS.", "error");
  } finally {
    hideLoadingOverlay();
  }
}

// --- Tampilan Identitas Guru (Diperbarui untuk Pengaturan) ---
function displayTeacherProfileSettings(teacherData) {
  if (teacherData) {
    document.getElementById("profile-nama-guru").textContent =
      teacherData.Nama_Guru || "-";
    document.getElementById("profile-email-guru").textContent =
      teacherData.Email || "-";
    document.getElementById("profile-status-guru").textContent =
      teacherData.Status || "-";
    // Memastikan Kelas_Diampu adalah array sebelum memanggil join()
    document.getElementById("profile-kelas-diampu").textContent = Array.isArray(
      teacherData.Kelas_Diampu
    )
      ? teacherData.Kelas_Diampu.join(", ")
      : teacherData.Kelas_Diampu || "-"; // Fallback jika bukan array
  }
}

// --- Pengambilan Data Awal untuk Dashboard (Tidak termasuk data operasional) ---
// Fungsi ini sekarang lebih minimal karena dashboard insights sudah dihitung di Apps Script
async function fetchInitialDashboardData() {
  console.log(
    "--> Memulai pengambilan data dashboard awal (hanya Guru yang sudah di-cache)..."
  );
  console.log(
    "    Data Guru sudah ada di cache. Menggunakan data yang di-cache."
  );

  if (currentLoggedInEmail) {
    // Memastikan currentLoggedInTeacherData memiliki Dashboard_Insights yang sudah diparsing
    const teacherFound = dataCache.guru.find(
      (teacher) => teacher.Email === currentLoggedInEmail
    );
    if (teacherFound) {
      currentLoggedInTeacherData = {
        ...teacherFound,
        // Memastikan Kelas_Diampu adalah string sebelum split, jika tidak, default ke array kosong
        Kelas_Diampu:
          typeof teacherFound.Kelas_Diampu === "string" &&
          teacherFound.Kelas_Diampu
            ? teacherFound.Kelas_Diampu.split(",").map((c) => c.trim())
            : [],
        Status: teacherFound.Status || "",
        Dashboard_Insights: teacherFound.Dashboard_Insights
          ? JSON.parse(teacherFound.Dashboard_Insights)
          : {},
      };
    } else {
      currentLoggedInTeacherData = null;
    }
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
  const nisSelect = document.getElementById("catatan-nis");
  if (nisSelect) {
    const currentSelectedValue = nisSelect.value;
    nisSelect.innerHTML = '<option value="">Pilih Siswa (NIS - Nama)</option>';

    if (!dataCache.siswa || dataCache.siswa.length === 0) {
      console.warn(
        "Data siswa kosong, tidak dapat mengisi dropdown catatan guru."
      );
      return;
    }

    const teacherClasses = currentLoggedInTeacherData?.Kelas_Diampu || [];
    const filteredSiswa = dataCache.siswa.filter((siswa) =>
      teacherClasses.includes(siswa.Kelas)
    );
    filteredSiswa.sort((a, b) => a.Nama.localeCompare(b.Nama));

    filteredSiswa.forEach((siswa) => {
      const option = document.createElement("option");
      option.value = siswa.NIS;
      option.textContent = `${siswa.NIS} - ${siswa.Nama} (${siswa.Kelas})`;
      nisSelect.appendChild(option);
    });

    if (
      currentSelectedValue &&
      nisSelect.querySelector(`option[value="${currentSelectedValue}"]`)
    ) {
      nisSelect.value = currentSelectedValue;
    }
  }
}

function populateSiswaDropdownsInput() {
  const nisSelects = document.querySelectorAll("#nilai-nis, #kehadiran-nis");
  const siswaData = dataCache.siswa;

  if (!siswaData || siswaData.length === 0) {
    console.warn(
      "Data siswa kosong, tidak dapat mengisi dropdown input nilai/kehadiran."
    );
    nisSelects.forEach((select) => {
      select.innerHTML = '<option value="">Tidak ada siswa</option>';
    });
    return;
  }

  const teacherClasses = currentLoggedInTeacherData?.Kelas_Diampu || [];
  const filteredSiswa = siswaData.filter((siswa) =>
    teacherClasses.includes(siswa.Kelas)
  );

  nisSelects.forEach((select) => {
    const currentSelectedValue = select.value;
    select.innerHTML = '<option value="">Pilih Siswa (NIS - Nama)</option>';

    filteredSiswa.sort((a, b) => a.Nama.localeCompare(b.Nama));

    filteredSiswa.forEach((siswa) => {
      const option = document.createElement("option");
      option.value = siswa.NIS;
      option.textContent = `${siswa.NIS} - ${siswa.Nama} (${siswa.Kelas})`;
      select.appendChild(option);
    });

    if (
      currentSelectedValue &&
      select.querySelector(`option[value="${currentSelectedValue}"]`)
    ) {
      select.value = currentSelectedValue;
    }
  });
}

function populateTugasDropdownsInput() {
  const idTugasSelect = document.getElementById("nilai-id_tugas");
  const currentSelectedValue = idTugasSelect ? idTugasSelect.value : "";
  if (idTugasSelect) {
    idTugasSelect.innerHTML =
      '<option value="">Pilih Tugas (ID - Nama Tugas)</option>';
    if (dataCache.tugas) {
      const teacherClasses = currentLoggedInTeacherData?.Kelas_Diampu || [];

      const filteredTugas = dataCache.tugas.filter((tugas) => {
        const tugasUntukKelas = tugas.Untuk_Kelas
          ? tugas.Untuk_Kelas.split(",").map((k) => k.trim())
          : [];

        if (tugasUntukKelas.length === 0 || tugasUntukKelas.includes("Semua")) {
          return true;
        }

        return tugasUntukKelas.some((tKelas) =>
          teacherClasses.includes(tKelas)
        );
      });

      filteredTugas.sort((a, b) => a.Nama_Tugas.localeCompare(b.Nama_Tugas));

      filteredTugas.forEach((tugas) => {
        const option = document.createElement("option");
        option.value = tugas.ID_Tugas;
        option.textContent = `${tugas.ID_Tugas} - ${tugas.Nama_Tugas} (${tugas.Mata_Pelajaran})`;
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
function openModal(modalId, isEdit = false, data = null) {
  const modal = document.getElementById(modalId);
  if (!modal) {
    console.warn(
      `openModal: Elemen modal dengan ID '${modalId}' tidak ditemukan.`
    );
    return;
  }

  const validModalIds = [
    "student-modal",
    "nilai-modal",
    "kehadiran-modal",
    "rekap-filter-modal",
  ];
  if (!validModalIds.includes(modalId)) {
    console.error(
      `openModal: Fungsi dipanggil dengan ID tidak terduga '${modalId}'. Fungsi ini hanya menangani: ${validModalIds.join(
        ", "
      )}.`
    );
    return;
  }

  const modalContent = modal.querySelector(".modal-content");
  if (!modalContent) {
    console.error(
      `openModal: Modal dengan ID '${modalId}' ditemukan, tetapi tidak berisi elemen dengan kelas 'modal-content'.`
    );
    return;
  }

  const titleElement = modalContent.querySelector("h3");
  const form = modalContent.querySelector("form");

  if (titleElement) {
    let defaultTitle = `Tambah ${modalId
      .replace("-modal", "")
      .replace("guru-data-", "")
      .replace("input-", "")}`;
    titleElement.textContent = defaultTitle;
  }

  switch (modalId) {
    case "student-modal":
      if (form) form.reset();
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
      if (form) form.reset();
      updateNilaiIdField();
      populateSiswaDropdownsInput();
      populateTugasDropdownsInput();
      break;
    case "kehadiran-modal":
      if (form) form.reset();
      updateKehadiranIdField();
      populateSiswaDropdownsInput();
      break;
    case "rekap-filter-modal":
      if (titleElement) titleElement.textContent = "Filter Rekap Data Nilai";
      populateRekapFilters();
      break;
  }
  modal.classList.add("active");
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  modal.classList.remove("active");

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
    case "rekap-filter-modal":
      break;
    default:
      console.warn(
        `closeModal dipanggil untuk ID yang tidak terduga: ${modalId}`
      );
      break;
  }
}

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
    formContainer.querySelector("form").reset();
  } else {
    formContainer.classList.toggle("section-hidden");
    if (formContainer.classList.contains("section-hidden")) {
      formContainer.querySelector("form").reset();
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
  showLoadingOverlay();
  try {
    if (formType === "add") {
      result = await postSheetData(sheetName, data);
    } else if (formType === "edit") {
      result = await updateSheetData(sheetName, "NIS", data);
    }
  } finally {
  }

  if (result.success) {
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
      // Setelah ada perubahan data yang mempengaruhi insight dashboard,
      // kita perlu MENGINGATKAN admin untuk menjalankan trigger update dashboard insights secara manual
      // atau menunggu trigger terjadwal berjalan.
      // Di sini kita tidak langsung fetch karena perhitungan dashboard_insights sudah di sisi server Apps Script
      // dan mungkin belum terupdate secara instan.
      showToast(
        "Data berhasil disimpan. Data dashboard mungkin memerlukan beberapa saat untuk diperbarui.",
        "info"
      );

      switch (sheetName) {
        case "Siswa":
          dataCache.siswa = await fetchSheetData("Siswa");
          populateSiswaDropdownsInput();
          populateSiswaDropdownsGuru();
          // renderDashboardInsights(); // Tidak perlu render di sini, menunggu update dari Apps Script
          break;
        case "Tugas":
          dataCache.tugas = await fetchSheetData("Tugas");
          populateTugasDropdownsInput();
          populateMapelDropdownsGuru();
          // renderDashboardInsights(); // Tidak perlu render di sini
          break;
        case "Nilai":
          dataCache.nilai = await fetchSheetData("Nilai");
          updateNilaiIdField();
          if (activeSectionId === "rekap-data-section") {
            renderRekapNilaiTable();
          }
          // renderDashboardInsights(); // Tidak perlu render di sini
          break;
        case "Kehadiran":
          dataCache.kehadiran = await fetchSheetData("Kehadiran");
          updateKehadiranIdField();
          break;
        case "Catatan_Guru":
          dataCache.catatan_guru = await fetchSheetData("Catatan_Guru");
          break;
        case "Jadwal_Pelajaran":
          dataCache.jadwal_pelajaran = await fetchSheetData("Jadwal_Pelajaran");
          populateMapelDropdownsGuru();
          break;
        case "Pengumuman":
          dataCache.pengumuman = await fetchSheetData("Pengumuman");
          break;
        default:
          console.warn(
            `sheetName tidak tertangani di handleSubmitForm refresh: ${sheetName}`
          );
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
      hideLoadingOverlay();
    }
  } else {
    hideLoadingOverlay();
  }
}

// --- Logika Rekap Data Nilai ---
const rekapNisFilter = document.getElementById("rekap-nis-filter-modal");
const rekapMapelFilter = document.getElementById("rekap-mapel-filter-modal");
const rekapStatusFilter = document.getElementById("rekap-status-filter-modal");
const rekapIdTugasFilter = document.getElementById(
  "rekap-id-tugas-filter-modal"
);

const rekapNilaiTableBody = document.getElementById("rekap-nilai-table-body");
const noRekapDataMessage = document.getElementById("no-rekap-data-message");

function populateRekapFilters() {
  const currentNisFilter = rekapNisFilter.value;
  rekapNisFilter.innerHTML = '<option value="all">Semua Siswa</option>';
  const sortedSiswa = [...dataCache.siswa].sort((a, b) =>
    a.Nama.localeCompare(b.Nama)
  );

  const teacherClasses = currentLoggedInTeacherData?.Kelas_Diampu || [];
  const filteredSiswaForRekap = sortedSiswa.filter((siswa) =>
    teacherClasses.includes(siswa.Kelas)
  );

  let uniqueNis = [...new Set(filteredSiswaForRekap.map((s) => s.NIS))];

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

  if (rekapIdTugasFilter) {
    const currentIdTugasFilter = rekapIdTugasFilter.value;
    rekapIdTugasFilter.innerHTML = '<option value="all">Semua Tugas</option>';

    if (dataCache.tugas && dataCache.tugas.length > 0) {
      const teacherClasses = currentLoggedInTeacherData?.Kelas_Diampu || [];
      const filteredTugasForDropdown = dataCache.tugas.filter((tugas) => {
        const tugasUntukKelas = tugas.Untuk_Kelas
          ? tugas.Untuk_Kelas.split(",").map((k) => k.trim())
          : [];
        if (tugasUntukKelas.length === 0 || tugasUntukKelas.includes("Semua")) {
          return true;
        }
        return tugasUntukKelas.some((tKelas) =>
          teacherClasses.includes(tKelas)
        );
      });

      filteredTugasForDropdown.sort((a, b) =>
        a.Nama_Tugas.localeCompare(b.Nama_Tugas)
      );

      filteredTugasForDropdown.forEach((tugas) => {
        const option = document.createElement("option");
        option.value = tugas.ID_Tugas;
        option.textContent = `${tugas.ID_Tugas} - ${tugas.Nama_Tugas} (${tugas.Mata_Pelajaran})`;
        rekapIdTugasFilter.appendChild(option);
      });
    }

    if (
      currentIdTugasFilter &&
      rekapIdTugasFilter.querySelector(
        `option[value="${currentIdTugasFilter}"]`
      )
    ) {
      rekapIdTugasFilter.value = currentIdTugasFilter;
    }
  }
}

function renderRekapNilaiTable() {
  rekapNilaiTableBody.innerHTML = "";
  if (!dataCache.nilai || dataCache.nilai.length === 0) {
    noRekapDataMessage.classList.remove("section-hidden");
    noRekapDataMessage.textContent =
      "Data nilai belum dimuat atau tidak ada data.";
    return;
  }

  let filteredData = dataCache.nilai;

  if (rekapNisFilter && rekapNisFilter.value === "")
    rekapNisFilter.value = "all";
  if (rekapMapelFilter && rekapMapelFilter.value === "")
    rekapMapelFilter.value = "all";
  if (rekapStatusFilter && rekapStatusFilter.value === "")
    rekapStatusFilter.value = "all";
  if (rekapIdTugasFilter && rekapIdTugasFilter.value === "")
    rekapIdTugasFilter.value = "all";

  const nisFilter = rekapNisFilter.value || "all";
  const mapelFilter = rekapMapelFilter.value || "all";
  const statusFilter = rekapStatusFilter.value || "all";
  const idTugasFilter = rekapIdTugasFilter
    ? rekapIdTugasFilter.value || "all"
    : "all";

  const teacherClasses = currentLoggedInTeacherData?.Kelas_Diampu || [];

  filteredData = filteredData.filter((nilai) => {
    const student = dataCache.siswa.find(
      (s) => String(s.NIS) === String(nilai.NIS)
    );
    const tugas = dataCache.tugas.find(
      (t) => String(t.ID_Tugas) === String(nilai.ID_Tugas)
    );

    if (!student || !tugas) {
      console.warn(
        `Melewati entri nilai karena data siswa atau tugas tidak ditemukan: ${JSON.stringify(
          nilai
        )}`
      );
      return false;
    }

    const matchesTeacherClass = teacherClasses.includes(student.Kelas);
    if (!matchesTeacherClass) return false;

    const matchesNis = nisFilter === "all" || String(nilai.NIS) === nisFilter;
    const matchesMapel =
      mapelFilter === "all" || tugas.Mata_Pelajaran === mapelFilter;
    const matchesStatus =
      statusFilter === "all" || nilai.Status_Pengerjaan === statusFilter;
    const matchesIdTugas =
      idTugasFilter === "all" || String(nilai.ID_Tugas) === idTugasFilter;

    return matchesNis && matchesMapel && matchesStatus && matchesIdTugas;
  });

  if (filteredData.length === 0) {
    noRekapDataMessage.classList.remove("section-hidden");
    noRekapDataMessage.textContent =
      "Tidak ada data nilai ditemukan dengan filter ini.";
    return;
  }
  noRekapDataMessage.classList.add("section-hidden");

  filteredData.forEach((nilai) => {
    const student = dataCache.siswa.find(
      (s) => String(s.NIS) === String(nilai.NIS)
    );
    const tugas = dataCache.tugas.find(
      (t) => String(t.ID_Tugas) === String(nilai.ID_Tugas)
    );

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

// Fungsi calculateUnfinishedTasks tidak lagi dibutuhkan di sisi klien untuk dashboard insights
// karena perhitungan sudah di Apps Script. Ini dipertahankan untuk referensi jika masih digunakan
// di bagian lain yang tidak terkait dengan dashboard insight utama.
function calculateUnfinishedTasks(
  siswaData,
  tugasData,
  nilaiData,
  teacherClasses
) {
  let countUnfinished = 0;

  const relevantStudents = siswaData.filter((siswa) =>
    teacherClasses.includes(siswa.Kelas)
  );

  const relevantTasks = tugasData.filter((tugas) => {
    const tugasUntukKelas = tugas.Untuk_Kelas
      ? tugas.Untuk_Kelas.split(",").map((k) => k.trim())
      : [];
    if (tugasUntukKelas.length === 0 || tugasUntukKelas.includes("Semua")) {
      return true;
    }
    return tugasUntukKelas.some((tKelas) => teacherClasses.includes(tKelas));
  });

  const submittedGradesMap = new Map();
  nilaiData.forEach((nilai) => {
    if (nilai.Status_Pengerjaan === "Tuntas") {
      submittedGradesMap.set(`${nilai.NIS}-${nilai.ID_Tugas}`, "Tuntas");
    } else if (nilai.Status_Pengerjaan === "Belum Tuntas") {
      submittedGradesMap.set(`${nilai.NIS}-${nilai.ID_Tugas}`, "Belum Tuntas");
    }
  });

  relevantStudents.forEach((student) => {
    relevantTasks.forEach((task) => {
      const key = `${student.NIS}-${task.ID_Tugas}`;
      const status = submittedGradesMap.get(key);

      if (!status || status === "Belum Tuntas") {
        countUnfinished++;
      }
    });
  });

  return countUnfinished;
}

// renderDashboardInsights kini akan membaca data dari currentLoggedInTeacherData.Dashboard_Insights
function renderDashboardInsights() {
  const totalSiswaDiampuElem = document.getElementById("total-siswa-diampu");
  const totalTugasBelumSelesaiElem = document.getElementById(
    "total-tugas-belum-selesai"
  );
  const rataRataNilaiGlobalElem = document.getElementById(
    "rata-rata-nilai-global"
  );
  const nilaiPerMapelChartCanvas =
    document.getElementById("nilaiPerMapelChart");
  const noNilaiChartMessage = document.getElementById("no-nilai-chart-message");

  // Pastikan elemen dashboard insight ada sebelum mencoba merendernya
  if (
    !totalSiswaDiampuElem ||
    !totalTugasBelumSelesaiElem ||
    !rataRataNilaiGlobalElem ||
    !nilaiPerMapelChartCanvas
  ) {
    console.warn(
      "Elemen dashboard insight tidak ditemukan, skipping renderDashboardInsights."
    );
    return;
  }

  const insights = currentLoggedInTeacherData?.Dashboard_Insights;

  if (!insights || Object.keys(insights).length === 0) {
    console.warn(
      "Data Dashboard_Insights tidak ditemukan atau kosong untuk guru ini."
    );
    totalSiswaDiampuElem.textContent = "N/A";
    totalTugasBelumSelesaiElem.textContent = "N/A";
    rataRataNilaiGlobalElem.textContent = "N/A";
    noNilaiChartMessage.classList.remove("section-hidden");
    nilaiPerMapelChartCanvas.style.display = "none";
    if (dashboardChartInstance) {
      dashboardChartInstance.destroy();
      dashboardChartInstance = null;
    }
    return;
  }

  totalSiswaDiampuElem.textContent =
    insights.totalSiswaDiampu !== undefined ? insights.totalSiswaDiampu : "N/A";
  totalTugasBelumSelesaiElem.textContent =
    insights.totalTugasBelumSelesai !== undefined
      ? insights.totalTugasBelumSelesai
      : "N/A";
  rataRataNilaiGlobalElem.textContent =
    insights.rataRataNilaiGlobal !== undefined
      ? insights.rataRataNilaiGlobal.toFixed(2)
      : "N/A";

  console.log(
    "Data untuk grafik nilai per mata pelajaran (dari insights):",
    insights.nilaiPerMapelChart
  );

  const chartLabels = insights.nilaiPerMapelChart?.labels || [];
  const chartData = insights.nilaiPerMapelChart?.data || [];

  const colors = [
    "rgba(255, 99, 132, 0.6)",
    "rgba(54, 162, 235, 0.6)",
    "rgba(255, 206, 86, 0.6)",
    "rgba(75, 192, 192, 0.6)",
    "rgba(153, 102, 255, 0.6)",
    "rgba(255, 159, 64, 0.6)",
    "rgba(199, 199, 199, 0.6)",
  ];
  const borderColors = [
    "rgba(255, 99, 132, 1)",
    "rgba(54, 162, 235, 1)",
    "rgba(255, 206, 86, 1)",
    "rgba(255, 206, 86, 1)",
    "rgba(75, 192, 192, 1)",
    "rgba(153, 102, 255, 1)",
    "rgba(255, 159, 64, 1)",
    "rgba(199, 199, 199, 1)",
  ];

  // Chart colors from pre-defined array, based on label index
  const assignedBackgroundColors = chartLabels.map(
    (_, index) => colors[index % colors.length]
  );
  const assignedBorderColors = chartLabels.map(
    (_, index) => borderColors[index % borderColors.length]
  );

  if (chartData.length === 0) {
    noNilaiChartMessage.classList.remove("section-hidden");
    nilaiPerMapelChartCanvas.style.display = "none";
    if (dashboardChartInstance) {
      dashboardChartInstance.destroy();
      dashboardChartInstance = null;
    }
  } else {
    noNilaiChartMessage.classList.add("section-hidden");
    nilaiPerMapelChartCanvas.style.display = "block";
  }

  if (dashboardChartInstance) {
    dashboardChartInstance.destroy();
  }

  if (chartData.length > 0) {
    const ctx = nilaiPerMapelChartCanvas.getContext("2d");
    dashboardChartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: chartLabels,
        datasets: [
          {
            label: "Rata-rata Nilai",
            data: chartData,
            backgroundColor: assignedBackgroundColors, // Use assigned colors
            borderColor: assignedBorderColors, // Use assigned colors
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
          },
        },
        plugins: {
          legend: {
            display: false,
          },
        },
      },
    });
  }
}

// Function to handle global refresh button click
async function handleGlobalRefresh() {
  showLoadingOverlay();
  try {
    switch (activeSectionId) {
      case "guru-dashboard-section":
        console.log("--> Global Refresh: Refreshing Dashboard Guru data...");
        // Untuk dashboard guru, kita hanya perlu refresh data guru (yang sudah berisi insights)
        // dan kemudian render ulang dashboard insights.
        dataCache.guru = await fetchSheetData("Guru");
        if (currentLoggedInEmail) {
          const teacherFound = dataCache.guru.find(
            (t) => t.Email === currentLoggedInEmail
          );
          if (teacherFound) {
            currentLoggedInTeacherData = {
              ...teacherFound,
              // Memastikan Kelas_Diampu adalah string sebelum split, jika tidak, default ke array kosong
              Kelas_Diampu:
                typeof teacherFound.Kelas_Diampu === "string" &&
                teacherFound.Kelas_Diampu
                  ? teacherFound.Kelas_Diampu.split(",").map((c) => c.trim())
                  : [],
              Status: teacherFound.Status || "",
              Dashboard_Insights: teacherFound.Dashboard_Insights
                ? JSON.parse(teacherFound.Dashboard_Insights)
                : {},
            };
          }
        }
        renderDashboardInsights();
        showToast("Data dashboard berhasil diperbarui.", "success");
        break;
      case "manajemen-data-section":
        console.log("--> Global Refresh: Refreshing Manajemen Data...");
        dataCache.siswa = await fetchSheetData("Siswa");
        dataCache.tugas = await fetchSheetData("Tugas");
        dataCache.catatan_guru = await fetchSheetData("Catatan_Guru");
        dataCache.jadwal_pelajaran = await fetchSheetData("Jadwal_Pelajaran");
        dataCache.pengumuman = await fetchSheetData("Pengumuman");
        populateSiswaDropdownsGuru();
        populateMapelDropdownsGuru();
        // Assuming current tab will re-render its table, no specific table render needed here
        showToast("Data manajemen berhasil diperbarui.", "success");
        break;
      case "input-nilai-kehadiran-section":
        console.log(
          "--> Global Refresh: Refreshing Input Nilai & Kehadiran data..."
        );
        dataCache.siswa = await fetchSheetData("Siswa");
        dataCache.tugas = await fetchSheetData("Tugas");
        dataCache.kehadiran = await fetchSheetData("Kehadiran");
        populateSiswaDropdownsInput();
        populateTugasDropdownsInput();
        showToast("Data input berhasil diperbarui.", "success");
        break;
      case "rekap-data-section":
        console.log("--> Global Refresh: Refreshing Rekap Data Nilai...");
        dataCache.nilai = await fetchSheetData("Nilai");
        dataCache.siswa = await fetchSheetData("Siswa");
        dataCache.tugas = await fetchSheetData("Tugas");
        renderRekapNilaiTable();
        showToast("Data rekap nilai berhasil diperbarui.", "success");
        break;
      case "settings-section":
        console.log(
          "--> Global Refresh: Refreshing Pengaturan data (Profil Guru)..."
        );
        dataCache.guru = await fetchSheetData("Guru");
        if (currentLoggedInEmail) {
          const teacherFound = dataCache.guru.find(
            (teacher) => teacher.Email === currentLoggedInEmail
          );
          if (teacherFound) {
            currentLoggedInTeacherData = {
              ...teacherFound,
              // Memastikan Kelas_Diampu adalah string sebelum split, jika tidak, default ke array kosong
              Kelas_Diampu:
                typeof teacherFound.Kelas_Diampu === "string" &&
                teacherFound.Kelas_Diampu
                  ? teacherFound.Kelas_Diampu.split(",").map((c) => c.trim())
                  : [],
              Status: teacherFound.Status || "",
              Dashboard_Insights: teacherFound.Dashboard_Insights
                ? JSON.parse(teacherFound.Dashboard_Insights)
                : {},
            };
          }
        }
        displayTeacherProfileSettings(currentLoggedInTeacherData);
        showToast("Data profil berhasil diperbarui.", "success");
        break;
      default:
        console.warn(
          "Global Refresh: Tidak ada logika refresh yang ditentukan untuk section aktif:",
          activeSectionId
        );
        showToast(
          "Tidak ada data yang perlu diperbarui untuk bagian ini.",
          "info"
        );
    }
  } catch (error) {
    console.error("Error selama refresh global:", error);
    showToast("Gagal memperbarui data.", "error");
  } finally {
    hideLoadingOverlay();
  }
}

// --- Event Listener ---
function addAllEventListeners() {
  document
    .getElementById("login-form")
    ?.addEventListener("submit", handleLogin);

  document
    .getElementById("nis-search-form")
    ?.addEventListener("submit", handleNisSearch);

  // Global Refresh Button
  document
    .getElementById("global-refresh-btn")
    ?.addEventListener("click", handleGlobalRefresh);

  // Sidebar Buttons
  document.querySelectorAll(".sidebar-button").forEach((button) => {
    button.addEventListener("click", (e) => {
      const targetSection = e.currentTarget.dataset.targetSection;
      showSection(targetSection);
    });
  });

  document
    .getElementById("logout-admin-btn")
    ?.addEventListener("click", handleAdminLogout);

  document
    .getElementById("close-sidebar-btn")
    ?.addEventListener("click", () => {
      toggleSidebar(false); // Explicitly close the sidebar
    });

  document
    .getElementById("student-form")
    ?.addEventListener("submit", (e) =>
      handleSubmitForm(
        e,
        "Siswa",
        e.target.querySelector("#student-nis").readOnly ? "edit" : "add"
      )
    );

  // Removed individual refresh buttons, replaced by global one
  // document.getElementById("refresh-guru-data-btn")?.addEventListener("click", async () => { ... });
  // document.getElementById("refresh-manajemen-data-btn")?.addEventListener("click", () => { ... });
  // document.getElementById("refresh-input-data-btn")?.addEventListener("click", () => { ... });
  // document.getElementById("refresh-rekap-btn")?.addEventListener("click", async () => { ... });
  // document.getElementById("refresh-settings-data-btn")?.addEventListener("click", async () => { ... });

  const manajemenTabButtons = document.querySelectorAll(
    "#manajemen-data-section .tab-button"
  );
  manajemenTabButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      switchTab(event.target.dataset.target, "manajemen-data-section");
    });
  });

  document.getElementById("add-tugas-btn")?.addEventListener("click", () => {
    toggleInlineForm("tugas-inline-form-container", true);
    updateTugasIdField();
    populateMapelDropdownsGuru();
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

  document
    .getElementById("add-catatan-guru-btn")
    ?.addEventListener("click", () => {
      toggleInlineForm("catatan-inline-form-container", true);
      updateCatatanIdField();
      populateSiswaDropdownsGuru();
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
      populateMapelDropdownsGuru();
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

  const inputTabButtons = document.querySelectorAll(
    "#input-nilai-kehadiran-section .tab-button"
  );
  inputTabButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      switchTab(event.target.dataset.target, "input-nilai-kehadiran-section");
    });
  });
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

  document
    .getElementById("open-rekap-filter-modal-btn")
    ?.addEventListener("click", () => {
      openModal("rekap-filter-modal");
    });

  document
    .getElementById("apply-rekap-filter-modal-btn")
    ?.addEventListener("click", () => {
      closeModal("rekap-filter-modal");
      renderRekapNilaiTable();
    });

  document
    .getElementById("cancel-rekap-filter-btn")
    ?.addEventListener("click", () => {
      closeModal("rekap-filter-modal");
    });

  document.querySelectorAll(".modal-close-button").forEach((button) => {
    button.addEventListener("click", (e) => {
      const modal = e.target.closest(".modal");
      if (modal) {
        closeModal(modal.id);
      }
    });
  });

  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeModal(modal.id);
      }
    });
  });

  const settingsTabButtons = document.querySelectorAll(
    "#settings-section .tab-button"
  );
  settingsTabButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      switchTab(event.target.dataset.target, "settings-section");
    });
  });

  const sidebarToggleBtn = document.getElementById("sidebar-toggle-btn");
  const sidebarOverlay = document.getElementById("sidebar-overlay");

  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener("click", () => toggleSidebar(null)); // Toggle on click
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", () => toggleSidebar(false)); // Close on overlay click
  }

  window.addEventListener("resize", () => {
    const sidebar = document.getElementById("main-sidebar");
    const mainContentWrapper = document.getElementById("main-content-wrapper");
    if (sidebar.classList.contains("active")) {
      if (window.innerWidth >= 768) {
        mainContentWrapper.classList.add("sidebar-active-desktop");
      } else {
        mainContentWrapper.classList.remove("sidebar-active-desktop");
      }
    } else {
      mainContentWrapper.classList.remove("sidebar-active-desktop");
    }
  });
}

// --- Logika Inisialisasi Utama ---
document.addEventListener("DOMContentLoaded", async () => {
  addAllEventListeners(); // Pasang semua event listener setelah DOM siap
  updateHeaderDisplay(); // Atur tampilan header awal berdasarkan section aktif

  const loggedInEmailFromSession = sessionStorage.getItem("loggedInAdminEmail");
  if (loggedInEmailFromSession) {
    currentLoggedInEmail = loggedInEmailFromSession;
    showLoadingOverlay();
    try {
      dataCache.guru = await fetchSheetData("Guru");
      const teacherFound = dataCache.guru.find(
        (teacher) => teacher.Email === currentLoggedInEmail
      );

      if (teacherFound) {
        currentLoggedInTeacherData = {
          ...teacherFound,
          // Memastikan Kelas_Diampu adalah string sebelum split, jika tidak, default ke array kosong
          Kelas_Diampu:
            typeof teacherFound.Kelas_Diampu === "string" &&
            teacherFound.Kelas_Diampu
              ? teacherFound.Kelas_Diampu.split(",").map((c) => c.trim())
              : [],
          Status: teacherFound.Status || "",
          Dashboard_Insights: teacherFound.Dashboard_Insights
            ? JSON.parse(teacherFound.Dashboard_Insights)
            : {},
        };

        // LANGSUNG UPDATE UI UNTUK NAMA DAN GELAR GURU SAAT SESI DIPULIHKAN
        document.getElementById("guru-name-display").textContent =
          currentLoggedInTeacherData.Nama_Guru || "";
        let guruClassesText = "";
        if (
          Array.isArray(currentLoggedInTeacherData.Kelas_Diampu) && // Tambahkan pengecekan Array.isArray()
          currentLoggedInTeacherData.Kelas_Diampu.length > 0
        ) {
          guruClassesText = `Guru Kelas ${currentLoggedInTeacherData.Kelas_Diampu.join(
            ", "
          )}`;
        } else if (currentLoggedInTeacherData.Status) {
          guruClassesText = currentLoggedInTeacherData.Status;
        }
        document.getElementById("guru-title-display").textContent =
          guruClassesText;

        showToast("Sesi dipulihkan. Selamat datang kembali!", "info");
        // await fetchInitialDashboardData(); // No longer needed here as dashboard insights are pre-calculated

        const hash = window.location.hash.substring(1);
        const defaultSection = "guru-dashboard-section";

        if (hash && document.getElementById(hash)) {
          const allowedSections = [
            "guru-dashboard-section",
            "manajemen-data-section",
            "input-nilai-kehadiran-section",
            "rekap-data-section",
            "settings-section",
          ];
          if (allowedSections.includes(hash)) {
            showSection(hash);
          } else {
            showSection(defaultSection);
            history.replaceState(
              null,
              "",
              window.location.pathname + "#" + defaultSection
            );
          }
        } else {
          showSection(defaultSection);
          history.replaceState(
            null,
            "",
            window.location.pathname + "#" + defaultSection
          );
        }
        preloadOperationalData();
      } else {
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
    showSection("login-section");
    history.replaceState(null, "", window.location.pathname);
  }

  setTimeout(() => {
    const manajemenTabsContainer = document.getElementById(
      "tab-content-container-manajemen"
    );
    if (
      manajemenTabsContainer &&
      !manajemenTabsContainer.classList.contains("section-hidden")
    ) {
      switchTab("manajemen-data-tugas", "manajemen-data-section");
    }

    const inputTabsContainer = document.getElementById(
      "tab-content-container-input"
    );
    if (
      inputTabsContainer &&
      !inputTabsContainer.classList.contains("section-hidden")
    ) {
      switchTab("input-nilai", "input-nilai-kehadiran-section");
    }

    const settingsTabsContainer = document.getElementById(
      "tab-content-container-settings"
    );
    if (
      settingsTabsContainer &&
      !settingsTabsContainer.classList.contains("section-hidden")
    ) {
      switchTab("profile-settings", "settings-section");
    }
  }, 100);
});
