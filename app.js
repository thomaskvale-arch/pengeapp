// Pengeoversikt: holder styr på penger inn og utgifter, regnet om til per uke.
// Alt lagres i nettleseren på telefonen (localStorage), ingenting sendes på nett.

const LAGRINGSNOKKEL = "pengeoversikt-poster";

// Hvor mange ganger per uke hver frekvens skjer i snitt (52 uker i året).
const FREKVENSER = {
  uke:       { tekst: "hver uke",       perUke: 1 },
  annenhver: { tekst: "annenhver uke",  perUke: 1 / 2 },
  maaned:    { tekst: "hver måned",     perUke: 12 / 52 },
  kvartal:   { tekst: "hvert kvartal",  perUke: 4 / 52 },
  aar:       { tekst: "hvert år",       perUke: 1 / 52 },
};

const kroner = new Intl.NumberFormat("nb-NO", {
  style: "currency",
  currency: "NOK",
  maximumFractionDigits: 0,
});

let poster = hentPoster();
let redigererId = null; // id-en til posten som endres, eller null for ny post

// ---------- Lagring ----------

function hentPoster() {
  try {
    const data = JSON.parse(localStorage.getItem(LAGRINGSNOKKEL));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function lagrePoster() {
  try {
    localStorage.setItem(LAGRINGSNOKKEL, JSON.stringify(poster));
  } catch {
    alert("Klarte ikke å lagre. Er privat nettlesing slått på?");
  }
}

// ---------- Utregning ----------

function perUke(post) {
  return post.belop * FREKVENSER[post.frekvens].perUke;
}

function sum(type) {
  return poster
    .filter((p) => p.type === type)
    .reduce((total, p) => total + perUke(p), 0);
}

// ---------- Visning ----------

function tegn() {
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
    const li = document.createElement("li");
    li.className = "tom";
    li.textContent = tomTekst;
    liste.append(li);
    return;
  }

  for (const post of utvalg) {
    const li = document.createElement("li");
    const knapp = document.createElement("button");
    knapp.type = "button";
    knapp.className = "post";
    knapp.addEventListener("click", () => aapneSkjema(post));

    const venstre = document.createElement("div");
    const navn = document.createElement("div");
    navn.className = "post-navn";
    navn.textContent = post.navn;
    const info = document.createElement("div");
    info.className = "post-info";
    info.textContent = `${kroner.format(post.belop)} ${FREKVENSER[post.frekvens].tekst}`;
    venstre.append(navn, info);

    const hoyre = document.createElement("div");
    hoyre.className = "post-hoyre";
    const ukebelop = document.createElement("div");
    ukebelop.className = `belop ${type}`;
    ukebelop.textContent = kroner.format(perUke(post));
    const ukeTekst = document.createElement("div");
    ukeTekst.className = "post-info";
    ukeTekst.textContent = "per uke";
    hoyre.append(ukebelop, ukeTekst);

    knapp.append(venstre, hoyre);
    li.append(knapp);
    liste.append(li);
  }
}

// ---------- Skjema ----------

const dialog = document.getElementById("skjema-dialog");
const skjema = document.getElementById("skjema");

function aapneSkjema(post, type = "inn") {
  redigererId = post ? post.id : null;
  skjema.reset();

  document.getElementById("skjema-tittel").textContent = post ? "Endre" : "Ny post";
  document.getElementById("slett").hidden = !post;

  skjema.type.value = post ? post.type : type;
  if (post) {
    skjema.navn.value = post.navn;
    skjema.belop.value = String(post.belop).replace(".", ",");
    skjema.frekvens.value = post.frekvens;
  }

  dialog.showModal();
}

skjema.addEventListener("submit", (e) => {
  e.preventDefault();

  // Godta både komma og punktum, og mellomrom i tall som «1 500»
  const belop = Number(skjema.belop.value.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(belop) || belop < 0) {
    alert("Skriv et gyldig beløp, for eksempel 250 eller 99,50.");
    return;
  }

  const data = {
    type: skjema.type.value,
    navn: skjema.navn.value.trim(),
    belop,
    frekvens: skjema.frekvens.value,
  };

  if (redigererId) {
    poster = poster.map((p) => (p.id === redigererId ? { ...p, ...data } : p));
  } else {
    poster.push({ id: lagId(), ...data });
  }

  lagrePoster();
  tegn();
  dialog.close();
});

document.getElementById("avbryt").addEventListener("click", () => dialog.close());

document.getElementById("slett").addEventListener("click", () => {
  const post = poster.find((p) => p.id === redigererId);
  if (post && confirm(`Slette «${post.navn}»?`)) {
    poster = poster.filter((p) => p.id !== redigererId);
    lagrePoster();
    tegn();
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
  const fil = new Blob([JSON.stringify(poster, null, 2)], { type: "application/json" });
  const lenke = document.createElement("a");
  lenke.href = URL.createObjectURL(fil);
  lenke.download = `pengeoversikt-${new Date().toISOString().slice(0, 10)}.json`;
  lenke.click();
  URL.revokeObjectURL(lenke.href);
});

document.getElementById("importer").addEventListener("change", async (e) => {
  const fil = e.target.files[0];
  e.target.value = "";
  if (!fil) return;

  try {
    const data = JSON.parse(await fil.text());
    const gyldige = Array.isArray(data) && data.every(
      (p) => p && typeof p.navn === "string" && typeof p.belop === "number" &&
             (p.type === "inn" || p.type === "ut") && p.frekvens in FREKVENSER
    );
    if (!gyldige) throw new Error();

    if (confirm(`Erstatte alt med ${data.length} poster fra kopien?`)) {
      poster = data.map((p) => ({ ...p, id: p.id || lagId() }));
      lagrePoster();
      tegn();
    }
  } catch {
    alert("Fila ser ikke ut som en kopi fra denne appen.");
  }
});

// ---------- Oppstart ----------

tegn();

// Lar appen virke uten nett etter første besøk
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
