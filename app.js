// Pengeoversikt: Plan og Faktisk (Sparing ligger i sparing.js).
//  - Plan: penger inn og utgifter, regnet om til per uke. Hver post er enten
//    fast (fast beløp på fast dag/dato) eller varierer (et anslag uten fast dag).
//  - Faktisk: saldoen nå, og hvordan den utvikler seg de neste dagene etter planen.
//    Anslag fordeles jevnt per dag, og grafen viser spennet mellom «bare faste» og «med anslag».
// Alt lagres i nettleseren på telefonen (localStorage), ingenting sendes på nett.

const LAGRINGSNOKKEL = "pengeoversikt-poster";
const SALDONOKKEL = "pengeoversikt-saldo";
const FANENOKKEL = "pengeoversikt-fane";

// Hvor mange ganger per uke hver frekvens skjer i snitt (52 uker i året).
const FREKVENSER = {
  dag:       { perUke: 7 },
  uke:       { perUke: 1 },
  annenhver: { perUke: 1 / 2 },
  maaned:    { perUke: 12 / 52 },
  kvartal:   { perUke: 4 / 52 },
  aar:       { perUke: 1 / 52 },
};

const PER_ORD = {
  dag: "per dag", uke: "per uke", annenhver: "per 14. dag",
  maaned: "per måned", kvartal: "per kvartal", aar: "per år",
};

const UKEDAGER = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

const kroner = new Intl.NumberFormat("nb-NO", {
  style: "currency",
  currency: "NOK",
  maximumFractionDigits: 0,
});
const kompakt = new Intl.NumberFormat("nb-NO", { notation: "compact", maximumFractionDigits: 1 });
const datoKort = new Intl.DateTimeFormat("nb-NO", { weekday: "short", day: "numeric", month: "short" });
const datoUtenUkedag = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short" });

let poster = hentPoster();
let saldo = hentSaldo();
let redigererId = null; // id-en til posten som endres, eller null for ny post
let antallDager = 14;   // hvor langt fremover grafen viser

// ---------- Datoer ----------
// Vi jobber med datoer uten klokkeslett (midnatt lokal tid).

function iDag() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function leggTilDager(d, antall) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + antall);
}

function tilTekst(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function fraTekst(s) {
  const [aar, mnd, dag] = s.split("-").map(Number);
  return new Date(aar, mnd - 1, dag);
}

// Antall hele dager fra a til b (tåler sommertid)
function dagerMellom(a, b) {
  const utc = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc(b) - utc(a)) / 86400000);
}

function dagerIMaaned(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

// Positiv rest, også for negative tall (-1 mod 14 = 13)
function mod(a, b) {
  return ((a % b) + b) % b;
}

// Skjer denne faste posten på dag d? (Anslag har ingen dag; de fordeles i framskriv.)
function skjerPaa(post, d) {
  if (post.mangler || !post.sikker) return false;
  switch (post.frekvens) {
    case "dag":
      return true;
    case "uke":
      return d.getDay() === post.ukedag;
    case "annenhver":
      return mod(dagerMellom(fraTekst(post.start), d), 14) === 0;
    case "maaned":
      // Dato 31 i en måned med 30 dager blir siste dag i måneden
      return d.getDate() === Math.min(post.dag, dagerIMaaned(d));
    case "kvartal":
    case "aar": {
      const start = fraTekst(post.start);
      const steg = post.frekvens === "kvartal" ? 3 : 12;
      const maaneder = (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - start.getMonth();
      return mod(maaneder, steg) === 0 &&
        d.getDate() === Math.min(start.getDate(), dagerIMaaned(d));
    }
  }
  return false;
}

// Tekst som «hver fredag» eller «hver måned den 15.»
function naarTekst(post) {
  if (post.mangler) return "– trykk for å velge dag";
  if (!post.sikker) return `${PER_ORD[post.frekvens]} · varierer`;
  switch (post.frekvens) {
    case "dag":       return "hver dag";
    case "uke":       return `hver ${UKEDAGER[post.ukedag]}`;
    case "annenhver": return `annenhver ${UKEDAGER[fraTekst(post.start).getDay()]}`;
    case "maaned":    return `hver måned den ${post.dag}.`;
    case "kvartal":   return `hvert kvartal, neste ${datoUtenUkedag.format(nesteGang(post))}`;
    case "aar":       return `hvert år, neste ${datoUtenUkedag.format(nesteGang(post))}`;
  }
  return "";
}

// Første dag fra og med i dag da posten skjer (ser maks drøyt ett år frem)
function nesteGang(post) {
  let d = iDag();
  for (let i = 0; i < 400; i++, d = leggTilDager(d, 1)) {
    if (skjerPaa(post, d)) return d;
  }
  return iDag();
}

// ---------- Lagring ----------

// Fyller inn standardverdier for dag/dato. Poster fra første versjon av appen hadde
// ikke dag/dato; faste poster uten dag merkes med «mangler» og holdes utenfor
// Faktisk til dagen er valgt. Poster uten «sikker» regnes som faste.
function normaliser(p) {
  const sikker = p.sikker !== false;
  const harUkedag = Number.isInteger(p.ukedag);
  const harDag = Number.isInteger(p.dag);
  const harStart = typeof p.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.start);
  const harNaar = { dag: true, uke: harUkedag, maaned: harDag }[p.frekvens] ?? harStart;
  return {
    ...p,
    sikker,
    ukedag: harUkedag ? p.ukedag : 1,
    dag: harDag ? p.dag : 1,
    start: harStart ? p.start : tilTekst(iDag()),
    mangler: sikker && (Boolean(p.mangler) || !harNaar),
  };
}

function hentPoster() {
  try {
    const data = JSON.parse(localStorage.getItem(LAGRINGSNOKKEL));
    return Array.isArray(data) ? data.map(normaliser) : [];
  } catch {
    return [];
  }
}

function hentSaldo() {
  try {
    const s = JSON.parse(localStorage.getItem(SALDONOKKEL));
    return s && typeof s.belop === "number" && typeof s.dato === "string" ? s : null;
  } catch {
    return null;
  }
}

function lagre() {
  try {
    localStorage.setItem(LAGRINGSNOKKEL, JSON.stringify(poster));
    if (saldo) localStorage.setItem(SALDONOKKEL, JSON.stringify(saldo));
    else localStorage.removeItem(SALDONOKKEL);
  } catch {
    alert("Klarte ikke å lagre. Er privat nettlesing slått på?");
  }
}

// Godta både komma og punktum, og mellomrom i tall som «1 500». Minus er lov for saldo.
function lesBelop(tekst) {
  return Number(tekst.replace(/\s/g, "").replace(",", ".").replace("−", "-"));
}

// ---------- Faner ----------

function visFane(navn) {
  for (const knapp of document.querySelectorAll("[role=tab]")) {
    const valgt = knapp.dataset.fane === navn;
    knapp.setAttribute("aria-selected", String(valgt));
    document.getElementById(`fane-${knapp.dataset.fane}`).hidden = !valgt;
  }
  try { localStorage.setItem(FANENOKKEL, navn); } catch {}
  // Grafen må tegnes når fanen er synlig, ellers vet vi ikke hvor bred den er
  if (navn === "faktisk") tegnFaktisk();
  // sparing.js lastes etter denne fila, så funksjonen finnes ikke helt i starten
  if (navn === "sparing" && typeof tegnSparing === "function") tegnSparing();
}

for (const knapp of document.querySelectorAll("[role=tab]")) {
  knapp.addEventListener("click", () => visFane(knapp.dataset.fane));
}

// ---------- Plan ----------

function perUke(post) {
  return post.belop * FREKVENSER[post.frekvens].perUke;
}

// Sum per uke for «inn» eller «ut». bareAnslag: bare postene som varierer.
function sum(type, bareAnslag = false) {
  return poster
    .filter((p) => p.type === type && (!bareAnslag || !p.sikker))
    .reduce((total, p) => total + perUke(p), 0);
}

// Netto anslag per dag (positivt = mer inn enn ut), fordelt jevnt over uka
function anslagPerDag() {
  return (sum("inn", true) - sum("ut", true)) / 7;
}

function tegnPlan() {
  const inn = sum("inn");
  const ut = sum("ut");
  const igjen = inn - ut;

  document.getElementById("sum-inn").textContent = kroner.format(inn);
  document.getElementById("sum-ut").textContent = kroner.format(ut);

  const igjenEl = document.getElementById("sum-igjen");
  igjenEl.textContent = kroner.format(igjen);
  igjenEl.classList.toggle("minus", igjen < 0);

  document.getElementById("sum-maaned").textContent =
    `Omtrent ${kroner.format((igjen * 52) / 12)} igjen per måned`;

  // Hvor mye av tallene som bare er anslag
  const anslagInn = sum("inn", true);
  const anslagUt = sum("ut", true);
  const anslagEl = document.getElementById("sum-anslag");
  anslagEl.hidden = anslagInn === 0 && anslagUt === 0;
  const deler = [];
  if (anslagInn) deler.push(`${kroner.format(anslagInn)} av inn`);
  if (anslagUt) deler.push(`${kroner.format(anslagUt)} av ut`);
  anslagEl.textContent = `Anslag (varierer): ${deler.join(" og ")} per uke. Bare faste: ${kroner.format(igjen - anslagInn + anslagUt)} igjen per uke.`;

  tegnListe("inn", "Ingen penger inn lagt til ennå.");
  tegnListe("ut", "Ingen utgifter lagt til ennå.");
}

function tegnListe(type, tomTekst) {
  const liste = document.getElementById(`liste-${type}`);
  liste.replaceChildren();

  const utvalg = poster
    .filter((p) => p.type === type)
    .sort((a, b) => perUke(b) - perUke(a));

  if (utvalg.length === 0) {
    liste.append(lagElement("li", "tom", tomTekst));
    return;
  }

  for (const post of utvalg) {
    const knapp = lagElement("button", "post");
    knapp.type = "button";
    knapp.addEventListener("click", () => aapneSkjema(post));

    const venstre = lagElement("div");
    venstre.append(
      lagElement("div", "post-navn", post.navn),
      lagElement("div", post.mangler ? "post-info mangler" : "post-info",
        `${post.sikker ? "" : "ca. "}${kroner.format(post.belop)} ${naarTekst(post)}`)
    );

    const hoyre = lagElement("div", "post-hoyre");
    hoyre.append(
      lagElement("div", `belop ${type}`, kroner.format(perUke(post))),
      lagElement("div", "post-info", "per uke")
    );

    knapp.append(venstre, hoyre);
    const li = lagElement("li");
    li.append(knapp);
    liste.append(li);
  }
}

// Liten hjelper: lager et element med klasse og tekst (tekst settes trygt med textContent)
function lagElement(tag, klasse, tekst) {
  const el = document.createElement(tag);
  if (klasse) el.className = klasse;
  if (tekst !== undefined) el.textContent = tekst;
  return el;
}

// ---------- Faktisk ----------

// Regner ut saldo for hver dag fra i dag og antallDager frem, ut fra planen.
// Saldoen som er lagt inn gjelder ved slutten av den dagen den ble lagt inn.
function framskriv() {
  const idag = iDag();
  let fra = fraTekst(saldo.dato);
  if (fra > idag) fra = idag;

  const slutt = leggTilDager(idag, antallDager);
  const perDag = anslagPerDag();
  let belop = saldo.belop; // med anslag
  let fast = saldo.belop;  // bare faste poster
  const dager = [];

  if (dagerMellom(fra, idag) === 0) {
    dager.push({ dato: idag, saldo: belop, fast, hendelser: [] });
  }

  for (let d = leggTilDager(fra, 1); d <= slutt; d = leggTilDager(d, 1)) {
    const hendelser = poster.filter((p) => skjerPaa(p, d));
    for (const p of hendelser) {
      const endring = p.type === "inn" ? p.belop : -p.belop;
      belop += endring;
      fast += endring;
    }
    belop += perDag;
    if (d >= idag) dager.push({ dato: d, saldo: belop, fast, hendelser });
  }
  return dager;
}

function tegnFaktisk() {
  const infoEl = document.getElementById("saldo-info");
  const tallEl = document.getElementById("saldo-idag");
  const framover = document.getElementById("framover");

  if (!saldo) {
    tallEl.textContent = "–";
    tallEl.classList.remove("minus");
    infoEl.textContent = "Legg inn saldoen din for å se hva som kommer.";
    framover.hidden = true;
    return;
  }

  const dager = framskriv();
  const idag = dager[0];
  tallEl.textContent = kroner.format(idag.saldo);
  tallEl.classList.toggle("minus", idag.saldo < 0);

  const siden = dagerMellom(fraTekst(saldo.dato), iDag());
  infoEl.textContent = siden <= 0
    ? "Oppdatert i dag"
    : `Beregnet ut fra planen. Sist oppdatert ${datoKort.format(fraTekst(saldo.dato))} (${kroner.format(saldo.belop)}).`;
  if (Math.round(idag.fast) !== Math.round(idag.saldo)) {
    infoEl.textContent += ` Bare faste: ${kroner.format(idag.fast)}.`;
  }

  framover.hidden = false;
  const anslag = poster.filter((p) => !p.sikker);
  const anslagEl = document.getElementById("anslag-info");
  anslagEl.hidden = anslag.length === 0;
  const perDag = anslagPerDag();
  anslagEl.textContent = `I tillegg regnes ca. ${kroner.format(Math.abs(perDag))} ${perDag < 0 ? "ut" : "inn"} per dag som anslag (${anslag.map((p) => p.navn).join(", ")}). «Saldo etter» tar med anslagene.`;
  document.getElementById("graf-forklaring").hidden = anslag.length === 0;
  const mangler = poster.filter((p) => p.mangler);
  const manglerEl = document.getElementById("mangler-info");
  manglerEl.hidden = mangler.length === 0;
  manglerEl.textContent = `Ikke med i beregningen før dagen er valgt under Plan: ${mangler.map((p) => p.navn).join(", ")}.`;
  tegnStatus(dager);
  tegnGraf(dager);
  tegnKommende(dager);
}

function tegnStatus(dager) {
  const statusEl = document.getElementById("status");
  statusEl.replaceChildren();
  // Bruk den laveste av «med anslag» og «bare faste» (verste tilfelle)
  const lav = (d) => Math.min(d.saldo, d.fast);
  const forsteMinus = dager.find((d) => lav(d) < 0);
  const lavest = dager.reduce((a, b) => (lav(b) < lav(a) ? b : a));
  const sikkertMinus = forsteMinus && forsteMinus.fast < 0 && forsteMinus.saldo < 0;

  const ikon = lagElement("span", forsteMinus ? "ikon fare" : "ikon ok", forsteMinus ? "⚠" : "✓");
  ikon.setAttribute("aria-hidden", "true");
  const tekst = !forsteMinus
    ? `Holder seg over 0 kr – lavest ${kroner.format(lav(lavest))} ${datoKort.format(lavest.dato)}`
    : sikkertMinus
      ? `Går under 0 kr ${datoKort.format(forsteMinus.dato)} – lavest ${kroner.format(lav(lavest))}`
      : `Kan gå under 0 kr ${datoKort.format(forsteMinus.dato)} hvis anslagene stemmer – lavest ${kroner.format(lav(lavest))}`;
  statusEl.append(ikon, lagElement("span", "", tekst));
  statusEl.classList.toggle("varsel", Boolean(forsteMinus));
}

function tegnKommende(dager) {
  const liste = document.getElementById("kommende");
  liste.replaceChildren();

  const medHendelser = dager.filter((d) => d.hendelser.length > 0);
  if (medHendelser.length === 0) {
    liste.append(lagElement("li", "tom", `Ingenting kommer inn eller går ut de neste ${antallDager} dagene.`));
    return;
  }

  for (const dag of medHendelser) {
    const li = lagElement("li", "dag");
    const topp = lagElement("div", "dag-topp");
    const erIDag = dagerMellom(iDag(), dag.dato) === 0;
    topp.append(
      lagElement("span", "dag-dato", erIDag ? "I dag" : datoKort.format(dag.dato)),
      lagElement("span", `dag-saldo${dag.saldo < 0 ? " minus" : ""}`,
        `Saldo etter: ${Math.round(dag.fast) !== Math.round(dag.saldo) ? "ca. " : ""}${kroner.format(dag.saldo)}`)
    );
    li.append(topp);

    for (const p of dag.hendelser) {
      const rad = lagElement("div", "dag-rad");
      rad.append(
        lagElement("span", "", p.navn),
        lagElement("span", `belop ${p.type}`, `${p.type === "inn" ? "+" : "−"}${kroner.format(p.belop)}`)
      );
      li.append(rad);
    }
    liste.append(li);
  }
}

// ---------- Graf ----------
// En trappelinje: saldoen er flat gjennom dagen og hopper når penger kommer eller går.

const SVG = "http://www.w3.org/2000/svg";

function svgEl(tag, attr) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attr)) el.setAttribute(k, v);
  return el;
}

// Pene tall på y-aksen: 1, 2 eller 5 ganger en tierpotens
function pentSteg(spenn, antall) {
  const raa = spenn / antall;
  const tierpotens = 10 ** Math.floor(Math.log10(raa));
  const delt = raa / tierpotens;
  return (delt <= 1 ? 1 : delt <= 2 ? 2 : delt <= 5 ? 5 : 10) * tierpotens;
}

function tegnGraf(dager) {
  const boks = document.getElementById("graf");
  const tooltip = document.getElementById("tooltip");
  boks.querySelector("svg")?.remove();
  tooltip.hidden = true;

  const bredde = boks.clientWidth;
  if (bredde === 0) return;
  const hoyde = 200;
  const marg = { topp: 16, hoyre: 12, bunn: 26, venstre: 44 };
  const plotB = bredde - marg.venstre - marg.hoyre;
  const plotH = hoyde - marg.topp - marg.bunn;

  // Y-aksen tar alltid med 0, så man ser avstanden ned til tomt
  const harAnslag = dager.some((d) => Math.round(d.fast) !== Math.round(d.saldo));
  const verdier = dager.map((d) => d.saldo);
  const lave = dager.map((d) => Math.min(d.saldo, d.fast));
  let min = Math.min(0, ...lave);
  let max = Math.max(0, ...verdier, ...dager.map((d) => d.fast));
  if (max === min) max = min + 100;
  const steg = pentSteg(max - min, 3);
  min = Math.floor(min / steg) * steg;
  max = Math.ceil(max / steg) * steg;

  const x = (i) => marg.venstre + (i / (dager.length - 1)) * plotB;
  const y = (v) => marg.topp + ((max - v) / (max - min)) * plotH;
  const y0 = y(0);

  const svg = svgEl("svg", {
    viewBox: `0 0 ${bredde} ${hoyde}`,
    width: bredde,
    height: hoyde,
    role: "img",
    "aria-label": `Saldo de neste ${antallDager} dagene. Detaljene står i listen under.`,
    tabindex: "0",
  });

  // Klipp: alt over 0 får hovedfargen, alt under 0 får varselfarge
  const id = "k" + Math.random().toString(36).slice(2, 7);
  const defs = svgEl("defs", {});
  const over = svgEl("clipPath", { id: `${id}-over` });
  over.append(svgEl("rect", { x: 0, y: 0, width: bredde, height: Math.max(0, y0) }));
  const under = svgEl("clipPath", { id: `${id}-under` });
  under.append(svgEl("rect", { x: 0, y: y0, width: bredde, height: Math.max(0, hoyde - y0) }));
  defs.append(over, under);
  svg.append(defs);

  // Rutenett og y-tall
  for (let v = min; v <= max + steg / 2; v += steg) {
    svg.append(svgEl("line", {
      x1: marg.venstre, x2: bredde - marg.hoyre, y1: y(v), y2: y(v),
      class: v === 0 ? "akse null" : "akse",
    }));
    const t = svgEl("text", { x: marg.venstre - 6, y: y(v), class: "akse-tekst", "text-anchor": "end", "dominant-baseline": "middle" });
    t.textContent = kompakt.format(v);
    svg.append(t);
  }

  // X-tall: i dag, og så jevnt fordelt
  const hvert = dager.length > 20 ? 7 : 3;
  dager.forEach((d, i) => {
    if (i % hvert !== 0) return;
    const t = svgEl("text", {
      x: x(i), y: hoyde - 6, class: "akse-tekst",
      "text-anchor": i === 0 ? "start" : "middle",
    });
    t.textContent = i === 0 ? "I dag" : `${d.dato.getDate()}.${d.dato.getMonth() + 1}`;
    svg.append(t);
  });

  // Trappelinjer
  const trapp = (felt) => {
    let d = `M ${x(0)} ${y(dager[0][felt])}`;
    for (let i = 1; i < dager.length; i++) d += ` H ${x(i)} V ${y(dager[i][felt])}`;
    return d;
  };
  const linje = trapp("saldo");

  if (harAnslag) {
    // Spennet mellom «bare faste» og «med anslag», dag for dag
    let spenn = "";
    for (let i = 0; i < dager.length - 1; i++) {
      spenn += `M ${x(i)} ${y(dager[i].fast)} H ${x(i + 1)} V ${y(dager[i].saldo)} H ${x(i)} Z `;
    }
    svg.append(svgEl("path", { d: spenn, class: "spenn" }));
    svg.append(svgEl("path", { d: trapp("fast"), class: "linje fast" }));
  }

  // Hovedlinjen (med anslag): grønn over 0, rød under 0. Uten anslag får den en svak flate ned til 0.
  const flate = `${linje} H ${x(dager.length - 1)} V ${y0} H ${x(0)} Z`;
  for (const [del, klasse] of [["over", "pluss"], ["under", "minus"]]) {
    const g = svgEl("g", { "clip-path": `url(#${id}-${del})`, class: klasse });
    if (!harAnslag) g.append(svgEl("path", { d: flate, class: "flate" }));
    g.append(svgEl("path", { d: linje, class: "linje" }));
    svg.append(g);
  }

  // Merk laveste punkt (bare ett tall i grafen, resten står i lista og i tooltip)
  const lavI = lave.indexOf(Math.min(...lave));
  const lavPunkt = svgEl("circle", {
    cx: x(lavI), cy: y(lave[lavI]), r: 4,
    class: `punkt ${lave[lavI] < 0 ? "minus" : "pluss"}`,
  });
  // Teksten står til venstre for punktet (linjen fortsetter mot høyre),
  // men over punktet hvis det laveste er helt i starten
  const iStarten = lavI === 0;
  const lavTekst = svgEl("text", {
    x: iStarten ? x(lavI) + 4 : x(lavI) - 8,
    y: y(lave[lavI]) + (iStarten ? -10 : 4),
    class: "punkt-tekst", "text-anchor": iStarten ? "start" : "end",
  });
  lavTekst.textContent = `Lavest ${kroner.format(lave[lavI])}`;
  svg.append(lavPunkt, lavTekst);

  // Hover/trykk: loddrett strek som følger fingeren, med tooltip
  const strek = svgEl("line", { y1: marg.topp, y2: hoyde - marg.bunn, class: "strek", visibility: "hidden" });
  const prikk = svgEl("circle", { r: 4, class: "punkt pluss", visibility: "hidden" });
  const flateFang = svgEl("rect", {
    x: marg.venstre, y: 0, width: plotB, height: hoyde, fill: "transparent",
  });
  svg.append(strek, prikk, flateFang);
  boks.prepend(svg);

  let valgt = -1;
  function vis(i) {
    valgt = Math.max(0, Math.min(dager.length - 1, i));
    const d = dager[valgt];
    strek.setAttribute("x1", x(valgt));
    strek.setAttribute("x2", x(valgt));
    strek.setAttribute("visibility", "visible");
    prikk.setAttribute("cx", x(valgt));
    prikk.setAttribute("cy", y(d.saldo));
    prikk.setAttribute("class", `punkt ${d.saldo < 0 ? "minus" : "pluss"}`);
    prikk.setAttribute("visibility", "visible");

    tooltip.replaceChildren(
      lagElement("strong", "", `${harAnslag ? "ca. " : ""}${kroner.format(d.saldo)}`),
      lagElement("span", "tooltip-dato", valgt === 0 ? "I dag" : datoKort.format(d.dato))
    );
    if (harAnslag) {
      tooltip.append(lagElement("span", "tooltip-rad", `Bare faste: ${kroner.format(d.fast)}`));
    }
    for (const p of d.hendelser) {
      tooltip.append(lagElement("span", "tooltip-rad", `${p.type === "inn" ? "+" : "−"}${kroner.format(p.belop)} ${p.navn}`));
    }
    tooltip.hidden = false;
    const tb = tooltip.offsetWidth;
    tooltip.style.left = `${Math.min(Math.max(x(valgt) - tb / 2, 0), bredde - tb)}px`;
  }
  function skjul() {
    strek.setAttribute("visibility", "hidden");
    prikk.setAttribute("visibility", "hidden");
    tooltip.hidden = true;
  }
  function fraPeker(e) {
    const r = svg.getBoundingClientRect();
    vis(Math.round(((e.clientX - r.left - marg.venstre) / plotB) * (dager.length - 1)));
  }

  flateFang.addEventListener("pointermove", fraPeker);
  flateFang.addEventListener("pointerdown", fraPeker);
  // Med mus skjules tooltip når pekeren går ut. Med finger blir den stående
  // til man trykker et annet sted (ellers forsvinner den med en gang man slipper).
  flateFang.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") skjul(); });
  skjulTooltip = (e) => { if (!svg.contains(e.target)) skjul(); };
  svg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") vis(valgt + 1);
    else if (e.key === "ArrowLeft") vis(valgt < 0 ? 0 : valgt - 1);
    else if (e.key === "Escape") skjul();
    else return;
    e.preventDefault();
  });
  svg.addEventListener("blur", skjul);
}

// Trykk utenfor grafen skjuler tooltip (settes på nytt hver gang grafen tegnes)
let skjulTooltip = () => {};
document.addEventListener("pointerdown", (e) => skjulTooltip(e));

for (const knapp of document.querySelectorAll(".periode button")) {
  knapp.addEventListener("click", () => {
    antallDager = Number(knapp.dataset.dager);
    oppdaterPeriodeKnapper();
    tegnFaktisk();
  });
}

function oppdaterPeriodeKnapper() {
  for (const k of document.querySelectorAll(".periode button")) {
    k.setAttribute("aria-pressed", String(Number(k.dataset.dager) === antallDager));
  }
}

// Tegn grafen på nytt når skjermen snus eller vinduet endrer størrelse
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!document.getElementById("fane-faktisk").hidden) tegnFaktisk();
    if (!document.getElementById("fane-sparing").hidden) tegnSparing();
  }, 150);
});

// ---------- Saldo-skjema ----------

const saldoDialog = document.getElementById("saldo-dialog");
const saldoSkjema = document.getElementById("saldo-skjema");

document.getElementById("oppdater-saldo").addEventListener("click", () => {
  saldoSkjema.reset();
  if (saldo) saldoSkjema.saldo.value = String(framskriv()[0].saldo).replace(".", ",");
  saldoDialog.showModal();
  saldoSkjema.saldo.select();
});

saldoSkjema.addEventListener("submit", (e) => {
  e.preventDefault();
  const belop = lesBelop(saldoSkjema.saldo.value);
  if (!Number.isFinite(belop)) {
    alert("Skriv et gyldig beløp, for eksempel 1250 eller -300.");
    return;
  }
  saldo = { belop, dato: tilTekst(iDag()) };
  lagre();
  tegnFaktisk();
  saldoDialog.close();
});

document.getElementById("saldo-avbryt").addEventListener("click", () => saldoDialog.close());

// ---------- Post-skjema ----------

const dialog = document.getElementById("skjema-dialog");
const skjema = document.getElementById("skjema");

// Vis bare feltet som hører til valgt frekvens (ukedag, dato eller startdato).
// Poster som varierer har ingen fast dag, så da skjules alle tre.
function visRiktigeFelter() {
  const f = skjema.frekvens.value;
  const sikker = skjema.sikker.value === "ja";
  for (const felt of skjema.querySelectorAll("[data-for]")) {
    felt.hidden = !sikker || !felt.dataset.for.split(" ").includes(f);
  }
  document.getElementById("anslag-hjelp").hidden = sikker;
  document.getElementById("belop-etikett").textContent = sikker ? "Beløp (kr)" : "Omtrent hvor mye (kr)";
}
skjema.frekvens.addEventListener("change", visRiktigeFelter);
for (const valg of skjema.querySelectorAll("[name=sikker]")) {
  valg.addEventListener("change", visRiktigeFelter);
}

function aapneSkjema(post, type = "inn") {
  redigererId = post ? post.id : null;
  skjema.reset();

  document.getElementById("skjema-tittel").textContent = post ? "Endre" : "Ny post";
  document.getElementById("slett").hidden = !post;

  skjema.type.value = post ? post.type : type;
  skjema.sikker.value = post && !post.sikker ? "nei" : "ja";
  skjema.start.value = tilTekst(iDag());
  if (post) {
    skjema.navn.value = post.navn;
    skjema.belop.value = String(post.belop).replace(".", ",");
    skjema.frekvens.value = post.frekvens;
    skjema.ukedag.value = String(post.ukedag);
    skjema.dag.value = String(post.dag);
    // For annenhver/kvartal/år: vis neste gang, ikke en gammel startdato
    skjema.start.value = tilTekst(nesteGang(post));
  }

  visRiktigeFelter();
  dialog.showModal();
}

skjema.addEventListener("submit", (e) => {
  e.preventDefault();

  const belop = lesBelop(skjema.belop.value);
  if (!Number.isFinite(belop) || belop < 0) {
    alert("Skriv et gyldig beløp, for eksempel 250 eller 99,50.");
    return;
  }

  const frekvens = skjema.frekvens.value;
  const sikker = skjema.sikker.value === "ja";
  const dag = Number(skjema.dag.value);
  if (sikker && frekvens === "maaned" && !(Number.isInteger(dag) && dag >= 1 && dag <= 31)) {
    alert("Skriv hvilken dato i måneden, et tall fra 1 til 31.");
    return;
  }
  if (sikker && ["annenhver", "kvartal", "aar"].includes(frekvens) && !skjema.start.value) {
    alert("Velg når det skjer neste gang.");
    return;
  }

  const data = normaliser({
    mangler: false,
    sikker,
    type: skjema.type.value,
    navn: skjema.navn.value.trim(),
    belop,
    frekvens,
    ukedag: Number(skjema.ukedag.value),
    dag: frekvens === "maaned" && Number.isInteger(dag) && dag >= 1 ? dag : undefined,
    start: skjema.start.value,
  });

  if (redigererId) {
    poster = poster.map((p) => (p.id === redigererId ? { ...p, ...data } : p));
  } else {
    poster.push({ id: lagId(), ...data });
  }

  lagre();
  tegnAlt();
  dialog.close();
});

document.getElementById("avbryt").addEventListener("click", () => dialog.close());

document.getElementById("slett").addEventListener("click", () => {
  const post = poster.find((p) => p.id === redigererId);
  if (post && confirm(`Slette «${post.navn}»?`)) {
    poster = poster.filter((p) => p.id !== redigererId);
    lagre();
    tegnAlt();
    dialog.close();
  }
});

for (const knapp of document.querySelectorAll(".legg-til")) {
  knapp.addEventListener("click", () => aapneSkjema(null, knapp.dataset.type));
}

function lagId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- Sikkerhetskopi ----------

document.getElementById("eksporter").addEventListener("click", () => {
  const innhold = { versjon: 3, poster, saldo, sparing };
  const fil = new Blob([JSON.stringify(innhold, null, 2)], { type: "application/json" });
  const lenke = document.createElement("a");
  lenke.href = URL.createObjectURL(fil);
  lenke.download = `pengeoversikt-${tilTekst(iDag())}.json`;
  lenke.click();
  URL.revokeObjectURL(lenke.href);
});

document.getElementById("importer").addEventListener("change", async (e) => {
  const fil = e.target.files[0];
  e.target.value = "";
  if (!fil) return;

  try {
    const data = JSON.parse(await fil.text());
    // Første versjon lagret bare en liste med poster; nyere lagrer også saldo
    const nyePoster = Array.isArray(data) ? data : data.poster;
    const gyldige = Array.isArray(nyePoster) && nyePoster.every(
      (p) => p && typeof p.navn === "string" && typeof p.belop === "number" &&
             (p.type === "inn" || p.type === "ut") && p.frekvens in FREKVENSER
    );
    if (!gyldige) throw new Error();

    if (confirm(`Erstatte alt med ${nyePoster.length} poster fra kopien?`)) {
      poster = nyePoster.map((p) => normaliser({ ...p, id: p.id || lagId() }));
      if (!Array.isArray(data) && data.saldo && typeof data.saldo.belop === "number") saldo = data.saldo;
      if (!Array.isArray(data) && data.sparing && data.sparing.maal && Array.isArray(data.sparing.kutt)) {
        sparing = data.sparing;
        lagreSparing();
      }
      lagre();
      tegnAlt();
    }
  } catch {
    alert("Fila ser ikke ut som en kopi fra denne appen.");
  }
});

// ---------- Oppstart ----------

function tegnAlt() {
  tegnPlan();
  if (!document.getElementById("fane-faktisk").hidden) tegnFaktisk();
  if (!document.getElementById("fane-sparing").hidden) tegnSparing();
}

oppdaterPeriodeKnapper();
tegnPlan();
let startFane = "plan";
try {
  const lagret = localStorage.getItem(FANENOKKEL);
  if (["plan", "faktisk", "sparing"].includes(lagret)) startFane = lagret;
} catch {}
visFane(startFane);

// Lar appen virke uten nett etter første besøk
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
