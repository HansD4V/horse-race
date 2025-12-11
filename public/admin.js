if (sessionStorage.getItem('adminLoggedIn') !== 'true') {
  window.location.href = 'login.html';
}

const clearDataBtn = document.getElementById("clearDataBtn");
const removePlayerBtn = document.getElementById("removePlayerBtn");
const removePlayerName = document.getElementById("removePlayerName");
const adminActions = document.getElementById("adminActions");
const msg = document.getElementById("msg");

clearDataBtn.addEventListener("click", () => {
  if (confirm("Are you sure you want to clear all data?")) {
    localStorage.clear();
    msg.style.color = "green";
    msg.textContent = "All data cleared.";
  }
});

removePlayerBtn.addEventListener("click", () => {
  const name = removePlayerName.value.trim().toLowerCase();
  if (!name) {
    alert("Enter a player name.");
    return;
  }
  let players = JSON.parse(localStorage.getItem("players")) || {};
  if (!players[name]) {
    alert("Player not found.");
    return;
  }
  if (confirm(`Are you sure you want to delete player "${name}"?`)) {
    delete players[name];
    localStorage.setItem("players", JSON.stringify(players));
    alert("Player data removed.");
    removePlayerName.value = "";
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem("adminLoggedIn");
  window.location.href = "index.html";
});
