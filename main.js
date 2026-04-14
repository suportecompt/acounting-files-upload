// main.js - El "Policía de Tráfico" (Controlador Principal)

document.getElementById('btnProcessar').addEventListener('click', () => {
    const inputFicheiro = document.getElementById('archivoEntrada'); 
    
    if (!inputFicheiro?.files?.length) {
        mostrarMensagem("Aviso: Selecione um ficheiro primeiro.", "text-red-600");
        return;
    }

    const arquivo = inputFicheiro.files[0];
    const nomeArquivo = arquivo.name.toLowerCase();

    // 1. DETECTAR EL TIPO DE ARCHIVO
    if (nomeArquivo.endsWith('.xml')) {
        mostrarMensagem("Ficheiro XML detetado. A ler SAF-T...", "text-blue-600");
        // Llamamos al lector y le decimos que use la función del XML
        lerFicheiro(arquivo, processarSaftCompleto); 
    } 
    else if (nomeArquivo.endsWith('.csv')) {
        mostrarMensagem("Ficheiro CSV detetado. A ler e-fatura...", "text-blue-600");
        // Llamamos al lector y le decimos que use la función del CSV (que crearemos luego)
        lerFicheiro(arquivo, processarEfaturaCompleto); 
    } 
    else {
        mostrarMensagem("Erro: Formato não suportado. Use apenas .xml ou .csv", "text-red-600");
    }
});

// 2. LECTOR DE ARCHIVOS UNIVERSAL (Sirve para XML y CSV)
function lerFicheiro(arquivo, callbackProcessamento) {
    const leitor = new FileReader();
    
    leitor.onload = async (e) => {
        try {
            // Aquí e.target.result es el texto puro del archivo.
            // Se lo mandamos a la función que toque (XML o CSV)
            await callbackProcessamento(e.target.result);
        } catch (err) {
            console.error(err);
            mostrarMensagem(`Erro no processamento: ${err.message}`, "text-red-600");
        }
    };

    // Leemos el archivo usando la codificación de tu config.js
    leitor.readAsText(arquivo, AppConfig.SETTINGS?.ENCODING || 'UTF-8');
}

// 3. SISTEMA DE MENSAJES COMPARTIDO
function mostrarMensagem(texto, claseCor) {
    const div = document.getElementById('mensagemEstado');
    if (div) {
        div.textContent = texto;
        div.className = `mt-4 text-center text-sm font-medium ${claseCor} block`;
    }
}