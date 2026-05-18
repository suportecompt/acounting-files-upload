// efatura-parser.js - Sincronización automática de Documentos y Compañías

async function processarEfaturaCompleto(textoCsv) {
    mostrarMensagem("A analisar a estrutura do CSV...", "text-blue-600");

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
        const mapaEmpresasUnicas = {}; // Almacena temporalmente NIF -> Nombre para la tabla company

        // Datos base de tu propia empresa (como emisor en ventas o receptor en gastos)
        const MI_NIF = '506648559';
        const MI_NOMBRE = 'Paulo Joaquim da Silva Ferreira Unipessoal Lda';

        // 2. PROCESAMIENTO DE LÍNEAS
        for (let i = 1; i < lineas.length; i++) {
            const columnas = lineas[i].split(';');
            const cleanCol = (index) => columnas[index] ? columnas[index].replace(/^"|"$/g, '').trim() : '';

            let nifVendedor, nifComprador, nombreEmpresa = "", numFatura, atcud, fecha, tipoDoc, situacao, idxTotal, idxIva, idxBase;

            if (esTipoVenta) {
                /** FORMATO VENTAS (e-fatura.csv) **/
                const faturaAtcudRaw = cleanCol(0);
                numFatura = faturaAtcudRaw.split(' / ')[0]?.trim();
                atcud     = faturaAtcudRaw.split(' / ')[1]?.trim() || null;
                
                nifVendedor  = MI_NIF;
                nifComprador = cleanCol(1); 
                nombreEmpresa = "Cliente e-Fatura " + nifComprador; // El CSV de la AT no trae nombres de clientes, solo NIF
                
                fecha        = cleanCol(2); 
                tipoDoc      = cleanCol(3);
                situacao     = cleanCol(7);
                idxTotal = 4; idxIva = 5; idxBase = 6;
            } else {
                /** FORMATO GASTOS (2025...e-fatura.csv) **/
                const emitenteRaw = cleanCol(1);
                nifVendedor  = emitenteRaw.split(' - ')[0]?.trim();
                nombreEmpresa = emitenteRaw.split(' - ')[1]?.trim() || "Fornecedor Desconhecido";
                
                nifComprador = MI_NIF;
                
                const faturaAtcudRaw = cleanCol(2);
                numFatura = faturaAtcudRaw.split(' / ')[0]?.trim();
                atcud     = faturaAtcudRaw.split(' / ')[1]?.trim() || null;
                
                fecha        = cleanCol(4); 
                tipoDoc      = cleanCol(3);
                situacao     = cleanCol(8);
                idxTotal = 5; idxIva = 6; idxBase = 7;
            }

            if (!numFatura || !fecha) continue;

            // Recolectar mapeo de empresas únicas encontradas en las líneas
            if (nifVendedor && !mapaEmpresasUnicas[nifVendedor]) {
                mapaEmpresasUnicas[nifVendedor] = (nifVendedor === MI_NIF) ? MI_NOMBRE : nombreEmpresa;
            }
            if (nifComprador && !mapaEmpresasUnicas[nifComprador]) {
                mapaEmpresasUnicas[nifComprador] = (nifComprador === MI_NIF) ? MI_NOMBRE : nombreEmpresa;
            }

            // Mapeo exacto para la tabla public.documents
            datosFacturas.push({
                id: numFatura, 
                date: fecha, 
                doc_type: tipoDoc.toLowerCase().includes('recibo') ? 'FR' : (tipoDoc.toLowerCase().includes('crédito') ? 'NC' : 'FT'),
                system_entry_date: null,
                customer_id: esTipoVenta ? nifComprador : null,
                contribuinte1: nifComprador,
                prazo_venc: null,
                atcud: atcud,
                doc_status: situacao,
                hash_code: null,
                period: null,
                movement_start_time: null,
                net_total: limparMoeda(cleanCol(idxBase)),
                tax_payable: limparMoeda(cleanCol(idxIva)),
                gross_total: limparMoeda(cleanCol(idxTotal)),
                contribuinte2: nifVendedor,
                record_source: 'efatura',
                image_path: null
            });
        }

        if (datosFacturas.length === 0) {
            throw new Error("Não há faturas válidas para importar.");
        }

        // 3. ENVIAR PRIMERO LAS COMPAÑÍAS DETECTADAS (Evita vacíos de NIFs desconocidos)
        const listaEmpresas = Object.keys(mapaEmpresasUnicas).map(nif => ({
            id: nif,               // PK (text) -> Sincronizado con la lógica que usas en el XML
            nif: nif,              // Campo con Unique Index
            descricao: mapaEmpresasUnicas[nif] // Razón social obligatoria obtenida
        }));

        if (listaEmpresas.length > 0) {
            mostrarMensagem(`A guardar ${listaEmpresas.length} empresas encontradas no CSV...`, "text-yellow-600");
            try {
                // Sincroniza mediante AJAX nativo en tu endpoint de COMPANY
                await enviarPeticion(AppConfig.ENDPOINTS.COMPANY, listaEmpresas);
            } catch (companyError) {
                // Captura silenciosa para que los duplicados normales no detengan la subida de facturas
                console.warn("Aviso ao guardar empresas (ignorado para continuar):", companyError);
            }
        }

        // 4. ENVIAR LAS FACTURAS A LA TABLA PUBLIC.DOCUMENTS
        mostrarMensagem(`A guardar ${datosFacturas.length} faturas...`, "text-yellow-600");
        await enviarPeticion(AppConfig.ENDPOINTS.DOCUMENTS, datosFacturas);

        mostrarMensagem(`Sucesso! ${datosFacturas.length} faturas e empresas sincronizadas.`, "text-green-600");
        
        const inputCsv = document.getElementById('archivoCsv');
        if (inputCsv) inputCsv.value = "";

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