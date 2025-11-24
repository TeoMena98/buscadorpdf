// /api/buscar.js
export default async function handler(req, res) {
  const folderId = "1HL5lFce29wBN17LAEv3ACvczRPb4aV5m";

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  // Ahora incluimos destino
  const { destino, telefono, adultos, ninos, infantes } = req.body || {};

  // helper: normalizar strings (quita tildes y pasa a minúsculas)
  const normalize = (s) =>
    (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  try {
    const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and mimeType='application/pdf'&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&key=${process.env.GOOGLE_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.files) {
      return res.status(500).json({ error: "Google no devolvió archivos", data });
    }

    // PROCESAR ARCHIVOS (parser tolerante)
    const procesados = data.files.map(file => {
      try {
        const clean = file.name.replace(/\.pdf$/i, "");
        const partes = clean.split(" ").filter(Boolean);

        // 1) encontrar índice del teléfono (primer token que sea todo dígitos largos)
        const telefonoIndex = partes.findIndex(p => /^[0-9]{6,}$/.test(p));
        const telefonoArchivo = telefonoIndex >= 0 ? partes[telefonoIndex] : null;

        // 2) encontrar token que contiene '_' (normalmente el bloque ORIGEN_FECHA_PAX)
        //    puede estar en una sola pieza: "BOG_29-Nov-03-Dic_1A0K0I"
        const bloqueIndex = partes.findIndex(p => p.includes("_"));
        const bloqueRaw = bloqueIndex >= 0 ? partes[bloqueIndex] : null;

        // 3) pax token (por si está separado)
        const paxTokenIndex = partes.findIndex(p => /A\d+K\d+I/i.test(p));
        const paxToken = paxTokenIndex >= 0 ? partes[paxTokenIndex] : null;

        // 4) destino: todo lo que esté entre "Cotizacion" y el teléfonoIndex
        //    (asumiendo que "Cotizacion" es partes[0])
        let destinoFinal = null;
        if (telefonoIndex > 1) {
          destinoFinal = partes.slice(1, telefonoIndex).join(" ");
        } else if (telefonoIndex === -1 && partes.length > 2) {
          // fallback: si no se encontró teléfono, tomar entre "Cotizacion" y el bloque con '_'
          if (bloqueIndex > 1) destinoFinal = partes.slice(1, bloqueIndex).join(" ");
          else destinoFinal = partes.slice(1, 2).join(" ");
        }

        // 5) extraer fechas y pax desde bloqueRaw preferiblemente
        let fechaIda = null;
        let fechaRegreso = null;
        let adultosArchivo = null;
        let ninosArchivo = null;
        let infantesArchivo = null;

        if (bloqueRaw) {
          // dividir por '_' -> [ORIGEN, "29-Nov-03-Dic", "1A0K0I"] (posible)
          const bloques = bloqueRaw.split("_").filter(Boolean);

          // si tenemos el sub-bloque de fechas
          if (bloques.length >= 2) {
            // bloques[1] es el string con guiones: "29-Nov-03-Dic"
            const fechasSeparadas = bloques[1].split("-");
            if (fechasSeparadas.length >= 4) {
              fechaIda = `${fechasSeparadas[0]}-${fechasSeparadas[1]}`;
              fechaRegreso = `${fechasSeparadas[2]}-${fechasSeparadas[3]}`;
            } else if (fechasSeparadas.length >= 2) {
              // fallback por si las fechas vienen en formato diferente
              fechaIda = bloques[1];
            }
          }

          // pax preferible en bloques[2]
          if (bloques.length >= 3 && /A\d+K\d+I/i.test(bloques[2])) {
            const m = bloques[2].match(/(\d+)A(\d+)K(\d+)I/i);
            if (m) {
              adultosArchivo = parseInt(m[1], 10);
              ninosArchivo = parseInt(m[2], 10);
              infantesArchivo = parseInt(m[3], 10);
            }
          }
        }

        // si no se extrajo pax aún, buscar token separado (paxToken)
        if (paxToken && (!adultosArchivo && adultosArchivo !== 0)) {
          const m2 = paxToken.match(/(\d+)A(\d+)K(\d+)I/i);
          if (m2) {
            adultosArchivo = parseInt(m2[1], 10);
            ninosArchivo = parseInt(m2[2], 10);
            infantesArchivo = parseInt(m2[3], 10);
          }
        }

        // última comprobación: si pax no está, intentar buscar en cualquier parte
        if ((adultosArchivo === null || ninosArchivo === null || infantesArchivo === null)) {
          const anyPax = partes.find(p => /A\d+K\d+I/i.test(p));
          if (anyPax) {
            const ma = anyPax.match(/(\d+)A(\d+)K(\d+)I/i);
            if (ma) {
              adultosArchivo = parseInt(ma[1], 10);
              ninosArchivo = parseInt(ma[2], 10);
              infantesArchivo = parseInt(ma[3], 10);
            }
          }
        }

        return {
          id: file.id,
          archivo: file.name,
          destino: destinoFinal,
          telefonoArchivo,
          fechaIda,
          fechaRegreso,
          adultosArchivo,
          ninosArchivo,
          infantesArchivo,
          link: `https://drive.google.com/file/d/${file.id}/view`,
          valido: true
        };

      } catch (err) {
        return {
          id: file.id,
          archivo: file.name,
          valido: false,
          errorParseo: err.message,
          link: `https://drive.google.com/file/d/${file.id}/view`
        };
      }
    });

    // APLICAR FILTROS (incluye destino) con normalización y tolerancia
    const filDestino = normalize(destino);
    const filTelefono = (telefono || "").trim();

    const filtrados = procesados.filter(pdf => {
      if (!pdf.valido) return false;

      // teléfono
      if (filTelefono && filTelefono.length > 0) {
        if (!pdf.telefonoArchivo || !pdf.telefonoArchivo.includes(filTelefono)) return false;
      }

      // destino (insensible a tildes y mayúsculas)
      if (filDestino && filDestino.length > 0) {
        const pdfDestinoNorm = normalize(pdf.destino || "");
        if (!pdfDestinoNorm.includes(filDestino)) return false;
      }

      // adultos
      if (typeof adultos !== "undefined" && adultos !== "" && adultos !== null) {
        if (pdf.adultosArchivo === null || pdf.adultosArchivo !== Number(adultos)) return false;
      }

      // ninos
      if (typeof ninos !== "undefined" && ninos !== "" && ninos !== null) {
        if (pdf.ninosArchivo === null || pdf.ninosArchivo !== Number(ninos)) return false;
      }

      // infantes
      if (typeof infantes !== "undefined" && infantes !== "" && infantes !== null) {
        if (pdf.infantesArchivo === null || pdf.infantesArchivo !== Number(infantes)) return false;
      }

      return true;
    });

    return res.status(200).json(filtrados);

  } catch (error) {
    console.error("ERROR:", error);
    return res.status(500).json({ error: error.message });
  }
}
