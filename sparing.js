// Sparing: et sparemål, fast sparing og kutt (f.eks. snus eller Monster).
// Regner ut hvor lenge det er til målet med og uten kuttene, og viser det i en graf.
// Bruker hjelpere fra app.js (kroner, kompakt, lagElement, svgEl, pentSteg, lesBelop, iDag ...).

const SPARENOKKEL = "pengeoversikt-sparing";

// Hvor mange ganger per uke noe skjer
const PER_UKE = { dag: 7, uke: 1, maaned: 12 / 52 };
const PER_TEKST = { dag: "dag", uke: "uke", maaned: "måned" };

// Eksempler man kan trykke på for å legge til et kutt raskt (omtrentlige priser)
const FORSLAG = [
  { navn: "Snus", pris: 120 },
  { navn: "Monster", pris: 30 },
  { navn: "Kaffe ute", pris: 45 },
  { navn: "Godteri", pris: 40 },
  { navn: "Takeaway", pris: 150 },
];

// Eksempel som vises første gang, så man ser hvordan det virker
const EKSEMPEL = {
  maal: { navn: "PlayStation 5", pris: 6000, spart: 500 },
  fast: { belop: 100, frekvens: "uke" },
  kutt: [
    { id: "eks1", navn: "Snus", pris: 120, antall: 1, frekvens: "uke", aktiv: true },
    { id: "eks2", navn: "Monster", pris: 30, antall: 2, frekvens: "uke", aktiv: true },
  ],
};

let sparing = lesSparing();
let redigererKuttId = null;

function lesSparing() {
  try {
    const s = JSON.parse(localStorage.getItem(SPARENOKKEL));
    if (s && s.maal && s.fast && Array.isArray(s.kutt)) return s;
  } catch {}
  return structuredClone(EKSEMPEL);
}

function lagreSparing() {
  try {
    localStorage.setItem(SPARENOKKEL, JSON.stringify(sparing));
  } catch {
    alert("Klarte ikke å lagre. Er privat nettlesing slått på?");
  }
}

// ---------- Utregning ----------

function kuttPerUke(k) {
  return k.pris * k.antall * PER_UKE[k.frekvens];
}

function sparePerUke(medKutt) {
  const fast = sparing.fast.belop * PER_UKE[sparing.fast.frekvens];
  if (!medKutt) return fast;
  return fast + sparing.kutt.filter((k) => k.aktiv).reduce((s, k) => s + kuttPerUke(k), 0);
}

function gjenstaar() {
  return Math.max(0, sparing.maal.pris - sparing.maal.spart);
}

// Antall uker til målet (kan være desimaltall), eller Infinity om man ikke sparer noe
function ukerTilMaal(perUke) {
  if (gjenstaar() === 0) return 0;
  return perUke > 0 ? gjenstaar() / perUke : Infinity;
}

function datoOmUker(uker) {
  return leggTilDager(iDag(), Math.ceil(uker * 7));
}

// «5 dager», «6 uker» eller «ca. 4,5 måneder»
function tidTekst(uker) {
  if (!Number.isFinite(uker)) return "aldri";
  const dager = Math.ceil(uker * 7);
  if (dager < 14) return dager === 1 ? "1 dag" : `${dager} dager`;
  const helUker = Math.ceil(uker);
  if (helUker < 10) return `${helUker} uker`;
  const maaneder = Math.round((uker * 12 / 52) * 2) / 2; // nærmeste halve måned
  return `ca. ${String(maaneder).replace(".", ",")} måneder`;
}

// ---------- Visning ----------

function tegnSparing() {
  const { maal } = sparing;

  // Fyll feltene, men ikke det man skriver i akkurat nå
  settVerdi("maal-navn", maal.navn);
  settVerdi("maal-pris", maal.pris || "");
  settVerdi("maal-spart", maal.spart || "");
  settVerdi("fast-belop", sparing.fast.belop || "");
  settVerdi("fast-frekvens", sparing.fast.frekvens);

  // Fremdriftslinje
  const andel = maal.pris > 0 ? Math.min(1, maal.spart / maal.pris) : 0;
  document.getElementById("fremdrift-fyll").style.width = `${andel * 100}%`;
  document.getElementById("fremdrift-tekst").textContent = maal.pris > 0
    ? `${kroner.format(maal.spart)} av ${kroner.format(maal.pris)} (${Math.round(andel * 100)} %). ${kroner.format(gjenstaar())} igjen.`
    : "Skriv inn hva målet koster.";

  tegnResultat();
  tegnKuttListe();
  tegnSpareGraf();
}

function settVerdi(id, verdi) {
  const el = document.getElementById(id);
  if (document.activeElement !== el) el.value = String(verdi).replace(".", ",");
}

function tegnResultat() {
  const med = ukerTilMaal(sparePerUke(true));
  const uten = ukerTilMaal(sparePerUke(false));
  const tidEl = document.getElementById("resultat-tid");
  const infoEl = document.getElementById("resultat-info");
  const etikett = document.getElementById("resultat-etikett");
  const navn = sparing.maal.navn || "målet";

  if (sparing.maal.pris <= 0) {
    etikett.textContent = "Tid til målet";
    tidEl.textContent = "–";
    infoEl.textContent = "Skriv inn pris for å se hvor lenge det tar.";
    return;
  }
  if (med === 0) {
    etikett.textContent = "Gratulerer!";
    tidEl.textContent = "Nådd 🎉";
    infoEl.textContent = `Du har spart nok til ${navn}.`;
    return;
  }

  etikett.textContent = `Tid til ${navn}`;
  tidEl.textContent = tidTekst(med);

  if (!Number.isFinite(med)) {
    infoEl.textContent = "Legg inn fast sparing eller et kutt for å se når du når målet.";
    return;
  }

  const perUke = sparePerUke(true);
  // Datoen slutter med punktum («11. mars» / «17. apr.»), så den står aldri sist i en setning
  let tekst = `Du sparer ${kroner.format(perUke)} i uka og har nok ca. ${datoKort.format(datoOmUker(med))}`;
  if (!Number.isFinite(uten)) {
    tekst += " – uten kuttene når du aldri målet";
  } else if (uten - med >= 1 / 7) {
    tekst += ` – ${tidTekst(uten - med)} raskere enn uten kuttene (${tidTekst(uten)})`;
  }
  infoEl.textContent = tekst;
}

function tegnKuttListe() {
  const liste = document.getElementById("kutt-liste");
  liste.replaceChildren();

  if (sparing.kutt.length === 0) {
    liste.append(lagElement("li", "tom", "Ingen kutt ennå. Prøv et av eksemplene under."));
  }

  for (const k of sparing.kutt) {
    const li = lagElement("li", "kutt-rad");

    // Avkrysning: ta kuttet med i beregningen eller ikke
    const boks = document.createElement("input");
    boks.type = "checkbox";
    boks.checked = k.aktiv;
    boks.setAttribute("aria-label", `Ta med ${k.navn}`);
    boks.addEventListener("change", () => {
      k.aktiv = boks.checked;
      lagreSparing();
      tegnSparing();
    });

    const knapp = lagElement("button", "post");
    knapp.type = "button";
    knapp.addEventListener("click", () => aapneKutt(k));

    const venstre = lagElement("div");
    venstre.append(
      lagElement("div", "post-navn", k.navn),
      lagElement("div", "post-info", `${k.antall} × ${kroner.format(k.pris)} per ${PER_TEKST[k.frekvens]}`)
    );
    const hoyre = lagElement("div", "post-hoyre");
    hoyre.append(
      lagElement("div", "belop inn", kroner.format(kuttPerUke(k))),
      lagElement("div", "post-info", "spart per uke")
    );
    knapp.append(venstre, hoyre);
    if (!k.aktiv) knapp.classList.add("av");

    li.append(boks, knapp);
    liste.append(li);
  }
}

// ---------- Graf: spart over tid, med og uten kutt ----------

function tegnSpareGraf() {
  const kort = document.getElementById("spare-graf-kort");
  const boks = document.getElementById("spare-graf");
  const tooltip = document.getElementById("spare-tooltip");
  boks.querySelector("svg")?.remove();
  tooltip.hidden = true;

  const { pris, spart } = sparing.maal;
  const perMed = sparePerUke(true);
  const perUten = sparePerUke(false);
  const med = ukerTilMaal(perMed);
  const uten = ukerTilMaal(perUten);

  // Ingen graf hvis målet mangler, er nådd, eller man ikke sparer noe
  kort.hidden = pris <= 0 || med === 0 || !Number.isFinite(med);
  if (kort.hidden) return;

  // Hvor langt grafen går: til «uten kutt» når målet, men maks to år
  const horisont = Math.ceil(Math.min(104, Math.max(Number.isFinite(uten) ? uten : med * 1.5, med * 1.15, 4)));
  const verdi = (perUke, uke) => Math.min(pris, spart + perUke * uke);

  const bredde = boks.clientWidth;
  if (bredde === 0) return;
  const hoyde = 200;
  const marg = { topp: 18, hoyre: 12, bunn: 26, venstre: 44 };
  const plotB = bredde - marg.venstre - marg.hoyre;
  const plotH = hoyde - marg.topp - marg.bunn;

  const steg = pentSteg(pris, 3);
  const max = Math.ceil(pris / steg) * steg;
  const x = (uke) => marg.venstre + (uke / horisont) * plotB;
  const y = (v) => marg.topp + ((max - v) / max) * plotH;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${bredde} ${hoyde}`, width: bredde, height: hoyde, role: "img", tabindex: "0",
    "aria-label": `Spart over tid. Med kutt nås målet om ${tidTekst(med)}, uten kutt ${tidTekst(uten)}.`,
  });

  // Rutenett og y-tall
  for (let v = 0; v <= max + steg / 2; v += steg) {
    svg.append(svgEl("line", { x1: marg.venstre, x2: bredde - marg.hoyre, y1: y(v), y2: y(v), class: v === 0 ? "akse null" : "akse" }));
    const t = svgEl("text", { x: marg.venstre - 6, y: y(v), class: "akse-tekst", "text-anchor": "end", "dominant-baseline": "middle" });
    t.textContent = kompakt.format(v);
    svg.append(t);
  }

  // X-tall: datoer med pent mellomrom (ca. 4–6 merker)
  const xSteg = [1, 2, 4, 8, 13, 26, 52].find((s) => horisont / s <= 5) || 52;
  for (let u = 0; u <= horisont; u += xSteg) {
    const t = svgEl("text", { x: x(u), y: hoyde - 6, class: "akse-tekst", "text-anchor": u === 0 ? "start" : "middle" });
    const d = leggTilDager(iDag(), u * 7);
    t.textContent = u === 0 ? "Nå" : `${d.getDate()}.${d.getMonth() + 1}`;
    svg.append(t);
  }

  // Mållinje
  svg.append(svgEl("line", { x1: marg.venstre, x2: bredde - marg.hoyre, y1: y(pris), y2: y(pris), class: "maallinje" }));
  const maalTekst = svgEl("text", { x: marg.venstre + 4, y: y(pris) - 6, class: "punkt-tekst", "text-anchor": "start" });
  maalTekst.textContent = `Mål ${kroner.format(pris)}`;
  svg.append(maalTekst);

  // Linjene: rette streker fra nå til målet nås (eller til grafen slutter)
  function serie(perUke, uker, klasse) {
    const slutt = Math.min(horisont, uker);
    svg.append(svgEl("line", {
      x1: x(0), y1: y(spart), x2: x(slutt), y2: y(verdi(perUke, slutt)), class: `spare-linje ${klasse}`,
    }));
    if (uker <= horisont) {
      svg.append(svgEl("circle", { cx: x(uker), cy: y(pris), r: 4, class: `punkt ${klasse}` }));
    }
  }
  if (perUten > 0 || spart > 0) serie(perUten, uten, "uten");
  serie(perMed, med, "med");

  // Datoen målet nås med kutt: til høyre under punktet (linjen kommer fra venstre),
  // eller over mållinjen hvis punktet er helt ute til høyre
  const nesten = x(med) > bredde - 90;
  const lapp = svgEl("text", {
    x: nesten ? x(med) - 8 : x(med) + 8,
    y: nesten ? y(pris) - 8 : y(pris) + 16,
    class: "punkt-tekst", "text-anchor": nesten ? "end" : "start",
  });
  lapp.textContent = datoKort.format(datoOmUker(med));
  svg.append(lapp);

  // Hover/trykk med loddrett strek og tooltip
  const strek = svgEl("line", { y1: marg.topp, y2: hoyde - marg.bunn, class: "strek", visibility: "hidden" });
  const fang = svgEl("rect", { x: marg.venstre, y: 0, width: plotB, height: hoyde, fill: "transparent" });
  svg.append(strek, fang);
  boks.prepend(svg);

  let valgt = -1;
  function vis(uke) {
    valgt = Math.max(0, Math.min(horisont, uke));
    strek.setAttribute("x1", x(valgt));
    strek.setAttribute("x2", x(valgt));
    strek.setAttribute("visibility", "visible");

    const rad = (klasse, tekst) => {
      const r = lagElement("span", "tooltip-rad");
      r.append(lagElement("i", `nokkel ${klasse}`), document.createTextNode(tekst));
      return r;
    };
    const fmt = (perUke) => (verdi(perUke, valgt) >= pris ? "Målet nådd ✓" : kroner.format(verdi(perUke, valgt)));
    tooltip.replaceChildren(
      lagElement("span", "tooltip-dato", valgt === 0 ? "Nå" : `${datoKort.format(leggTilDager(iDag(), valgt * 7))} (uke ${valgt})`),
      rad("med", `Med kutt: ${fmt(perMed)}`),
      rad("uten", `Uten kutt: ${fmt(perUten)}`)
    );
    tooltip.hidden = false;
    const tb = tooltip.offsetWidth;
    tooltip.style.left = `${Math.min(Math.max(x(valgt) - tb / 2, 0), bredde - tb)}px`;
  }
  function skjul() {
    strek.setAttribute("visibility", "hidden");
    tooltip.hidden = true;
  }
  function fraPeker(e) {
    const r = svg.getBoundingClientRect();
    vis(Math.round(((e.clientX - r.left - marg.venstre) / plotB) * horisont));
  }
  fang.addEventListener("pointermove", fraPeker);
  fang.addEventListener("pointerdown", fraPeker);
  fang.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") skjul(); });
  svg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") vis(valgt + 1);
    else if (e.key === "ArrowLeft") vis(valgt < 0 ? 0 : valgt - 1);
    else if (e.key === "Escape") skjul();
    else return;
    e.preventDefault();
  });
  svg.addEventListener("blur", skjul);
  skjulSpareTooltip = (e) => { if (!svg.contains(e.target)) skjul(); };
}

let skjulSpareTooltip = () => {};
document.addEventListener("pointerdown", (e) => skjulSpareTooltip(e));

// ---------- Felter som lagres mens man skriver ----------

function koble(id, oppdater) {
  document.getElementById(id).addEventListener("input", (e) => {
    oppdater(e.target.value);
    lagreSparing();
    tegnSparing();
  });
}

const tall = (tekst) => {
  const n = lesBelop(tekst || "0");
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

koble("maal-navn", (v) => { sparing.maal.navn = v.trim(); });
koble("maal-pris", (v) => { sparing.maal.pris = tall(v); });
koble("maal-spart", (v) => { sparing.maal.spart = tall(v); });
koble("fast-belop", (v) => { sparing.fast.belop = tall(v); });
document.getElementById("fast-frekvens").addEventListener("change", (e) => {
  sparing.fast.frekvens = e.target.value;
  lagreSparing();
  tegnSparing();
});

// ---------- Kutt-skjema ----------

const kuttDialog = document.getElementById("kutt-dialog");
const kuttSkjema = document.getElementById("kutt-skjema");

function aapneKutt(kutt, forslag) {
  redigererKuttId = kutt ? kutt.id : null;
  kuttSkjema.reset();
  document.getElementById("kutt-tittel").textContent = kutt ? "Endre kutt" : "Nytt kutt";
  document.getElementById("kutt-slett").hidden = !kutt;

  const kilde = kutt || forslag;
  if (kilde) {
    kuttSkjema.navn.value = kilde.navn;
    kuttSkjema.pris.value = String(kilde.pris).replace(".", ",");
  }
  kuttSkjema.antall.value = kutt ? kutt.antall : 1;
  kuttSkjema.frekvens.value = kutt ? kutt.frekvens : "uke";
  kuttDialog.showModal();
}

kuttSkjema.addEventListener("submit", (e) => {
  e.preventDefault();
  const pris = lesBelop(kuttSkjema.pris.value);
  const antall = Number(kuttSkjema.antall.value);
  if (!Number.isFinite(pris) || pris <= 0 || !Number.isInteger(antall) || antall < 1) {
    alert("Skriv en pris over 0 og et helt antall, for eksempel 1 eller 2.");
    return;
  }
  const data = { navn: kuttSkjema.navn.value.trim(), pris, antall, frekvens: kuttSkjema.frekvens.value };
  if (redigererKuttId) {
    sparing.kutt = sparing.kutt.map((k) => (k.id === redigererKuttId ? { ...k, ...data } : k));
  } else {
    sparing.kutt.push({ id: lagId(), aktiv: true, ...data });
  }
  lagreSparing();
  tegnSparing();
  kuttDialog.close();
});

document.getElementById("kutt-avbryt").addEventListener("click", () => kuttDialog.close());
document.getElementById("kutt-slett").addEventListener("click", () => {
  const k = sparing.kutt.find((k) => k.id === redigererKuttId);
  if (k && confirm(`Slette «${k.navn}»?`)) {
    sparing.kutt = sparing.kutt.filter((x) => x.id !== redigererKuttId);
    lagreSparing();
    tegnSparing();
    kuttDialog.close();
  }
});
document.getElementById("nytt-kutt").addEventListener("click", () => aapneKutt(null));

// Eksempelknapper
const forslagBoks = document.getElementById("kutt-forslag");
for (const f of FORSLAG) {
  const knapp = lagElement("button", "brikke", `${f.navn} · ${kroner.format(f.pris)}`);
  knapp.type = "button";
  knapp.addEventListener("click", () => aapneKutt(null, f));
  forslagBoks.append(knapp);
}

// Tegn hvis Sparing var fanen som var åpen sist
if (!document.getElementById("fane-sparing").hidden) tegnSparing();
