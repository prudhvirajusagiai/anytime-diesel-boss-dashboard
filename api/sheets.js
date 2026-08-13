export default async function handler(req, res) {
  try {
    const raw = req.query?.url;

    if (!raw) {
      res.status(400).send("Missing Google Sheets URL.");
      return;
    }

    const url = new URL(raw);

    // Prevent this endpoint from becoming a general-purpose open proxy.
    if (url.hostname !== "docs.google.com") {
      res.status(400).send(
        "Only docs.google.com Google Sheets URLs are allowed."
      );
      return;
    }

    const response = await fetch(url.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent": "Anytime-Diesel-Boss-Dashboard/2.0"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      res
        .status(response.status)
        .send(`Google Sheets returned HTTP ${response.status}.`);
      return;
    }

    const text = await response.text();

    if (!text || text.length < 10) {
      res.status(502).send("Google Sheets returned an empty response.");
      return;
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.status(200).send(text);

  } catch (err) {
    res
      .status(502)
      .send(`Unable to fetch Google Sheets CSV: ${err.message || err}`);
  }
}
