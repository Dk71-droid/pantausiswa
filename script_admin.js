const GOOGLE_APPS_SCRIPT_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbwZEByXGKCa-s4sSPHBtM5GQuZHTjNWkgDWzUgpGXkaO66_mvWiakXnufxX_jd5lYwqdw/exec";

let adminConfig = {
  email: null,
  kelasMengampu: null,
  selectedMapel: [],
};

function showToast(message, type = "info") {
  const toastContainer = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast-message px-4 py-2 rounded-md shadow-md text-white ${
    type === "success"
      ? "bg-green-500"
      : type === "error"
      ? "bg-red-500"
      : type === "warning"
      ? "bg-yellow-500"
      : "bg-blue-500"
  }`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function showSection(sectionId) {
  document.querySelectorAll("section").forEach((section) => {
    section.classList.toggle("section-hidden", section.id !== sectionId);
  });
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const email = document.getElementById("login-email-admin").value.trim();
  if (!email) return showToast("Email tidak boleh kosong", "warning");

  const url = `${GOOGLE_APPS_SCRIPT_WEB_APP_URL}?action=adminLogin&email=${encodeURIComponent(
    email
  )}`;

  try {
    const response = await fetch(url);
    const result = await response.json();

    if (result.success) {
      const config = result.adminData;
      adminConfig.email = config.email;
      adminConfig.kelasMengampu = config.kelas;
      adminConfig.selectedMapel = config.subjects || [];

      if (result.needsConfig) {
        showToast("Email valid, silakan isi konfigurasi.", "info");
        renderMapelSelection();
        showSection("admin-config-section");
      } else {
        showToast("Login berhasil!", "success");
        showSection("admin-dashboard-section");
        document.getElementById("dashboard-admin-email").textContent = email;
      }
    } else {
      showToast(result.message || "Login gagal.", "error");
    }
  } catch (error) {
    showToast("Gagal terhubung ke server.", "error");
  }
}

async function handleAdminConfigSubmit(e) {
  e.preventDefault();
  const kelas = document.getElementById("admin-kelas-mengampu").value;
  if (!kelas) return showToast("Pilih kelas terlebih dahulu.", "warning");
  if (adminConfig.selectedMapel.length === 0)
    return showToast("Pilih minimal satu mapel.", "warning");

  const url = `${GOOGLE_APPS_SCRIPT_WEB_APP_URL}?action=saveAdminConfig&email=${encodeURIComponent(
    adminConfig.email
  )}&kelas=${encodeURIComponent(kelas)}&subjects=${encodeURIComponent(
    adminConfig.selectedMapel.join(",")
  )}`;

  try {
    const response = await fetch(url);
    const result = await response.json();

    if (result.success) {
      showToast("Konfigurasi berhasil disimpan!", "success");
      showSection("admin-dashboard-section");
      document.getElementById("dashboard-admin-email").textContent =
        adminConfig.email;
    } else {
      showToast(result.message || "Gagal menyimpan konfigurasi", "error");
    }
  } catch (error) {
    showToast("Gagal terhubung ke server.", "error");
  }
}

function handleAdminLogout() {
  adminConfig = { email: null, kelasMengampu: null, selectedMapel: [] };
  document.getElementById("login-form").reset();
  showToast("Logout berhasil.", "info");
  showSection("login-section");
}

function renderMapelSelection() {
  const container = document.getElementById("admin-mapel-selection-container");
  container.innerHTML = "";
  const allMapel = [
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
  const uniqueMapel = [...new Set([...adminConfig.selectedMapel, ...allMapel])];

  uniqueMapel.forEach((mapel) => {
    const selected = adminConfig.selectedMapel.includes(mapel);
    const span = document.createElement("span");
    span.className = `inline-flex items-center px-3 py-1 rounded-full text-sm font-medium cursor-pointer ${
      selected ? "bg-green-200 text-green-800" : "bg-gray-300 text-gray-800"
    }`;
    span.textContent = mapel;
    span.addEventListener("click", () => {
      if (selected) {
        adminConfig.selectedMapel = adminConfig.selectedMapel.filter(
          (m) => m !== mapel
        );
      } else {
        adminConfig.selectedMapel.push(mapel);
      }
      renderMapelSelection();
    });
    container.appendChild(span);
  });
}

function addCustomSubject() {
  const input = document.getElementById("new-mapel-input");
  const val = input.value.trim();
  if (!val) return;
  if (!adminConfig.selectedMapel.includes(val))
    adminConfig.selectedMapel.push(val);
  input.value = "";
  renderMapelSelection();
}

document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("login-form")
    ?.addEventListener("submit", handleAdminLogin);
  document
    .getElementById("admin-config-form")
    ?.addEventListener("submit", handleAdminConfigSubmit);
  document
    .getElementById("logout-admin-btn")
    ?.addEventListener("click", handleAdminLogout);
  document
    .getElementById("add-new-mapel-btn")
    ?.addEventListener("click", addCustomSubject);
  document
    .getElementById("new-mapel-input")
    ?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addCustomSubject();
      }
    });
});
