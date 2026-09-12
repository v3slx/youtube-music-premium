<div align="center">

<img src="src/assets/icons/ytmd.png" width="96" alt="YouTube Music Premium">

# YouTube Music Premium

**Ein eigener Desktop-Client für YouTube Music.**
Aufgebaut auf [YTMDesktop](https://github.com/ytmdesktop/ytmdesktop), erweitert um Themes, mitlaufende Songtexte, freie Wahl des Audio-Ausgabegeräts und eine anpassbare Discord-Anzeige.

![Version](https://img.shields.io/badge/Version-2.0.15-e8314c?style=for-the-badge)
![Plattform](https://img.shields.io/badge/Windows-x64-0078D6?style=for-the-badge&logo=windows&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-44-47848F?style=for-the-badge&logo=electron&logoColor=white)
![Lizenz](https://img.shields.io/badge/Lizenz-GPL--3.0-brightgreen?style=for-the-badge)

![YouTube Music Premium](.github/images/readme_main.png)

</div>

## Was ist das?

YouTube Music im eigenen Fenster, mit Tastenkürzeln, Tray-Symbol und Discord-Anzeige — und mit ein paar Dingen, die es weder im Browser noch im offiziellen YTMDesktop gibt.

Diese Version installiert sich **neben** dem offiziellen YTMDesktop und holt sich **keine Updates** von dort, damit die eigenen Anpassungen nicht überschrieben werden.

## Eigene Funktionen

### 🎨 Eingebaute Themes

Drei fertige Farbwelten: **Midnight**, **Ocean** und **Forest**. Sie setzen an den Farbvariablen von YouTube Music an, nicht an einzelnen Kästen, deshalb bleibt die Oberfläche durchgehend eingefärbt — inklusive der Stelle, an der YouTube Music seinen Kopfbereich-Verlauf sonst gekachelt als Streifen wiederholt.

Zu finden unter **Einstellungen → Appearance → Theme**. Custom CSS funktioniert weiterhin zusätzlich.

### 🎤 Mitlaufende Songtexte

Der Songtext-Tab zeigt den Text **synchron zum Song**:

- die aktuelle Zeile ist hervorgehoben, der Text scrollt automatisch mit
- ein Klick auf eine Zeile springt an die passende Stelle im Song
- scrollt man selbst weg, hält das automatische Scrollen an und ein Knopf bringt zurück zur laufenden Zeile
- **Schriftgröße** und **Zeitversatz** sind einstellbar, beide wirken sofort

Die Daten kommen von YouTube selbst, also derselben Quelle wie in der Handy-App. Für Songs ohne synchrone Texte und für Musikvideos bleibt der normale Text von YouTube Music stehen.

### 🔊 Audio-Ausgabegerät wählen

Die App kann ihren Ton gezielt auf ein bestimmtes Gerät legen, unabhängig vom Standardgerät von Windows. Praktisch für Kopfhörer, virtuelle Kabel oder ein zweites Interface.

Zu finden unter **Einstellungen → Playback → Audio output device**.

### 💬 Discord nach eigenem Geschmack

- **eigene Discord-Anwendung** eintragbar, damit im Status ein selbst gewählter Name steht, zum Beispiel „Hört YouTube Music Premium zu“
- Button **„Auf YouTube Music anhören“**, der auch bei Freunden ohne YTMDesktop funktioniert
- kein doppelter Titel mehr bei Singles, bei denen das Album genauso heißt wie der Song

### 🧭 Kleinigkeiten

- Das ausgeklappte Suchfeld liegt nicht mehr über den Zurück- und Vor-Pfeilen
- Eigener Name, eigenes Symbol und eigener Installationsordner

Alles aus YTMDesktop bleibt erhalten: Companion-Server, Last.fm, Custom CSS, globale Tastenkürzel, Tray-Steuerung und Fortschritt in der Taskleiste.

## Einstellungen auf einen Blick

| Einstellung | Ort | Standard |
| --- | --- | --- |
| Theme | Appearance | YouTube Music default |
| Synced lyrics | Playback | an |
| Lyrics font size | Playback | 24 px |
| Lyrics offset | Playback | 0 ms |
| Audio output device | Playback | System default |
| Discord application ID | Integrations | offizielle YTMD-Anwendung |

## Installation

Es gibt keine öffentlichen Releases, die Installer werden selbst gebaut (siehe unten). Danach liegen unter `out/make/` zwei Varianten:

| Datei | Was sie tut |
| --- | --- |
| `nsis/YouTube Music Premium Setup <Version>.exe` | Setup-Assistent mit Ordnerwahl und Desktop-Verknüpfung |
| `squirrel.windows/x64/YouTube Music Premium Quick Setup.exe` | Ein-Klick-Installer ohne Rückfragen |

Beide installieren dieselbe App. Vor einem Update die App komplett beenden, auch im Tray.

## Entwicklung

Gebraucht werden [Git](https://git-scm.com) und [Node.js](https://nodejs.org) (v20 oder neuer).

```sh
git clone https://github.com/Skorbjen/youtube-music-premium.git
cd youtube-music-premium

# Yarn bereitstellen (liegt dem Projekt bei)
corepack enable

yarn install
yarn start
```

Installer bauen:

```sh
# beide Installer (Squirrel + NSIS-Assistent)
yarn make:all

# nur der Squirrel-Schnellinstaller
yarn make

# nur der NSIS-Assistent (setzt ein gebautes Paket voraus)
yarn make:nsis
```

Die Grafiken der Installer liegen in `installer/` und lassen sich mit `python installer/generate-images.py` neu erzeugen (benötigt Pillow).

## Mitwirkende

<table>
  <tr>
    <td align="center" width="160">
      <a href="https://github.com/Skorbjen">
        <img src="https://github.com/Skorbjen.png?size=200" width="110" height="110" alt="Skorbjen"><br>
        <sub><b>Skorbjen</b></sub>
      </a>
    </td>
    <td align="center" width="160">
      <a href="https://github.com/4tjoi">
        <img src="https://github.com/4tjoi.png?size=200" width="110" height="110" alt="4tjoi"><br>
        <sub><b>4tjoi</b></sub>
      </a>
    </td>
  </tr>
</table>

## Lizenz und Dank

Dieses Projekt baut auf [YTMDesktop](https://github.com/ytmdesktop/ytmdesktop) auf und steht wie das Original unter der **GPL-3.0**. Dank an das YTMDesktop-Team und alle, die dort mitgearbeitet haben.

Dieses Projekt steht in keiner Verbindung zu Google oder YouTube.
