// config.js
window.AppConfig = {
    // 1. Base de Dados e Autenticação (Ajusta la URL real de tu servidor aquí)
    SUPABASE_URL: 'https://supabase1.myserver.pt',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjEyMzQ1Njc4LCJleHAiOjI2MTIzNDU2Nzh9.szPPmYS9Pa9WENwHSgsrd7i_YaYLmmORiVqA9jguyGc',

    // 2. Rotas da API (Endpoints REST e Auth de Supabase)
    ENDPOINTS: {
        AUTH: '/auth/v1/token?grant_type=password', // Endpoint for login
        COMPANY: '/rest/v1/company', 
        PRODUCTS: '/rest/v1/products',
        PLACES: '/rest/v1/places?on_conflict=id,descricao,company',
        DOCUMENTS: '/rest/v1/documents',
        DOCUMENT_DETAILS: '/rest/v1/documentdetails',
        
        // 🚀 NUEVO: Endpoint para la tabla de extractos bancarios
        // (Ajusta a 'bank_details' en minúsculas si tu tabla en Postgres se creó así)
        BANK_DETAILS: '/rest/v1/bank_details?on_conflict=id' 
    },

    // 3. Configuração de Leitura y Procesamiento
    SETTINGS: {
        ENCODING: 'windows-1252',
        DEBUG: true,
        
        // 🚀 NUEVO: Centralizamos el tamaño del lote para los envíos AJAX
        BATCH_SIZE: 500 
    }
};

console.log("⚙️ Configuração carregada: AppConfig inicializado.");