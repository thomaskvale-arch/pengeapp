# Pengeapp for D

En superenkel app for å holde oversikt over penger inn og utgifter, regnet om til **per uke**.
Laget med Claude, mest for å lære.

## Hva den gjør
- Liste over penger inn og utgifter, hver med beløp og hvor ofte (uke, annenhver uke, måned, kvartal, år).
- Regner alt om til per uke (og omtrent per måned) og viser hva som blir igjen.
- Lagrer alt bare på telefonen (i nettleseren). Ingen innlogging, ingenting sendes på nett.
- Knapper for å lagre og hente sikkerhetskopi.

## Filer
- `index.html` – selve siden
- `style.css` – utseende
- `app.js` – logikken (lagring, utregning, skjema)
- `manifest.json`, `sw.js`, `icons/` – gjør at den kan legges på Hjem-skjermen og virke uten nett

## Kjøre lokalt
Start forhåndsvisningen «pengeapp» i Claude-appen, eller kjør:

```
python -m http.server 8080
```

og åpne http://localhost:8080.
