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
// selectedTaskIdForNilai removed as individual input is removed

let activeSectionId = "login-section"; // Initial active section

let dashboardChartInstance = null; // To store the Chart.js instance for the dashboard

// Global variables for massal table navigation
let massalInputElements = [];
let massalInputRows = 0;
let massalInputCols = 0;

// --- Utility Functions (shared) ---
function showLoadingOverlay() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    overlay.classList.remove("section-hidden");
    overlay.style.opacity = "1";
    overlay.style.visibility = "visible";
    overlay.style.display = "flex"; // Ensure it's displayed
  }
}

function hideLoadingOverlay() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    overlay.style.opacity = "0";
    overlay.style.visibility = "hidden";
    setTimeout(() => {
      overlay.classList.add("section-hidden");
      overlay.style.display = "none"; // Explicitly hide after transition
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

    // Fetch tugas, catatan, jadwal, pengumuman, kehadiran, dan nilai concurrently
    await Promise.all([
      (async () => {
        dataCache.tugas = await fetchSheetData("Tugas");
        populateTugasDropdownsInput();
        // populateTugasSelectionDropdown(); // Removed as individual input is removed
        updateTugasIdField();
      })(),
      (async () => {
        dataCache.catatan_guru = await fetchSheetData("Catatan_Guru");
        updateCatatanIdField();
      })(),
      (async () => {
        dataCache.jadwal_pelajaran = await fetchSheetData("Jadwal_Pelajaran");
        updateJadwalIdField();
      })(),
      (async () => {
        dataCache.pengumuman = await fetchSheetData("Pengumuman");
        updatePengumumanIdField();
      })(),
      (async () => {
        dataCache.kehadiran = await fetchSheetData("Kehadiran");
        updateKehadiranIdField();
      })(),
      (async () => {
        dataCache.nilai = await fetchSheetData("Nilai");
      })(),
    ]);

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
    console.error("Sidebar elements not found!");
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

    // Hide any open selection areas when changing sections that are not the target
    // These specific hides are for input-nilai-kehadiran-section to control its internal areas
    hideSelectionArea("tugas-subject-selection-area");
    // #input-mode-selection is now permanently hidden (or rather, no longer used for initial choice)
    document
      .getElementById("input-mode-selection")
      ?.classList.add("section-hidden");

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
        // populateTugasSelectionDropdown(); // Removed as individual input is removed

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
          "--> Mengaktifkan bagian Input Nilai & Kehadiran. Menggunakan data cache atau mengambil jika kosong."
        );

        // Pastikan tab container terlihat
        document
          .getElementById("tab-content-container-input")
          ?.classList.remove("section-hidden");

        // Panggil switchTab untuk mengaktifkan tab 'Input Nilai Massal' secara default
        // Ini juga akan menangani penyembunyian tab lain.
        switchTab("input-nilai-massal", "input-nilai-kehadiran-section");

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
        if (!dataCache.nilai || dataCache.nilai.length === 0) {
          dataCache.nilai = await fetchSheetData("Nilai");
          console.log(
            "    Fallback: Data Nilai diambil untuk Input Nilai (Massal)."
          );
        }

        populateSiswaDropdownsInput();
        populateTugasDropdownsInput();
        // populateTugasSelectionDropdown(); // Removed as individual input is removed
        populateMassalNilaiFilters(); // Populate filters for massal input
        // renderMassalNilaiTable(); // Initial render of the massal table when section is active - now triggered by button
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
            console.log(
              "Teacher data loaded for settings:",
              currentLoggedInTeacherData
            );
          } else {
            // If teacherData is not found, clear currentLoggedInTeacherData
            currentLoggedInTeacherData = null;
            console.warn("Teacher data not found in cache for settings.");
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

// UPDATE: Memperbarui fungsi untuk mengelola visibilitas header, sidebar, dan padding main
function updateHeaderDisplay() {
  const header = document.querySelector("header");
  const mainContent = document.querySelector("main"); // Dapatkan referensi ke elemen main
  const sidebar = document.getElementById("main-sidebar"); // Dapatkan referensi ke sidebar
  const mainContentWrapper = document.getElementById("main-content-wrapper"); // Dapatkan referensi ke main content wrapper

  if (!header || !mainContent || !sidebar || !mainContentWrapper) {
    console.error(
      "Header, main content, sidebar, or main content wrapper not found."
    );
    return;
  }

  if (activeSectionId === "login-section") {
    header.style.display = "none"; // Sembunyikan seluruh header
    sidebar.style.display = "none"; // Sembunyikan sidebar
    mainContent.style.paddingTop = "0px"; // Hapus padding-top pada main
    mainContentWrapper.style.marginLeft = "0px"; // Hapus margin-left pada main content wrapper
  } else {
    header.style.display = "flex"; // Tampilkan header (sesuai display flex yang ada)
    sidebar.style.display = "block"; // Tampilkan sidebar (sesuai default display)
    // Hitung tinggi sebenarnya dari header secara dinamis
    const headerHeight = header.offsetHeight; // Mendapatkan tinggi yang dirender termasuk padding dan border
    mainContent.style.paddingTop = `${headerHeight}px`; // Set padding-top berdasarkan tinggi header dinamis
    // Di desktop, main-content-wrapper memiliki margin-left untuk memberi ruang sidebar
    if (window.innerWidth >= 768) {
      mainContentWrapper.style.marginLeft = "256px"; // Atur margin-left sesuai lebar sidebar
    } else {
      mainContentWrapper.style.marginLeft = "0px"; // Pastikan 0 di mobile
    }
  }
  updateHeaderTitle(activeSectionId); // Set title berdasarkan section aktif
}

// Perubahan di sini: Mengosongkan teks judul header
function updateHeaderTitle(sectionId) {
  const headerTitleElement = document.getElementById("header-title");

  if (headerTitleElement) {
    // Hanya perbarui jika bukan halaman login, karena halaman login menyembunyikan header
    if (sectionId !== "login-section") {
      let titleText = "";
      switch (sectionId) {
        case "guru-dashboard-section":
          titleText = "Dashboard Guru";
          break;
        case "manajemen-data-section":
          titleText = "Manajemen Data";
          break;
        case "input-nilai-kehadiran-section":
          titleText = "Input Nilai & Kehadiran";
          break;
        case "rekap-data-section":
          titleText = "Rekap Data";
          break;
        case "settings-section":
          titleText = "Pengaturan";
          break;
        default:
          titleText = "SiswaLink Dashboard"; // Default title
      }
      headerTitleElement.textContent = titleText;
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

  // Specific logic for 'input-nilai-kehadiran-section'
  if (tabSectionId === "input-nilai-kehadiran-section") {
    // Hide specific input areas first.
    // Removed individual input areas as per request
    document
      .getElementById("massal-nilai-area")
      ?.classList.add("section-hidden");
    document.getElementById("input-kehadiran")?.classList.add("section-hidden"); // Ensure kehadiran is hidden too

    // Renamed "input-nilai-massal" to "input-nilai"
    if (targetId === "input-nilai-massal") {
      // This is now "Input Nilai"
      document
        .getElementById("massal-nilai-area")
        ?.classList.remove("section-hidden");
      renderMassalNilaiTable(); // Render ulang tabel massal
    } else if (targetId === "input-kehadiran") {
      document
        .getElementById("input-kehadiran")
        ?.classList.remove("section-hidden");
    }
  }
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
  console.log("Attempting login with email:", email);

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

      console.log(
        "Login successful! Teacher Data:",
        currentLoggedInTeacherData
      );

      // LANGSUNG UPDATE UI UNTUK NAMA DAN GELAR GURU SETELAH LOGIN
      const guruNameDisplay = document.getElementById("guru-name-display");
      const guruTitleDisplay = document.getElementById("guru-title-display");

      if (guruNameDisplay) {
        guruNameDisplay.textContent =
          currentLoggedInTeacherData.Nama_Guru || "";
      } else {
        console.warn("Element #guru-name-display not found!");
      }

      if (guruTitleDisplay) {
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
        guruTitleDisplay.textContent = guruClassesText;
      } else {
        console.warn("Element #guru-title-display not found!");
      }

      showToast("Login berhasil!", "success");

      // await fetchInitialDashboardData(); // No longer needed here as dashboard insights are pre-calculated
      showSection("guru-dashboard-section"); // This will now just reveal the section with pre-filled welcome text
    } else {
      showToast("Email tidak ditemukan. Silakan coba lagi.", "error");
      console.log("Login failed: Email not found.");
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
  } else {
    // Clear profile settings if no teacher data
    document.getElementById("profile-nama-guru").textContent = "-";
    document.getElementById("profile-email-guru").textContent = "-";
    document.getElementById("profile-kelas-diampu").textContent = "-";
    document.getElementById("profile-status-guru").textContent = "-";
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

// Removed generateNilaiId as individual input is removed.
// The massal input handles ID generation internally during submission.

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
  // Only for Kehadiran now
  const nisSelects = document.querySelectorAll("#kehadiran-nis");
  const siswaData = dataCache.siswa;

  if (!siswaData || siswaData.length === 0) {
    console.warn(
      "Data siswa kosong, tidak dapat mengisi dropdown input kehadiran."
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
  // This function is now only called when populating dropdowns for tasks
  // not directly used by the massal input table (which renders tasks dynamically).
  // Kept for consistency if future individual task selection is re-added or for other forms.
  const idTugasSelect = document.getElementById("nilai-id_tugas"); // This ID is likely removed from HTML
  if (idTugasSelect) {
    // Defensive check
    const currentSelectedValue = idTugasSelect ? idTugasSelect.value : "";
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

// populateTugasSelectionDropdown removed as individual input is removed

function populateMapelDropdownsGuru() {
  const tugasMapelSelect = document.getElementById("tugas-mata_pelajaran");
  const jadwalMapelSelect = document.getElementById("jadwal-mata_pelajaran");
  // tugasSelectionMapelSelect removed as individual input is removed
  const tugasSelectionMapelSelect = document.getElementById(
    "tugas-selection-mata_pelajaran"
  ); // Keep this for add new tugas modal

  const currentTugasMapel = tugasMapelSelect ? tugasMapelSelect.value : "";
  const currentJadwalMapel = jadwalMapelSelect ? jadwalMapelSelect.value : "";
  const currentTugasSelectionMapel = tugasSelectionMapelSelect
    ? tugasSelectionMapelSelect.value
    : "";

  // Clear existing options
  if (tugasMapelSelect) {
    tugasMapelSelect.innerHTML =
      '<option value="">Pilih Mata Pelajaran</option>';
  }
  if (jadwalMapelSelect) {
    jadwalMapelSelect.innerHTML =
      '<option value="">Pilih Mata Pelajaran</option>';
  }
  if (tugasSelectionMapelSelect) {
    // NEW: clear for selection dropdown for adding new tasks
    tugasSelectionMapelSelect.innerHTML =
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
    if (tugasSelectionMapelSelect) {
      // NEW: populate for selection dropdown for adding new tasks
      const option3 = document.createElement("option");
      option3.value = subject;
      option3.textContent = subject;
      tugasSelectionMapelSelect.appendChild(option3);
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
  if (
    // NEW: set selected value for selection dropdown for adding new tasks
    tugasSelectionMapelSelect &&
    currentTugasSelectionMapel &&
    tugasSelectionMapelSelect.querySelector(
      `option[value="${currentTugasSelectionMapel}"]`
    )
  ) {
    tugasSelectionMapelSelect.value = currentTugasSelectionMapel;
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

// updateNilaiIdField removed as individual input is removed.
// The massal input handles ID generation internally during submission.

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
async function openModal(modalId, isEdit = false, data = null) {
  // Added async here
  const modal = document.getElementById(modalId);
  if (!modal) {
    console.warn(
      `openModal: Elemen modal dengan ID '${modalId}' tidak ditemukan.`
    );
    return;
  }

  // NOTE: 'nilai-modal' and 'nilai-massal-modal' are now directly integrated as sections.
  // This function should only handle actual modals now.
  const validModalIds = [
    "student-modal",
    "kehadiran-modal",
    "rekap-filter-modal",
    "tugas-modal",
    "catatan-modal",
    "jadwal-modal",
    "pengumuman-modal",
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

  if (form) {
    form.reset(); // Reset form when opening modal for new entry
  }

  if (titleElement) {
    let defaultTitle = `Tambah ${modalId
      .replace("-modal", "")
      .replace("guru-data-", "")
      .replace("input-", "")
      .replace("-", " ") // Added to make "tugas-modal" -> "tugas modal"
      .replace(/\b\w/g, (char) => char.toUpperCase())} Baru`; // Capitalize first letter of each word
    if (isEdit) {
      defaultTitle = `Edit ${modalId
        .replace("-modal", "")
        .replace("guru-data-", "")
        .replace("input-", "")
        .replace("-", " ") // Added to make "tugas-modal" -> "tugas modal"
        .replace(/\b\w/g, (char) => char.toUpperCase())}`;
    }
    titleElement.textContent = defaultTitle;
  }

  switch (modalId) {
    case "student-modal":
      document.getElementById("student-nis").readOnly = false;
      if (isEdit && data) {
        document.getElementById("student-nis").value = data.NIS;
        document.getElementById("student-nis").readOnly = true;
        document.getElementById("student-nama").value = data.Nama;
        document.getElementById("student-kelas").value = data.Kelas;
        document.getElementById("student-wali_murid").value = data.Wali_Murid;
      }
      break;
    case "kehadiran-modal":
      updateKehadiranIdField();
      populateSiswaDropdownsInput();
      // Optionally pre-fill date with today's date if empty
      const kehadiranTanggalInput =
        document.getElementById("kehadiran-tanggal");
      if (kehadiranTanggalInput && !kehadiranTanggalInput.value) {
        kehadiranTanggalInput.valueAsDate = new Date();
      }
      break;
    case "rekap-filter-modal":
      populateRekapFilters();
      break;
    case "tugas-modal": // Handle Tugas Modal
      const tugasMataPelajaranSelect = document.getElementById(
        "tugas-mata_pelajaran"
      );
      if (data && data.mataPelajaran) {
        tugasMataPelajaranSelect.value = data.mataPelajaran;
        // Make it readonly and disabled
        tugasMataPelajaranSelect.readOnly = true;
        tugasMataPelajaranSelect.disabled = true;
      } else {
        // Ensure it's editable if no subject is passed (e.e.g., for edit mode later)
        tugasMataPelajaranSelect.readOnly = false;
        tugasMataPelajaranSelect.disabled = false;
      }
      updateTugasIdField(); // This will use the pre-filled subject
      populateMapelDropdownsGuru(); // This will ensure options are available
      break;
    case "catatan-modal": // Handle Catatan Guru Modal
      updateCatatanIdField();
      populateSiswaDropdownsGuru();
      break;
    case "jadwal-modal": // Handle Jadwal Pelajaran Modal
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
      break;
    case "pengumuman-modal": // Handle Pengumuman Modal
      updatePengumumanIdField();
      break;
  }
  modal.classList.add("active");
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  modal.classList.remove("active");

  // Reset form when closing the modal, regardless of how it was opened
  const form = modal.querySelector("form");
  if (form) {
    form.reset();
  }

  // Clear specific fields or re-populate dropdowns if needed after closing
  switch (modalId) {
    case "kehadiran-modal":
      populateSiswaDropdownsInput();
      break;
    case "rekap-filter-modal":
      break;
    case "tugas-modal":
      // Ensure the Mata Pelajaran field is re-enabled and not readonly after closing
      const tugasMataPelajaranSelect = document.getElementById(
        "tugas-mata_pelajaran"
      );
      if (tugasMataPelajaranSelect) {
        tugasMataPelajaranSelect.readOnly = false;
        tugasMataPelajaranSelect.disabled = false;
      }
      break;
    case "catatan-modal":
      populateSiswaDropdownsGuru();
      break;
    case "jadwal-modal":
      // Reset guru field to allow manual entry if needed or clear pre-filled
      const jadwalGuruInput = document.getElementById("jadwal-guru");
      if (jadwalGuruInput) {
        // Fixed variable name from jadwalInput to jadwalGuruInput
        jadwalGuruInput.value = "";
        jadwalGuruInput.readOnly = false;
        jadwalGuruInput.classList.remove("bg-gray-100", "cursor-not-allowed");
      }
      populateMapelDropdownsGuru();
      break;
    case "pengumuman-modal":
      break;
    default:
      console.warn(
        `closeModal dipanggil untuk ID yang tidak terduga: ${modalId}`
      );
      break;
  }
}

// NEW: Generic function to show/hide selection areas
function showSelectionArea(areaId) {
  const area = document.getElementById(areaId);
  if (area) {
    area.classList.remove("section-hidden");
  }
}

function hideSelectionArea(areaId) {
  const area = document.getElementById(areaId);
  if (area) {
    area.classList.add("section-hidden");
    // Optionally reset dropdowns in the area
    const selectElement = area.querySelector("select");
    if (selectElement) {
      selectElement.value = "";
    }
  }
}

// Helper to determine completion status
function getCompletionStatus(nilai) {
  const parsedNilai = parseInt(nilai);
  if (isNaN(parsedNilai)) return "Belum Input";
  return parsedNilai >= PASS_MARK ? "Tuntas" : "Belum Tuntas";
}

// NEW: Populate filters for massal nilai input table
function populateMassalNilaiFilters() {
  const massalFilterMapel = document.getElementById("massal-filter-mapel");
  const massalFilterTugas = document.getElementById("massal-filter-tugas");
  const massalFilterNamaSiswa = document.getElementById(
    "massal-filter-nama-siswa"
  ); // Get the new student name select

  if (!massalFilterMapel || !massalFilterTugas || !massalFilterNamaSiswa)
    return;

  // Populate Mata Pelajaran Filter
  massalFilterMapel.innerHTML =
    '<option value="">Pilih Mata Pelajaran</option>';
  HARDCODED_SUBJECTS.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    massalFilterMapel.appendChild(option);
  });

  // Populate Nama Siswa Filter
  const currentSelectedStudent = massalFilterNamaSiswa.value; // Preserve current selection
  massalFilterNamaSiswa.innerHTML = '<option value="">Semua Siswa</option>';

  if (dataCache.siswa && dataCache.siswa.length > 0) {
    const teacherClasses = currentLoggedInTeacherData?.Kelas_Diampu || [];
    const filteredSiswaForDropdown = dataCache.siswa.filter((siswa) =>
      teacherClasses.includes(siswa.Kelas)
    );
    filteredSiswaForDropdown.sort((a, b) => a.Nama.localeCompare(b.Nama)); // Sort alphabetically

    filteredSiswaForDropdown.forEach((siswa) => {
      const option = document.createElement("option");
      option.value = siswa.NIS; // Use NIS as value
      option.textContent = `${siswa.Nama} (${siswa.Kelas})`; // Display Name (Class)
      massalFilterNamaSiswa.appendChild(option);
    });
  }

  // Restore previous selection for student filter
  if (
    currentSelectedStudent &&
    massalFilterNamaSiswa.querySelector(
      `option[value="${currentSelectedStudent}"]`
    )
  ) {
    massalFilterNamaSiswa.value = currentSelectedStudent;
  }

  // Call updateMassalTugasFilter initially with the current selected mapel (or empty if none)
  updateMassalTugasFilter(massalFilterMapel.value);
}

// NEW FUNCTION: Updates the "Filter Tugas" dropdown based on selected "Mata Pelajaran"
function updateMassalTugasFilter(selectedMapel) {
  const massalFilterTugas = document.getElementById("massal-filter-tugas");
  if (!massalFilterTugas) return;

  // Preserve current selection if it's still valid, otherwise reset
  const currentSelectedTugas = massalFilterTugas.value;

  // Clear and add default option
  massalFilterTugas.innerHTML = '<option value="">Semua Tugas</option>'; // Changed to "Semua Tugas"

  if (!dataCache.tugas || dataCache.tugas.length === 0) {
    console.warn(
      "Data tugas kosong, tidak dapat mengisi dropdown tugas massal."
    );
    return;
  }

  const teacherClasses = currentLoggedInTeacherData?.Kelas_Diampu || [];
  let filteredTugas = dataCache.tugas.filter((tugas) => {
    // Filter by teacher's classes
    const tugasUntukKelas = tugas.Untuk_Kelas
      ? tugas.Untuk_Kelas.split(",").map((k) => k.trim())
      : [];
    const matchesTeacherClass =
      tugasUntukKelas.length === 0 ||
      tugasUntukKelas.includes("Semua") ||
      tugasUntukKelas.some((tKelas) => teacherClasses.includes(tKelas));

    // Filter by selected subject (if not "all" or empty)
    // If no subject is selected, do not filter by subject (i.e., return all tasks matching teacher's class)
    // If a subject is selected, filter by that subject.
    const matchesSubject =
      selectedMapel === "" ||
      selectedMapel === "all" ||
      tugas.Mata_Pelajaran === selectedMapel;

    return matchesTeacherClass && matchesSubject;
  });

  filteredTugas.sort((a, b) => a.Nama_Tugas.localeCompare(b.Nama_Tugas));

  filteredTugas.forEach((tugas) => {
    const option = document.createElement("option");
    option.value = tugas.ID_Tugas;
    option.textContent = `${tugas.Nama_Tugas} (${tugas.Mata_Pelajaran})`;
    massalFilterTugas.appendChild(option);
  });

  // Restore previous selection if it's still in the filtered list
  if (
    currentSelectedTugas &&
    massalFilterTugas.querySelector(`option[value="${currentSelectedTugas}"]`)
  ) {
    massalFilterTugas.value = currentSelectedTugas;
  }
}

// NEW: Function to render the massal nilai input table
async function renderMassalNilaiTable() {
  const massalInputsContainer = document.getElementById("massal-nilai-inputs");
  const filterMapel =
    document.getElementById("massal-filter-mapel")?.value || ""; // Default to empty string for "Pilih..."
  const filterTugas =
    document.getElementById("massal-filter-tugas")?.value || ""; // Default to empty string for "Pilih..."
  const filterNISSiswa = // Renamed from filterNamaSiswa to filterNISSiswa
    document.getElementById("massal-filter-nama-siswa")?.value || ""; // Value will be NIS, or "" for "Semua Siswa"

  // Check if both mapel and tugas filters are selected (nama siswa filter is optional)
  if (!filterMapel || !filterTugas) {
    massalInputsContainer.innerHTML = `
      <p class="text-gray-500 text-center p-4">
        Pilih Mata Pelajaran dan Tugas, lalu klik "Terapkan Filter"
        untuk menampilkan data.
      </p>
    `;
    // Clear navigation data as no table is rendered
    massalInputElements = [];
    massalInputRows = 0;
    massalInputCols = 0;
    return; // Exit function if mapel or tugas filters are not selected
  }

  massalInputsContainer.innerHTML =
    '<p class="text-gray-500 text-center p-4">Memuat daftar siswa...</p>'; // Show loading

  if (!dataCache.siswa || dataCache.siswa.length === 0) {
    massalInputsContainer.innerHTML =
      '<p class="text-red-500 text-center p-4">Data siswa tidak tersedia.</p>';
    return;
  }
  if (!dataCache.tugas || dataCache.tugas.length === 0) {
    massalInputsContainer.innerHTML =
      '<p class="text-red-500 text-center p-4">Data tugas tidak tersedia.</p>';
    return;
  }
  if (!dataCache.nilai || dataCache.nilai.length === 0) {
    // Ensure nilai data is available
    dataCache.nilai = await fetchSheetData("Nilai");
    console.log("DEBUG: Data Nilai diambil untuk render massal table.");
  }

  const teacherClasses = currentLoggedInTeacherData?.Kelas_Diampu || [];
  let relevantStudents = dataCache.siswa.filter(
    (siswa) =>
      teacherClasses.includes(siswa.Kelas) &&
      (filterNISSiswa === "" || String(siswa.NIS) === filterNISSiswa) // Use NIS for filtering
  );

  let relevantTasks = dataCache.tugas.filter((tugas) => {
    const tugasUntukKelas = tugas.Untuk_Kelas
      ? tugas.Untuk_Kelas.split(",").map((k) => k.trim())
      : [];
    const matchesTeacherClass =
      tugasUntukKelas.length === 0 ||
      tugasUntukKelas.includes("Semua") ||
      tugasUntukKelas.some((tKelas) => teacherClasses.includes(tKelas));

    // Filter by selected subject
    const matchesSubject =
      filterMapel === "" ||
      filterMapel === "all" ||
      tugas.Mata_Pelajaran === filterMapel;

    return matchesTeacherClass && matchesSubject;
  });

  // Apply specific task filter only if a specific task is selected (not "Semua Tugas" which has value="")
  // This is the crucial part for "Semua Tugas" functionality.
  if (filterTugas !== "") {
    relevantTasks = relevantTasks.filter((t) => t.ID_Tugas === filterTugas);
  }

  if (relevantStudents.length === 0 || relevantTasks.length === 0) {
    massalInputsContainer.innerHTML =
      '<p class="text-gray-500 text-center p-4">Tidak ada siswa atau tugas yang cocok dengan filter yang dipilih.</p>';
    // Clear navigation data
    massalInputElements = [];
    massalInputRows = 0;
    massalInputCols = 0;
    return;
  }

  relevantStudents.sort((a, b) => a.Nama.localeCompare(b.Nama)); // Sort students alphabetically

  let tableHtml = `
    <table class="min-w-full divide-y divide-gray-200">
      <thead class="bg-gray-50">
        <tr>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama Siswa</th>
  `;

  // Add task headers dynamically
  relevantTasks.forEach((task) => {
    tableHtml += `
      <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
        ${task.Nama_Tugas} <span class="text-gray-400">(${task.Mata_Pelajaran})</span>
      </th>
    `;
  });

  tableHtml += `
        </tr>
      </thead>
      <tbody class="bg-white divide-y divide-gray-200">
  `;

  relevantStudents.forEach((siswa, rowIndex) => {
    tableHtml += `
      <tr>
        <td class="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">${siswa.Nama} (${siswa.NIS})</td>
    `;

    relevantTasks.forEach((task, colIndex) => {
      const existingNilai = dataCache.nilai.find(
        (n) =>
          String(n.NIS) === String(siswa.NIS) &&
          String(n.ID_Tugas) === String(task.ID_Tugas)
      );

      const nilaiValue = existingNilai ? existingNilai.Nilai : "";
      const statusText = getCompletionStatus(nilaiValue);
      const statusClass =
        statusText === "Tuntas"
          ? "text-green-600"
          : statusText === "Belum Tuntas"
          ? "text-red-600"
          : "text-gray-500";

      tableHtml += `
        <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
          <input
            type="number"
            name="nilai-${siswa.NIS}-${task.ID_Tugas}"
            class="massal-nilai-input shadow appearance-none border rounded w-24 py-1 px-2 text-gray-700 leading-tight focus:outline-none focus:shadow-outline text-sm"
            placeholder="Nilai"
            min="0"
            max="100"
            value="${nilaiValue}"
            data-nis="${siswa.NIS}"
            data-id-tugas="${task.ID_Tugas}"
            data-row-index="${rowIndex}"
            data-col-index="${colIndex}"
            oninput="updateMassalStatus(this)"
          />
          <span id="status-${siswa.NIS}-${task.ID_Tugas}" class="ml-2 text-xs font-semibold ${statusClass}">
            ${statusText}
          </span>
        </td>
      `;
    });

    tableHtml += `
      </tr>
    `;
  });

  tableHtml += `
      </tbody>
    </table>
  `;
  massalInputsContainer.innerHTML = tableHtml;

  // After rendering, update navigation data
  updateMassalNavigationData();
}

// Function to update status text automatically on input change
function updateMassalStatus(inputElement) {
  const nilai = inputElement.value;
  const nis = inputElement.dataset.nis;
  const idTugas = inputElement.dataset.idTugas;
  const statusSpan = document.getElementById(`status-${nis}-${idTugas}`);

  if (statusSpan) {
    if (nilai === "") {
      statusSpan.textContent = "Belum Input";
      statusSpan.className = "ml-2 text-xs font-semibold text-gray-500";
    } else {
      const status = getCompletionStatus(nilai);
      statusSpan.textContent = status;
      statusSpan.className = `ml-2 text-xs font-semibold ${
        status === "Tuntas" ? "text-green-600" : "text-red-600"
      }`;
    }
  }
}

// Global variables and helper to update their values after table render
function updateMassalNavigationData() {
  massalInputElements = Array.from(
    document.querySelectorAll(".massal-nilai-input")
  );
  if (massalInputElements.length > 0) {
    // Find max row and col indices to determine dimensions
    const maxRow = Math.max(
      ...massalInputElements.map((input) => parseInt(input.dataset.rowIndex))
    );
    const maxCol = Math.max(
      ...massalInputElements.map((input) => parseInt(input.dataset.colIndex))
    );
    massalInputRows = maxRow + 1;
    massalInputCols = maxCol + 1;
  } else {
    massalInputRows = 0;
    massalInputCols = 0;
  }
}

function handleMassalInputNavigation(event) {
  const target = event.target;
  if (!target.classList.contains("massal-nilai-input")) {
    return;
  }

  const currentRow = parseInt(target.dataset.rowIndex);
  const currentCol = parseInt(target.dataset.colIndex);

  let nextInput = null;

  if (event.key === "Enter") {
    event.preventDefault(); // Prevent form submission
    const nextRow = currentRow + 1;
    if (nextRow < massalInputRows) {
      nextInput = document.querySelector(
        `input[data-row-index="${nextRow}"][data-col-index="${currentCol}"]`
      );
    } else {
      // If at the end of the current column, move to the next column's first row, or simply blur
      // For now, let's keep it simple and just blur
      target.blur();
    }
  } else if (event.key === "Tab") {
    event.preventDefault(); // Prevent default tab behavior
    const nextCol = currentCol + 1;
    if (nextCol < massalInputCols) {
      nextInput = document.querySelector(
        `input[data-row-index="${currentRow}"][data-col-index="${nextCol}"]`
      );
    } else {
      // End of row, move to next row, first column
      const nextRow = currentRow + 1;
      if (nextRow < massalInputRows) {
        nextInput = document.querySelector(
          `input[data-row-index="${nextRow}"][data-col-index="0"]`
        );
      } else {
        // If at the very last input, allow normal tab behavior to move out of the table
        // For now, let's just blur
        target.blur();
      }
    }
  }

  if (nextInput) {
    nextInput.focus();
  }
}

async function handleSubmitForm(event, sheetName, formType = "add") {
  event.preventDefault();
  const form = event.target;

  // Get current modal ID to close it after submission (only for actual modals)
  // Note: Nilai form is now inline, so currentModal will be null for it.
  const currentModal = form.closest(".modal");
  const currentModalId = currentModal ? currentModal.id : null;

  showLoadingOverlay();

  let result;
  if (sheetName === "Nilai" && form.id === "nilai-massal-form") {
    // Handle massal nilai submission
    const nilaiDataArray = [];
    const massalInputs = document.querySelectorAll(
      "#massal-nilai-inputs input[type='number']"
    );

    massalInputs.forEach((inputElement) => {
      const nis = inputElement.dataset.nis;
      const idTugas = inputElement.dataset.idTugas;
      const nilai = inputElement.value;

      // Only process if nilai is provided
      if (nilai !== "") {
        const parsedNilai = parseInt(nilai);
        const status = getCompletionStatus(parsedNilai);
        const tanggalInput = new Date().toISOString().split("T")[0]; // Current date

        const existingNilai = dataCache.nilai.find(
          (n) =>
            String(n.NIS) === String(nis) &&
            String(n.ID_Tugas) === String(idTugas)
        );

        const dataEntry = {
          ID_Nilai: existingNilai
            ? existingNilai.ID_Nilai
            : `NIL-${nis}-${Date.now()}-${Math.random()
                .toString(36)
                .substring(2, 8)}`, // More robust unique ID
          NIS: nis,
          ID_Tugas: idTugas,
          Nilai: parsedNilai,
          Status_Pengerjaan: status,
          Tanggal_Input: tanggalInput,
        };
        nilaiDataArray.push(dataEntry);
      }
    });

    if (nilaiDataArray.length === 0) {
      showToast("Tidak ada nilai yang diinputkan untuk disimpan.", "info");
      hideLoadingOverlay();
      return;
    }

    try {
      let allSuccess = true;
      for (const dataEntry of nilaiDataArray) {
        const operation = dataCache.nilai.some(
          (n) => n.ID_Nilai === dataEntry.ID_Nilai
        )
          ? "update"
          : "add";
        const batchResult =
          operation === "add"
            ? await postSheetData(sheetName, dataEntry)
            : await updateSheetData(sheetName, "ID_Nilai", dataEntry);

        if (!batchResult.success) {
          allSuccess = false;
          console.error(
            `Failed to save data for NIS ${dataEntry.NIS} and Tugas ${dataEntry.ID_Tugas}: ${batchResult.message}`
          );
        }
      }

      if (allSuccess) {
        showToast("Semua nilai berhasil disimpan.", "success");
        result = { success: true };
      } else {
        showToast(
          "Beberapa nilai gagal disimpan. Periksa konsol untuk detail.",
          "error"
        );
        result = { success: false };
      }
    } catch (error) {
      console.error("Error submitting massal nilai:", error);
      showToast("Terjadi kesalahan saat menyimpan nilai massal.", "error");
      result = { success: false, message: "Kesalahan saat menyimpan massal." };
    }
  } else {
    // Handle single form submission (only for other modals now)
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
      // Exclude disabled inputs from data submission unless specifically needed
      if (input.disabled) return;

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

      data[headerKey] = input.value; // For other forms, direct value is fine
    });

    try {
      if (formType === "add") {
        result = await postSheetData(sheetName, data);
      } else if (formType === "edit") {
        let idColumn;
        if (sheetName === "Siswa") idColumn = "NIS";
        else if (sheetName === "Tugas") idColumn = "ID_Tugas";
        // Nilai is no longer edited individually
        else if (sheetName === "Kehadiran") idColumn = "ID_Kehadiran";
        else if (sheetName === "Catatan_Guru") idColumn = "ID_Catatan";
        else if (sheetName === "Jadwal_Pelajaran") idColumn = "ID_Jadwal";
        else if (sheetName === "Pengumuman") idColumn = "ID_Pengumuman";
        else idColumn = "ID"; // Fallback, though better to be explicit

        result = await updateSheetData(sheetName, idColumn, data);
      }
    } catch (error) {
      console.error(`Error submitting single form to ${sheetName}:`, error);
      showToast(`Terjadi kesalahan saat menyimpan data ${sheetName}.`, "error");
      result = { success: false, message: "Terjadi kesalahan jaringan." };
    }
  }

  if (result.success) {
    // Close the modal AFTER successful submission, only if it was a modal
    if (currentModalId) {
      closeModal(currentModalId);
    }
    // No specific handling for individual nilai form as it's removed

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
          // populateTugasSelectionDropdown(); // Removed as individual input is removed
          populateMassalNilaiFilters(); // NEW: Refresh massal filters
          // renderDashboardInsights(); // Tidak perlu render di sini
          break;
        case "Nilai":
          dataCache.nilai = await fetchSheetData("Nilai");
          // updateNilaiIdField(); // Removed as individual input is removed
          if (activeSectionId === "rekap-data-section") {
            renderRekapNilaiTable();
          }
          // Jika kita di area input massal, refresh tabelnya, TAPI HANYA JIKA FILTER SUDAH TERISI
          const currentMassalMapelFilter = document.getElementById(
            "massal-filter-mapel"
          )?.value;
          const currentMassalTugasFilter = document.getElementById(
            "massal-filter-tugas"
          )?.value;
          if (currentMassalMapelFilter && currentMassalTugasFilter) {
            renderMassalNilaiTable();
          } else {
            // If filters are not set, ensure the message is displayed correctly
            document.getElementById("massal-nilai-inputs").innerHTML = `
                  <p class="text-gray-500 text-center p-4">
                      Pilih Mata Pelajaran dan Tugas, lalu klik "Terapkan Filter"
                      untuk menampilkan data.
                  </p>
              `;
            updateMassalNavigationData(); // Clear navigation data
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
        // populateTugasSelectionDropdown(); // Removed as individual input is removed
        populateMassalNilaiFilters(); // NEW: refresh massal filters
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
        dataCache.nilai = await fetchSheetData("Nilai"); // Ensure nilai data is refreshed
        populateSiswaDropdownsInput();
        populateTugasDropdownsInput();
        // populateTugasSelectionDropdown(); // Removed as individual input is removed
        populateMassalNilaiFilters(); // NEW: refresh massal filters
        // Re-render massal table if it's the active view, and filters are already selected.
        // Otherwise, it will just show the "select filters" message.
        const currentMassalMapelFilter = document.getElementById(
          "massal-filter-mapel"
        )?.value;
        const currentMassalTugasFilter = document.getElementById(
          "massal-filter-tugas"
        )?.value;
        if (currentMassalMapelFilter && currentMassalTugasFilter) {
          renderMassalNilaiTable();
        } else {
          // If filters are not set, ensure the message is displayed correctly
          document.getElementById("massal-nilai-inputs").innerHTML = `
                <p class="text-gray-500 text-center p-4">
                    Pilih Mata Pelajaran dan Tugas, lalu klik "Terapkan Filter"
                    untuk menampilkan data.
                </p>
            `;
          updateMassalNavigationData(); // Clear navigation data
        }
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

  const closeSidebarBtn = document.getElementById("close-sidebar-btn");
  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener("click", () => {
      toggleSidebar(false); // Explicitly close the sidebar
    });
  } else {
    console.warn("Element #close-sidebar-btn not found!");
  }

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
      // Only close if the click is directly on the modal backdrop, not its content
      if (e.target === modal) {
        closeModal(modal.id);
      }
    });
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

  const manajemenTabButtons = document.querySelectorAll(
    "#manajemen-data-section .tab-button"
  );
  manajemenTabButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      switchTab(event.target.dataset.target, "manajemen-data-section");
    });
  });

  // NEW: Tugas selection area logic
  document.getElementById("add-tugas-btn")?.addEventListener("click", () => {
    populateMapelDropdownsGuru(); // Ensure the dropdown is fresh
    showSelectionArea("tugas-subject-selection-area");
  });

  document
    .getElementById("continue-add-tugas-btn")
    ?.addEventListener("click", () => {
      const selectedSubject = document.getElementById(
        "tugas-selection-mata_pelajaran"
      ).value;
      if (selectedSubject) {
        hideSelectionArea("tugas-subject-selection-area");
        openModal("tugas-modal", false, { mataPelajaran: selectedSubject });
      } else {
        showToast("Pilih Mata Pelajaran terlebih dahulu!", "error");
      }
    });

  document
    .getElementById("cancel-tugas-selection-btn")
    ?.addEventListener("click", () => {
      hideSelectionArea("tugas-subject-selection-area");
    });

  document
    .getElementById("tugas-form")
    ?.addEventListener("submit", (e) => handleSubmitForm(e, "Tugas"));
  document
    .getElementById("tugas-mata_pelajaran")
    ?.addEventListener("change", updateTugasIdField);

  // Updated to submit form, not just toggle. The modal is opened via onclick in HTML.
  document
    .getElementById("catatan-form")
    ?.addEventListener("submit", (e) => handleSubmitForm(e, "Catatan_Guru"));
  document
    .getElementById("catatan-nis")
    ?.addEventListener("change", updateCatatanIdField);
  document
    .getElementById("catatan-minggu_ke")
    ?.addEventListener("input", updateCatatanIdField);

  // Updated to submit form, not just toggle. The modal is opened via onclick in HTML.
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

  // Updated to submit form, not just toggle. The modal is opened via onclick in HTML.
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

  // Removed all individual input logic as per request:
  // - continue-nilai-input-btn
  // - cancel-nilai-selection-btn
  // - cancel-individual-nilai-input-btn
  // - nilai-form submit listener
  // - nilai-nis change listener
  // - nilai-id_tugas change listener (was already less critical)

  // NEW: Nilai massal form submission and filter events
  document
    .getElementById("nilai-massal-form")
    ?.addEventListener("submit", (e) => handleSubmitForm(e, "Nilai", "add"));
  // These filter changes no longer auto-render, only populate filters
  document
    .getElementById("massal-filter-mapel")
    ?.addEventListener("change", (event) => {
      updateMassalTugasFilter(event.target.value); // Update tugas filter based on mapel selection
      // Clear massal table content and show instruction message
      document.getElementById("massal-nilai-inputs").innerHTML = `
      <p class="text-gray-500 text-center p-4">
          Pilih Mata Pelajaran dan Tugas, lalu klik "Terapkan Filter"
          untuk menampilkan data.
      </p>
    `;
      updateMassalNavigationData(); // Clear navigation data
    });
  // document.getElementById("massal-filter-tugas")?.addEventListener("change", renderMassalNilaiTable);
  document
    .getElementById("apply-massal-filter-btn")
    ?.addEventListener("click", renderMassalNilaiTable); // Only this button renders

  document
    .getElementById("cancel-massal-input-btn")
    ?.addEventListener("click", () => {
      const massalInputsContainer = document.getElementById(
        "massal-nilai-inputs"
      );
      if (massalInputsContainer) {
        massalInputsContainer.innerHTML = `
                <p class="text-gray-500 text-center p-4">
                    Pilih Mata Pelajaran dan Tugas, lalu klik "Terapkan Filter"
                    untuk menampilkan data.
                </p>
            `;
        // Clear filters
        document.getElementById("massal-filter-mapel").value = "";
        document.getElementById("massal-filter-tugas").value = "";
        document.getElementById("massal-filter-nama-siswa").value = ""; // NEW: Clear nama siswa filter
        updateMassalNavigationData(); // Clear navigation data
      }
    });

  // NEW: Add keydown listener for massal input navigation
  const massalInputsContainer = document.getElementById("massal-nilai-inputs");
  if (massalInputsContainer) {
    massalInputsContainer.addEventListener(
      "keydown",
      handleMassalInputNavigation
    );
  }

  // NEW: Add event listener for massal student name filter (now a select dropdown)
  document
    .getElementById("massal-filter-nama-siswa")
    ?.addEventListener("change", renderMassalNilaiTable);

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
    .getElementById("apply-rekap-filter-modal-btn")
    ?.addEventListener("click", () => {
      closeModal("rekap-filter-modal");
      renderRekapNilaiTable();
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
  } else {
    console.warn("Element #sidebar-toggle-btn not found!");
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", () => toggleSidebar(false)); // Close on overlay click
  } else {
    console.warn("Element #sidebar-overlay not found!");
  }

  window.addEventListener("resize", () => {
    const sidebar = document.getElementById("main-sidebar");
    const mainContentWrapper = document.getElementById("main-content-wrapper");
    if (sidebar && mainContentWrapper) {
      // Add null checks
      if (sidebar.classList.contains("active")) {
        if (window.innerWidth >= 768) {
          mainContentWrapper.classList.add("sidebar-active-desktop");
        } else {
          mainContentWrapper.classList.remove("sidebar-active-desktop");
        }
      } else {
        mainContentWrapper.classList.remove("sidebar-active-desktop");
      }
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
        console.log(
          "Session restored. Teacher Data:",
          currentLoggedInTeacherData
        );

        // LANGSUNG UPDATE UI UNTUK NAMA DAN GELAR GURU SAAT SESI DIPULIHKAN
        const guruNameDisplay = document.getElementById("guru-name-display");
        const guruTitleDisplay = document.getElementById("guru-title-display");

        if (guruNameDisplay) {
          guruNameDisplay.textContent =
            currentLoggedInTeacherData.Nama_Guru || "";
        } else {
          console.warn(
            "Element #guru-name-display not found during session restore!"
          );
        }

        if (guruTitleDisplay) {
          let guruClassesText = "";
          if (
            Array.isArray(currentLoggedInTeacherData.Kelas_Diampu) &&
            currentLoggedInTeacherData.Kelas_Diampu.length > 0
          ) {
            guruClassesText = `Guru Kelas ${currentLoggedInTeacherData.Kelas_Diampu.join(
              ", "
            )}`;
          } else if (currentLoggedInTeacherData.Status) {
            guruClassesText = currentLoggedInTeacherData.Status;
          }
          guruTitleDisplay.textContent = guruClassesText;
        } else {
          console.warn(
            "Element #guru-title-display not found during session restore!"
          );
        }

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
        console.log(
          "Session restore failed: Teacher data not found for email."
        );
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

  // Initial tab switching logic for sections that are not the login section
  // This is a fallback to ensure tabs are correctly displayed on load/refresh
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
    // This part now correctly calls switchTab, which handles the default view for input-nilai-massal
    if (
      inputTabsContainer &&
      !inputTabsContainer.classList.contains("section-hidden")
    ) {
      // Initialize with massal input view, which will show "select filters" message
      switchTab("input-nilai-massal", "input-nilai-kehadiran-section");
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
