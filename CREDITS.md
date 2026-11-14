# Credits

## Audio

Every sound on the site is synthesised by `scripts/make-audio.mjs` from seeded noise and tones. No recordings
and nothing downloaded: the site's owner owns them all. Run `node scripts/make-audio.mjs` to make them again
(it needs ffmpeg with the LAME MP3 encoder). PLAN.md's budget for all audio is 400 KB.

| File | What it is | Size |
| --- | --- | --- |
| `public/audio/ambient-day.mp3` | 12 s loop: wind in gusts and water lapping at the shore | 60.6 KB |
| `public/audio/ambient-night.mp3` | 12 s loop: crickets, quieter water, a little wind | 60.6 KB |
| `public/audio/fire.mp3` | 6 s loop: a campfire's low roar, crackles and pops | 31.3 KB |
| `public/audio/step-sand.mp3` | Four soft footsteps on sand, 0.3 s apart | 7.6 KB |
| `public/audio/step-wood.mp3` | Four footsteps on wooden boards, 0.3 s apart | 7.6 KB |
| `public/audio/chime.mp3` | One soft bell note (E5), played as a panel opens | 13.5 KB |
| **Total** | | **181.1 KB** |

To use real recordings instead, keep the same file names and lengths (loops: 12 s, 12 s and 6 s plus a 0.3 s
tail that repeats their start; footsteps: four per file, 0.3 s apart), use only CC0 or owned recordings, and list
each one here with its source and licence.
