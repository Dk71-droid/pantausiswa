// Ganti URL ini dengan URL Web App Google Apps Script Anda setelah di-deploy
const GOOGLE_APPS_SCRIPT_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbxNlmkT0ciRb-LGxc59VG3WdoAtYF5DlnvH1DaXo73IfisirnN4njfcWeJoLoj3LxJ9qA/exec";
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
  "Bahasa Inggris", // Ditambahkan
  "Seni Tari", // Ditambahkan
  "Seni Musik", // Ditambahkan
];

// Mapping for subject abbreviations for ID Tugas
// This object will be dynamically populated with new custom subjects and their abbreviations
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

// Client-side cache for fetched data to reduce API calls
const dataCache = {
  siswa: null, // Initialize with null to indicate not fetched yet
  tugas: null,
  nilai: null,
  kehadiran: null,
  catatan_guru: null,
  jadwal_pelajaran: null,
  pengumuman: null,
  nilai_konfigurasi: null, // New: To store dynamic values like PASS_MARK
  admin_config: null, // To store admin specific configurations (kelas, mapel)
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

  // Animate toast in
  setTimeout(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  }, 50);

  // Animate toast out and remove after 3 seconds
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

// Function to handle fetching data from Google Apps Script Web App
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

// Function to send data to Google Apps Script Web App (POST request)
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

// --- Admin Login & Config Functions ---

async function handleAdminLogin(event) {
  event.preventDefault();
  const email = document.getElementById("login-email-admin").value.trim();

  if (!email) {
    showToast("Email admin tidak boleh kosong.", "warning");
    return;
  }

  showLoadingOverlay();
  try {
    // Tambahkan parameter `sheetName` ke panggilan fetchDataFromGAS
    const gasResponse = await fetchDataFromGAS("getAdminConfig", {
      adminEmail: email,
      sheetName: "Admin_Users", // PASTIKAN NAMA SHEET INI SAMA DENGAN NAMA SHEET DI GOOGLE SHEETS ANDA
    });

    // Case 1: fetchDataFromGAS itself returned null (e.g., network error or generic GAS error)
    if (gasResponse === null) {
      // Error message would have been shown by fetchDataFromGAS
      showSection("login-section");
      return;
    }

    // Case 2: GAS script explicitly returned success: false (e.g., email not found in admin list)
    if (!gasResponse.success) {
      showToast(gasResponse.message || "Email tidak terdaftar.", "error");
      showSection("login-section");
      return;
    }

    // Case 3: GAS script returned success: true. Email is registered.
    const adminDataFromGAS = gasResponse.adminData;
    adminConfig.email = email;

    // Case 3.1: Admin data exists and is complete (kelasMengampu and selectedMapel are present)
    if (
      adminDataFromGAS &&
      adminDataFromGAS.kelasMengampu &&
      adminDataFromGAS.selectedMapel
    ) {
      adminConfig.kelasMengampu = adminDataFromGAS.kelasMengampu;
      // Combine selectedMapel from config with hardcoded subjects to ensure all are available
      const combinedSelectedMapel = new Set([
        ...adminDataFromGAS.selectedMapel,
      ]);
      HARDCODED_SUBJECTS.forEach((subject) =>
        combinedSelectedMapel.add(subject)
      );
      adminConfig.selectedMapel = Array.from(combinedSelectedMapel);

      // Ensure all selected subjects have abbreviations
      adminConfig.selectedMapel.forEach((mapel) => {
        if (!SUBJECT_ABBREVIATIONS[mapel]) {
          SUBJECT_ABBREVIATIONS[mapel] = generateAbbreviation(mapel);
        }
      });

      showToast("Login admin berhasil!", "success");
      initializeAdminDashboard();
    } else {
      // Case 3.2: Admin data exists but is incomplete (or first-time login for a registered email)
      // This means the email is registered but needs configuration.
      // Pre-fill adminConfig with any existing partial data for the config form
      adminConfig.kelasMengampu = adminDataFromGAS?.kelasMengampu || "";
      adminConfig.selectedMapel = adminDataFromGAS?.selectedMapel || [];

      showToast("Email admin dikenal. Mohon lengkapi konfigurasi.", "info");
      showSection("admin-config-section");

      // Render subject selection with partially existing data (if any)
      renderMapelSelection();
      // Pre-fill kelasMengampu input if it came from partial config
      document.getElementById("admin-kelas-mengampu").value =
        adminConfig.kelasMengampu;
    }
  } catch (error) {
    console.error("Error during admin login:", error);
    showToast(
      "Terjadi kesalahan saat login admin. Silakan coba lagi.",
      "error"
    );
    showSection("login-section");
  } finally {
    hideLoadingOverlay();
  }
}

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
    const result = await sendDataToGAS("saveAdminConfig", {
      adminEmail: adminConfig.email,
      kelasMengampu: adminConfig.kelasMengampu,
      selectedMapel: adminConfig.selectedMapel,
      sheetName: "Admin_Users", // Tambahkan sheetName saat menyimpan konfigurasi juga
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

function initializeAdminDashboard() {
  if (adminConfig.email) {
    document.getElementById("dashboard-admin-email").textContent =
      adminConfig.email;
    showSection("admin-dashboard-section");
  } else {
    // If somehow adminConfig is not set, redirect to login
    showSection("login-section");
  }
}

function handleAdminLogout() {
  adminConfig = { email: null, kelasMengampu: null, selectedMapel: [] };
  showToast("Anda telah logout dari dashboard admin.", "info");
  showSection("login-section");
  document.getElementById("login-form").reset(); // Clear login form
}

// --- Mata Pelajaran Selection Logic ---

// Function to generate abbreviation for custom subjects
function generateAbbreviation(subjectName) {
  const words = subjectName.split(" ").filter((word) => word.length > 0);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].substring(0, 5).toUpperCase();

  let abbr = "";
  // Take first letter of each word
  for (let i = 0; i < words.length; i++) {
    abbr += words[i][0];
  }
  abbr = abbr.toUpperCase();

  // If still too long, truncate
  if (abbr.length > 5) {
    abbr = abbr.substring(0, 5);
  }
  // If too short, try to make it longer using parts of words
  if (abbr.length < 3 && words.length > 1) {
    abbr = words[0].substring(0, Math.min(words[0].length, 3)).toUpperCase();
    if (words[1]) {
      abbr += words[1].substring(0, Math.min(words[1].length, 2)).toUpperCase();
    }
    abbr = abbr.substring(0, 5); // Ensure it doesn't exceed 5 after extending
  }

  let counter = 1;
  let uniqueAbbr = abbr;
  // Ensure abbreviation is unique across all known abbreviations
  while (
    Object.values(SUBJECT_ABBREVIATIONS).includes(uniqueAbbr) &&
    uniqueAbbr !== SUBJECT_ABBREVIATIONS[subjectName]
  ) {
    uniqueAbbr = abbr + counter++;
    if (counter > 100) {
      // Prevent infinite loop for extremely common abbreviations
      uniqueAbbr = abbr.substring(0, 3) + generateRandomId(2).toUpperCase(); // Fallback to random suffix
      break;
    }
  }
  return uniqueAbbr;
}

// Function to render the subject selection UI
function renderMapelSelection() {
  const container = document.getElementById("admin-mapel-selection-container");
  container.innerHTML = ""; // Clear existing content

  // Ensure adminConfig.selectedMapel is initialized correctly for first-time load
  if (!adminConfig.selectedMapel || adminConfig.selectedMapel.length === 0) {
    // If no selection is saved, default to all HARDCODED_SUBJECTS being selected
    adminConfig.selectedMapel = [...HARDCODED_SUBJECTS];
  } else {
    // Ensure any new HARDCODED_SUBJECTS are added to selectedMapel if not already present
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

  // Create a set of all unique subjects to display (hardcoded + currently selected custom ones)
  const allSubjectsToDisplay = new Set();
  HARDCODED_SUBJECTS.forEach((subject) => allSubjectsToDisplay.add(subject));
  adminConfig.selectedMapel.forEach((subject) =>
    allSubjectsToDisplay.add(subject)
  ); // Adds custom subjects if present in selectedMapel

  // Ensure all these subjects have abbreviations
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

    // Only add click listener for removing if selected, otherwise for adding
    if (isSelected) {
      mapelElement
        .querySelector("button")
        .addEventListener("click", (event) => {
          event.stopPropagation(); // Prevent span click from propagating
          removeMapel(mapel);
        });
    } else {
      mapelElement.addEventListener("click", () => addMapel(mapel));
    }
    container.appendChild(mapelElement);
  });
}

// Function to add a subject (either re-selecting an existing one or adding a new custom one)
function addMapel(mapelToAdd) {
  // Normalize input for case-insensitive comparison
  const normalizedMapelToAdd = mapelToAdd.toLowerCase();

  // Check if it's already in the selected list (case-insensitive)
  const isAlreadySelected = adminConfig.selectedMapel.some(
    (mapel) => mapel.toLowerCase() === normalizedMapelToAdd
  );

  if (!isAlreadySelected) {
    // Find the correct casing if it's a hardcoded subject
    const foundHardcoded = HARDCODED_SUBJECTS.find(
      (s) => s.toLowerCase() === normalizedMapelToAdd
    );
    const mapelToUse = foundHardcoded || mapelToAdd; // Use original hardcoded casing or user's input

    adminConfig.selectedMapel.push(mapelToUse);
    // Ensure it has an abbreviation if it's a new custom subject
    if (!SUBJECT_ABBREVIATIONS[mapelToUse]) {
      SUBJECT_ABBREVIATIONS[mapelToUse] = generateAbbreviation(mapelToUse);
    }
    showToast(`Mata pelajaran "${mapelToUse}" dipilih.`, "success");
    renderMapelSelection(); // Re-render to update visual status
  } else {
    showToast(`Mata pelajaran "${mapelToAdd}" sudah dipilih.`, "info");
  }
}

// Function to remove (deselect) a subject
function removeMapel(mapelToRemove) {
  adminConfig.selectedMapel = adminConfig.selectedMapel.filter(
    (mapel) => mapel !== mapelToRemove
  );
  showToast(
    `Mata pelajaran "${mapelToRemove}" dihapus dari daftar ajaran.`,
    "info"
  );
  renderMapelSelection(); // Re-render to update visual status
}

// Function to handle adding a new custom subject from the dedicated input field
function addCustomSubject() {
  const newMapelInput = document.getElementById("new-mapel-input");
  const newMapelName = newMapelInput.value.trim();

  if (newMapelName) {
    const normalizedNewMapelName = newMapelName.toLowerCase();
    // Check if the subject already exists in the selected list (case-insensitive)
    const isDuplicate = adminConfig.selectedMapel.some(
      (s) => s.toLowerCase() === normalizedNewMapelName
    );
    // Check if it's already in the hardcoded list (case-insensitive)
    const isHardcoded = HARDCODED_SUBJECTS.some(
      (s) => s.toLowerCase() === normalizedNewMapelName
    );

    if (isDuplicate || isHardcoded) {
      showToast(
        `Mata pelajaran "${newMapelName}" sudah ada dalam daftar.`,
        "warning"
      );
    } else {
      addMapel(newMapelName); // Use the existing addMapel logic to add and select
      showToast(
        `Mata pelajaran "${newMapelName}" berhasil ditambahkan dan dipilih.`,
        "success"
      );
    }
    newMapelInput.value = ""; // Clear the input field
    renderMapelSelection(); // Re-render to show the newly added subject as selected
  } else {
    showToast("Nama mata pelajaran tidak boleh kosong.", "warning");
  }
}

// --- Event Listeners ---
document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", handleAdminLogin);
  }

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
        event.preventDefault(); // Prevent form submission
        addCustomSubject();
      }
    });
  }

  // The initial rendering of mapel selection should happen when admin-config-section is shown.
  // This is handled in `handleAdminLogin` when `showSection("admin-config-section")` is called.
});
