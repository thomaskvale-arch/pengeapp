# Pengeapp for D

En superenkel app for å holde oversikt over penger inn og utgifter, regnet om til **per uke**.
Laget med Claude, mest for å lære.

## Hva den gjør
Tre faner:

- **Plan** (budsjett): penger inn og utgifter med beløp, hvor ofte og når
  (ukedag, dato i måneden eller neste dato). Alt regnes om til per uke.
- **Faktisk**: legg inn saldoen nå, og se hvordan den utvikler seg de neste
  14 eller 30 dagene etter planen. Varsler hvis saldoen går under 0.
- **Sparing**: et sparemål (f.eks. PlayStation), fast sparing og kutt
  (f.eks. snus eller Monster per dag/uke/måned). Viser hvor lenge det tar
  med og uten kuttene.

Alt lagres bare på telefonen (i nettleseren). Ingen innlogging, ingenting sendes på nett.
Knapper for å lagre og hente sikkerhetskopi ligger under Plan.

## Filer
- `index.html` – selve siden
- `style.css` – utseende
- `app.js` – Plan og Faktisk (lagring, utregning, graf, skjema)
- `sparing.js` – Sparing-fanen
- `manifest.json`, `sw.js`, `icons/` – gjør at den kan legges på Hjem-skjermen og virke uten nett

## Kjøre lokalt
Start forhåndsvisningen «pengeapp» i Claude-appen, eller kjør:

```
python -m http.server 8080
```

og åpne http://localhost:8080.
