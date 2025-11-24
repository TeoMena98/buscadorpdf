// /api/buscar.js

function formatearFecha12h(fechaISO) {
  if (!fechaISO) return null;
  const fecha = new Date(fechaISO);

  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const año = fecha.getFullYear();

  let horas = fecha.getHours();
  const minutos = String(fecha.getMinutes()).padStart(2, '0');

  const ampm = horas >= 12 ? 'PM' : 'AM';
  horas = horas % 12;
  horas = horas ? horas : 12; // convertir 0 → 12

  horas = String(horas).padStart(2, '0');

  return `${dia}/${mes}/${año} ${horas}:${minutos} ${ampm}`;
}
export default async function handler(req, res) {
  const folderId = "1HL5lFce29wBN17LAEv3ACvczRPb4aV5m";

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  // Incluimos MES
  const { destino, telefono, adultos, ninos, infantes, mes } = req.body || {};

  // helper: normalizar strings
  const normalize = (s) =>
    (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  // MAPEO DE MESES (para poder buscar por abreviado o completo)
  const MAPA_MESES = {
    ene: "ene", enero: "ene",
    feb: "feb", febrero: "feb",
    mar: "mar", marzo: "mar",
    abr: "abr", abril: "abr",
    may: "may", mayo: "may",
    jun: "jun", junio: "jun",
    jul: "jul", julio: "jul",
    ago: "ago", agosto: "ago",
    sep: "sep", set: "sep", septiembre: "sep",
    oct: "oct", octubre: "oct",
    nov: "nov", noviembre: "nov",
    dic: "dic", diciembre: "dic"
  };

  // Normalizamos el mes del filtro
  const mesFiltroNorm = normalize(mes);
  const mesBuscado = MAPA_MESES[mesFiltroNorm] || null;

  try {
    const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and mimeType='application/pdf'&fields=files(id,name,createdTime)&supportsAllDrives=true&includeItemsFromAllDrives=true&key=${process.env.GOOGLE_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.files) {
      return res.status(500).json({ error: "Google no devolvió archivos", data });
    }

    // PROCESAR ARCHIVOS
    const procesados = data.files.map(file => {
      try {
        const clean = file.name.replace(/\.pdf$/i, "");
        const partes = clean.split(" ").filter(Boolean);

        // teléfono
        const telefonoIndex = partes.findIndex(p => /^[0-9]{6,}$/.test(p));
        const telefonoArchivo = telefonoIndex >= 0 ? partes[telefonoIndex] : null;

        // bloque con guiones _
        const bloqueIndex = partes.findIndex(p => p.includes("_"));
        const bloqueRaw = bloqueIndex >= 0 ? partes[bloqueIndex] : null;

        // pax separado
        const paxTokenIndex = partes.findIndex(p => /A\d+K\d+I/i.test(p));
        const paxToken = paxTokenIndex >= 0 ? partes[paxTokenIndex] : null;

        // destino: entre Cotizacion y teléfono
        let destinoFinal = null;
        if (telefonoIndex > 1) {
          destinoFinal = partes.slice(1, telefonoIndex).join(" ");
        } else if (telefonoIndex === -1 && partes.length > 2) {
          if (bloqueIndex > 1) destinoFinal = partes.slice(1, bloqueIndex).join(" ");
          else destinoFinal = partes.slice(1, 2).join(" ");
        }

        let fechaIda = null;
        let fechaRegreso = null;
        let adultosArchivo = null;
        let ninosArchivo = null;
        let infantesArchivo = null;
        let origen = null;
        // procesar bloqueRaw
        if (bloqueRaw) {
          const bloques = bloqueRaw.split("_").filter(Boolean);

          if (bloques.length >= 1) {
            origen = bloques[0]; // ej: BOG, BGA, PEI, MDE
          }
          // FECHAS
          if (bloques.length >= 2) {
            const fechasSeparadas = bloques[1].split("-");
            if (fechasSeparadas.length >= 4) {
              fechaIda = `${fechasSeparadas[0]}-${fechasSeparadas[1]}`;     // ej 29-Nov
              fechaRegreso = `${fechasSeparadas[2]}-${fechasSeparadas[3]}`; // ej 03-Dic
            } else if (fechasSeparadas.length >= 2) {
              fechaIda = bloques[1];
            }
          }

          // PAX
          if (bloques.length >= 3 && /A\d+K\d+I/i.test(bloques[2])) {
            const m = bloques[2].match(/(\d+)A(\d+)K(\d+)I/i);
            if (m) {
              adultosArchivo = parseInt(m[1], 10);
              ninosArchivo = parseInt(m[2], 10);
              infantesArchivo = parseInt(m[3], 10);
            }
          }
        }

        if (paxToken && adultosArchivo === null) {
          const m2 = paxToken.match(/(\d+)A(\d+)K(\d+)I/i);
          if (m2) {
            adultosArchivo = parseInt(m2[1], 10);
            ninosArchivo = parseInt(m2[2], 10);
            infantesArchivo = parseInt(m2[3], 10);
          }
        }

        return {
          id: file.id,
          archivo: file.name,
          destino: destinoFinal,
          origen,
          telefonoArchivo,
          fechaIda,
          fechaRegreso,
          adultosArchivo,
          ninosArchivo,
          infantesArchivo,
          link: `https://drive.google.com/file/d/${file.id}/view`,
          createdTime: formatearFecha12h(file.createdTime),
          valido: true,

          // extra: mes detectado para filtrarlo
          mesIda: fechaIda ? normalize(fechaIda.split("-")[1] || "") : null
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

    // FILTROS
    const filDestino = normalize(destino);
    const filTelefono = (telefono || "").trim();

    const filtrados = procesados.filter(pdf => {
      if (!pdf.valido) return false;

      // teléfono
      if (filTelefono && !pdf.telefonoArchivo?.includes(filTelefono)) return false;

      // destino
      if (filDestino) {
        const pdfDestinoNorm = normalize(pdf.destino || "");
        if (!pdfDestinoNorm.includes(filDestino)) return false;
      }

      // adultos
      // adultos (0 = ignorar filtro)
      if (
        typeof adultos !== "undefined" &&
        adultos !== "" &&
        adultos !== null &&
        Number(adultos) > 0
      ) {
        if (pdf.adultosArchivo === null || pdf.adultosArchivo !== Number(adultos)) {
          return false;
        }
      }


      // ninos
      if (ninos !== undefined && ninos !== "") {
        if (pdf.ninosArchivo !== Number(ninos)) return false;
      }

      // infantes
      if (infantes !== undefined && infantes !== "") {
        if (pdf.infantesArchivo !== Number(infantes)) return false;
      }
      // ORIGEN (si viene un valor)
      if (req.body.origen && req.body.origen.trim() !== "") {
        if (!pdf.origen || pdf.origen.toUpperCase() !== req.body.origen.toUpperCase()) {
          return false;
        }
      }


      // MES
      if (mesBuscado) {
        if (!pdf.mesIda) return false;
        if (!pdf.mesIda.startsWith(mesBuscado)) return false;
      }

      return true;
    });

    return res.status(200).json(filtrados);

  } catch (error) {
    console.error("ERROR:", error);
    return res.status(500).json({ error: error.message });
  }
}
