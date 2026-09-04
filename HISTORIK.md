# Historik

Vad som byggts, i vilken ordning, och vilka buggar som hittats på vägen.
Nyast först inom varje avsnitt är *inte* sorteringen — listan är kronologisk.

---

## 1. Grunden

Byggdes från tom katalog. Krav: fristående HTML-sida, ingen sparfunktion, ska gå att
dubbelklicka.

**Valda alternativ vid start:**

| Fråga | Val |
|---|---|
| Spelargrafik | Både stiliserad bordshockeygubbe och enkel bricka, växlas i verktygsfältet |
| Ritverktyg | Fullt set: åkning, åkning m. puck, passning, skott, frihand, sudd |
| Filstruktur | Uppdelat i flera filer |
| Format | Helplan / halvplan / zon, plus fri rotation och spegling |
| Uppspelning | Samtidig uppspelning med spår, plus stegvis |

**Levererat:** startmeny med tre format, vy-rotation och spegling, 5+5 pjäser
(2 back, 3 forward per lag) plus valfri målvakt, puck som kan kopplas till klubbladet,
sex ritverktyg med ångra/sudd, rörelseläge med flera steg och uppspelning med spår.

**Fixat under bygget:**
- SVG klipptes inte mot formatets kant → bortklippt is syntes bredvid halvplan och zon.
- Verktygsfältet trängde undan tavlan på smala skärmar.

---

## 2. Stegen tappade kontakten med varandra

**Problem:** i steg 3 stod spelaren där steg 2 *började*, inte där det slutade.

**Orsak:** varje steg sparade en egen ögonblicksbild av startläget, tagen en gång och
sedan aldrig uppdaterad. Att skapa steg innan det föregående ritats, eller att ändra en
bana i efterhand, lämnade alla senare steg på gamla värden.

**Lösning:** ett enda startläge (`anim.base`) och stegens positioner räknas fram live
genom att följa kedjan framåt. Följd: Spela gäller nu det steg man står på.

---

## 3. Pjäser gick inte att ta bort i rörelseläget

Att dra till bänken tog bara bort pjäsen när rörelseläget var **av**. Med det på blev
draget en inspelad bana mot bänken istället. Nu tas pjäsen bort i båda lägena, banorna
städas med, och bänken lyser rött som släppyta.

---

## 4. Otydligt att man fortfarande drog en pjäs

Pjäsen fastnade vid sargen och man tappade känslan av att hålla i den. Lade till en
**släpkopia som följer pekaren** när pjäsen inte längre kan följa med, plus nedtonad
pjäs på isen och rött ✕ över bänken. Tröskel på ca 1,5 m så kopian inte blinkar fram
när man bara lägger en spelare tätt mot sargen.

---

## 5. Manuell rotation och bakåtåkning

- **Klicka en spelare** (utanför rörelseläget) markerar hen och visar ett vridhandtag.
  Piltangenterna vrider 15°, med Shift 5°.
- **Åkning: Framåt / Bakåt** i rörelseläget. Bakåtbanor ritas med tvärstreck och
  spelaren vänds 180° mot färdriktningen vid uppspelning. Klick på en spelare som redan
  har en bana vänder riktningen istället för att radera banan.

Rättade samtidigt att JavaScript-texterna saknade svenska tecken ("Rorelselage: Pa").

---

## 6. Passningar

Dra pucken till en medspelare i rörelseläget. Flera passningar per steg delar upp
steget jämnt. Pucken siktar mot mottagarens klubba **där hen befinner sig just då**,
så passningen leder en spelare i rörelse.

---

## 7. Upplock av lös puck

**Problem:** en lös puck i steg 1 kunde inte plockas upp av en spelare i steg 2 — pucken
återgick alltid till utgångsläget.

**Orsak:** pucken kunde bara byta ägare via passning; något "upplock" fanns inte i modellen.

**Lösning:** puckhändelser generaliserades till passning / upplock / (senare) skott, som
en kedja validerad mot vem som har pucken. Upplock sker när spelaren är som närmast
pucken längs sin bana, och markeras med en streckad ring.

Fixat: ringen ritades inte alls när spelaren stannade precis på pucken — det vanligaste
fallet.

---

## 8. Flytta spelare utan att rita, och ångra i rörelseläget

- **Ctrl+dra** (Cmd på Mac) flyttar pjäsen i rörelseläget istället för att rita.
  Hela rutten följer med, eftersom en bana alltid börjar där spelaren står.
- **Ctrl+Z** routar efter läge: rörelseläget på → ångrar rörelser, av → ångrar ritningar.
  Historiken täcker banor, riktning, passningar, upplock, borttagningar, flyttar och steg.
- Radering av åkvägar med suddet fanns redan; gjordes ångringsbar.

---

## 9. "Oflyt" mellan steg

**Problem:** ryckig uppspelning över flera steg, särskilt med bågade linjer.

Mättes upp genom att logga position och riktning per bildruta i 60 fps. Tre fel:

| Fel | Mätning |
|---|---|
| Fullt stopp vid varje stegbyte | 0,287 mitt i steg → 0,002 vid slutet → 0,001 vid nästa start |
| Riktningsryck i skarven | 7,5° |
| Olika åkfart beroende på banlängd | alla steg tog lika lång tid |

**Lösning:** steglängd styr varaktigheten, inbromsning bara i sekvensens början och slut,
pausen mellan steg borttagen, överskjuten tid bärs över och ritas i samma bildruta,
riktningen vägs in över första 12 %.

**Efter:** fart 0,057 / 0,057 / 0,058 över tre olika långa steg, riktningsryck 1,7° / 0,8° / 0°.

---

## 10. Rinken justerad

Efter skisser från användaren:
- Inre markeringar i tekningscirklarna borttagna på alla tavlor.
- Målburarna på kortsidorna borttagna (målgården kvar).
- Zontavlan fick **två burar vid långsidorna** för tvärsöverspel.
- Zontavlan öppnas **stående**.

---

## 11. Skott mot mål

Dra pucken till ett mål. Snäpper till målet, ritas med dubbelpil, och pucken **blir
liggande** där efteråt — så en spelare kan plocka upp returen i nästa steg. Släpp på tom
is istället så spelas pucken dit (utkastning), markerat med en ring.

`rink.goals(format)` ger målens lägen; bara mål inom formatets beskärning räknas.

---

## 12. Sparade spel

Namngivna spel i webbläsarens lagring, med reserv i minnet om lagringen är blockerad.
Ett sparat spel innehåller format, vy, pjässtil, alla pjäser, puck, ritade linjer och
alla steg med banor, riktningar och puckhändelser. Går att öppna, spela upp och
fortsätta redigera.

**Fixat samtidigt:** ångra-historiken kopierade bara `from` och `to` på puckhändelser,
så ett skott tappade sina målkoordinater vid Ctrl+Z och gav ogiltiga SVG-linjer.

---

## Kvarstående idéer

- **Export till fil** av sparade spel, så de kan flyttas mellan datorer och delas med
  andra tränare. Idag lever de bara i den här webbläsaren.
- **Reglage för passningens timing** inom ett steg. Idag är den automatisk (mitt i steget);
  vill man styra den får man dela upp i fler steg.
- Riktningsreglage för uppspelningens hastighet (0,5x / 1x / 2x) valdes bort i planen
  till förmån för stegvis uppspelning.
