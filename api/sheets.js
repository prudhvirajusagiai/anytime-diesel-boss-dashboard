const GOOGLE_SHEET_CSV =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQSg4Wwyn0VlanOxRrWFL8hplD-WL0vxHKLNeU1o1mOoRkwHjNPH4ndE9Y29z4OBg/pub?gid=1079011675&single=true&output=csv";

export default async function handler(req, res) {
  try {
    const response = await fetch(GOOGLE_SHEET_CSV, {
      headers: {
        "User-Agent": "AnyTime-Diesel-Boss-Dashboard/1.0"
      }
    });

    if (!response.ok) {
      throw new Error(
        `Google Sheets returned HTTP ${response.status}`
      );
    }

    const csv = await response.text();

    if (!csv || csv.trim().length === 0) {
      throw new Error("Google Sheet returned empty data.");
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).send(csv);

  } catch (error) {

    console.error("Google Sheets error:", error);

    return res.status(500).json({
      success: false,
      error: "Unable to load Google Sheets data.",
      details: error.message
    });
  }
}
