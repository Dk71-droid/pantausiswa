// Ganti URL ini dengan URL Web App Google Apps Script Anda setelah di-deploy
const GOOGLE_APPS_SCRIPT_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycby0eh7-D63Bgxuttr4kctqz7jU9BeOlbfx5H-0ecPr9r4F1WMvjTdT7DrNNphwctg_nAg/exec";

// Hardcoded list of subjects for configuration (bisa ditambahkan atau disesuaikan)
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

let loggedInAdminEmail = null; // Menyimpan email admin yang sedang login
let selectedSubjects = new Set(); // Set untuk menyimpan mata pelajaran yang diajarkan admin

// --- Utility Functions ---

/**
 * Menampilkan overlay loading.
 */
function showLoadingOverlay() {
  document.getElementById("loading-overlay").style.opacity = "1";
  document.getElementById("loading-overlay").style.visibility = "visible";
  console.log("Loading overlay ditampilkan.");
}

/**
 * Menyembunyikan overlay loading.
 */
function hideLoadingOverlay() {
  document.getElementById("loading-overlay").style.opacity = "0";
  document.getElementById("loading-overlay").style.visibility = "hidden";
  console.log("Loading overlay disembunyikan.");
}

/**
 * Menampilkan pesan toast.
 * @param {string} message Pesan yang akan ditampilkan.
 * @param {'success'|'error'|'info'} type Tipe toast (untuk styling).
 */
function showToast(message, type = "info", duration = 3000) {
  const toastContainer = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast-message toast-${type} p-3 rounded-md shadow-md flex items-center space-x-2`;
  toast.innerHTML = `
        <i class="${
          type === "success"
            ? "fas fa-check-circle"
            : type === "error"
            ? "fas fa-times-circle"
            : "fas fa-info-circle"
        } text-white"></i>
        <span class="text-white text-sm">${message}</span>
    `;
  toastContainer.appendChild(toast);

  // Animate in
  setTimeout(() => {
    toast.classList.add("show");
  }, 10); // Penundaan kecil untuk reflow

  // Animate out and remove
  setTimeout(() => {
    toast.classList.remove("show");
    toast.classList.add("hide");
    toast.addEventListener("transitionend", () => toast.remove(), {
      once: true,
    });
  }, 3000);
  console.log(`Toast: [${type.toUpperCase()}] ${message}`);
}

/**
 * Menampilkan modal konfirmasi kustom.
 * @param {string} message Pesan yang akan ditampilkan di badan modal.
 * @param {function} onConfirm Fungsi callback saat tombol 'OK' diklik.
 * @param {string} title Judul modal (opsional, default "Konfirmasi").
 * @param {string} okButtonText Teks untuk tombol OK (opsional, default "Ya").
 * @param {string} cancelButtonText Teks untuk tombol Batal (opsional, default "Batal").
 */
function showConfirmModal(
  message,
  onConfirm,
  title = "Konfirmasi",
  okButtonText = "Ya",
  cancelButtonText = "Batal"
) {
  const modal = document.getElementById("confirm-modal");
  document.getElementById("confirm-modal-title").textContent = title;
  document.getElementById("confirm-modal-message").textContent = message;
  document.getElementById("confirm-ok-btn").textContent = okButtonText;
  document.getElementById("confirm-cancel-btn").textContent = cancelButtonText;

  // Hapus listener sebelumnya untuk mencegah pemanggilan ganda
  const okBtn = document.getElementById("confirm-ok-btn");
  const cancelBtn = document.getElementById("confirm-cancel-btn");
  okBtn.onclick = null;
  cancelBtn.onclick = null;

  okBtn.onclick = () => {
    onConfirm();
    modal.classList.remove("open");
  };
  cancelBtn.onclick = () => {
    modal.classList.remove("open");
  };

  modal.classList.add("open");
  console.log(`Modal konfirmasi ditampilkan: ${title} - ${message}`);
}

/**
 * Menyembunyikan semua bagian dan menampilkan bagian yang ditentukan.
 * @param {string} sectionId ID bagian yang akan ditampilkan.
 */
function showSection(sectionId) {
  const sections = document.querySelectorAll("section");
  sections.forEach((section) => {
    section.classList.add("section-hidden");
  });
  document.getElementById(sectionId).classList.remove("section-hidden");
  console.log(`Menampilkan bagian: #${sectionId}`);
}

// --- Admin Login & Configuration Logic ---

/**
 * Menangani pengiriman formulir login admin.
 * Mengirimkan email admin ke Google Apps Script untuk verifikasi.
 * @param {Event} event Event pengiriman formulir.
 */
async function handleAdminLoginSubmit(event) {
  event.preventDefault();
  showLoadingOverlay();

  const email = document.getElementById("login-email-admin").value.trim();
  if (!email) {
    showToast("Email tidak boleh kosong.", "error");
    hideLoadingOverlay();
    return;
  }

  const postBody = new URLSearchParams({
    action: "adminLogin",
    email: email,
  }).toString();

  console.log(
    `[handleAdminLoginSubmit] Mengirim permintaan ke: ${GOOGLE_APPS_SCRIPT_WEB_APP_URL}`
  );
  console.log(`[handleAdminLoginSubmit] Dengan body: ${postBody}`);
  console.log(
    `[handleAdminLoginSubmit] Headers: Content-Type: application/x-www-form-urlencoded`
  );

  try {
    const response = await fetch(GOOGLE_APPS_SCRIPT_WEB_APP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: postBody,
    });

    console.log("[handleAdminLoginSubmit] Fetch response received:", response);

    if (!response.ok) {
      console.error(
        "[handleAdminLoginSubmit] HTTP error! Status:",
        response.status
      );
      const errorText = await response.text();
      console.error("[handleAdminLoginSubmit] Error response text:", errorText);
      throw new Error(`Server responded with status ${response.status}`);
    }

    const result = await response.json(); // Sekarang kita bisa mengurai JSON
    console.log("[handleAdminLoginSubmit] Parsed JSON response:", result);

    if (result.success) {
      loggedInAdminEmail = email; // Simpan email yang login
      sessionStorage.setItem("loggedInAdminEmail", email); // Simpan sesi

      if (result.needsConfig) {
        // Admin ditemukan, tetapi membutuhkan konfigurasi
        showToast("Email admin ditemukan. Mohon lengkapi konfigurasi.", "info");
        populateAdminConfigForm(result.adminData);
        showSection("admin-config-section");
      } else {
        // Admin ditemukan dan sudah terkonfigurasi
        showToast("Login admin berhasil!", "success");
        // Jika dashboard akan menjadi halaman terpisah, ini akan mengarahkan ke sana
        showSection("admin-dashboard-section");
      }
    } else {
      showToast(
        result.message || "Login admin gagal. Email tidak dikenal.",
        "error"
      );
      console.error("Login admin gagal:", result.message);
    }
  } catch (error) {
    console.error("Error selama fetch login admin:", error);
    showToast(
      "Terjadi kesalahan koneksi atau respons tidak valid. Silakan coba lagi.",
      "error"
    );
  } finally {
    hideLoadingOverlay();
  }
}

/**
 * Mengisi formulir konfigurasi admin dengan data yang ada jika tersedia.
 * @param {Object} adminData Data konfigurasi admin (email, kelas, subjects).
 */
function populateAdminConfigForm(adminData) {
  document.getElementById("admin-kelas-mengampu").value = adminData.kelas || "";
  // Hapus pilihan sebelumnya dan isi berdasarkan adminData.subjects
  selectedSubjects.clear();
  if (adminData.subjects && Array.isArray(adminData.subjects)) {
    adminData.subjects.forEach((subject) => {
      if (subject) {
        // Pastikan subjek bukan string kosong
        selectedSubjects.add(subject.trim());
      }
    });
  }
  renderSubjectSelectionChips(); // Render ulang chip berdasarkan selectedSubjects yang terisi
  console.log("Formulir konfigurasi admin diisi dengan data:", adminData);
}

/**
 * Menangani pengiriman formulir konfigurasi admin.
 * Menyimpan kelas dan mata pelajaran yang diajarkan admin ke Google Apps Script.
 * @param {Event} event Event pengiriman formulir.
 */
async function handleAdminConfigSubmit(event) {
  event.preventDefault();
  showLoadingOverlay();

  const kelasMengampu = document.getElementById("admin-kelas-mengampu").value;
  if (!kelasMengampu) {
    showToast("Pilih kelas yang Anda ampuh.", "error");
    hideLoadingOverlay();
    return;
  }

  // Konversi Set selectedSubjects menjadi string yang dipisahkan koma
  const subjectsTaught = Array.from(selectedSubjects).join(",");

  if (selectedSubjects.size === 0) {
    showToast(
      "Pilih setidaknya satu mata pelajaran yang Anda ajarkan.",
      "error"
    );
    hideLoadingOverlay();
    return;
  }

  const postBody = new URLSearchParams({
    action: "saveAdminConfig",
    email: loggedInAdminEmail, // Gunakan email yang disimpan
    kelas: kelasMengampu,
    subjects: subjectsTaught,
  }).toString();

  console.log(
    `[handleAdminConfigSubmit] Mengirim konfigurasi admin ke: ${GOOGLE_APPS_SCRIPT_WEB_APP_URL}`
  );
  console.log(`[handleAdminConfigSubmit] Dengan body: ${postBody}`);
  console.log(
    `[handleAdminConfigSubmit] Headers: Content-Type: application/x-www-form-urlencoded`
  );

  try {
    const response = await fetch(GOOGLE_APPS_SCRIPT_WEB_APP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: postBody,
    });

    console.log(
      "[handleAdminConfigSubmit] Fetch response received for saving config:",
      response
    );

    if (!response.ok) {
      console.error(
        "[handleAdminConfigSubmit] HTTP error! Status:",
        response.status
      );
      const errorText = await response.text();
      console.error(
        "[handleAdminConfigSubmit] Error response text:",
        errorText
      );
      throw new Error(`Server responded with status ${response.status}`);
    }

    const result = await response.json(); // Sekarang kita bisa mengurai JSON
    console.log(
      "[handleAdminConfigSubmit] Parsed JSON response for saving config:",
      result
    );

    if (result.success) {
      showToast("Konfigurasi berhasil disimpan!", "success");
      // Redirect ke dashboard setelah konfigurasi berhasil
      showSection("admin-dashboard-section");
    } else {
      showToast(result.message || "Gagal menyimpan konfigurasi.", "error");
      console.error("Gagal menyimpan konfigurasi admin:", result.message);
    }
  } catch (error) {
    console.error("Error saat menyimpan konfigurasi admin:", error);
    showToast("Terjadi kesalahan koneksi saat menyimpan konfigurasi.", "error");
  } finally {
    hideLoadingOverlay();
  }
}

/**
 * Menangani logout admin.
 */
function handleAdminLogout() {
  loggedInAdminEmail = null;
  sessionStorage.removeItem("loggedInAdminEmail"); // Hapus sesi
  showToast("Anda telah logout.", "info");
  showSection("login-section"); // Kembali ke halaman login
  document.getElementById("login-form").reset(); // Reset form login
  console.log("Admin logout. Sesi dihapus.");
}

/**
 * Memulihkan sesi admin dari sessionStorage saat halaman dimuat.
 */
async function restoreAdminSession() {
  showLoadingOverlay();
  const cachedEmail = sessionStorage.getItem("loggedInAdminEmail");

  if (cachedEmail) {
    loggedInAdminEmail = cachedEmail;
    console.log(
      `[restoreAdminSession] Memulihkan sesi untuk email: ${cachedEmail}`
    );

    const postBody = new URLSearchParams({
      action: "fetchAdminConfig", // Aksi baru untuk mengambil konfigurasi admin
      email: cachedEmail,
    }).toString();

    console.log(
      `[restoreAdminSession] Mengirim permintaan ke: ${GOOGLE_APPS_SCRIPT_WEB_APP_URL}`
    );
    console.log(`[restoreAdminSession] Dengan body: ${postBody}`);
    console.log(
      `[restoreAdminSession] Headers: Content-Type: application/x-www-form-urlencoded`
    );

    try {
      const response = await fetch(GOOGLE_APPS_SCRIPT_WEB_APP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: postBody,
      });

      console.log(
        "[restoreAdminSession] Fetch response received for session restore:",
        response
      );

      if (!response.ok) {
        console.error(
          "[restoreAdminSession] HTTP error! Status:",
          response.status
        );
        const errorText = await response.text();
        console.error("[restoreAdminSession] Error response text:", errorText);
        throw new Error(`Server responded with status ${response.status}`);
      }

      const result = await response.json(); // Sekarang kita bisa mengurai JSON
      console.log(
        "[restoreAdminSession] Parsed JSON response for session restore:",
        result
      );

      if (result.success && result.adminData) {
        if (!result.adminData.kelas || result.adminData.subjects.length === 0) {
          // Jika konfigurasi tidak lengkap, pergi ke bagian konfigurasi
          showToast("Sesi dipulihkan, mohon lengkapi konfigurasi.", "info");
          populateAdminConfigForm(result.adminData);
          showSection("admin-config-section");
        } else {
          // Konfigurasi lengkap, langsung ke dashboard
          showToast("Sesi dipulihkan. Selamat datang kembali!", "success");
          showSection("admin-dashboard-section");
        }
      } else {
        // Email yang disimpan tidak ditemukan di Admin_Users atau terjadi error di backend
        showToast("Sesi tidak valid. Silakan login kembali.", "error");
        sessionStorage.removeItem("loggedInAdminEmail");
        showSection("login-section");
        console.warn("Sesi tidak valid, mengarahkan ke login.");
      }
    } catch (error) {
      console.error("Error memulihkan sesi admin:", error);
      showToast(
        "Terjadi kesalahan koneksi atau respons tidak valid saat memulihkan sesi. Silakan login kembali.",
        "error"
      );
      sessionStorage.removeItem("loggedInAdminEmail");
      showSection("login-section");
    } finally {
      hideLoadingOverlay();
    }
  } else {
    // Tidak ada email yang disimpan, tampilkan bagian login
    hideLoadingOverlay();
    showSection("login-section");
    console.log(
      "Tidak ada sesi admin yang disimpan, menampilkan halaman login."
    );
  }
}

/**
 * Merender chip pilihan mata pelajaran di konfigurasi admin.
 */
function renderSubjectSelectionChips() {
  const container = document.getElementById("admin-mapel-selection-container");
  container.innerHTML = ""; // Hapus chip yang ada

  // Gabungkan mata pelajaran hardcoded dan yang sudah dipilih (untuk menampilkan semua opsi)
  const allAvailableSubjects = new Set([...HARDCODED_SUBJECTS]);
  selectedSubjects.forEach((subject) => allAvailableSubjects.add(subject));

  if (allAvailableSubjects.size === 0) {
    container.innerHTML =
      '<p class="text-gray-500 text-center w-full">Tidak ada mata pelajaran yang tersedia.</p>';
    return;
  }

  // Convert Set to Array for sorting
  const sortedSubjects = Array.from(allAvailableSubjects).sort((a, b) =>
    a.localeCompare(b)
  );

  sortedSubjects.forEach((subject) => {
    const isSelected = selectedSubjects.has(subject);
    const chip = document.createElement("div");
    chip.className = `
      flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium transition-all duration-200 ease-in-out
      ${
        isSelected
          ? "bg-blue-500 text-white shadow-md"
          : "bg-gray-200 text-gray-700 hover:bg-blue-100 hover:text-blue-700 cursor-pointer"
      }
    `;
    chip.dataset.subject = subject; // Simpan nama mata pelajaran untuk akses mudah

    chip.innerHTML = `
      <span>${subject}</span>
      ${
        isSelected
          ? '<button type="button" class="text-white text-opacity-70 hover:text-opacity-100 focus:outline-none remove-subject-btn" aria-label="Hapus mata pelajaran"><i class="fas fa-times-circle"></i></button>'
          : ""
      }
    `;

    chip.addEventListener("click", (e) => {
      // Jika ikon 'x' diklik, hapus mata pelajaran
      if (e.target.closest(".remove-subject-btn")) {
        selectedSubjects.delete(subject);
        showToast(`Mata pelajaran "${subject}" dihapus.`, "info");
      } else {
        // Jika chip itu sendiri diklik, toggle pilihan
        if (selectedSubjects.has(subject)) {
          selectedSubjects.delete(subject);
          showToast(`Mata pelajaran "${subject}" tidak dipilih.`, "info");
        } else {
          selectedSubjects.add(subject);
          showToast(`Mata pelajaran "${subject}" dipilih.`, "success");
        }
      }
      renderSubjectSelectionChips(); // Render ulang untuk memperbarui UI
    });
    container.appendChild(chip);
  });
  console.log(
    "Chip mata pelajaran dirender. Mata pelajaran terpilih:",
    Array.from(selectedSubjects)
  );
}

// --- Event Listeners and Initial Load ---

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOMContentLoaded fired in script_admin.js");

  // --- Admin Login ---
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", handleAdminLoginSubmit);
    console.log("Event listener untuk login-form ditambahkan.");
  }

  const logoutAdminBtn = document.getElementById("logout-admin-btn");
  if (logoutAdminBtn) {
    logoutAdminBtn.addEventListener("click", handleAdminLogout);
    console.log(
      "Event listener untuk logout-admin-btn (dashboard) ditambahkan."
    );
  }

  const logoutAdminBtnConfig = document.getElementById(
    "logout-admin-btn-config"
  );
  if (logoutAdminBtnConfig) {
    logoutAdminBtnConfig.addEventListener("click", handleAdminLogout);
    console.log("Event listener untuk logout-admin-btn-config ditambahkan.");
  }

  // --- Admin Configuration ---
  const adminConfigForm = document.getElementById("admin-config-form");
  if (adminConfigForm) {
    adminConfigForm.addEventListener("submit", handleAdminConfigSubmit);
    console.log("Event listener untuk admin-config-form ditambahkan.");
  }

  const newMapelInput = document.getElementById("new-mapel-input");
  const addMapelBtn = document.getElementById("add-new-mapel-btn");
  if (addMapelBtn) {
    addMapelBtn.addEventListener("click", () => {
      const newSubject = newMapelInput.value.trim();
      if (newSubject) {
        // Check if subject (case-insensitive) already exists in selectedSubjects or HARDCODED_SUBJECTS
        const isDuplicate =
          Array.from(selectedSubjects).some(
            (s) => s.toLowerCase() === newSubject.toLowerCase()
          ) ||
          HARDCODED_SUBJECTS.some(
            (s) => s.toLowerCase() === newSubject.toLowerCase()
          );

        if (!isDuplicate) {
          selectedSubjects.add(newSubject);
          renderSubjectSelectionChips();
          newMapelInput.value = ""; // Clear input after adding
          showToast(
            `Mata pelajaran "${newSubject}" ditambahkan dan dipilih.`,
            "success"
          );
        } else {
          showToast("Mata pelajaran sudah ada atau telah dipilih.", "info");
        }
      } else {
        showToast("Nama mata pelajaran tidak boleh kosong.", "warning");
      }
    });
    console.log("Event listener untuk add-new-mapel-btn ditambahkan.");
  }

  // Render awal chip mata pelajaran (sebelum mengambil konfigurasi, untuk menunjukkan placeholder)
  renderSubjectSelectionChips();
  console.log("Initial renderSubjectSelectionChips dipanggil.");

  // Pulihkan sesi saat pemuatan awal
  restoreAdminSession();
  console.log("restoreAdminSession dipanggil.");
});
