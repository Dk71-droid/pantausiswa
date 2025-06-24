// Ganti URL ini dengan URL Web App Google Apps Script Anda setelah deploy code_admin.gs.txt
const GOOGLE_APPS_SCRIPT_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycby4mWCUCN1uYvAA-b7ap5JQ7HfuUWTU7nMykftihhs_B7sR45tzhn45S3Lk6OKfnsps/exec"; // GANTI INI!

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
  "Bahasa Inggris",
  "Seni Tari",
  "Seni Musik",
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
  "Bahasa Inggris": "BINGG",
  "Seni Tari": "STARI",
  "Seni Musik": "SMUSK",
};

// Client-side cache for fetched data
const dataCache = {
  siswa: null,
  tugas: null,
  nilai: null,
  kehadiran: null,
  catatan_guru: null,
  jadwal_pelajaran: null,
  pengumuman: null,
  nilai_konfigurasi: null,
  admin_config: null,
};

// Admin configuration object
let adminConfig = {
  email: null,
  kelasMengampu: null,
  selectedMapel: [], // Mata pelajaran yang diajarkan admin
};

// Function to generate a random string for IDs
function generateRandomId(length = 8) {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0987654321";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Function to show loading overlay
function showLoadingOverlay() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    overlay.style.opacity = "1";
    overlay.style.visibility = "visible";
  }
}

// Function to hide loading overlay
function hideLoadingOverlay() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    overlay.style.opacity = "0";
    overlay.style.visibility = "hidden";
  }
}

// Function to show a specific section and hide others
function showSection(sectionId) {
  const sections = document.querySelectorAll("section");
  sections.forEach((section) => {
    if (section.id === sectionId) {
      section.classList.remove("section-hidden");
    } else {
      section.classList.add("section-hidden");
    }
  });
}

// Function to show toast messages
function showToast(message, type = "info") {
  const toastContainer = document.getElementById("toast-container");
  if (!toastContainer) {
    console.error("Toast container not found!");
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast-message px-4 py-2 rounded-md shadow-md text-white ${
    type === "success"
      ? "bg-green-500"
      : type === "error"
      ? "bg-red-500"
      : type === "warning"
      ? "bg-yellow-500"
      : "bg-blue-500"
  } opacity-0 transition-opacity duration-300 ease-in-out transform -translate-y-2`;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  }, 50);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-20px)";
    toast.addEventListener(
      "transitionend",
      () => {
        toast.remove();
      },
      { once: true }
    );
  }, 3000);
}

// Function to handle fetching data from Google Apps Script Web App (GET requests)
async function fetchDataFromGAS(action, params = {}) {
  showLoadingOverlay();
  try {
    const queryString = new URLSearchParams({
      action: action,
      ...params,
    }).toString();
    const response = await fetch(
      `${GOOGLE_APPS_SCRIPT_WEB_APP_URL}?${queryString}`
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Network response was not ok: ${response.status} - ${errorText}`
      );
    }
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }
    return data;
  } catch (error) {
    console.error("Error fetching data:", error);
    showToast(`Error: ${error.message}`, "error");
    return null;
  } finally {
    hideLoadingOverlay();
  }
}

// Function to send data to Google Apps Script Web App (POST requests)
async function sendDataToGAS(action, payload) {
  showLoadingOverlay();
  try {
    const response = await fetch(GOOGLE_APPS_SCRIPT_WEB_APP_URL, {
      method: "POST",
      mode: "cors", // Enable CORS
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, ...payload }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Network response was not ok: ${response.status} - ${errorText}`
      );
    }
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }
    return data;
  } catch (error) {
    console.error("Error sending data:", error);
    showToast(`Error: ${error.message}`, "error");
    return null;
  } finally {
    hideLoadingOverlay();
  }
}

// --- Google OAuth Callback Function ---
function handleCredentialResponse(response) {
  if (response.credential) {
    console.log("Google ID Token received:", response.credential);
    verifyGoogleToken(response.credential);
  } else {
    console.error("No credential found in Google response.");
    showToast("Login Google gagal. Coba lagi.", "error");
  }
}

// Function to send the Google ID Token to the Apps Script for server-side verification
async function verifyGoogleToken(idToken) {
  showLoadingOverlay();
  try {
    // Send the ID Token to the ADMIN Google Apps Script for server-side verification.
    const gasResponse = await sendDataToGAS("verifyAdminToken", {
      idToken: idToken,
      sheetName: "Admin_Users", // Inform the Apps Script which sheet to check for admin users.
    });

    if (gasResponse && gasResponse.success) {
      const adminDataFromGAS = gasResponse.adminData;
      adminConfig.email = adminDataFromGAS.Email;

      document.getElementById("admin-config-email-display").textContent =
        adminConfig.email;

      if (
        adminDataFromGAS &&
        adminDataFromGAS.kelasMengampu !== undefined &&
        adminDataFromGAS.selectedMapel !== undefined
      ) {
        adminConfig.kelasMengampu = adminDataFromGAS.kelasMengampu;
        const combinedSelectedMapel = new Set([
          ...(adminDataFromGAS.selectedMapel || []),
        ]);
        HARDCODED_SUBJECTS.forEach((subject) =>
          combinedSelectedMapel.add(subject)
        );
        adminConfig.selectedMapel = Array.from(combinedSelectedMapel);

        adminConfig.selectedMapel.forEach((mapel) => {
          if (!SUBJECT_ABBREVIATIONS[mapel]) {
            SUBJECT_ABBREVIATIONS[mapel] = generateAbbreviation(mapel);
          }
        });

        showToast("Login admin berhasil!", "success");
        initializeAdminDashboard();
      } else {
        adminConfig.kelasMengampu = adminDataFromGAS?.kelasMengampu || "";
        adminConfig.selectedMapel = adminDataFromGAS?.selectedMapel || [];

        showToast("Akun admin dikenal. Mohon lengkapi konfigurasi.", "info");
        showSection("admin-config-section");

        renderMapelSelection();
        document.getElementById("admin-kelas-mengampu").value =
          adminConfig.kelasMengampu;
      }
    } else {
      showToast(gasResponse?.message || "Otentikasi admin gagal.", "error");
      showSection("login-section");
    }
  } catch (error) {
    console.error("Error verifying Google token:", error);
    showToast(
      "Terjadi kesalahan saat verifikasi token Google. Silakan coba lagi.",
      "error"
    );
    showSection("login-section");
  } finally {
    hideLoadingOverlay();
  }
}

// Function to handle the submission of the admin configuration form.
async function handleAdminConfigSubmit(event) {
  event.preventDefault();
  const kelasMengampu = document.getElementById("admin-kelas-mengampu").value;

  if (!kelasMengampu) {
    showToast("Mohon pilih kelas yang Anda ampu.", "warning");
    return;
  }
  if (adminConfig.selectedMapel.length === 0) {
    showToast(
      "Mohon pilih setidaknya satu mata pelajaran yang Anda ajarkan.",
      "warning"
    );
    return;
  }

  adminConfig.kelasMengampu = kelasMengampu;

  showLoadingOverlay();
  try {
    // Send the admin configuration data to the ADMIN Google Apps Script for saving.
    const result = await sendDataToGAS("saveAdminConfig", {
      adminEmail: adminConfig.email,
      kelasMengampu: adminConfig.kelasMengampu,
      selectedMapel: adminConfig.selectedMapel,
      sheetName: "Admin_Users",
    });

    if (result && result.status === "success") {
      showToast("Konfigurasi admin berhasil disimpan!", "success");
      initializeAdminDashboard();
    } else {
      showToast("Gagal menyimpan konfigurasi admin.", "error");
    }
  } catch (error) {
    showToast(`Error menyimpan konfigurasi: ${error.message}`, "error");
  } finally {
    hideLoadingOverlay();
  }
}

// Function to initialize the admin dashboard view.
function initializeAdminDashboard() {
  if (adminConfig.email) {
    document.getElementById("dashboard-admin-email").textContent =
      adminConfig.email;
    showSection("admin-dashboard-section");
  } else {
    showSection("login-section");
  }
}

// Function to handle admin logout.
function handleAdminLogout() {
  // Sign out from Google Identity Services to revoke the session token.
  if (google.accounts.id) {
    google.accounts.id.disableAutoSelect();
    // Revoke user's consent for your app. Use with caution as it requires re-authorization.
    google.accounts.id.revoke(adminConfig.email, (done) => {
      console.log("Google account revoked and disconnected from app.", done);
      showToast("Anda telah logout dari akun Google dan aplikasi.", "info");
    });
  }

  // Clear local admin configuration.
  adminConfig = { email: null, kelasMengampu: null, selectedMapel: [] };

  showToast("Anda telah logout dari dashboard admin.", "info");
  showSection("login-section");
}

// --- Mata Pelajaran Selection Logic ---

// Function to generate abbreviation for custom subjects.
function generateAbbreviation(subjectName) {
  const words = subjectName.split(" ").filter((word) => word.length > 0);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].substring(0, 5).toUpperCase();

  let abbr = "";
  for (let i = 0; i < words.length; i++) {
    abbr += words[i][0];
  }
  abbr = abbr.toUpperCase();

  if (abbr.length > 5) {
    abbr = abbr.substring(0, 5);
  }
  if (abbr.length < 3 && words.length > 1) {
    abbr = words[0].substring(0, Math.min(words[0].length, 3)).toUpperCase();
    if (words[1]) {
      abbr += words[1].substring(0, Math.min(words[1].length, 2)).toUpperCase();
    }
    abbr = abbr.substring(0, 5);
  }

  let counter = 1;
  let uniqueAbbr = abbr;
  while (
    Object.values(SUBJECT_ABBREVIATIONS).includes(uniqueAbbr) &&
    uniqueAbbr !== SUBJECT_ABBREVIATIONS[subjectName]
  ) {
    uniqueAbbr = abbr + counter++;
    if (counter > 100) {
      uniqueAbbr = abbr.substring(0, 3) + generateRandomId(2).toUpperCase();
      break;
    }
  }
  return uniqueAbbr;
}

// Function to render the subject selection UI.
function renderMapelSelection() {
  const container = document.getElementById("admin-mapel-selection-container");
  container.innerHTML = "";

  if (!adminConfig.selectedMapel || adminConfig.selectedMapel.length === 0) {
    adminConfig.selectedMapel = [...HARDCODED_SUBJECTS];
  } else {
    HARDCODED_SUBJECTS.forEach((subject) => {
      if (
        !adminConfig.selectedMapel.some(
          (s) => s.toLowerCase() === subject.toLowerCase()
        )
      ) {
        adminConfig.selectedMapel.push(subject);
      }
    });
  }

  const allSubjectsToDisplay = new Set();
  HARDCODED_SUBJECTS.forEach((subject) => allSubjectsToDisplay.add(subject));
  adminConfig.selectedMapel.forEach((subject) =>
    allSubjectsToDisplay.add(subject)
  );

  Array.from(allSubjectsToDisplay).forEach((mapel) => {
    if (!SUBJECT_ABBREVIATIONS[mapel]) {
      SUBJECT_ABBREVIATIONS[mapel] = generateAbbreviation(mapel);
    }
  });

  const sortedSubjectsForDisplay = Array.from(allSubjectsToDisplay).sort(
    (a, b) => a.localeCompare(b)
  );

  sortedSubjectsForDisplay.forEach((mapel) => {
    const isSelected = adminConfig.selectedMapel.includes(mapel);
    const mapelElement = document.createElement("span");
    mapelElement.className = `inline-flex items-center px-3 py-1 rounded-full text-sm font-medium transition-colors cursor-pointer hover:shadow-md mr-2 mb-2 ${
      isSelected ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-700"
    }`;
    mapelElement.innerHTML = `
            ${mapel}
            ${
              isSelected
                ? `<button type="button" class="ml-2 text-red-500 hover:text-red-700" data-mapel="${mapel}" aria-label="Hapus mata pelajaran">
                <i class="fas fa-times"></i>
            </button>`
                : ""
            }
        `;

    if (isSelected) {
      mapelElement
        .querySelector("button")
        .addEventListener("click", (event) => {
          event.stopPropagation();
          removeMapel(mapel);
        });
    } else {
      mapelElement.addEventListener("click", () => addMapel(mapel));
    }
    container.appendChild(mapelElement);
  });
}

// Function to add a subject (either re-selecting an existing one or adding a new custom one).
function addMapel(mapelToAdd) {
  const normalizedMapelToAdd = mapelToAdd.toLowerCase();

  const isAlreadySelected = adminConfig.selectedMapel.some(
    (mapel) => mapel.toLowerCase() === normalizedMapelToAdd
  );

  if (!isAlreadySelected) {
    const foundHardcoded = HARDCODED_SUBJECTS.find(
      (s) => s.toLowerCase() === normalizedMapelToAdd
    );
    const mapelToUse = foundHardcoded || mapelToAdd;

    adminConfig.selectedMapel.push(mapelToUse);
    if (!SUBJECT_ABBREVIATIONS[mapelToUse]) {
      SUBJECT_ABBREVIATIONS[mapelToUse] = generateAbbreviation(mapelToUse);
    }
    showToast(`Mata pelajaran "${mapelToUse}" dipilih.`, "success");
    renderMapelSelection();
  } else {
    showToast(`Mata pelajaran "${mapelToAdd}" sudah dipilih.`, "info");
  }
}

// Function to remove (deselect) a subject.
function removeMapel(mapelToRemove) {
  adminConfig.selectedMapel = adminConfig.selectedMapel.filter(
    (mapel) => mapel !== mapelToRemove
  );
  showToast(
    `Mata pelajaran "${mapelToRemove}" dihapus dari daftar ajaran.`,
    "info"
  );
  renderMapelSelection();
}

// Function to handle adding a new custom subject from the dedicated input field.
function addCustomSubject() {
  const newMapelInput = document.getElementById("new-mapel-input");
  const newMapelName = newMapelInput.value.trim();

  if (newMapelName) {
    const normalizedNewMapelName = newMapelName.toLowerCase();
    const isDuplicate = adminConfig.selectedMapel.some(
      (s) => s.toLowerCase() === normalizedNewMapelName
    );
    const isHardcoded = HARDCODED_SUBJECTS.some(
      (s) => s.toLowerCase() === normalizedNewMapelName
    );

    if (isDuplicate || isHardcoded) {
      showToast(
        `Mata pelajaran "${newMapelName}" sudah ada dalam daftar.`,
        "warning"
      );
    } else {
      addMapel(newMapelName);
      showToast(
        `Mata pelajaran "${newMapelName}" berhasil ditambahkan dan dipilih.`,
        "success"
      );
    }
    newMapelInput.value = "";
    renderMapelSelection();
  } else {
    showToast("Nama mata pelajaran tidak boleh kosong.", "warning");
  }
}

// --- Event Listeners ---
document.addEventListener("DOMContentLoaded", () => {
  const adminConfigForm = document.getElementById("admin-config-form");
  if (adminConfigForm) {
    adminConfigForm.addEventListener("submit", handleAdminConfigSubmit);
  }

  const logoutAdminBtn = document.getElementById("logout-admin-btn");
  if (logoutAdminBtn) {
    logoutAdminBtn.addEventListener("click", handleAdminLogout);
  }

  const addNewMapelBtn = document.getElementById("add-new-mapel-btn");
  if (addNewMapelBtn) {
    addNewMapelBtn.addEventListener("click", addCustomSubject);
  }

  const newMapelInput = document.getElementById("new-mapel-input");
  if (newMapelInput) {
    newMapelInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addCustomSubject();
      }
    });
  }
});
