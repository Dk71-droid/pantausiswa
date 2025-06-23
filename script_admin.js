// Ganti URL ini dengan URL Web App Google Apps Script Anda setelah di-deploy
const GOOGLE_APPS_SCRIPT_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbwZEByXGKCa-s4sSPHBtM5GQuZHTjNWkgDWzUgpGXkaO66_mvWiakXnufxX_jd5lYwqdw/exec";
const PASS_MARK = 75; // Nilai minimum untuk status "Tuntas" - (used in value configuration)

// Daftar mata pelajaran (digunakan untuk filter dan pembuatan ID Tugas)
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

// Pemetaan singkatan mata pelajaran untuk ID Tugas
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

// Cache sisi klien untuk data yang diambil guna mengurangi panggilan API
const dataCache = {
  siswa: null, // Inisialisasi dengan null untuk menunjukkan belum diambil
  tugas: null,
  nilai: null,
  kehadiran: null,
  catatan_guru: null,
  jadwal_pelajaran: null,
  pengumuman: null,
  admin_users: null, // Ditambahkan untuk daftar admin
};

// Variabel untuk menyimpan instance Chart.js
let nilaiChartInstance = null;
let kehadiranChartInstance = null;

// ===========================================
// FUNGSI UTILITY (Serbaguna)
// ===========================================

/**
 * Menampilkan overlay loading.
 */
function showLoadingOverlay() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    overlay.style.opacity = "1";
    overlay.style.visibility = "visible";
  }
}

/**
 * Menyembunyikan overlay loading.
 */
function hideLoadingOverlay() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    overlay.style.opacity = "0";
    overlay.style.visibility = "hidden";
  }
}

/**
 * Menampilkan pesan toast (notifikasi singkat).
 * @param {string} message - Pesan yang akan ditampilkan.
 * @param {string} type - Tipe pesan (misalnya, 'success', 'error', 'info', 'warning').
 */
function showToast(message, type = "info") {
  const toastContainer = document.getElementById("toast-container");
  if (!toastContainer) {
    console.error("Toast container not found!");
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast-message ${type}`;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  // Animasi masuk
  setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  // Animasi keluar dan hapus setelah beberapa detik
  setTimeout(() => {
    toast.classList.remove("show");
    toast.classList.add("hide");
    toast.addEventListener(
      "transitionend",
      () => {
        toast.remove();
      },
      { once: true }
    );
  }, 4000); // Tampilkan selama 4 detik
}

/**
 * Mengirim permintaan ke Google Apps Script Web App.
 * @param {object} payload - Data yang akan dikirim dalam permintaan.
 * @returns {Promise<object>} - Resolves dengan respons dari Apps Script.
 */
async function sendRequestToGAS(payload) {
  showLoadingOverlay();
  try {
    const response = await fetch(GOOGLE_APPS_SCRIPT_WEB_APP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Error sending request to GAS:", error);
    showToast(`Error: ${error.message}`, "error");
    throw error; // Re-throw to allow caller to handle it
  } finally {
    hideLoadingOverlay();
  }
}

/**
 * Menampilkan bagian tertentu dan menyembunyikan yang lain.
 * @param {string} sectionId - ID dari bagian yang akan ditampilkan.
 */
function showSection(sectionId) {
  document.querySelectorAll("section").forEach((section) => {
    if (section.id === sectionId) {
      section.classList.remove("section-hidden");
    } else {
      section.classList.add("section-hidden");
    }
  });
}

/**
 * Mengelola tampilan tab di dashboard admin.
 * @param {string} activeTabId - ID dari tombol tab yang aktif.
 * @param {NodeListOf<Element>} tabButtons - Semua tombol tab.
 */
function switchAdminTab(activeTabId, tabButtons) {
  tabButtons.forEach((button) => {
    if (button.id === activeTabId) {
      button.classList.add("bg-blue-600", "text-white");
      button.classList.remove("bg-gray-200", "text-gray-700");
    } else {
      button.classList.remove("bg-blue-600", "text-white");
      button.classList.add("bg-gray-200", "text-gray-700");
    }
  });

  const allTabContents = document.querySelectorAll(".tab-content-admin");
  allTabContents.forEach((content) => {
    if (content.id === activeTabId.replace("-tab-button", "-content")) {
      content.classList.remove("section-hidden");
    } else {
      content.classList.add("section-hidden");
    }
  });
}

/**
 * Menampilkan modal konfirmasi.
 * @param {string} title - Judul modal.
 * @param {string} message - Pesan konfirmasi.
 * @returns {Promise<boolean>} - Resolves true jika OK, false jika Batal.
 */
function showConfirmationModal(title, message) {
  return new Promise((resolve) => {
    const modal = document.getElementById("confirm-modal");
    const modalTitle = document.getElementById("confirm-modal-title");
    const modalMessage = document.getElementById("confirm-modal-message");
    const okButton = document.getElementById("confirm-ok-btn");
    const cancelButton = document.getElementById("confirm-cancel-btn");

    modalTitle.textContent = title;
    modalMessage.textContent = message;

    modal.classList.add("show"); // Tampilkan modal

    const handleOk = () => {
      hideConfirmationModal();
      okButton.removeEventListener("click", handleOk);
      cancelButton.removeEventListener("click", handleCancel);
      resolve(true);
    };

    const handleCancel = () => {
      hideConfirmationModal();
      okButton.removeEventListener("click", handleOk);
      cancelButton.removeEventListener("click", handleCancel);
      resolve(false);
    };

    okButton.addEventListener("click", handleOk);
    cancelButton.addEventListener("click", handleCancel);
  });
}

/**
 * Menyembunyikan modal konfirmasi.
 */
function hideConfirmationModal() {
  const modal = document.getElementById("confirm-modal");
  modal.classList.remove("show"); // Sembunyikan modal
}

// ===========================================
// FUNGSI PENGOLAHAN DATA
// ===========================================

/**
 * Mengambil semua data dari Google Sheet.
 * @param {string} sheetName - Nama sheet yang akan diambil.
 * @returns {Promise<Array>} - Array objek data.
 */
async function fetchData(sheetName) {
  try {
    const response = await sendRequestToGAS({
      action: "read",
      sheetName: sheetName,
    });
    if (response.success) {
      return response.data;
    } else {
      showToast(
        `Gagal mengambil data ${sheetName}: ${response.message}`,
        "error"
      );
      return [];
    }
  } catch (error) {
    console.error(`Error fetching ${sheetName} data:`, error);
    showToast(`Error: Gagal mengambil data ${sheetName}.`, "error");
    return [];
  }
}

/**
 * Memuat semua data dashboard admin dari Google Sheet ke cache.
 */
async function loadAdminDashboardData() {
  showLoadingOverlay();
  try {
    dataCache.siswa = await fetchData("Siswa");
    dataCache.tugas = await fetchData("Tugas");
    dataCache.nilai = await fetchData("Nilai");
    dataCache.kehadiran = await fetchData("Kehadiran");
    dataCache.catatan_guru = await fetchData("Catatan_Guru");
    dataCache.jadwal_pelajaran = await fetchData("Jadwal_Pelajaran");
    dataCache.pengumuman = await fetchData("Pengumuman");
    dataCache.admin_users = await fetchData("Admin_Users"); // Ambil daftar admin

    renderSiswaTable(dataCache.siswa);
    renderTugasTable(dataCache.tugas);
    renderNilaiTable(dataCache.nilai);
    renderKehadiranTable(dataCache.kehadiran);
    renderCatatanGuruTable(dataCache.catatan_guru);
    renderJadwalPelajaranTable(dataCache.jadwal_pelajaran);
    renderPengumumanTable(dataCache.pengumuman);
    renderAdminUsersTable(dataCache.admin_users);

    // Perbarui dropdown siswa di semua form CRUD yang memerlukannya
    populateSiswaDropdowns();
    populateTugasDropdowns();
    populateKelasDropdowns();
    populateMapelDropdowns();
    updateTugasIdField();
    updateNilaiIdField();
    updateKehadiranIdField();
    updateCatatanIdField();
    updateJadwalIdField();
    updatePengumumanIdField();
    updateAdminUserIdField();

    showToast("Data dashboard admin berhasil dimuat.", "success");
  } catch (error) {
    console.error("Error loading admin dashboard data:", error);
    showToast("Gagal memuat data dashboard admin.", "error");
  } finally {
    hideLoadingOverlay();
  }
}

// ===========================================
// FUNGSI RENDERING TABEL
// ===========================================

/**
 * Merender tabel siswa.
 * @param {Array<object>} siswaData - Data siswa.
 */
function renderSiswaTable(siswaData) {
  const tableBody = document.getElementById("siswa-table-body");
  if (!tableBody) return;
  tableBody.innerHTML = "";
  siswaData.forEach((siswa) => {
    const row = `
      <tr class="border-b last:border-b-0">
        <td class="px-4 py-2">${siswa.NIS}</td>
        <td class="px-4 py-2">${siswa.Nama}</td>
        <td class="px-4 py-2">${siswa.Kelas}</td>
        <td class="px-4 py-2">${siswa.Wali_Murid}</td>
        <td class="px-4 py-2">
          <button onclick="editSiswa('${siswa.NIS}')" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fas fa-edit"></i> Edit</button>
          <button onclick="deleteSiswa('${siswa.NIS}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i> Hapus</button>
        </td>
      </tr>
    `;
    tableBody.insertAdjacentHTML("beforeend", row);
  });
}

/**
 * Merender tabel tugas.
 * @param {Array<object>} tugasData - Data tugas.
 */
function renderTugasTable(tugasData) {
  const tableBody = document.getElementById("tugas-table-body");
  if (!tableBody) return;
  tableBody.innerHTML = "";
  tugasData.forEach((tugas) => {
    const row = `
      <tr class="border-b last:border-b-0">
        <td class="px-4 py-2">${tugas.ID_Tugas}</td>
        <td class="px-4 py-2">${tugas.Nama_Tugas}</td>
        <td class="px-4 py-2">${tugas.Mata_Pelajaran}</td>
        <td class="px-4 py-2">${tugas.Batas_Waktu}</td>
        <td class="px-4 py-2">${tugas.Untuk_Kelas}</td>
        <td class="px-4 py-2">
          <button onclick="editTugas('${tugas.ID_Tugas}')" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fas fa-edit"></i> Edit</button>
          <button onclick="deleteTugas('${tugas.ID_Tugas}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i> Hapus</button>
        </td>
      </tr>
    `;
    tableBody.insertAdjacentHTML("beforeend", row);
  });
}

/**
 * Merender tabel nilai.
 * @param {Array<object>} nilaiData - Data nilai.
 */
function renderNilaiTable(nilaiData) {
  const tableBody = document.getElementById("nilai-table-body");
  if (!tableBody) return;
  tableBody.innerHTML = "";
  nilaiData.forEach((nilai) => {
    const row = `
      <tr class="border-b last:border-b-0">
        <td class="px-4 py-2">${nilai.ID_Nilai}</td>
        <td class="px-4 py-2">${nilai.NIS}</td>
        <td class="px-4 py-2">${nilai.ID_Tugas}</td>
        <td class="px-4 py-2">${nilai.Nilai}</td>
        <td class="px-4 py-2">${nilai.Status_Pengerjaan}</td>
        <td class="px-4 py-2">${nilai.Tanggal_Input}</td>
        <td class="px-4 py-2">
          <button onclick="editNilai('${nilai.ID_Nilai}')" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fas fa-edit"></i> Edit</button>
          <button onclick="deleteNilai('${nilai.ID_Nilai}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i> Hapus</button>
        </td>
      </tr>
    `;
    tableBody.insertAdjacentHTML("beforeend", row);
  });
}

/**
 * Merender tabel kehadiran.
 * @param {Array<object>} kehadiranData - Data kehadiran.
 */
function renderKehadiranTable(kehadiranData) {
  const tableBody = document.getElementById("kehadiran-table-body");
  if (!tableBody) return;
  tableBody.innerHTML = "";
  kehadiranData.forEach((kehadiran) => {
    const row = `
      <tr class="border-b last:border-b-0">
        <td class="px-4 py-2">${kehadiran.ID_Kehadiran}</td>
        <td class="px-4 py-2">${kehadiran.NIS}</td>
        <td class="px-4 py-2">${kehadiran.Tanggal}</td>
        <td class="px-4 py-2">${kehadiran.Status}</td>
        <td class="px-4 py-2">
          <button onclick="editKehadiran('${kehadiran.ID_Kehadiran}')" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fas fa-edit"></i> Edit</button>
          <button onclick="deleteKehadiran('${kehadiran.ID_Kehadiran}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i> Hapus</button>
        </td>
      </tr>
    `;
    tableBody.insertAdjacentHTML("beforeend", row);
  });
}

/**
 * Merender tabel catatan guru.
 * @param {Array<object>} catatanData - Data catatan guru.
 */
function renderCatatanGuruTable(catatanData) {
  const tableBody = document.getElementById("catatan-table-body");
  if (!tableBody) return;
  tableBody.innerHTML = "";
  catatanData.forEach((catatan) => {
    const row = `
      <tr class="border-b last:border-b-0">
        <td class="px-4 py-2">${catatan.ID_Catatan}</td>
        <td class="px-4 py-2">${catatan.NIS}</td>
        <td class="px-4 py-2">${catatan.Minggu_Ke}</td>
        <td class="px-4 py-2">${catatan.Catatan}</td>
        <td class="px-4 py-2">${catatan.Tanggal_Input}</td>
        <td class="px-4 py-2">
          <button onclick="editCatatan('${catatan.ID_Catatan}')" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fas fa-edit"></i> Edit</button>
          <button onclick="deleteCatatan('${catatan.ID_Catatan}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i> Hapus</button>
        </td>
      </tr>
    `;
    tableBody.insertAdjacentHTML("beforeend", row);
  });
}

/**
 * Merender tabel jadwal pelajaran.
 * @param {Array<object>} jadwalData - Data jadwal pelajaran.
 */
function renderJadwalPelajaranTable(jadwalData) {
  const tableBody = document.getElementById("jadwal-table-body");
  if (!tableBody) return;
  tableBody.innerHTML = "";
  jadwalData.forEach((jadwal) => {
    const row = `
      <tr class="border-b last:border-b-0">
        <td class="px-4 py-2">${jadwal.ID_Jadwal}</td>
        <td class="px-4 py-2">${jadwal.Kelas}</td>
        <td class="px-4 py-2">${jadwal.Hari}</td>
        <td class="px-4 py-2">${jadwal.Jam}</td>
        <td class="px-4 py-2">${jadwal.Mata_Pelajaran}</td>
        <td class="px-4 py-2">${jadwal.Guru}</td>
        <td class="px-4 py-2">
          <button onclick="editJadwal('${jadwal.ID_Jadwal}')" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fas fa-edit"></i> Edit</button>
          <button onclick="deleteJadwal('${jadwal.ID_Jadwal}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i> Hapus</button>
        </td>
      </tr>
    `;
    tableBody.insertAdjacentHTML("beforeend", row);
  });
}

/**
 * Merender tabel pengumuman.
 * @param {Array<object>} pengumumanData - Data pengumuman.
 */
function renderPengumumanTable(pengumumanData) {
  const tableBody = document.getElementById("pengumuman-table-body");
  if (!tableBody) return;
  tableBody.innerHTML = "";
  pengumumanData.forEach((pengumuman) => {
    const row = `
      <tr class="border-b last:border-b-0">
        <td class="px-4 py-2">${pengumuman.ID_Pengumuman}</td>
        <td class="px-4 py-2">${pengumuman.Judul}</td>
        <td class="px-4 py-2">${pengumuman.Isi_Pengumuman.substring(
          0,
          50
        )}...</td>
        <td class="px-4 py-2">${pengumuman.Tanggal_Pengumuman}</td>
        <td class="px-4 py-2">${pengumuman.Untuk_Kelas}</td>
        <td class="px-4 py-2">
          <button onclick="editPengumuman('${
            pengumuman.ID_Pengumuman
          }')" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fas fa-edit"></i> Edit</button>
          <button onclick="deletePengumuman('${
            pengumuman.ID_Pengumuman
          }')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i> Hapus</button>
        </td>
      </tr>
    `;
    tableBody.insertAdjacentHTML("beforeend", row);
  });
}

/**
 * Merender tabel Admin_Users.
 * @param {Array<object>} adminUserData - Data pengguna admin.
 */
function renderAdminUsersTable(adminUserData) {
  const tableBody = document.getElementById("admin-users-table-body");
  if (!tableBody) return;
  tableBody.innerHTML = "";
  adminUserData.forEach((admin) => {
    const row = `
      <tr class="border-b last:border-b-0">
        <td class="px-4 py-2">${admin.Email}</td>
        <td class="px-4 py-2">
          <button onclick="editAdminUser('${admin.Email}')" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fas fa-edit"></i> Edit</button>
          <button onclick="deleteAdminUser('${admin.Email}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i> Hapus</button>
        </td>
      </tr>
    `;
    tableBody.insertAdjacentHTML("beforeend", row);
  });
}

// ===========================================
// FUNGSI POPULATE DROPDOWN
// ===========================================

/**
 * Mengisi dropdown siswa di form CRUD.
 */
function populateSiswaDropdowns() {
  const siswaNisSelects = document.querySelectorAll(".siswa-nis-select");
  siswaNisSelects.forEach((select) => {
    select.innerHTML = '<option value="">Pilih NIS Siswa</option>';
    if (dataCache.siswa) {
      dataCache.siswa.forEach((siswa) => {
        const option = document.createElement("option");
        option.value = siswa.NIS;
        option.textContent = `${siswa.NIS} - ${siswa.Nama}`;
        select.appendChild(option);
      });
    }
  });
}

/**
 * Mengisi dropdown tugas di form Nilai.
 */
function populateTugasDropdowns() {
  const nilaiTugasSelect = document.getElementById("nilai-id-tugas");
  if (nilaiTugasSelect) {
    nilaiTugasSelect.innerHTML = '<option value="">Pilih ID Tugas</option>';
    if (dataCache.tugas) {
      dataCache.tugas.forEach((tugas) => {
        const option = document.createElement("option");
        option.value = tugas.ID_Tugas;
        option.textContent = `${tugas.ID_Tugas} - ${tugas.Nama_Tugas}`;
        nilaiTugasSelect.appendChild(option);
      });
    }
  }
}

/**
 * Mengisi dropdown kelas.
 */
function populateKelasDropdowns() {
  const kelasSelects = document.querySelectorAll(".kelas-select");
  const uniqueClasses = [
    ...new Set(dataCache.siswa.map((s) => s.Kelas)),
  ].sort();
  kelasSelects.forEach((select) => {
    select.innerHTML = '<option value="">Pilih Kelas</option>';
    uniqueClasses.forEach((kelas) => {
      const option = document.createElement("option");
      option.value = kelas;
      option.textContent = kelas;
      select.appendChild(option);
    });
    // Tambahkan opsi "Semua" untuk pengumuman/tugas jika relevan
    if (
      select.id === "pengumuman-untuk-kelas" ||
      select.id === "tugas-untuk-kelas"
    ) {
      const allOption = document.createElement("option");
      allOption.value = "Semua";
      allOption.textContent = "Semua Kelas";
      select.prepend(allOption); // Tambahkan di awal
    }
  });
}

/**
 * Mengisi dropdown mata pelajaran.
 */
function populateMapelDropdowns() {
  const mapelSelects = document.querySelectorAll(".mapel-select");
  mapelSelects.forEach((select) => {
    select.innerHTML = '<option value="">Pilih Mata Pelajaran</option>';
    HARDCODED_SUBJECTS.forEach((mapel) => {
      const option = document.createElement("option");
      option.value = mapel;
      option.textContent = mapel;
      select.appendChild(option);
    });
  });
}

// ===========================================
// FUNGSI PEMBUAT ID OTOMATIS
// ===========================================

/**
 * Menghasilkan ID unik sederhana.
 * @returns {string} - ID unik.
 */
function generateUniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

/**
 * Menghasilkan ID Tugas berdasarkan mata pelajaran dan jumlah tugas yang ada.
 * Format: [SingkatanMapel]-[YYMM]-[Urutan]
 * @param {string} mataPelajaran - Mata pelajaran untuk tugas.
 * @returns {string} - ID Tugas yang dihasilkan.
 */
function generateTugasId(mataPelajaran) {
  if (!mataPelajaran) {
    return "MTK-YYMM-XXX"; // Placeholder
  }
  const abbreviation = SUBJECT_ABBREVIATIONS[mataPelajaran] || "OTH"; // Default ke OTH (Other)
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, "0");

  const existingTugasCount = dataCache.tugas.filter((t) =>
    t.ID_Tugas.startsWith(`${abbreviation}-${year}${month}`)
  ).length;

  const newSequence = (existingTugasCount + 1).toString().padStart(3, "0");
  return `${abbreviation}-${year}${month}-${newSequence}`;
}

/**
 * Memperbarui field ID Tugas.
 */
function updateTugasIdField() {
  const tugasIdInput = document.getElementById("tugas-id");
  const tugasMapelSelect = document.getElementById("tugas-mata-pelajaran");
  if (tugasIdInput && tugasMapelSelect) {
    if (tugasIdInput.readOnly) {
      tugasIdInput.value = generateTugasId(tugasMapelSelect.value);
    } else {
      tugasIdInput.value = ""; // Kosongkan jika tidak readonly (untuk edit)
    }
  }
}

/**
 * Memperbarui field ID Nilai.
 */
function updateNilaiIdField() {
  const nilaiIdInput = document.getElementById("nilai-id");
  if (nilaiIdInput) {
    nilaiIdInput.value = nilaiIdInput.readOnly ? generateUniqueId() : "";
  }
}

/**
 * Memperbarui field ID Kehadiran.
 */
function updateKehadiranIdField() {
  const kehadiranIdInput = document.getElementById("kehadiran-id");
  if (kehadiranIdInput) {
    kehadiranIdInput.value = kehadiranIdInput.readOnly
      ? generateUniqueId()
      : "";
  }
}

/**
 * Memperbarui field ID Catatan Guru.
 */
function updateCatatanIdField() {
  const catatanIdInput = document.getElementById("catatan-id");
  if (catatanIdInput) {
    catatanIdInput.value = catatanIdInput.readOnly ? generateUniqueId() : "";
  }
}

/**
 * Memperbarui field ID Jadwal.
 */
function updateJadwalIdField() {
  const jadwalIdInput = document.getElementById("jadwal-id");
  if (jadwalIdInput) {
    jadwalIdInput.value = jadwalIdInput.readOnly ? generateUniqueId() : "";
  }
}

/**
 * Memperbarui field ID Pengumuman.
 */
function updatePengumumanIdField() {
  const pengumumanIdInput = document.getElementById("pengumuman-id");
  if (pengumumanIdInput) {
    pengumumanIdInput.value = pengumumanIdInput.readOnly
      ? generateUniqueId()
      : "";
  }
}

/**
 * Memperbarui field Email Admin User.
 */
function updateAdminUserIdField() {
  const adminEmailInput = document.getElementById("admin-email");
  if (adminEmailInput) {
    adminEmailInput.value = adminEmailInput.readOnly ? "" : ""; // Email diisi manual atau untuk edit
  }
}

// ===========================================
// FUNGSI CRUD SISWA
// ===========================================

/**
 * Mengisi form Siswa untuk penambahan atau pengeditan.
 * @param {object} siswaData - Data siswa untuk diisi (kosong untuk tambah baru).
 * @param {boolean} isEdit - True jika mode edit, false jika mode tambah.
 */
function fillSiswaForm(siswaData = {}, isEdit = false) {
  document.getElementById("siswa-nis").value = siswaData.NIS || "";
  document.getElementById("siswa-nama").value = siswaData.Nama || "";
  document.getElementById("siswa-kelas").value = siswaData.Kelas || "";
  document.getElementById("siswa-wali-murid").value =
    siswaData.Wali_Murid || "";

  const nisInput = document.getElementById("siswa-nis");
  nisInput.readOnly = isEdit;
  if (isEdit) {
    nisInput.classList.add("bg-gray-100", "cursor-not-allowed");
  } else {
    nisInput.classList.remove("bg-gray-100", "cursor-not-allowed");
  }
}

/**
 * Menambahkan atau memperbarui siswa.
 */
async function addOrUpdateSiswa() {
  const nis = document.getElementById("siswa-nis").value;
  const nama = document.getElementById("siswa-nama").value;
  const kelas = document.getElementById("siswa-kelas").value;
  const waliMurid = document.getElementById("siswa-wali-murid").value;

  if (!nis || !nama || !kelas || !waliMurid) {
    showToast("Semua field siswa harus diisi.", "warning");
    return;
  }

  const isEdit = document.getElementById("siswa-nis").readOnly;
  const action = isEdit ? "update" : "create";
  const payload = {
    sheetName: "Siswa",
    action: action,
    NIS: nis, // Menggunakan NIS sebagai ID unik untuk update
    data: {
      NIS: nis,
      Nama: nama,
      Kelas: kelas,
      Wali_Murid: waliMurid,
    },
  };

  const confirmMessage = isEdit
    ? `Apakah Anda yakin ingin memperbarui data siswa NIS ${nis}?`
    : `Apakah Anda yakin ingin menambahkan siswa NIS ${nis}?`;
  const confirmed = await showConfirmationModal(
    "Konfirmasi Aksi",
    confirmMessage
  );
  if (!confirmed) return;

  try {
    const result = await sendRequestToGAS(payload);
    if (result.success) {
      showToast(result.message, "success");
      // Muat ulang data untuk memperbarui tabel
      await loadAdminDashboardData();
      // Kosongkan form setelah operasi berhasil
      fillSiswaForm({});
    } else {
      showToast(result.message, "error");
    }
  } catch (error) {
    console.error("Error add/update siswa:", error);
    showToast("Gagal melakukan operasi siswa.", "error");
  }
}

/**
 * Mengisi form Siswa untuk pengeditan.
 * @param {string} nis - NIS siswa yang akan diedit.
 */
function editSiswa(nis) {
  const siswa = dataCache.siswa.find((s) => String(s.NIS) === String(nis));
  if (siswa) {
    fillSiswaForm(siswa, true);
    showToast(`Mengedit data siswa NIS: ${nis}`, "info");
  } else {
    showToast("Siswa tidak ditemukan untuk diedit.", "error");
  }
}

/**
 * Menghapus data siswa.
 * @param {string} nis - NIS siswa yang akan dihapus.
 */
async function deleteSiswa(nis) {
  const confirmed = await showConfirmationModal(
    "Konfirmasi Hapus",
    `Apakah Anda yakin ingin menghapus data siswa NIS ${nis}? Ini akan menghapus semua data terkait siswa ini (nilai, kehadiran, catatan).`
  );
  if (!confirmed) return;

  try {
    const result = await sendRequestToGAS({
      sheetName: "Siswa",
      action: "delete",
      NIS: nis, // Menggunakan NIS sebagai ID unik untuk delete
    });

    if (result.success) {
      showToast(result.message, "success");
      await loadAdminDashboardData(); // Muat ulang semua data terkait
      fillSiswaForm({}); // Kosongkan form
    } else {
      showToast(result.message, "error");
    }
  } catch (error) {
    console.error("Error delete siswa:", error);
    showToast("Gagal menghapus siswa.", "error");
  }
}

// ===========================================
// FUNGSI CRUD TUGAS
// ===========================================

/**
 * Mengisi form Tugas untuk penambahan atau pengeditan.
 * @param {object} tugasData - Data tugas untuk diisi (kosong untuk tambah baru).
 * @param {boolean} isEdit - True jika mode edit, false jika mode tambah.
 */
function fillTugasForm(tugasData = {}, isEdit = false) {
  document.getElementById("tugas-id").value =
    tugasData.ID_Tugas || (isEdit ? "" : "Dihasilkan Otomatis");
  document.getElementById("tugas-id").readOnly = !isEdit; // ID tugas readonly jika bukan edit
  if (!isEdit) {
    document
      .getElementById("tugas-id")
      .classList.add("bg-gray-100", "cursor-not-allowed");
  } else {
    document
      .getElementById("tugas-id")
      .classList.remove("bg-gray-100", "cursor-not-allowed");
  }
  document.getElementById("tugas-nama").value = tugasData.Nama_Tugas || "";
  document.getElementById("tugas-mata-pelajaran").value =
    tugasData.Mata_Pelajaran || "";
  document.getElementById("tugas-batas-waktu").value =
    tugasData.Batas_Waktu || "";
  document.getElementById("tugas-untuk-kelas").value =
    tugasData.Untuk_Kelas || "";

  updateTugasIdField(); // Perbarui ID saat mata pelajaran berubah jika dalam mode tambah
}

/**
 * Menambahkan atau memperbarui tugas.
 */
async function addOrUpdateTugas() {
  let idTugas = document.getElementById("tugas-id").value;
  const namaTugas = document.getElementById("tugas-nama").value;
  const mataPelajaran = document.getElementById("tugas-mata-pelajaran").value;
  const batasWaktu = document.getElementById("tugas-batas-waktu").value;
  const untukKelas = document.getElementById("tugas-untuk-kelas").value;

  if (!namaTugas || !mataPelajaran || !batasWaktu || !untukKelas) {
    showToast("Semua field tugas harus diisi.", "warning");
    return;
  }

  const isEdit = document.getElementById("tugas-id").readOnly === false; // true if editable (edit mode)
  const action = isEdit ? "update" : "create";

  if (!isEdit) {
    // Generate ID for new task
    idTugas = generateTugasId(mataPelajaran);
  }

  const payload = {
    sheetName: "Tugas",
    action: action,
    ID_Tugas: idTugas, // Menggunakan ID_Tugas sebagai ID unik untuk update
    data: {
      ID_Tugas: idTugas,
      Nama_Tugas: namaTugas,
      Mata_Pelajaran: mataPelajaran,
      Batas_Waktu: batasWaktu,
      Untuk_Kelas: untukKelas,
    },
  };

  const confirmMessage = isEdit
    ? `Apakah Anda yakin ingin memperbarui tugas ID ${idTugas}?`
    : `Apakah Anda yakin ingin menambahkan tugas ID ${idTugas}?`;
  const confirmed = await showConfirmationModal(
    "Konfirmasi Aksi",
    confirmMessage
  );
  if (!confirmed) return;

  try {
    const result = await sendRequestToGAS(payload);
    if (result.success) {
      showToast(result.message, "success");
      await loadAdminDashboardData();
      fillTugasForm({});
    } else {
      showToast(result.message, "error");
    }
  } catch (error) {
    console.error("Error add/update tugas:", error);
    showToast("Gagal melakukan operasi tugas.", "error");
  }
}

/**
 * Mengisi form Tugas untuk pengeditan.
 * @param {string} idTugas - ID tugas yang akan diedit.
 */
function editTugas(idTugas) {
  const tugas = dataCache.tugas.find(
    (t) => String(t.ID_Tugas) === String(idTugas)
  );
  if (tugas) {
    fillTugasForm(tugas, true);
    showToast(`Mengedit data tugas ID: ${idTugas}`, "info");
  } else {
    showToast("Tugas tidak ditemukan untuk diedit.", "error");
  }
}

/**
 * Menghapus data tugas.
 * @param {string} idTugas - ID tugas yang akan dihapus.
 */
async function deleteTugas(idTugas) {
  const confirmed = await showConfirmationModal(
    "Konfirmasi Hapus",
    `Apakah Anda yakin ingin menghapus tugas ID ${idTugas}? Ini juga akan menghapus nilai terkait tugas ini.`
  );
  if (!confirmed) return;

  try {
    const result = await sendRequestToGAS({
      sheetName: "Tugas",
      action: "delete",
      ID_Tugas: idTugas, // Menggunakan ID_Tugas sebagai ID unik untuk delete
    });

    if (result.success) {
      showToast(result.message, "success");
      await loadAdminDashboardData();
      fillTugasForm({});
    } else {
      showToast(result.message, "error");
    }
  } catch (error) {
    console.error("Error delete tugas:", error);
    showToast("Gagal menghapus tugas.", "error");
  }
}

// ===========================================
// FUNGSI CRUD NILAI
// ===========================================

/**
 * Mengisi form Nilai untuk penambahan atau pengeditan.
 * @param {object} nilaiData - Data nilai untuk diisi (kosong untuk tambah baru).
 * @param {boolean} isEdit - True jika mode edit, false jika mode tambah.
 */
function fillNilaiForm(nilaiData = {}, isEdit = false) {
  document.getElementById("nilai-id").value =
    nilaiData.ID_Nilai || (isEdit ? "" : "Dihasilkan Otomatis");
  document.getElementById("nilai-id").readOnly = !isEdit;
  if (!isEdit) {
    document
      .getElementById("nilai-id")
      .classList.add("bg-gray-100", "cursor-not-allowed");
  } else {
    document
      .getElementById("nilai-id")
      .classList.remove("bg-gray-100", "cursor-not-allowed");
  }
  document.getElementById("nilai-nis").value = nilaiData.NIS || "";
  document.getElementById("nilai-id-tugas").value = nilaiData.ID_Tugas || "";
  document.getElementById("nilai-nilai").value = nilaiData.Nilai || "";
  document.getElementById("nilai-status-pengerjaan").value =
    nilaiData.Status_Pengerjaan || "";
  document.getElementById("nilai-tanggal-input").value =
    nilaiData.Tanggal_Input || new Date().toISOString().split("T")[0];

  updateNilaiIdField();
}

/**
 * Menambahkan atau memperbarui nilai.
 */
async function addOrUpdateNilai() {
  let idNilai = document.getElementById("nilai-id").value;
  const nis = document.getElementById("nilai-nis").value;
  const idTugas = document.getElementById("nilai-id-tugas").value;
  const nilai = document.getElementById("nilai-nilai").value;
  const statusPengerjaan = document.getElementById(
    "nilai-status-pengerjaan"
  ).value;
  const tanggalInput = document.getElementById("nilai-tanggal-input").value;

  if (!nis || !idTugas || !nilai || !statusPengerjaan || !tanggalInput) {
    showToast("Semua field nilai harus diisi.", "warning");
    return;
  }

  const isEdit = document.getElementById("nilai-id").readOnly === false;
  const action = isEdit ? "update" : "create";

  if (!isEdit) {
    idNilai = generateUniqueId();
  }

  const payload = {
    sheetName: "Nilai",
    action: action,
    ID_Nilai: idNilai,
    data: {
      ID_Nilai: idNilai,
      NIS: nis,
      ID_Tugas: idTugas,
      Nilai: nilai,
      Status_Pengerjaan: statusPengerjaan,
      Tanggal_Input: tanggalInput,
    },
  };

  const confirmMessage = isEdit
    ? `Apakah Anda yakin ingin memperbarui nilai ID ${idNilai}?`
    : `Apakah Anda yakin ingin menambahkan nilai baru?`;
  const confirmed = await showConfirmationModal(
    "Konfirmasi Aksi",
    confirmMessage
  );
  if (!confirmed) return;

  try {
    const result = await sendRequestToGAS(payload);
    if (result.success) {
      showToast(result.message, "success");
      await loadAdminDashboardData();
      fillNilaiForm({});
    } else {
      showToast(result.message, "error");
    }
  } catch (error) {
    console.error("Error add/update nilai:", error);
    showToast("Gagal melakukan operasi nilai.", "error");
  }
}

/**
 * Mengisi form Nilai untuk pengeditan.
 * @param {string} idNilai - ID nilai yang akan diedit.
 */
function editNilai(idNilai) {
  const nilai = dataCache.nilai.find(
    (n) => String(n.ID_Nilai) === String(idNilai)
  );
  if (nilai) {
    fillNilaiForm(nilai, true);
    showToast(`Mengedit data nilai ID: ${idNilai}`, "info");
  } else {
    showToast("Nilai tidak ditemukan untuk diedit.", "error");
  }
}

/**
 * Menghapus data nilai.
 * @param {string} idNilai - ID nilai yang akan dihapus.
 */
async function deleteNilai(idNilai) {
  const confirmed = await showConfirmationModal(
    "Konfirmasi Hapus",
    `Apakah Anda yakin ingin menghapus nilai ID ${idNilai}?`
  );
  if (!confirmed) return;

  try {
    const result = await sendRequestToGAS({
      sheetName: "Nilai",
      action: "delete",
      ID_Nilai: idNilai,
    });

    if (result.success) {
      showToast(result.message, "success");
      await loadAdminDashboardData();
      fillNilaiForm({});
    } else {
      showToast(result.message, "error");
    }
  } catch (error) {
    console.error("Error delete nilai:", error);
    showToast("Gagal menghapus nilai.", "error");
  }
}

// ===========================================
// FUNGSI CRUD KEHADIRAN
// ===========================================

/**
 * Mengisi form Kehadiran untuk penambahan atau pengeditan.
 * @param {object} kehadiranData - Data kehadiran untuk diisi (kosong untuk tambah baru).
 * @param {boolean} isEdit - True jika mode edit, false jika mode tambah.
 */
function fillKehadiranForm(kehadiranData = {}, isEdit = false) {
  document.getElementById("kehadiran-id").value =
    kehadiranData.ID_Kehadiran || (isEdit ? "" : "Dihasilkan Otomatis");
  document.getElementById("kehadiran-id").readOnly = !isEdit;
  if (!isEdit) {
    document
      .getElementById("kehadiran-id")
      .classList.add("bg-gray-100", "cursor-not-allowed");
  } else {
    document
      .getElementById("kehadiran-id")
      .classList.remove("bg-gray-100", "cursor-not-allowed");
  }
  document.getElementById("kehadiran-nis").value = kehadiranData.NIS || "";
  document.getElementById("kehadiran-tanggal").value =
    kehadiranData.Tanggal || new Date().toISOString().split("T")[0];
  document.getElementById("kehadiran-status").value =
    kehadiranData.Status || "";

  updateKehadiranIdField();
}

/**
 * Menambahkan atau memperbarui kehadiran.
 */
async function addOrUpdateKehadiran() {
  let idKehadiran = document.getElementById("kehadiran-id").value;
  const nis = document.getElementById("kehadiran-nis").value;
  const tanggal = document.getElementById("kehadiran-tanggal").value;
  const status = document.getElementById("kehadiran-status").value;

  if (!nis || !tanggal || !status) {
    showToast("Semua field kehadiran harus diisi.", "warning");
    return;
  }

  const isEdit = document.getElementById("kehadiran-id").readOnly === false;
  const action = isEdit ? "update" : "create";

  if (!isEdit) {
    idKehadiran = generateUniqueId();
  }

  const payload = {
    sheetName: "Kehadiran",
    action: action,
    ID_Kehadiran: idKehadiran,
    data: {
      ID_Kehadiran: idKehadiran,
      NIS: nis,
      Tanggal: tanggal,
      Status: status,
    },
  };

  const confirmMessage = isEdit
    ? `Apakah Anda yakin ingin memperbarui kehadiran ID ${idKehadiran}?`
    : `Apakah Anda yakin ingin menambahkan data kehadiran baru?`;
  const confirmed = await showConfirmationModal(
    "Konfirmasi Aksi",
    confirmMessage
  );
  if (!confirmed) return;

  try {
    const result = await sendRequestToGAS(payload);
    if (result.success) {
      showToast(result.message, "success");
      await loadAdminDashboardData();
      fillKehadiranForm({});
    } else {
      showToast(result.message, "error");
    }
  } catch (error) {
    console.error("Error add/update kehadiran:", error);
    showToast("Gagal melakukan operasi kehadiran.", "error");
  }
}

/**
 * Mengisi form Kehadiran untuk pengeditan.
 * @param {string} idKehadiran - ID kehadiran yang akan diedit.
 */
function editKehadiran(idKehadiran) {
  const kehadiran = dataCache.kehadiran.find(
    (k) => String(k.ID_Kehadiran) === String(idKehadiran)
  );
  if (kehadiran) {
    fillKehadiranForm(kehadiran, true);
    showToast(`Mengedit data kehadiran ID: ${idKehadiran}`, "info");
  } else {
    showToast("Kehadiran tidak ditemukan untuk diedit.", "error");
  }
}

/**
 * Menghapus data kehadiran.
 * @param {string} idKehadiran - ID kehadiran yang akan dihapus.
 */
async function deleteKehadiran(idKehadiran) {
  const confirmed = await showConfirmationModal(
    "Konfirmasi Hapus",
    `Apakah Anda yakin ingin menghapus kehadiran ID ${idKehadiran}?`
  );
  if (!confirmed) return;

  try {
    const result = await sendRequestToGAS({
      sheetName: "Kehadiran",
      action: "delete",
      ID_Kehadiran: idKehadiran,
    });

    if (result.success) {
      showToast(result.message, "success");
      await loadAdminDashboardData();
      fillKehadiranForm({});
    } else {
      showToast(result.message, "error");
    }
  } catch (error) {
    console.error("Error delete kehadiran:", error);
    showToast("Gagal menghapus kehadiran.", "error");
  }
}

// ===========================================
// FUNGSI CRUD CATATAN GURU
// ===========================================

/**
 * Mengisi form Catatan Guru untuk penambahan atau pengeditan.
 * @param {object} catatanData - Data catatan guru untuk diisi (kosong untuk tambah baru).
 * @param {boolean} isEdit - True jika mode edit, false jika mode tambah.
 */
function fillCatatanGuruForm(catatanData = {}, isEdit = false) {
  document.getElementById("catatan-id").value =
    catatanData.ID_Catatan || (isEdit ? "" : "Dihasilkan Otomatis");
  document.getElementById("catatan-id").readOnly = !isEdit;
  if (!isEdit) {
    document
      .getElementById("catatan-id")
      .classList.add("bg-gray-100", "cursor-not-allowed");
  } else {
    document
      .getElementById("catatan-id")
      .classList.remove("bg-gray-100", "cursor-not-allowed");
  }
  document.getElementById("catatan-nis").value = catatanData.NIS || "";
  document.getElementById("catatan-minggu-ke").value =
    catatanData.Minggu_Ke || "";
  document.getElementById("catatan-catatan").value = catatanData.Catatan || "";
  document.getElementById("catatan-tanggal-input").value =
    catatanData.Tanggal_Input || new Date().toISOString().split("T")[0];

  updateCatatanIdField();
}

/**
 * Menambahkan atau memperbarui catatan guru.
 */
async function addOrUpdateCatatan() {
  let idCatatan = document.getElementById("catatan-id").value;
  const nis = document.getElementById("catatan-nis").value;
  const mingguKe = document.getElementById("catatan-minggu-ke").value;
  const catatan = document.getElementById("catatan-catatan").value;
  const tanggalInput = document.getElementById("catatan-tanggal-input").value;

  if (!nis || !mingguKe || !catatan || !tanggalInput) {
    showToast("Semua field catatan guru harus diisi.", "warning");
    return;
  }

  const isEdit = document.getElementById("catatan-id").readOnly === false;
  const action = isEdit ? "update" : "create";

  if (!isEdit) {
    idCatatan = generateUniqueId();
  }

  const payload = {
    sheetName: "Catatan_Guru",
    action: action,
    ID_Catatan: idCatatan,
    data: {
      ID_Catatan: idCatatan,
      NIS: nis,
      Minggu_Ke: mingguKe,
      Catatan: catatan,
      Tanggal_Input: tanggalInput,
    },
  };

  const confirmMessage = isEdit
    ? `Apakah Anda yakin ingin memperbarui catatan ID ${idCatatan}?`
    : `Apakah Anda yakin ingin menambahkan catatan baru?`;
  const confirmed = await showConfirmationModal(
    "Konfirmasi Aksi",
    confirmMessage
  );
  if (!confirmed) return;

  try {
    const result = await sendRequestToGAS(payload);
    if (result.success) {
      showToast(result.message, "success");
      await loadAdminDashboardData();
      fillCatatanGuruForm({});
    } else {
      showToast(result.message, "error");
    }
  } catch (error) {
    console.error("Error add/update catatan guru:", error);
    showToast("Gagal melakukan operasi catatan guru.", "error");
  }
}

/**
 * Mengisi form Catatan Guru untuk pengeditan.
 * @param {string} idCatatan - ID catatan yang akan diedit.
 */
function editCatatan(idCatatan) {
  const catatan = dataCache.catatan_guru.find(
    (c) => String(c.ID_Catatan) === String(idCatatan)
  );
  if (catatan) {
    fillCatatanGuruForm(catatan, true);
    showToast(`Mengedit data catatan guru ID: ${idCatatan}`, "info");
  } else {
    showToast("Catatan guru tidak ditemukan untuk diedit.", "error");
  }
}

/**
 * Menghapus data catatan guru.
 * @param {string} idCatatan - ID catatan yang akan dihapus.
 */
async function deleteCatatan(idCatatan) {
  const confirmed = await showConfirmationModal(
    "Konfirmasi Hapus",
    `Apakah Anda yakin ingin menghapus catatan guru ID ${idCatatan}?`
  );
  if (!confirmed) return;

  try {
    const result = await sendRequestToGAS({
      sheetName: "Catatan_Guru",
      action: "delete",
      ID_Catatan: idCatatan,
    });

    if (result.success) {
      showToast(result.message, "success");
      await loadAdminDashboardData();
      fillCatatanGuruForm({});
    } else {
      showToast(result.message, "error");
    }
  } catch (error) {
    console.error("Error delete catatan guru:", error);
    showToast("Gagal menghapus catatan guru.", "error");
  }
}

// ===========================================
// FUNGSI CRUD JADWAL PELAJARAN
// ===========================================

/**
 * Mengisi form Jadwal Pelajaran untuk penambahan atau pengeditan.
 * @param {object} jadwalData - Data jadwal pelajaran untuk diisi (kosong untuk tambah baru).
 * @param {boolean} isEdit - True jika mode edit, false jika mode tambah.
 */
function fillJadwalPelajaranForm(jadwalData = {}, isEdit = false) {
  document.getElementById("jadwal-id").value =
    jadwalData.ID_Jadwal || (isEdit ? "" : "Dihasilkan Otomatis");
  document.getElementById("jadwal-id").readOnly = !isEdit;
  if (!isEdit) {
    document
      .getElementById("jadwal-id")
      .classList.add("bg-gray-100", "cursor-not-allowed");
  } else {
    document
      .getElementById("jadwal-id")
      .classList.remove("bg-gray-100", "cursor-not-allowed");
  }
  document.getElementById("jadwal-kelas").value = jadwalData.Kelas || "";
  document.getElementById("jadwal-hari").value = jadwalData.Hari || "";
  document.getElementById("jadwal-jam").value = jadwalData.Jam || "";
  document.getElementById("jadwal-mata-pelajaran").value =
    jadwalData.Mata_Pelajaran || "";
  document.getElementById("jadwal-guru").value = jadwalData.Guru || "";

  updateJadwalIdField();
}

/**
 * Menambahkan atau memperbarui jadwal pelajaran.
 */
async function addOrUpdateJadwal() {
  let idJadwal = document.getElementById("jadwal-id").value;
  const kelas = document.getElementById("jadwal-kelas").value;
  const hari = document.getElementById("jadwal-hari").value;
  const jam = document.getElementById("jadwal-jam").value;
  const mataPelajaran = document.getElementById("jadwal-mata-pelajaran").value;
  const guru = document.getElementById("jadwal-guru").value;

  if (!kelas || !hari || !jam || !mataPelajaran || !guru) {
    showToast("Semua field jadwal pelajaran harus diisi.", "warning");
    return;
  }

  const isEdit = document.getElementById("jadwal-id").readOnly === false;
  const action = isEdit ? "update" : "create";

  if (!isEdit) {
    idJadwal = generateUniqueId();
  }

  const payload = {
    sheetName: "Jadwal_Pelajaran",
    action: action,
    ID_Jadwal: idJadwal,
    data: {
      ID_Jadwal: idJadwal,
      Kelas: kelas,
      Hari: hari,
      Jam: jam,
      Mata_Pelajaran: mataPelajaran,
      Guru: guru,
    },
  };

  const confirmMessage = isEdit
    ? `Apakah Anda yakin ingin memperbarui jadwal ID ${idJadwal}?`
    : `Apakah Anda yakin ingin menambahkan jadwal baru?`;
  const confirmed = await showConfirmationModal(
    "Konfirmasi Aksi",
    confirmMessage
  );
  if (!confirmed) return;

  try {
    const result = await sendRequestToGAS(payload);
    if (result.success) {
      showToast(result.message, "success");
      await loadAdminDashboardData();
      fillJadwalPelajaranForm({});
    } else {
      showToast(result.message, "error");
    }
  } catch (error) {
    console.error("Error add/update jadwal pelajaran:", error);
    showToast("Gagal melakukan operasi jadwal pelajaran.", "error");
  }
}

/**
 * Mengisi form Jadwal Pelajaran untuk pengeditan.
 * @param {string} idJadwal - ID jadwal yang akan diedit.
 */
function editJadwal(idJadwal) {
  const jadwal = dataCache.jadwal_pelajaran.find(
    (j) => String(j.ID_Jadwal) === String(idJadwal)
  );
  if (jadwal) {
    fillJadwalPelajaranForm(jadwal, true);
    showToast(`Mengedit data jadwal pelajaran ID: ${idJadwal}`, "info");
  } else {
    showToast("Jadwal pelajaran tidak ditemukan untuk diedit.", "error");
  }
}

/**
 * Menghapus data jadwal pelajaran.
 * @param {string} idJadwal - ID jadwal yang akan dihapus.
 */
async function deleteJadwal(idJadwal) {
  const confirmed = await showConfirmationModal(
    "Konfirmasi Hapus",
    `Apakah Anda yakin ingin menghapus jadwal pelajaran ID ${idJadwal}?`
  );
  if (!confirmed) return;

  try {
    const result = await sendRequestToGAS({
      sheetName: "Jadwal_Pelajaran",
      action: "delete",
      ID_Jadwal: idJadwal,
    });

    if (result.success) {
      showToast(result.message, "success");
      await loadAdminDashboardData();
      fillJadwalPelajaranForm({});
    } else {
      showToast(result.message, "error");
    }
  } catch (error) {
    console.error("Error delete jadwal pelajaran:", error);
    showToast("Gagal menghapus jadwal pelajaran.", "error");
  }
}

// ===========================================
// FUNGSI CRUD PENGUMUMAN
// ===========================================

/**
 * Mengisi form Pengumuman untuk penambahan atau pengeditan.
 * @param {object} pengumumanData - Data pengumuman untuk diisi (kosong untuk tambah baru).
 * @param {boolean} isEdit - True jika mode edit, false jika mode tambah.
 */
function fillPengumumanForm(pengumumanData = {}, isEdit = false) {
  document.getElementById("pengumuman-id").value =
    pengumumanData.ID_Pengumuman || (isEdit ? "" : "Dihasilkan Otomatis");
  document.getElementById("pengumuman-id").readOnly = !isEdit;
  if (!isEdit) {
    document
      .getElementById("pengumuman-id")
      .classList.add("bg-gray-100", "cursor-not-allowed");
  } else {
    document
      .getElementById("pengumuman-id")
      .classList.remove("bg-gray-100", "cursor-not-allowed");
  }
  document.getElementById("pengumuman-judul").value =
    pengumumanData.Judul || "";
  document.getElementById("pengumuman-isi").value =
    pengumumanData.Isi_Pengumuman || "";
  document.getElementById("pengumuman-tanggal").value =
    pengumumanData.Tanggal_Pengumuman || new Date().toISOString().split("T")[0];
  document.getElementById("pengumuman-untuk-kelas").value =
    pengumumanData.Untuk_Kelas || "";

  updatePengumumanIdField();
}

/**
 * Menambahkan atau memperbarui pengumuman.
 */
async function addOrUpdatePengumuman() {
  let idPengumuman = document.getElementById("pengumuman-id").value;
  const judul = document.getElementById("pengumuman-judul").value;
  const isi = document.getElementById("pengumuman-isi").value;
  const tanggal = document.getElementById("pengumuman-tanggal").value;
  const untukKelas = document.getElementById("pengumuman-untuk-kelas").value;

  if (!judul || !isi || !tanggal || !untukKelas) {
    showToast("Semua field pengumuman harus diisi.", "warning");
    return;
  }

  const isEdit = document.getElementById("pengumuman-id").readOnly === false;
  const action = isEdit ? "update" : "create";

  if (!isEdit) {
    idPengumuman = generateUniqueId();
  }

  const payload = {
    sheetName: "Pengumuman",
    action: action,
    ID_Pengumuman: idPengumuman,
    data: {
      ID_Pengumuman: idPengumuman,
      Judul: judul,
      Isi_Pengumuman: isi,
      Tanggal_Pengumuman: tanggal,
      Untuk_Kelas: untukKelas,
    },
  };

  const confirmMessage = isEdit
    ? `Apakah Anda yakin ingin memperbarui pengumuman ID ${idPengumuman}?`
    : `Apakah Anda yakin ingin menambahkan pengumuman baru?`;
  const confirmed = await showConfirmationModal(
    "Konfirmasi Aksi",
    confirmMessage
  );
  if (!confirmed) return;

  try {
    const result = await sendRequestToGAS(payload);
    if (result.success) {
      showToast(result.message, "success");
      await loadAdminDashboardData();
      fillPengumumanForm({});
    } else {
      showToast(result.message, "error");
    }
  } catch (error) {
    console.error("Error add/update pengumuman:", error);
    showToast("Gagal melakukan operasi pengumuman.", "error");
  }
}

/**
 * Mengisi form Pengumuman untuk pengeditan.
 * @param {string} idPengumuman - ID pengumuman yang akan diedit.
 */
function editPengumuman(idPengumuman) {
  const pengumuman = dataCache.pengumuman.find(
    (p) => String(p.ID_Pengumuman) === String(idPengumuman)
  );
  if (pengumuman) {
    fillPengumumanForm(pengumuman, true);
    showToast(`Mengedit data pengumuman ID: ${idPengumuman}`, "info");
  } else {
    showToast("Pengumuman tidak ditemukan untuk diedit.", "error");
  }
}

/**
 * Menghapus data pengumuman.
 * @param {string} idPengumuman - ID pengumuman yang akan dihapus.
 */
async function deletePengumuman(idPengumuman) {
  const confirmed = await showConfirmationModal(
    "Konfirmasi Hapus",
    `Apakah Anda yakin ingin menghapus pengumuman ID ${idPengumuman}?`
  );
  if (!confirmed) return;

  try {
    const result = await sendRequestToGAS({
      sheetName: "Pengumuman",
      action: "delete",
      ID_Pengumuman: idPengumuman,
    });

    if (result.success) {
      showToast(result.message, "success");
      await loadAdminDashboardData();
      fillPengumumanForm({});
    } else {
      showToast(result.message, "error");
    }
  } catch (error) {
    console.error("Error delete pengumuman:", error);
    showToast("Gagal menghapus pengumuman.", "error");
  }
}

// ===========================================
// FUNGSI CRUD ADMIN USERS
// ===========================================

/**
 * Mengisi form Admin User untuk penambahan atau pengeditan.
 * @param {object} adminUserData - Data admin user untuk diisi (kosong untuk tambah baru).
 * @param {boolean} isEdit - True jika mode edit, false jika mode tambah.
 */
function fillAdminUserForm(adminUserData = {}, isEdit = false) {
  document.getElementById("admin-email").value = adminUserData.Email || "";

  const emailInput = document.getElementById("admin-email");
  emailInput.readOnly = isEdit;
  if (isEdit) {
    emailInput.classList.add("bg-gray-100", "cursor-not-allowed");
  } else {
    emailInput.classList.remove("bg-gray-100", "cursor-not-allowed");
  }
}

/**
 * Menambahkan atau memperbarui admin user.
 */
async function addOrUpdateAdminUser() {
  const email = document.getElementById("admin-email").value;

  if (!email) {
    showToast("Email admin harus diisi.", "warning");
    return;
  }

  const isEdit = document.getElementById("admin-email").readOnly;
  const action = isEdit ? "update" : "create";
  const payload = {
    sheetName: "Admin_Users",
    action: action,
    Email: email, // Menggunakan Email sebagai ID unik untuk update
    data: {
      Email: email,
    },
  };

  const confirmMessage = isEdit
    ? `Apakah Anda yakin ingin memperbarui email admin ${email}?`
    : `Apakah Anda yakin ingin menambahkan email admin ${email}?`;
  const confirmed = await showConfirmationModal(
    "Konfirmasi Aksi",
    confirmMessage
  );
  if (!confirmed) return;

  try {
    const result = await sendRequestToGAS(payload);
    if (result.success) {
      showToast(result.message, "success");
      await loadAdminDashboardData();
      fillAdminUserForm({});
    } else {
      showToast(result.message, "error");
    }
  } catch (error) {
    console.error("Error add/update admin user:", error);
    showToast("Gagal melakukan operasi admin user.", "error");
  }
}

/**
 * Mengisi form Admin User untuk pengeditan.
 * @param {string} email - Email admin user yang akan diedit.
 */
function editAdminUser(email) {
  const adminUser = dataCache.admin_users.find(
    (a) => String(a.Email) === String(email)
  );
  if (adminUser) {
    fillAdminUserForm(adminUser, true);
    showToast(`Mengedit email admin: ${email}`, "info");
  } else {
    showToast("Pengguna admin tidak ditemukan untuk diedit.", "error");
  }
}

/**
 * Menghapus data admin user.
 * @param {string} email - Email admin user yang akan dihapus.
 */
async function deleteAdminUser(email) {
  const confirmed = await showConfirmationModal(
    "Konfirmasi Hapus",
    `Apakah Anda yakin ingin menghapus email admin ${email}?`
  );
  if (!confirmed) return;

  try {
    const result = await sendRequestToGAS({
      sheetName: "Admin_Users",
      action: "delete",
      Email: email,
    });

    if (result.success) {
      showToast(result.message, "success");
      await loadAdminDashboardData();
      fillAdminUserForm({});
    } else {
      showToast(result.message, "error");
    }
  } catch (error) {
    console.error("Error delete admin user:", error);
    showToast("Gagal menghapus admin user.", "error");
  }
}

// ===========================================
// LISTENERS DAN INISIALISASI
// ===========================================

document.addEventListener("DOMContentLoaded", async () => {
  // Jika script ini dijalankan, itu berarti pengguna telah berhasil diautentikasi dan diotorisasi oleh doGet()
  // di Google Apps Script. Oleh karena itu, kita langsung memuat dashboard.

  // Inisialisasi event listener untuk tombol tab admin
  document.querySelectorAll(".tab-button-admin").forEach((button) => {
    button.addEventListener("click", () => {
      switchAdminTab(button.id, document.querySelectorAll(".tab-button-admin"));
    });
  });

  // Event listener untuk tombol refresh data
  const refreshButton = document.getElementById("refresh-admin-data");
  if (refreshButton) {
    refreshButton.addEventListener("click", loadAdminDashboardData);
  }

  // Event listener untuk form Siswa
  const siswaForm = document.getElementById("siswa-form");
  if (siswaForm) {
    siswaForm.addEventListener("submit", (e) => {
      e.preventDefault();
      addOrUpdateSiswa();
    });
    document
      .getElementById("siswa-clear-btn")
      .addEventListener("click", () => fillSiswaForm({}));
  }

  // Event listener untuk form Tugas
  const tugasForm = document.getElementById("tugas-form");
  if (tugasForm) {
    tugasForm.addEventListener("submit", (e) => {
      e.preventDefault();
      addOrUpdateTugas();
    });
    document
      .getElementById("tugas-clear-btn")
      .addEventListener("click", () => fillTugasForm({}));
    // Tambahkan listener untuk perubahan mata pelajaran untuk memperbarui ID tugas otomatis
    document
      .getElementById("tugas-mata-pelajaran")
      .addEventListener("change", updateTugasIdField);
  }

  // Event listener untuk form Nilai
  const nilaiForm = document.getElementById("nilai-form");
  if (nilaiForm) {
    nilaiForm.addEventListener("submit", (e) => {
      e.preventDefault();
      addOrUpdateNilai();
    });
    document
      .getElementById("nilai-clear-btn")
      .addEventListener("click", () => fillNilaiForm({}));
    // Perbarui NIS di form nilai saat dipilih
    document
      .getElementById("nilai-nis")
      .addEventListener("change", updateNilaiIdField);
  }

  // Event listener untuk form Kehadiran
  const kehadiranForm = document.getElementById("kehadiran-form");
  if (kehadiranForm) {
    kehadiranForm.addEventListener("submit", (e) => {
      e.preventDefault();
      addOrUpdateKehadiran();
    });
    document
      .getElementById("kehadiran-clear-btn")
      .addEventListener("click", () => fillKehadiranForm({}));
    document
      .getElementById("kehadiran-nis")
      .addEventListener("change", updateKehadiranIdField);
    document
      .getElementById("kehadiran-tanggal")
      .addEventListener("change", updateKehadiranIdField);
  }

  // Event listener untuk form Catatan Guru
  const catatanForm = document.getElementById("catatan-form");
  if (catatanForm) {
    catatanForm.addEventListener("submit", (e) => {
      e.preventDefault();
      addOrUpdateCatatan();
    });
    document
      .getElementById("catatan-clear-btn")
      .addEventListener("click", () => fillCatatanGuruForm({}));
    document
      .getElementById("catatan-nis")
      .addEventListener("change", updateCatatanIdField);
  }

  // Event listener untuk form Jadwal Pelajaran
  const jadwalForm = document.getElementById("jadwal-form");
  if (jadwalForm) {
    jadwalForm.addEventListener("submit", (e) => {
      e.preventDefault();
      addOrUpdateJadwal();
    });
    document
      .getElementById("jadwal-clear-btn")
      .addEventListener("click", () => fillJadwalPelajaranForm({}));
  }

  // Event listener untuk form Pengumuman
  const pengumumanForm = document.getElementById("pengumuman-form");
  if (pengumumanForm) {
    pengumumanForm.addEventListener("submit", (e) => {
      e.preventDefault();
      addOrUpdatePengumuman();
    });
    document
      .getElementById("pengumuman-clear-btn")
      .addEventListener("click", () => fillPengumumanForm({}));
  }

  // Event listener untuk form Admin User
  const adminUserForm = document.getElementById("admin-user-form");
  if (adminUserForm) {
    adminUserForm.addEventListener("submit", (e) => {
      e.preventDefault();
      addOrUpdateAdminUser();
    });
    document
      .getElementById("admin-user-clear-btn")
      .addEventListener("click", () => fillAdminUserForm({}));
  }

  // --- Initial calls for ID fields (ensure they reflect the 'Dihasilkan Otomatis' state initially) ---
  // These calls are mainly for when the admin section is directly loaded.
  // If navigated via login, the login process will handle initial ID generation.
  // The presence of if (kehadiranNisSelect) / if (kehadiranTanggalInput) protects against errors
  // if the dashboard is not yet visible or elements aren't populated.
  document.getElementById("siswa-nis").readOnly = false; // NIS Siswa tidak readonly saat tambah
  updateTugasIdField(); // Ensure initial state for tugas ID
  updateNilaiIdField(); // Ensure initial state for nilai ID
  updateKehadiranIdField(); // Ensure initial state for kehadiran ID
  updateCatatanIdField(); // Ensure initial state for catatan ID
  updateJadwalIdField(); // Ensure initial state for jadwal ID
  updatePengumumanIdField(); // Ensure initial state for pengumuman ID
  updateAdminUserIdField(); // Ensure initial state for admin user email

  // Mulai memuat data dan menampilkan dashboard
  await loadAdminDashboardData();
  showSection("admin-dashboard-section"); // Pastikan dashboard admin ditampilkan
  // Atur tab default yang aktif
  switchAdminTab(
    "siswa-tab-button",
    document.querySelectorAll(".tab-button-admin")
  );
  hideLoadingOverlay(); // Sembunyikan overlay loading setelah semua data dimuat dan ditampilkan
});
