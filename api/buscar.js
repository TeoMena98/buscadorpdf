export default async function handler(req, res) {
  const folderId = "1HL5lFce29wBN17LAEv3ACvczRPb4aV5m";

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { telefono, adultos, ninos, infantes } = req.body;

  try {
    const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and mimeType='application/pdf'&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&key=${process.env.GOOGLE_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.files) {
      return res.status(500).json({ error: "Google no devolvió archivos", data });
    }

    // PROCESAR ARCHIVOS
    const procesados = data.files.map(file => {
      try {
        const clean = file.name.replace(".pdf", "");
        const partes = clean.split(" ");

        // BUSCAR TELÉFONO (primer bloque solo números)
        const telefonoIndex = partes.findIndex(p => /^[0-9]+$/.test(p));
        const telefonoArchivo = telefonoIndex >= 0 ? partes[telefonoIndex] : null;

        // BUSCAR FECHAS (bloque que contiene '_' y '-')
        const fechaIndex = partes.findIndex(p => p.includes("_") && p.includes("-"));
        const fechasRaw = fechaIndex >= 0 ? partes[fechaIndex] : null;

        // BUSCAR PAX (bloque tipo 2A0K0I)
        const paxIndex = partes.findIndex(p => /A.*K.*I/i.test(p));
        const paxString = paxIndex >= 0 ? partes[paxIndex] : null;

        // EXTRAER DESTINO (variable en cantidad de palabras)
        let destino = null;
        if (telefonoIndex > 1) {
          destino = partes.slice(1, telefonoIndex).join(" ");
        }

        // EXTRAER FECHAS
        let fechaIda = null;
        let fechaRegreso = null;

        if (fechasRaw) {
          const pedazos = fechasRaw.split("_");
          if (pedazos.length >= 2) {
            const fechas = pedazos[1].split("-");
            if (fechas.length >= 2) {
              fechaIda = fechas[0];
              fechaRegreso = fechas[1];
            }
          }
        }

        // EXTRAER PAX
        let adultosArchivo = null;
        let ninosArchivo = null;
        let infantesArchivo = null;

        if (paxString) {
          const paxMatch = paxString.match(/(\d)A(\d)K(\d)I/i);
          if (paxMatch) {
            adultosArchivo = parseInt(paxMatch[1]);
            ninosArchivo = parseInt(paxMatch[2]);
            infantesArchivo = parseInt(paxMatch[3]);
          }
        }

        return {
          id: file.id,
          archivo: file.name,
          destino,
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

    // FILTROS SEGUROS
    const filtrados = procesados.filter(pdf => {
      if (!pdf.valido) return false;

      if (telefono && telefono.trim() !== "" && !pdf.telefonoArchivo?.includes(telefono))
        return false;

      if (adultos !== undefined && adultos !== "" && pdf.adultosArchivo !== adultos)
        return false;

      if (ninos !== undefined && ninos !== "" && pdf.ninosArchivo !== ninos)
        return false;

      if (infantes !== undefined && infantes !== "" && pdf.infantesArchivo !== infantes)
        return false;

      return true;
    });

    return res.status(200).json(filtrados);

  } catch (error) {
    console.error("ERROR:", error);
    return res.status(500).json({ error: error.message });
  }
}
