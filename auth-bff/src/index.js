import express from express;
import cors from cors;

const app = express();
app.use(express.json());

// CORS simple
app.use(cors({ origin: true, credentials: true }));
app.options(*, cors());

app.get(/health, (_req, res) => res.json({ ok: true }));

app.post(/api/rpc/echo, (req, res) => {
 res.json({ ok: true, received: req.body ?? null });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`auth-bff listening on :${port}`));
