// login.js

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); // Evita que la página se recargue

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const btnLogin = document.getElementById('btnLogin');
    const divErro = document.getElementById('loginErro');

    // Estado de carga
    btnLogin.disabled = true;
    btnLogin.innerHTML = '<span class="animate-pulse">A verificar...</span>';
    divErro.textContent = '';

    try {
        // Endpoint de Supabase para hacer login con email y contraseña
        const url = `${AppConfig.SUPABASE_URL}${AppConfig.ENDPOINTS.AUTH}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': AppConfig.SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error_description || 'Credenciais inválidas.');
        }

        // ÉXITO: Guardamos el token en sessionStorage (se borra al cerrar la pestaña)
        sessionStorage.setItem('supabase_token', data.access_token);
        
        // Redirigimos al lector XML
        window.location.href = 'importador.html';

    } catch (error) {
        divErro.textContent = error.message;
        btnLogin.disabled = false;
        btnLogin.innerHTML = '<i data-lucide="log-in" class="h-5 w-5"></i> Entrar';
        lucide.createIcons(); // Recargar el icono
    }
});