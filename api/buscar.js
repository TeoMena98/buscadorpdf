export default async function handler(req, res) {
  const folderId = "1HL5lFce29wBN17LAEv3ACvczRPb4aV5m";

  console.log("BODY -->", req.body);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { telefono, adultos, ninos, infantes } = req.body;

  try {
    const driveUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and mimeType='application/pdf'&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&key=${process.env.GOOGLE_API_KEY}`;

    console.log("URL USADA:", driveUrl);

    const response = await fetch(driveUrl);
    const data = await response.json();

    console.log("RESPUESTA DE GOOGLE:", data);

    if (!data.files) {
      return res.status(500).json({ error: "Google no devolvió 'files'", data });
    }

    res.status(200).json(data.files);

  } catch (error) {
    console.error("ERROR SERVER:", error);
    res.status(500).json({ error: error.message });
  }
}
