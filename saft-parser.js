// saft-parser.js - Lógica exclusiva para processar ficheiros XML (SAF-T)

async function processarSaftCompleto(textoXml) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(textoXml, "text/xml");

    if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
        throw new Error("O ficheiro não é um XML válido.");
    }

    try {
        // Extraer el NIF del Emisor (tú) desde la cabecera general de forma dinámica
        const nifEmisorSaft = xmlDoc.getElementsByTagName("TaxRegistrationNumber")[0]?.textContent?.trim() || "506648559";

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
            
            // Guardamos el NIF en el mapa temporal para usarlo enlazado a los documentos
            mapClientesInfo[customerId] = { nif: taxId }; 

            // Ahora incluimos el NIF para la tabla estructurada en Supabase
            company.push({ 
                id: customerId, 
                descricao: companyName,
                nif: taxId
            });

            const morada = c.getElementsByTagName("BillingAddress")[0];
            const addr = morada?.getElementsByTagName("AddressDetail")[0]?.textContent?.trim() || "";
            const city = morada?.getElementsByTagName("City")[0]?.textContent?.trim() || "";
            
            // El campo 'company' debe asociarse al ID único (CustomerID), no al nombre
            places.push({
                id: customerId, 
                descricao: `${addr}, ${city}`.trim() === "," ? "Morada não especificada" : `${addr}, ${city}`.trim(),
                company: customerId
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
            if (!mapClientesInfo[customerId]) return;

            const totals = f.getElementsByTagName("DocumentTotals")[0];
            const nifCliente = mapClientesInfo[customerId].nif; 
            const prazoVenc = f.getElementsByTagName("PaymentTerms")[0]?.textContent?.trim() || null;

            documents.push({
                id: invoiceNo,
                date: f.getElementsByTagName("InvoiceDate")[0]?.textContent?.trim(),
                doc_type: f.getElementsByTagName("InvoiceType")[0]?.textContent?.trim() || null,
                system_entry_date: f.getElementsByTagName("SystemEntryDate")[0]?.textContent?.trim() || null,
                customer_id: customerId,
                contribuinte1: nifCliente,      // El comprador (NIF de tu cliente)
                contribuinte2: nifEmisorSaft,  // El vendedor (Tu NIF extraído del XML)
                record_source: 'saft',
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

            // Mapeo exacto de líneas e impuestos del XML real
            const lineasXML = Array.from(f.getElementsByTagName("Line"));
            lineasXML.forEach(l => {
                const lineNo = l.getElementsByTagName("LineNumber")[0]?.textContent;
                const taxNode = l.getElementsByTagName("Tax")[0];
                const percentage = parseFloat(taxNode?.getElementsByTagName("Percentage")[0]?.textContent || 0);

                documentdetails.push({
                    _invoice_id: invoiceNo, 
                    id: `${invoiceNo}-${lineNo}`,
                    product: l.getElementsByTagName("ProductCode")[0]?.textContent || null,
                    product_description: l.getElementsByTagName("ProductDescription")[0]?.textContent || null,
                    qtty: parseFloat(l.getElementsByTagName("Quantity")[0]?.textContent || 0),
                    price: parseFloat(l.getElementsByTagName("UnitPrice")[0]?.textContent || 0),
                    tax: percentage
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
    const tareasBasicas = [
        { nombre: 'Empresas', data: payload.company, endpoint: AppConfig.ENDPOINTS.COMPANY },
        { nombre: 'Moradas', data: payload.places, endpoint: AppConfig.ENDPOINTS.PLACES },
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

    if (payload.documents && payload.documents.length > 0) {
        mostrarMensagem(`A guardar Documentos...`, "text-yellow-600");
        try {
            // Enviamos documentos con returnData = true para sincronizar internal_id
            const documentosInsertados = await enviarPeticion(AppConfig.ENDPOINTS.DOCUMENTS, payload.documents, true);

            if (payload.documentdetails && payload.documentdetails.length > 0 && documentosInsertados) {
                mostrarMensagem(`A guardar Detalhes...`, "text-yellow-600");
                
                const mapaIds = {};
                documentosInsertados.forEach(doc => {
                    mapaIds[doc.id] = doc.internal_id; 
                });

                const detallesFinales = payload.documentdetails.map(det => {
                    const idRealPadre = mapaIds[det._invoice_id];
                    delete det._invoice_id; 
                    return { ...det, document_id: idRealPadre };
                }).filter(det => det.document_id);

                if (detallesFinales.length > 0) {
                    // Envío segmentado en lotes para prevenir Timeouts HTTP
                    const lotes = dividirEnLotes(detallesFinales, 500);
                    for (const lote of lotes) {
                        await enviarPeticion(AppConfig.ENDPOINTS.DOCUMENT_DETAILS, lote);
                    }
                }
            }
        } catch (error) {
            console.error(error);
            mostrarMensagem(`Erro nos Documentos: ${error.message}`, "text-red-600");
            return;
        }
    }

    mostrarMensagem("Sucesso! Base de dados sincronizada.", "text-green-600");
    
    const inputGlobal = document.getElementById('archivoXml');
    if (inputGlobal) inputGlobal.value = "";
}

function dividirEnLotes(array, tamanhoLote) {
    const lotes = [];
    for (let i = 0; i < array.length; i += tamanhoLote) {
        lotes.push(array.slice(i, i + tamanhoLote));
    }
    return lotes;
}

async function enviarPeticion(endpoint, data, returnData = false) {
    // 🚀 CORRECCIÓN CRÍTICA: Ya NO hacemos split('?')[0]. Respetamos el on_conflict de config.js para evitar el 409
    const url = `${AppConfig.SUPABASE_URL}${endpoint}`;
    
    const headers = {
        'Content-Type': 'application/json',
        'apikey': AppConfig.SUPABASE_ANON_KEY,
        'Authorization': `${AppConfig.SUPABASE_ANON_KEY}`,
        // 'resolution=ignore-duplicates' le dice a la base de datos que descarte duplicados pacíficamente
        'Prefer': returnData ? 'return=representation,resolution=ignore-duplicates' : 'resolution=ignore-duplicates'
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(err.message || response.statusText);
    }

    if (returnData) return await response.json();
}