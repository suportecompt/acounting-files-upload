// efatura-parser.js - Lógica processamento e-fatura (Todas as faturas)

async function processarEfaturaCompleto(textoCsv) {
    mostrarMensagem("A analisar a estrutura do CSV...", "text-blue-600");

    try {
        const lineas = textoCsv.split(/\r?\n/).filter(l => l.trim().length > 0);
        
        if (lineas.length < 2) {
            throw new Error("O ficheiro CSV não tem dados suficientes.");
        }

        const datosFacturas = [];

        // Saltamos la línea 0 (cabeceras)
        for (let i = 1; i < lineas.length; i++) {
            const columnas = lineas[i].split(';');

            // Función auxiliar para quitar las comillas "" de cada celda
            const cleanCol = (index) => columnas[index] ? columnas[index].replace(/^"|"$/g, '').trim() : '';

            // Extraer NIF (Cortamos por " - " y nos quedamos la primera parte)
            const emitenteRaw = cleanCol(1);
            const nifEmitente = emitenteRaw.split(' - ')[0]?.trim();

            // Extraer Nº Fatura y ATCUD (Cortamos por " / ")
            const faturaAtcudRaw = cleanCol(2);
            const numFatura = faturaAtcudRaw.split(' / ')[0]?.trim();
            const atcud = faturaAtcudRaw.split(' / ')[1]?.trim() || null;

            // Ya NO filtramos por estado, simplemente lo leemos para guardarlo
            const situacao = cleanCol(8);

            // Solo ignoramos si la línea está completamente rota y no tiene ID o NIF
            if (!nifEmitente || !numFatura) continue;

            datosFacturas.push({
                id: numFatura,                         
                contribuinte2: nifEmitente,             // Vendedor
                contribuinte1: '506648559',             // Comprador (O teu NIF)
                date: cleanCol(4),                      // Ya viene en YYYY-MM-DD
                doc_type: cleanCol(3) === 'Fatura-recibo' ? 'FR' : 'FT',
                record_source: 'efatura',               
                atcud: atcud,                           // Guardamos el ATCUD
                doc_status: situacao,                   // Guardamos el estado (Registado, etc.)
                
                // Limpieza de importes con símbolo €
                gross_total: limparMoeda(cleanCol(5)),
                tax_payable: limparMoeda(cleanCol(6)),
                net_total: limparMoeda(cleanCol(7)) 
            });
        }

        if (datosFacturas.length === 0) {
            throw new Error("Não há faturas válidas para importar no ficheiro.");
        }

        mostrarMensagem(`A guardar ${datosFacturas.length} faturas...`, "text-yellow-600");

        // Enviar a Supabase
        await enviarPeticion(AppConfig.ENDPOINTS.DOCUMENTS, datosFacturas);

        mostrarMensagem(`Sucesso! ${datosFacturas.length} faturas importadas sem erros.`, "text-green-600");
        document.getElementById('archivoEntrada').value = "";

    } catch (err) {
        console.error("Erro no processamento CSV:", err);
        mostrarMensagem(`Erro: ${err.message}`, "text-red-600");
    }
}

// Función que convierte "148,01 €" -> 148.01
function limparMoeda(valorStr) {
    if (!valorStr) return 0;
    const limpio = valorStr
        .replace('€', '')         // Quita el euro
        .replace(/\s/g, '')       // Quita espacios
        .replace(/\./g, '')       // Quita puntos de miles (si los hay)
        .replace(',', '.');       // Cambia la coma decimal a punto
    
    const num = parseFloat(limpio);
    return isNaN(num) ? 0 : num;
}