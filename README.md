# Hockey Taktiktavla

Fristaende HTML-sida for att rita hockeytaktik: placera ut spelare och puck,
rita taktiksymboler, spela in rorelser i steg och spela upp dem.

Ingen webbserver, inget byggsteg, inga beroenden.

## Kora lokalt

Dubbelklicka pa `index.html`.

For utveckling: `python -m http.server 8777` och oppna
<http://localhost:8777>.

## Live

Publiceras via GitHub Pages fran `main`-grenen.

## Funktioner

Tre tavelformat (helplan / halvplan / zon), rotation och spegling, 5+5 pjaser
plus malvakt i tva grafikstilar, puck som kan kopplas till klubbladet, sex
ritverktyg med sudd och angra, manuell rotation av pjaser, samt ett rorelselage
med flera steg: akbanor framat/bakat, passningar, upplock av los puck, skott mot
mal, uppspelning steg for steg eller i foljd, och sparade spel.

### Tangentbord

`V` flytta - `1`-`5` ritverktyg - `E` sudd - `M` rorelselage - `F`/`B`
framat/bakat - `<-`/`->` vrid markerad spelare (Shift = 5 grader) -
`Mellanslag` spela - `R` reset - `Ctrl+Z` / `Ctrl+Y` angra/gor om -
`Ctrl+dra` flytta pjas i rorelselaget.

## Arkitektur

Se [CLAUDE.md](CLAUDE.md) for arkitektur och barande designbeslut, och
[HISTORIK.md](HISTORIK.md) for utvecklingshistorik.
