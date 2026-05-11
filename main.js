// main.js - El "Policía de Tráfico" (Controlador Principal)

document.getElementById('btnProcessar').addEventListener('click', async () => {
    // Agora procuramos os TRÊS inputs diferentes
    const inputXml = document.getElementById('archivoXml'); 
    const inputCsv = document.getElementById('archivoCsv'); 
    const inputXlsx = document.getElementById('archivoXlsx'); 
    
    const temXml = inputXml?.files?.length > 0;
    const temCsv = inputCsv?.files?.length > 0;
    const temXlsx = inputXlsx?.files?.length > 0;

    // Se não selecionou nenhum ficheiro em nenhum dos campos
    if (!temXml && !temCsv && !temXlsx) {
        mostrarMensagem("Aviso: Selecione pelo menos um ficheiro (XML, CSV ou XLSX) primeiro.", "text-red-600");
        return;
    }

    // 1. PROCESSAR SAF-T (XML)
    if (temXml) {
        const arquivo = inputXml.files[0];
        if (arquivo.name.toLowerCase().endsWith('.xml')) {
            mostrarMensagem("Ficheiro XML detetado. A ler SAF-T...", "text-blue-600");
            await lerFicheiro(arquivo, processarSaftCompleto, 'text'); 
        } else {
            mostrarMensagem("Erro: O ficheiro no campo SAF-T não é um XML válido.", "text-red-600");
            return;
        }
    } 
    
    // 2. PROCESSAR e-fatura (CSV)
    if (temCsv) {
        const arquivo = inputCsv.files[0];
        if (arquivo.name.toLowerCase().endsWith('.csv')) {
            mostrarMensagem("Ficheiro CSV detetado. A ler e-fatura...", "text-blue-600");
            await lerFicheiro(arquivo, processarEfaturaCompleto, 'text'); 
        } else {
            mostrarMensagem("Erro: O ficheiro no campo e-fatura não é um CSV válido.", "text-red-600");
            return;
        }
    }

    // 3. PROCESSAR EXCEL BANCÁRIO (XLSX) - 🚀 NOVO
    if (temXlsx) {
        const arquivo = inputXlsx.files[0];
        // Aceita .xlsx ou .xls
        if (arquivo.name.toLowerCase().includes('.xls')) {
            mostrarMensagem("Ficheiro Excel detetado. A processar extrato bancário...", "text-blue-600");
            // IMPORTANTE: Passamos 'binary' para ler como ArrayBuffer
            await lerFicheiro(arquivo, processarXlsxCompleto, 'binary'); 
        } else {
            mostrarMensagem("Erro: O ficheiro no campo Excel não é um XLSX válido.", "text-red-600");
            return;
        }
    }
});

// 2. LECTOR DE ARCHIVOS UNIVERSAL (Texto para XML/CSV, Binário para Excel)
function lerFicheiro(arquivo, callbackProcessamento, modo = 'text') {
    return new Promise((resolve, reject) => {
        const leitor = new FileReader();
        
        leitor.onload = async (e) => {
            try {
                // e.target.result será texto puro ou um ArrayBuffer binário dependendo do modo
                await callbackProcessamento(e.target.result);
                resolve();
            } catch (err) {
                console.error(err);
                mostrarMensagem(`Erro no processamento: ${err.message}`, "text-red-600");
                reject(err);
            }
        };

        leitor.onerror = () => {
            mostrarMensagem("Erro ao ler o ficheiro no navegador.", "text-red-600");
            reject(new Error("Erro de leitura"));
        };

        // 🚀 Ajuste crítico: Excel precisa de readAsArrayBuffer
        if (modo === 'binary') {
            leitor.readAsArrayBuffer(arquivo);
        } else {
            leitor.readAsText(arquivo, AppConfig.SETTINGS?.ENCODING || 'UTF-8');
        }
    });
}

// 3. SISTEMA DE MENSAJES COMPARTIDO
function mostrarMensagem(texto, claseCor) {
    const div = document.getElementById('mensagemEstado');
    if (div) {
        div.textContent = texto;
        div.className = `mt-4 text-center text-sm font-medium ${claseCor} block`;
    }
}