// xlsx-parser.js - Procesador ultra robusto para extractos bancarios (Millennium bcp)

async function processarXlsxCompleto(buffer) {
    mostrarMensagem("A processar extrato bancário (XLSX)...", "text-blue-600");

    try {
        // Leer el archivo binario con SheetJS
        const workbook = XLSX.read(buffer, { type: 'array' });
        const primeiraHoja = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[primeiraHoja];

        // 1. EXTRAER Y LIMPIAR EL NÚMERO DE CUENTA (Celda C2 o búsqueda de respaldo)
        let rawAccount = "";
        if (worksheet['C2'] && worksheet['C2'].v) {
            rawAccount = String(worksheet['C2'].v);
        } else if (worksheet['B2'] && worksheet['B2'].v) {
            rawAccount = String(worksheet['B2'].v);
        }

        // Respaldo: si no está en C2/B2, busca en las primeras 5 filas cualquier celda con una cuenta larga
        if (!rawAccount || !/\d{10}/.test(rawAccount)) {
            for (let r = 1; r <= 5; r++) {
                for (let c of ['A', 'B', 'C', 'D']) {
                    const celda = worksheet[c + r];
                    if (celda && celda.v && /\d{10}/.test(String(celda.v))) {
                        rawAccount = String(celda.v);
                        break;
                    }
                }
                if (rawAccount && /\d{10}/.test(rawAccount)) break;
            }
        }

        // Dejar exclusivamente los números (de "0000045244195486 - EUR" -> "0000045244195486")
        const accountNumber = rawAccount.replace(/\D/g, "");

        if (!accountNumber) {
            throw new Error("Não foi possível encontrar um número de conta válido no cabeçalho do Excel.");
        }

        // 2. LEER MOVIMIENTOS (Ignorando las 7 líneas superiores de metadatos del banco)
        // defval: null asegura que las celdas vacías se lean como null en lugar de omitirse
        const hojaData = XLSX.utils.sheet_to_json(worksheet, { range: 7, defval: null });

        if (hojaData.length === 0) {
            throw new Error("Não foram encontrados movimentos na tabela a partir da linha 8.");
        }

        const movimientos = [];

        // Función auxiliar para buscar columnas ignorando mayúsculas, minúsculas y espacios
        const getProp = (obj, nombresPosibles) => {
            for (let key in obj) {
                const cleanKey = key.trim().toLowerCase();
                for (let nombre of nombresPosibles) {
                    if (cleanKey === nombre) {
                        return obj[key];
                    }
                }
            }
            return null;
        };

        for (const item of hojaData) {
            const dataLancRaw = getProp(item, ['data lançamento', 'data lancamento', 'lançamento', 'lancamento']);
            const descRaw = getProp(item, ['descrição', 'descricao']);

            // Si la fila no tiene fecha o descripción, se ignora (evita filas vacías al final del Excel)
            if (!dataLancRaw || !descRaw) continue;

            const dataLancamento = formatarDataPtParaIso(dataLancRaw);
            const dataValor = formatarDataPtParaIso(getProp(item, ['data valor', 'valor'])) || dataLancamento;
            const descricao = String(descRaw).trim();

            // Limpieza y conversión segura de montantes y saldos (reemplaza comas por puntos)
            const montanteRaw = getProp(item, ['montante', 'valor', 'total']);
            const montante = parseFloat(String(montanteRaw || '0').replace(',', '.')) || 0;

            const saldoRaw = getProp(item, ['saldo contabilistico', 'saldo']);
            const saldo = parseFloat(String(saldoRaw || '0').replace(',', '.')) || 0;

            const notasRaw = getProp(item, ['notas', 'nota']);
            const notas = notasRaw ? String(notasRaw).trim() : null;

            // Generar un ID único robusto y seguro para la base de datos (evita duplicados)
            const descLimpia = descricao.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').substring(0, 25);
            const idUnico = `BCP_${accountNumber}_${dataLancamento}_${montante}_${descLimpia}`;

            movimientos.push({
                id: idUnico,
                account_number: accountNumber,
                data_lancamento: dataLancamento,
                data_valor: dataValor,
                descricao: descricao,
                montante: montante,
                saldo_contabilistico: saldo,
                moeda: getProp(item, ['moeda']) || 'EUR',
                notas: notas,
                tratado: false
            });
        }

        // 3. ENVIAR A SUPABASE POR LOTES MEDIANTE AJAX
        mostrarMensagem(`A guardar ${movimientos.length} movimentos da conta ${accountNumber}...`, "text-yellow-600");

        const endpoint = AppConfig.ENDPOINTS?.BANK_DETAILS || '/rest/v1/bank_details';
        const loteTamano = AppConfig.SETTINGS?.BATCH_SIZE || 500;

        for (let i = 0; i < movimientos.length; i += loteTamano) {
            const lote = movimientos.slice(i, i + loteTamano);
            await enviarPeticionAjax(endpoint, lote);
        }

        mostrarMensagem("Sucesso! Extrato bancário importado corretamente.", "text-green-600");
        
        const inputXlsx = document.getElementById('archivoXlsx');
        if (inputXlsx) inputXlsx.value = "";

    } catch (err) {
        console.error("Error en processarXlsxCompleto:", err);
        mostrarMensagem(`Erro no Excel: ${err.message}`, "text-red-600");
    }
}

// ============================================================================
// FUNCIÓN AJAX DEDICADA (Envía cabeceras de autorización limpias)
// ============================================================================
async function enviarPeticionAjax(endpoint, payload) {
    const baseUrl = AppConfig.SUPABASE_URL;
    const url = `${baseUrl}${endpoint}`;

    // Realizamos la llamada AJAX usando SIEMPRE la clave fija en 'apikey'
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Prefer': 'resolution=ignore-duplicates',
            // 🚀 REGLA DE ORO: Supabase siempre necesita la ANON_KEY en este campo,
            // nunca el access_token del usuario.
            'apikey': AppConfig.SUPABASE_ANON_KEY 
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Erro AJAX HTTP ${response.status}: ${errorData.message || response.statusText}`);
    }

    return response;
}

// Función a prueba de fallos para formatear fechas
function formatarDataPtParaIso(dataVal) {
    if (dataVal === null || dataVal === undefined) return null;

    if (dataVal instanceof Date) {
        if (isNaN(dataVal.getTime())) return null;
        return dataVal.toISOString().split('T')[0];
    }

    if (typeof dataVal === 'number') {
        const fecha = new Date((dataVal - (dataVal > 59 ? 25569 : 25568)) * 86400 * 1000);
        return fecha.toISOString().split('T')[0];
    }

    const dataStr = String(dataVal).trim();

    if (/^\d{4}-\d{2}-\d{2}/.test(dataStr)) {
        return dataStr.substring(0, 10);
    }

    const partes = dataStr.split(/[\/\-]/);
    if (partes.length === 3) {
        if (partes[0].length === 4) {
            return `${partes[0]}-${partes[1].padStart(2, '0')}-${partes[2].padStart(2, '0')}`;
        }
        return `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
    }

    return dataStr;
}