import { useState, useEffect, useRef } from "react";

// ---------- helpers ----------
const STORAGE_KEY = "verlofuren-2026";

const DAG_NAMEN = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

const DEFAULT_SETTINGS = {
  jaar: 2026,
  tegoed: 164,
  bovenwettelijk: 4.07,
  // uren per dag: ma t/m zo
  weekUren: [8.5, 4.5, 7.5, 7.5, 0, 0, 0],
};

const DEFAULT_ENTRIES = [
  { id: "e1", omschrijving: "Middag / Sterfdag Pa", van: "2026-02-19", tot: "2026-02-19", uren: 3.5, type: "Verlof" },
  { id: "e2", omschrijving: "Verjaardag Ma / meivakantie", van: "2026-04-22", tot: "2026-04-22", uren: 7.5, type: "Verlof" },
  { id: "e3", omschrijving: "Meivakantie", van: "2026-04-23", tot: "2026-04-23", uren: 7.5, type: "Verlof" },
  { id: "e4", omschrijving: "Denemarken / Toernooi", van: "2026-05-21", tot: "2026-05-21", uren: 3, type: "Verlof" },
  { id: "e5", omschrijving: "Zomervakantie week 2", van: "2026-07-27", tot: "2026-07-31", uren: 28, type: "Verlof" },
  { id: "e6", omschrijving: "Zomervakantie week 3", van: "2026-08-03", tot: "2026-08-07", uren: 28, type: "Verlof" },
  { id: "e7", omschrijving: "Zomervakantie week 4", van: "2026-08-10", tot: "2026-08-14", uren: 28, type: "Verlof" },
  { id: "e8", omschrijving: "Herfstvakantie (hele week nodig?)", van: "2026-10-19", tot: "2026-10-25", uren: 28, type: "Verlof" },
  { id: "e9", omschrijving: "Kerstvakantie", van: "2026-12-23", tot: "2026-12-24", uren: 15, type: "Verlof" },
  { id: "e10", omschrijving: "Kerstvakantie", van: "2026-12-31", tot: "2026-12-31", uren: 7.5, type: "Verlof" },
];

function parseNum(v) {
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function fmt(n) {
  const r = Math.round(n * 100) / 100;
  return r.toLocaleString("nl-NL", { maximumFractionDigits: 2 });
}

function dateFromStr(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtDatum(s, metJaar = false) {
  if (!s) return "";
  const opts = { weekday: "short", day: "numeric", month: "short" };
  if (metJaar) opts.year = "numeric";
  return new Intl.DateTimeFormat("nl-NL", opts).format(dateFromStr(s));
}

// uren berekenen over een periode op basis van de werkdagen
function berekenUren(van, tot, weekUren) {
  if (!van) return 0;
  const start = dateFromStr(van);
  const eind = tot ? dateFromStr(tot) : start;
  if (eind < start) return 0;
  let totaal = 0;
  const d = new Date(start);
  let guard = 0;
  while (d <= eind && guard < 400) {
    const dagIdx = (d.getDay() + 6) % 7; // 0 = maandag
    totaal += weekUren[dagIdx] || 0;
    d.setDate(d.getDate() + 1);
    guard++;
  }
  return totaal;
}

// ---------- component ----------
export default function VerlofurenApp() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [entries, setEntries] = useState([]);
  const [tab, setTab] = useState("overzicht");
  const [loaded, setLoaded] = useState(false);

  // formulier
  const leeg = { omschrijving: "", van: "", tot: "", uren: "", type: "Verlof" };
  const [form, setForm] = useState(leeg);
  const [urenAangepast, setUrenAangepast] = useState(false);
  const [editId, setEditId] = useState(null);
  const formRef = useRef(null);

  // ---- laden ----
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY);
        if (res && res.value) {
          const data = JSON.parse(res.value);
          setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
          setEntries(data.entries || []);
        } else {
          setEntries(DEFAULT_ENTRIES);
        }
      } catch (e) {
        setEntries(DEFAULT_ENTRIES);
      }
      setLoaded(true);
    })();
  }, []);

  // ---- opslaan ----
  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify({ settings, entries }));
      } catch (e) {
        console.error("Opslaan mislukt", e);
      }
    })();
  }, [settings, entries, loaded]);

  // ---- uren automatisch invullen bij datumkeuze ----
  useEffect(() => {
    if (!urenAangepast && form.van) {
      const auto = berekenUren(form.van, form.tot || form.van, settings.weekUren);
      setForm((f) => ({ ...f, uren: auto ? String(auto).replace(".", ",") : "" }));
    }
    // eslint-disable-next-line
  }, [form.van, form.tot, settings.weekUren]);

  // ---- afgeleide totalen ----
  const totaalTegoed = parseNum(settings.tegoed) + parseNum(settings.bovenwettelijk);
  const opgenomen = entries
    .filter((e) => e.type !== "Bijzonder verlof")
    .reduce((s, e) => s + parseNum(e.uren), 0);
  const bijzonder = entries
    .filter((e) => e.type === "Bijzonder verlof")
    .reduce((s, e) => s + parseNum(e.uren), 0);
  const over = totaalTegoed - opgenomen;
  const pct = totaalTegoed > 0 ? Math.min(100, (opgenomen / totaalTegoed) * 100) : 0;

  const gesorteerd = [...entries].sort((a, b) => (a.van < b.van ? -1 : 1));

  // ---- acties ----
  function bewaarEntry() {
    if (!form.van || !parseNum(form.uren)) return;
    const entry = {
      id: editId || "e" + Date.now(),
      omschrijving: form.omschrijving.trim() || "Verlof",
      van: form.van,
      tot: form.tot && form.tot >= form.van ? form.tot : form.van,
      uren: parseNum(form.uren),
      type: form.type,
    };
    setEntries((prev) => (editId ? prev.map((e) => (e.id === editId ? entry : e)) : [...prev, entry]));
    setForm(leeg);
    setUrenAangepast(false);
    setEditId(null);
  }

  function startBewerken(e) {
    setForm({ omschrijving: e.omschrijving, van: e.van, tot: e.tot, uren: String(e.uren).replace(".", ","), type: e.type });
    setUrenAangepast(true);
    setEditId(e.id);
    setTab("overzicht");
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function verwijder(id) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (editId === id) {
      setForm(leeg);
      setEditId(null);
      setUrenAangepast(false);
    }
  }

  function setWeekUur(idx, val) {
    const nieuw = [...settings.weekUren];
    nieuw[idx] = val;
    setSettings({ ...settings, weekUren: nieuw });
  }

  if (!loaded) {
    return (
      <div style={styles.app}>
        <style>{css}</style>
        <div style={{ ...styles.card, textAlign: "center", color: "#6B7A74" }}>Even laden…</div>
      </div>
    );
  }

  return (
    <div style={styles.app} className="verlof-app">
      <style>{css}</style>

      {/* ---------- kop ---------- */}
      <header style={styles.header}>
        <div style={styles.kicker}>Verlofuren {settings.jaar}</div>
        <div style={styles.bigRow}>
          <span style={styles.bigNumber}>{fmt(over)}</span>
          <span style={styles.bigUnit}>uur over</span>
        </div>
        <div style={styles.balk}>
          <div style={{ ...styles.balkVulling, width: pct + "%" }} />
        </div>
        <div style={styles.balkLabels}>
          <span>{fmt(opgenomen)} opgenomen</span>
          <span>{fmt(totaalTegoed)} totaal</span>
        </div>
      </header>

      {/* ---------- tabs ---------- */}
      <nav style={styles.tabs}>
        {[
          ["overzicht", "Overzicht"],
          ["instellingen", "Instellingen"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="tab-knop"
            style={{ ...styles.tabKnop, ...(tab === key ? styles.tabActief : {}) }}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overzicht" && (
        <>
          {/* ---------- invoer ---------- */}
          <section style={styles.card} ref={formRef}>
            <h2 style={styles.h2}>{editId ? "Verlof wijzigen" : "Verlof invoeren"}</h2>
            <label style={styles.label}>
              Omschrijving
              <input
                style={styles.input}
                value={form.omschrijving}
                onChange={(ev) => setForm({ ...form, omschrijving: ev.target.value })}
                placeholder="bijv. Herfstvakantie"
              />
            </label>
            <div style={styles.rij2}>
              <label style={styles.label}>
                Eerste dag
                <input
                  type="date"
                  style={styles.input}
                  value={form.van}
                  onChange={(ev) => {
                    setUrenAangepast(false);
                    setForm({ ...form, van: ev.target.value });
                  }}
                />
              </label>
              <label style={styles.label}>
                Laatste dag <span style={styles.klein}>(leeg = één dag)</span>
                <input
                  type="date"
                  style={styles.input}
                  value={form.tot}
                  min={form.van || undefined}
                  onChange={(ev) => {
                    setUrenAangepast(false);
                    setForm({ ...form, tot: ev.target.value });
                  }}
                />
              </label>
            </div>
            <div style={styles.rij2}>
              <label style={styles.label}>
                Aantal uur <span style={styles.klein}>(automatisch, aanpasbaar)</span>
                <input
                  style={styles.input}
                  inputMode="decimal"
                  value={form.uren}
                  onChange={(ev) => {
                    setUrenAangepast(true);
                    setForm({ ...form, uren: ev.target.value });
                  }}
                  placeholder="0"
                />
              </label>
              <label style={styles.label}>
                Soort
                <select
                  style={styles.input}
                  value={form.type}
                  onChange={(ev) => setForm({ ...form, type: ev.target.value })}
                >
                  <option>Verlof</option>
                  <option>Extra</option>
                  <option>Bijzonder verlof</option>
                </select>
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button className="primair" style={styles.primair} onClick={bewaarEntry}>
                {editId ? "Wijziging opslaan" : "Toevoegen"}
              </button>
              {editId && (
                <button
                  style={styles.secundair}
                  onClick={() => {
                    setForm(leeg);
                    setEditId(null);
                    setUrenAangepast(false);
                  }}
                >
                  Annuleren
                </button>
              )}
            </div>
            <p style={styles.hint}>
              Uren worden automatisch berekend op basis van de werkdagen (weekend en vrije dagen tellen niet mee).
              Bijzonder verlof gaat niet van het tegoed af.
            </p>
          </section>

          {/* ---------- lijst ---------- */}
          <section style={styles.card}>
            <h2 style={styles.h2}>Opgenomen verlof</h2>
            {gesorteerd.length === 0 && (
              <p style={{ color: "#6B7A74", margin: 0 }}>Nog geen verlof ingevoerd. Voeg hierboven de eerste dag toe.</p>
            )}
            {gesorteerd.map((e) => (
              <div key={e.id} style={styles.entryRij} className="entry-rij">
                <div style={{ minWidth: 0 }}>
                  <div style={styles.entryDatum}>
                    {e.van === e.tot ? fmtDatum(e.van) : `${fmtDatum(e.van)} – ${fmtDatum(e.tot)}`}
                  </div>
                  <div style={styles.entryOmschrijving}>
                    {e.omschrijving}
                    {e.type !== "Verlof" && <span style={styles.badge}>{e.type}</span>}
                  </div>
                </div>
                <div style={styles.entryRechts}>
                  <span style={styles.entryUren}>{fmt(e.uren)} u</span>
                  <button className="icoon" style={styles.icoonKnop} title="Wijzigen" onClick={() => startBewerken(e)}>
                    ✎
                  </button>
                  <button
                    className="icoon"
                    style={{ ...styles.icoonKnop, color: "#B4443C" }}
                    title="Verwijderen"
                    onClick={() => verwijder(e.id)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {bijzonder > 0 && (
              <p style={styles.hint}>Waarvan {fmt(bijzonder)} uur bijzonder verlof (telt niet mee in het tegoed).</p>
            )}
          </section>
        </>
      )}

      {tab === "instellingen" && (
        <>
          <section style={styles.card}>
            <h2 style={styles.h2}>Tegoed {settings.jaar}</h2>
            <div style={styles.rij2}>
              <label style={styles.label}>
                Verlofrecht dit jaar (uur)
                <input
                  style={styles.input}
                  inputMode="decimal"
                  value={String(settings.tegoed).replace(".", ",")}
                  onChange={(ev) => setSettings({ ...settings, tegoed: parseNum(ev.target.value) })}
                />
              </label>
              <label style={styles.label}>
                Bovenwettelijk over van vorig jaar (uur)
                <input
                  style={styles.input}
                  inputMode="decimal"
                  value={String(settings.bovenwettelijk).replace(".", ",")}
                  onChange={(ev) => setSettings({ ...settings, bovenwettelijk: parseNum(ev.target.value) })}
                />
              </label>
            </div>
            <div style={styles.totaalRij}>
              <span>Totaal tegoed</span>
              <strong>{fmt(totaalTegoed)} uur</strong>
            </div>
          </section>

          <section style={styles.card}>
            <h2 style={styles.h2}>Werkdagen en uren per dag</h2>
            <p style={{ ...styles.hint, marginTop: 0 }}>
              Zet een dag op 0 als er niet gewerkt wordt. Deze uren worden gebruikt om verlof automatisch te berekenen.
            </p>
            {DAG_NAMEN.map((naam, i) => (
              <div key={naam} style={styles.dagRij}>
                <span style={{ color: settings.weekUren[i] > 0 ? "#22332E" : "#9AA8A2" }}>{naam}</span>
                <input
                  style={{ ...styles.input, width: 90, textAlign: "right" }}
                  inputMode="decimal"
                  value={String(settings.weekUren[i]).replace(".", ",")}
                  onChange={(ev) => setWeekUur(i, parseNum(ev.target.value))}
                />
              </div>
            ))}
            <div style={styles.totaalRij}>
              <span>Uren per week</span>
              <strong>{fmt(settings.weekUren.reduce((s, u) => s + parseNum(u), 0))} uur</strong>
            </div>
          </section>
        </>
      )}

      <footer style={styles.footer}>Alles wordt automatisch bewaard.</footer>
    </div>
  );
}

// ---------- stijl ----------
const css = `
  .verlof-app input, .verlof-app select, .verlof-app button { font-family: inherit; }
  .verlof-app input:focus, .verlof-app select:focus { outline: 2px solid #2E6E5A; outline-offset: 1px; }
  .verlof-app .primair:hover { background: #25594A; }
  .verlof-app .tab-knop:hover { color: #22332E; }
  .verlof-app .icoon:hover { background: #EEF3F1; border-radius: 8px; }
  .verlof-app .entry-rij + .entry-rij { border-top: 1px solid #E4EBE8; }
  @media (prefers-reduced-motion: reduce) { .verlof-app * { transition: none !important; } }
`;

const styles = {
  app: {
    fontFamily: "'Avenir Next', 'Segoe UI', system-ui, sans-serif",
    background: "#F1F5F3",
    minHeight: "100vh",
    padding: "20px 14px 40px",
    maxWidth: 560,
    margin: "0 auto",
    color: "#22332E",
    fontSize: 16,
  },
  header: {
    background: "#2E6E5A",
    color: "#F3F8F6",
    borderRadius: 20,
    padding: "22px 22px 18px",
    marginBottom: 14,
  },
  kicker: { fontSize: 14, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.85 },
  bigRow: { display: "flex", alignItems: "baseline", gap: 10, margin: "6px 0 14px" },
  bigNumber: { fontSize: 52, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" },
  bigUnit: { fontSize: 18, opacity: 0.9 },
  balk: { height: 10, background: "rgba(255,255,255,0.25)", borderRadius: 6, overflow: "hidden" },
  balkVulling: { height: "100%", background: "#F0C05A", borderRadius: 6, transition: "width .4s ease" },
  balkLabels: { display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 8, opacity: 0.9 },
  tabs: { display: "flex", gap: 6, marginBottom: 14 },
  tabKnop: {
    flex: 1,
    padding: "10px 0",
    border: "none",
    borderRadius: 12,
    background: "transparent",
    color: "#5E6E68",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
  },
  tabActief: { background: "#FFFFFF", color: "#22332E", boxShadow: "0 1px 3px rgba(34,51,46,0.12)" },
  card: {
    background: "#FFFFFF",
    borderRadius: 16,
    padding: "18px 18px 16px",
    marginBottom: 14,
    boxShadow: "0 1px 3px rgba(34,51,46,0.08)",
  },
  h2: { fontSize: 18, margin: "0 0 12px", fontWeight: 700 },
  label: { display: "block", fontSize: 14, fontWeight: 600, color: "#3C4C46", marginBottom: 12, flex: 1 },
  klein: { fontWeight: 400, color: "#8A9993" },
  input: {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    marginTop: 5,
    padding: "10px 12px",
    fontSize: 16,
    border: "1px solid #CBD8D3",
    borderRadius: 10,
    background: "#FBFDFC",
    color: "#22332E",
  },
  rij2: { display: "flex", gap: 12, flexWrap: "wrap" },
  primair: {
    background: "#2E6E5A",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "12px 22px",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
  secundair: {
    background: "#EEF3F1",
    color: "#3C4C46",
    border: "none",
    borderRadius: 12,
    padding: "12px 18px",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
  },
  hint: { fontSize: 13.5, color: "#6B7A74", margin: "12px 0 0", lineHeight: 1.45 },
  entryRij: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    padding: "11px 0",
  },
  entryDatum: { fontSize: 13.5, color: "#6B7A74", fontVariantNumeric: "tabular-nums" },
  entryOmschrijving: { fontSize: 16, fontWeight: 600, overflowWrap: "anywhere" },
  badge: {
    marginLeft: 8,
    fontSize: 12,
    fontWeight: 600,
    background: "#F5EBDA",
    color: "#8A6A2E",
    borderRadius: 6,
    padding: "2px 7px",
    verticalAlign: "middle",
  },
  entryRechts: { display: "flex", alignItems: "center", gap: 4, flexShrink: 0 },
  entryUren: { fontWeight: 700, fontVariantNumeric: "tabular-nums", marginRight: 4 },
  icoonKnop: {
    border: "none",
    background: "transparent",
    fontSize: 17,
    cursor: "pointer",
    color: "#5E6E68",
    padding: "6px 8px",
    lineHeight: 1,
  },
  dagRij: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "7px 0",
    fontSize: 16,
  },
  totaalRij: {
    display: "flex",
    justifyContent: "space-between",
    borderTop: "1px solid #E4EBE8",
    marginTop: 10,
    paddingTop: 12,
    fontSize: 16,
  },
  footer: { textAlign: "center", fontSize: 13, color: "#8A9993", marginTop: 6 },
};
