// saft-parser.js - Lógica exclusiva para processar ficheiros XML (SAF-T)

async function processarSaftCompleto(textoXml) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(textoXml, "text/xml");

    if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
        throw new Error("O ficheiro não é um XML válido.");
    }

    try {
        // 1. COMPANY & PLACES
        const clientesXML = Array.from(xmlDoc.getElementsByTagName("Customer"));
        const company = [];
        const places = [];
        const mapClientesInfo = {}; 

        clientesXML.forEach(c => {
            const customerId = c.getElementsByTagName("CustomerID")[0]?.textContent?.trim();
            if (!customerId) return;

            const companyName = c.getElementsByTagName("CompanyName")[0]?.textContent?.trim() || "Sem Nome";
            const taxId = c.getElementsByTagName("CustomerTaxID")[0]?.textContent?.trim() || null; 
            
            mapClientesInfo[customerId] = { nif: taxId }; 

            company.push({ id: customerId, descricao: companyName });

            const morada = c.getElementsByTagName("BillingAddress")[0];
            const addr = morada?.getElementsByTagName("AddressDetail")[0]?.textContent?.trim() || "";
            const city = morada?.getElementsByTagName("City")[0]?.textContent?.trim() || "";
            
            places.push({
                id: customerId, 
                descricao: `${addr}, ${city}`.trim() || "Morada não especificada",
                company: companyName
            });
        });

        // 2. PRODUCTS
        const productosXML = Array.from(xmlDoc.getElementsByTagName("Product"));
        const products = productosXML.map(p => ({
            id: p.getElementsByTagName("ProductCode")[0]?.textContent?.trim() || "N/A",
            descricao: p.getElementsByTagName("ProductDescription")[0]?.textContent?.trim() || "Sem Descrição",
            product_group: p.getElementsByTagName("ProductGroup")[0]?.textContent?.trim() || null,
            product_number_code: p.getElementsByTagName("ProductNumberCode")[0]?.textContent?.trim() || null,
            type: p.getElementsByTagName("ProductType")[0]?.textContent?.trim() || "S"
        }));

        // 3. DOCUMENTS & DETAILS
        const invoicesXML = Array.from(xmlDoc.getElementsByTagName("Invoice"));
        const documents = [];
        const documentdetails = [];

        invoicesXML.forEach(f => {
            const invoiceNo = f.getElementsByTagName("InvoiceNo")[0]?.textContent?.trim();
            const customerId = f.getElementsByTagName("CustomerID")[0]?.textContent?.trim();
            
            if (!invoiceNo || !customerId) return;
            if (!mapClientesInfo[customerId]) return; // Si no existe el cliente, ignoramos

            const totals = f.getElementsByTagName("DocumentTotals")[0];
            const nifCliente = mapClientesInfo[customerId].nif; 
            const prazoVenc = f.getElementsByTagName("PaymentTerms")[0]?.textContent?.trim() || null;

            // --- CABECERA DE LA FACTURA ---
            documents.push({
                id: invoiceNo,
                date: f.getElementsByTagName("InvoiceDate")[0]?.textContent?.trim(),
                doc_type: f.getElementsByTagName("InvoiceType")[0]?.textContent?.trim() || null,
                system_entry_date: f.getElementsByTagName("SystemEntryDate")[0]?.textContent?.trim() || null,
                
                customer_id: customerId,
                contribuinte1: nifCliente,          // NIF extraído del XML (Cliente)
                contribuinte2: '506648559',         // Tu NIF (Fijo)
                record_source: 'saft',              // Origen de los datos
                prazo_venc: prazoVenc,     
                
                atcud: f.getElementsByTagName("ATCUD")[0]?.textContent?.trim() || null,
                doc_status: f.getElementsByTagName("DocumentStatus")[0]?.getElementsByTagName("InvoiceStatus")[0]?.textContent?.trim() || null,
                hash_code: f.getElementsByTagName("Hash")[0]?.textContent?.trim() || null,
                period: f.getElementsByTagName("Period")[0]?.textContent?.trim() || null,
                movement_start_time: f.getElementsByTagName("MovementStartTime")[0]?.textContent?.trim() || null,
                
                net_total: parseFloat(totals?.getElementsByTagName("NetTotal")[0]?.textContent || 0),
                tax_payable: parseFloat(totals?.getElementsByTagName("TaxPayable")[0]?.textContent || 0),
                gross_total: parseFloat(totals?.getElementsByTagName("GrossTotal")[0]?.textContent || 0)
            });

            // --- LÍNEAS DE LA FACTURA ---
            const lineasXML = Array.from(f.getElementsByTagName("Line"));
            lineasXML.forEach(l => {
                documentdetails.push({
                    _invoice_id: invoiceNo, 
                    id: `${invoiceNo}-${l.getElementsByTagName("LineNumber")[0]?.textContent}`,
                    product: l.getElementsByTagName("ProductCode")[0]?.textContent,
                    product_description: l.getElementsByTagName("ProductDescription")[0]?.textContent,
                    qtty: parseFloat(l.getElementsByTagName("Quantity")[0]?.textContent || 0),
                    price: parseFloat(l.getElementsByTagName("UnitPrice")[0]?.textContent || 0),
                    tax: parseFloat(l.getElementsByTagName("Tax")[0]?.getElementsByTagName("TaxPercentage")[0]?.textContent || 0)
                });
            });
        });

        const payload = { company, places, products, documents, documentdetails };
        await enviarTodoASupabase(payload);

    } catch (err) {
        throw new Error(`Falha no mapeamento: ${err.message}`);
    }
}

async function enviarTodoASupabase(payload) {
    // 1. Enviar los catálogos primero
    const tareasBasicas = [
        { nombre: 'Empresas (Company)', data: payload.company, endpoint: AppConfig.ENDPOINTS.COMPANY },
        { nombre: 'Moradas (Places)', data: payload.places, endpoint: AppConfig.ENDPOINTS.PLACES },
        { nombre: 'Produtos', data: payload.products, endpoint: AppConfig.ENDPOINTS.PRODUCTS }
    ];

    for (const tarea of tareasBasicas) {
        if (!tarea.data || tarea.data.length === 0) continue;
        mostrarMensagem(`A guardar ${tarea.nombre}...`, "text-yellow-600");
        try {
            await enviarPeticion(tarea.endpoint, tarea.data);
        } catch (error) {
            console.error(`Erro em ${tarea.nombre}:`, error);
        }
    }

    // 2. Enviar Documentos y pedirle a Supabase que nos devuelva los datos insertados
    if (payload.documents && payload.documents.length > 0) {
        mostrarMensagem(`A guardar Documentos...`, "text-yellow-600");
        try {
            const documentosInsertados = await enviarPeticion(AppConfig.ENDPOINTS.DOCUMENTS, payload.documents, true);

            // 3. Mapear el 'internal_id' a cada línea de detalle
            if (payload.documentdetails && payload.documentdetails.length > 0 && documentosInsertados) {
                mostrarMensagem(`A guardar Detalhes...`, "text-yellow-600");
                
                const mapaIds = {};
                documentosInsertados.forEach(doc => {
                    mapaIds[doc.id] = doc.internal_id; 
                });

                const detallesFinales = payload.documentdetails.map(det => {
                    const idRealPadre = mapaIds[det._invoice_id];
                    delete det._invoice_id; 
                    return {
                        ...det,
                        document_id: idRealPadre
                    };
                }).filter(det => det.document_id);

                if (detallesFinales.length > 0) {
                    const lotesDeDetalles = dividirEnLotes(detallesFinales, 1000);
                    
                    for (const lote of lotesDeDetalles) {
                        await enviarPeticion(AppConfig.ENDPOINTS.DOCUMENT_DETAILS, lote);
                    }
                }
            }
        } catch (error) {
            console.error(`Erro nos Documentos/Detalhes:`, error);
            mostrarMensagem(`Erro a guardar documentos: ${error.message}`, "text-red-600");
            return;
        }
    }

    mostrarMensagem("Sucesso! Base de dados sincronizada.", "text-green-600");
    
    // El ID se actualizó para coincidir con el importador.html
    const inputFicheiro = document.getElementById('archivoEntrada');
    if (inputFicheiro) {
        inputFicheiro.value = "";
    }
}

// Función extra para dividir arrays grandes en trozos pequeños
function dividirEnLotes(array, tamanhoLote) {
    const lotes = [];
    for (let i = 0; i < array.length; i += tamanhoLote) {
        lotes.push(array.slice(i, i + tamanhoLote));
    }
    return lotes;
}

async function enviarPeticion(endpoint, data, returnData = false) {
    const url = `${AppConfig.SUPABASE_URL}${endpoint}`;
    
    const headers = {
        'Content-Type': 'application/json',
        'apikey': AppConfig.SUPABASE_ANON_KEY,
        'Authorization': `${AppConfig.SUPABASE_ANON_KEY}`,
        'Prefer': returnData ? 'return=representation,resolution=ignore-duplicates' : 'resolution=ignore-duplicates'
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || response.statusText);
    }

    if (returnData) {
        return await response.json();
    }
}