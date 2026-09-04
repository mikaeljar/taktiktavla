# Hockey Taktiktavla

Fristående HTML-sida för att rita hockeytaktik: placera ut spelare och puck,
rita taktiksymboler, spela in rörelser i steg och spela upp dem.

Språk i projektet är **svenska** — all UI-text, alla notiser och all dokumentation.

## Köra

Dubbelklicka på `index.html`. Ingen webbserver, inget byggsteg, inga beroenden.

För utveckling finns `.claude/launch.json` som startar `python -m http.server 8777`.
Använd den när du behöver testa i Browser-panelen.

⚠️ **Webbläsaren cachar js-filerna hårt.** Efter en ändring krävs `Ctrl+F5`, annars
kör sidan vidare på gammal kod. Under testning: `fetch(url, {cache:'reload'})` på
varje `<script src>` och sedan `location.reload()`.

## Funktioner som finns

Tre tavelformat (helplan / halvplan / zon, zonen stående med två tvärburar), rotation
och spegling, 5+5 pjäser plus målvakt i två grafikstilar, puck som kan kopplas till
klubbladet, sex ritverktyg med sudd och ångra, manuell rotation av pjäser, samt ett
rörelseläge med flera steg: åkbanor framåt/bakåt, passningar, upplock av lös puck,
skott mot mål, uppspelning steg för steg eller i följd, och sparade spel.

**Tangentbord:** `V` flytta · `1`–`5` ritverktyg · `E` sudd · `M` rörelseläge ·
`F`/`B` framåt/bakåt · `←`/`→` vrid markerad spelare (Shift = 5°) · `Mellanslag` spela ·
`R` reset · `Ctrl+Z` / `Ctrl+Y` ångra/gör om · `Ctrl+dra` flytta pjäs i rörelseläget.

## Arkitektur

Tio js-filer, ett globalt namespace `HTB`. **Vanliga `<script>`-taggar, inte ES-moduler**
— `type="module"` blockeras av CORS när sidan öppnas via `file://`, vilket skulle
förstöra dubbelklick-fallet. Ändra inte på det.

| Fil | Ansvar |
|---|---|
| `js/config.js` | `HTB.state`, rinkmått, format, lagfärger, roster, `HTB.util` (geometri, path-hjälp) |
| `js/rink.js` | Ritar isen. `draw()`, `goals()`, `thumbnail()` |
| `js/board.js` | SVG-stomme, vy-transform, koordinater, all pekarrouting, dragmotor, släpkopia |
| `js/players.js` | Pjäser i två grafikstilar, bänk, drag & drop, markering och rotation |
| `js/puck.js` | Puck, koppling till klubbblad |
| `js/draw.js` | Ritverktyg, pilspetsar, ångra/gör om för ritade linjer |
| `js/animate.js` | Rörelseläget: banor, steg, puckhändelser, uppspelning, egen ångra-historik. Störst av alla, ~1000 rader |
| `js/save.js` | Sparade spel i localStorage med reserv i minnet |
| `js/ui.js` | Startmeny, verktygsfält, stegväljare, tangentbord |
| `js/main.js` | Uppstart och initieringsordning |

## Bärande designbeslut

Läs dessa innan du ändrar — flera är svar på buggar som redan uppstått en gång.

### Koordinater och vy
Allt räknas i **meter** enligt IIHF (60 × 30 m). Formaten är beskärningar av samma
rink, inte olika ritningar. Vyn (rotation, spegling) läggs som **en enda transform på
`<g id="view">`**, och pekarpositioner översätts med `view.getScreenCTM().inverse()`.
Därför fungerar rotation och spegling automatiskt för alla verktyg utan egen trigonometri.

En otransformerad wrapper med `clip-path` klipper mot formatets kant. Utan den syns
den bortklippta delen av rinken när behållaren är bredare än formatets proportioner.

Text (F/B på pjäser) hålls skärmupprätt med `board.uprightMatrix(heading)`, som
inverterar vyns rotation/spegling och pjäsens egen riktning.

### Rörelsemodellen — viktigast att förstå
Endast **ett** startläge sparas: `anim.base`. Varje stegs startpositioner räknas fram
live av `stateAtStep(i)` genom att följa banorna framåt från base.

Tidigare hade varje steg en egen ögonblicksbild, tagen en gång och aldrig uppdaterad.
Det gjorde att en ändring i ett tidigt steg inte slog igenom på senare steg — spelaren
blev kvar där det gamla steget slutade. **Återinför inte per-steg-snapshots.**

### Puckhändelser
En händelse i ett steg är en av tre, och de bildar en **kedja** som valideras mot vem
som faktiskt har pucken just då:

| Typ | Form | Krav |
|---|---|---|
| Passning | `{from: spelare, to: spelare}` | `from` har pucken |
| Upplock | `{from: null, to: spelare}` | pucken är lös |
| Skott | `{from: spelare, to: null, x, y, goal}` | `from` har pucken |

Händelser som bryter kedjan döljs men raderas inte — de återkommer om kedjan blir hel.
Passningar går mitt i steget; upplock sker när spelaren är som närmast pucken längs
sin bana.

### Uppspelningens timing
Farten ska vara jämn genom hela spelet. `playAll` ger varje steg tid i proportion till
dess banlängd, bromsar bara in i början och ut på slutet, och bär över överskjuten tid
till nästa steg (som ritas i samma bildruta). Easing-kurvorna är valda så att farten i
skarven exakt matchar linjär uppspelning. Riktningen vägs in över första 12 % av ett steg.

Det här löste konkret "oflyt" mellan steg: fullt stopp vid varje stegbyte, 7,5° riktningsryck
och olika åkfart beroende på banlängd.

### Ångra
Två separata historiker. `HTB.ui.undo/redo` routar efter läge: **rörelseläget på →
`anim.undo()`**, av → `draw.undo()`. `anim` använder hela ögonblicksbilder av
`base` + `steps`; kopiera **alla** fält på puckhändelser (`x`, `y`, `goal`), annars
tappar ett skott sin målpunkt.

## Konventioner

- **Kodkommentarer skrivs utan svenska tecken** (å/ä/ö) för att undvika
  teckenkodningsproblem. **Användarsynlig text skrivs med korrekta tecken.**
- Nya pjäser/lager läggs i `board.layers` (`rink`, `drawings`, `trails`, `paths`, `pieces`).
- Allt drag går via `board.startDrag({move, end, benchDrop})` — lyssnare ligger på
  `window` så draget överlever att pekaren lämnar SVG:n.

## Testa ändringar

Browser-panelen kör `requestAnimationFrame` i ~1 bild/sekund, så **animeringar går
inte att tidmäta där**. Ta istället kontroll över klockan:

```js
performance.now = () => fakeNow;
window.requestAnimationFrame = cb => { pending = cb; return 1; };
// stega sedan fram fakeNow och anropa pending() manuellt
```

Klockan måste gå **monotont framåt** mellan uppspelningar, annars klampas `t` till 0
och inget händer. Anropa `anim.stop()` innan en ny mätning — ett hängande `playing`
gör att nästa klick på Spela bara stoppar istället för att starta.

Konsolbufferten i panelen **följer med över omladdningar**. Mät differentiellt: läs
antalet fel före och efter en ändring.

Simulera användarens drag med riktiga `PointerEvent` mot `.piece`-noderna och räkna om
rinkkoordinater till klientkoordinater via `view.getScreenCTM()`.

## Historik

Se [HISTORIK.md](HISTORIK.md) för vad som byggts, i vilken ordning, och vilka buggar
som hittats och rättats.
