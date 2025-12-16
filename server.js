import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

// -----------------------------
// Hjælpefunktion: periode-overlap
// -----------------------------
function overlaps(aFrom, aTo, bFrom, bTo) {
  if (!aFrom || !bFrom) return false;

  const startA = new Date(aFrom);
  const endA = aTo ? new Date(aTo) : new Date("9999-12-31");

  const startB = new Date(bFrom);
  const endB = bTo ? new Date(bTo) : new Date("9999-12-31");

  return startA <= endB && startB <= endA;
}

// -----------------------------
// CVR-endpoint
// -----------------------------
app.post("/cvr", async (req, res) => {
  const { vat, user, pass } = req.body;

  if (!vat || vat.length !== 8)
    return res.status(400).json({ error: "Ugyldigt CVR nummer" });

  const authHeader =
    "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

  const esUrl =
    "https://distribution.virk.dk/cvr-permanent/virksomhed/_search";

  const body = {
    query: {
      bool: {
        must: [
          {
            term: {
              "Vrvirksomhed.cvrNummer": vat
            }
          }
        ]
      }
    }
  };

  try {
    const apiRes = await fetch(esUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const json = await apiRes.json();

    if (!json.hits?.hits?.length)
      return res.status(404).json({ error: "CVR findes ikke" });

    const vrk = json.hits.hits[0]._source.Vrvirksomhed;

    // -----------------------------------------
    // 1) Find NYESTE / AKTUEL BELIGGENHEDSADRESSE
    // -----------------------------------------
    const addr =
      vrk.virksomhedMetadata?.nyesteBeliggenhedsadresse ||
      (Array.isArray(vrk.beliggenhedsadresse)
        ? vrk.beliggenhedsadresse.find(a => !a.periode?.gyldigTil) ||
          vrk.beliggenhedsadresse.at(-1)
        : null);

    // -----------------------------------------
    // 2) Match korrekt P-nummer via periode-overlap
    // -----------------------------------------
    let primaryPnummer = null;

    if (addr && Array.isArray(vrk.penheder)) {
      const aFrom = addr.periode?.gyldigFra;
      const aTo = addr.periode?.gyldigTil ?? null;

      const match = vrk.penheder.find(p =>
        overlaps(
          aFrom,
          aTo,
          p.periode?.gyldigFra,
          p.periode?.gyldigTil ?? null
        )
      );

      if (match) {
        primaryPnummer = match.pNummer;
      }
    }

    // -----------------------------------------
    // 3) Returnér ALT + nyt felt
    // -----------------------------------------
    return res.json({
      ...vrk,
      primaryPnummer
    });

  } catch (e) {
    return res.status(500).json({
      error: "Proxy fejl",
      detail: e.message
    });
  }
});

// -----------------------------
app.get("/", (req, res) => {
  res.send("CVR Proxy kører ✔");
});

app.listen(8080, () =>
  console.log("CVR Proxy server kører på port 8080")
);
