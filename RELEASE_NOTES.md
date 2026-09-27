# YouTube Music Premium 2.1.5

Lyrics, redone: word by word, right on time and a lot nicer to watch.

## Fixed in 2.1.5

- After a few songs in a row the lyrics could jump to the end and fullscreen lyrics showed a position far past the end of the song (for example 12:50 of 3:22). They now always follow the song itself
- Leaving full screen (F11) in fullscreen lyrics could leave YouTube Music's page broken, with a tiny cover and a jumpy layout. Full screen now only enlarges the window and no longer touches YouTube Music's own player

## Lyrics

- **Word by word:** every word lights up while it is sung, long notes glow. Songs from the AMLL database are timed word by word by hand; for all other songs the app estimates the timing of the words from the line
- **On time:** the lyrics now follow the song to the millisecond. Before, they only moved with the player's four updates a second and then faded in, so every line came up to half a second late
- **More songs:** when YouTube Music has no synced lyrics, the app looks them up on LRCLIB and in the AMLL TTML database
- **Pick the source:** if the lyrics of a song are off, switch between AMLL, LRCLIB and YouTube right above the lyrics; the app remembers your pick for that song
- **Fullscreen lyrics, redesigned:** the lines move up in a wave, lines further away go soft, three dots count down instrumental breaks, background vocals sit under their line, duets use both sides, and the album art drifts slowly in the background
- **Fullscreen lyrics get player controls:** song position, previous, play/pause, next, volume and a real full screen mode (F11). The controls and the mouse pointer fade out when the mouse rests or leaves the app
- **Large cover:** click the cover in fullscreen lyrics and it fills the left half of the screen, floating gently next to the lyrics; it shrinks a little while the music is paused. Songs without synced lyrics show it in the middle
- **Smooth song changes:** the old lyrics drift away, cover, title and background fade over, and the new lines come in from below
- Keys in fullscreen lyrics: Space plays and pauses, the arrow keys seek and change the volume, M mutes, C shows the large cover, F11 goes full screen, Esc leaves it
- The lyrics tab next to the player gets the same word animation
- Two new settings under Playback: "Animate word by word" and "More lyrics sources" (only the song title, artist and length are sent to lrclib.net and amll.dev)

Your existing settings are kept as they are.

## New in 2.1.0

The biggest update so far: a mini player, an equalizer, fullscreen lyrics, a theme that follows your music, listening statistics and a command palette - plus a faster, steadier app underneath.

### Mini player

- A small window with the album art, the song, a seekable progress bar, play/pause, previous, next and like
- Shows the synced lyrics line that is being sung
- Opens from the new button in the title bar, from the tray or with its own shortcut, and can stay on top of other windows

### Equalizer and volume leveling

- Ten bands from 32 Hz to 16 kHz with presets: Bass boost, Treble boost, Vocal, Rock, Pop, Electronic, Acoustic and Late night - or shape your own
- Volume leveling evens out quiet and loud passages and songs
- Works with the audio output device you picked

### Fullscreen lyrics

- Synced lyrics across the whole window on top of the blurred album art, with the current line highlighted
- Click a line to jump there, press Esc to close
- Opens from the new lyrics button in the player bar, the tray, the command palette or a shortcut

### Dynamic theme

- A new theme that takes its colours from the album art of the song that is playing and fades from song to song - in YouTube Music, the title bar, the mini player and settings

### Listening statistics

- Listening time today, this week and overall, a 14 day chart, your top songs and top artists
- Kept on your PC only, can be turned off or cleared in Settings

### Command palette

- Press `Ctrl+K` anywhere in YouTube Music for playback, navigation, themes, equalizer presets, the mini player, fullscreen lyrics and more
- Lists every keyboard shortcut, including the global ones you set

### Improvements

- Redesigned settings with groups and a search that highlights what it finds
- Song change notifications with the album art, "artist · album" and previous/pause/next buttons; they no longer show while the app is in front
- Pauses when your headphones or the active audio device are disconnected; optionally pauses when the PC is locked
- Richer tray menu with the current song, like, mini player, fullscreen lyrics and copy song link
- Export your settings to a file and import them again
- The window buttons and title bar follow the theme
- Midnight, Ocean and Forest each have their own accent colour in settings, the mini player and this window
- This window appears once after each update

### Performance and stability

- Much less work while music plays: the app only syncs the player state when something actually changed, instead of on every interaction in YouTube Music
- Taskbar buttons and progress are only updated when they change
- A failing network request no longer closes the app, and Last.fm handles being offline, expired sessions and repeated sign-in prompts
- Lyrics no longer keep running against the next song when that song has no lyrics
- Settings added in an update always get their defaults, and invalid values are refused instead of crashing the app
