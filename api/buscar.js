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
      const partes = file.name.replace(".pdf", "").split(" ");

      // ejemplo:
      // Cotizacion Punta Cana 573004738256 BOG_25-Mar-29-Mar_2A0K0I
      const destino = partes[1] + " " + partes[2];
      const telefonoArchivo = partes[3];

      const fechasPax = partes[4].split("_");

      const fechas = fechasPax[1].split("-");
      const fechaIda = fechasPax[1];
      const fechaRegreso = fechasPax[2];

      const paxString = partes[5];
      const adultosArchivo = parseInt(paxString[0]);
      const ninosArchivo = parseInt(paxString[2]);
      const infantesArchivo = parseInt(paxString[4]);

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
        link: `https://drive.google.com/file/d/${file.id}/view`
      };
    });

    // FILTROS
    const filtrados = procesados.filter(pdf => {
      if (telefono && !pdf.telefonoArchivo.includes(telefono)) return false;
      if (adultos !== undefined && adultos !== pdf.adultosArchivo) return false;
      if (ninos !== undefined && ninos !== pdf.ninosArchivo) return false;
      if (infantes !== undefined && infantes !== pdf.infantesArchivo) return false;

      return true;
    });

    return res.status(200).json(filtrados);

  } catch (error) {
    console.error("ERROR:", error);
    return res.status(500).json({ error: error.message });
  }
}
