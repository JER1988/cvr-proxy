import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.post("/cvr", async (req, res) => {
  const { vat, user, pass } = req.body;

  if (!vat || vat.length !== 8)
    return res.status(400).json({ error: "Ugyldigt CVR nummer" });

  const authHeader = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

  const esUrl = "https://distribution.virk.dk/cvr-permanent/virksomhed/_search";

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

    return res.json(json.hits.hits[0]._source.Vrvirksomhed);
  } catch (e) {
    return res.status(500).json({ error: "Proxy fejl", detail: e.message });
  }
});

app.get("/", (req, res) => {
  res.send("CVR Proxy kører ✔");
});

app.listen(8080, () => console.log("CVR Proxy server kører på port 8080"));
