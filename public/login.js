document.getElementById('loginForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();

  // Example hardcoded credentials
  if (username === 'hans' && password === '1234') {
    sessionStorage.setItem('adminLoggedIn', 'true');
    window.location.href = 'admin.html';
  } else {
    alert('Invalid credentials!');
  }
});