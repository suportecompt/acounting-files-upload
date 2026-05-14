// efatura-parser.js - Compatible con ambos formatos de e-fatura

async function processarEfaturaCompleto(textoCsv) {
    mostrarMensagem("A analizar a estrutura do CSV...", "text-blue-600");

    try {
        const lineas = textoCsv.split(/\r?\n/).filter(l => l.trim().length > 0);
        
        if (lineas.length < 2) {
            throw new Error("O ficheiro CSV não tem dados suficientes.");
        }

        // 1. DETECCIÓN DE FORMATO mediante la cabecera
        const cabecera = lineas[0].toLowerCase();
        let esTipoVenta = false;

        if (cabecera.includes("nif adquirente") || !cabecera.includes("setor")) {
            esTipoVenta = true; // Formato e-fatura.csv (Ventas/Emitidas)
        }

        const datosFacturas = [];

        // 2. PROCESAMIENTO DE LÍNEAS
        for (let i = 1; i < lineas.length; i++) {
            const columnas = lineas[i].split(';');
            const cleanCol = (index) => columnas[index] ? columnas[index].replace(/^"|"$/g, '').trim() : '';

            let nifVendedor, nifComprador, numFatura, atcud, fecha, tipoDoc, situacao, idxTotal, idxIva, idxBase;

            if (esTipoVenta) {
                /** FORMATO VENTAS (e-fatura.csv) **/
                const faturaAtcudRaw = cleanCol(0);
                numFatura = faturaAtcudRaw.split(' / ')[0]?.trim();
                atcud     = faturaAtcudRaw.split(' / ')[1]?.trim() || null;
                nifVendedor  = '506648559'; // Tu NIF como emisor
                nifComprador = cleanCol(1); 
                fecha        = cleanCol(2); // Columna 2
                tipoDoc      = cleanCol(3);
                situacao     = cleanCol(7);
                idxTotal = 4; idxIva = 5; idxBase = 6;
            } else {
                /** FORMATO GASTOS (2025...e-fatura.csv) **/
                const emitenteRaw = cleanCol(1);
                nifVendedor  = emitenteRaw.split(' - ')[0]?.trim();
                nifComprador = '506648559'; // Tu NIF como receptor
                const faturaAtcudRaw = cleanCol(2);
                numFatura = faturaAtcudRaw.split(' / ')[0]?.trim();
                atcud     = faturaAtcudRaw.split(' / ')[1]?.trim() || null;
                fecha        = cleanCol(4); // Columna 4
                tipoDoc      = cleanCol(3);
                situacao     = cleanCol(8);
                idxTotal = 5; idxIva = 6; idxBase = 7;
            }

            if (!numFatura || !fecha) continue;

            datosFacturas.push({
                id: numFatura, 
                date: fecha, 
                contribuinte1: nifComprador,
                contribuinte2: nifVendedor,
                doc_type: tipoDoc.toLowerCase().includes('recibo') ? 'FR' : (tipoDoc.toLowerCase().includes('crédito') ? 'NC' : 'FT'),
                atcud: atcud,
                doc_status: situacao,
                record_source: 'efatura',
                gross_total: limparMoeda(cleanCol(idxTotal)),
                tax_payable: limparMoeda(cleanCol(idxIva)),
                net_total: limparMoeda(cleanCol(idxBase))
            });
        }

        if (datosFacturas.length === 0) {
            throw new Error("Não há faturas válidas para importar.");
        }

        mostrarMensagem(`A guardar ${datosFacturas.length} faturas...`, "text-yellow-600");

        await enviarPeticion(AppConfig.ENDPOINTS.DOCUMENTS, datosFacturas);

        mostrarMensagem(`Sucesso! ${datosFacturas.length} faturas importadas.`, "text-green-600");
        document.getElementById('archivoCsv').value = "";

    } catch (err) {
        console.error("Erro no processamento CSV:", err);
        mostrarMensagem(`Erro: ${err.message}`, "text-red-600");
    }
}

function limparMoeda(valorStr) {
    if (!valorStr) return 0;
    const limpio = valorStr
        .replace('€', '')
        .replace(/\s/g, '')
        .replace(/\./g, '') 
        .replace(',', '.');
    
    const num = parseFloat(limpio);
    return isNaN(num) ? 0 : num;
}